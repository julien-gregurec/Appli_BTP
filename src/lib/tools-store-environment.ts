/*
 * Environnement de vérification des achats Store d'ELSATIA Tools.
 *
 * Le problème que ce module ferme est un défaut de conception, pas une coquille. Avant lui,
 * `tools-native-monetization.ts` codait `Environment.SANDBOX` en dur à trois endroits
 * structurants — la construction du vérificateur Apple, le contrôle de la transaction et le
 * contrôle de la notification — et écrivait la chaîne `"sandbox"` en dur dans chaque ligne du
 * registre. Le type `ToolsEventReservation.environment` ne savait même pas exprimer
 * `"production"`, alors que le schéma SQL l'accepte depuis l'origine.
 *
 * Conséquence, et elle n'était pas comptable : une transaction App Store RÉELLE arrive avec
 * `environment = Production`, donc `verifyAppleTransaction` la REJETAIT. Un abonnement acheté
 * en vente réelle n'aurait jamais ouvert Tools Pro. Le même verrou frappait les App Store Server
 * Notifications V2 de production.
 *
 * Le contrat retenu ici tient en trois règles :
 *
 * 1. Un déploiement déclare l'environnement Store qu'il sert, par `TOOLS_STORE_ENVIRONMENT`.
 *    Une valeur inconnue est refusée dans tous les modes ; une valeur absente est refusée dès
 *    que le runtime est un runtime de production. On ne retombe JAMAIS silencieusement sur
 *    `sandbox` en production : c'est précisément le repli qui ferait vérifier un achat réel
 *    contre le bac à sable.
 *
 * 2. L'environnement inscrit au registre est celui que le fournisseur a RÉELLEMENT signé, pas
 *    celui que le déploiement espère. Les clés d'unicité du schéma portent toutes
 *    `environment` : un même identifiant de transaction peut donc coexister en sandbox et en
 *    production sans collision, ce qui est exactement ce qu'il faut pendant une phase TestFlight.
 *
 * 3. Un déploiement de production refuse par défaut les transactions bac à sable. Il peut les
 *    accepter, mais seulement sur autorisation explicite (`TOOLS_STORE_ALLOW_SANDBOX=true`),
 *    parce qu'une build TestFlight branchée sur le backend de production produit, elle, des
 *    transactions bac à sable. C'est une porte, pas un défaut : elle est fermée par défaut,
 *    elle s'ouvre en connaissance de cause, et elle se referme à la mise en vente.
 */

/** Environnements que les Stores distinguent réellement. */
export const TOOLS_STORE_ENVIRONMENTS = ["sandbox", "production"] as const;
export type ToolsStoreEnvironment = (typeof TOOLS_STORE_ENVIRONMENTS)[number];

/**
 * Environnements que le registre `tools_monetization_*` accepte, contrainte SQL comprise.
 * `test` est le mode d'essai de Stripe — le webhook Tools refuse `livemode`, il n'écrit que
 * celui-là — et n'a pas d'équivalent Apple ou Google.
 */
export const TOOLS_LEDGER_ENVIRONMENTS = ["test", "sandbox", "production"] as const;
export type ToolsLedgerEnvironment = (typeof TOOLS_LEDGER_ENVIRONMENTS)[number];

/** Erreur de configuration, distincte d'un refus de transaction. */
export class ToolsStoreEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolsStoreEnvironmentError";
  }
}

export const TOOLS_STORE_ENVIRONMENT_VARIABLE = "TOOLS_STORE_ENVIRONMENT";
export const TOOLS_STORE_ALLOW_SANDBOX_VARIABLE = "TOOLS_STORE_ALLOW_SANDBOX";

type Env = Record<string, string | undefined>;

function isStoreEnvironment(value: string): value is ToolsStoreEnvironment {
  return (TOOLS_STORE_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Un runtime de production au sens de Node. C'est le seul signal disponible côté serveur qui
 * soit vrai sur Vercel comme sur une exécution autonome, et il suffit à la règle qu'on veut :
 * en production, l'absence de déclaration est une erreur, pas une valeur par défaut.
 */
export function isProductionRuntime(env: Env = process.env) {
  return env.NODE_ENV === "production";
}

/**
 * Environnement Store déclaré par le déploiement.
 *
 * Lève `ToolsStoreEnvironmentError` si la valeur est inconnue, ou si elle est absente alors que
 * le runtime est en production. Ne retombe jamais sur `sandbox` en production.
 */
export function resolveToolsStoreEnvironment(env: Env = process.env): ToolsStoreEnvironment {
  const raw = env[TOOLS_STORE_ENVIRONMENT_VARIABLE]?.trim();
  if (raw) {
    if (isStoreEnvironment(raw)) return raw;
    /*
     * Une valeur inconnue est refusée partout, y compris en développement : c'est une faute de
     * frappe, et la laisser passer en local reviendrait à ne la découvrir qu'en production.
     * Le message ne cite jamais la valeur reçue — elle vient de l'environnement du processus.
     */
    throw new ToolsStoreEnvironmentError(
      `${TOOLS_STORE_ENVIRONMENT_VARIABLE} a une valeur inconnue. Valeurs acceptées : ${TOOLS_STORE_ENVIRONMENTS.join(", ")}.`,
    );
  }
  if (isProductionRuntime(env)) {
    throw new ToolsStoreEnvironmentError(
      `${TOOLS_STORE_ENVIRONMENT_VARIABLE} est absente en runtime de production. ` +
        "Sans elle, un achat réel serait vérifié contre le bac à sable : le repli est refusé.",
    );
  }
  /* Hors production, le bac à sable est le défaut sûr : aucun achat réel n'y transite. */
  return "sandbox";
}

/**
 * Le déploiement accepte-t-il des transactions bac à sable ?
 *
 * Un déploiement `sandbox` n'accepte que celles-là. Un déploiement `production` les refuse, sauf
 * autorisation explicite — le cas TestFlight, où les testeurs achètent en bac à sable contre le
 * backend de production.
 */
export function allowsSandboxTransactions(env: Env = process.env) {
  if (resolveToolsStoreEnvironment(env) === "sandbox") return true;
  return env[TOOLS_STORE_ALLOW_SANDBOX_VARIABLE]?.trim().toLowerCase() === "true";
}

/**
 * Vérifie qu'une transaction réellement signée par le fournisseur a le droit d'être traitée ici.
 *
 * `actual` doit provenir d'une charge utile VÉRIFIÉE, jamais d'une valeur déclarée par l'appelant.
 */
export function assertTransactionEnvironmentAllowed(actual: ToolsStoreEnvironment, env: Env = process.env) {
  const deployment = resolveToolsStoreEnvironment(env);
  if (actual === deployment) return;
  /*
   * Une transaction de production sur un déploiement bac à sable est toujours refusée : ce
   * déploiement n'a rien à faire d'un achat réel, et l'accepter mélangerait un droit payant à
   * des données d'essai.
   */
  if (actual === "production") {
    throw new Error("Transaction Store de production reçue par un déploiement bac à sable.");
  }
  if (!allowsSandboxTransactions(env)) {
    throw new Error(
      "Transaction Store en bac à sable reçue par un déploiement de production. " +
        `Autoriser explicitement par ${TOOLS_STORE_ALLOW_SANDBOX_VARIABLE}=true pendant une phase TestFlight.`,
    );
  }
}
