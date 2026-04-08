import { useEffect, useState } from "react";

export function PhotoThumb({
  blob,
  src,
  className,
}: {
  blob?: Blob;
  /** 원격 이미지 URL (피드 Supabase 등). `src`가 있으면 우선 사용 */
  src?: string;
  className?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setBlobUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setBlobUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const url = src?.trim() || blobUrl;
  if (!url) return <div className={className} style={{ background: "#222" }} />;
  return <img src={url} alt="" className={className} />;
}
