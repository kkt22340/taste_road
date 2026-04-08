import type { SupabaseClient } from "@supabase/supabase-js";
import type { VisitMarker } from "../../types/domain";

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

/**
 * 시트에서 사진만 추가할 때: 해당 id의 post가 있으면 사진만 이어 붙이고,
 * 없으면 마커 메타로 post를 새로 만든 뒤 사진을 올림.
 */
export async function appendOrCreatePostPhotos(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  payload: RemotePostPayload,
  newBlobs: Blob[],
): Promise<void> {
  if (!newBlobs.length) return;

  const { data: existing, error: selErr } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw selErr;

  if (!existing) {
    await createPostWithPhotos(supabase, userId, postId, payload, newBlobs);
    return;
  }

  const { data: orderRows, error: maxErr } = await supabase
    .from("post_photos")
    .select("sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (maxErr) throw maxErr;
  let nextOrder = 0;
  if (orderRows?.length) {
    nextOrder = (orderRows[0].sort_order as number) + 1;
  }

  for (let i = 0; i < newBlobs.length; i++) {
    const sortOrder = nextOrder + i;
    const path = `${userId}/${postId}/${sortOrder}.jpg`;
    const { error: ue } = await supabase.storage
      .from("post-photos")
      .upload(path, newBlobs[i], {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (ue) throw ue;
    const { error: ie } = await supabase.from("post_photos").insert({
      post_id: postId,
      storage_path: path,
      sort_order: sortOrder,
    });
    if (ie) throw ie;
  }

  const { error: upErr } = await supabase
    .from("posts")
    .update({
      title: payload.title,
      note: payload.note?.trim() || null,
      lat: payload.lat,
      lng: payload.lng,
      visibility: payload.visibility,
      kakao_place_id: payload.kakaoPlaceId ?? null,
      address_name: payload.addressName ?? null,
      category_name: payload.categoryName ?? null,
    })
    .eq("id", postId)
    .eq("user_id", userId);
  if (upErr) throw upErr;
}

/** 서버에 같은 id의 행이 있을 때만 갱신(없으면 조용히 무시). */
export async function updateRemotePostFromMarker(
  supabase: SupabaseClient,
  userId: string,
  marker: VisitMarker,
): Promise<void> {
  const { data, error: selErr } = await supabase
    .from("posts")
    .select("id")
    .eq("id", marker.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (!data) return;

  const { error } = await supabase
    .from("posts")
    .update({
      title: marker.title,
      note: marker.note?.trim() || null,
      lat: marker.lat,
      lng: marker.lng,
      visibility: marker.visibility ?? "private",
      kakao_place_id: marker.kakaoPlaceId ?? null,
      address_name: marker.addressName ?? null,
      category_name: marker.categoryName ?? null,
    })
    .eq("id", marker.id)
    .eq("user_id", userId);
  if (error) throw error;
}

/** 게시글 행 삭제(cascade로 post_photos 정리) + 스토리지 객체 제거. */
export async function deleteRemotePostForUser(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
): Promise<void> {
  const prefix = `${userId}/${postId}`;
  const { data: files, error: listErr } = await supabase.storage
    .from("post-photos")
    .list(prefix, { limit: 1000 });
  if (!listErr && files?.length) {
    const paths = files.map((f) => `${prefix}/${f.name}`);
    const { error: rmErr } = await supabase.storage
      .from("post-photos")
      .remove(paths);
    if (rmErr) throw rmErr;
  }

  const { error: delErr } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId);
  if (delErr) throw delErr;
}

export type RemoteFeedPhoto = {
  postId: string;
  postUserId: string;
  title: string;
  note: string | null;
  lat: number;
  lng: number;
  addressName: string | null;
  categoryName: string | null;
  createdAtMs: number;
  photoSortOrder: number;
  photoId: string;
  publicUrl: string;
};

/** visibility=shared 게시물 + 사진(public URL). 피드용. */
export async function fetchSharedFeedPhotos(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<RemoteFeedPhoto[]> {
  const limit = options?.limit ?? 200;
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      id,
      user_id,
      title,
      note,
      lat,
      lng,
      address_name,
      category_name,
      created_at,
      post_photos ( id, sort_order, storage_path )
    `,
    )
    .eq("visibility", "shared")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data?.length) return [];

  const out: RemoteFeedPhoto[] = [];
  for (const raw of data) {
    const p = raw as {
      id: string;
      user_id: string;
      title: string;
      note: string | null;
      lat: number;
      lng: number;
      address_name: string | null;
      category_name: string | null;
      created_at: string;
      post_photos:
        | { id: string; sort_order: number; storage_path: string }[]
        | null;
    };
    const photos = p.post_photos;
    if (!photos?.length) continue;
    const sorted = [...photos].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
    const createdAtMs = new Date(p.created_at).getTime();
    for (const ph of sorted) {
      const {
        data: { publicUrl },
      } = supabase.storage.from("post-photos").getPublicUrl(ph.storage_path);
      out.push({
        postId: p.id,
        postUserId: p.user_id,
        title: p.title,
        note: p.note,
        lat: p.lat,
        lng: p.lng,
        addressName: p.address_name,
        categoryName: p.category_name,
        createdAtMs,
        photoSortOrder: ph.sort_order ?? 0,
        photoId: ph.id,
        publicUrl,
      });
    }
  }
  return out;
}
