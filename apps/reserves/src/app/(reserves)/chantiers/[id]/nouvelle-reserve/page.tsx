import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { exigerShellReserves, peutEmettre } from "@/lib/acces-reserves";
import { lireChantier, listerIntervenants, listerPlans } from "@/lib/donnees";
import { creerReserveAction } from "@/app/actions";

export const metadata: Metadata = { title: "Nouvelle réserve" };

// Écran conçu pour le chantier : un seul écran, dans l'ordre du geste réel —
// ce qu'on voit, où c'est, qui doit reprendre, pour quand.
export default async function PageNouvelleReserve({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  if (!peutEmettre(contexte.roleReserves)) redirect(`/chantiers/${id}`);

  const chantier = await lireChantier(id);
  if (!chantier) notFound();
  const [intervenants, plans] = await Promise.all([listerIntervenants(id), listerPlans(id)]);
  const erreur = typeof query.error === "string" ? query.error : null;

  return (
    <>
      <h1>Nouvelle réserve</h1>
      <p className="sous-titre">{chantier.nom}</p>
      {erreur && <div className="message erreur">{erreur}</div>}

      <form className="carte" action={creerReserveAction}>
        <input type="hidden" name="chantier_id" value={id} />
        <label>
          Ce qui est constaté
          <input name="titre" required maxLength={200} placeholder="Peinture écaillée cage d’escalier" />
        </label>
        <label>
          Description
          <textarea name="description" maxLength={4000} placeholder="Détail du désordre et de la reprise attendue" />
        </label>
        <label>
          Priorité
          <select name="priorite" defaultValue="normale">
            <option value="basse">Basse</option>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="bloquante">Bloquante</option>
          </select>
        </label>
        <label>
          Plan
          <select name="plan_id" defaultValue="">
            <option value="">Aucun repérage sur plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}{p.niveau ? ` — ${p.niveau}` : ""}{p.zone ? ` / ${p.zone}` : ""}
              </option>
            ))}
          </select>
        </label>
        {/* Coordonnées normalisées 0..1 : ce qui est saisi est ce qui est stocké.
            Le pointage tactile sur le fond de plan relève du lot viewer dédié. */}
        <label>
          Position sur le plan — horizontale (0 à 1)
          <input name="position_x" type="number" step="0.001" min="0" max="1" placeholder="0.425" />
        </label>
        <label>
          Position sur le plan — verticale (0 à 1)
          <input name="position_y" type="number" step="0.001" min="0" max="1" placeholder="0.610" />
        </label>
        <label>
          Entreprise à qui l’attribuer
          <select name="intervenant_id" defaultValue="">
            <option value="">Ne pas attribuer maintenant</option>
            {intervenants.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nom}{i.corps_etat ? ` — ${i.corps_etat}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Échéance
          <input name="echeance" type="date" />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44 }}>
          <input type="checkbox" name="photo_obligatoire_levee" style={{ width: 22, height: 22, minHeight: 22, margin: 0 }} />
          Exiger une photo des travaux avant la demande de levée
        </label>
        <p className="mention">
          Cette exigence vaut pour cette réserve seulement. Une reprise structurelle et une
          finition esthétique n’appellent pas la même preuve.
        </p>
        <div className="actions">
          <button className="bouton" type="submit">Envoyer la réserve</button>
        </div>
      </form>
    </>
  );
}
