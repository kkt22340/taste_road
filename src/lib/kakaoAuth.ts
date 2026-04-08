/** Kakao JavaScript SDK (로그인 등) — 지도 SDK와 별도 스크립트 */
const KAKAO_JS = "https://developers.kakao.com/sdk/js/kakao.min.js";

let loadPromise: Promise<void> | null = null;

export function loadKakaoJsSdk(): Promise<void> {
  if (typeof window !== "undefined" && window.Kakao?.isInitialized()) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = KAKAO_JS;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Kakao JS SDK 로드 실패"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

export function initKakaoAuth(appKey: string) {
  if (!window.Kakao) throw new Error("Kakao SDK 없음");
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(appKey);
  }
}

/**
 * `authorize()`·토큰 교환에 쓰는 리다이렉트 URI.
 * 카카오 콘솔에 등록한 값·슬래시까지 이 문자열과 정확히 같아야 합니다.
 */
export function getKakaoOAuthRedirectUri(): string {
  const fromEnv = import.meta.env.VITE_KAKAO_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/`;
}

/** 계정 화면 안내용 — authorize URI와 동일 */
export function getAdvertisedKakaoRedirectUri(): string {
  return getKakaoOAuthRedirectUri();
}

/**
 * 카카오 로그인 (리다이렉트). 동의 후 돌아올 때 URL에 `code`가 붙으며,
 * 앱에서 이 코드를 토큰으로 바꿔야 합니다 (`npm run dev` 시 로컬 프록시).
 */
export function startKakaoAuthorize(): void {
  if (!window.Kakao?.Auth?.authorize) {
    throw new Error("Kakao.Auth.authorize를 쓸 수 없습니다");
  }
  const redirectUri = getKakaoOAuthRedirectUri();
  if (!redirectUri) throw new Error("리다이렉트 URI를 확인할 수 없습니다");
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const throughTalk =
    /Android|iPhone|iPad|iPod|Mobile|KAKAOTALK/i.test(ua);
  window.Kakao.Auth.authorize({
    redirectUri,
    /** 모바일·카카오톡: 앱/웹 로그인 흐름 시도(미설치 시 웹 로그인으로 폴백) */
    throughTalk,
  });
}

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  ko_hint?: string;
};

export async function exchangeKakaoAuthCode(
  code: string,
  redirectUri: string,
): Promise<string> {
  const endpoint = import.meta.env.DEV
    ? "/kakao-oauth/token"
    : "/api/kakao-oauth-token";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirectUri }),
  });
  const raw = await res.text();
  let data: TokenResponse = {};
  try {
    data = JSON.parse(raw) as TokenResponse;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const base =
      data.error_description ??
      data.error ??
      (raw.trim() || `HTTP ${res.status}`);
    const msg = data.ko_hint ? `${base} — ${data.ko_hint}` : base;
    throw new Error(msg);
  }
  const at = data.access_token?.trim();
  if (!at) throw new Error("access_token이 응답에 없습니다");
  return at;
}

export function logoutKakao() {
  if (window.Kakao?.Auth?.getAccessToken?.()) {
    window.Kakao.Auth.logout(() => undefined);
  }
}

export function getKakaoAccessToken(): string | undefined {
  return window.Kakao?.Auth?.getAccessToken?.() ?? undefined;
}

/** SDK에 토큰이 없을 때 `localStorage`의 `kakao_at`을 복구해 새로고침 후에도 로그인 유지 */
export function restoreKakaoSessionFromStorage(): boolean {
  if (getKakaoAccessToken()) return true;
  const stored = localStorage.getItem("kakao_at")?.trim();
  if (!stored || !window.Kakao?.Auth?.setAccessToken) return false;
  try {
    window.Kakao.Auth.setAccessToken(stored, true);
  } catch {
    localStorage.removeItem("kakao_at");
    return false;
  }
  return Boolean(getKakaoAccessToken());
}
