import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchNearbyFoodPlaces,
  placeDistanceMeters,
  type KakaoFoodPlaceDoc,
} from "../lib/kakaoNearbyFood";
import {
  getBestEffortPosition,
  isGeolocationSecureContext,
} from "../lib/geolocation";
import { effectiveCheckinLimitM } from "../lib/venueCheckin";

const MAX_PHOTOS = 5;
/** 카카오 카테고리 검색 반경(m) — 이 앱에서만 사용하는 문구와 맞출 값 */
const NEARBY_SEARCH_RADIUS_M = 850;
const MAX_CHECKIN_BOOST_STEPS = 3;

export type CapturedPhoto = {
  id: string;
  blob: Blob;
  url: string;
};

export type NewSpotPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  category?: string;
  address?: string;
};

export type NewSpotPayload = {
  place: NewSpotPlace;
  blobs: Blob[];
  note: string;
  /** true = 나만 보기 */
  privateOnly: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (p: NewSpotPayload) => void | Promise<void>;
  /**
   * `import.meta.env.DEV`에서만 사용: Geolocation 실패 시 이 좌표로 주변 식당 검색.
   * (실제 좌표가 아니어도 로컬에서 목록·플로우를 테스트하기 위함)
   */
  devFallbackSearchCenter?: { lat: number; lng: number };
};

type Step = "place" | "photos" | "details";

type GeoStatus = "idle" | "loading" | "ok" | "denied" | "unavailable";

function docToPlace(doc: KakaoFoodPlaceDoc): NewSpotPlace {
  return {
    id: doc.id,
    name: doc.place_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
    distanceM: placeDistanceMeters(doc),
    category: doc.category_name,
    address: doc.road_address_name || doc.address_name,
  };
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

/**
 * 최대 5장 촬영 · 메모 · 비공개 — iOS 느낌의 시트 UI
 */
export function NewSpotModal({
  open,
  onClose,
  onSave,
  devFallbackSearchCenter,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const devFallbackRef = useRef(devFallbackSearchCenter);
  devFallbackRef.current = devFallbackSearchCenter;
  /** 스트림을 얻은 뒤 video 엘리먼트에 붙이기 위한 틱 */
  const [streamEpoch, setStreamEpoch] = useState(0);

  const [step, setStep] = useState<Step>("place");
  const [placeReload, setPlaceReload] = useState(0);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [places, setPlaces] = useState<KakaoFoodPlaceDoc[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  /** Geolocation coords.accuracy (m). 지도 폴백 등은 null */
  const [locationAccuracyM, setLocationAccuracyM] = useState<number | null>(
    null,
  );
  const [checkinBoostLevel, setCheckinBoostLevel] = useState(0);
  const [selectedPlaceDoc, setSelectedPlaceDoc] =
    useState<KakaoFoodPlaceDoc | null>(null);

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [privateOnly, setPrivateOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const switchId = useId();
  const privateLabelId = useId();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopStream();
    setCameraReady(false);
    setError(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      streamRef.current = stream;
      setStreamEpoch((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Camera unavailable. Check permissions and HTTPS.",
      );
    }
  }, [stopStream]);

  /** video는 cameraReady 전에도 DOM에 있어야 ref에 스트림을 붙일 수 있음 */
  useLayoutEffect(() => {
    if (!open || step !== "photos") return;
    const stream = streamRef.current;
    const el = videoRef.current;
    if (!stream || !el) return;
    el.srcObject = stream;
    void el
      .play()
      .then(() => setCameraReady(true))
      .catch(() => {
        setCameraReady(false);
        setError("Could not start camera preview.");
      });
  }, [open, step, streamEpoch]);

  const revokeAllPhotos = useCallback((list: CapturedPhoto[]) => {
    list.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const checkinLimitM = useMemo(
    () => effectiveCheckinLimitM(locationAccuracyM, checkinBoostLevel),
    [locationAccuracyM, checkinBoostLevel],
  );

  const nextCheckinLimitM = useMemo(
    () => effectiveCheckinLimitM(locationAccuracyM, checkinBoostLevel + 1),
    [locationAccuracyM, checkinBoostLevel],
  );

  const placesInRadius = useMemo(
    () => places.filter((d) => placeDistanceMeters(d) <= checkinLimitM),
    [places, checkinLimitM],
  );

  useEffect(() => {
    if (!selectedPlaceDoc) return;
    if (placeDistanceMeters(selectedPlaceDoc) > checkinLimitM) {
      setSelectedPlaceDoc(null);
    }
  }, [checkinLimitM, selectedPlaceDoc]);

  /** API는 결과를 주는데 체크인 반경만 좁아 목록이 비는 경우 자동으로 반경 확대 */
  useEffect(() => {
    if (!open || step !== "place") return;
    if (geoStatus !== "ok" || placesLoading || placesError) return;
    if (places.length === 0) return;
    if (placesInRadius.length > 0) return;
    if (checkinBoostLevel >= MAX_CHECKIN_BOOST_STEPS) return;
    setCheckinBoostLevel((b) =>
      Math.min(MAX_CHECKIN_BOOST_STEPS, b + 1),
    );
  }, [
    open,
    step,
    geoStatus,
    placesLoading,
    placesError,
    places.length,
    placesInRadius.length,
    checkinBoostLevel,
  ]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPlaceReload(0);
      return;
    }
    setStep("place");
    setGeoStatus("idle");
    setPlaces([]);
    setPlacesError(null);
    setLocationAccuracyM(null);
    setCheckinBoostLevel(0);
    setSelectedPlaceDoc(null);
    setPhotos((prev) => {
      revokeAllPhotos(prev);
      return [];
    });
    setSelectedId(null);
    setNote("");
    setPrivateOnly(true);
    setError(null);
    setSaving(false);
    setCapturing(false);
    return () => {
      stopStream();
    };
  }, [open, stopStream, revokeAllPhotos]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGeoStatus("loading");
    setPlacesError(null);
    setPlaces([]);
    setSelectedPlaceDoc(null);
    setPlacesLoading(false);

    void (async () => {
      const loadPlacesAt = async (
        lat: number,
        lng: number,
        accuracyM: number | null = null,
      ) => {
        if (!cancelled) setLocationAccuracyM(accuracyM);
        setGeoStatus("ok");
        setPlacesLoading(true);
        try {
          const docs = await fetchNearbyFoodPlaces(lng, lat, {
            radius: NEARBY_SEARCH_RADIUS_M,
            limit: 15,
          });
          if (!cancelled) setPlaces(docs);
        } catch (err) {
          if (!cancelled) {
            setPlacesError(
              err instanceof Error
                ? err.message
                : "주변 식당을 불러오지 못했어요.",
            );
            setGeoStatus("ok");
          }
        } finally {
          if (!cancelled) setPlacesLoading(false);
        }
      };

      const fb = devFallbackRef.current;
      const canDevFallback =
        import.meta.env.DEV &&
        fb != null &&
        Number.isFinite(fb.lat) &&
        Number.isFinite(fb.lng);

      try {
        if (!isGeolocationSecureContext()) {
          if (!cancelled) {
            if (canDevFallback) {
              await loadPlacesAt(fb.lat, fb.lng, null);
              return;
            }
            setGeoStatus("ok");
            setPlacesError("위치를 사용할 수 없어요.");
          }
          return;
        }
        if (!navigator.geolocation) {
          if (!cancelled) {
            if (canDevFallback) {
              await loadPlacesAt(fb.lat, fb.lng, null);
            } else {
              setGeoStatus("unavailable");
            }
          }
          return;
        }

        let lat: number;
        let lng: number;
        let accuracyFromGps: number | null = null;
        try {
          const pos = await getBestEffortPosition();
          if (cancelled) return;
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracyFromGps = pos.coords.accuracy ?? null;
          await loadPlacesAt(lat, lng, accuracyFromGps);
          return;
        } catch (e) {
          if (cancelled) return;
          if (
            e &&
            typeof e === "object" &&
            "code" in e &&
            (e as GeolocationPositionError).code === 1
          ) {
            setGeoStatus("denied");
            return;
          }
          if (canDevFallback) {
            await loadPlacesAt(fb.lat, fb.lng, null);
            return;
          }
          setGeoStatus("unavailable");
          return;
        }
      } catch (e) {
        if (cancelled) return;
        setPlacesError(
          e instanceof Error ? e.message : "주변 식당을 불러오지 못했어요.",
        );
        setGeoStatus("ok");
        if (!cancelled) setPlacesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, placeReload]);

  useEffect(() => {
    if (!open || step !== "photos") return;
    void startCamera();
    return () => {
      stopStream();
    };
  }, [open, step, startCamera, stopStream]);

  useEffect(() => {
    if (open) return;
    setPhotos((prev) => {
      revokeAllPhotos(prev);
      return [];
    });
  }, [open, revokeAllPhotos]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady || capturing) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    setCapturing(true);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) return;
        setPhotos((prev) => {
          if (prev.length >= MAX_PHOTOS) return prev;
          const url = URL.createObjectURL(blob);
          const id = crypto.randomUUID();
          const next = [...prev, { id, blob, url }];
          setSelectedId(id);
          stopStream();
          if (videoRef.current) videoRef.current.srcObject = null;
          if (next.length < MAX_PHOTOS) {
            queueMicrotask(() => void startCamera());
          }
          return next;
        });
      },
      "image/jpeg",
      0.88,
    );
  }, [cameraReady, capturing, stopStream, startCamera]);

  const removePhoto = useCallback(
    (id: string) => {
      setPhotos((prev) => {
        const t = prev.find((p) => p.id === id);
        if (t) URL.revokeObjectURL(t.url);
        const next = prev.filter((p) => p.id !== id);
        setSelectedId((s) => (s === id ? next[next.length - 1]?.id ?? null : s));
        if (next.length < MAX_PHOTOS) {
          queueMicrotask(() => void startCamera());
        }
        return next;
      });
    },
    [startCamera],
  );

  const goPhotosFromPlace = useCallback(() => {
    if (!selectedPlaceDoc) return;
    if (placeDistanceMeters(selectedPlaceDoc) > checkinLimitM) return;
    setStep("photos");
  }, [selectedPlaceDoc, checkinLimitM]);

  const changeVenue = useCallback(() => {
    if (photos.length > 0) {
      const ok = window.confirm(
        "찍은 사진이 모두 삭제됩니다. 다른 식당을 고를까요?",
      );
      if (!ok) return;
    }
    setPhotos((prev) => {
      revokeAllPhotos(prev);
      return [];
    });
    setSelectedId(null);
    setSelectedPlaceDoc(null);
    setStep("place");
    stopStream();
  }, [photos.length, revokeAllPhotos, stopStream]);

  const retryPlaceLoad = useCallback(() => {
    setPlaceReload((n) => n + 1);
  }, []);

  const goDetails = useCallback(() => {
    if (photos.length === 0) return;
    stopStream();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStep("details");
  }, [photos.length, stopStream]);

  const backToPhotos = useCallback(() => {
    setStep("photos");
    if (photos.length < MAX_PHOTOS) void startCamera();
  }, [photos.length, startCamera]);

  const confirm = useCallback(async () => {
    if (photos.length === 0 || !selectedPlaceDoc) return;
    setSaving(true);
    try {
      await Promise.resolve(
        onSave({
          place: docToPlace(selectedPlaceDoc),
          blobs: photos.map((p) => p.blob),
          note: note.trim(),
          privateOnly,
        }),
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }, [photos, selectedPlaceDoc, note, privateOnly, onSave, onClose]);

  if (!open) return null;

  const canAddMore = photos.length < MAX_PHOTOS;

  const checkinDistanceM =
    selectedPlaceDoc != null ? placeDistanceMeters(selectedPlaceDoc) : null;
  const canProceedFromPlace =
    selectedPlaceDoc != null &&
    checkinDistanceM != null &&
    checkinDistanceM <= checkinLimitM;

  const canWidenCheckin =
    checkinBoostLevel < MAX_CHECKIN_BOOST_STEPS &&
    nextCheckinLimitM > checkinLimitM;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-spot-title"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-t-[20px] bg-[#f2f2f7] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] sm:max-h-[min(90dvh,760px)] sm:rounded-[20px] sm:shadow-2xl sm:shadow-black/20"
        style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden>
          <div className="h-1 w-9 rounded-full bg-black/[0.12]" />
        </div>

        <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-3 pb-2 pt-1">
          <button
            type="button"
            className="min-h-[44px] justify-self-start rounded-lg px-1 text-[17px] font-normal text-[#007aff] active:opacity-50"
            onClick={onClose}
          >
            취소
          </button>
          <h2
            id="new-spot-title"
            className="text-center text-[17px] font-semibold tracking-[-0.02em] text-black"
          >
            {step === "place"
              ? "주변 식당"
              : step === "photos"
                ? "사진 스토리"
                : "내용 작성"}
          </h2>
          {step === "photos" ? (
            <button
              type="button"
              disabled={photos.length === 0}
              className="min-h-[44px] justify-self-end rounded-lg px-1 text-[17px] font-semibold text-[#007aff] disabled:text-[#c7c7cc] disabled:opacity-90"
              onClick={goDetails}
            >
              다음
            </button>
          ) : (
            <span className="min-h-[44px] min-w-[56px] justify-self-end" aria-hidden />
          )}
        </header>

        {error && step === "photos" ? (
          <p className="mx-4 mb-4 rounded-2xl bg-white px-4 py-3 text-[15px] leading-snug text-[#ff3b30] shadow-sm">
            {error}
          </p>
        ) : null}

        {step === "place" ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {geoStatus === "loading" && !placesError ? (
              <p className="rounded-2xl bg-white px-4 py-4 text-center text-[15px] text-[#3c3c4399] shadow-sm">
                불러오는 중…
              </p>
            ) : null}

            {geoStatus === "denied" ? (
              <div className="space-y-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-[15px] leading-snug text-[#ff3b30]">
                  위치를 허용해 주세요.
                </p>
                <button
                  type="button"
                  onClick={retryPlaceLoad}
                  className="w-full rounded-[12px] bg-[#007aff] py-3 text-[16px] font-semibold text-white active:bg-[#0066d6]"
                >
                  다시 시도
                </button>
              </div>
            ) : null}

            {geoStatus === "unavailable" ? (
              <div className="space-y-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-[15px] leading-snug text-[#3c3c4399]">
                  위치를 확인할 수 없어요.
                </p>
                <button
                  type="button"
                  onClick={retryPlaceLoad}
                  className="w-full rounded-[12px] bg-[#007aff] py-3 text-[16px] font-semibold text-white active:bg-[#0066d6]"
                >
                  다시 시도
                </button>
              </div>
            ) : null}

            {placesError ? (
              <div className="space-y-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-[15px] leading-snug text-[#ff3b30]">
                  {placesError}
                </p>
                <button
                  type="button"
                  onClick={retryPlaceLoad}
                  className="w-full rounded-[12px] bg-[#007aff] py-3 text-[16px] font-semibold text-white active:bg-[#0066d6]"
                >
                  다시 불러오기
                </button>
              </div>
            ) : null}

            {geoStatus === "ok" && !placesError && !placesLoading ? (
              places.length === 0 ? (
                <div className="space-y-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
                  <p className="text-center text-[15px] text-[#3c3c4399]">
                    주변에 식당이 없어요.
                  </p>
                  <button
                    type="button"
                    onClick={retryPlaceLoad}
                    className="w-full rounded-[12px] bg-[#007aff] py-3 text-[16px] font-semibold text-white active:bg-[#0066d6]"
                  >
                    다시 불러오기
                  </button>
                </div>
              ) : placesInRadius.length === 0 ? (
                <div className="space-y-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
                  {canWidenCheckin ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCheckinBoostLevel((n) =>
                          Math.min(MAX_CHECKIN_BOOST_STEPS, n + 1),
                        )
                      }
                      className="w-full rounded-[12px] border border-[#007aff]/40 bg-[#007aff]/08 py-3 text-[16px] font-semibold text-[#007aff] active:bg-[#007aff]/15"
                    >
                      더 보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={retryPlaceLoad}
                      className="w-full rounded-[12px] bg-[#007aff] py-3 text-[16px] font-semibold text-white active:bg-[#0066d6]"
                    >
                      다시 불러오기
                    </button>
                  )}
                </div>
              ) : (
                <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pb-2 [-webkit-overflow-scrolling:touch]">
                  {placesInRadius.map((doc) => {
                    const d = placeDistanceMeters(doc);
                    const selected = selectedPlaceDoc?.id === doc.id;
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedPlaceDoc(doc)}
                          className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3.5 text-left shadow-[0_2px_14px_rgba(0,0,0,0.06)] transition-all active:scale-[0.99] ${
                            selected
                              ? "border-[#007aff] bg-white ring-2 ring-[#007aff]/30"
                              : "border-black/[0.06] bg-white active:bg-[#f8f8f8]"
                          }`}
                        >
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 text-[18px]">
                            🍽
                          </span>
                          <span className="min-w-0 flex-1">
                            <p className="text-[16px] font-semibold tracking-tight text-black">
                              {doc.place_name}
                            </p>
                            <p className="mt-0.5 text-[13px] text-[#3c3c4399]">
                              {doc.category_name}
                              <span className="text-black/25"> · </span>도보{" "}
                              <span className="font-medium text-[#007aff]">
                                약 {Math.round(d)}m
                              </span>
                            </p>
                            {(doc.road_address_name || doc.address_name) ? (
                              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#3c3c4399]">
                                {doc.road_address_name || doc.address_name}
                              </p>
                            ) : null}
                          </span>
                          <span
                            className={`mt-1 shrink-0 text-[15px] font-medium ${
                              selected ? "text-[#007aff]" : "text-[#c7c7cc]"
                            }`}
                            aria-hidden
                          >
                            ›
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}

            {placesLoading && geoStatus === "ok" ? (
              <p className="mt-2 text-center text-[14px] text-[#3c3c4399]">
                불러오는 중…
              </p>
            ) : null}

            <div className="mt-auto border-t border-black/[0.06] pt-4">
              <button
                type="button"
                disabled={!canProceedFromPlace}
                onClick={goPhotosFromPlace}
                className="w-full rounded-[14px] bg-[#007aff] py-4 text-[17px] font-semibold text-white shadow-sm active:bg-[#0066d6] disabled:bg-[#c7c7cc] disabled:text-white/90"
              >
                다음
              </button>
            </div>
          </div>
        ) : step === "photos" ? (
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {selectedPlaceDoc ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-[14px] border border-black/[0.06] bg-white px-3 py-2.5 shadow-sm">
                <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-black">
                  {selectedPlaceDoc.place_name}
                </p>
                <button
                  type="button"
                  onClick={changeVenue}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-[15px] font-normal text-[#007aff] active:opacity-50"
                >
                  바꾸기
                </button>
              </div>
            ) : null}

            <div className="relative overflow-hidden rounded-[20px] bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="relative aspect-[3/4] max-h-[min(52dvh,420px)] w-full min-h-[200px] sm:max-h-[380px]">
                {canAddMore ? (
                  <>
                    <video
                      ref={videoRef}
                      className="relative z-0 h-full min-h-[200px] w-full bg-black object-cover"
                      playsInline
                      muted
                      autoPlay
                    />
                    {!cameraReady ? (
                      <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-[#1c1c1e]">
                        <CameraIcon className="text-white/40" />
                        <span className="text-[13px] text-white/45">
                          카메라를 켜는 중…
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : photos.length > 0 ? (
                  <img
                    src={photos[photos.length - 1].url}
                    alt=""
                    className="h-full w-full object-cover opacity-90"
                  />
                ) : null}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>

            {canAddMore ? (
              <div className="mt-5 flex flex-col items-center pb-1">
                <button
                  type="button"
                  onClick={capture}
                  disabled={capturing || !cameraReady}
                  className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border-[5px] border-[#d1d1d6] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.12)] active:scale-[0.97] disabled:opacity-40"
                  aria-label="촬영"
                >
                  <span className="h-[62px] w-[62px] rounded-full bg-white ring-2 ring-black/[0.06]" />
                </button>
              </div>
            ) : null}

            <div className="mt-3 px-0.5">
              <p className="text-[13px] font-medium text-[#3c3c4399]">
                사진 {photos.length}/{MAX_PHOTOS}
              </p>
            </div>

            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {photos.map((p) => (
                <div key={p.id} className="relative shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`relative h-[72px] w-[72px] overflow-hidden rounded-[12px] bg-white shadow-md ring-2 ring-offset-2 ring-offset-[#f2f2f7] transition-shadow ${
                      selectedId === p.id
                        ? "ring-[#007aff]"
                        : "ring-transparent"
                    }`}
                  >
                    <img
                      src={p.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow backdrop-blur-sm active:bg-black/70"
                    aria-label="Remove photo"
                    onClick={(e) => {
                      e.stopPropagation();
                      removePhoto(p.id);
                    }}
                  >
                    <span className="text-[14px] leading-none">×</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1">
            <button
              type="button"
              onClick={backToPhotos}
              className="self-start text-[15px] font-normal text-[#007aff] active:opacity-50"
            >
              ← 사진 더 추가
            </button>

            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-[10px] object-cover shadow-sm ring-1 ring-black/5"
                />
              ))}
            </div>

            <div>
              <label
                htmlFor="spot-note"
                className="mb-1.5 block text-[13px] font-medium text-[#3c3c4399]"
              >
                내용
              </label>
              <div className="rounded-[14px] bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <textarea
                  id="spot-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={5}
                  maxLength={500}
                  placeholder="맛·분위기·추천 메뉴 등을 적어 보세요"
                  className="w-full resize-none rounded-[12px] bg-transparent px-3 py-3 text-[17px] leading-relaxed text-black placeholder:text-[#c7c7cc] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <p
                className="mb-2 text-[13px] font-medium text-[#3c3c4399]"
                id={privateLabelId}
              >
                누가 볼 수 있나요?
              </p>
              <div
                className="flex rounded-[12px] bg-[#e9e9ea] p-1"
                role="group"
                aria-labelledby={privateLabelId}
              >
                <button
                  type="button"
                  id={switchId}
                  aria-pressed={privateOnly}
                  onClick={() => setPrivateOnly(true)}
                  className={`min-h-[48px] flex-1 rounded-[10px] text-[16px] font-semibold transition-all ${
                    privateOnly
                      ? "bg-white text-black shadow-sm"
                      : "text-[#3c3c4399]"
                  }`}
                >
                  나만 보기
                </button>
                <button
                  type="button"
                  aria-pressed={!privateOnly}
                  onClick={() => setPrivateOnly(false)}
                  className={`min-h-[48px] flex-1 rounded-[10px] text-[16px] font-semibold transition-all ${
                    !privateOnly
                      ? "bg-white text-black shadow-sm"
                      : "text-[#3c3c4399]"
                  }`}
                >
                  공유하기
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={saving || photos.length === 0 || !selectedPlaceDoc}
              onClick={() => void confirm()}
              className="mt-1 w-full rounded-[14px] bg-[#007aff] py-4 text-[17px] font-semibold text-white shadow-sm active:bg-[#0066d6] disabled:bg-[#c7c7cc] disabled:text-white/90"
            >
              {saving ? "올리는 중…" : "게시"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
