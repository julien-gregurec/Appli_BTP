import { NextResponse } from "next/server";

/**
 * Traduit l'échec de la garde d'accès d'une ROUTE d'API en réponse JSON.
 *
 * Avant : `exigerAccesApplication` levait `AccesApplicationRefuseError`, non rattrapée dans
 * `photos`, `export/inventaire` et `ocr` → 500 Next générique (corps vide), donc un client qui
 * attend `{ erreur }` plantait. Contrat cible (docs/qualification/ELSATIA_APPLICATION_ACCESS_
 * CONVERGENCE_V1.md §10) : 403 JSON pour un refus, 503 JSON pour une panne de la décision.
 *
 * Renvoie `null` pour toute autre erreur : l'appelant la relance, rien n'est avalé.
 * Le champ de message reste `erreur`, celui de Colors. `code` est celui du contrat commun :
 * `refus_non_qualifie` tant que la base ne rend pas de motif.
 *
 * Reconnaissance par `name` et non par `instanceof` : robuste aux doubles copies du paquet.
 */
export function refusApiDepuisErreur(erreur: unknown): NextResponse | null {
  const nom = erreur instanceof Error ? erreur.name : "";
  if (nom === "AccesApplicationRefuseError") {
    return NextResponse.json(
      { erreur: "Accès à Colors refusé", code: "refus_non_qualifie" },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (nom === "AccesApplicationIndisponibleError") {
    return NextResponse.json(
      { erreur: "Vérification d’accès indisponible, réessayez", code: "indisponible" },
      { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "30" } },
    );
  }
  return null;
}
