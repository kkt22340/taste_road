import { useEffect, useState } from "react";
import type { VisitMarker, VisitPhoto } from "../types/domain";
import { loadPhotosForMarker } from "../lib/db";
import { PhotoThumb } from "./PhotoThumb";

type Props = {
  marker: VisitMarker | null;
  open: boolean;
  onClose: () => void;
  onOpenCamera: () => void;
  onDeleteMarker: (id: string) => void;
  refreshKey: number;
};

export function MarkerBottomSheet({
  marker,
  open,
  onClose,
  onOpenCamera,
  onDeleteMarker,
  refreshKey,
}: Props) {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);

  useEffect(() => {
    if (!marker || !open) {
      setPhotos([]);
      return;
    }
    loadPhotosForMarker(marker.id).then(setPhotos);
  }, [marker, open, refreshKey]);

  if (!open || !marker) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-50 cursor-default bg-slate-900/25 backdrop-blur-[2px] sm:bg-slate-900/20"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-[51] max-h-[min(72vh,36rem)] overflow-y-auto rounded-t-[1.25rem] border border-slate-200/95 bg-white/95 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-slate-900 shadow-[0_-12px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:left-auto sm:right-auto sm:mx-auto sm:max-w-lg sm:rounded-2xl sm:border sm:pb-6 sm:pt-4 sm:shadow-xl sm:shadow-slate-900/10"
        role="dialog"
        aria-labelledby="sheet-title"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <h2 id="sheet-title" className="text-lg font-semibold tracking-tight">
          {marker.title}
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          {new Date(marker.createdAt).toLocaleString("ko-KR")}
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="min-h-[48px] flex-1 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 text-sm font-semibold text-amber-950 shadow-sm active:from-amber-500 active:to-amber-600"
            onClick={onOpenCamera}
          >
            카메라로 사진 추가
          </button>
          <button
            type="button"
            className="min-h-[48px] flex-1 rounded-xl border border-red-300 bg-red-50/80 px-4 text-sm font-medium text-red-700 active:bg-red-100/80"
            onClick={() => {
              if (confirm("이 방문 기록과 사진을 모두 삭제할까요?")) {
                onDeleteMarker(marker.id);
                onClose();
              }
            }}
          >
            기록 삭제
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.length === 0 ? (
            <p className="col-span-full text-sm text-slate-600">
              아직 사진이 없어요. 카메라로 한 장 남겨보세요.
            </p>
          ) : (
            photos.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-xl">
                <PhotoThumb blob={p.blob} className="aspect-square w-full object-cover" />
              </figure>
            ))
          )}
        </div>
      </div>
    </>
  );
}
