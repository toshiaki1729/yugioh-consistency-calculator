/// <reference types="vite/client" />

/** ビルド時に指定できる公開版のソースURL。 */
interface ImportMetaEnv {
  readonly VITE_SOURCE_URL?: string;
}
