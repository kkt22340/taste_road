import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => void;
};

/**
 * PRD: 갤러리·파일 선택 없음 — 카메라(getUserMedia)만 사용.
 */
export function CameraModal({ open, onClose, onSave }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      stopStream();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "카메라를 열 수 없습니다. HTTPS·권한을 확인하세요.",
        );
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        stopStream();
        if (videoRef.current) videoRef.current.srcObject = null;
      },
      "image/jpeg",
      0.88,
    );
  }, [stopStream]);

  const retake = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "카메라를 다시 열 수 없습니다.",
        );
      }
    })();
  }, [previewUrl]);

  const confirm = useCallback(async () => {
    if (!previewUrl) return;
    const res = await fetch(previewUrl);
    const blob = await res.blob();
    onSave(blob);
    onClose();
  }, [previewUrl, onSave, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="카메라로 촬영"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="w-full max-w-[420px] overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm text-slate-800">
          <span className="font-semibold">카메라로 남기기</span>
          <button
            type="button"
            className="min-h-[44px] min-w-[44px] text-slate-500"
            onClick={onClose}
          >
            닫기
          </button>
        </header>
        {error ? (
          <p className="px-4 pb-4 text-sm text-red-600">{error}</p>
        ) : (
          <>
            <div className="relative aspect-[3/4] bg-black">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="미리보기"
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex flex-wrap justify-center gap-2 border-t border-slate-100 bg-slate-50/80 p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {previewUrl ? (
                <>
                  <button
                    type="button"
                    className="min-h-[48px] min-w-[120px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm active:bg-slate-50"
                    onClick={retake}
                  >
                    다시 찍기
                  </button>
                  <button
                    type="button"
                    className="min-h-[48px] min-w-[120px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 text-sm font-semibold text-amber-950 shadow-sm active:from-amber-500 active:to-amber-600"
                    onClick={confirm}
                  >
                    이 사진으로 저장
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="min-h-[48px] w-full max-w-xs rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 px-4 text-sm font-semibold text-amber-950 shadow-sm active:from-amber-500 active:to-amber-600 sm:w-auto"
                  onClick={capture}
                >
                  촬영
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
