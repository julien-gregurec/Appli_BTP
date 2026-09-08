import type { Metadata } from "next";
import Link from "next/link";
import { exigerShellReserves, estCompteIntervenant } from "@/lib/acces-reserves";
import { lireCompteurs, listerChantiers, listerReserves } from "@/lib/donnees";
import { EtiquetteStatut } from "@/components/Etiquette";
import { SemeurCache } from "@/components/offline/SemeurCache";
import { estEnRetard } from "@/lib/workflow";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function PageDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const contexte = await exigerShellReserves();
  const intervenant = estCompteIntervenant(contexte.roleReserves);

  const filtres = {
    chantierId: typeof params.chantier === "string" ? params.chantier : null,
    statut: typeof params.statut === "string" ? params.statut : null,
    priorite: typeof params.priorite === "string" ? params.priorite : null,
    echeanceAvant: typeof params.avant === "string" ? params.avant : null,
  };

  const [compteurs, chantiers, dernieres] = await Promise.all([
    lireCompteurs(intervenant ? null : contexte.entrepriseId, filtres),
    intervenant ? Promise.resolve([]) : listerChantiers(),
    listerReserves(filtres),
  ]);

  const enRetard = dernieres.filter((r) => estEnRetard(r));

  return (
    <>
      {/* Ce que cet écran vient d'afficher est recopié dans la base locale de
          l'utilisateur : c'est ce qui le rend consultable après une perte de réseau.
          Aucune requête supplémentaire, et donc aucune donnée qui ne soit déjà
          autorisée pour cette session. */}
      <SemeurCache
        chantiers={chantiers.map((c) => ({
          id: c.id, nom: c.nom, reference: c.reference ?? null, ville: c.ville ?? null,
        }))}
        reserves={dernieres.map((r) => ({
          id: r.id, chantierId: r.chantier_id, numero: r.numero, titre: r.titre,
          description: r.description ?? null, statut: r.statut, priorite: r.priorite,
          intervenant: null, echeance: r.echeance ?? null,
          plan: null, planPage: r.plan_page ?? null,
        }))}
      />
      <h1>{intervenant ? "Vos réserves" : "Tableau de bord"}</h1>
      <p className="sous-titre">
        {intervenant
          ? "Uniquement les réserves attribuées à votre entreprise."
          : `${contexte.entrepriseNom} — vue d’ensemble des réserves en cours.`}
      </p>

      {/* Les compteurs sont ordonnés par ce qu'ils APPELLENT comme geste, pas par état :
          « à traiter » d'abord, « levées » loin derrière. Un tableau de bord qui commence
          par le total ne dit pas quoi faire aujourd'hui. */}
      {compteurs ? (
        <div className="compteurs">
          <div className={compteurs.a_traiter > 0 ? "compteur alerte" : "compteur"}>
            <b>{compteurs.a_traiter}</b><span>À traiter</span>
          </div>
          <div className={compteurs.en_retard > 0 ? "compteur alerte" : "compteur"}>
            <b>{compteurs.en_retard}</b><span>En retard</span>
          </div>
          <div className="compteur"><b>{compteurs.echeance_proche}</b><span>Échéance sous 7 jours</span></div>
          <div className="compteur"><b>{compteurs.demandes_levee}</b><span>Demandes de levée</span></div>
          <div className="compteur"><b>{compteurs.refusees}</b><span>Responsabilité refusée</span></div>
          <div className="compteur"><b>{compteurs.messages_non_lus}</b><span>Messages non lus</span></div>
          <div className="compteur"><b>{compteurs.en_attente}</b><span>En attente de vous</span></div>
          <div className="compteur"><b>{compteurs.levees}</b><span>Levées</span></div>
          <div className="compteur"><b>{compteurs.total}</b><span>Total</span></div>
          {!intervenant && compteurs.invitations_a_suivre > 0 && (
            <div className="compteur"><b>{compteurs.invitations_a_suivre}</b><span>Invitations en attente</span></div>
          )}
        </div>
      ) : (
        <p className="vide">Aucun compteur disponible pour cette session.</p>
      )}

      {compteurs && (compteurs.messages_non_lus > 0 || compteurs.notifications_non_lues > 0) && (
        <p className="message">
          {compteurs.notifications_non_lues > 0 && (
            <>
              <Link href="/notifications">
                {compteurs.notifications_non_lues} notification
                {compteurs.notifications_non_lues > 1 ? "s" : ""} non lue
                {compteurs.notifications_non_lues > 1 ? "s" : ""}
              </Link>
              {compteurs.messages_non_lus > 0 ? " · " : "."}
            </>
          )}
          {compteurs.messages_non_lus > 0 && (
            <>
              <Link href="/messages">
                {compteurs.messages_non_lus} message{compteurs.messages_non_lus > 1 ? "s" : ""} non lu
                {compteurs.messages_non_lus > 1 ? "s" : ""}
              </Link>.
            </>
          )}
        </p>
      )}

      <h2>Filtrer</h2>
      <form className="carte" method="get">
        {!intervenant && (
          <label>
            Chantier
            <select name="chantier" defaultValue={filtres.chantierId ?? ""}>
              <option value="">Tous les chantiers</option>
              {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
        )}
        <label>
          Statut
          <select name="statut" defaultValue={filtres.statut ?? ""}>
            <option value="">Tous les statuts</option>
            <option value="emise">Émise</option>
            <option value="assignee">Assignée</option>
            <option value="refusee_responsabilite">Responsabilité refusée</option>
            <option value="acceptee">Acceptée</option>
            <option value="levee_demandee">Levée demandée</option>
            <option value="levee_refusee">Levée refusée</option>
            <option value="levee">Levée</option>
          </select>
        </label>
        <label>
          Priorité
          <select name="priorite" defaultValue={filtres.priorite ?? ""}>
            <option value="">Toutes</option>
            <option value="basse">Basse</option>
            <option value="normale">Normale</option>
            <option value="haute">Haute</option>
            <option value="bloquante">Bloquante</option>
          </select>
        </label>
        <label>
          Échéance avant le
          <input type="date" name="avant" defaultValue={filtres.echeanceAvant ?? ""} />
        </label>
        <div className="actions">
          <button className="bouton" type="submit">Appliquer</button>
          <Link className="bouton secondaire" href="/dashboard">Réinitialiser</Link>
        </div>
      </form>

      {enRetard.length > 0 && (
        <>
          <h2>En retard</h2>
          <ul className="liste">
            {enRetard.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link className={`reserve p-${r.priorite}`} href={`/reserves/${r.id}`}>
                  <span className="reserve-tete">
                    <span className="reserve-num">n°{r.numero}</span>
                    <span className="reserve-titre">{r.titre}</span>
                  </span>
                  <span className="reserve-meta">
                    <EtiquetteStatut statut={r.statut} />
                    <span className="etiquette retard">Échéance {r.echeance}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>{dernieres.length} réserve{dernieres.length > 1 ? "s" : ""}</h2>
      {dernieres.length === 0 ? (
        <p className="vide">Aucune réserve ne correspond à ces filtres.</p>
      ) : (
        <ul className="liste">
          {dernieres.slice(0, 25).map((r) => (
            <li key={r.id}>
              <Link className={`reserve p-${r.priorite}`} href={`/reserves/${r.id}`}>
                <span className="reserve-tete">
                  <span className="reserve-num">n°{r.numero}</span>
                  <span className="reserve-titre">{r.titre}</span>
                </span>
                <span className="reserve-meta">
                  <EtiquetteStatut statut={r.statut} />
                  {r.echeance && <span>Échéance {r.echeance}</span>}
                  {r.photo_obligatoire_levee && <span>Photo exigée pour la levée</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
