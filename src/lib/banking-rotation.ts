// ELSATIA — Rotation des clés du chiffrement bancaire : contrôle du trousseau et rechiffrement
// par lots, reprenable. Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md.
//
// Le moteur ne connaît ni la base ni la cryptographie : il reçoit un « magasin » (les RPC
// service_role de la migration 20261002001112) et les primitives du trousseau
// (src/lib/banking-keyring.ts). Il est ainsi exécuté tel quel par l'outil opérateur
// scripts/bank-keys/bank-keys.mjs, par Vitest (magasin mémoire) et par le test d'intégration
// PostgreSQL. Ses rapports ne contiennent que des identifiants de clé, des compteurs et des
// identifiants de ligne : jamais de clé, de chiffré, de clair ni d'IBAN.
//
// Propriétés :
//   - chaque lot est appliqué en compare-and-swap dans une transaction : une interruption
//     (processus tué, réseau, base) laisse chaque valeur soit dans son ancien chiffré, soit dans
//     le nouveau, toutes deux lisibles par le trousseau ;
//   - la reprise repart de zéro : la base ne renvoie que les valeurs pas encore sous la cible ;
//   - une valeur qui ne se déchiffre pas (mauvaise clé, altération) n'est JAMAIS réécrite :
//     elle est signalée et le run se termine « incomplet ».

import type { EnteteChiffre, FormatEcriture, TrousseauBancaire } from "./banking-keyring";

export type RessourceBancaire = "coordonnees_bancaires" | "ordres_virements";
export type ColonneBancaire = "iban_chiffre" | "bic_chiffre";

export type ValeurChiffree = { ressource: RessourceBancaire; id: string; colonne: ColonneBancaire; chiffre: string; curseur: string };
export type MiseAJourChiffre = { ressource: RessourceBancaire; id: string; colonne: ColonneBancaire; ancien: string; nouveau: string; iban_hash?: string };

export type LigneInventaire = { ressource: string; colonne: string; format: string; cle_id: string | null; statut_cle: string | null; nombre: number };
export type CleRegistre = { cle_id: string; statut: string; empreinte_controle: string | null };
export type EtatRegistre = { active: string | null; cles: CleRegistre[]; inventaire: LigneInventaire[] };

export type MagasinRotation = {
  etat(): Promise<EtatRegistre>;
  lister(cible: string, format: FormatEcriture, apres: string | null, limite: number): Promise<ValeurChiffree[]>;
  parcourir(apres: string | null, limite: number): Promise<ValeurChiffree[]>;
  appliquer(cible: string, format: FormatEcriture, lot: MiseAJourChiffre[]): Promise<{ rechiffres: number; conflits: number }>;
};

export type PrimitivesTrousseau = {
  lireEntete(valeur: string): EnteteChiffre;
  dechiffrer(trousseau: TrousseauBancaire, valeur: string): string;
  chiffrer(trousseau: TrousseauBancaire, clair: string, options: { cle: string; format: FormatEcriture }): string;
  indexAveugle(trousseau: TrousseauBancaire, iban: string, cle: string): string;
  empreinteHistorique(iban: string): string;
  empreinteControle(trousseau: TrousseauBancaire, cle: string): string;
};

export type ControleTrousseau = { ok: boolean; erreurs: string[]; avertissements: string[]; clesRequises: string[] };

/**
 * Confronte le trousseau de l'environnement au registre et à l'inventaire de la base.
 * Détecte : clé active divergente, clé présentée ≠ clé enregistrée (empreinte), clé
 * nécessaire aux données mais absente du trousseau (sauvegarde restaurée sans ses clés).
 */
export function controlerTrousseau(etat: EtatRegistre, trousseau: TrousseauBancaire, outils: PrimitivesTrousseau, options: { strict?: boolean } = {}): ControleTrousseau {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  const registre = new Map(etat.cles.map((c) => [c.cle_id, c]));
  if (etat.active !== trousseau.active) {
    erreurs.push(`ACTIVE_DIVERGENTE : registre=${etat.active ?? "aucune"}, environnement=${trousseau.active}`);
  }
  for (const id of trousseau.identifiants) {
    const cle = registre.get(id);
    if (!cle) {
      avertissements.push(`NON_ENREGISTREE : ${id} (bank-keys register)`);
      continue;
    }
    if (!cle.empreinte_controle) {
      (options.strict ? erreurs : avertissements).push(`NON_ATTESTEE : ${id} (bank-keys attest)`);
    } else if (cle.empreinte_controle !== outils.empreinteControle(trousseau, id)) {
      erreurs.push(`EMPREINTE_DIFFERENTE : la clé ${id} de l'environnement n'est pas celle du registre`);
    }
    if (cle.statut === "retiree") avertissements.push(`RETIREE_ENCORE_PRESENTE : ${id} (à supprimer de l'environnement)`);
    if (cle.statut === "compromise") avertissements.push(`COMPROMISE_ENCORE_PRESENTE : ${id} (rechiffrer puis retirer)`);
  }
  const clesRequises = [...new Set(etat.inventaire.filter((l) => l.cle_id && l.nombre > 0).map((l) => l.cle_id!))].sort();
  for (const id of clesRequises) {
    if (!trousseau.cle(id)) erreurs.push(`CLE_MANQUANTE : ${id} chiffre des données présentes en base mais est absente du trousseau`);
  }
  for (const l of etat.inventaire) {
    if (l.cle_id && ["retiree", "non_enregistree"].includes(l.statut_cle ?? "") && l.nombre > 0) {
      erreurs.push(`DONNEES_SOUS_CLE_${(l.statut_cle ?? "").toUpperCase()} : ${l.nombre} valeur(s) ${l.ressource}.${l.colonne} sous ${l.cle_id}`);
    }
  }
  const illisibles = etat.inventaire.filter((l) => l.format === "illisible").reduce((n, l) => n + Number(l.nombre), 0);
  if (illisibles) (options.strict ? erreurs : avertissements).push(`ILLISIBLES : ${illisibles} valeur(s) hors format (jeux de démonstration ?)`);
  return { ok: erreurs.length === 0, erreurs, avertissements, clesRequises };
}

export type EchecValeur = { ressource: string; id: string; colonne: string; cle: string | null; motif: string };

export type RapportRechiffrement = {
  statut: "termine" | "incomplet" | "interrompu";
  cible: string;
  format: FormatEcriture;
  lots: number;
  rechiffres: number;
  conflits: number;
  echecs: EchecValeur[];
  restants: number;
};

function motifErreur(cause: unknown) {
  const code = (cause as { code?: unknown })?.code;
  return typeof code === "string" ? code : "ECHEC";
}

function restantsHorsCible(etat: EtatRegistre, cible: string, format: FormatEcriture) {
  return etat.inventaire
    .filter((l) => l.cle_id && (l.cle_id !== cible || l.format !== format))
    .reduce((n, l) => n + Number(l.nombre), 0);
}

/**
 * Rechiffre sous (clé active, format d'écriture) du trousseau tout ce qui ne l'est pas encore.
 * `maxLots` borne le run (interruption volontaire) ; relancer reprend là où l'on s'est arrêté.
 */
export async function executerRechiffrement(params: {
  magasin: MagasinRotation;
  trousseau: TrousseauBancaire;
  outils: PrimitivesTrousseau;
  tailleLot?: number;
  maxLots?: number;
  surLot?: (progression: { lots: number; rechiffres: number; conflits: number; echecs: number }) => void;
}): Promise<RapportRechiffrement> {
  const { magasin, trousseau, outils } = params;
  const tailleLot = params.tailleLot ?? 200;
  const cible = trousseau.active;
  const format = trousseau.formatEcriture;
  const controle = controlerTrousseau(await magasin.etat(), trousseau, outils);
  if (!controle.ok) {
    throw Object.assign(new Error(`Trousseau refusé : ${controle.erreurs.join(" | ")}`), { code: "TROUSSEAU_REFUSE", controle });
  }

  const rapport: RapportRechiffrement = { statut: "termine", cible, format, lots: 0, rechiffres: 0, conflits: 0, echecs: [], restants: 0 };
  // Deux passes au plus : la seconde reprend les conflits (ligne modifiée pendant la première).
  for (let passe = 0; passe < 2; passe += 1) {
    let apres: string | null = null;
    const conflitsAvant = rapport.conflits;
    for (;;) {
      if (params.maxLots !== undefined && rapport.lots >= params.maxLots) {
        rapport.statut = "interrompu";
        rapport.restants = restantsHorsCible(await magasin.etat(), cible, format);
        return rapport;
      }
      const valeurs = await magasin.lister(cible, format, apres, tailleLot);
      if (!valeurs.length) break;
      apres = valeurs[valeurs.length - 1].curseur;
      const lot: MiseAJourChiffre[] = [];
      for (const v of valeurs) {
        let cle: string | null = null;
        try {
          cle = outils.lireEntete(v.chiffre).cle;
          const clair = outils.dechiffrer(trousseau, v.chiffre);
          const maj: MiseAJourChiffre = { ressource: v.ressource, id: v.id, colonne: v.colonne, ancien: v.chiffre, nouveau: outils.chiffrer(trousseau, clair, { cle: cible, format }) };
          if (v.ressource === "coordonnees_bancaires" && v.colonne === "iban_chiffre") {
            maj.iban_hash = format === "v2" ? outils.indexAveugle(trousseau, clair, cible) : outils.empreinteHistorique(clair);
          }
          lot.push(maj);
        } catch (cause) {
          if (passe === 0 || !rapport.echecs.some((e) => e.ressource === v.ressource && e.id === v.id && e.colonne === v.colonne)) {
            rapport.echecs.push({ ressource: v.ressource, id: v.id, colonne: v.colonne, cle, motif: motifErreur(cause) });
          }
        }
      }
      if (lot.length) {
        const r = await magasin.appliquer(cible, format, lot);
        rapport.rechiffres += r.rechiffres;
        rapport.conflits += r.conflits;
      }
      rapport.lots += 1;
      params.surLot?.({ lots: rapport.lots, rechiffres: rapport.rechiffres, conflits: rapport.conflits, echecs: rapport.echecs.length });
    }
    if (rapport.conflits === conflitsAvant) break;
  }
  rapport.restants = restantsHorsCible(await magasin.etat(), cible, format);
  rapport.statut = rapport.restants === 0 && rapport.echecs.length === 0 ? "termine" : "incomplet";
  return rapport;
}

export type RapportVerification = { ok: boolean; total: number; dechiffrables: number; parCle: Record<string, number>; echecs: EchecValeur[]; illisibles: number };

/** Déchiffre chaque valeur de la base (sans rien écrire) : preuve qu'une restauration est exploitable. */
export async function verifierDechiffrement(params: { magasin: MagasinRotation; trousseau: TrousseauBancaire; outils: PrimitivesTrousseau; tailleLot?: number }): Promise<RapportVerification> {
  const { magasin, trousseau, outils } = params;
  const rapport: RapportVerification = { ok: true, total: 0, dechiffrables: 0, parCle: {}, echecs: [], illisibles: 0 };
  let apres: string | null = null;
  for (;;) {
    const valeurs = await magasin.parcourir(apres, params.tailleLot ?? 500);
    if (!valeurs.length) break;
    apres = valeurs[valeurs.length - 1].curseur;
    for (const v of valeurs) {
      rapport.total += 1;
      let cle: string | null = null;
      try {
        cle = outils.lireEntete(v.chiffre).cle;
      } catch {
        rapport.illisibles += 1;
        continue;
      }
      try {
        outils.dechiffrer(trousseau, v.chiffre);
        rapport.dechiffrables += 1;
        rapport.parCle[cle] = (rapport.parCle[cle] ?? 0) + 1;
      } catch (cause) {
        rapport.echecs.push({ ressource: v.ressource, id: v.id, colonne: v.colonne, cle, motif: motifErreur(cause) });
      }
    }
  }
  rapport.ok = rapport.echecs.length === 0;
  return rapport;
}
