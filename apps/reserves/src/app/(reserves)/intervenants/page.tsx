import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerShellReserves, estCompteIntervenant, peutInviterEntreprise } from "@/lib/acces-reserves";
import { listerChantiers, listerIntervenants } from "@/lib/donnees";
import { designerEntrepriseAction } from "@/app/actions";

export const metadata: Metadata = { title: "Entreprises intervenantes" };

export default async function PageIntervenants({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  if (estCompteIntervenant(contexte.roleReserves)) redirect("/dashboard");

  const [intervenants, chantiers] = await Promise.all([listerIntervenants(), listerChantiers()]);
  const erreur = typeof query.error === "string" ? query.error : null;
  const invitation = peutInviterEntreprise(contexte.roleReserves);

  return (
    <>
      <h1>Entreprises intervenantes</h1>
      <p className="sous-titre">
        Une entreprise extérieure reçoit un accès Réserves gratuit, limité aux réserves que
        vous lui attribuez. Elle ne voit ni vos clients, ni vos autres chantiers, ni les
        réserves des autres corps d’état.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}

      {intervenants.length === 0 ? (
        <p className="vide">
          Aucune entreprise nommée. Ajoutez-en une depuis la fiche d’un chantier.
        </p>
      ) : (
        <ul className="liste">
          {intervenants.map((i) => (
            <li key={i.id} className="carte">
              <div className="reserve-tete">
                <span className="reserve-titre">{i.nom}</span>
                <span className={`etiquette ${i.statut === "active" ? "levee" : i.statut === "revoquee" ? "refus" : "attente"}`}>
                  {i.statut === "active" ? "A rejoint" : i.statut === "revoquee" ? "Révoquée" : "Invitée"}
                </span>
              </div>
              <div className="reserve-meta">
                {i.corps_etat && <span>{i.corps_etat}</span>}
                {!i.entreprise_intervenante_id && <span>Aucun compte ELSATIA rattaché</span>}
              </div>

              {invitation && !i.entreprise_intervenante_id && (
                <form action={designerEntrepriseAction} style={{ marginTop: 10 }}>
                  <input type="hidden" name="intervenant_id" value={i.id} />
                  <label>
                    Identifiant de l’organisation ELSATIA de cette entreprise
                    <input name="entreprise_intervenante_id" required placeholder="UUID de l’organisation" />
                  </label>
                  <div className="actions">
                    <button className="bouton secondaire" type="submit">Ouvrir l’accès gratuit</button>
                  </div>
                </form>
              )}
              {i.entreprise_intervenante_id && i.statut === "invitee" && (
                <p className="mention">
                  L’accès applicatif est ouvert. C’est maintenant à un membre de cette
                  entreprise de rejoindre l’intervention depuis son propre espace : vous ne
                  pouvez pas habiliter ses utilisateurs à sa place.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Chantiers concernés</h2>
      <p className="vide">
        {chantiers.length} chantier{chantiers.length > 1 ? "s" : ""} suivi
        {chantiers.length > 1 ? "s" : ""} dans Réserves.
      </p>
    </>
  );
}
