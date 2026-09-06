import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigerShellReserves } from "@/lib/acces-reserves";
import { lireChantier, listerIntervenants } from "@/lib/donnees";
import { LIBELLES_PRIORITE, LIBELLES_STATUT, type PrioriteReserve, type StatutReserve } from "@/lib/workflow";

export const metadata: Metadata = { title: "Export du chantier" };

type LigneExport = {
  numero: number; titre: string; description: string | null;
  statut: StatutReserve; priorite: PrioriteReserve;
  intervenant: string | null; plan: string | null; niveau: string | null; zone: string | null;
  position_x: number | null; position_y: number | null;
  echeance: string | null; photo_obligatoire_levee: boolean; nb_photos: number;
  created_at: string; levee_at: string | null;
};

// Le PDF de la V1 est l'impression de cette page : elle est mise en forme pour le papier
// par la feuille de style d'impression. Un rendu PDF côté serveur (en-tête, pagination,
// vignettes photo) relève d'un lot dédié — voir ELSATIA_RESERVES_ARCHITECTURE_V1.
export default async function PageExport({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  const chantier = await lireChantier(id);
  if (!chantier) notFound();

  const filtreEntreprise = typeof query.entreprise === "string" ? query.entreprise : null;
  const supabase = await createClient();
  const [{ data }, intervenants] = await Promise.all([
    supabase.rpc("reserves_export_chantier", {
      p_chantier_id: id,
      p_intervenant_id: filtreEntreprise,
    }),
    listerIntervenants(id),
  ]);
  const lignes = (data ?? []) as LigneExport[];

  return (
    <>
      <h1>Réserves — {chantier.nom}</h1>
      <p className="sous-titre">
        {contexte.entrepriseNom} · Édité le {new Date().toLocaleDateString("fr-FR")} ·
        {" "}{lignes.length} réserve{lignes.length > 1 ? "s" : ""}
        {filtreEntreprise
          ? ` · ${intervenants.find((i) => i.id === filtreEntreprise)?.nom ?? "Entreprise"}`
          : ""}
      </p>

      <form className="carte" method="get">
        <label>
          Restreindre à une entreprise
          <select name="entreprise" defaultValue={filtreEntreprise ?? ""}>
            <option value="">Toutes les entreprises</option>
            {intervenants.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
          </select>
        </label>
        <div className="actions">
          <button className="bouton" type="submit">Appliquer</button>
        </div>
      </form>

      {lignes.length === 0 ? (
        <p className="vide">Aucune réserve à éditer.</p>
      ) : (
        <ul className="liste">
          {lignes.map((l) => (
            <li key={l.numero} className="carte">
              <div className="reserve-tete">
                <span className="reserve-num">n°{l.numero}</span>
                <span className="reserve-titre">{l.titre}</span>
              </div>
              {l.description && <p style={{ margin: "6px 0" }}>{l.description}</p>}
              <div className="reserve-meta">
                <span>{LIBELLES_STATUT[l.statut]}</span>
                <span>{LIBELLES_PRIORITE[l.priorite]}</span>
                <span>{l.intervenant ?? "Non attribuée"}</span>
                {l.plan && (
                  <span>
                    {l.plan}{l.niveau ? ` — ${l.niveau}` : ""}{l.zone ? ` / ${l.zone}` : ""}
                    {l.position_x !== null ? ` (repère ${Number(l.position_x).toFixed(3)} ; ${Number(l.position_y).toFixed(3)})` : ""}
                  </span>
                )}
                {l.echeance && <span>Échéance {l.echeance}</span>}
                <span>{l.nb_photos} photo{l.nb_photos > 1 ? "s" : ""}</span>
                {l.photo_obligatoire_levee && <span>Photo exigée</span>}
                {l.levee_at && <span>Levée le {new Date(l.levee_at).toLocaleDateString("fr-FR")}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mention">
        Édition destinée à l’impression ou à l’enregistrement PDF depuis le navigateur.
        Aucune donnée d’une autre organisation n’y figure : la liste passe par les mêmes
        contrôles d’accès que l’application.
      </p>
    </>
  );
}
