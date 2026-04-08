import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAllPhotos, loadMarkers } from "../lib/db";
import type { VisitMarker, VisitPhoto } from "../types/domain";
import { PhotoThumb } from "../components/PhotoThumb";
import { getBestEffortPosition } from "../lib/geolocation";
import { isPhotoLiked, togglePhotoLike } from "../lib/likes";
import { useSupabaseAuthOptional } from "../context/SupabaseAuthContext";
import type { RemoteFeedPhoto } from "../lib/supabase/postsRemote";
import { fetchSharedFeedPhotos } from "../lib/supabase/postsRemote";
import { fetchProfilesByIds } from "../lib/supabase/profileRemote";

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

type FeedCard =
  | {
      kind: "local";
      photo: VisitPhoto;
      marker: VisitMarker;
      createdAt: number;
    }
  | {
      kind: "remote";
      row: RemoteFeedPhoto;
      nickname: string;
      avatarUrl: string | null;
      createdAt: number;
    };

function cardSortKey(c: FeedCard): [number, number] {
  if (c.kind === "local") return [c.photo.createdAt, 0];
  return [c.row.createdAtMs, c.row.photoSortOrder];
}

export function FeedPage() {
  const supa = useSupabaseAuthOptional();
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [markers, setMarkers] = useState<VisitMarker[]>([]);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "loading" | "ok" | "denied" | "unavailable"
  >("idle");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusM, setRadiusM] = useState<200 | 1000 | 3000>(1000);
  const [, setLikeEpoch] = useState(0);

  const [remoteRows, setRemoteRows] = useState<RemoteFeedPhoto[]>([]);
  const [remoteProfiles, setRemoteProfiles] = useState<
    Map<string, { nickname: string; avatar_url: string | null }>
  >(() => new Map());
  const [remoteStatus, setRemoteStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  /** 로컬 IndexedDB + 원격 피드 재로드 */
  const [feedRefreshEpoch, setFeedRefreshEpoch] = useState(0);

  useEffect(() => {
    Promise.all([loadAllPhotos(), loadMarkers()]).then(([p, m]) => {
      setPhotos(p);
      setMarkers(m);
    });
  }, [feedRefreshEpoch]);

  useEffect(() => {
    if (!supa?.session?.user || !supa.supabase) {
      setRemoteRows([]);
      setRemoteProfiles(new Map());
      setRemoteStatus("idle");
      return;
    }
    setRemoteStatus("loading");
    const sb = supa.supabase;
    void (async () => {
      try {
        const rows = await fetchSharedFeedPhotos(sb, { limit: 200 });
        const userIds = [...new Set(rows.map((r) => r.postUserId))];
        const profMap = await fetchProfilesByIds(sb, userIds);
        setRemoteRows(rows);
        setRemoteProfiles(profMap);
        setRemoteStatus("ok");
      } catch (e) {
        console.error(e);
        setRemoteRows([]);
        setRemoteProfiles(new Map());
        setRemoteStatus("error");
      }
    })();
  }, [supa?.session?.user, supa?.supabase, feedRefreshEpoch]);

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

  const localMarkerIds = useMemo(
    () => new Set(markers.map((m) => m.id)),
    [markers],
  );
  const myUserId = supa?.session?.user?.id ?? null;

  const remoteInRadius = useMemo(() => {
    if (!me) return [];
    return remoteRows.filter((r) => {
      if (
        myUserId &&
        r.postUserId === myUserId &&
        localMarkerIds.has(r.postId)
      ) {
        return false;
      }
      const d = haversineMeters(me.lat, me.lng, r.lat, r.lng);
      return d <= radiusM;
    });
  }, [remoteRows, me, radiusM, myUserId, localMarkerIds]);

  const feedCards = useMemo((): FeedCard[] => {
    if (!me) return [];
    const out: FeedCard[] = [];

    for (const p of photos) {
      const m = markerById.get(p.markerId);
      if (!m) continue;
      if ((m.visibility ?? "private") !== "shared") continue;
      const d = haversineMeters(me.lat, me.lng, m.lat, m.lng);
      if (d > radiusM) continue;
      out.push({ kind: "local", photo: p, marker: m, createdAt: p.createdAt });
    }

    for (const row of remoteInRadius) {
      const prof = remoteProfiles.get(row.postUserId);
      const nick = prof?.nickname?.trim();
      out.push({
        kind: "remote",
        row,
        nickname: nick && nick.length > 0 ? nick : "닉네임 없음",
        avatarUrl: prof?.avatar_url ?? null,
        createdAt: row.createdAtMs,
      });
    }

    out.sort((a, b) => {
      const [ta, oa] = cardSortKey(a);
      const [tb, ob] = cardSortKey(b);
      if (tb !== ta) return tb - ta;
      return oa - ob;
    });
    return out;
  }, [photos, markerById, me, radiusM, remoteInRadius, remoteProfiles]);

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

  const emptyMessage =
    radiusM === 200
      ? "200m 이내 공유 게시물이 없어요."
      : radiusM === 1000
        ? "1km 이내 공유 게시물이 없어요."
        : "3km 이내 공유 게시물이 없어요.";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mx-auto w-full max-w-[520px] px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
              Feed
            </h1>
            <button
              type="button"
              aria-label="피드 새로고침"
              title="새로고침"
              disabled={remoteStatus === "loading"}
              onClick={() => setFeedRefreshEpoch((n) => n + 1)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm active:bg-slate-50 disabled:opacity-50"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className={remoteStatus === "loading" ? "animate-spin" : ""}
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v7h-7" />
              </svg>
            </button>
          </div>
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
        {remoteStatus === "error" ? (
          <p className="mt-2 text-xs text-amber-700">
            서버 피드를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
          </p>
        ) : null}
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
      ) : feedCards.length === 0 ? (
        <p className="mx-auto w-full max-w-[520px] px-4 text-sm text-slate-600 sm:px-6">
          {emptyMessage}
        </p>
      ) : (
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 sm:gap-5 sm:px-6">
          {feedCards.map((card) =>
            card.kind === "local" ? (
              <article
                key={`local-${card.photo.id}`}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/5"
              >
                <header className="flex items-center gap-3 px-3 py-3">
                  <div
                    className="h-9 w-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900">
                      {titleOf(card.photo.markerId)}
                    </p>
                    {subtitleOf(card.photo.markerId) ? (
                      <p className="truncate text-[12px] text-slate-500">
                        {subtitleOf(card.photo.markerId)}
                      </p>
                    ) : null}
                  </div>
                  <time className="shrink-0 text-[12px] text-slate-400">
                    {new Date(card.photo.createdAt).toLocaleDateString("ko-KR")}
                  </time>
                </header>

                <div className="relative">
                  <PhotoThumb
                    blob={card.photo.blob}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={
                      isPhotoLiked(card.photo.id) ? "좋아요 취소" : "좋아요"
                    }
                    aria-pressed={isPhotoLiked(card.photo.id)}
                    onClick={() => onToggleLike(card.photo.id)}
                    className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg ring-1 ring-black/5 backdrop-blur active:scale-95"
                  >
                    <span
                      className={`text-[18px] leading-none ${
                        isPhotoLiked(card.photo.id)
                          ? "text-rose-600"
                          : "text-slate-800"
                      }`}
                      aria-hidden
                    >
                      ♥
                    </span>
                  </button>
                </div>

                {noteOf(card.photo.markerId) ? (
                  <div className="px-3 pb-3 pt-3">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">
                      {noteOf(card.photo.markerId)}
                    </p>
                  </div>
                ) : (
                  <div className="px-3 pb-3 pt-2" />
                )}
              </article>
            ) : (
              <article
                key={`remote-${card.row.photoId}`}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-900/5"
              >
                <header className="flex items-center gap-3 px-3 py-3">
                  {card.avatarUrl ? (
                    <img
                      src={card.avatarUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-amber-400 to-rose-500"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-slate-900">
                      {card.row.title}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">
                      <span className="font-medium text-slate-600">
                        {card.nickname}
                      </span>
                      {card.row.categoryName || card.row.addressName
                        ? ` · ${[card.row.categoryName, card.row.addressName].filter(Boolean).join(" · ")}`
                        : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-[12px] text-slate-400">
                    {new Date(card.row.createdAtMs).toLocaleDateString("ko-KR")}
                  </time>
                </header>

                <div className="relative">
                  <PhotoThumb
                    src={card.row.publicUrl}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={
                      isPhotoLiked(card.row.photoId)
                        ? "좋아요 취소"
                        : "좋아요"
                    }
                    aria-pressed={isPhotoLiked(card.row.photoId)}
                    onClick={() => onToggleLike(card.row.photoId)}
                    className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg ring-1 ring-black/5 backdrop-blur active:scale-95"
                  >
                    <span
                      className={`text-[18px] leading-none ${
                        isPhotoLiked(card.row.photoId)
                          ? "text-rose-600"
                          : "text-slate-800"
                      }`}
                      aria-hidden
                    >
                      ♥
                    </span>
                  </button>
                </div>

                {card.row.note?.trim() ? (
                  <div className="px-3 pb-3 pt-3">
                    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">
                      {card.row.note}
                    </p>
                  </div>
                ) : (
                  <div className="px-3 pb-3 pt-2" />
                )}
              </article>
            ),
          )}
        </div>
      )}
    </div>
  );
}
