/**
 * Observation de la décision d'accès Gestion Pro (D1, étape 1) — AUCUNE décision n'est modifiée.
 *
 * Contraintes qui gouvernent tout ce fichier :
 *  1. NE BLOQUE JAMAIS : aucun `await` sur le chemin critique du proxy. Le travail est planifié
 *     avec `after()` de Next 16 (utilisable dans un Proxy, doc `functions/after`), et, hors contexte
 *     de requête, retombe sur une promesse détachée dont toute erreur est absorbée ;
 *  2. `try/catch` TOTAL : une exception ici ne doit jamais remonter au proxy ;
 *  3. délai borné (400 ms) sur l'appel RPC, même si l'appel est déjà hors chemin critique : une base
 *     qui répond lentement ne doit pas accumuler des tâches en attente ;
 *  4. RPC absente (Production au ledger < 234/280 : `42883` / `PGRST202`) : UN avertissement par
 *     processus, puis silence — et plus aucun appel pendant `DELAI_RETEST_RPC_ABSENTE_MS` ;
 *  5. AUCUNE donnée personnelle dans les journaux : identifiants hachés (SHA-256 salé par
 *     `ELSATIA_GP_ACCES_APP_SEL`, tronqué), chemin réduit à son premier segment, jamais d'e-mail ni de nom.
 */
import { after } from "next/server";
import { lireDecisionAcces } from "@elsatia/application-access";
import {
  APPLICATION_GESTION_PRO,
  comparerDecisionsGp,
  motifExemption,
  type DecisionObservee,
  type EtatDecisionGp,
  type ResultatComparaison,
} from "./comparaison";
import { lireEchantillonAccesGp, lireModeAccesGp, type ModeAccesGp } from "./mode";

export const DELAI_RPC_MS = 400;
export const FENETRE_DEDUP_MS = 10 * 60 * 1000;
export const MAX_ENTREES_DEDUP = 2000;
export const DELAI_RETEST_RPC_ABSENTE_MS = 10 * 60 * 1000;
export const NOM_EVENEMENT = "gp_acces_app_ecart";

// ── Utilitaires purs ────────────────────────────────────────────────────────────────────

/** Hache un identifiant pour le journal : SHA-256(sel:id), 12 premiers caractères hexadécimaux. */
export async function hacherIdentifiant(identifiant: string, sel: string): Promise<string> {
  const octets = new TextEncoder().encode(`${sel}:${identifiant}`);
  const empreinte = await globalThis.crypto.subtle.digest("SHA-256", octets);
  return Array.from(new Uint8Array(empreinte))
    .slice(0, 6)
    .map((o) => o.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Réduit un chemin à sa catégorie : `/factures/3f2c…/edit` → `/factures`, `/api/employes/12` →
 * `/api/employes`. Les identifiants de ressources (potentiellement nominatifs) n'entrent jamais au journal.
 */
export function categorieChemin(chemin: string): string {
  const segments = chemin.split("?")[0].split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  const n = segments[0] === "api" ? 2 : 1;
  return "/" + segments.slice(0, n).filter((s) => !/^[0-9a-f-]{8,}$/i.test(s) && !/^\d+$/.test(s)).join("/");
}

/** Déduplication en mémoire : au plus une ligne par (utilisateur haché, type d'écart) et par fenêtre. */
export function creerDeduplication(options: { fenetreMs?: number; maxEntrees?: number } = {}) {
  const fenetre = options.fenetreMs ?? FENETRE_DEDUP_MS;
  const max = options.maxEntrees ?? MAX_ENTREES_DEDUP;
  const vus = new Map<string, number>();
  return {
    /** true = première occurrence dans la fenêtre (à journaliser). */
    premiereOccurrence(cle: string, maintenant: number): boolean {
      const dernier = vus.get(cle);
      if (dernier !== undefined && maintenant - dernier < fenetre) return false;
      if (vus.size >= max) {
        // Purge des entrées expirées, puis la plus ancienne si la mémoire reste pleine : borné, jamais de fuite.
        for (const [k, t] of vus) if (maintenant - t >= fenetre) vus.delete(k);
        if (vus.size >= max) {
          const plusAncienne = vus.keys().next().value;
          if (plusAncienne !== undefined) vus.delete(plusAncienne);
        }
      }
      vus.set(cle, maintenant);
      return true;
    },
    taille: () => vus.size,
  };
}

export function estRpcAbsente(erreur: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erreur) return false;
  if (erreur.code === "42883" || erreur.code === "PGRST202") return true;
  return /could not find the function|does not exist/i.test(erreur.message ?? "");
}

// ── Observateur ─────────────────────────────────────────────────────────────────────────

export type RetourRpc = { data: unknown; error: { code?: string | null; message?: string | null } | null };

export type EntreeObservation = {
  utilisateurId: string;
  entrepriseId: string | null | undefined;
  chemin: string;
  publique: boolean;
  compteDepot: boolean;
  accesSupport: boolean;
  droitRequis: string | null;
  droitAcces: boolean | null | undefined;
  /** Appel de `decision_acces_application('gestion_pro', entreprise)` ; doit honorer `signal`. */
  appeler: (signal: AbortSignal) => PromiseLike<RetourRpc>;
};

/** Complément connu plus tard dans le proxy (module inclus, statut d'abonnement) — lu après la réponse. */
export type ComplementGp = Pick<EtatDecisionGp, "moduleInclus" | "abonnementStatut">;

export type PoigneeObservation = { completer: (complement: ComplementGp) => void };
const POIGNEE_INERTE: PoigneeObservation = { completer: () => {} };

export type DependancesObservation = {
  env: () => Record<string, string | undefined>;
  aleatoire: () => number;
  maintenant: () => number;
  /** Planifie `tache` sans bloquer la réponse. */
  planifier: (tache: () => Promise<void>) => void;
  journal: { warn: (ligne: string) => void; info: (ligne: string) => void };
};

/** `after()` de Next 16 ; hors contexte de requête (tests, scripts), promesse détachée sans rejet possible. */
export function planifierApresReponse(tache: () => Promise<void>): void {
  const securisee = () => tache().catch(() => {});
  try {
    after(securisee);
  } catch {
    void securisee();
  }
}

const DEPENDANCES_REELLES: DependancesObservation = {
  env: () => process.env,
  aleatoire: () => Math.random(),
  maintenant: () => Date.now(),
  planifier: planifierApresReponse,
  journal: { warn: (l) => console.warn(l), info: (l) => console.info(l) },
};

export function creerObservateurAccesGp(surcharge: Partial<DependancesObservation> = {}) {
  const dep: DependancesObservation = { ...DEPENDANCES_REELLES, ...surcharge };
  const dedup = creerDeduplication();
  let avertissementModeEmis = false;
  let avertissementRpcAbsenteEmis = false;
  let rpcAbsenteJusqua = 0;

  const emettre = (niveau: "warn" | "info", corps: Record<string, unknown>) => {
    try {
      dep.journal[niveau](JSON.stringify({ evenement: NOM_EVENEMENT, version: 1, ...corps }));
    } catch {
      /* un journal défaillant ne doit jamais casser une requête */
    }
  };

  async function appelerAvecDelai(entree: EntreeObservation): Promise<DecisionObservee | "rpc_absente"> {
    const controleur = new AbortController();
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const delai = new Promise<"delai">((resolve) => {
      minuterie = setTimeout(() => {
        controleur.abort();
        resolve("delai");
      }, DELAI_RPC_MS);
    });
    try {
      const resultat = await Promise.race([Promise.resolve(entree.appeler(controleur.signal)), delai]);
      if (resultat === "delai") return null;
      if (resultat.error) return estRpcAbsente(resultat.error) ? "rpc_absente" : null;
      const lue = lireDecisionAcces(resultat.data, APPLICATION_GESTION_PRO);
      return { decision: lue.decision, roleCode: lue.roleCode };
    } catch {
      return null;
    } finally {
      if (minuterie) clearTimeout(minuterie);
    }
  }

  /**
   * Point d'entrée UNIQUE appelé par le proxy. Synchrone, ne lève jamais, retourne immédiatement.
   * En mode `off`, ou hors échantillon, ou pour une requête exemptée : aucune requête réseau.
   */
  function observer(entree: EntreeObservation): PoigneeObservation {
    try {
      const environnement = dep.env();
      const lecture = lireModeAccesGp(environnement.ELSATIA_GP_ACCES_APP);
      if (lecture.avertissement && !avertissementModeEmis) {
        avertissementModeEmis = true;
        emettre("warn", { niveau: "configuration", message: lecture.avertissement });
      }
      const mode: ModeAccesGp = lecture.mode;
      if (mode !== "observe") return POIGNEE_INERTE;

      const exemption = {
        chemin: entree.chemin,
        publique: entree.publique,
        entrepriseId: entree.entrepriseId,
        compteDepot: entree.compteDepot,
        accesSupport: entree.accesSupport,
      };
      if (motifExemption(exemption)) return POIGNEE_INERTE;
      if (dep.maintenant() < rpcAbsenteJusqua) return POIGNEE_INERTE;
      const echantillon = lireEchantillonAccesGp(environnement.ELSATIA_GP_ACCES_APP_ECHANTILLON);
      if (!(dep.aleatoire() < echantillon)) return POIGNEE_INERTE;

      const etat: EtatDecisionGp = { droitRequis: entree.droitRequis, droitAcces: entree.droitAcces };
      const sel = environnement.ELSATIA_GP_ACCES_APP_SEL ?? "";

      dep.planifier(async () => {
        try {
          const debut = dep.maintenant();
          const brut = await appelerAvecDelai(entree);
          if (brut === "rpc_absente") {
            rpcAbsenteJusqua = dep.maintenant() + DELAI_RETEST_RPC_ABSENTE_MS;
            if (!avertissementRpcAbsenteEmis) {
              avertissementRpcAbsenteEmis = true;
              emettre("warn", {
                niveau: "configuration",
                message: "decision_acces_application absente de cette base : observation suspendue (avertissement unique par processus)",
              });
            }
            return;
          }
          const resultat: ResultatComparaison = comparerDecisionsGp({
            mode,
            exemption,
            gp: etat,
            decision: brut,
          });
          if (!resultat.observer) return;

          const utilisateur = await hacherIdentifiant(entree.utilisateurId, sel);
          if (!dedup.premiereOccurrence(`${utilisateur}|${resultat.type}`, dep.maintenant())) return;
          const entreprise = entree.entrepriseId ? await hacherIdentifiant(entree.entrepriseId, sel) : null;
          const informatif = resultat.gravite === "info" && resultat.type !== "decision_indisponible";
          emettre(informatif ? "info" : "warn", {
            type: resultat.type,
            gravite: resultat.gravite,
            decision: resultat.motifDecision,
            gp: resultat.gp.cause,
            droit_requis: entree.droitRequis,
            chemin: categorieChemin(entree.chemin),
            utilisateur,
            entreprise,
            echantillon,
            latence_ms: dep.maintenant() - debut,
          });
        } catch {
          /* observation seulement : on se tait plutôt que de risquer la requête */
        }
      });

      return {
        completer: (complement) => {
          etat.moduleInclus = complement.moduleInclus;
          etat.abonnementStatut = complement.abonnementStatut;
        },
      };
    } catch {
      return POIGNEE_INERTE;
    }
  }

  return { observer };
}

/** Instance de processus utilisée par le proxy (état : déduplication, avertissements uniques). */
export const observateurAccesGp = creerObservateurAccesGp();
