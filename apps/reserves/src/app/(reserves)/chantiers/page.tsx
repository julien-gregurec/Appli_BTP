import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves, peutGererChantiers } from "@/lib/acces-reserves";
import { listerChantiers } from "@/lib/donnees";

export const metadata: Metadata = { title: "Chantiers" };

export default async function PageChantiers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contexte = await exigerShellReserves();
  const tous = await listerChantiers();
  const gestion = peutGererChantiers(contexte.roleReserves);

  const etat = typeof query.etat === "string" ? query.etat : "en_cours";
  const recherche = (typeof query.q === "string" ? query.q : "").trim().toLowerCase();

  // Filtrage et recherche côté serveur : la liste reste celle que les RLS ont autorisée,
  // on ne fait qu'y appliquer le tri de confort demandé par l'utilisateur.
  const chantiers = tous.filter((c) => {
    if (etat !== "tous" && c.statut !== etat) return false;
    if (!recherche) return true;
    return [c.nom, c.reference, c.ville]
      .filter(Boolean)
      .some((champ) => (champ as string).toLowerCase().includes(recherche));
  });

  return (
    <>
      <h1>Mes chantiers</h1>
      <p className="sous-titre">
        Réserves gère ses propres chantiers. Ceux repris de Gestion Pro sont signalés
        comme tels ; l’application fonctionne sans lui.
      </p>

      {gestion && (
        <div className="actions">
          <Link className="bouton" href="/chantiers/nouveau">Nouveau chantier</Link>
        </div>
      )}

      <form className="carte" method="get">
        <label>
          Rechercher
          <input name="q" defaultValue={recherche} placeholder="Nom, référence ou ville" />
        </label>
        <label>
          État
          <select name="etat" defaultValue={etat}>
            <option value="en_cours">Actifs</option>
            <option value="receptionne">Réceptionnés</option>
            <option value="clos">Clos</option>
            <option value="tous">Tous</option>
          </select>
        </label>
        <div className="actions">
          <button className="bouton" type="submit">Filtrer</button>
          <Link className="bouton secondaire" href="/chantiers">Réinitialiser</Link>
        </div>
      </form>
      {chantiers.length === 0 ? (
        <p className="vide">
          {tous.length === 0
            ? gestion
              ? "Aucun chantier pour l’instant. Créez-en un pour commencer à constater des réserves."
              : "Aucun chantier pour l’instant."
            : "Aucun chantier ne correspond à cette recherche."}
        </p>
      ) : (
        <ul className="liste">
          {chantiers.map((c) => (
            <li key={c.id}>
              <Link className="reserve" href={`/chantiers/${c.id}`}>
                <span className="reserve-tete">
                  <span className="reserve-titre">{c.nom}</span>
                  {c.source === "gestion_pro" && <span className="etiquette">Gestion Pro</span>}
                </span>
                <span className="reserve-meta">
                  <span>{c.compteur_reserves} réserve{c.compteur_reserves > 1 ? "s" : ""}</span>
                  {c.ville && <span>{c.ville}</span>}
                  <span className="etiquette">{c.statut === "en_cours" ? "En cours" : c.statut === "receptionne" ? "Réceptionné" : "Clos"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
