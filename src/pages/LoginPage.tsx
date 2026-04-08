import { useCallback, useEffect, useRef, useState } from "react";
import { loginErrorForUser } from "../lib/loginUserMessages";
import {
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
  /** true: Supabase Auth 카카오 OAuth (Kakao JS SDK authorize 대신) */
  supabaseOAuth?: boolean;
  onSupabaseLogin?: () => void | Promise<void>;
};

export function LoginPage({
  appkey,
  mode = "account",
  onAuthenticated,
  onSignedOut,
  supabaseOAuth = false,
  onSupabaseLogin,
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
      setErr(loginErrorForUser(pending));
    }
  }, []);

  useEffect(() => {
    if (supabaseOAuth) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
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
        setErr(
          loginErrorForUser(
            e instanceof Error ? e.message : "일시적 오류",
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appkey, mode, supabaseOAuth]);

  const onLogin = useCallback(() => {
    setErr(null);
    if (supabaseOAuth && onSupabaseLogin) {
      void Promise.resolve(onSupabaseLogin()).catch((e) =>
        setErr(
          loginErrorForUser(
            e instanceof Error ? e.message : "로그인 시작 실패",
          ),
        ),
      );
      return;
    }
    try {
      startKakaoAuthorize();
    } catch (e) {
      setErr(
        loginErrorForUser(
          e instanceof Error ? e.message : "로그인 시작 실패",
        ),
      );
    }
  }, [supabaseOAuth, onSupabaseLogin]);

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
          ? "카카오로 로그인하고 맛집 지도와 나만의 기록을 써 보세요."
          : "로그인하면 이 기기에서 남긴 방문 기록·사진과 계정이 연결됩니다."}
      </p>
      {!ready && !err && (
        <p className="mt-4 text-sm text-slate-500">잠시만 기다려 주세요…</p>
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
