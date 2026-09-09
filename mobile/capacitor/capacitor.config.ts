import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Coque native ELSATIA Gestion Pro — CONFIGURATION DE PILOTE, NON PUBLIABLE EN L'ÉTAT.
 *
 * ── Pourquoi ce fichier vit hors de l'application ───────────────────────────────────────
 *
 * Il n'est PAS à la racine de Gestion Pro, et ses dépendances ne sont PAS dans le
 * `package.json` de l'application. C'est délibéré : tant que la publication n'est pas
 * décidée, faire entrer `@capacitor/ios` et `@capacitor/android` dans l'arbre de dépendances
 * d'une application web ajouterait des paquets natifs à chaque installation, à chaque build
 * Vercel et à chaque audit de sécurité — pour une coque que personne n'utilise encore.
 *
 * ── Pourquoi `server.url` et pas un bundle embarqué ────────────────────────────────────
 *
 * Gestion Pro ne peut pas produire de `output: "export"` : CSP à nonce par requête, session
 * SSR par cookies, 55 fichiers d'actions serveur, 47 routes d'API, Chromium et ExcelJS
 * chargés au runtime. Il n'y a aucun `out/` à embarquer, et il ne peut pas y en avoir sans
 * réécrire le produit. La recette qui marche pour `apps/tools` — application entièrement
 * cliente — ne se transpose pas.
 *
 * ── Le coût de ce choix, écrit noir sur blanc ──────────────────────────────────────────
 *
 * En mode `server.url`, Capacitor injecte son pont natif dans une page CHARGÉE DEPUIS LE
 * RÉSEAU. Le code distant obtient donc l'accès aux interfaces natives déclarées. Or le
 * cookie de session de Gestion Pro est délibérément lisible en JavaScript
 * (`httpOnly: false` — les clients Supabase navigateur doivent le rafraîchir). Ce choix est
 * correct pour un navigateur, où la CSP à nonce est une défense sérieuse. Dans une coque, il
 * change de portée : une injection réussie n'atteindrait plus seulement la session, elle
 * atteindrait le système de fichiers de l'appareil.
 *
 * C'est pourquoi AUCUN plugin natif n'est déclaré ici. La coque ne fait que présenter
 * l'application ; elle ne lui donne aucun pouvoir supplémentaire. Toute déclaration de
 * plugin doit être arbitrée au regard du paragraphe ci-dessus, jamais ajoutée par commodité.
 *
 * Voir `docs/mobile/ELSATIA_GP_MOBILE_ARCHITECTURE_PHASE_B_V1.md`.
 */

/**
 * L'origine servie par la coque.
 *
 * Aucune valeur de production par défaut. Un fichier de configuration qui pointe sur
 * `app.elsatia.fr` « pour l'exemple » finit par être compilé tel quel : on exige donc une
 * variable explicite et on échoue franchement si elle manque.
 */
const origine = process.env.ELSATIA_GP_NATIVE_URL;
if (!origine) {
  throw new Error(
    "ELSATIA_GP_NATIVE_URL est obligatoire (origine HTTPS servie par la coque). " +
    "Aucune valeur par défaut n'est fournie : une coque compilée sur la mauvaise origine " +
    "est indétectable une fois installée.",
  );
}
if (!origine.startsWith("https://")) {
  throw new Error("ELSATIA_GP_NATIVE_URL doit être une origine HTTPS.");
}

const config: CapacitorConfig = {
  appId: "fr.elsatia.gestionpro",
  appName: "Gestion Pro",
  // Répertoire de secours : un simple écran qui explique qu'une connexion est requise au
  // premier lancement. Il n'embarque PAS l'application — voir la note de tête.
  webDir: "public-secours",
  backgroundColor: "#0d1b2a",
  loggingBehavior: "none",
  zoomEnabled: false,
  server: {
    url: origine,
    // Le trafic en clair est refusé : la session voyage dans ces requêtes.
    cleartext: false,
    // La navigation reste enfermée sur l'origine de l'application. Sans cette liste, un lien
    // sortant s'ouvrirait DANS la coque, avec le pont natif injecté — un site tiers
    // hériterait alors du contexte natif.
    allowNavigation: [new URL(origine).host],
  },
  android: {
    allowMixedContent: false,
    captureInput: false,
  },
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    scrollEnabled: true,
    // Les liens externes partent dans le navigateur du système, hors du pont natif.
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;
