/** script onerror 시 message 가 비는 경우가 많음 */
export function describeSdkLoadFailure(
  ev: ErrorEvent | Error | undefined,
): string {
  if (!ev) return "";
  if (ev instanceof Error) {
    const m = ev.message.trim();
    if (m) return m;
  } else if ("message" in ev && String(ev.message).trim()) {
    return String(ev.message).trim();
  }
  return [
    "Kakao Maps 스크립트를 불러오지 못했습니다.",
    "F12 → Network → sdk.js: 401이면 JavaScript 키·JavaScript SDK 도메인(http://localhost:5173)·지도 제품 설정을 확인하세요.",
    "127.0.0.1로 접속 중이면 SDK 도메인에 http://127.0.0.1:5173 도 등록하세요.",
  ].join(" ");
}

function stringifyUnknownErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * useKakaoLoader 실패 시 — 특히 콘솔에서 지도·로컬 미사용(OPEN_MAP_AND_LOCAL)일 때
 */
export function describeKakaoMapLoadError(err: unknown): string {
  const raw = stringifyUnknownErr(err);
  if (
    /OPEN_MAP_AND_LOCAL|NotAuthorizedError|disabled OPEN_MAP/i.test(raw)
  ) {
    return [
      "이 앱에서 카카오맵·로컬 API가 꺼져 있어 지도를 쓸 수 없습니다.",
      "[카카오 developers] → 내 애플리케이션 → 해당 앱 → 제품 설정에서",
      "「카카오맵」(또는 지도·로컬) 사용을 ON 하고, JavaScript 키에 접속 주소(예: http://localhost:5173)를 등록한 뒤 새로고침 하세요.",
    ].join(" ");
  }
  return describeSdkLoadFailure(err as Error);
}
