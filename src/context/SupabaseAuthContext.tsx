import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "../lib/supabase/client";
import { fetchProfileRow } from "../lib/supabase/profileRemote";
import { getProfile, setProfile } from "../features/profile/profile";

type Value = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  supabase: ReturnType<typeof getSupabase>;
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshServerProfile: () => Promise<void>;
};

const Ctx = createContext<Value | null>(null);

async function mergeServerProfileIntoLocal(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
) {
  try {
    const row = await fetchProfileRow(supabase, userId);
    if (!row) return;
    const local = getProfile();
    setProfile({
      ...local,
      nickname: row.nickname.trim() || local.nickname,
      avatarUrl: row.avatar_url ?? local.avatarUrl,
    });
  } catch {
    /* 오프라인·RLS 등은 무시 */
  }
}

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshServerProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    await mergeServerProfileIntoLocal(supabase, uid);
  }, [session?.user?.id, supabase]);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
      if (s?.user?.id) void mergeServerProfileIntoLocal(supabase, s.user.id);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (s?.user?.id) void mergeServerProfileIntoLocal(supabase, s.user.id);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithKakao = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("kakao_at");
  }, [supabase]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      supabase,
      signInWithKakao,
      signOut,
      refreshServerProfile,
    }),
    [session, loading, supabase, signInWithKakao, signOut, refreshServerProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupabaseAuth(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSupabaseAuth: SupabaseAuthProvider 밖에서 사용됨");
  return v;
}

export function useSupabaseAuthOptional(): Value | null {
  return useContext(Ctx);
}
