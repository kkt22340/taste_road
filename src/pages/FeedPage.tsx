import { useEffect, useMemo, useState } from "react";
import { useAppChrome } from "../context/AppChromeContext";
import { loadAllPhotos, loadMarkers } from "../lib/db";
import { markerMatchesScope } from "../lib/feedScope";
import type { VisitMarker, VisitPhoto } from "../types/domain";
import { PhotoThumb } from "../components/PhotoThumb";

export function FeedPage() {
  const { scope } = useAppChrome();
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [markers, setMarkers] = useState<VisitMarker[]>([]);

  useEffect(() => {
    Promise.all([loadAllPhotos(), loadMarkers()]).then(([p, m]) => {
      setPhotos(p);
      setMarkers(m);
    });
  }, [scope]);

  const markerById = useMemo(() => {
    const map = new Map<string, VisitMarker>();
    for (const x of markers) map.set(x.id, x);
    return map;
  }, [markers]);

  const visiblePhotos = useMemo(() => {
    return photos.filter((p) => {
      const m = markerById.get(p.markerId);
      if (!m) return false;
      return markerMatchesScope(m, scope);
    });
  }, [photos, markerById, scope]);

  const titleOf = (markerId: string) =>
    markerById.get(markerId)?.title ?? "Visit";

  const noteOf = (markerId: string) => markerById.get(markerId)?.note;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Feed
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {scope === "only"
            ? "Your pins and photos (including private)."
            : "Shared spots from you and others on Taste Road."}
        </p>
      </header>
      {visiblePhotos.length === 0 ? (
        <p className="text-sm text-slate-600">
          Nothing here yet. Add a spot from the map or switch to share.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visiblePhotos.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/5"
            >
              <PhotoThumb
                blob={p.blob}
                className="aspect-square w-full object-cover"
              />
              <span className="block truncate px-2 py-1 text-[0.65rem] font-medium text-slate-800 sm:text-xs">
                {titleOf(p.markerId)}
              </span>
              {noteOf(p.markerId) ? (
                <span className="line-clamp-2 block px-2 pb-2 text-[0.65rem] text-slate-600 sm:text-xs">
                  {noteOf(p.markerId)}
                </span>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
