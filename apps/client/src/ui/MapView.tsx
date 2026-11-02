// MapSystem (Client): interaktive Europakarte mit MapLibre GL.
// Grundkarte: OpenFreeMap-Vektorkacheln (OpenStreetMap, ODbL) – per VITE_MAP_STYLE austauschbar
// (z. B. selbst gehostete PMTiles). Fällt die Grundkarte aus (offline), bleibt das spieleigene
// Straßennetz aus echten OSM-Routen sichtbar.
// Fahrzeuge: GeoJSON-Quelle, pro Animationsframe zwischen Simulationsschnappschüssen interpoliert.

import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CITIES, CITY_BY_ID, vehicleMarker, isTripLate, type GameState } from '@spedsim/core';
import { getUi, setUi, useUi, world } from '../game/store.ts';

export type MapFilter = 'all' | 'active' | 'idle' | 'late' | 'loaded' | 'empty';

const STYLE_URL: Record<'dark' | 'light', string> = {
  dark: import.meta.env.VITE_MAP_STYLE_DARK ?? 'https://tiles.openfreemap.org/styles/dark',
  light: import.meta.env.VITE_MAP_STYLE_LIGHT ?? 'https://tiles.openfreemap.org/styles/positron',
};

const FALLBACK_STYLE = (theme: 'dark' | 'light'): StyleSpecification => ({
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': theme === 'dark' ? '#0b1120' : '#e8edf3' } }],
});

const ACTIVITY_COLOR: [string, string][] = [
  ['driving', '#38bdf8'],
  ['ferry', '#38bdf8'],
  ['break', '#fbbf24'],
  ['rest_daily', '#a78bfa'],
  ['rest_weekly', '#a78bfa'],
  ['fueling', '#f59e0b'],
  ['loading', '#34d399'],
  ['unloading', '#34d399'],
  ['waiting', '#94a3b8'],
  ['breakdown', '#f87171'],
  ['workshop', '#f87171'],
  ['idle', '#64748b'],
];

function roadsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: world.net.edges.map((e) => ({
      type: 'Feature',
      properties: { ferry: e.ferry, fast: e.truckKmh > 70 },
      geometry: { type: 'LineString', coordinates: e.coords },
    })),
  };
}

function citiesGeoJSON(state: GameState | null): GeoJSON.FeatureCollection {
  const own = new Set(state?.company.locations.map((l) => l.cityId) ?? []);
  return {
    type: 'FeatureCollection',
    features: CITIES.map((c) => ({
      type: 'Feature',
      properties: { id: c.id, name: c.name, pop: c.pop, own: own.has(c.id) },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  };
}

function vehicleFilter(state: GameState, vehicleId: string, filter: MapFilter, driverId: string): boolean {
  const v = state.vehicles[vehicleId];
  const trip = v.tripId ? state.trips[v.tripId] : undefined;
  if (driverId && trip?.driverId !== driverId) return false;
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return !!trip;
    case 'idle':
      return !trip && v.status === 'idle';
    case 'late':
      return !!trip && isTripLate(state, trip);
    case 'loaded':
      return !!trip && trip.legs[trip.legIndex].loaded;
    case 'empty':
      return !!trip && !trip.legs[trip.legIndex].loaded;
  }
}

function routesGeoJSON(state: GameState, filter: MapFilter, driverId: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const trip of Object.values(state.trips)) {
    if (trip.phase === 'done' || !vehicleFilter(state, trip.vehicleId, filter, driverId)) continue;
    const late = isTripLate(state, trip);
    for (let i = trip.legIndex; i < trip.legs.length; i++) {
      const leg = trip.legs[i];
      if (leg.nodes.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { kind: late ? 'late' : leg.loaded ? 'loaded' : 'empty', vehicleId: trip.vehicleId },
        geometry: { type: 'LineString', coordinates: world.net.geometry(leg.nodes) },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function previewGeoJSON(state: GameState, orderId: string | null): GeoJSON.FeatureCollection {
  const o = orderId ? state.orders[orderId] : undefined;
  if (!o) return { type: 'FeatureCollection', features: [] };
  const r = world.net.route(o.fromCityId, o.toCityId);
  if (!r) return { type: 'FeatureCollection', features: [] };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: world.net.geometry(r.nodes) } }] };
}

function arrowImage(): ImageData {
  const s = 48;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(s / 2, 4);
  g.lineTo(s - 10, s - 8);
  g.lineTo(s / 2, s - 16);
  g.lineTo(10, s - 8);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, s, s);
}

export function MapView({ mini = false, filter = 'all', driverId = '' }: { mini?: boolean; filter?: MapFilter; driverId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const theme = useUi((u) => u.theme);
  const state = useUi((u) => u.state);
  const focusOrderId = useUi((u) => u.focusOrderId);
  const filterRef = useRef({ filter, driverId });
  filterRef.current = { filter, driverId };

  // Karte erstellen
  useEffect(() => {
    const s = getUi().state;
    const hq = s ? CITY_BY_ID[s.company.hqCityId] : CITY_BY_ID.leipzig;
    const map = new maplibregl.Map({
      container: ref.current!,
      style: STYLE_URL[theme],
      center: [hq.lon, hq.lat],
      zoom: mini ? 4.2 : 5.2,
      minZoom: 3,
      maxZoom: 14,
      attributionControl: { compact: true, customAttribution: world.net.attribution },
      interactive: true,
    });
    mapRef.current = map;
    if (!mini) map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    let fellBack = false;
    map.on('error', (e) => {
      // Grundkarte nicht erreichbar → spieleigene Offline-Darstellung
      if (!fellBack && !map.isStyleLoaded() && /style|Failed to fetch|NetworkError/i.test(String(e.error?.message ?? ''))) {
        fellBack = true;
        map.setStyle(FALLBACK_STYLE(theme));
      }
    });

    map.on('style.load', () => {
      loadedRef.current = true;
      installLayers(map, theme);
      refreshStatic(map);
    });

    map.on('click', 'vehicles', (e) => {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) setUi({ selectedVehicleId: id, page: mini ? 'map' : getUi().page });
    });
    map.on('click', 'cities-own', (e) => {
      const name = e.features?.[0]?.properties?.name;
      if (name) new maplibregl.Popup({ closeButton: false }).setLngLat(e.lngLat).setHTML(`<b>${name}</b><br/>Eigener Standort`).addTo(map);
    });
    map.on('dragstart', () => getUi().followVehicle && setUi({ followVehicle: false }));
    for (const l of ['vehicles', 'cities-own']) {
      map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
    }

    // Animationsschleife: Fahrzeugpositionen interpolieren
    let raf = 0;
    let lastFrame = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - lastFrame < 33) return; // ~30 fps
      lastFrame = now;
      const u = getUi();
      const st = u.state;
      if (!st || !loadedRef.current) return;
      const src = map.getSource('vehicles') as GeoJSONSource | undefined;
      if (!src) return;
      const gameMin = st.paused ? 0 : Math.min(2, (Date.now() - u.snapshotAt) / 1000) * st.speed;
      const features: GeoJSON.Feature[] = [];
      let followPos: [number, number] | null = null;
      for (const id of Object.keys(st.vehicles)) {
        if (!vehicleFilter(st, id, filterRef.current.filter, filterRef.current.driverId)) continue;
        const v = st.vehicles[id];
        const trip = v.tripId ? st.trips[v.tripId] : undefined;
        const extraKm = trip ? (trip.speedKmh / 60) * gameMin : 0;
        const m = vehicleMarker(st, world, id, extraKm);
        if (id === u.selectedVehicleId) followPos = m.pos;
        features.push({
          type: 'Feature',
          properties: { id, activity: m.activity, bearing: m.bearing, late: m.late, moving: m.activity === 'driving' || m.activity === 'ferry', selected: id === u.selectedVehicleId, plate: v.plate },
          geometry: { type: 'Point', coordinates: m.pos },
        });
      }
      src.setData({ type: 'FeatureCollection', features });
      if (u.followVehicle && followPos && !mini) map.jumpTo({ center: followPos });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, mini]);

  function refreshStatic(map: maplibregl.Map) {
    const st = getUi().state;
    if (!st) return;
    (map.getSource('cities') as GeoJSONSource | undefined)?.setData(citiesGeoJSON(st));
    (map.getSource('routes') as GeoJSONSource | undefined)?.setData(routesGeoJSON(st, filterRef.current.filter, filterRef.current.driverId));
    (map.getSource('preview') as GeoJSONSource | undefined)?.setData(previewGeoJSON(st, getUi().focusOrderId));
  }

  // Routen/Städte bei neuen Schnappschüssen aktualisieren (nicht pro Frame)
  const tripsKey = state ? Object.values(state.trips).map((t) => `${t.id}:${t.legIndex}:${t.phase}`).join('|') + state.company.locations.length : '';
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) refreshStatic(map);
  }, [tripsKey, filter, driverId, focusOrderId]);

  // Vorschau eines Auftrags: Karte auf Route zoomen
  useEffect(() => {
    const map = mapRef.current;
    const st = getUi().state;
    if (!map || !st || !focusOrderId || mini) return;
    const o = st.orders[focusOrderId];
    if (!o) return;
    const a = CITY_BY_ID[o.fromCityId];
    const b = CITY_BY_ID[o.toCityId];
    map.fitBounds([[Math.min(a.lon, b.lon), Math.min(a.lat, b.lat)], [Math.max(a.lon, b.lon), Math.max(a.lat, b.lat)]], { padding: 120, duration: 600 });
  }, [focusOrderId, mini]);

  return <div ref={ref} className="map-wrap" />;
}

function installLayers(map: maplibregl.Map, theme: 'dark' | 'light') {
  const dark = theme === 'dark';
  if (!map.hasImage('arrow')) map.addImage('arrow', arrowImage(), { sdf: true });
  map.addSource('roads', { type: 'geojson', data: roadsGeoJSON() });
  map.addSource('cities', { type: 'geojson', data: citiesGeoJSON(null) });
  map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addLayer({
    id: 'roads',
    type: 'line',
    source: 'roads',
    paint: {
      'line-color': dark ? '#3b4f6e' : '#94a3b8',
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 8, 2],
      'line-opacity': 0.7,
      'line-dasharray': ['case', ['get', 'ferry'], ['literal', [2, 2]], ['literal', [1, 0]]],
    },
  });
  map.addLayer({
    id: 'preview',
    type: 'line',
    source: 'preview',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fbbf24', 'line-width': 4, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'routes',
    type: 'line',
    source: 'routes',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'kind'], 'late', '#f87171', 'loaded', '#38bdf8', '#94a3b8'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 4],
      'line-opacity': 0.85,
      'line-dasharray': ['match', ['get', 'kind'], 'empty', ['literal', [2, 1.5]], ['literal', [1, 0]]],
    },
  });
  map.addLayer({
    id: 'cities',
    type: 'circle',
    source: 'cities',
    filter: ['!', ['get', 'own']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'pop'], 25, 2.5, 3000, 5, 11000, 7],
      'circle-color': dark ? '#cbd5e1' : '#334155',
      'circle-opacity': 0.75,
      'circle-stroke-width': 1,
      'circle-stroke-color': dark ? '#0b1120' : '#ffffff',
    },
  });
  map.addLayer({
    id: 'cities-own',
    type: 'circle',
    source: 'cities',
    filter: ['get', 'own'],
    paint: { 'circle-radius': 8, 'circle-color': '#f59e0b', 'circle-stroke-width': 3, 'circle-stroke-color': dark ? '#0b1120' : '#ffffff' },
  });
  map.addLayer({
    id: 'city-labels',
    type: 'symbol',
    source: 'cities',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['get', 'own'], 13, 10], 8, 14],
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'symbol-sort-key': ['-', 0, ['get', 'pop']],
    },
    paint: {
      'text-color': ['case', ['get', 'own'], '#f59e0b', dark ? '#e2e8f0' : '#0f172a'],
      'text-halo-color': dark ? '#0b1120' : '#ffffff',
      'text-halo-width': 1.4,
    },
  });
  const colorExpr = ['match', ['get', 'activity'], ...ACTIVITY_COLOR.flat(), '#38bdf8'] as unknown as maplibregl.ExpressionSpecification;
  map.addLayer({
    id: 'vehicles-halo',
    type: 'circle',
    source: 'vehicles',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 16, 11],
      'circle-color': ['case', ['get', 'late'], '#f87171', colorExpr],
      'circle-opacity': ['case', ['get', 'selected'], 0.35, 0.18],
    },
  });
  map.addLayer({
    id: 'vehicles',
    type: 'circle',
    source: 'vehicles',
    paint: {
      'circle-radius': ['case', ['get', 'selected'], 8, 6.5],
      'circle-color': ['case', ['get', 'late'], '#f87171', colorExpr],
      'circle-stroke-width': 2,
      'circle-stroke-color': dark ? '#0b1120' : '#ffffff',
    },
  });
  map.addLayer({
    id: 'vehicles-dir',
    type: 'symbol',
    source: 'vehicles',
    filter: ['get', 'moving'],
    layout: {
      'icon-image': 'arrow',
      'icon-size': 0.24,
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': dark ? '#0b1120' : '#ffffff' },
  });
  map.addLayer({
    id: 'vehicles-label',
    type: 'symbol',
    source: 'vehicles',
    minzoom: 6.5,
    layout: { 'text-field': ['get', 'plate'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.4], 'text-anchor': 'top', 'text-allow-overlap': false },
    paint: { 'text-color': dark ? '#e2e8f0' : '#0f172a', 'text-halo-color': dark ? '#0b1120' : '#ffffff', 'text-halo-width': 1.2 },
  });
}
