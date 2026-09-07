import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerShellReserves, peutGererChantiers } from "@/lib/acces-reserves";
import { creerChantierAction } from "@/app/actions";

export const metadata: Metadata = { title: "Nouveau chantier" };

export default async function PageNouveauChantier() {
  const contexte = await exigerShellReserves();
  if (!peutGererChantiers(contexte.roleReserves)) redirect("/chantiers");

  return (
    <>
      <h1>Nouveau chantier</h1>
      <p className="sous-titre">
        Réserves gère ses propres chantiers. Aucune information de Gestion Pro n’est
        requise : seul le nom est obligatoire.
      </p>

      <form className="carte" action={creerChantierAction}>
        <label>Nom du chantier<input name="nom" required maxLength={180} placeholder="Résidence Les Tilleuls" /></label>
        <label>Référence interne<input name="reference" maxLength={80} placeholder="2026-041" /></label>
        <label>Client<input name="client" maxLength={180} placeholder="SCI Les Tilleuls" /></label>
        <label>Adresse<input name="adresse" maxLength={400} /></label>
        <div className="paire">
          <label>Code postal<input name="code_postal" maxLength={12} inputMode="numeric" /></label>
          <label>Ville<input name="ville" maxLength={120} /></label>
        </div>
        <label>Description<textarea name="description" maxLength={4000} placeholder="Nature des travaux, lots concernés…" /></label>
        <div className="paire">
          <label>Date de début<input name="date_debut" type="date" /></label>
          <label>Fin prévisionnelle<input name="date_fin_prevue" type="date" /></label>
        </div>
        <label>
          Statut
          <select name="statut" defaultValue="en_cours">
            <option value="en_cours">En cours</option>
            <option value="receptionne">Réceptionné</option>
            <option value="clos">Clos</option>
          </select>
        </label>
        <div className="actions">
          <button className="bouton" type="submit">Créer le chantier</button>
          <Link className="bouton secondaire" href="/chantiers">Annuler</Link>
        </div>
      </form>
    </>
  );
}
