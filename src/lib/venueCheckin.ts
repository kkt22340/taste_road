/**
 * Geolocation coords.accuracy(m)를 반영한 체크인 허용 거리.
 * 오차가 크면 허용 반경을 살짝만 키워 실패를 줄이되, 150m급 과포함은 피합니다.
 */
export function checkinLimitFromAccuracy(accuracyM: number | null): number {
  if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM <= 0) {
    return 52;
  }
  const a = Math.min(accuracyM, 100);
  return Math.round(Math.min(50, Math.max(18, a * 0.52 + 6)));
}

/** 한 단계 넓힐 때마다 허용 거리 증가 — API 검색 반경(~850m)과 맞게 너무 좁으면 목록이 비어 보임 */
export const CHECKIN_BOOST_STEP_M = 40;
/** GPS 오차·도보 거리를 고려한 상한(이전 88m는 대부분의 FD6 후보를 화면에서 제거함) */
export const CHECKIN_MAX_CAP_M = 280;

export function effectiveCheckinLimitM(
  accuracyM: number | null,
  boostLevel: number,
): number {
  const base = checkinLimitFromAccuracy(accuracyM);
  const boosted = base + Math.max(0, boostLevel) * CHECKIN_BOOST_STEP_M;
  return Math.min(CHECKIN_MAX_CAP_M, boosted);
}
