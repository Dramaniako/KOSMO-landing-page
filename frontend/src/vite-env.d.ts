/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_MIDTRANS_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
