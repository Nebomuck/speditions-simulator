/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAP_STYLE_DARK?: string;
  readonly VITE_MAP_STYLE_LIGHT?: string;
}

/** Version aus apps/client/package.json (Vite define) */
declare const __APP_VERSION__: string;
