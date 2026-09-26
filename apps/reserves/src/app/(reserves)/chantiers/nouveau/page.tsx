import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerShellReserves, peutGererChantiers } from "@/lib/acces-reserves";
import { creerChantierAction, importerChantierGpAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

type ChantierGestionPro = { id: string; nom: string; ville: string | null };

export const metadata: Metadata = { title: "Nouveau chantier" };

export default async function PageNouveauChantier() {
  const contexte = await exigerShellReserves();
  if (!peutGererChantiers(contexte.roleReserves)) redirect("/chantiers");

  // Chantiers Gestion Pro de l'organisation, lus sous la RLS de Gestion Pro : quelqu'un
  // sans accès chantiers dans Gestion Pro n'en lit aucun, et le bloc disparaît. L'import
  // lui-même revérifie les DEUX habilitations en base (reserves_importer_chantier_gp).
  let chantiersGp: ChantierGestionPro[] = [];
  if (contexte.entrepriseId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("chantiers")
      .select("id, nom, ville")
      .eq("entreprise_id", contexte.entrepriseId)
      .order("created_at", { ascending: false })
      .limit(50);
    chantiersGp = (data ?? []) as ChantierGestionPro[];
  }

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

      {chantiersGp.length > 0 && (
        <section className="carte" data-test="import-gestion-pro">
          <h2 style={{ marginTop: 0 }}>Reprendre un chantier Gestion Pro</h2>
          <p className="mention">
            Le nom et l’adresse sont repris ; reprendre à nouveau un chantier déjà lié les
            resynchronise, sans créer de doublon. Les réserves restent propres à Réserves.
          </p>
          <ul className="liste">
            {chantiersGp.map((c) => (
              <li key={c.id}>
                <form action={importerChantierGpAction} className="actions">
                  <input type="hidden" name="chantier_gp_id" value={c.id} />
                  <span>{c.nom}{c.ville ? ` — ${c.ville}` : ""}</span>
                  <button className="bouton secondaire" type="submit">Reprendre {c.nom}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
