import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { exigerShellReserves, peutEmettre } from "@/lib/acces-reserves";
import { lireChantier, listerIntervenants, listerPlansComplets } from "@/lib/donnees";
import { creerReserveAction } from "@/app/actions";
import { ChampPhoto } from "@/components/ChampPhoto";

export const metadata: Metadata = { title: "Nouvelle réserve" };

// Écran de constat, pensé pour être rempli debout sur un chantier : l'ordre des champs
// suit le geste réel — ce qu'on voit, la photo, qui reprend, pour quand. Tout le reste
// est facultatif et repoussé en bas.
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
  const [intervenants, plans] = await Promise.all([
    listerIntervenants(id),
    listerPlansComplets(id),
  ]);

  const erreur = typeof query.error === "string" ? query.error : null;
  const planPointe = typeof query.plan === "string" ? query.plan : "";
  const x = typeof query.x === "string" ? query.x : "";
  const y = typeof query.y === "string" ? query.y : "";
  const plan = plans.find((p) => p.id === planPointe) ?? null;

  return (
    <>
      <h1>Nouvelle réserve</h1>
      <p className="sous-titre">{chantier.nom}</p>
      {erreur && <div className="message erreur">{erreur}</div>}

      {plan && x && y && (
        <div className="message">
          Position relevée sur <b>{plan.nom}</b>
          {plan.niveau ? ` — ${plan.niveau}` : ""} : {Number(x).toFixed(3)} ; {Number(y).toFixed(3)}
        </div>
      )}

      <form className="carte" action={creerReserveAction} encType="multipart/form-data">
        <input type="hidden" name="chantier_id" value={id} />
        <input type="hidden" name="plan_id" value={planPointe} />
        <input type="hidden" name="position_x" value={x} />
        <input type="hidden" name="position_y" value={y} />

        <label>
          Ce qui est constaté
          <input name="titre" required maxLength={200} autoFocus placeholder="Peinture écaillée cage d’escalier" />
        </label>

        <ChampPhoto
          nom="photo"
          libelle="Photo du constat"
          aide="Facultative. Prise directement avec l’appareil photo, ou choisie dans la photothèque."
        />

        <label>
          Description
          <textarea name="description" maxLength={4000} placeholder="Détail du désordre et de la reprise attendue" />
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

        <div className="paire">
          <label>
            Priorité
            <select name="priorite" defaultValue="normale">
              <option value="basse">Basse</option>
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="bloquante">Bloquante</option>
            </select>
          </label>
          <label>Échéance<input name="echeance" type="date" /></label>
        </div>

        <label className="case">
          <input type="checkbox" name="photo_obligatoire_levee" />
          Exiger une photo des travaux avant la demande de levée
        </label>
        <p className="mention">
          Cette exigence vaut pour cette réserve seulement. Une reprise structurelle et une
          finition esthétique n’appellent pas la même preuve.
        </p>

        {!planPointe && plans.length > 0 && (
          <p className="mention">
            Pour situer la réserve sur un plan, revenez au chantier et utilisez
            « Placer une réserve » : le repère est alors pointé directement.
          </p>
        )}

        <div className="actions">
          <button className="bouton" type="submit">Envoyer la réserve</button>
        </div>
      </form>
    </>
  );
}
