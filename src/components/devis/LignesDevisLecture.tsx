import { euros, LIGNE_TYPES } from "@/lib/devis";
import { libelleStructure, rangeesLecture, type LigneLue, type OuvrageLu } from "@/lib/devis/lecture-lignes";

const nature = (t: string) => LIGNE_TYPES.find((x) => x.cle === t)?.libelle ?? t;
const qte = (q: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(q);

/**
 * Lignes d'un devis en LECTURE, moteur v2 : structure (titres, commentaires, séparateurs) sans montant,
 * ouvrage regroupé au-dessus de ses composants, remises et sous-totaux calculés. Composant serveur pur.
 */
export function LignesDevisLecture({ lignes, ouvrages }: { lignes: LigneLue[]; ouvrages: OuvrageLu[] }) {
  const rangees = rangeesLecture(lignes, ouvrages);
  const cellule = "px-3 py-2 text-right font-mono";
  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
          <tr>
            <th className="px-3 py-2 font-medium">Désignation</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Qté</th>
            <th className="px-3 py-2 text-right font-medium">PU HT</th>
            <th className="px-3 py-2 text-right font-medium">TVA</th>
            <th className="px-3 py-2 text-right font-medium">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {rangees.map((r) => {
            const tr = "border-t border-neutral-100 dark:border-neutral-800";
            if (r.genre === "structure") {
              if (r.typeLigne === "separateur") return <tr key={r.cle} className={tr}><td colSpan={6} className="px-3 py-1"><hr className="border-neutral-300 dark:border-neutral-700" /></td></tr>;
              if (r.typeLigne === "vide") return <tr key={r.cle} className={tr}><td colSpan={6} className="py-3" /></tr>;
              if (r.typeLigne === "saut_page") return <tr key={r.cle} className={tr}><td colSpan={6} className="px-3 py-1 text-center text-xs uppercase tracking-wide text-neutral-400">Saut de page</td></tr>;
              const style = r.typeLigne === "titre" ? "font-semibold" : r.typeLigne === "sous_titre" ? "font-medium" : "italic text-neutral-600 dark:text-neutral-400";
              return (
                <tr key={r.cle} className={tr}>
                  <td className={`px-3 py-2 ${style}`} colSpan={r.typeLigne === "commentaire" ? 5 : 1}>{r.designation}{r.description && <div className="text-xs font-normal not-italic text-neutral-500">{r.description}</div>}</td>
                  {r.typeLigne !== "commentaire" && <td className="px-3 py-2 text-xs text-neutral-500" colSpan={4}>{libelleStructure(r.typeLigne)}</td>}
                  <td />
                </tr>
              );
            }
            if (r.genre === "ouvrage") {
              return (
                <tr key={r.cle} className={`${tr} bg-neutral-50/60 dark:bg-neutral-900/40`}>
                  <td className="px-3 py-2 font-medium">{r.designation}{r.reference && <span className="ml-2 font-mono text-xs text-neutral-500">{r.reference}</span>}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">Ouvrage</td>
                  <td className={cellule}>{qte(r.quantite)} {r.unite}</td>
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={`${cellule} font-medium`}>{euros(r.totalHt)}</td>
                </tr>
              );
            }
            if (r.genre === "sous_total") {
              return (
                <tr key={r.cle} className={`${tr} bg-neutral-50 dark:bg-neutral-900`}>
                  <td className="px-3 py-2 font-medium" colSpan={5}>{r.designation}</td>
                  <td className={`${cellule} font-semibold`}>{euros(r.totalHt)}</td>
                </tr>
              );
            }
            if (r.genre === "remise") {
              return (
                <tr key={r.cle} className={tr}>
                  <td className="px-3 py-2">{r.ligne.designation}<div className="text-xs text-neutral-500">{r.libelle}</div></td>
                  <td className="px-3 py-2 text-xs text-neutral-500">Remise</td>
                  <td className={cellule} />
                  <td className={cellule} />
                  <td className={cellule}>{r.ligne.taux_tva} %</td>
                  <td className={`${cellule} text-red-700`}>{euros(r.totalHt)}</td>
                </tr>
              );
            }
            const l = r.ligne;
            return (
              <tr key={r.cle} className={`${tr} ${r.composant ? "text-neutral-600 dark:text-neutral-400" : ""}`}>
                <td className={`px-3 py-2 ${r.composant ? "pl-7" : ""}`}>
                  {r.composant && <span className="mr-1 text-neutral-400">↳</span>}{l.designation}
                  {l.description && <div className="text-xs text-neutral-500">{l.description}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">{nature(l.type)}</td>
                <td className={cellule}>{qte(l.quantite)} {l.unite}</td>
                <td className={cellule}>{euros(l.prix_unitaire_ht)}</td>
                <td className={cellule}>{l.taux_tva} %</td>
                <td className={cellule}>{euros(r.totalHt)}</td>
              </tr>
            );
          })}
          {rangees.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-neutral-500">Aucune ligne.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
