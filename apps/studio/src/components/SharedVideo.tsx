"use client";
import { useRef, useState } from "react";
export default function SharedVideo({
  token,
  initialUrl,
  title,
}: {
  token: string;
  initialUrl: string;
  title: string;
}) {
  const [url, setUrl] = useState(initialUrl),
    [unavailable, setUnavailable] = useState(false),
    renewals = useRef(0);
  // The signed URL lasts one minute: ask for a new one (at most 3 times) when playback fails.
  async function renew() {
    if (renewals.current >= 3) return;
    renewals.current++;
    const r = await fetch(`/s/${token}/media`, { cache: "no-store" });
    if (!r.ok) return setUnavailable(true);
    setUrl((await r.json()).url);
  }
  if (unavailable) return <p role="alert">Ce lien n’est plus disponible.</p>;
  return (
    <video
      src={url}
      controls
      playsInline
      preload="metadata"
      aria-label={`Vidéo ${title}`}
      onError={() => void renew()}
      style={{ maxWidth: "100%" }}
    />
  );
}
