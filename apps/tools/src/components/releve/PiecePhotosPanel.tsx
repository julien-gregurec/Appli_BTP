"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ReleveMediaService, selectGallery, type PhotoEntry, type ReleveActorContext, type ReleveId } from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { photosHref } from "@/lib/releve/navigation";
import { SupabaseReleveMediaRepository } from "@/lib/releve/supabase-media-repository";
import { SupabaseReleveRepository } from "@/lib/releve/supabase-repository";
import styles from "./photos.module.css";
import releveStyles from "./releve.module.css";

const APERCU = 6;

/**
 * Fiche pièce (Lot 3) → photos (Lot 4) : bouton clair « Ajouter une photo », aperçu des
 * dernières photos de la pièce (miniatures signées en une requête), accès à sa galerie.
 */
export function PiecePhotosPanel({ releveId, pieceId, actor, canEdit }: { releveId: ReleveId; pieceId: string; actor: ReleveActorContext; canEdit: boolean }) {
  const client = getElsatiaClient();
  const service = useMemo(() => new ReleveMediaService(new SupabaseReleveMediaRepository(client), new SupabaseReleveRepository(client), actor), [client, actor]);
  const [photos, setPhotos] = useState<PhotoEntry[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    service.library(releveId).then(async (library) => {
      const inPiece = selectGallery(library.photos, library.structure, library.elements, { kind: "piece", id: pieceId });
      if (cancelled) return;
      setPhotos(inPiece);
      const signed = await service.thumbnailUrls(library.structure.releve, inPiece.slice(0, APERCU).map((photo) => photo.media)).catch(() => ({}));
      if (!cancelled) setUrls(signed);
    }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Photos indisponibles."); });
    return () => { cancelled = true; };
  }, [service, releveId, pieceId]);

  const scope = { kind: "piece" as const, id: pieceId };
  return <section className={`${releveStyles.column} ${styles.piecePhotos}`} aria-label="Photos de la pièce">
    <h2>Photos {photos ? `(${photos.length})` : ""}</h2>
    {canEdit && <Link className={styles.primary} href={photosHref(releveId, { scope, ajout: true })} data-testid="piece-add-photo"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Ajouter une photo</Link>}
    {error && <p className={styles.alert}>{error}</p>}
    {photos && photos.length === 0 && <p className={styles.muted}>Aucune photo pour cette pièce.</p>}
    {photos && photos.length > 0 && <ul className={styles.grid}>{photos.slice(0, APERCU).map((photo) => <li key={photo.media.id}>
      <Link className={styles.thumb} href={photosHref(releveId, { scope })}>
        {urls[photo.media.id]
          // eslint-disable-next-line @next/next/no-img-element -- miniature signée d'un bucket privé.
          ? <img src={urls[photo.media.id]} alt={photo.media.commentaire || "Photo de la pièce"} loading="lazy" decoding="async" width={120} height={90} />
          : <span className={styles.placeholder}>…</span>}
      </Link>
    </li>)}</ul>}
    {photos && photos.length > 0 && <Link className={styles.secondary} href={photosHref(releveId, { scope })}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>Voir les photos de la pièce</Link>}
  </section>;
}
