"use client";

/**
 * Vidange de la file hors-ligne.
 *
 * La logique de DÉCISION n'est pas ici : elle vit dans `contrat.ts`, qui est pur. Ce module
 * ne fait qu'orchestrer — lire la file, poster, écrire le nouvel état.
 *
 * ── Quand la reprise se déclenche ───────────────────────────────────────────────────────
 *
 * À l'ouverture de l'application, et au retour du réseau. JAMAIS en tâche de fond.
 *
 * `Background Sync` existe sur Android et n'existe pas sur iOS. S'en servir donnerait deux
 * comportements différents à deux salariés de la même équipe selon leur téléphone : l'un
 * verrait ses pointages partir seuls, l'autre devrait ouvrir l'application. Une règle
 * unique, même moins puissante, est préférable à une règle qui dépend du matériel — ne
 * serait-ce que parce qu'elle est explicable en une phrase à celui qui s'en sert.
 */
import {
  delaiAvantNouvelleTentative,
  etatApresReponse,
  peutPartirSous,
  reponseEstPerteDeSession,
  transitionAutorisee,
  type IssueServeur,
  type MutationLocale,
} from "@/lib/mobile/offline/contrat";
import {
  changerEtat,
  lireMutations,
  lireMutationsEnSuspens,
  ouvrirBase,
  type IdentiteBase,
} from "@/lib/mobile/offline/base-locale";
import { transmettreNoteAvecJustificatifs } from "@/lib/mobile/offline/synchro-justificatifs";

/**
 * Une note porteuse de justificatif NE PASSE PAS par la route de rejeu simple.
 *
 * Cette route créerait la note et répondrait « appliqué » : la mutation serait marquée
 * synchronisée alors que sa photo n'est jamais partie. C'est très exactement la réserve R3 —
 * une note transmise sans son fichier en donnant l'impression que l'opération est complète.
 * Ces mutations suivent donc leur propre chemin, en trois temps, qui ne déclare rien
 * synchronisé avant le dépôt du dernier fichier.
 */
function porteJustificatif(mutation: MutationLocale): boolean {
  return mutation.type === "note_frais_brouillon" && mutation.payload?.avec_justificatif === true;
}

const POINT_ENTREE = "/api/mobile/offline/mutations";
const TAILLE_LOT = 25;

export type ResultatVidange = {
  tentees: number;
  synchronisees: number;
  enConflit: number;
  enEchec: number;
  /** Vrai quand rien n'est parti faute de réseau ou de service : il n'y a rien à annoncer. */
  reporte: boolean;
};

const VIDE: ResultatVidange = { tentees: 0, synchronisees: 0, enConflit: 0, enEchec: 0, reporte: false };

/** Une mutation en échec n'est retentée qu'après son délai de recul. */
function estPrete(mutation: MutationLocale, maintenant: number): boolean {
  if (mutation.etat === "en_attente") return true;
  if (mutation.etat !== "echec") return false;
  return maintenant - mutation.capteA >= delaiAvantNouvelleTentative(mutation.tentatives);
}

export async function viderLaFile(identite: IdentiteBase): Promise<ResultatVidange> {
  const base = await ouvrirBase(identite);
  if (!base) return VIDE;

  try {
    // ── Reprise des envois interrompus ─────────────────────────────────────────────
    //
    // Une mutation reste « en_cours » si l'envoi a été coupé net : application fermée,
    // téléphone mis en veille, onglet évincé — des gestes banaux sur le terrain. Aucune
    // règle ne la reprenait : `estPrete` n'accepte que « en_attente » et « echec ». Elle
    // restait donc bloquée POUR TOUJOURS, sans que rien ne le signale.
    //
    // On la rend à la file au début de chaque vidange. C'est sûr parce que le serveur est
    // idempotent — c'est tout l'objet de la clé fournie par l'appareil : si l'envoi coupé
    // avait en réalité abouti, le renvoi sera lu comme un rejeu, pas comme un doublon.
    for (const m of await lireMutations(base)) {
      if (m.etat === "en_cours") await changerEtat(base, m.id, "en_attente", m.motif);
    }

    const maintenant = Date.now();
    const candidates = (await lireMutationsEnSuspens(base))
      .filter((m) => estPrete(m, maintenant))
      // Garde de dernier recours. La base est déjà nommée par l'identité, donc ce filtre ne
      // devrait jamais rien retirer. Il coûte une comparaison et couvre le cas où une base
      // aurait été ouverte pour la mauvaise identité : mieux vaut ne rien envoyer.
      .filter((m) => peutPartirSous(m, identite))
      .slice(0, TAILLE_LOT);

    if (candidates.length === 0) return VIDE;

    // D'abord les notes avec justificatif, une par une, par leur chemin dédié.
    const avecFichier = candidates.filter(porteJustificatif);
    let synchroniseesFichiers = 0, conflitsFichiers = 0, echecsFichiers = 0;
    for (const mutation of avecFichier) {
      const type = typeof mutation.payload?.type_document === "string" ? mutation.payload.type_document : "ticket_caisse";
      const issue = await transmettreNoteAvecJustificatifs(base, identite, mutation, type);
      if (issue.etape === "synchronise") synchroniseesFichiers += 1;
      else if (issue.etape === "conflit") conflitsFichiers += 1;
      else if (issue.etape === "a_corriger") echecsFichiers += 1;
      else if (issue.motif) await changerEtat(base, mutation.id, "en_attente", issue.motif);
    }

    const simples = candidates.filter((m) => !porteJustificatif(m));
    if (simples.length === 0) {
      return {
        tentees: avecFichier.length,
        synchronisees: synchroniseesFichiers,
        enConflit: conflitsFichiers,
        enEchec: echecsFichiers,
        reporte: false,
      };
    }

    for (const mutation of simples) {
      if (transitionAutorisee(mutation.etat, "en_cours")) {
        await changerEtat(base, mutation.id, "en_cours");
      }
    }

    let reponse: Response;
    try {
      reponse = await fetch(POINT_ENTREE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations: simples }),
      });
    } catch {
      // Pas de réseau : tout retourne en file, sans compter de tentative. Une coupure n'est
      // pas un échec de la mutation.
      for (const m of simples) await changerEtat(base, m.id, "en_attente");
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    if (reponseEstPerteDeSession({
      status: reponse.status,
      redirected: reponse.redirected,
      contentType: reponse.headers.get("content-type"),
    })) {
      // Session expirée. Les mutations restent en file : elles repartiront après
      // reconnexion, à condition que ce soit le MÊME compte — la route le vérifiera.
      for (const m of simples) {
        await changerEtat(base, m.id, "en_attente", "Session expirée : reconnectez-vous pour transmettre.");
      }
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    if (!reponse.ok) {
      for (const m of simples) await changerEtat(base, m.id, "en_attente");
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    let resultats: { id: string; issue: IssueServeur; motif?: string }[];
    try {
      ({ resultats } = (await reponse.json()) as { resultats: { id: string; issue: IssueServeur; motif?: string }[] });
    } catch {
      // Corps illisible : on ne suppose RIEN de ce que le serveur a fait. Retour en file.
      for (const m of simples) await changerEtat(base, m.id, "en_attente");
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }
    const parId = new Map(resultats.map((r) => [r.id, r]));

    let synchronisees = synchroniseesFichiers, enConflit = conflitsFichiers, enEchec = echecsFichiers;
    for (const mutation of simples) {
      const resultat = parId.get(mutation.id);
      if (!resultat) {
        // Le serveur n'a rien dit de celle-ci : on ne suppose rien, elle retourne en file.
        await changerEtat(base, mutation.id, "en_attente");
        continue;
      }
      const etat = etatApresReponse(resultat.issue);
      await changerEtat(base, mutation.id, etat, resultat.motif);
      if (etat === "synchronise") synchronisees += 1;
      else if (etat === "conflit") enConflit += 1;
      else if (etat === "echec") enEchec += 1;
    }

    return { tentees: candidates.length, synchronisees, enConflit, enEchec, reporte: false };
  } finally {
    base.close();
  }
}
