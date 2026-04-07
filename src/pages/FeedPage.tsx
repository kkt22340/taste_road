import { useEffect, useState } from "react";
import { loadAllPhotos, loadMarkers } from "../lib/db";
import type { VisitMarker, VisitPhoto } from "../types/domain";
import { PhotoThumb } from "../components/PhotoThumb";

export function FeedPage() {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [markers, setMarkers] = useState<VisitMarker[]>([]);

  useEffect(() => {
    Promise.all([loadAllPhotos(), loadMarkers()]).then(([p, m]) => {
      setPhotos(p);
      setMarkers(m);
    });
  }, []);

  const titleOf = (markerId: string) =>
    markers.find((x) => x.id === markerId)?.title ?? "방문";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          내 사진
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          카메라로 남긴 기록만 모아 보여요
        </p>
      </header>
      {photos.length === 0 ? (
        <p className="text-sm text-slate-600">
          아직 사진이 없어요. 지도에서 마커를 남기고 카메라로 찍어보세요.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/5"
            >
              <PhotoThumb
                blob={p.blob}
                className="aspect-square w-full object-cover"
              />
              <span className="block truncate px-2 py-2 text-[0.7rem] text-slate-600 sm:text-xs">
                {titleOf(p.markerId)}
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
