import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAllPhotos, loadMarkers } from "../lib/db";
import type { VisitMarker, VisitPhoto } from "../types/domain";
import { PhotoThumb } from "../components/PhotoThumb";
import { getBestEffortPosition } from "../lib/geolocation";
import { isPhotoLiked, togglePhotoLike } from "../lib/likes";

export function FeedPage() {
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [markers, setMarkers] = useState<VisitMarker[]>([]);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "loading" | "ok" | "denied" | "unavailable"
  >("idle");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusM, setRadiusM] = useState<200 | 1000 | 3000>(1000);
  const [, setLikeEpoch] = useState(0);

  useEffect(() => {
    Promise.all([loadAllPhotos(), loadMarkers()]).then(([p, m]) => {
      setPhotos(p);
      setMarkers(m);
    });
  }, []);

  const fetchMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      return;
    }
    setGeoStatus("loading");
    void getBestEffortPosition()
      .then((pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("ok");
      })
      .catch((err: unknown) => {
        const denied =
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as GeolocationPositionError).code === 1;
        setGeoStatus(denied ? "denied" : "unavailable");
      });
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const markerById = useMemo(() => {
    const map = new Map<string, VisitMarker>();
    for (const x of markers) map.set(x.id, x);
    return map;
  }, [markers]);

  function haversineMeters(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  const visiblePhotos = useMemo(() => {
    if (!me) return [];
    return photos
      .filter((p) => {
        const m = markerById.get(p.markerId);
        if (!m) return false;
        if ((m.visibility ?? "private") !== "shared") return false;
        const d = haversineMeters(me.lat, me.lng, m.lat, m.lng);
        return d <= radiusM;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [photos, markerById, me, radiusM]);

  const titleOf = (markerId: string) =>
    markerById.get(markerId)?.title ?? "Visit";

  const noteOf = (markerId: string) => markerById.get(markerId)?.note;

  const subtitleOf = (markerId: string) => {
    const m = markerById.get(markerId);
    if (!m) return null;
    const parts = [m.categoryName, m.addressName].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  };

  const onToggleLike = useCallback((photoId: string) => {
    togglePhotoLike(photoId);
    setLikeEpoch((n) => n + 1);
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mx-auto w-full max-w-[520px] px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Feed
          </h1>
          <div className="flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/90 p-1 text-xs font-semibold text-slate-600 shadow-sm">
            <button
              type="button"
              onClick={() => setRadiusM(200)}
              className={`h-8 rounded-full px-3 ${
                radiusM === 200 ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              200m
            </button>
            <button
              type="button"
              onClick={() => setRadiusM(1000)}
              className={`h-8 rounded-full px-3 ${
                radiusM === 1000 ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              1km
            </button>
            <button
              type="button"
              onClick={() => setRadiusM(3000)}
              className={`h-8 rounded-full px-3 ${
                radiusM === 3000 ? "bg-slate-900 text-white" : "text-slate-600"
              }`}
            >
              3km
            </button>
          </div>
        </div>
      </header>
      {geoStatus === "loading" ? (
        <p className="mx-auto w-full max-w-[520px] px-4 text-sm text-slate-600 sm:px-6">
          내 위치 확인 중…
        </p>
      ) : geoStatus === "denied" ? (
        <div className="mx-auto w-full max-w-[520px] space-y-3 px-4 sm:px-6">
          <p className="text-sm text-slate-600">위치를 허용해 주세요.</p>
          <button
            type="button"
            onClick={fetchMe}
            className="h-11 w-full rounded-xl bg-sky-600 text-sm font-semibold text-white active:bg-sky-700"
          >
            다시 시도
          </button>
        </div>
      ) : geoStatus === "unavailable" ? (
        <div className="mx-auto w-full max-w-[520px] space-y-3 px-4 sm:px-6">
          <p className="text-sm text-slate-600">내 위치를 확인할 수 없어요.</p>
          <button
            type="button"
            onClick={fetchMe}
            className="h-11 w-full rounded-xl bg-sky-600 text-sm font-semibold text-white active:bg-sky-700"
          >
            다시 시도
          </button>
        </div>
      ) : visiblePhotos.length === 0 ? (
        <p className="mx-auto w-full max-w-[520px] px-4 text-sm text-slate-600 sm:px-6">
          {radiusM === 200
            ? "200m 이내 공유 게시물이 없어요."
            : radiusM === 1000
              ? "1km 이내 공유 게시물이 없어요."
              : "3km 이내 공유 게시물이 없어요."}
        </p>
      ) : (
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 sm:gap-5 sm:px-6">
          {visiblePhotos.map((p) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/5"
            >
              <header className="flex items-center gap-3 px-3 py-3">
                <div
                  className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-slate-900">
                    {titleOf(p.markerId)}
                  </p>
                  {subtitleOf(p.markerId) ? (
                    <p className="truncate text-[12px] text-slate-500">
                      {subtitleOf(p.markerId)}
                    </p>
                  ) : null}
                </div>
                <time className="shrink-0 text-[12px] text-slate-400">
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </time>
              </header>

              <div className="relative">
                <PhotoThumb blob={p.blob} className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  aria-label={isPhotoLiked(p.id) ? "좋아요 취소" : "좋아요"}
                  aria-pressed={isPhotoLiked(p.id)}
                  onClick={() => onToggleLike(p.id)}
                  className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg ring-1 ring-black/5 backdrop-blur active:scale-95"
                >
                  <span
                    className={`text-[18px] leading-none ${
                      isPhotoLiked(p.id) ? "text-rose-600" : "text-slate-800"
                    }`}
                    aria-hidden
                  >
                    ♥
                  </span>
                </button>
              </div>

              {noteOf(p.markerId) ? (
                <div className="px-3 pb-3 pt-3">
                  <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">
                    {noteOf(p.markerId)}
                  </p>
                </div>
              ) : (
                <div className="px-3 pb-3 pt-2" />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
