import { useEffect, useRef, type RefObject } from "react";

type LatLng = { lat: number; lng: number };

/** react-kakao-maps-sdk 기본 지도 div id 접두 (constants.SIGNATURE + "_Map") */
const KAKAO_MAP_DIV_SELECTOR = '[id^="__react-kakao-maps-sdk__"][id$="_Map"]';

function resolveMapTouchElement(
  map: kakao.maps.Map,
  wrapperRef?: RefObject<HTMLElement | null>,
): HTMLElement | null {
  if (wrapperRef?.current) {
    const first = wrapperRef.current.firstElementChild;
    if (first instanceof HTMLElement) return first;
  }
  const legacy = map as unknown as { getContainer?: () => HTMLElement };
  if (typeof legacy.getContainer === "function") {
    try {
      const el = legacy.getContainer();
      if (el instanceof HTMLElement) return el;
    } catch {
      /* Kakao Web Map에는 getContainer 없음 */
    }
  }
  return document.querySelector<HTMLElement>(KAKAO_MAP_DIV_SELECTOR);
}

/**
 * 지도 컨테이너에서 롱프레스 시 해당 좌표로 콜백.
 * 짧은 드래그(지도 이동)는 취소한다.
 */
export function useMapLongPress(
  map: kakao.maps.Map | null,
  onLongPress: (ll: LatLng) => void,
  options?: {
    durationMs?: number;
    moveThresholdPx?: number;
    /** Map을 감싼 래퍼 — 첫 번째 자식이 SDK가 만든 지도 div여야 함 */
    mapWrapperRef?: RefObject<HTMLElement | null>;
  },
) {
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const duration = options?.durationMs ?? 550;
  const moveThreshold = options?.moveThresholdPx ?? 12;
  const mapWrapperRef = options?.mapWrapperRef;

  useEffect(() => {
    if (!map) return;
    const container = resolveMapTouchElement(map, mapWrapperRef);
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const fire = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const proj = map.getProjection();
      const latlng = proj.coordsFromContainerPoint(new kakao.maps.Point(x, y));
      onLongPressRef.current({ lat: latlng.getLat(), lng: latlng.getLng() });
    };

    const onStart = (clientX: number, clientY: number) => {
      clear();
      startX = clientX;
      startY = clientY;
      timer = setTimeout(() => {
        timer = null;
        fire(clientX, clientY);
      }, duration);
    };

    const onMoveTouch = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !timer) return;
      const t = e.touches[0];
      if (
        Math.hypot(t.clientX - startX, t.clientY - startY) > moveThreshold
      ) {
        clear();
      }
    };

    const onMoveMouse = (e: MouseEvent) => {
      if (!timer) return;
      if (
        Math.hypot(e.clientX - startX, e.clientY - startY) > moveThreshold
      ) {
        clear();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
    };

    const onEnd = () => clear();

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onMoveTouch, { passive: true });
    container.addEventListener("touchend", onEnd);
    container.addEventListener("touchcancel", onEnd);
    container.addEventListener("mousedown", onMouseDown);
    container.addEventListener("mousemove", onMoveMouse);
    container.addEventListener("mouseup", onEnd);
    container.addEventListener("mouseleave", onEnd);

    return () => {
      clear();
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onMoveTouch);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", onEnd);
      container.removeEventListener("mousedown", onMouseDown);
      container.removeEventListener("mousemove", onMoveMouse);
      container.removeEventListener("mouseup", onEnd);
      container.removeEventListener("mouseleave", onEnd);
    };
  }, [map, duration, moveThreshold, mapWrapperRef]);
}
