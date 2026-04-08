import type { SupabaseClient } from "@supabase/supabase-js";

export type RemoteProfileRow = {
  nickname: string;
  avatar_url: string | null;
};

export async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<RemoteProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("nickname, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    nickname: data.nickname ?? "",
    avatar_url: data.avatar_url ?? null,
  };
}

export async function upsertProfileNickname(
  supabase: SupabaseClient,
  userId: string,
  nickname: string,
): Promise<void> {
  const n = nickname.trim();
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      nickname: n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

export async function updateProfileAvatarUrl(
  supabase: SupabaseClient,
  userId: string,
  avatarUrl: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}
