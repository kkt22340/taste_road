/**
 * 실내·PC 등에서 위치가 잘 안 잡히는 경우를 줄이기 위해
 * - 네트워크/캐시 기반(빠름)과 고정밀 요청을 동시에 두고 먼저 성공한 결과 사용
 * - 이후 watchPosition 폴백
 * - 성공 시 sessionStorage 에 마지막 좌표 저장(실패 시 지도 폴백용)
 */

const LAST_GEO_KEY = "taste-road-last-geopos";
const LAST_GEO_MAX_AGE_MS = 30 * 60 * 1000;

function getOnce(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function isDenied(e: unknown): boolean {
  return (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as GeolocationPositionError).code === 1
  );
}

function persistPosition(pos: GeolocationPosition): void {
  try {
    sessionStorage.setItem(
      LAST_GEO_KEY,
      JSON.stringify({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        t: Date.now(),
      }),
    );
  } catch {
    /* private mode 등 */
  }
}

/** 지도·안내용: 최근 성공 좌표 (약 30분) */
export function readLastPersistedPosition(): { lat: number; lng: number } | null {
  try {
    const raw = sessionStorage.getItem(LAST_GEO_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { lat: number; lng: number; t: number };
    if (Date.now() - j.t > LAST_GEO_MAX_AGE_MS) return null;
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lng)) return null;
    return { lat: j.lat, lng: j.lng };
  } catch {
    return null;
  }
}

/**
 * 여러 getCurrentPosition 을 동시에 두고, 가장 먼저 성공한 값을 사용합니다.
 * PERMISSION_DENIED 는 즉시 실패로 전달합니다.
 */
function raceFirstSuccess(
  factories: Array<() => Promise<GeolocationPosition>>,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    const n = factories.length;
    if (n === 0) {
      reject(new Error("no geo attempts"));
      return;
    }

    const failOne = (err: unknown) => {
      if (settled) return;
      if (isDenied(err)) {
        settled = true;
        reject(err);
        return;
      }
      failures++;
      if (failures >= n) {
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    for (const fn of factories) {
      void fn().then(
        (pos) => {
          if (settled) return;
          settled = true;
          resolve(pos);
        },
        failOne,
      );
    }
  });
}

function watchFirstFix(
  options: PositionOptions,
  timeoutMs: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        resolve(pos);
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        reject(err);
      },
      options,
    );

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      const t = new Error("watch timeout") as Error & { code: number };
      t.code = 3;
      reject(t);
    }, timeoutMs);
  });
}

/**
 * 로컬 개발 등: 한 번만 짧게 시도 (실패 시 바로 지도 중심 폴백할 때 사용).
 */
export function getQuickPosition(
  timeoutMs = 5000,
): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw Object.assign(new Error("no-geolocation-api"), { code: 0 });
  }
  return getOnce({
    enableHighAccuracy: false,
    timeout: timeoutMs,
    maximumAge: 300_000,
  });
}

export async function getBestEffortPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw Object.assign(new Error("no-geolocation-api"), { code: 0 });
  }

  try {
    const pos = await raceFirstSuccess([
      () =>
        getOnce({
          enableHighAccuracy: false,
          maximumAge: 600_000,
          timeout: 25_000,
        }),
      () =>
        getOnce({
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 28_000,
        }),
    ]);
    persistPosition(pos);
    return pos;
  } catch (e) {
    if (isDenied(e)) throw e;
  }

  try {
    const pos = await watchFirstFix(
      { enableHighAccuracy: false, maximumAge: 900_000 },
      28_000,
    );
    persistPosition(pos);
    return pos;
  } catch (e) {
    if (isDenied(e)) throw e;
    throw e;
  }
}

export function isGeolocationSecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}
