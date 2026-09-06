import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves, peutGererChantiers } from "@/lib/acces-reserves";
import { listerChantiers } from "@/lib/donnees";

export const metadata: Metadata = { title: "Chantiers" };

export default async function PageChantiers() {
  const contexte = await exigerShellReserves();
  const chantiers = await listerChantiers();
  const gestion = peutGererChantiers(contexte.roleReserves);

  return (
    <>
      <h1>Chantiers</h1>
      <p className="sous-titre">
        Réserves gère ses propres chantiers. Ceux repris de Gestion Pro sont signalés
        comme tels ; l’application fonctionne sans lui.
      </p>
      {chantiers.length === 0 ? (
        <p className="vide">
          Aucun chantier pour l’instant.
          {gestion ? " Créez-en un pour commencer à constater des réserves." : ""}
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
