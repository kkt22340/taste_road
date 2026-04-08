import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let singleton: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다.");
  }
  if (!singleton) {
    singleton = createClient(
      import.meta.env.VITE_SUPABASE_URL!,
      import.meta.env.VITE_SUPABASE_ANON_KEY!,
      {
        auth: {
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      },
    );
  }
  return singleton;
}
