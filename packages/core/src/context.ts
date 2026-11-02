// Laufzeitkontext der Simulation: unveränderliche Weltdaten, die nicht im Spielstand liegen.

import { RoadNetwork, type RoadNetData } from './routing.ts';

export interface SimContext {
  net: RoadNetwork;
}

export function createSimContext(roadnet: RoadNetData): SimContext {
  return { net: new RoadNetwork(roadnet) };
}
