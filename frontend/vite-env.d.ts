/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENVIRONMENT: 'development' | 'production';
  // Add other variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {ImportMeta}