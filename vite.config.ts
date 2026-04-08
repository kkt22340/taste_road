import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage } from "node:http";
import { defineConfig, loadEnv } from "vite";

/** .env 에 KAKAO_X="..."처럼 넣으면 따옴표가 값에 들어가 401이 나는 경우가 있음 */
function cleanEnvValue(raw: string): string {
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function readJsonBody(req: IncomingMessage): Promise<{ code?: string; redirectUri?: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const KO_HINT_401 =
  "401/Unauthorized: (1) 토큰 교환의 client_id는 [앱 키 → REST API 키]만 사용(JavaScript 키 아님). " +
  "(2) [카카오 로그인 → 보안]에서 클라이언트 시크릿 사용 시, .env 의 KAKAO_CLIENT_SECRET(서버 전용, VITE_ 금지)을 넣고 dev 재시작. " +
  "(3) 리다이렉트 URI·인가 코드가 유효한지 확인. " +
  "(4) .env 수정 후 npm run dev 재시작.";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const restKey = cleanEnvValue(env.KAKAO_REST_API_KEY ?? "");
  const kakaoClientSecret = cleanEnvValue(env.KAKAO_CLIENT_SECRET ?? "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "kakao-oauth-token-dev",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const pathname = req.url?.split("?")[0] ?? "";
            if (pathname !== "/kakao-oauth/token" || req.method !== "POST") {
              next();
              return;
            }
            if (!restKey) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  error: "server_error",
                  error_description:
                    "개발 서버에 KAKAO_REST_API_KEY가 없습니다. .env를 확인하세요.",
                }),
              );
              return;
            }
            try {
              const body = await readJsonBody(req as IncomingMessage);
              const code = body.code?.trim() ?? "";
              const redirectUri = body.redirectUri?.trim() ?? "";
              if (!code || !redirectUri) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(
                  JSON.stringify({
                    error: "invalid_request",
                    error_description: "code 및 redirectUri가 필요합니다.",
                  }),
                );
                return;
              }
              const form = new URLSearchParams({
                grant_type: "authorization_code",
                client_id: restKey,
                redirect_uri: redirectUri,
                code,
              });
              if (kakaoClientSecret) {
                form.set("client_secret", kakaoClientSecret);
              }

              const postToken = (body: string) =>
                fetch("https://kauth.kakao.com/oauth/token", {
                  method: "POST",
                  headers: {
                    "Content-Type":
                      "application/x-www-form-urlencoded;charset=utf-8",
                    "User-Agent": "TasteRoad-ViteDev/1.0",
                  },
                  body,
                });

              const tokenRes = await postToken(form.toString());
              const text = await tokenRes.text();

              res.statusCode = tokenRes.status;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              if (!tokenRes.ok) {
                if (mode === "development") {
                  try {
                    const dbg = JSON.parse(text) as Record<string, unknown>;
                    console.warn(
                      "[kakao-oauth/token] 카카오 응답:",
                      tokenRes.status,
                      dbg.error ?? dbg,
                    );
                  } catch {
                    console.warn(
                      "[kakao-oauth/token] 카카오 응답(비JSON):",
                      tokenRes.status,
                      text.slice(0, 500),
                    );
                  }
                }
                try {
                  const j = JSON.parse(text) as Record<string, unknown>;
                  if (tokenRes.status === 401) {
                    const sameAsJs =
                      restKey.length > 0 &&
                      cleanEnvValue(env.VITE_KAKAO_JAVASCRIPT_KEY ?? "") ===
                        restKey;
                    j.ko_hint = sameAsJs
                      ? `${KO_HINT_401} — 지금 KAKAO_REST_API_KEY와 JavaScript 키 값이 같습니다. 콘솔 [앱 키]에서「REST API 키」와「JavaScript 키」는 서로 다른 문자열이어야 합니다.`
                      : KO_HINT_401;
                  }
                  res.end(JSON.stringify(j));
                  return;
                } catch {
                  /* fall through */
                }
              }
              res.end(text);
            } catch (e) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  error: "server_error",
                  error_description:
                    e instanceof Error ? e.message : "토큰 요청 처리 실패",
                }),
              );
            }
          });
        },
      },
    ],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/kakao-dapi": {
          target: "https://dapi.kakao.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/kakao-dapi/, ""),
          configure(proxy) {
            proxy.on("proxyReq", (proxyReq) => {
              if (restKey) {
                proxyReq.setHeader("Authorization", `KakaoAK ${restKey}`);
              }
            });
          },
        },
      },
    },
  };
});
