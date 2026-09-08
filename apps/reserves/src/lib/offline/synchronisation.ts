import {
  aEnvoyer, doitAbandonner, etatApresReponse, type IssueServeur, type Mutation,
} from "./contrat";
import {
  changerEtat, type Identite, lirePhoto, listerMutations,
} from "./base-locale";
import { echecsRattrapables } from "./reprise";

/**
 * Moteur de synchronisation — côté navigateur.
 *
 * Il ne décide rien : les règles (quoi envoyer, sous quelle identité, quel état après
 * quelle réponse) sont dans `contrat.ts`, testables sans navigateur. Ce module se
 * contente d'enchaîner lecture locale → requête → écriture locale, et de garantir
 * qu'aucune mutation ne reste bloquée en `en_cours` après un incident.
 */

export type ResultatSynchro = {
  envoyees: number;
  synchronisees: number;
  conflits: number;
  echecs: number;
  /**
   * Vrai quand la passe n'a RIEN TENTÉ parce qu'un autre contexte tenait le verrou.
   *
   * La distinction compte pour la temporisation : un envoi qui échoue justifie d'espacer
   * la reprise, un envoi qui n'a pas eu lieu ne justifie rien du tout. Confondre les deux
   * faisait reculer la cadence à cause d'un simple recouvrement entre deux onglets — la
   * file mettait alors des dizaines de secondes à repartir après un rechargement, là où
   * rien n'était en panne.
   */
  differee: boolean;
};

/** Un seul passage à la fois : deux boucles concurrentes doubleraient les envois. */
let enCours = false;

/**
 * Verrou inter-onglets et inter-navigations.
 *
 * Le drapeau ci-dessus ne protège que le contexte JavaScript courant. Or un rechargement,
 * un second onglet ou un retour arrière rapide créent un NOUVEAU contexte : plusieurs
 * envois de la même mutation peuvent alors se chevaucher. Ils ne produisent pas de
 * doublon — les clés d'idempotence l'interdisent — mais ils se disputent la même ligne en
 * base et finissent en « statement timeout », que l'utilisateur lit comme un échec.
 *
 * Le verrou est posé dans `localStorage`, partagé par tous les contextes de l'origine, et
 * porte un horodatage : un onglet tué ne peut pas bloquer la file au-delà du bail.
 */
const VERROU = "elsatia-reserves::synchro-en-cours";
// Le bail doit couvrir un aller-retour normal SANS immobiliser la file quand un onglet
// est fermé en plein envoi : dans ce cas le `finally` ne s'exécute jamais, et seul
// l'horodatage libère le verrou.
const BAIL_VERROU = 12_000;

function prendreVerrou(): boolean {
  try {
    const depuis = Number(localStorage.getItem(VERROU) ?? "0");
    const age = Date.now() - depuis;
    // `age` NÉGATIF signifie que le verrou a été posé « dans le futur » : l'horloge de
    // l'appareil a reculé — remise à l'heure, fuseau, batterie vidée. Sans ce cas, la
    // comparaison « age < bail » restait vraie et la file était bloquée jusqu'à ce que
    // l'horloge rattrape la date du verrou, ce qui peut prendre des heures. Un verrou
    // venu du futur est un verrou périmé.
    if (Number.isFinite(depuis) && age >= 0 && age < BAIL_VERROU) return false;
    localStorage.setItem(VERROU, String(Date.now()));
    return true;
  } catch {
    // Stockage refusé : on se contente du drapeau local, quitte à laisser passer une
    // concurrence entre onglets. L'idempotence reste, elle, toujours en vigueur.
    return true;
  }
}

function rendreVerrou(): void {
  try { localStorage.removeItem(VERROU); } catch { /* rien à faire */ }
}

type ReponseLot = {
  resultats: {
    id: string;
    issue: "applique" | "rejeu" | "conflit" | "refus";
    identifiant?: string | null;
    motif?: string;
  }[];
};

async function envoyerPhoto(
  identite: Identite, mutation: Mutation, signal?: AbortSignal,
): Promise<IssueServeur> {
  const blob = await lirePhoto(identite, mutation.id);
  if (!blob) {
    // La preuve locale a disparu — quota vidé par le navigateur, base effacée. On ne
    // peut plus rien envoyer : c'est un refus définitif, pas une panne à réessayer.
    return { issue: "refus", motif: "La photo n’est plus disponible sur cet appareil." };
  }
  const corps = new FormData();
  corps.set("mutationId", mutation.id);
  corps.set("reserveId", mutation.reserveId ?? "");
  corps.set("usage", String(mutation.payload.usage ?? "constat"));
  if (typeof mutation.payload.legende === "string") {
    corps.set("legende", mutation.payload.legende);
  }
  corps.set("entrepriseId", mutation.entrepriseId);
  corps.set("utilisateurId", mutation.utilisateurId);
  corps.set("photo", blob, String(mutation.payload.nomFichier ?? "photo.jpg"));

  const reponse = await fetch("/api/offline/photo", { method: "POST", body: corps, signal });
  if (reponse.status === 401) {
    return { issue: "reseau", motif: "Session expirée : reconnectez-vous pour envoyer." };
  }
  const donnees = await reponse.json().catch(() => null) as
    { issue?: string; identifiant?: string; motif?: string } | null;
  if (!donnees) return { issue: "reseau", motif: "Réponse illisible du serveur." };

  if (donnees.issue === "applique") {
    return { issue: "applique", identifiant: donnees.identifiant ?? null };
  }
  if (donnees.issue === "refus") {
    return { issue: "refus", motif: donnees.motif ?? "Photo refusée." };
  }
  return { issue: "reseau", motif: donnees.motif ?? "Dépôt interrompu." };
}

async function envoyerLot(
  mutations: Mutation[], signal?: AbortSignal,
): Promise<Map<string, IssueServeur>> {
  const issues = new Map<string, IssueServeur>();
  const reponse = await fetch("/api/offline/mutations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mutations: mutations.map((m) => ({
        id: m.id, type: m.type, entrepriseId: m.entrepriseId,
        utilisateurId: m.utilisateurId, reserveId: m.reserveId,
        chantierId: m.chantierId, payload: m.payload,
        // La version du format voyage avec la charge utile : le serveur doit pouvoir
        // refuser ce qu'il ne sait pas lire, plutôt que d'en tirer ce qu'il peut.
        version: m.version,
      })),
    }),
    signal,
  });

  if (reponse.status === 401) {
    for (const m of mutations) {
      issues.set(m.id, { issue: "reseau", motif: "Session expirée : reconnectez-vous pour envoyer." });
    }
    return issues;
  }
  const donnees = await reponse.json().catch(() => null) as ReponseLot | null;
  if (!donnees?.resultats) {
    for (const m of mutations) {
      issues.set(m.id, { issue: "reseau", motif: "Réponse illisible du serveur." });
    }
    return issues;
  }
  for (const resultat of donnees.resultats) {
    if (resultat.issue === "applique" || resultat.issue === "rejeu") {
      issues.set(resultat.id, {
        issue: resultat.issue, identifiant: resultat.identifiant ?? null,
      });
    } else if (resultat.issue === "conflit") {
      issues.set(resultat.id, {
        issue: "conflit", motif: resultat.motif ?? "État du serveur incompatible.",
      });
    } else {
      issues.set(resultat.id, { issue: "refus", motif: resultat.motif ?? "Action refusée." });
    }
  }
  return issues;
}

/**
 * Vide la file une fois.
 *
 * Les mutations sont traitées DANS L'ORDRE DE SAISIE : un commentaire préparé après une
 * création de réserve ne peut pas partir avant elle. Les photos sont envoyées une par
 * une — leur corps est binaire et volumineux, les regrouper transformerait une coupure
 * en perte de tout le lot.
 */
export async function synchroniser(
  identite: Identite,
  options: { signal?: AbortSignal } = {},
): Promise<ResultatSynchro> {
  const bilan: ResultatSynchro = {
    envoyees: 0, synchronisees: 0, conflits: 0, echecs: 0, differee: false,
  };
  if (enCours || !prendreVerrou()) return { ...bilan, differee: true };
  enCours = true;
  // Un onglet fermé — ou une navigation — au milieu d'un envoi n'exécute jamais le
  // `finally` ci-dessous : le verrou resterait alors posé pendant tout son bail, et la
  // page suivante attendrait sans raison. `pagehide` est le dernier moment où le
  // navigateur nous laisse parler, et il couvre aussi la mise en cache de la page.
  const liberer = () => rendreVerrou();
  if (typeof window !== "undefined") window.addEventListener("pagehide", liberer);
  try {
    const file = aEnvoyer(await listerMutations(identite), identite);
    for (const mutation of file) {
      if (options.signal?.aborted) break;

      await changerEtat(identite, mutation.id, "en_cours");
      bilan.envoyees += 1;

      let issue: IssueServeur;
      try {
        issue = mutation.type === "photo_ajouter"
          ? await envoyerPhoto(identite, mutation, options.signal)
          : (await envoyerLot([mutation], options.signal)).get(mutation.id)
            ?? { issue: "reseau", motif: "Aucune réponse pour cette action." };
      } catch (erreur) {
        // Réseau coupé EN PLEIN ENVOI : la mutation ne doit pas rester en `en_cours`,
        // sinon elle ne repartirait jamais. Elle redevient rejouable, et son idempotence
        // rend inoffensif le cas où le serveur l'aurait tout de même enregistrée.
        issue = {
          issue: "reseau",
          motif: erreur instanceof Error ? erreur.message : "Envoi interrompu.",
        };
      }

      const tentatives = mutation.tentatives + 1;
      const etat = etatApresReponse(issue);
      await changerEtat(identite, mutation.id, etat, {
        tentatives,
        derniereErreur: "motif" in issue ? issue.motif : null,
        identifiantServeur: "identifiant" in issue ? issue.identifiant : null,
      });

      if (etat === "synchronise") bilan.synchronisees += 1;
      else if (etat === "conflit") bilan.conflits += 1;
      else bilan.echecs += 1;
    }
    return bilan;
  } finally {
    enCours = false;
    if (typeof window !== "undefined") window.removeEventListener("pagehide", liberer);
    rendreVerrou();
  }
}

/**
 * Répare la file au démarrage.
 *
 * Une mutation laissée en `en_cours` signifie que l'application s'est arrêtée pendant un
 * envoi — onglet fermé, navigateur tué, batterie vide. Sans cette reprise, elle resterait
 * bloquée dans cet état pour toujours et l'utilisateur croirait son constat transmis.
 * On la remet en attente : le rejeu est sûr, puisque toutes les actions sont idempotentes.
 */
export async function reprendreApresRedemarrage(identite: Identite): Promise<number> {
  const mutations = await listerMutations(identite);
  let reprises = 0;
  for (const mutation of mutations) {
    if (mutation.etat !== "en_cours") continue;
    // `en_cours → echec` est autorisé par la machine à états ; on repasse ensuite en
    // attente, ce qui laisse une trace de l'interruption dans `derniereErreur`.
    await changerEtat(identite, mutation.id, "echec", {
      derniereErreur: "Envoi interrompu par la fermeture de l’application.",
    });
    if (!doitAbandonner(mutation)) {
      await changerEtat(identite, mutation.id, "en_attente");
    }
    reprises += 1;
  }
  return reprises;
}

/**
 * Remise en file d'un échec, à la demande explicite de l'utilisateur.
 *
 * Le compteur de tentatives est REMIS À ZÉRO. Ce n'est pas une complaisance : le plafond
 * de tentatives borne les reprises AUTOMATIQUES, pour qu'un refus définitif ne tourne pas
 * en boucle. Un geste humain, lui, est une décision — souvent prise parce que la cause a
 * été levée entre-temps (session rouverte, réseau retrouvé, droit rendu). Sans cette
 * remise à zéro, une mutation ayant épuisé son budget serait renvoyée une fois puis
 * abandonnée aussitôt, sans que rien ne l'explique à l'écran.
 */
export async function reessayer(identite: Identite, id: string): Promise<void> {
  await changerEtat(identite, id, "en_attente", { derniereErreur: null, tentatives: 0 });
}

/**
 * Rattrapage automatique des échecs, avant une tentative de synchronisation.
 *
 * En V5, une mutation tombée en `echec` n'y sortait QUE par un clic. Or l'échec le plus
 * courant sur un chantier n'est pas un refus : c'est une session expirée ou un envoi
 * coupé en plein vol — deux causes qui disparaissent d'elles-mêmes. L'utilisateur, lui,
 * a rangé son téléphone : il ne cliquera pas.
 *
 * On remet donc en file les échecs qui n'ont pas épuisé leur budget de tentatives. Le
 * plafond est ce qui empêche cette commodité de devenir une boucle : un refus métier
 * s'arrête après cinq passages et attend une décision, avec son motif affiché.
 */
export async function rattraperEchecs(identite: Identite): Promise<number> {
  const rattrapables = echecsRattrapables(await listerMutations(identite));
  let remises = 0;
  for (const mutation of rattrapables) {
    try {
      await changerEtat(identite, mutation.id, "en_attente");
      remises += 1;
    } catch {
      // Transition refusée par la machine à états : on laisse la mutation où elle est.
    }
  }
  return remises;
}
