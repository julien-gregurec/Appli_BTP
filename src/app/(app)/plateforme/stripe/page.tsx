import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin, statutAbonnement } from "@/lib/plateforme";
import { BRAND_NAME } from "@/lib/brand";
import {
  abonnementsSilencieux,
  dernierEvenementParEntreprise as indexerDernierEvenement,
  joursDepuis,
  modeDepuisPayload,
  texteDepuisPayload,
  JOURS_SILENCE_ALERTE,
  STATUTS_FACTURE_EN_ECHEC,
} from "@/lib/diagnostic-stripe";

// Vue opérateur — diagnostic Stripe / webhooks abonnement.
//
// LECTURE SEULE. Aucune action, aucune écriture, aucun appel Stripe : cette page
// n'expose que ce que la base contient déjà, sous les mêmes RLS que le reste de
// l'espace plateforme. Elle n'affiche JAMAIS de secret webhook, de clé Stripe ni
// de donnée bancaire — les identifiants Stripe (cus_/sub_/in_) sont des
// références opaques, déjà visibles sur /plateforme.
//
// Limite structurelle à connaître (voir docs/operations/DIAGNOSTIC_STRIPE_WEBHOOKS_V1.md) :
// le journal `abonnement_evenements` ne conserve que les évènements TRAITÉS. Un
// évènement dont le traitement métier échoue est retiré du journal pour rester
// rejouable ; il n'apparaît donc pas ici, seulement dans les logs serveur et
// dans le tableau de bord Stripe. Le signal exploitable ici est l'ABSENCE
// d'évènement récent sur un abonnement actif.

type EntrepriseStripe = {
  id: string;
  nom: string;
  abonnement_statut: string;
  abonnement_offre: string | null;
  abonnement_periodicite: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  derniere_facture_statut: string | null;
  derniere_facture_url: string | null;
  suspension_prevue_at: string | null;
};
type EvenementAbonnement = {
  id: string;
  entreprise_id: string | null;
  stripe_event_id: string;
  type: string;
  statut_resultant: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};
type FactureAbonnement = {
  id: string;
  entreprise_id: string;
  numero: string | null;
  statut: string;
  montant_ttc: number;
  devise: string;
  url_facture: string | null;
  created_at: string;
};
type OperationCapacite = {
  id: string;
  entreprise_id: string;
  type_operation: string;
  statut: string;
  erreur_courte: string | null;
  nombre_tentatives?: number | null;
  updated_at: string;
};

const carte = "rounded-lg border border-neutral-200 p-4 dark:border-neutral-800";
const cellule = "px-3 py-2 align-top";

function instant(valeur: string | null | undefined) {
  if (!valeur) return "—";
  const date = new Date(valeur);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Un identifiant Stripe n'est pas un secret, mais on n'en affiche que la forme
// utile au rapprochement dans le tableau de bord Stripe.
function reference(valeur: string | null | undefined) {
  const nettoyee = valeur?.trim();
  return nettoyee ? nettoyee : "—";
}

export default async function PlateformeStripePage() {
  if (!(await estPlateformeAdmin())) notFound();
  const supabase = await createClient();
  const prototype = isEmailLoginDisabled();

  const colonnes =
    "id, nom, abonnement_statut, abonnement_offre, abonnement_periodicite, stripe_customer_id, stripe_subscription_id, derniere_facture_statut, derniere_facture_url, suspension_prevue_at";
  const { data: entreprisesData } = prototype
    ? await supabase.from("entreprises").select(colonnes).order("nom")
    : await supabase.rpc("plateforme_entreprises");
  const entreprises = ((entreprisesData ?? []) as EntrepriseStripe[]).filter((e) => e.stripe_customer_id || e.stripe_subscription_id);

  const [{ data: evenementsData }, { data: facturesData }, { data: operationsData }] = await Promise.all([
    supabase
      .from("abonnement_evenements")
      .select("id, entreprise_id, stripe_event_id, type, statut_resultant, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("factures_abonnement")
      .select("id, entreprise_id, numero, statut, montant_ttc, devise, url_facture, created_at")
      .in("statut", [...STATUTS_FACTURE_EN_ECHEC])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("operations_capacite_stripe")
      .select("id, entreprise_id, type_operation, statut, erreur_courte, nombre_tentatives, updated_at")
      .not("statut", "in", "(completed,failed)")
      .order("updated_at", { ascending: false })
      .limit(25),
  ]);

  const evenements = (evenementsData ?? []) as EvenementAbonnement[];
  const facturesEnEchec = (facturesData ?? []) as FactureAbonnement[];
  const operations = (operationsData ?? []) as OperationCapacite[];

  const nomParEntreprise = new Map(entreprises.map((e) => [e.id, e.nom]));
  const dernierEvenement = indexerDernierEvenement(evenements);
  const silencieuses = abonnementsSilencieux(entreprises, dernierEvenement);
  const idsSilencieuses = new Set(silencieuses.map((e) => e.id));
  const aReconcilier = operations.filter((o) => o.statut === "needs_reconcile");

  return (
    <main className="p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Diagnostic Stripe &amp; webhooks</h1>
            <p className="text-sm text-neutral-500">
              État de la synchronisation Stripe ↔ {BRAND_NAME}. Lecture seule : cette page ne déclenche aucune action.
            </p>
          </div>
          <Link href="/plateforme" className="rounded-md border px-3 py-2 text-sm font-medium">← Plateforme</Link>
        </div>

        {prototype && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            Mode prototype : le journal des évènements est vide tant qu&apos;aucune session plateforme réelle n&apos;est ouverte.
          </p>
        )}

        <section className="grid gap-3 sm:grid-cols-4">
          {[
            { libelle: "Entreprises reliées à Stripe", valeur: entreprises.length },
            { libelle: `Sans évènement depuis ${JOURS_SILENCE_ALERTE} j`, valeur: silencieuses.length, alerte: silencieuses.length > 0 },
            { libelle: "Factures non réglées", valeur: facturesEnEchec.length, alerte: facturesEnEchec.length > 0 },
            { libelle: "Opérations à réconcilier", valeur: aReconcilier.length, alerte: aReconcilier.length > 0 },
          ].map((indicateur) => (
            <div key={indicateur.libelle} className={`${carte} ${indicateur.alerte ? "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20" : ""}`}>
              <p className="text-2xl font-semibold">{indicateur.valeur}</p>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{indicateur.libelle}</p>
            </div>
          ))}
        </section>

        <section className={carte}>
          <h2 className="font-semibold">Abonnements reliés à Stripe</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Un abonnement actif sans évènement récent signale une livraison de webhook interrompue : vérifier l&apos;endpoint dans le tableau de bord Stripe.
          </p>
          {entreprises.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucune entreprise reliée à Stripe.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className={cellule}>Entreprise</th>
                    <th className={cellule}>Statut</th>
                    <th className={cellule}>Customer</th>
                    <th className={cellule}>Subscription</th>
                    <th className={cellule}>Dernière facture</th>
                    <th className={cellule}>Dernier évènement</th>
                  </tr>
                </thead>
                <tbody>
                  {entreprises.map((e) => {
                    const dernier = dernierEvenement.get(e.id);
                    const jours = joursDepuis(dernier?.created_at);
                    const silencieuse = idsSilencieuses.has(e.id);
                    const statut = statutAbonnement(e.abonnement_statut);
                    return (
                      <tr key={e.id} className={`border-t border-neutral-200 dark:border-neutral-800 ${silencieuse ? "bg-red-50/50 dark:bg-red-950/10" : ""}`}>
                        <td className={cellule}>
                          <span className="font-medium">{e.nom}</span>
                          {e.abonnement_offre && <span className="block text-xs text-neutral-500">{e.abonnement_offre} · {e.abonnement_periodicite ?? "périodicité inconnue"}</span>}
                        </td>
                        <td className={cellule}><span style={{ color: statut.couleur }} className="font-medium">{statut.libelle}</span></td>
                        <td className={`${cellule} font-mono text-xs`}>{reference(e.stripe_customer_id)}</td>
                        <td className={`${cellule} font-mono text-xs`}>{reference(e.stripe_subscription_id)}</td>
                        <td className={cellule}>
                          {e.derniere_facture_statut ?? "—"}
                          {e.derniere_facture_url && (
                            <Link href={e.derniere_facture_url} target="_blank" rel="noreferrer" className="ml-2 text-xs underline">ouvrir</Link>
                          )}
                        </td>
                        <td className={cellule}>
                          {dernier ? (
                            <>
                              <span className="block text-xs">{dernier.type}</span>
                              <span className="block text-xs text-neutral-500">{instant(dernier.created_at)}{jours !== null ? ` · ${jours} j` : ""}</span>
                            </>
                          ) : (
                            <span className="text-xs text-red-700 dark:text-red-300">aucun évènement journalisé</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={carte}>
          <h2 className="font-semibold">Derniers évènements webhook traités</h2>
          <p className="mt-1 text-xs text-neutral-500">
            50 derniers évènements enregistrés. Les évènements en échec métier sont retirés du journal pour rester rejouables : ils ne figurent pas ici.
          </p>
          {evenements.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucun évènement journalisé.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className={cellule}>Reçu le</th>
                    <th className={cellule}>Type</th>
                    <th className={cellule}>Entreprise</th>
                    <th className={cellule}>Statut résultant</th>
                    <th className={cellule}>Mode</th>
                    <th className={cellule}>Objet Stripe</th>
                  </tr>
                </thead>
                <tbody>
                  {evenements.map((evenement) => (
                    <tr key={evenement.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className={cellule}>{instant(evenement.created_at)}</td>
                      <td className={`${cellule} font-mono text-xs`}>{evenement.type}</td>
                      <td className={cellule}>{evenement.entreprise_id ? nomParEntreprise.get(evenement.entreprise_id) ?? "—" : "—"}</td>
                      <td className={cellule}>{evenement.statut_resultant ?? <span className="text-neutral-400">sans effet sur le statut</span>}</td>
                      <td className={cellule}>{modeDepuisPayload(evenement.payload) ?? "—"}</td>
                      <td className={`${cellule} font-mono text-xs`}>
                        {texteDepuisPayload(evenement.payload, "subscription_id") ?? texteDepuisPayload(evenement.payload, "object_id") ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={carte}>
          <h2 className="font-semibold">Factures d&apos;abonnement non réglées</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Le client est notifié par e-mail à chaque échec de paiement. La relance et l&apos;encaissement restent pilotés par Stripe.
          </p>
          {facturesEnEchec.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucune facture en attente de règlement.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {facturesEnEchec.map((facture) => (
                <li key={facture.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                  <span>
                    <strong>{nomParEntreprise.get(facture.entreprise_id) ?? "Entreprise inconnue"}</strong>
                    <span className="ml-2 text-xs text-neutral-500">{facture.numero ?? "sans numéro"} · {instant(facture.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    <span>{Number(facture.montant_ttc).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {facture.devise} TTC</span>
                    <span className="rounded bg-red-50 px-2 py-1 font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">{facture.statut}</span>
                    {facture.url_facture && <Link href={facture.url_facture} target="_blank" rel="noreferrer" className="underline">facture</Link>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={carte}>
          <h2 className="font-semibold">Opérations de capacité non finalisées</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Les opérations « needs_reconcile » sont reprises automatiquement par la tâche planifiée des abonnements. Une opération qui persiste plusieurs jours doit être analysée avant toute intervention manuelle.
          </p>
          {operations.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Aucune opération en cours.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {operations.map((operation) => (
                <li key={operation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
                  <span>
                    <strong>{nomParEntreprise.get(operation.entreprise_id) ?? "Entreprise inconnue"}</strong>
                    <span className="ml-2 text-xs text-neutral-500">{operation.type_operation} · {instant(operation.updated_at)}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs">
                    {operation.erreur_courte && <span className="font-mono text-neutral-500">{operation.erreur_courte}</span>}
                    <span className={`rounded px-2 py-1 font-medium ${operation.statut === "needs_reconcile" ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                      {operation.statut}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-neutral-500">
          Procédure détaillée : <code>docs/operations/DIAGNOSTIC_STRIPE_WEBHOOKS_V1.md</code>. Aucune clé ni secret Stripe n&apos;est consultable depuis cette interface.
        </p>
      </div>
    </main>
  );
}
