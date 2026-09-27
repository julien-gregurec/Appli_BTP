"use client";

import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage } from "@elsatia/releve-domain";
import styles from "./photos.module.css";

/**
 * Aperçu caméra en direct (`getUserMedia`, caméra arrière préférée). Produit une image JPEG
 * pleine définition ; la compression et les métadonnées sont appliquées ensuite, comme pour
 * un import. Le flux est coupé dès la capture ou la fermeture (voyant caméra éteint).
 * Aucune mesure, aucune AR : une photo, rien de plus.
 */
export function CameraCapture({ onCapture, onClose }: { onCapture(blob: Blob, capturedAt: string): void; onClose(): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false })
      .then((media) => {
        if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
        stream.current = media;
        if (video.current) { video.current.srcObject = media; void video.current.play().catch(() => undefined); }
      })
      .catch((reason: unknown) => { if (!cancelled) setError(cameraErrorMessage((reason as { name?: string })?.name)); });
    return () => { cancelled = true; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
  }, []);

  function capture() {
    const element = video.current;
    if (!element || !element.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    canvas.getContext("2d")?.drawImage(element, 0, 0);
    const capturedAt = new Date().toISOString();
    canvas.toBlob((blob) => {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (blob) onCapture(blob, capturedAt); else setError("Capture impossible.");
    }, "image/jpeg", 0.95);
  }

  return <div className={styles.cameraBackdrop} role="dialog" aria-modal="true" aria-label="Caméra">
    <div className={styles.camera}>
      {error ? <p className={styles.alert} role="alert">{error}</p>
        : <video ref={video} className={styles.cameraVideo} playsInline muted onLoadedMetadata={() => setReady(true)} aria-label="Aperçu de la caméra" />}
      <div className={styles.cameraActions}>
        <button type="button" className={styles.ghost} onClick={onClose}>Fermer</button>
        {!error && <button type="button" className={styles.shutter} onClick={capture} disabled={!ready} aria-label="Capturer la photo">Capturer</button>}
      </div>
    </div>
  </div>;
}
