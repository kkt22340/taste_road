import { useEffect, useState } from "react";

export function PhotoThumb({ blob, className }: { blob: Blob; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) return <div className={className} style={{ background: "#222" }} />;
  return <img src={url} alt="" className={className} />;
}
