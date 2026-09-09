import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Garde-fous sur `public/sw.js`.
 *
 * Un service worker n'est pas chargeable par Vitest : il s'exécute dans un contexte
 * `ServiceWorkerGlobalScope` qui n'existe pas ici. Ces tests LISENT donc le fichier et
 * vérifient que ses invariants de sécurité y sont toujours écrits.
 *
 * C'est un test grossier, et il l'assume. Il ne prouve pas que le service worker se comporte
 * bien — seule la mesure navigateur le fera. Il empêche ce qui arrive vraiment : quelqu'un
 * qui, dans six mois, « accélère l'application » en mettant les réponses d'API en cache.
 *
 * Ce que cette personne ne verra pas, c'est qu'un cache de service worker est indexé par
 * ORIGINE et non par session : sur un téléphone partagé entre deux entreprises, les données
 * de la première seraient servies au compte de la seconde. Sans faute de RLS, sans trace
 * serveur, et sans que personne s'en aperçoive. L'échec de ce test est là pour amener cette
 * conversation avant la fusion, pas après l'incident.
 */
const FICHIER = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

/**
 * Retire commentaires et littéraux de chaîne avant toute assertion.
 *
 * Sans cette étape, ces tests mesurent la PROSE autant que le code : les deux premières
 * versions échouaient parce que les commentaires du service worker citent `addAll` et
 * `skipWaiting()` pour expliquer pourquoi on ne les emploie pas. Un test qui se déclenche
 * sur une explication est un test qui décourage d'expliquer.
 *
 * Le découpage est volontairement simple — il suffit pour ce fichier, qui ne contient ni
 * expression régulière au sens littéral ni gabarit imbriqué.
 */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // commentaires de bloc
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ") // commentaires de ligne (« // », pas « :// »)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');  // littéraux de chaîne, contenu neutralisé
}

const SW = codeSeul(FICHIER);

describe("invariants de sécurité du service worker", () => {
  it("ignore toute requête qui n'est pas un GET", () => {
    // Une mutation mise en cache serait rejouée ou servie depuis le cache : dans les deux
    // cas l'utilisateur croirait son action passée alors qu'elle ne l'est pas.
    // Sur le fichier brut : la garde porte sur un littéral de chaîne, que `codeSeul` neutralise.
    expect(FICHIER).toMatch(/request\.method\s*!==\s*"GET"\)\s*return/);
  });

  it("ignore tout ce qui n'est pas de la même origine", () => {
    // Supabase, Stripe et Sentry portent jetons et données : rien de tout cela n'entre ici.
    expect(SW).toMatch(/url\.origin\s*!==\s*self\.location\.origin\)\s*return/);
  });

  it("exclut explicitement l'optimiseur d'images de Next", () => {
    // `/_next/image?url=…` sert des images privées depuis une URL de même origine.
    expect(FICHIER).toMatch(/pathname\.startsWith\("\/_next\/image"\)\)\s*return/);
  });

  it("sert les navigations par le réseau d'abord, et ne les met jamais en cache", () => {
    const navigation = FICHIER.slice(FICHIER.indexOf('request.mode === "navigate"'));
    const bloc = navigation.slice(0, navigation.indexOf("if (estRessourceImmuable"));
    expect(bloc).toContain("fetch(request)");
    // Aucune écriture de cache dans la branche de navigation : une page authentifiée est
    // personnelle par nature.
    expect(bloc).not.toContain("cache.put");
    expect(bloc).toContain('caches.match("/offline")');
  });

  it("ne met en cache que des ressources publiques et non personnelles", () => {
    const autorise = FICHIER.slice(FICHIER.indexOf("const estStatiquePublique"), FICHIER.indexOf("self.addEventListener(\"fetch\""));
    // La liste blanche ne doit contenir ni chemin d'API, ni route de données.
    expect(autorise).not.toMatch(/\/api\//);
    expect(autorise).toContain("/icons/");
    expect(autorise).toContain("manifest.webmanifest");
  });

  it("n'impose pas une mise à jour à une page ouverte", () => {
    // `skipWaiting()` ne doit apparaître QUE derrière un message venu de la page,
    // jamais à l'installation : remplacer le service worker sous les pieds d'une saisie
    // en cours est exactement ce qu'une application de terrain ne doit pas faire.
    const occurrences = [...SW.matchAll(/skipWaiting\(\)/g)];
    expect(occurrences).toHaveLength(1);
    // Le seul appel restant doit être commandé par le message venu de la page. On le
    // cherche dans le fichier brut : le nom du message est un littéral de chaîne, que
    // `codeSeul` a précisément neutralisé.
    const positionMessage = FICHIER.indexOf("APPLIQUER_MISE_A_JOUR");
    const positionAppel = FICHIER.indexOf("self.skipWaiting()");
    expect(positionMessage).toBeGreaterThan(-1);
    expect(positionAppel).toBeGreaterThan(positionMessage);
  });

  it("sait vider ses caches sur demande de la page", () => {
    expect(FICHIER).toContain("PURGER_CACHES");
  });

  it("survit à l'échec d'une ressource de précache", () => {
    // `cache.addAll` est atomique : une ressource en échec empêcherait l'activation,
    // et l'application perdrait tout son hors-ligne à cause d'une requête malchanceuse.
    expect(SW).not.toContain("addAll");
    expect(SW).toMatch(/cache\.add\([^)]*\)\.catch/);
  });
});
