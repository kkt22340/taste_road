import type { SupabaseClient } from "@supabase/supabase-js";

export type RemotePostPayload = {
  title: string;
  note?: string;
  lat: number;
  lng: number;
  visibility: "private" | "shared";
  kakaoPlaceId?: string;
  addressName?: string;
  categoryName?: string;
};

/**
 * 로컬 마커 id(uuid)와 동일한 id로 서버에 저장해 나중에 동기화·디버깅이 쉽게 함.
 */
export async function createPostWithPhotos(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  payload: RemotePostPayload,
  blobs: Blob[],
): Promise<void> {
  const { error: pe } = await supabase.from("posts").insert({
    id: postId,
    user_id: userId,
    title: payload.title,
    note: payload.note?.trim() || null,
    lat: payload.lat,
    lng: payload.lng,
    visibility: payload.visibility,
    kakao_place_id: payload.kakaoPlaceId ?? null,
    address_name: payload.addressName ?? null,
    category_name: payload.categoryName ?? null,
  });
  if (pe) throw pe;

  for (let i = 0; i < blobs.length; i++) {
    const path = `${userId}/${postId}/${i}.jpg`;
    const { error: ue } = await supabase.storage
      .from("post-photos")
      .upload(path, blobs[i], {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (ue) throw ue;
    const { error: ie } = await supabase.from("post_photos").insert({
      post_id: postId,
      storage_path: path,
      sort_order: i,
    });
    if (ie) throw ie;
  }
}
