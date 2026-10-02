import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

// ELSATIA — Trousseau de clés du chiffrement bancaire (IBAN / BIC).
// Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md.
//
// Ce module ne dépend que de node:crypto (il est aussi chargé par l'outil opérateur
// scripts/bank-keys/bank-keys.mjs). Aucune fonction n'écrit dans un journal, et aucun
// message d'erreur ne contient une clé, un chiffré, un clair ou un IBAN : seulement des
// identifiants de clé (« k2 ») et des noms de variables.
//
// Formats de valeur chiffrée :
//   v1:<iv>:<tag>:<ct>                    historique, sans identifiant : TOUJOURS la clé k1
//   v2:<cle>:A256GCM:<iv>:<tag>:<ct>      versionné ; l'en-tête « v2:<cle>:A256GCM » est lié
//                                         au chiffré comme données associées (AAD) : le
//                                         modifier fait échouer l'authentification.
// iv = 12 octets, tag = 16 octets, base64url sans remplissage.

export const ALGORITHME_BANCAIRE = "A256GCM";
export const CLE_HISTORIQUE_V1 = "k1";
const MOTIF_ID_CLE = /^k[1-9][0-9]{0,5}$/;
const MOTIF_B64U = /^[A-Za-z0-9_-]+$/;

export type CodeErreurTrousseau =
  | "CONFIG_ABSENTE"
  | "CONFIG_INVALIDE"
  | "CLE_INCONNUE"
  | "FORMAT_INVALIDE"
  | "AUTHENTIFICATION_ECHOUEE"
  | "FORMAT_ECRITURE_INVALIDE";

// Sans propriété de paramètre : le module est aussi chargé par Node en « strip types ».
export class ErreurTrousseauBancaire extends Error {
  readonly code: CodeErreurTrousseau;
  constructor(message: string, code: CodeErreurTrousseau) {
    super(message);
    this.name = "ErreurTrousseauBancaire";
    this.code = code;
  }
}

export type FormatEcriture = "v1" | "v2";

export type TrousseauBancaire = {
  /** Clé des nouvelles écritures. */
  readonly active: string;
  /** Identifiants disponibles pour le déchiffrement (active comprise). */
  readonly identifiants: readonly string[];
  /** Format des nouvelles écritures : v1 seulement en mode de compatibilité (clé k1). */
  readonly formatEcriture: FormatEcriture;
  cle(id: string): Buffer | undefined;
};

export type EnvTrousseau = Record<string, string | undefined>;

function decoderCle(valeur: string, source: string): Buffer {
  const brut = valeur.trim();
  const cle = /^[0-9a-f]{64}$/i.test(brut) ? Buffer.from(brut, "hex") : Buffer.from(brut, "base64");
  if (cle.length !== 32) throw new ErreurTrousseauBancaire(`${source} doit contenir exactement 32 octets`, "CONFIG_INVALIDE");
  return cle;
}

/**
 * Lit le trousseau depuis l'environnement. Échoue fermé sur toute ambiguïté.
 *
 *   BANK_DATA_ENCRYPTION_KEYS           « k2:<clé>,k1:<clé> » (hex 64 ou base64 de 32 octets)
 *   BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID  « k2 » ; obligatoire dès que le trousseau a 2 clés
 *   BANK_DATA_ENCRYPTION_KEY            historique = k1 (si k1 absent de BANK_DATA_ENCRYPTION_KEYS ;
 *                                       s'il y figure, les deux doivent être identiques)
 *   BANK_DATA_ENCRYPTION_WRITE_FORMAT   v1 | v2 ; défaut : v1 si seule la variable historique est
 *                                       définie (comportement identique à l'avant-V1), v2 sinon.
 */
export function lireTrousseauBancaire(env: EnvTrousseau = process.env): TrousseauBancaire {
  const cles = new Map<string, Buffer>();
  const liste = env.BANK_DATA_ENCRYPTION_KEYS?.trim();
  if (liste) {
    for (const entree of liste.split(",")) {
      const morceau = entree.trim();
      if (!morceau) continue;
      const separateur = morceau.indexOf(":");
      const id = separateur > 0 ? morceau.slice(0, separateur).trim() : "";
      if (!MOTIF_ID_CLE.test(id)) throw new ErreurTrousseauBancaire("BANK_DATA_ENCRYPTION_KEYS : identifiant de clé invalide (attendu k1, k2…)", "CONFIG_INVALIDE");
      if (cles.has(id)) throw new ErreurTrousseauBancaire(`BANK_DATA_ENCRYPTION_KEYS : clé ${id} définie deux fois`, "CONFIG_INVALIDE");
      cles.set(id, decoderCle(morceau.slice(separateur + 1), `BANK_DATA_ENCRYPTION_KEYS (${id})`));
    }
  }
  const historique = env.BANK_DATA_ENCRYPTION_KEY?.trim();
  if (historique) {
    const k1 = decoderCle(historique, "BANK_DATA_ENCRYPTION_KEY");
    const declaree = cles.get(CLE_HISTORIQUE_V1);
    if (declaree && !timingSafeEqual(declaree, k1)) {
      throw new ErreurTrousseauBancaire("BANK_DATA_ENCRYPTION_KEY diffère de k1 dans BANK_DATA_ENCRYPTION_KEYS", "CONFIG_INVALIDE");
    }
    if (!declaree) cles.set(CLE_HISTORIQUE_V1, k1);
  }
  if (!cles.size) throw new ErreurTrousseauBancaire("Aucune clé bancaire configurée (BANK_DATA_ENCRYPTION_KEYS ou BANK_DATA_ENCRYPTION_KEY)", "CONFIG_ABSENTE");

  const ids = [...cles.keys()];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (timingSafeEqual(cles.get(ids[i])!, cles.get(ids[j])!)) {
        throw new ErreurTrousseauBancaire(`Les clés ${ids[i]} et ${ids[j]} sont identiques`, "CONFIG_INVALIDE");
      }
    }
  }

  const activeDeclaree = env.BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID?.trim();
  let active: string;
  if (activeDeclaree) {
    if (!cles.has(activeDeclaree)) throw new ErreurTrousseauBancaire(`BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID (${MOTIF_ID_CLE.test(activeDeclaree) ? activeDeclaree : "?"}) absente du trousseau`, "CONFIG_INVALIDE");
    active = activeDeclaree;
  } else if (cles.size === 1) {
    active = ids[0];
  } else {
    throw new ErreurTrousseauBancaire("BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID est obligatoire quand le trousseau contient plusieurs clés", "CONFIG_INVALIDE");
  }

  const formatDeclare = env.BANK_DATA_ENCRYPTION_WRITE_FORMAT?.trim();
  let formatEcriture: FormatEcriture;
  if (formatDeclare) {
    if (formatDeclare !== "v1" && formatDeclare !== "v2") throw new ErreurTrousseauBancaire("BANK_DATA_ENCRYPTION_WRITE_FORMAT doit valoir v1 ou v2", "CONFIG_INVALIDE");
    formatEcriture = formatDeclare;
  } else {
    formatEcriture = liste ? "v2" : "v1";
  }
  if (formatEcriture === "v1" && active !== CLE_HISTORIQUE_V1) {
    throw new ErreurTrousseauBancaire("Le format v1 (sans identifiant) n'est autorisé qu'avec la clé active k1", "FORMAT_ECRITURE_INVALIDE");
  }

  return {
    active,
    identifiants: Object.freeze([...ids].sort()),
    formatEcriture,
    cle: (id: string) => cles.get(id),
  };
}

export type EnteteChiffre = { format: FormatEcriture; cle: string; algorithme: typeof ALGORITHME_BANCAIRE };

type ChiffreDecompose = EnteteChiffre & { iv: Buffer; tag: Buffer; contenu: Buffer; aad: Buffer | null };

function decomposer(valeur: string): ChiffreDecompose {
  if (typeof valeur !== "string") throw new ErreurTrousseauBancaire("Donnée bancaire chiffrée invalide", "FORMAT_INVALIDE");
  const parties = valeur.split(":");
  let entete: EnteteChiffre;
  let reste: string[];
  let aad: Buffer | null;
  if (parties[0] === "v1" && parties.length === 4) {
    entete = { format: "v1", cle: CLE_HISTORIQUE_V1, algorithme: ALGORITHME_BANCAIRE };
    reste = parties.slice(1);
    aad = null;
  } else if (parties[0] === "v2" && parties.length === 6 && MOTIF_ID_CLE.test(parties[1]) && parties[2] === ALGORITHME_BANCAIRE) {
    entete = { format: "v2", cle: parties[1], algorithme: ALGORITHME_BANCAIRE };
    reste = parties.slice(3);
    aad = Buffer.from(parties.slice(0, 3).join(":"), "utf8");
  } else {
    throw new ErreurTrousseauBancaire("Donnée bancaire chiffrée invalide", "FORMAT_INVALIDE");
  }
  const [iv, tag, contenu] = reste;
  if (![iv, tag, contenu].every((p) => p && MOTIF_B64U.test(p))) throw new ErreurTrousseauBancaire("Donnée bancaire chiffrée invalide", "FORMAT_INVALIDE");
  const ivB = Buffer.from(iv, "base64url");
  const tagB = Buffer.from(tag, "base64url");
  const contenuB = Buffer.from(contenu, "base64url");
  if (ivB.length !== 12 || tagB.length !== 16 || contenuB.length === 0) throw new ErreurTrousseauBancaire("Donnée bancaire chiffrée invalide", "FORMAT_INVALIDE");
  return { ...entete, iv: ivB, tag: tagB, contenu: contenuB, aad };
}

/** En-tête public d'une valeur chiffrée (format, identifiant de clé, algorithme). Ne déchiffre rien. */
export function lireEnteteChiffre(valeur: string): EnteteChiffre {
  const { format, cle, algorithme } = decomposer(valeur);
  return { format, cle, algorithme };
}

export function chiffrerAvecTrousseau(trousseau: TrousseauBancaire, clair: string, options: { cle?: string; format?: FormatEcriture } = {}): string {
  const id = options.cle ?? trousseau.active;
  const format = options.format ?? (id === trousseau.active ? trousseau.formatEcriture : "v2");
  const cle = trousseau.cle(id);
  if (!cle) throw new ErreurTrousseauBancaire(`Clé bancaire ${id} absente du trousseau`, "CLE_INCONNUE");
  if (format === "v1" && id !== CLE_HISTORIQUE_V1) throw new ErreurTrousseauBancaire("Le format v1 exige la clé k1", "FORMAT_ECRITURE_INVALIDE");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const prefixe = format === "v1" ? "v1" : `v2:${id}:${ALGORITHME_BANCAIRE}`;
  if (format === "v2") chiffreur.setAAD(Buffer.from(prefixe, "utf8"));
  const contenu = Buffer.concat([chiffreur.update(clair, "utf8"), chiffreur.final()]);
  return [prefixe, iv.toString("base64url"), chiffreur.getAuthTag().toString("base64url"), contenu.toString("base64url")].join(":");
}

/**
 * Déchiffre ou échoue fermé : clé absente, mauvaise clé, en-tête ou chiffré altéré ⇒
 * exception (GCM authentifie tout), jamais de clair partiel ou corrompu.
 */
export function dechiffrerAvecTrousseau(trousseau: TrousseauBancaire, valeur: string): string {
  const d = decomposer(valeur);
  const cle = trousseau.cle(d.cle);
  if (!cle) throw new ErreurTrousseauBancaire(`Clé bancaire ${d.cle} absente du trousseau`, "CLE_INCONNUE");
  try {
    const dechiffreur = createDecipheriv("aes-256-gcm", cle, d.iv);
    if (d.aad) dechiffreur.setAAD(d.aad);
    dechiffreur.setAuthTag(d.tag);
    return Buffer.concat([dechiffreur.update(d.contenu), dechiffreur.final()]).toString("utf8");
  } catch {
    throw new ErreurTrousseauBancaire(`Déchiffrement bancaire refusé (clé ${d.cle} incorrecte ou donnée altérée)`, "AUTHENTIFICATION_ECHOUEE");
  }
}

/**
 * Empreinte de contrôle (KCV) d'une clé : HMAC-SHA256(clé, étiquette fixe), 64 hex.
 * Publiable (registre en base) : elle ne permet ni de retrouver la clé ni de déchiffrer, mais
 * prouve qu'une clé présentée est bien celle enregistrée (restauration, déploiement).
 */
export function empreinteControleCle(trousseau: TrousseauBancaire, id: string): string {
  const cle = trousseau.cle(id);
  if (!cle) throw new ErreurTrousseauBancaire(`Clé bancaire ${id} absente du trousseau`, "CLE_INCONNUE");
  return createHmac("sha256", cle).update(`ELSATIA-BANK-KCV-v1:${id}`).digest("hex");
}

/**
 * Index aveugle d'un IBAN normalisé : HMAC-SHA256 avec une sous-clé dérivée (HKDF) de la clé
 * `id`. Remplace le SHA-256 non salé historique, recalculable hors ligne à partir des quatre
 * derniers caractères et du code banque.
 */
export function indexAveugleIban(trousseau: TrousseauBancaire, ibanNormalise: string, id: string = trousseau.active): string {
  const cle = trousseau.cle(id);
  if (!cle) throw new ErreurTrousseauBancaire(`Clé bancaire ${id} absente du trousseau`, "CLE_INCONNUE");
  const sousCle = Buffer.from(hkdfSync("sha256", cle, Buffer.alloc(0), `ELSATIA-BANK-IBAN-INDEX-v1:${id}`, 32));
  return createHmac("sha256", sousCle).update(ibanNormalise).digest("hex");
}

/** Valeur chiffrée déjà écrite sous la clé active, au format d'écriture attendu ? */
export function estAJour(trousseau: TrousseauBancaire, valeur: string): boolean {
  const entete = lireEnteteChiffre(valeur);
  return entete.cle === trousseau.active && entete.format === trousseau.formatEcriture;
}
