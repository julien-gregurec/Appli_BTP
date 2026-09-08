import Link from "next/link";
import { getContexteColors } from "@/lib/contexte";
import { listerActeursColors, listerActiviteColors, listerEmplacementsColors } from "@/lib/metier-colors";
import {
  borneDepuis,
  curseurSuivant,
  FAMILLES,
  grouperParJour,
  libelleChamp,
  libelleType,
  lireFamille,
  lireInstant,
  lirePeriode,
  lireUuid,
  PERIODES,
  resumerEvenement,
  TAILLE_PAGE_ACTIVITE,
  typesDeFamille,
  valeurAffichable,
  type EvenementActiviteColors,
} from "@/lib/activite-colors";

type Recherche = { periode?: string; famille?: string; auteur?: string; emplacement?: string; avant?: string; avantId?: string };

const jourLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const heure = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/**
 * Détail d'un événement : pour une modification, l'ancienne et la nouvelle
 * valeur champ par champ ; pour le reste, le résumé d'une ligne.
 */
function DetailEvenement({ evenement }: { evenement: EvenementActiviteColors }) {
  const champs = evenement.champs_modifies ?? [];
  if (champs.length === 0) {
    const resume = resumerEvenement(evenement);
    return resume ? <span className="activity-summary">{resume}</span> : null;
  }
  return (
    <ul className="activity-diff">
      {champs.map((champ) => (
        <li key={champ.champ}>
          <span className="activity-field">{libelleChamp(champ.champ)}</span>
          <span className="activity-before">{valeurAffichable(champ.avant)}</span>
          <span aria-hidden="true">→</span>
          <span className="activity-after">{valeurAffichable(champ.apres)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ActivitePage({ searchParams }: { searchParams: Promise<Recherche> }) {
  const [contexte, f] = await Promise.all([getContexteColors(), searchParams]);
  if (!contexte.entrepriseId) return null;

  const periode = lirePeriode(f.periode);
  const famille = lireFamille(f.famille);
  const auteurId = lireUuid(f.auteur);
  const emplacementId = lireUuid(f.emplacement);
  const avant = lireInstant(f.avant);
  const avantId = lireUuid(f.avantId);

  const [evenements, acteurs, emplacements] = await Promise.all([
    listerActiviteColors(contexte.entrepriseId, {
      depuis: borneDepuis(periode),
      types: typesDeFamille(famille),
      auteurId,
      emplacementId,
      limite: TAILLE_PAGE_ACTIVITE,
      avant,
      avantId,
    }),
    listerActeursColors(contexte.entrepriseId),
    listerEmplacementsColors(contexte.entrepriseId),
  ]);

  const groupes = grouperParJour(evenements);
  const suivant = curseurSuivant(evenements);
  const filtresCourants = new URLSearchParams();
  if (periode !== "30j") filtresCourants.set("periode", periode);
  if (famille !== "tout") filtresCourants.set("famille", famille);
  if (auteurId) filtresCourants.set("auteur", auteurId);
  if (emplacementId) filtresCourants.set("emplacement", emplacementId);
  const lienSuivant = suivant
    ? `/activite?${new URLSearchParams({ ...Object.fromEntries(filtresCourants), avant: suivant.avant, avantId: suivant.avantId }).toString()}`
    : null;
  const lienDebut = `/activite${filtresCourants.toString() ? `?${filtresCourants.toString()}` : ""}`;

  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Traçabilité</span>
          <h1>Activité récente</h1>
          <p>Qui a ajouté, modifié, déplacé, supprimé ou restauré un produit — et ce qui a changé exactement.</p>
        </div>
        <Link className="outline-button" href="/inventaire">Retour à l’inventaire</Link>
      </header>

      <form className="filter-bar">
        <label>Période
          <select name="periode" defaultValue={periode}>
            {PERIODES.map((p) => <option key={p.valeur} value={p.valeur}>{p.libelle}</option>)}
          </select>
        </label>
        <label>Type d’événement
          <select name="famille" defaultValue={famille}>
            {FAMILLES.map((x) => <option key={x.valeur} value={x.valeur}>{x.libelle}</option>)}
          </select>
        </label>
        <label>Utilisateur
          <select name="auteur" defaultValue={auteurId ?? ""}>
            <option value="">Tous</option>
            {acteurs.map((a) => <option key={a.auteur_id} value={a.auteur_id}>{a.auteur_nom}</option>)}
          </select>
        </label>
        <label>Emplacement
          <select name="emplacement" defaultValue={emplacementId ?? ""}>
            <option value="">Tous</option>
            {emplacements.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </label>
        <button className="primary-action">Filtrer</button>
      </form>

      {avant && <p className="activity-cursor"><Link href={lienDebut}>Revenir aux événements les plus récents</Link></p>}

      {groupes.map((groupe) => (
        <section className="activity-day" key={groupe.jour}>
          <h2>{jourLong.format(new Date(`${groupe.jour}T12:00:00`))}</h2>
          <ol className="activity-list">
            {groupe.evenements.map((evenement) => (
              <li className={`activity-card type-${evenement.type}`} key={evenement.id}>
                <span className="activity-swatch" style={{ background: evenement.seau_couleur_hex ?? "#e9e2e7" }} aria-hidden="true" />
                <div className="activity-body">
                  <div className="activity-head">
                    <span className="badge">{libelleType(evenement.type)}</span>
                    <time dateTime={evenement.created_at}>{heure.format(new Date(evenement.created_at))}</time>
                  </div>
                  <Link className="activity-product" href={`/inventaire/${evenement.seau_id}`}>
                    {evenement.seau_marque} — {evenement.seau_produit}
                    {evenement.seau_teinte ? <small> · {evenement.seau_teinte}</small> : null}
                  </Link>
                  <DetailEvenement evenement={evenement} />
                  <div className="activity-meta">
                    <span>{evenement.auteur_nom ?? "Utilisateur Colors"}</span>
                    {evenement.motif ? <span>{evenement.motif}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {evenements.length === 0 && (
        <div className="empty-state">
          <strong>Aucun événement sur cette période.</strong>
          <span>Élargissez la période ou retirez un filtre.</span>
        </div>
      )}

      {lienSuivant && <p className="activity-cursor"><Link className="outline-button" href={lienSuivant}>Charger les événements plus anciens</Link></p>}
    </>
  );
}
