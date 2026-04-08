import { useCallback, useEffect, useMemo, useState } from "react";
import { useSupabaseAuthOptional } from "../../context/SupabaseAuthContext";
import { logoutKakao } from "../../lib/kakaoAuth";
import {
  fetchProfileRow,
  updateProfileAvatarUrl,
  upsertProfileNickname,
} from "../../lib/supabase/profileRemote";
import {
  getProfile,
  setAvatarDataUrl,
  setNickname,
  setProfile,
} from "./profile";

type Props = {
  onSignedOut: () => void;
};

export function MyPage({ onSignedOut }: Props) {
  const supa = useSupabaseAuthOptional();
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadLocal = useCallback(() => {
    const p = getProfile();
    setNick(p.nickname ?? "");
    setAvatar(p.avatarDataUrl ?? p.avatarUrl);
  }, []);

  useEffect(() => {
    loadLocal();
    let cancelled = false;
    if (!supa?.user?.id) return;
    void (async () => {
      try {
        const row = await fetchProfileRow(supa.supabase, supa.user.id);
        if (cancelled || !row) return;
        setNick((n) => (n.trim() ? n : row.nickname) || row.nickname);
        if (row.avatar_url) setAvatar(row.avatar_url);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLocal, supa?.user?.id, supa?.supabase]);

  const initial = useMemo(() => {
    const s = nick.trim();
    return s ? s.slice(0, 1).toUpperCase() : "·";
  }, [nick]);

  const onSaveNick = useCallback(async () => {
    if (!nick.trim()) return;
    setMsg(null);
    setNickname(nick);
    if (supa?.user?.id) {
      setBusy(true);
      try {
        await upsertProfileNickname(supa.supabase, supa.user.id, nick);
        await supa.refreshServerProfile();
        setMsg("저장했어요.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "저장 실패");
      } finally {
        setBusy(false);
      }
    }
  }, [nick, supa]);

  const onPickAvatar = useCallback(
    async (file: File | null) => {
      if (!file || !file.type.startsWith("image/")) return;
      setMsg(null);

      if (supa?.user?.id) {
        setBusy(true);
        try {
          const path = `${supa.user.id}/avatar`;
          const { error: upErr } = await supa.supabase.storage
            .from("avatars")
            .upload(path, file, {
              contentType: file.type || "image/jpeg",
              upsert: true,
            });
          if (upErr) throw upErr;
          const { data: pub } = supa.supabase.storage
            .from("avatars")
            .getPublicUrl(path);
          const url = pub.publicUrl;
          await updateProfileAvatarUrl(supa.supabase, supa.user.id, url);
          setProfile({
            ...getProfile(),
            avatarUrl: url,
            avatarDataUrl: undefined,
          });
          setAvatar(url);
          setMsg("프로필 사진을 올렸어요.");
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "업로드 실패");
        } finally {
          setBusy(false);
        }
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ""));
        r.onerror = () => reject(new Error("read"));
        r.readAsDataURL(file);
      });
      setAvatar(dataUrl);
      setAvatarDataUrl(dataUrl);
    },
    [supa],
  );

  const onRemoveAvatar = useCallback(async () => {
    setMsg(null);
    if (supa?.user?.id) {
      setBusy(true);
      try {
        await supa.supabase.storage
          .from("avatars")
          .remove([`${supa.user.id}/avatar`]);
        await updateProfileAvatarUrl(supa.supabase, supa.user.id, null);
        const p = getProfile();
        setProfile({
          ...p,
          avatarUrl: undefined,
          avatarDataUrl: undefined,
        });
        setAvatar(undefined);
        setMsg("삭제했어요.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "삭제 실패");
      } finally {
        setBusy(false);
      }
      return;
    }
    setAvatar(undefined);
    setAvatarDataUrl(undefined);
  }, [supa]);

  const onLogout = useCallback(() => {
    logoutKakao();
    localStorage.removeItem("kakao_at");
    onSignedOut();
  }, [onSignedOut]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
      <header className="mx-auto w-full max-w-md">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          My Page
        </h1>
      </header>

      <div className="mx-auto mt-5 w-full max-w-md space-y-5">
        {msg ? (
          <p className="text-sm text-slate-600" role="status">
            {msg}
          </p>
        ) : null}

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-1 ring-black/5"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-xl font-semibold text-white">
                {initial}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {nick.trim() ? `@${nick.trim()}` : "닉네임을 설정해 주세요"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50">
                  사진 변경
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) =>
                      void onPickAvatar(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRemoveAvatar()}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <label className="block text-xs font-semibold text-slate-600">
            닉네임
          </label>
          <div className="mt-2 flex gap-2">
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="예: taste_road"
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
              maxLength={20}
            />
            <button
              type="button"
              onClick={() => void onSaveNick()}
              disabled={!nick.trim() || busy}
              className="h-11 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm active:bg-sky-700 disabled:bg-slate-300"
            >
              저장
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={onLogout}
            className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 active:bg-slate-50"
          >
            로그아웃
          </button>
        </section>
      </div>
    </div>
  );
}
