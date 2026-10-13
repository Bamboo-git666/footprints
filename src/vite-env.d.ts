/// <reference types="vite/client" />

declare module 'heic2any'

/** 构建时由 vite.config.ts 的 define 注入（主版本 + 构建时间） */
declare const __APP_VERSION__: string
