/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add other variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {ImportMeta}