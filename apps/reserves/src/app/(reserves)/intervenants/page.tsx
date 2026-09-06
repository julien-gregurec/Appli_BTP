import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  exigerShellReserves, estCompteIntervenant, peutGererChantiers, peutInviterEntreprise,
} from "@/lib/acces-reserves";
import { listerChantiers, listerIntervenants } from "@/lib/donnees";
import {
  ajouterIntervenantAction, designerEntrepriseAction, revoquerIntervenantAction,
} from "@/app/actions";

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
  const gestion = peutGererChantiers(contexte.roleReserves);
  const nomChantier = (id: string) => chantiers.find((c) => c.id === id)?.nom ?? "Chantier";
  // Aucun envoi d'e-mail n'est branché sur Réserves : le lien se copie et se transmet
  // par le canal que l'utilisateur juge bon. Voir ELSATIA_RESERVES_TERRAIN_V2.
  const base = process.env.NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020";

  return (
    <>
      <h1>Entreprises intervenantes</h1>
      <p className="sous-titre">
        Une entreprise extérieure reçoit un accès Réserves gratuit, limité aux réserves que
        vous lui attribuez. Elle ne voit ni vos clients, ni vos autres chantiers, ni les
        réserves des autres corps d’état.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}

      {gestion && chantiers.length > 0 && (
        <details className="carte">
          <summary>Ajouter une entreprise sur un chantier</summary>
          <form action={ajouterIntervenantAction}>
            <label>
              Chantier
              <select name="chantier_id" required defaultValue={chantiers[0]?.id}>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
            <div className="paire">
              <label>Raison sociale<input name="nom" required maxLength={180} placeholder="Peinture Demo SAS" /></label>
              <label>Corps d’état<input name="corps_etat" maxLength={120} placeholder="Peinture" /></label>
            </div>
            <div className="paire">
              <label>E-mail du contact<input name="email_contact" type="email" maxLength={180} /></label>
              <label>Téléphone<input name="telephone_contact" maxLength={40} /></label>
            </div>
            <p className="mention">
              L’entreprise est d’abord simplement nommée sur le chantier. Vous pourrez lui
              ouvrir l’accès ensuite, si elle possède un compte ELSATIA.
            </p>
            <div className="actions">
              <button className="bouton" type="submit">Ajouter l’entreprise</button>
            </div>
          </form>
        </details>
      )}

      {intervenants.length === 0 ? (
        <p className="vide">Aucune entreprise nommée sur vos chantiers.</p>
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
                <span>{nomChantier(i.chantier_id)}</span>
                {i.email_contact && <span>{i.email_contact}</span>}
                {i.telephone_contact && <span>{i.telephone_contact}</span>}
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
                <>
                  <p className="mention">
                    L’accès applicatif est ouvert. Un membre de cette entreprise doit
                    maintenant rejoindre l’intervention depuis son propre espace : vous ne
                    pouvez pas habiliter ses utilisateurs à sa place.
                  </p>
                  {/* Aucune infrastructure d'e-mail n'est branchée sur Réserves : le lien
                      est fourni à copier, ce qui est le comportement honnête tant que
                      l'envoi n'existe pas. */}
                  <label>
                    Lien d’invitation à transmettre
                    <input readOnly value={`${base}/rejoindre/${i.id}`} />
                  </label>
                </>
              )}

              {gestion && i.statut !== "revoquee" && (
                <form action={revoquerIntervenantAction}>
                  <input type="hidden" name="intervenant_id" value={i.id} />
                  <button className="bouton danger" type="submit">Révoquer l’accès</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mention">
        <Link href="/chantiers">Gérer les chantiers</Link>
      </p>
    </>
  );
}
