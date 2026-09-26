import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves, estCompteIntervenant } from "@/lib/acces-reserves";
import { listerIntervenants, listerReserves } from "@/lib/donnees";
import { EtiquetteStatut } from "@/components/Etiquette";
import { estEnRetard } from "@/lib/workflow";

export const metadata: Metadata = { title: "Réserves" };

export default async function PageReserves({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contexte = await exigerShellReserves();
  const filtres = {
    statut: typeof params.statut === "string" ? params.statut : null,
    priorite: typeof params.priorite === "string" ? params.priorite : null,
    intervenantId: typeof params.entreprise === "string" ? params.entreprise : null,
  };
  const [reserves, intervenants] = await Promise.all([
    listerReserves(filtres),
    estCompteIntervenant(contexte.roleReserves) ? Promise.resolve([]) : listerIntervenants(),
  ]);

  return (
    <>
      <h1>{estCompteIntervenant(contexte.roleReserves) ? "Mes réserves" : "Toutes les réserves"}</h1>
      <p className="sous-titre">
        {reserves.length} réserve{reserves.length > 1 ? "s" : ""} visible
        {reserves.length > 1 ? "s" : ""} pour votre compte.
      </p>

      {intervenants.length > 0 && (
        <form className="carte" method="get">
          <label>
            Entreprise intervenante
            <select name="entreprise" defaultValue={filtres.intervenantId ?? ""}>
              <option value="">Toutes</option>
              {intervenants.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
            </select>
          </label>
          <div className="actions">
            <button className="bouton" type="submit">Filtrer</button>
            <Link className="bouton secondaire" href="/reserves">Réinitialiser</Link>
          </div>
        </form>
      )}

      {reserves.length === 0 ? (
        <p className="vide">Aucune réserve visible.</p>
      ) : (
        <ul className="liste">
          {reserves.map((r) => (
            <li key={r.id}>
              <Link className={`reserve p-${r.priorite}`} href={`/reserves/${r.id}`}>
                <span className="reserve-tete">
                  <span className="reserve-num">n°{r.numero}</span>
                  <span className="reserve-titre">{r.titre}</span>
                </span>
                <span className="reserve-meta">
                  <EtiquetteStatut statut={r.statut} />
                  {estEnRetard(r) && <span className="etiquette retard">En retard</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
