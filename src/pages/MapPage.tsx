import { Map, MapMarker, useKakaoLoader } from "react-kakao-maps-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMapLongPress } from "../hooks/useMapLongPress";
import {
  loadMarkers,
  saveMarker,
  savePhoto,
  removeMarker,
} from "../lib/db";
import type { VisitMarker } from "../types/domain";
import { CameraModal } from "../components/CameraModal";
import { MarkerBottomSheet } from "../components/MarkerBottomSheet";
import { describeKakaoMapLoadError } from "../lib/mapErrors";

const DEFAULT = { lat: 37.5665, lng: 126.978 };

type LocalDocument = {
  id?: string;
  place_name: string;
  x: string;
  y: string;
};

type MapPageProps = { appkey: string };

export function MapPage({ appkey }: MapPageProps) {
  const [loading, loadError] = useKakaoLoader({
    appkey,
    libraries: [],
  });

  const [keyword, setKeyword] = useState("");
  const [places, setPlaces] = useState<LocalDocument[]>([]);
  const [status, setStatus] = useState("");
  const [center, setCenter] = useState(DEFAULT);
  const [level, setLevel] = useState(5);
  const [map, setMap] = useState<kakao.maps.Map | null>(null);

  const [visitMarkers, setVisitMarkers] = useState<VisitMarker[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<VisitMarker | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoEpoch, setPhotoEpoch] = useState(0);
  const mapTouchWrapRef = useRef<HTMLDivElement>(null);

  const refreshVisitMarkers = useCallback(() => {
    loadMarkers().then(setVisitMarkers);
  }, []);

  useEffect(() => {
    refreshVisitMarkers();
  }, [refreshVisitMarkers]);

  const searchCenter = useCallback(() => {
    if (map) {
      const c = map.getCenter();
      return { lat: c.getLat(), lng: c.getLng() };
    }
    return center;
  }, [map, center]);

  const runSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const q = keyword.trim();
      if (!q) return;

      const { lat, lng } = searchCenter();
      setStatus("검색 중…");

      const params = new URLSearchParams({
        query: q,
        x: String(lng),
        y: String(lat),
        radius: "15000",
        size: "15",
      });

      try {
        const res = await fetch(
          `/kakao-dapi/v2/local/search/keyword.json?${params}`,
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { documents?: LocalDocument[] };
        const docs = data.documents ?? [];
        setPlaces(docs);
        setStatus(docs.length ? `${docs.length}곳` : "결과 없음");

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
    [keyword, searchCenter],
  );

  const selectPlace = useCallback((doc: LocalDocument) => {
    const plat = Number(doc.y);
    const plng = Number(doc.x);
    if (Number.isFinite(plat) && Number.isFinite(plng)) {
      setCenter({ lat: plat, lng: plng });
      setLevel(4);
    }
  }, []);

  const onLongPressMap = useCallback(
    async (ll: { lat: number; lng: number }) => {
      const title = window.prompt(
        "이 장소 이름(식당명)을 적어주세요",
        `방문 ${new Date().toLocaleDateString("ko-KR")}`,
      );
      if (title === null) return;

      const m: VisitMarker = {
        id: crypto.randomUUID(),
        lat: ll.lat,
        lng: ll.lng,
        title: title.trim() || "이름 없음",
        createdAt: Date.now(),
      };
      await saveMarker(m);
      refreshVisitMarkers();
      setSelectedMarker(m);
      setSheetOpen(true);
      setStatus("방문 마커를 추가했어요.");
    },
    [refreshVisitMarkers],
  );

  useMapLongPress(map, onLongPressMap, { mapWrapperRef: mapTouchWrapRef });

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

  const openSheet = useCallback((m: VisitMarker) => {
    setSelectedMarker(m);
    setSheetOpen(true);
  }, []);

  const statusError =
    !!loadError ||
    status.includes("HTTP") ||
    status.includes("실패");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* 지도를 먼저 두면 fixed 패널이 flex 높이 계산을 가로막지 않음 (0px 지도 방지) */}
      <div
        ref={mapTouchWrapRef}
        className="relative z-0 min-h-[50dvh] w-full flex-1"
      >
        {/* Map을 첫 자식으로 두어 롱프레스 훅이 지도 div를 firstElementChild로 찾을 수 있게 함 */}
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
          {visitMarkers.map((m) => (
            <MapMarker
              key={m.id}
              position={{ lat: m.lat, lng: m.lng }}
              title={m.title}
              onClick={() => openSheet(m)}
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
        </Map>
        {loading && !loadError && (
          <div
            className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-white/80 px-4 text-center text-sm font-medium text-slate-600 backdrop-blur-[2px]"
            aria-live="polite"
          >
            지도를 불러오는 중…
          </div>
        )}
      </div>

      {/* 모바일: 하단 시트형 패널 / sm~: 좌상단 플로팅 */}
      <aside
        className="fixed inset-x-0 bottom-0 z-[1000] flex max-h-[min(48vh,24rem)] flex-col overflow-hidden rounded-t-2xl border border-slate-200/90 bg-white/85 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[min(85vh,32rem)] sm:w-[min(20rem,calc(100vw-1.5rem))] sm:rounded-2xl sm:p-3 sm:pb-3 sm:shadow-lg sm:shadow-slate-900/5"
      >
        <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
          Taste Road
        </h1>
        <p className="mt-0.5 text-[0.7rem] leading-snug text-slate-600 sm:text-xs">
          지도를 길게 눌러 방문 마커 · 키워드 검색
        </p>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={runSearch}
        >
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="키워드 (예: 한식, 카페)"
            autoComplete="off"
            className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-3 text-sm font-semibold text-amber-950 shadow-sm active:from-amber-500 active:to-amber-600"
          >
            검색
          </button>
        </form>
        <p
          className={`mt-2 text-[0.72rem] leading-snug sm:text-xs ${
            statusError ? "text-red-600" : "text-slate-600"
          }`}
        >
          {loadError
            ? describeKakaoMapLoadError(loadError)
            : loading
              ? "지도 SDK 로딩…"
              : status || "지도를 길게 눌러 내 방문을 남겨보세요."}
        </p>
        <p className="mt-1 text-[0.65rem] text-slate-500">
          갤러리 업로드 없음 — 카메라 촬영만
        </p>
        <ul className="mt-2 max-h-[min(30vh,12rem)] list-none space-y-0 overflow-y-auto text-sm sm:max-h-48">
          {places.map((p, i) => (
            <li key={p.id ?? `${p.x}-${p.y}-${i}`}>
              <button
                type="button"
                className="min-h-[44px] w-full rounded-lg py-2 text-left text-slate-800 active:bg-sky-50 sm:min-h-0 sm:py-1.5"
                onClick={() => selectPlace(p)}
              >
                {p.place_name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

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
          refreshVisitMarkers();
        }}
        refreshKey={photoEpoch}
      />

      <CameraModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onSave={onSavePhoto}
      />
    </div>
  );
}
