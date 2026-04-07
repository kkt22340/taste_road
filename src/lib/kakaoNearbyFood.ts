/**
 * 카카오 로컬 — 카테고리 검색(음식점 FD6). 프록시: /kakao-dapi → dapi.kakao.com
 */

export type KakaoFoodPlaceDoc = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  x: string;
  y: string;
  /** 검색 기준점(x,y)으로부터 직선 거리(m) */
  distance: string;
  address_name?: string;
  road_address_name?: string;
};

type CategoryResponse = { documents?: KakaoFoodPlaceDoc[] };

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export async function fetchNearbyFoodPlaces(
  lng: number,
  lat: number,
  opts?: { radius?: number; limit?: number },
): Promise<KakaoFoodPlaceDoc[]> {
  const radius = opts?.radius ?? 850;
  /** 카카오 로컬 API: size 는 최대 15 */
  const size = Math.min(15, Math.max(1, opts?.limit ?? 15));
  const params = new URLSearchParams({
    category_group_code: "FD6",
    x: String(lng),
    y: String(lat),
    radius: String(radius),
    sort: "distance",
    size: String(size),
  });
  const res = await fetch(
    `/kakao-dapi/v2/local/search/category.json?${params}`,
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as CategoryResponse;
  const docs = data.documents ?? [];

  return docs
    .map((d) => {
      const plat = Number(d.y);
      const plng = Number(d.x);
      if (
        !d.id ||
        !d.place_name ||
        !Number.isFinite(plat) ||
        !Number.isFinite(plng)
      ) {
        return null;
      }
      let dist = Number(d.distance);
      if (!Number.isFinite(dist)) {
        dist = haversineMeters(lat, lng, plat, plng);
      }
      return { ...d, distance: String(Math.round(dist)) };
    })
    .filter((d): d is KakaoFoodPlaceDoc => d != null);
}

export function placeDistanceMeters(doc: KakaoFoodPlaceDoc): number {
  return Number(doc.distance);
}
