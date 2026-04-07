import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAdvertisedKakaoRedirectUri,
  getKakaoAccessToken,
  initKakaoAuth,
  loadKakaoJsSdk,
  logoutKakao,
  startKakaoAuthorize,
} from "../lib/kakaoAuth";

type Props = {
  appkey: string;
  /** gate: 앱 첫 화면(로그인만) / account: 로그인 후 탭에서 계정 관리 */
  mode?: "gate" | "account";
  onAuthenticated?: () => void;
  onSignedOut?: () => void;
};

export function LoginPage({
  appkey,
  mode = "account",
  onAuthenticated,
  onSignedOut,
}: Props) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState<string | undefined>(() =>
    mode === "gate"
      ? undefined
      : typeof localStorage !== "undefined"
        ? localStorage.getItem("kakao_at") ?? undefined
        : undefined,
  );

  const onAuthenticatedRef = useRef(onAuthenticated);
  onAuthenticatedRef.current = onAuthenticated;

  useEffect(() => {
    const pending = sessionStorage.getItem("kakao_oauth_err");
    if (pending) {
      sessionStorage.removeItem("kakao_oauth_err");
      setErr(pending);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadKakaoJsSdk();
        if (cancelled) return;
        initKakaoAuth(appkey);
        setReady(true);
        const t = getKakaoAccessToken();
        if (t) localStorage.setItem("kakao_at", t);
        setToken(t ?? localStorage.getItem("kakao_at") ?? undefined);
        if (mode === "gate" && t) onAuthenticatedRef.current?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "SDK 오류");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appkey, mode]);

  const onLogin = useCallback(() => {
    setErr(null);
    try {
      startKakaoAuthorize();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "로그인 시작 실패");
    }
  }, []);

  const onLogout = useCallback(() => {
    logoutKakao();
    localStorage.removeItem("kakao_at");
    setToken(undefined);
    onSignedOut?.();
  }, [onSignedOut]);

  const shell =
    mode === "gate"
      ? "mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6"
      : "min-h-0 flex-1 max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6";

  return (
    <div className={shell}>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        {mode === "gate" ? "Taste Road" : "계정"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {mode === "gate"
          ? "카카오로 로그인한 뒤 지도·피드를 이용할 수 있어요."
          : "카카오 계정으로 로그인하면 이 기기의 방문 기록과 연동할 준비가 됩니다. (현재 버전은 로컬 저장소 우선)"}
      </p>
      {mode === "gate" && (
        <p className="mt-3 rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2 text-[0.7rem] leading-relaxed text-slate-600 shadow-sm backdrop-blur-sm">
          <span className="font-medium text-slate-700">KOE006</span> 방지: [카카오
          개발자 콘솔] → [내 애플리케이션] → <strong>카카오 로그인</strong> →{" "}
          <strong>리다이렉트 URI</strong>에 아래 값을 <strong>그대로</strong>{" "}
          등록하세요. (<code className="text-amber-800">localhost</code>와{" "}
          <code className="text-amber-800">127.0.0.1</code>는 다른 주소입니다.
          끝 <code className="text-amber-800">/</code> 유무도 일치해야 합니다.)
          <code className="mt-1.5 block break-all text-slate-800">
            {getAdvertisedKakaoRedirectUri() || "(브라우저에서 열면 표시됩니다)"}
          </code>
        </p>
      )}
      {mode === "account" && (
        <p className="mt-3 rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2 text-[0.7rem] leading-relaxed text-slate-600 shadow-sm backdrop-blur-sm">
          콘솔에 등록한 <span className="text-slate-700">리다이렉트 URI</span>와 아래가
          같아야 합니다. (<span className="text-slate-700">KOE006</span>은 보통 여기
          불일치입니다.) 다르면{" "}
          <code className="text-amber-800">.env</code>의{" "}
          <code className="text-amber-800">VITE_KAKAO_REDIRECT_URI</code>에 동일한
          값을 적고 서버를 다시 켜세요.
          <code className="mt-1.5 block break-all text-slate-800">
            {getAdvertisedKakaoRedirectUri() || "(브라우저에서 열면 표시됩니다)"}
          </code>
        </p>
      )}
      {!ready && !err && (
        <p className="mt-4 text-sm text-slate-500">카카오 SDK 준비 중…</p>
      )}
      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
      {ready && (
        <div className="mt-6">
          {token ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-emerald-700">로그인됨</p>
              <button
                type="button"
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white/80 px-5 text-sm font-medium text-slate-700 shadow-sm active:bg-slate-50"
                onClick={onLogout}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="min-h-[52px] w-full rounded-2xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 text-base font-semibold text-amber-950 shadow-md shadow-amber-900/10 active:from-amber-500 active:to-amber-600 sm:max-w-sm"
              onClick={onLogin}
            >
              카카오톡으로 로그인
            </button>
          )}
        </div>
      )}
    </div>
  );
}
