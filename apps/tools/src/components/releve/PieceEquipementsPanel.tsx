"use client";

/**
 * Relevé Lot 7 — fiche pièce : équipements présents dans la pièce (compteur réel).
 * Source : les objets du PLAN DE RÉFÉRENCE de l'étage (le plus récent — les plans antérieurs en
 * portent des copies) et les équipements saisis hors plan ; lecture sous RLS.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  EQUIPEMENT_CATEGORIE_LABELS, EQUIPEMENT_ETAT_PROJET_LABELS, countByCategorie, equipementsDeLaPiece, type PlanEquipement,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { planHref } from "@/lib/releve/navigation";
import { SupabasePlanRepository } from "@/lib/releve/plan/supabase-plan-repository";
import { formatLongueurCm } from "@/lib/releve/plan/render";
import styles from "./releve.module.css";

export function PieceEquipementsPanel({ releveId, etageId, pieceId }: { releveId: string; etageId: string; pieceId: string }) {
  const client = getElsatiaClient();
  const repository = useMemo(() => new SupabasePlanRepository(client), [client]);
  const [objets, setObjets] = useState<PlanEquipement[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([repository.listPieceEquipements(pieceId), repository.listPlans(etageId)])
      .then(([rows, plans]) => { if (!cancelled) setObjets(equipementsDeLaPiece(rows, plans, pieceId)); })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Équipements indisponibles."); });
    return () => { cancelled = true; };
  }, [repository, pieceId, etageId]);
  const counts = objets ? countByCategorie(objets) : {};
  return <section className={styles.column} aria-label="Équipements de la pièce" data-testid="piece-equipements">
    <h2>Équipements <span data-testid="piece-equipements-compteur">{objets ? objets.length : "…"}</span></h2>
    {error && <p className={styles.feedback} role="alert">{error}</p>}
    {objets && objets.length === 0 && <p className={styles.feedback}>Aucun équipement dans cette pièce. Ajoutez-en depuis le plan (outil Objet).</p>}
    {objets && objets.length > 0 && <>
      <p className={styles.feedback} data-testid="piece-equipements-groupes">
        {Object.entries(counts).map(([categorie, n]) => `${EQUIPEMENT_CATEGORIE_LABELS[categorie as keyof typeof EQUIPEMENT_CATEGORIE_LABELS]} : ${n}`).join(" · ")}
      </p>
      <ul className={styles.equipementList} data-testid="piece-equipements-liste">{objets.map((objet) => <li key={objet.id} data-objet={objet.objet}>
        <strong>{objet.libelle}</strong> · {formatLongueurCm(objet.largeurMm)} × {formatLongueurCm(objet.profondeurMm)} cm
        {objet.niveauMm ? ` · pose à ${formatLongueurCm(objet.niveauMm)} cm` : ""}{objet.etatProjet && objet.etatProjet !== "existant" ? ` · ${EQUIPEMENT_ETAT_PROJET_LABELS[objet.etatProjet]}` : ""}
        {objet.commentaire ? <small> — {objet.commentaire}</small> : null}
      </li>)}</ul>
    </>}
    <Link className={styles.secondary} href={planHref({ releveId, etageId, pieceId })}>Placer des objets sur le plan</Link>
  </section>;
}
