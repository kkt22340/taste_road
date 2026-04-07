import { useCallback, useEffect, useMemo, useState } from "react";
import { getProfile, setAvatarDataUrl, setNickname } from "./profile";
import { logoutKakao } from "../../lib/kakaoAuth";

type Props = {
  onSignedOut: () => void;
};

export function MyPage({ onSignedOut }: Props) {
  const [nick, setNick] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>(undefined);

  useEffect(() => {
    const p = getProfile();
    setNick(p.nickname ?? "");
    setAvatar(p.avatarDataUrl);
  }, []);

  const initial = useMemo(() => {
    const s = nick.trim();
    return s ? s.slice(0, 1).toUpperCase() : "·";
  }, [nick]);

  const onSaveNick = useCallback(() => {
    if (!nick.trim()) return;
    setNickname(nick);
  }, [nick]);

  const onPickAvatar = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ""));
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(file);
    });
    setAvatar(dataUrl);
    setAvatarDataUrl(dataUrl);
  }, []);

  const onRemoveAvatar = useCallback(() => {
    setAvatar(undefined);
    setAvatarDataUrl(undefined);
  }, []);

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
                <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-50">
                  사진 변경
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      void onPickAvatar(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={onRemoveAvatar}
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 active:bg-slate-50"
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
              onClick={onSaveNick}
              disabled={!nick.trim()}
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

