import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  exigerShellReserves, estCompteIntervenant, peutGererChantiers, peutInviterEntreprise,
} from "@/lib/acces-reserves";
import {
  listerChantiers, listerIntervenants, listerInvitations, rechercherAnnuaire,
  type InvitationChantier, type ResultatAnnuaire,
} from "@/lib/donnees";
import {
  ajouterIntervenantAction, inviterIntervenantAction, reactiverIntervenantAction,
  revoquerIntervenantAction, revoquerInvitationAction,
} from "@/app/actions";

export const metadata: Metadata = { title: "Entreprises intervenantes" };

const LIBELLES_ETAT: Record<InvitationChantier["etat"], string> = {
  acceptee: "Acceptée",
  revoquee: "Révoquée",
  expiree: "Expirée",
  a_envoyer: "À transmettre",
  en_attente: "En attente",
};

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
  const message = typeof query.message === "string" ? query.message : null;
  const lien = typeof query.lien === "string" ? query.lien : null;
  const transfert = typeof query.transfert === "string" ? query.transfert : null;
  const recherche = typeof query.q === "string" ? query.q.trim() : "";
  const cible = typeof query.pour === "string" ? query.pour : null;

  const invitation = peutInviterEntreprise(contexte.roleReserves);
  const gestion = peutGererChantiers(contexte.roleReserves);

  // L'annuaire n'est interrogé que si l'utilisateur a réellement demandé une recherche,
  // et que son rôle l'autorise à inviter : chercher, ici, c'est préparer une invitation.
  let resultats: ResultatAnnuaire[] = [];
  let erreurAnnuaire: string | null = null;
  if (invitation && recherche !== "" && contexte.entrepriseId) {
    const reponse = await rechercherAnnuaire(contexte.entrepriseId, recherche);
    resultats = reponse.resultats;
    erreurAnnuaire = reponse.erreur;
  }

  // Les invitations sont listées par chantier : c'est la granularité de la RPC, et celle
  // du suivi réel (« qui n'a pas encore répondu sur ce chantier »).
  const invitationsParChantier = invitation
    ? await Promise.all(chantiers.map(async (c) => [c.id, await listerInvitations(c.id)] as const))
    : [];
  const invitationsVivantes = new Map(
    invitationsParChantier.flatMap(([, liste]) =>
      liste.filter((i) => i.etat === "en_attente" || i.etat === "a_envoyer")
        .map((i) => [i.intervenant_id, i] as const)),
  );
  const invitationsToutes = invitationsParChantier.flatMap(([, liste]) => liste);

  const nomChantier = (id: string) => chantiers.find((c) => c.id === id)?.nom ?? "Chantier";

  return (
    <>
      <h1>Entreprises intervenantes</h1>
      <p className="sous-titre">
        Une entreprise extérieure reçoit un accès Réserves gratuit, limité aux réserves que
        vous lui attribuez. Elle ne voit ni vos clients, ni vos autres chantiers, ni les
        réserves des autres corps d’état.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}
      {message && <div className="message">{message}</div>}

      {lien && (
        <div className="carte">
          <h2>Lien d’invitation à transmettre</h2>
          <p className="mention">
            L’e-mail n’est pas parti, mais l’invitation est bien créée. Ce lien n’est
            affiché qu’une fois : il n’est stocké nulle part en clair.
          </p>
          <label>
            Lien sécurisé
            <input readOnly value={lien} />
          </label>
        </div>
      )}

      {gestion && chantiers.length > 0 && (
        <details className="carte" open={chantiers.length > 0 && intervenants.length === 0}>
          <summary>Nommer une entreprise sur un chantier</summary>
          <form action={ajouterIntervenantAction}>
            <label>
              Chantier
              <select name="chantier_id" required defaultValue={chantiers[0]?.id}>
                {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </label>
            <div className="paire">
              <label>Nom sur le chantier<input name="nom" required maxLength={180} placeholder="Peinture Demo" /></label>
              <label>Corps d’état<input name="corps_etat" maxLength={120} placeholder="Peinture" /></label>
            </div>
            <div className="paire">
              <label>Raison sociale<input name="raison_sociale" maxLength={200} placeholder="PEINTURE DEMO SAS" /></label>
              <label>SIRET<input name="siret" maxLength={20} inputMode="numeric" placeholder="12345678900012" /></label>
            </div>
            <div className="paire">
              <label>Nom du contact<input name="contact_nom" maxLength={160} placeholder="Claire Demo" /></label>
              <label>E-mail du contact<input name="email_contact" type="email" maxLength={180} /></label>
            </div>
            <label>Téléphone (facultatif)<input name="telephone_contact" maxLength={40} /></label>
            <p className="mention">
              L’entreprise est d’abord nommée sur le chantier, avec son identité
              commerciale. ELSATIA ne lui crée aucun compte : c’est elle qui rejoindra,
              par le lien que vous lui enverrez.
            </p>
            <div className="actions">
              <button className="bouton" type="submit">Nommer l’entreprise</button>
            </div>
          </form>
        </details>
      )}

      {invitation && (
        <details className="carte" open={recherche !== ""}>
          <summary>Rechercher une entreprise à l’annuaire ELSATIA</summary>
          <form method="get">
            <label>
              Nom ou SIRET
              <input name="q" defaultValue={recherche} placeholder="PLATRERIE D — ou 12345678900012" />
            </label>
            {cible && <input type="hidden" name="pour" value={cible} />}
            <div className="actions">
              <button className="bouton secondaire" type="submit">Rechercher</button>
            </div>
          </form>
          <p className="mention">
            Le SIRET exact désigne n’importe quelle organisation ELSATIA. La recherche par
            nom, elle, ne porte que sur les organisations qui se sont publiées à l’annuaire :
            sans cela, une simple recherche exposerait le fichier client d’ELSATIA.
          </p>
          {erreurAnnuaire && <div className="message erreur">{erreurAnnuaire}</div>}
          {recherche !== "" && resultats.length === 0 && !erreurAnnuaire && (
            <p className="vide">
              Aucune organisation trouvée. Invitez-la par e-mail : elle créera son compte
              en rejoignant.
            </p>
          )}
          {resultats.length > 0 && (
            <ul className="liste">
              {resultats.map((r) => (
                <li key={r.entreprise_id} className="carte">
                  <div className="reserve-tete">
                    <span className="reserve-titre">{r.nom}</span>
                    <span className={`etiquette ${r.deja_utilisatrice ? "levee" : "attente"}`}>
                      {r.deja_utilisatrice ? "Déjà sur Réserves" : "À inviter"}
                    </span>
                  </div>
                  <div className="reserve-meta">
                    {r.ville && <span>{r.ville}</span>}
                    {r.corps_etat && <span>{r.corps_etat}</span>}
                    {r.zone_intervention && <span>{r.zone_intervention}</span>}
                    <span>{r.origine === "siret" ? "Trouvée par SIRET" : "Publiée à l’annuaire"}</span>
                  </div>
                  {cible ? (
                    <form action={inviterIntervenantAction}>
                      <input type="hidden" name="intervenant_id" value={cible} />
                      <input type="hidden" name="entreprise_cible_id" value={r.entreprise_id} />
                      <input type="hidden" name="retour" value="/intervenants" />
                      <div className="paire">
                        <label>E-mail du contact<input name="email" type="email" required maxLength={180} /></label>
                        <label>Nom du contact<input name="contact_nom" maxLength={160} /></label>
                      </div>
                      <div className="actions">
                        <button className="bouton" type="submit">Inviter cette organisation</button>
                      </div>
                    </form>
                  ) : (
                    <p className="mention">
                      Choisissez d’abord l’entreprise du chantier à rattacher, avec le
                      bouton «&nbsp;Rechercher à l’annuaire&nbsp;» de sa fiche.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {intervenants.length === 0 ? (
        <p className="vide">Aucune entreprise nommée sur vos chantiers.</p>
      ) : (
        <ul className="liste">
          {intervenants.map((i) => {
            const enAttente = invitationsVivantes.get(i.id);
            return (
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

                {transfert === i.id && (
                  <p className="message erreur">
                    Des réserves restent ouvertes sur cette entreprise. Ouvrez chacune et
                    utilisez «&nbsp;Transférer la responsabilité&nbsp;» pour les confier à
                    un autre intervenant : l’historique conserve le passage de celle-ci.{" "}
                    <Link href={`/reserves?intervenant=${i.id}`}>Voir ses réserves</Link>
                  </p>
                )}

                {invitation && i.statut === "invitee" && (
                  <>
                    {enAttente ? (
                      <>
                        <p className="mention">
                          Invitation {LIBELLES_ETAT[enAttente.etat].toLowerCase()} à{" "}
                          <strong>{enAttente.email}</strong>, valable jusqu’au{" "}
                          {new Date(enAttente.expire_at).toLocaleDateString("fr-FR")}.
                          {enAttente.envoye_at
                            ? " L’e-mail est parti."
                            : " L’e-mail n’a pas pu partir : réémettez le lien ou transmettez-le vous-même."}
                        </p>
                        <form action={revoquerInvitationAction}>
                          <input type="hidden" name="invitation_id" value={enAttente.id} />
                          <input type="hidden" name="retour" value="/intervenants" />
                          <button className="bouton secondaire" type="submit">Révoquer ce lien</button>
                        </form>
                      </>
                    ) : null}

                    <form action={inviterIntervenantAction} style={{ marginTop: 10 }}>
                      <input type="hidden" name="intervenant_id" value={i.id} />
                      <input type="hidden" name="retour" value="/intervenants" />
                      <div className="paire">
                        <label>
                          E-mail du contact
                          <input name="email" type="email" required maxLength={180}
                                 defaultValue={i.email_contact ?? ""} />
                        </label>
                        <label>Nom du contact<input name="contact_nom" maxLength={160} /></label>
                      </div>
                      <div className="actions">
                        <button className="bouton" type="submit">
                          {enAttente ? "Réémettre l’invitation" : "Envoyer l’invitation"}
                        </button>
                        <Link className="bouton secondaire" href={`/intervenants?pour=${i.id}`}>
                          Rechercher à l’annuaire
                        </Link>
                      </div>
                    </form>
                    <p className="mention">
                      Le lien est personnel, à usage unique, et expire. Réémettre un lien
                      invalide automatiquement le précédent.
                    </p>
                  </>
                )}

                {gestion && i.statut !== "revoquee" && (
                  <form action={revoquerIntervenantAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="intervenant_id" value={i.id} />
                    <label>
                      Motif de la révocation (facultatif, transmis à l’entreprise)
                      <input name="motif" maxLength={300} />
                    </label>
                    <div className="actions">
                      <button className="bouton danger" type="submit">Révoquer l’accès</button>
                    </div>
                    <p className="mention">
                      La révocation coupe immédiatement l’accès de l’entreprise au chantier.
                      Elle n’efface rien : l’historique, les photos et les échanges restent
                      intacts de votre côté, et son nom demeure au dossier.
                    </p>
                  </form>
                )}

                {gestion && i.statut === "revoquee" && (
                  <form action={reactiverIntervenantAction} style={{ marginTop: 10 }}>
                    <input type="hidden" name="intervenant_id" value={i.id} />
                    <button className="bouton secondaire" type="submit">Réactiver l’accès</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {invitation && invitationsToutes.length > 0 && (
        <details className="carte">
          <summary>Historique des invitations ({invitationsToutes.length})</summary>
          <ul className="liste">
            {invitationsToutes.map((inv) => (
              <li key={inv.id} className="carte">
                <div className="reserve-tete">
                  <span className="reserve-titre">{inv.intervenant}</span>
                  <span className={`etiquette ${inv.etat === "acceptee" ? "levee" : inv.etat === "en_attente" ? "attente" : "refus"}`}>
                    {LIBELLES_ETAT[inv.etat]}
                  </span>
                </div>
                <div className="reserve-meta">
                  <span>{inv.email}</span>
                  {inv.contact_nom && <span>{inv.contact_nom}</span>}
                  <span>Émise le {new Date(inv.created_at).toLocaleDateString("fr-FR")}</span>
                  <span>Expire le {new Date(inv.expire_at).toLocaleDateString("fr-FR")}</span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mention">
        <Link href="/chantiers">Gérer les chantiers</Link>
        {" · "}
        <Link href="/parametres/annuaire">Publier mon organisation à l’annuaire</Link>
      </p>
    </>
  );
}
