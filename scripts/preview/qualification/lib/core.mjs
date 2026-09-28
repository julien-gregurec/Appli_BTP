// ELSATIA — Qualification Preview distante : statuts, masquage des secrets, verdict.
//
// Module pur (aucun réseau, aucune écriture). Testé par scripts/preview/qualification/qualification.test.mjs.
// GARANTIE : `Masque#appliquer` est appliqué à TOUT texte qui sort de l'orchestrateur (console,
// journaux par étape, JSON final). Une valeur enregistrée comme secrète n'apparaît jamais en clair.

/** Les cinq statuts d'étape (mission §17). */
export const STATUT = Object.freeze({
  GO: "GO",
  NO_GO: "NO-GO",
  SKIPPED: "SKIPPED",
  BLOCKED_CREDENTIAL: "BLOCKED_CREDENTIAL",
  BLOCKED_NETWORK: "BLOCKED_NETWORK",
});
export const STATUTS = Object.freeze(Object.values(STATUT));

/**
 * Nature d'une étape :
 *  - read            : diagnostic en lecture seule, TOUJOURS exécuté (même après un NO-GO critique) ;
 *  - safe-write      : écriture de recette réversible sur la Preview (objet Storage jetable, session
 *                      Auth, e-mail vers l'allowlist, clé Redis TTL 30 s, parcours Playwright) ;
 *  - dangerous-write : écriture de schéma (db push). Exige sauvegarde validée + ledger compatible +
 *                      cible confirmée.
 * Un NO-GO critique arrête toutes les écritures (safe-write et dangerous-write), jamais les lectures.
 */
export const NATURE = Object.freeze({ READ: "read", SAFE_WRITE: "safe-write", DANGEROUS_WRITE: "dangerous-write" });

/** Verdicts globaux. */
export const VERDICT = Object.freeze({
  QUALIFIED: "V5 PREVIEW QUALIFIED",
  NO_GO: "V5 PREVIEW NO-GO",
  BLOCKED: "V5 PREVIEW BLOCKED",
  INCOMPLETE: "V5 PREVIEW INCOMPLETE",
  PLAN: "V5 PREVIEW NOT EXECUTED (offline plan)",
});

/** Erreur « identifiant manquant » : l'étape devient BLOCKED_CREDENTIAL. */
export class Identifiant extends Error {}
/** Erreur « réseau indisponible » : l'étape devient BLOCKED_NETWORK. */
export class Reseau extends Error {}
/** Étape volontairement non exécutée : SKIPPED. */
export class Saut extends Error {}

// ── Masquage ──────────────────────────────────────────────────────────────────

/** Motifs de secrets reconnus même s'ils n'ont pas été enregistrés (défense en profondeur). */
export const MOTIFS_SECRETS = [
  [/\b(postgres(?:ql)?|rediss?):\/\/[^\s"'<>]+/gi, "$1://<masqué>"],
  [/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}/g, "<clé-stripe-masquée>"],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, "<whsec-masqué>"],
  [/\bxkeysib-[A-Za-z0-9-]{8,}/g, "<clé-brevo-masquée>"],
  [/\bsbp_[A-Za-z0-9]{8,}/g, "<jeton-supabase-masqué>"],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}/g, "<clé-supabase-masquée>"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "<jwt-masqué>"],
  [/(authorization|apikey|x-vercel-protection-bypass)(["']?\s*[:=]\s*["']?)(?:Bearer\s+)?[^\s"',}]+/gi, "$1$2<masqué>"],
  [/\b(password|mot_de_passe|token|secret)=([^\s&"']+)/gi, "$1=<masqué>"],
];

export class Masque {
  #valeurs = new Set();

  /** Enregistre une valeur secrète (ignorée si trop courte pour être discriminante). */
  ajouter(valeur) {
    if (typeof valeur !== "string") return this;
    const v = valeur.trim();
    if (v.length >= 8) this.#valeurs.add(v);
    // Le mot de passe d'une URL de connexion est aussi masqué seul (messages psql, CLI).
    try {
      const u = new URL(v);
      if (u.password) this.ajouter(decodeURIComponent(u.password));
    } catch { /* pas une URL */ }
    return this;
  }

  /** Enregistre toutes les valeurs d'un objet d'environnement dont le nom n'est pas public. */
  ajouterEnv(env, estSecret = nomSecret) {
    for (const [nom, valeur] of Object.entries(env ?? {})) if (estSecret(nom)) this.ajouter(valeur);
    return this;
  }

  get taille() { return this.#valeurs.size; }

  appliquer(texte) {
    let t = String(texte ?? "");
    // Les plus longues d'abord : une valeur qui en contient une autre est masquée entière.
    for (const v of [...this.#valeurs].sort((a, b) => b.length - a.length)) t = t.split(v).join("<secret-masqué>");
    for (const [re, rempl] of MOTIFS_SECRETS) t = t.replace(re, rempl);
    return t;
  }

  /** Masque récursivement un objet JSON (clés conservées, valeurs chaînes masquées). */
  appliquerJson(objet) {
    if (typeof objet === "string") return this.appliquer(objet);
    if (Array.isArray(objet)) return objet.map((x) => this.appliquerJson(x));
    if (objet && typeof objet === "object") return Object.fromEntries(Object.entries(objet).map(([k, v]) => [k, this.appliquerJson(v)]));
    return objet;
  }
}

/**
 * Nom de variable à traiter comme secret. Volontairement large : tout ce qui n'est ni public
 * (NEXT_PUBLIC_*) ni un drapeau/URL applicative connue est masqué dans les sorties.
 */
export function nomSecret(nom) {
  if (/^NEXT_PUBLIC_/.test(nom)) return /KEY|TOKEN|SECRET/.test(nom); // clé publishable : masquée aussi (inutile en clair)
  if (/(SECRET|PASSWORD|TOKEN|_KEY|KEY_|PRIVATE|_DB_URL|DATABASE_URL|REDIS_URL|DSN|WEBHOOK|BYPASS|HMAC|SALT|CREDENTIAL)/.test(nom)) return true;
  return false;
}

/** Masque partiel d'une adresse e-mail pour le rapport : j***@exemple.fr. */
export function masquerEmail(adresse) {
  const m = /^([^@]{1,64})@(.+)$/.exec(String(adresse ?? "").trim());
  if (!m) return "<adresse invalide>";
  return `${m[1][0]}***@${m[2]}`;
}

// ── Étapes et verdict ─────────────────────────────────────────────────────────

/** Normalise le résultat d'une étape. `details` : lignes courtes, jamais de valeur secrète. */
export function resultat(statut, resume, details = [], extra = {}) {
  if (!STATUTS.includes(statut)) throw new Error(`statut inconnu : ${statut}`);
  return { statut, resume, details, ...extra };
}

/** Convertit une exception levée par une étape en statut. */
export function statutDepuisErreur(erreur) {
  if (erreur instanceof Identifiant) return STATUT.BLOCKED_CREDENTIAL;
  if (erreur instanceof Reseau) return STATUT.BLOCKED_NETWORK;
  if (erreur instanceof Saut) return STATUT.SKIPPED;
  return STATUT.NO_GO;
}

/**
 * Code de sortie d'un script du pack Preview (0 GO · 1 NO-GO · 2 refus) → statut.
 * Un refus « … absente / obligatoire » est un identifiant manquant ; tout autre refus est un
 * garde-fou déclenché (Production, cible erronée) donc un NO-GO.
 */
export function statutDepuisSortie(code, sortie = "") {
  if (code === 0) return STATUT.GO;
  if (code === 2 && /(absente?s?|obligatoire|introuvable|manquante?s?|missing)/i.test(sortie) && !/PRODUCTION|\b(?:LIVE|live)\b/.test(sortie)) return STATUT.BLOCKED_CREDENTIAL;
  if (/(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed|could not translate host name|Network is unreachable|timeout expired|UND_ERR_CONNECT_TIMEOUT)/i.test(sortie)) return STATUT.BLOCKED_NETWORK;
  return STATUT.NO_GO;
}

/** Compte les statuts. */
export function compter(etapes) {
  const c = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  for (const e of etapes) c[e.statut] += 1;
  return c;
}

/**
 * Verdict global :
 *   plan hors ligne                             → PLAN (rien n'a été exécuté à distance) ;
 *   un NO-GO quelconque                         → NO-GO ;
 *   un BLOCKED_* sur une étape requise          → BLOCKED ;
 *   une étape requise SKIPPED                   → INCOMPLETE ;
 *   sinon                                       → QUALIFIED.
 */
export function verdict(etapes, { horsLigne = false } = {}) {
  if (horsLigne) return VERDICT.PLAN;
  if (etapes.some((e) => e.statut === STATUT.NO_GO)) return VERDICT.NO_GO;
  const requises = etapes.filter((e) => e.requise);
  if (requises.some((e) => e.statut === STATUT.BLOCKED_CREDENTIAL || e.statut === STATUT.BLOCKED_NETWORK)) return VERDICT.BLOCKED;
  if (requises.some((e) => e.statut === STATUT.SKIPPED)) return VERDICT.INCOMPLETE;
  return VERDICT.QUALIFIED;
}

/**
 * Arrêt de sécurité : une écriture ne s'exécute que si aucune étape CRITIQUE n'est ni NO-GO ni
 * bloquée. Renvoie la liste des étapes critiques qui empêchent l'écriture.
 */
export function bloqueursEcriture(etapes) {
  return etapes.filter((e) => e.critique && e.statut !== STATUT.GO && e.statut !== STATUT.SKIPPED).map((e) => e.id)
    .concat(etapes.filter((e) => e.critique && e.statut === STATUT.SKIPPED && e.bloqueSiSaute).map((e) => e.id));
}
