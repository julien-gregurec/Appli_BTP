import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerShellReserves, peutEmettre } from "@/lib/acces-reserves";
import { lireChantier, listerIntervenants, listerPlans, listerReserves } from "@/lib/donnees";
import { EtiquetteStatut } from "@/components/Etiquette";
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
    listerPlans(id),
  ]);

  const premierPlan = plans[0] ?? null;
  const reperes = premierPlan
    ? reserves.filter((r) => r.plan_id === premierPlan.id && r.position_x !== null)
    : [];

  return (
    <>
      <h1>{chantier.nom}</h1>
      <p className="sous-titre">
        {chantier.ville ?? "Adresse non renseignée"} — {reserves.length} réserve
        {reserves.length > 1 ? "s" : ""}, {intervenants.length} entreprise
        {intervenants.length > 1 ? "s" : ""} intervenante{intervenants.length > 1 ? "s" : ""}.
      </p>

      <div className="actions">
        {peutEmettre(contexte.roleReserves) && (
          <Link className="bouton" href={`/chantiers/${id}/nouvelle-reserve`}>
            Nouvelle réserve
          </Link>
        )}
        <Link className="bouton secondaire" href={`/chantiers/${id}/export`}>
          Export imprimable
        </Link>
      </div>

      <h2>Repérage sur plan</h2>
      <div className="plan">
        {premierPlan ? (
          reperes.map((r) => (
            <Link
              key={r.id}
              className="plan-repere"
              href={`/reserves/${r.id}`}
              style={{ left: `${Number(r.position_x) * 100}%`, top: `${Number(r.position_y) * 100}%` }}
              title={`n°${r.numero} — ${r.titre}`}
            >
              {r.numero}
            </Link>
          ))
        ) : (
          <p className="plan-absent">
            Aucun plan n’est rattaché à ce chantier. Les positions déjà pointées restent
            enregistrées ; seul leur fond de plan manque.
          </p>
        )}
        {premierPlan && reperes.length === 0 && (
          <p className="plan-absent">
            {premierPlan.nom}
            {premierPlan.niveau ? ` — ${premierPlan.niveau}` : ""} : aucune réserve pointée.
          </p>
        )}
      </div>

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
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
