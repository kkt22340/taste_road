export type MarkerOwner = "local" | "demo";

export type MarkerVisibility = "private" | "shared";

export type VisitMarker = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** 짧은 메모·후기 */
  note?: string;
  createdAt: number;
  /** 나만 보기 / 맛집 공유 */
  visibility?: MarkerVisibility;
  /** 내 기기에서 만든 핀 vs 데모(다른 사용자 역할) */
  owner?: MarkerOwner;
  /** NEW 플로우에서 선택한 카카오 장소 ID */
  kakaoPlaceId?: string;
  addressName?: string;
  categoryName?: string;
};

export type VisitPhoto = {
  id: string;
  markerId: string;
  createdAt: number;
  blob: Blob;
};
