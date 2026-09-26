import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerShellReserves, peutInviterEntreprise } from "@/lib/acces-reserves";
import { lirePublicationAnnuaire } from "@/lib/donnees";
import { publierAnnuaireAction } from "@/app/actions";

export const metadata: Metadata = { title: "Annuaire ELSATIA Réserves" };

export default async function PageAnnuaire() {
  const contexte = await exigerShellReserves();
  if (!peutInviterEntreprise(contexte.roleReserves) || !contexte.entrepriseId) {
    redirect("/dashboard");
  }
  const publication = await lirePublicationAnnuaire(contexte.entrepriseId);

  return (
    <>
      <h1>Annuaire ELSATIA Réserves</h1>
      <p className="sous-titre">
        Publier {contexte.entrepriseNom} à l’annuaire permet à un donneur d’ordre de la
        trouver <strong>par son nom</strong> pour l’inviter sur un chantier. Sans
        publication, seule la saisie de votre SIRET exact permet de vous désigner.
      </p>

      <div className="carte">
        <form action={publierAnnuaireAction}>
          <input type="hidden" name="entreprise_id" value={contexte.entrepriseId} />
          <label className="case">
            <input type="checkbox" name="publiee" defaultChecked={publication?.publiee ?? false} />
            Rendre mon organisation trouvable par son nom
          </label>
          <div className="paire">
            <label>
              Corps d’état
              <input name="corps_etat" maxLength={120} defaultValue={publication?.corps_etat ?? ""}
                     placeholder="Peinture, plâtrerie…" />
            </label>
            <label>
              Zone d’intervention
              <input name="zone_intervention" maxLength={200}
                     defaultValue={publication?.zone_intervention ?? ""} placeholder="Haut-Rhin, Bas-Rhin" />
            </label>
          </div>
          <div className="paire">
            <label>
              E-mail de contact
              <input name="email_contact" type="email" maxLength={180}
                     defaultValue={publication?.email_contact ?? ""} />
            </label>
            <label>
              Téléphone
              <input name="telephone_contact" maxLength={40}
                     defaultValue={publication?.telephone_contact ?? ""} />
            </label>
          </div>
          <p className="mention">
            Seuls ces éléments sont visibles à l’annuaire, avec votre raison sociale et
            votre ville. Aucun chantier, aucune réserve, aucune donnée commerciale n’y
            figure jamais.
          </p>
          <div className="actions">
            <button className="bouton" type="submit">Enregistrer</button>
          </div>
        </form>
      </div>

      <p className="mention">
        <Link href="/intervenants">Retour aux entreprises intervenantes</Link>
      </p>
    </>
  );
}
