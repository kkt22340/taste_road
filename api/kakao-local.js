/**
 * Vercel: GET /api/kakao-local?path=v2/local/search/category.json&...
 * api/ 는 CommonJS (루트 package.json 의 "type":"module" 과 분리)
 */
const ALLOWED = /^v2\/local\/search\/(category|keyword)\.json$/;

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
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

  const u = new URL(req.url || "", "http://localhost");
  const path = (u.searchParams.get("path") || "").replace(/^\/+/, "");
  u.searchParams.delete("path");
  const qs = u.searchParams.toString();

  if (!path || !ALLOWED.test(path)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "bad_request",
        error_description: "허용되지 않은 path 입니다.",
      }),
    );
    return;
  }

  const upstreamUrl = `https://dapi.kakao.com/${path}${qs ? `?${qs}` : ""}`;
  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers: {
      Authorization: `KakaoAK ${restKey}`,
    },
  });

  res.statusCode = upstream.status;
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "no-store");
  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
};
