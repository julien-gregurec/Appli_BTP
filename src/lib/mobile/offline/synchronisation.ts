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
  transitionAutorisee,
  type IssueServeur,
  type MutationLocale,
} from "@/lib/mobile/offline/contrat";
import {
  changerEtat,
  lireMutationsEnSuspens,
  ouvrirBase,
  type IdentiteBase,
} from "@/lib/mobile/offline/base-locale";

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
    const maintenant = Date.now();
    const candidates = (await lireMutationsEnSuspens(base))
      .filter((m) => estPrete(m, maintenant))
      // Garde de dernier recours. La base est déjà nommée par l'identité, donc ce filtre ne
      // devrait jamais rien retirer. Il coûte une comparaison et couvre le cas où une base
      // aurait été ouverte pour la mauvaise identité : mieux vaut ne rien envoyer.
      .filter((m) => peutPartirSous(m, identite))
      .slice(0, TAILLE_LOT);

    if (candidates.length === 0) return VIDE;

    for (const mutation of candidates) {
      if (transitionAutorisee(mutation.etat, "en_cours")) {
        await changerEtat(base, mutation.id, "en_cours");
      }
    }

    let reponse: Response;
    try {
      reponse = await fetch(POINT_ENTREE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mutations: candidates }),
      });
    } catch {
      // Pas de réseau : tout retourne en file, sans compter de tentative. Une coupure n'est
      // pas un échec de la mutation.
      for (const m of candidates) await changerEtat(base, m.id, "en_attente");
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    if (reponse.status === 401) {
      // Session expirée. Les mutations restent en file : elles repartiront après
      // reconnexion, à condition que ce soit le MÊME compte — la route le vérifiera.
      for (const m of candidates) {
        await changerEtat(base, m.id, "en_attente", "Session expirée : reconnectez-vous pour transmettre.");
      }
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    if (!reponse.ok) {
      for (const m of candidates) await changerEtat(base, m.id, "en_attente");
      return { ...VIDE, tentees: candidates.length, reporte: true };
    }

    const { resultats } = (await reponse.json()) as {
      resultats: { id: string; issue: IssueServeur; motif?: string }[];
    };
    const parId = new Map(resultats.map((r) => [r.id, r]));

    let synchronisees = 0, enConflit = 0, enEchec = 0;
    for (const mutation of candidates) {
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
