/// <reference types="vite/client" />

/** ビルド時に指定できる公開版のソースURL。 */
interface ImportMetaEnv {
  readonly VITE_SOURCE_URL?: string;
  /** ビルド時に埋め込むバージョン（例: v1.0.1、v1.0.1+3）。 */
  readonly VITE_APP_VERSION?: string;
}
