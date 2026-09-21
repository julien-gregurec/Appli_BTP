import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerShellReserves, peutEmettre, peutGererChantiers } from "@/lib/acces-reserves";
import {
  BUCKET_PLANS, lireChantier, listerIntervenants, listerPlansComplets,
  listerReserves, signerFichiers,
} from "@/lib/donnees";
import { EtiquetteStatut } from "@/components/Etiquette";
import { PlanChantier } from "@/components/PlanChantier";
import { enregistrerPaginationAction } from "@/app/actions";
import { estEnRetard } from "@/lib/workflow";

export const metadata: Metadata = { title: "Chantier" };

export default async function PageChantier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contexte = await exigerShellReserves();
  const chantier = await lireChantier(id);
  if (!chantier) notFound();

  const [reserves, intervenants, plans] = await Promise.all([
    listerReserves({ chantierId: id }),
    listerIntervenants(id),
    listerPlansComplets(id),
  ]);

  const liens = await signerFichiers(
    BUCKET_PLANS,
    plans.map((p) => p.storage_path).filter((c): c is string => Boolean(c)),
  );

  const plansAffichables = plans.map((p) => ({
    id: p.id,
    nom: p.nom,
    niveau: p.niveau,
    zone: p.zone,
    url: p.storage_path ? liens.get(p.storage_path) ?? null : null,
    image: Boolean(p.mime_type?.startsWith("image/")),
    pdf: p.mime_type === "application/pdf",
    nbPages: p.nb_pages,
  }));

  const reperes = reserves
    .filter((r) => r.plan_id && r.position_x !== null && r.position_y !== null)
    .map((r) => ({
      id: r.id, numero: r.numero, titre: r.titre, statut: r.statut,
      x: Number(r.position_x), y: Number(r.position_y), planId: r.plan_id as string,
      // Les réserves pointées avant la V3 l'ont été sur une image : page 1.
      page: r.plan_page ?? 1,
    }));

  const emission = peutEmettre(contexte.roleReserves);

  return (
    <>
      <h1>{chantier.nom}</h1>
      <p className="sous-titre">
        {[chantier.ville, chantier.reference].filter(Boolean).join(" · ") || "Chantier Réserves"}
        {" — "}{reserves.length} réserve{reserves.length > 1 ? "s" : ""},
        {" "}{intervenants.length} entreprise{intervenants.length > 1 ? "s" : ""}.
      </p>

      <div className="actions">
        {emission && (
          <Link className="bouton" href={`/chantiers/${id}/nouvelle-reserve`}>Nouvelle réserve</Link>
        )}
        {peutGererChantiers(contexte.roleReserves) && (
          <Link className="bouton secondaire" href={`/chantiers/${id}/plans`}>Plans</Link>
        )}
        <Link className="bouton secondaire" href={`/chantiers/${id}/export`}>Exports et PDF</Link>
      </div>

      <h2>Repérage sur plan</h2>
      <PlanChantier
        chantierId={id}
        plans={plansAffichables}
        reperes={reperes}
        peutEmettre={emission}
        enregistrerPagination={enregistrerPaginationAction}
      />

      <h2>Réserves</h2>
      {reserves.length === 0 ? (
        <p className="vide">Aucune réserve constatée sur ce chantier.</p>
      ) : (
        <ul className="liste">
          {reserves.map((r) => (
            <li key={r.id}>
              <Link className={`reserve p-${r.priorite}`} href={`/reserves/${r.id}`}>
                <span className="reserve-tete">
                  <span className="reserve-num">n°{r.numero}</span>
                  <span className="reserve-titre">{r.titre}</span>
                </span>
                <span className="reserve-meta">
                  <EtiquetteStatut statut={r.statut} />
                  {estEnRetard(r) && <span className="etiquette retard">En retard</span>}
                  {r.intervenant_id && (
                    <span>{intervenants.find((i) => i.id === r.intervenant_id)?.nom ?? "Entreprise"}</span>
                  )}
                  {r.plan_id && <span>Repérée sur plan</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
