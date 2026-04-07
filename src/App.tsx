import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  exchangeKakaoAuthCode,
  getKakaoAccessToken,
  getKakaoOAuthRedirectUri,
  initKakaoAuth,
  loadKakaoJsSdk,
  restoreKakaoSessionFromStorage,
} from "./lib/kakaoAuth";
import { FeedPage } from "./pages/FeedPage";
import { LoginPage } from "./pages/LoginPage";
import { MapPage } from "./pages/MapPage";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-3 text-sm font-medium transition-colors sm:px-4 sm:text-base",
    isActive
      ? "bg-sky-100 text-sky-900 shadow-sm shadow-sky-900/5"
      : "text-slate-600 active:bg-slate-200/60 hover:bg-slate-100/90 hover:text-slate-900",
  ].join(" ");

type AuthPhase = "checking" | "signedOut" | "signedIn";

function MainApp({
  appkey,
  onSignedOut,
}: {
  appkey: string;
  onSignedOut: () => void;
}) {
  return (
    <BrowserRouter>
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <nav
          className="relative z-[1001] flex shrink-0 flex-wrap gap-1 border-b border-slate-200/80 bg-white/75 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_1px_0_0_rgba(15,23,42,0.04)] backdrop-blur-xl sm:px-4"
          aria-label="주요 메뉴"
        >
          <NavLink className={navLinkClass} to="/" end>
            지도
          </NavLink>
          <NavLink className={navLinkClass} to="/feed">
            피드
          </NavLink>
          <NavLink className={navLinkClass} to="/account">
            계정
          </NavLink>
        </nav>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <Routes>
            <Route path="/" element={<MapPage appkey={appkey} />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route
              path="/account"
              element={
                <LoginPage
                  appkey={appkey}
                  mode="account"
                  onSignedOut={onSignedOut}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default function App() {
  const appkey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY?.trim() ?? "";
  const [auth, setAuth] = useState<AuthPhase>("checking");

  const onAuthenticated = useCallback(() => setAuth("signedIn"), []);
  const onSignedOut = useCallback(() => setAuth("signedOut"), []);

  useEffect(() => {
    if (!appkey) return;
    let cancelled = false;
    (async () => {
      try {
        await loadKakaoJsSdk();
        if (cancelled) return;
        initKakaoAuth(appkey);

        const params = new URLSearchParams(window.location.search);
        const code = params.get("code")?.trim();
        const oauthError = params.get("error");
        const oauthDesc = params.get("error_description");

        if (oauthError) {
          localStorage.removeItem("kakao_at");
          window.history.replaceState({}, "", window.location.pathname);
          const msg = oauthDesc ?? oauthError ?? "";
          let decoded = msg;
          try {
            decoded = msg ? decodeURIComponent(msg) : oauthError ?? "";
          } catch {
            /* keep raw */
          }
          sessionStorage.setItem("kakao_oauth_err", decoded);
          if (!cancelled) setAuth("signedOut");
          return;
        }

        if (code) {
          if (!import.meta.env.DEV) {
            window.history.replaceState({}, "", window.location.pathname);
            sessionStorage.setItem(
              "kakao_oauth_err",
              "배포 환경에서는 카카오 토큰 교환 API(백엔드)가 필요합니다.",
            );
            if (!cancelled) setAuth("signedOut");
            return;
          }
          /* authorize()에 넣은 redirectUri와 문자 단위로 같아야 함(현재 경로로 추측 금지) */
          const redirectUri = getKakaoOAuthRedirectUri();
          try {
            const accessToken = await exchangeKakaoAuthCode(code, redirectUri);
            window.Kakao?.Auth?.setAccessToken?.(accessToken, true);
            localStorage.setItem("kakao_at", accessToken);
            /* 리다이렉트가 루트면 OAuth 직후 지도(/)가 뜨는 것을 피하고 계정 화면으로 */
            const p = window.location.pathname || "/";
            const next = p === "/" || p === "" ? "/account" : p;
            window.history.replaceState({}, "", next);
            if (!cancelled) setAuth("signedIn");
            return;
          } catch (e) {
            localStorage.removeItem("kakao_at");
            window.history.replaceState({}, "", window.location.pathname);
            sessionStorage.setItem(
              "kakao_oauth_err",
              e instanceof Error ? e.message : "로그인 완료 처리 실패",
            );
            if (!cancelled) setAuth("signedOut");
            return;
          }
        }

        restoreKakaoSessionFromStorage();
        const t = getKakaoAccessToken();
        if (t) localStorage.setItem("kakao_at", t);
        else localStorage.removeItem("kakao_at");
        if (!cancelled) setAuth(t ? "signedIn" : "signedOut");
      } catch {
        if (!cancelled) {
          localStorage.removeItem("kakao_at");
          setAuth("signedOut");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appkey]);

  if (!appkey) {
    return (
      <div className="min-h-[100dvh] w-full p-6 font-sans text-slate-800">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Taste Road
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-red-600">
          `.env`에 `VITE_KAKAO_JAVASCRIPT_KEY`를 설정한 뒤 개발 서버를 다시
          실행하세요.
        </p>
      </div>
    );
  }

  if (auth === "checking") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 font-sans text-slate-500">
        <p className="text-sm font-medium text-slate-600">로그인 확인 중…</p>
      </div>
    );
  }

  if (auth === "signedOut") {
    return (
      <LoginPage
        appkey={appkey}
        mode="gate"
        onAuthenticated={onAuthenticated}
      />
    );
  }

  return <MainApp appkey={appkey} onSignedOut={onSignedOut} />;
}
