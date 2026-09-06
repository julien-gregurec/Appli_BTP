import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerShellReserves, peutInviterEntreprise } from "@/lib/acces-reserves";
import { listerMembres } from "@/lib/donnees";
import { attribuerRoleAction, retirerAccesMembreAction } from "@/app/actions";

export const metadata: Metadata = { title: "Membres Réserves" };

const ROLES = [
  { code: "reserves_admin_organisation", libelle: "Administrateur", aide: "Tout, plus les membres et les invitations" },
  { code: "reserves_responsable", libelle: "Responsable des réserves", aide: "Valide ou refuse les levées" },
  { code: "reserves_emetteur", libelle: "Émetteur", aide: "Constate et attribue, ne valide pas" },
  { code: "reserves_consultation", libelle: "Consultation", aide: "Lecture et export seulement" },
];

export default async function PageMembres({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  // `peutInviterEntreprise` et l'administration des membres reposent sur le même rôle :
  // administrateur de l'organisation.
  if (!peutInviterEntreprise(contexte.roleReserves) || !contexte.entrepriseId) {
    redirect("/dashboard");
  }

  const membres = await listerMembres(contexte.entrepriseId);
  const erreur = typeof query.error === "string" ? query.error : null;
  const habilites = membres.filter((m) => m.autorise);

  return (
    <>
      <h1>Membres Réserves</h1>
      <p className="sous-titre">
        {contexte.entrepriseNom} — {habilites.length} personne{habilites.length > 1 ? "s" : ""} habilitée
        {habilites.length > 1 ? "s" : ""} sur {membres.length}.
      </p>
      {erreur && <div className="message erreur">{erreur}</div>}

      <p className="mention">
        Une habilitation Réserves ne vaut que pour Réserves : elle n’ouvre ni Gestion Pro,
        ni Colors, ni Tools, et ne confère aucun droit sur la plateforme. Vous ne pouvez
        habiliter que des personnes déjà membres actives de votre organisation.
      </p>

      {membres.length === 0 ? (
        <p className="vide">Aucun membre dans votre organisation.</p>
      ) : (
        <ul className="liste">
          {membres.map((membre) => {
            const role = ROLES.find((r) => r.code === membre.role_code);
            return (
              <li key={membre.utilisateur_id} className="carte">
                <div className="reserve-tete">
                  <span className="reserve-titre">
                    {[membre.prenom, membre.nom].filter(Boolean).join(" ") || "Membre"}
                  </span>
                  {membre.autorise && role
                    ? <span className="etiquette levee">{role.libelle}</span>
                    : <span className="etiquette">Sans accès Réserves</span>}
                  {membre.statut_membre !== "actif" && (
                    <span className="etiquette refus">{membre.statut_membre}</span>
                  )}
                </div>
                <div className="reserve-meta">
                  <span>{membre.email ?? "Adresse inconnue"}</span>
                </div>

                {membre.statut_membre === "actif" && (
                  <div className="actions">
                    <form action={attribuerRoleAction} className="ligne-role">
                      <input type="hidden" name="utilisateur_id" value={membre.utilisateur_id} />
                      <input type="hidden" name="entreprise_id" value={contexte.entrepriseId!} />
                      <label className="sans-marge">
                        Rôle Réserves
                        <select name="role_code" defaultValue={membre.role_code ?? "reserves_emetteur"}>
                          {ROLES.map((r) => (
                            <option key={r.code} value={r.code}>{r.libelle} — {r.aide}</option>
                          ))}
                        </select>
                      </label>
                      <button className="bouton" type="submit">
                        {membre.autorise ? "Modifier le rôle" : "Donner accès"}
                      </button>
                    </form>
                    {membre.autorise && (
                      <form action={retirerAccesMembreAction}>
                        <input type="hidden" name="utilisateur_id" value={membre.utilisateur_id} />
                        <input type="hidden" name="entreprise_id" value={contexte.entrepriseId!} />
                        <button className="bouton danger" type="submit">Retirer l’accès</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mention">
        Votre organisation doit conserver au moins un administrateur Réserves : le dernier
        ne peut ni se rétrograder ni se retirer l’accès.
      </p>
    </>
  );
}
