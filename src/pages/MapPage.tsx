import {
  CustomOverlayMap,
  Map,
  MapMarker,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppChrome } from "../context/AppChromeContext";
import {
  loadAllPhotos,
  loadMarkers,
  saveMarker,
  savePhoto,
  removeMarker,
} from "../lib/db";
import { markerMatchesScope } from "../lib/feedScope";
import {
  getBestEffortPosition,
  readLastPersistedPosition,
} from "../lib/geolocation";
import { describeKakaoMapLoadError } from "../lib/mapErrors";
import type { VisitMarker } from "../types/domain";
import { CameraModal } from "../components/CameraModal";
import { MarkerBottomSheet } from "../components/MarkerBottomSheet";
import { NewSpotModal, type NewSpotPayload } from "../components/NewSpotModal";
import { useSupabaseAuthOptional } from "../context/SupabaseAuthContext";
import { createPostWithPhotos } from "../lib/supabase/postsRemote";

const DEFAULT = { lat: 37.5665, lng: 126.978 };

type LocalDocument = {
  id?: string;
  place_name: string;
  x: string;
  y: string;
};

type MapPageProps = { appkey: string };

function SpotThumbOverlay({
  marker,
  blob,
  onOpen,
}: {
  marker: VisitMarker;
  blob: Blob | undefined;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setSrc(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return (
    <CustomOverlayMap
      position={{ lat: marker.lat, lng: marker.lng }}
      yAnchor={1}
      xAnchor={0.5}
      clickable
      zIndex={10}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-11 w-11 overflow-hidden rounded-xl border-2 border-white bg-white shadow-md ring-1 ring-slate-900/15"
        title={marker.title}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="m-auto text-[10px] font-medium text-slate-500">
            ···
          </span>
        )}
      </button>
    </CustomOverlayMap>
  );
}

/** GPS로 잡은 내 위치 — 사람 실루엣 핀 (지도 위 시각 표시) */
function UserMePinOverlay({ lat, lng }: { lat: number; lng: number }) {
  return (
    <CustomOverlayMap
      position={{ lat, lng }}
      yAnchor={1}
      xAnchor={0.5}
      zIndex={25}
    >
      <div className="pointer-events-none flex flex-col items-center select-none">
        <div className="relative">
          <div
            className="absolute -inset-1 rounded-full bg-violet-400/25 blur-[6px]"
            aria-hidden
          />
          <div
            className="absolute inset-0 animate-pulse rounded-full bg-fuchsia-400/20"
            style={{ animationDuration: "2.5s" }}
            aria-hidden
          />
          <div className="relative flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400 p-[2px] shadow-[0_10px_28px_rgba(124,58,237,0.42)] ring-[3px] ring-white">
            <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600">
              <svg
                viewBox="0 0 24 24"
                className="h-[26px] w-[26px] text-white/95"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          </div>
        </div>
        <div
          className="mt-0.5 h-2 w-px bg-gradient-to-b from-slate-500/50 to-transparent"
          aria-hidden
        />
      </div>
    </CustomOverlayMap>
  );
}

export function MapPage({ appkey }: MapPageProps) {
  const supaRemote = useSupabaseAuthOptional();
  const {
    scope,
    setScope,
    regionSearchSeq,
    pendingRegionQuery,
    clearPendingRegionQuery,
    mapFocusSeq,
  } = useAppChrome();

  const [loading, loadError] = useKakaoLoader({
    appkey,
    libraries: [],
  });

  const [places, setPlaces] = useState<LocalDocument[]>([]);
  const [status, setStatus] = useState("");
  const [center, setCenter] = useState(DEFAULT);
  const [level, setLevel] = useState(5);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  const [visitMarkers, setVisitMarkers] = useState<VisitMarker[]>([]);
  const [photosByMarker, setPhotosByMarker] = useState<
    Record<string, Blob | undefined>
  >({});
  const [selectedMarker, setSelectedMarker] = useState<VisitMarker | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [newSpotOpen, setNewSpotOpen] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  /** 내 위치 버튼으로 마지막으로 확정된 GPS(또는 캐시) 좌표 — 지도에 사람 핀 표시 */
  const [gpsMePosition, setGpsMePosition] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const newSpotDevFallbackCenter = useMemo((): { lat: number; lng: number } | undefined => {
    if (!import.meta.env.DEV) return undefined;
    return {
      lat: map?.getCenter()?.getLat() ?? center.lat,
      lng: map?.getCenter()?.getLng() ?? center.lng,
    };
  }, [map, center.lat, center.lng]);

  const refreshPins = useCallback(async () => {
    const [markers, photos] = await Promise.all([
      loadMarkers(),
      loadAllPhotos(),
    ]);
    setVisitMarkers(markers);
    const byMarker: Record<string, { blob: Blob; createdAt: number }[]> = {};
    for (const p of photos) {
      if (!byMarker[p.markerId]) byMarker[p.markerId] = [];
      byMarker[p.markerId].push({ blob: p.blob, createdAt: p.createdAt });
    }
    const thumb: Record<string, Blob | undefined> = {};
    for (const id of Object.keys(byMarker)) {
      const list = byMarker[id].sort((a, b) => b.createdAt - a.createdAt);
      thumb[id] = list[0]?.blob;
    }
    setPhotosByMarker(thumb);
  }, []);

  useEffect(() => {
    void refreshPins();
  }, [refreshPins, photoEpoch]);

  const searchCenter = useCallback(() => {
    if (map) {
      const c = map.getCenter();
      return { lat: c.getLat(), lng: c.getLng() };
    }
    return center;
  }, [map, center]);

  const runRegionKeywordSearch = useCallback(
    async (q: string) => {
      const { lat, lng } = searchCenter();
      setStatus("Searching…");

      const params = new URLSearchParams({
        query: q,
        x: String(lng),
        y: String(lat),
        radius: "15000",
        size: "15",
      });

      try {
        const res = import.meta.env.DEV
          ? await fetch(`/kakao-dapi/v2/local/search/keyword.json?${params}`)
          : await fetch(
              `/api/kakao-local?path=${encodeURIComponent("v2/local/search/keyword.json")}&${params}`,
            );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { documents?: LocalDocument[] };
        const docs = data.documents ?? [];
        setPlaces(docs);
        setStatus(docs.length ? `${docs.length} places` : "No results");

        if (docs.length > 0) {
          const first = docs[0];
          const plat = Number(first.y);
          const plng = Number(first.x);
          if (Number.isFinite(plat) && Number.isFinite(plng)) {
            setCenter({ lat: plat, lng: plng });
            setLevel(5);
          }
        }
      } catch (err) {
        console.error(err);
        setPlaces([]);
        setStatus(
          describeKakaoMapLoadError(
            err instanceof Error ? err : new Error(String(err)),
          ),
        );
      }
    },
    [searchCenter],
  );

  useEffect(() => {
    if (regionSearchSeq === 0 || pendingRegionQuery == null) return;
    const q = pendingRegionQuery;
    clearPendingRegionQuery();
    void runRegionKeywordSearch(q);
  }, [
    regionSearchSeq,
    pendingRegionQuery,
    clearPendingRegionQuery,
    runRegionKeywordSearch,
  ]);

  const onSavePhoto = useCallback(
    async (blob: Blob) => {
      if (!selectedMarker) return;
      await savePhoto({
        id: crypto.randomUUID(),
        markerId: selectedMarker.id,
        createdAt: Date.now(),
        blob,
      });
      setPhotoEpoch((n) => n + 1);
    },
    [selectedMarker],
  );

  const onSaveNewSpot = useCallback(
    async (payload: NewSpotPayload) => {
      const { place } = payload;
      const m: VisitMarker = {
        id: crypto.randomUUID(),
        lat: place.lat,
        lng: place.lng,
        title: place.name,
        note: payload.note.trim() || undefined,
        createdAt: Date.now(),
        visibility: payload.privateOnly ? "private" : "shared",
        owner: "local",
        kakaoPlaceId: place.id,
        addressName: place.address,
        categoryName: place.category,
      };
      await saveMarker(m);
      const base = Date.now();
      for (let i = 0; i < payload.blobs.length; i++) {
        await savePhoto({
          id: crypto.randomUUID(),
          markerId: m.id,
          createdAt: base + i,
          blob: payload.blobs[i],
        });
      }
      const uid = supaRemote?.session?.user?.id;
      const sb = supaRemote?.supabase;
      if (uid && sb) {
        try {
          await createPostWithPhotos(sb, uid, m.id, {
            title: m.title,
            note: m.note,
            lat: m.lat,
            lng: m.lng,
            visibility: m.visibility ?? "private",
            kakaoPlaceId: m.kakaoPlaceId,
            addressName: m.addressName,
            categoryName: m.categoryName,
          }, payload.blobs);
        } catch (e) {
          console.error(e);
          setStatus(
            (payload.privateOnly ? "Saved (only you)." : "Shared on map.") +
              " 서버 동기화는 실패했어요.",
          );
          setPhotoEpoch((n) => n + 1);
          return;
        }
      }
      setPhotoEpoch((n) => n + 1);
      setStatus(payload.privateOnly ? "Saved (only you)." : "Shared on map.");
    },
    [supaRemote?.session?.user?.id, supaRemote?.supabase],
  );

  const openSheet = useCallback((m: VisitMarker) => {
    setSelectedMarker(m);
    setSheetOpen(true);
  }, []);

  const visibleMarkers = useMemo(
    () => visitMarkers.filter((m) => markerMatchesScope(m, scope)),
    [visitMarkers, scope],
  );

  const recenterOnMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("이 환경에서는 위치를 쓸 수 없어요.");
      return;
    }
    setStatus(
      "내 위치 확인 중… 실내·PC는 30초 안팎까지 걸릴 수 있어요.",
    );
    void getBestEffortPosition()
      .then((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCenter({ lat, lng });
        setLevel(4);
        setGpsMePosition({ lat, lng });
        const acc =
          pos.coords.accuracy != null
            ? ` (오차 약 ±${Math.round(pos.coords.accuracy)}m)`
            : "";
        setStatus(`지도를 현재 위치로 옮겼어요.${acc}`);
      })
      .catch((err: unknown) => {
        const denied =
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as GeolocationPositionError).code === 1;
        if (denied) {
          setGpsMePosition(null);
          setStatus(
            "위치 권한이 꺼져 있어요. 브라우저 주소창의 자물쇠에서 이 사이트 위치를 허용해 주세요.",
          );
          return;
        }
        const last = readLastPersistedPosition();
        if (last) {
          setCenter(last);
          setLevel(4);
          setGpsMePosition({ lat: last.lat, lng: last.lng });
          setStatus(
            "이번에는 위치를 못 잡았어요. 예전에 성공했던 좌표로 옮겼으니 정확하지 않을 수 있어요. 밖에서 다시「내 위치」를 눌러 보세요.",
          );
          return;
        }
        setGpsMePosition(null);
        setStatus(
          "위치를 가져오지 못했어요. Wi‑Fi·위치 서비스를 켜고, 되도록 밖에서 다시 시도해 주세요.",
        );
      });
  }, []);

  /** 처음 진입/Map 버튼 재클릭 시: 현재 위치로 센터 */
  useEffect(() => {
    if (loading || loadError) return;
    recenterOnMyLocation();
  }, [mapFocusSeq, loading, loadError, recenterOnMyLocation]);

  const statusError =
    !!loadError || status.includes("HTTP") || status.includes("실패");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative z-0 min-h-[50dvh] w-full flex-1">
        <div className="absolute left-3 top-3 z-[1002]">
          <div className="flex shrink-0 items-center rounded-full border border-slate-200/90 bg-white/95 p-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600 shadow-lg backdrop-blur-sm sm:text-xs">
            <button
              type="button"
              className={`min-h-[34px] rounded-full px-2.5 py-1 sm:px-3 ${
                scope === "only"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setScope("only")}
            >
              only
            </button>
            <button
              type="button"
              className={`min-h-[34px] rounded-full px-2.5 py-1 sm:px-3 ${
                scope === "share"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-500"
              }`}
              onClick={() => setScope("share")}
            >
              share
            </button>
          </div>
        </div>
        <Map
          className="h-full min-h-[50dvh] w-full"
          center={center}
          level={level}
          onCreate={setMap}
          onDragEnd={(kMap) => {
            const c = kMap.getCenter();
            setCenter({ lat: c.getLat(), lng: c.getLng() });
          }}
          onZoomChanged={(kMap) => {
            setLevel(kMap.getLevel());
          }}
        >
          {visibleMarkers.map((m) => (
            <SpotThumbOverlay
              key={m.id}
              marker={m}
              blob={photosByMarker[m.id]}
              onOpen={() => openSheet(m)}
            />
          ))}
          {places.map((p, i) => {
            const lat = Number(p.y);
            const lng = Number(p.x);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return (
              <MapMarker
                key={`s-${p.id ?? p.x}-${p.y}-${i}`}
                position={{ lat, lng }}
              />
            );
          })}
          {gpsMePosition ? (
            <UserMePinOverlay
              lat={gpsMePosition.lat}
              lng={gpsMePosition.lng}
            />
          ) : null}
        </Map>

        <div className="absolute right-3 top-3 z-[1002]">
          <button
            type="button"
            className="flex min-h-[44px] items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-800 shadow-lg backdrop-blur-sm active:bg-slate-50 sm:text-sm"
            onClick={() => setNewSpotOpen(true)}
          >
            <span aria-hidden className="text-base leading-none">
              📷
            </span>
            new
          </button>
        </div>

        <button
          type="button"
          aria-label="내 위치로 이동"
          title="내 위치로 이동"
          onClick={recenterOnMyLocation}
          className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-[1002] flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-800 shadow-lg backdrop-blur-sm active:scale-95 active:bg-slate-50"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0"
            aria-hidden
          >
            <circle
              cx="12"
              cy="12"
              r="3"
              stroke="currentColor"
              strokeWidth="1.75"
            />
            <path
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              d="M12 4v2M12 18v2M4 12h2M18 12h2"
            />
            <path
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.45"
              d="M12 2v1M12 21v1M2 12h1M21 12h1"
            />
          </svg>
        </button>

        {loading && !loadError && (
          <div
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-white/80 px-4 text-center text-sm font-medium text-slate-600 backdrop-blur-[2px]"
            aria-live="polite"
          >
            Loading map…
          </div>
        )}

        {!loading && (loadError || status) && (
          <div
            className={`pointer-events-none absolute bottom-4 left-3 right-3 z-[15] mx-auto max-w-md rounded-full border px-3 py-2 text-center text-xs shadow-sm backdrop-blur-md sm:left-1/2 sm:right-auto sm:w-max sm:-translate-x-1/2 ${
              loadError || statusError
                ? "border-red-200 bg-red-50/95 text-red-800"
                : "border-slate-200/90 bg-white/90 text-slate-700"
            }`}
            aria-live="polite"
          >
            {loadError ? describeKakaoMapLoadError(loadError) : status}
          </div>
        )}
      </div>

      <MarkerBottomSheet
        marker={selectedMarker}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSelectedMarker(null);
        }}
        onOpenCamera={() => setCameraOpen(true)}
        onDeleteMarker={async (id) => {
          await removeMarker(id);
          await refreshPins();
        }}
        refreshKey={photoEpoch}
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onSave={onSavePhoto}
      />

      <NewSpotModal
        open={newSpotOpen}
        onClose={() => setNewSpotOpen(false)}
        onSave={onSaveNewSpot}
        devFallbackSearchCenter={newSpotDevFallbackCenter}
      />
    </div>
  );
}
