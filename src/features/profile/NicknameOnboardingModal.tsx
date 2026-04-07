import { useCallback, useMemo, useState } from "react";
import { setNickname } from "./profile";

type Props = {
  open: boolean;
  onDone: () => void;
};

export function NicknameOnboardingModal({ open, onDone }: Props) {
  const [nick, setNick] = useState("");

  const canSave = useMemo(() => nick.trim().length >= 2, [nick]);

  const save = useCallback(() => {
    if (!canSave) return;
    setNickname(nick);
    onDone();
  }, [canSave, nick, onDone]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nick-title"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-[420px] overflow-hidden rounded-t-[20px] bg-white shadow-2xl sm:rounded-[20px]">
        <div className="px-5 pb-5 pt-5">
          <h2 id="nick-title" className="text-[18px] font-semibold text-slate-900">
            닉네임 설정
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            피드와 지도에서 사용할 이름을 정해 주세요.
          </p>

          <input
            autoFocus
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="예: taste_road"
            maxLength={20}
            className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
          />

          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="mt-4 h-12 w-full rounded-xl bg-sky-600 text-[16px] font-semibold text-white shadow-sm active:bg-sky-700 disabled:bg-slate-300"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}

