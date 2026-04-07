/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_JAVASCRIPT_KEY: string;
  /** 카카오 로그인 → 리다이렉트 URI에 등록한 값과 동일하게 (경로·슬래시까지) */
  readonly VITE_KAKAO_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 카카오 JavaScript SDK (로그인) — 지도용 `kakao` 와 별개 */
interface Window {
  Kakao?: {
    init: (appKey: string) => void;
    isInitialized: () => boolean;
    Auth: {
      login: (o: {
        success?: (authObj?: unknown) => void;
        fail?: (err?: unknown) => void;
      }) => void;
      authorize: (o: {
        redirectUri: string;
        throughTalk?: boolean;
        scope?: string;
        state?: string;
      }) => void;
      logout: (callback?: () => void) => void;
      getAccessToken: () => string | null | undefined;
      setAccessToken?: (token: string, persist?: boolean) => void;
    };
  };
}
