/**
 * Vercel: POST /api/kakao-oauth-token  (평탄 경로 — 중첩 api/kakao-oauth/token 404 방지)
 */

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const restKey = (process.env.KAKAO_REST_API_KEY || "").trim();
  if (!restKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "server_error",
        error_description: "KAKAO_REST_API_KEY가 없습니다(Vercel env).",
      }),
    );
    return;
  }

  let body = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  const code = String(body.code || "").trim();
  const redirectUri = String(body.redirectUri || "").trim();
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

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": "TasteRoad-Vercel/1.0",
    },
    body: form.toString(),
  });

  const text = await tokenRes.text();
  res.statusCode = tokenRes.status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(text);
};
