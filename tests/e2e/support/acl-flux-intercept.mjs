// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — préchargement de RECETTE du serveur Next (NODE_OPTIONS=--import).
// Redirige vers le simulateur local (acl-flux-externes.mjs) les appels sortants à Stripe et Brevo :
// aucun appel réel, aucune clé réelle. Refuse de démarrer si une clé Stripe Live est présente.
const cleStripe = process.env.STRIPE_SECRET_KEY ?? "";
if (cleStripe.startsWith("sk_live") || cleStripe.startsWith("rk_live")) {
  throw new Error("Recette ACL : clé Stripe LIVE détectée — démarrage refusé.");
}
const BASE = (process.env.ACL_FLUX_EXTERNES_URL ?? "http://127.0.0.1:3197").replace(/\/$/, "");
const CIBLES = [
  ["https://api.stripe.com/", `${BASE}/stripe/`],
  ["https://api.brevo.com/", `${BASE}/brevo/`],
];
const fetchReel = globalThis.fetch.bind(globalThis);

globalThis.fetch = (entree, options) => {
  const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
  for (const [origine, destination] of CIBLES) {
    if (url.startsWith(origine)) {
      const cible = destination + url.slice(origine.length);
      return typeof entree === "string" || entree instanceof URL
        ? fetchReel(cible, options)
        : fetchReel(new Request(cible, entree), options);
    }
  }
  return fetchReel(entree, options);
};
