/// <reference types="astro/client" />

interface ImportMetaEnv {
    readonly OPENAI_API_KEY: string;
    readonly OPENAI_BASE_URL?: string;
    readonly OPENAI_ORGANIZATION?: string;
    readonly OPENAI_MODEL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}