export default async function handler(req, res) {
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

  const upstreamPath = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path || "");
  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

  const url = `https://dapi.kakao.com/${upstreamPath}${qs}`;
  const upstream = await fetch(url, {
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
}

