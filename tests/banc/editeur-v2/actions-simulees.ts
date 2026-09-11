/**
 * Banc de recette de l'éditeur v2 — doublures des actions serveur.
 *
 * Remplace `@/app/actions/devis-v2` à l'empaquetage du banc : même signature, données FICTIVES en
 * mémoire, aucune base, aucun réseau. La recherche applique le VRAI classement
 * (`rechercherArticles`, sept niveaux) ; l'enregistrement calcule le VRAI appel
 * (`payloadEnregistrementV2`) et le garde dans `window.__banc` pour que la recette l'inspecte.
 */
import { payloadEnregistrementV2, type EnteteDevisV2, type OrigineLigneLibre } from "@/lib/devis/enregistrement-v2";
import type { ElementDevis } from "@/lib/devis/presentation";
import { normaliser, rangCorrespondance, rechercherArticles, type ArticleCatalogue } from "@/lib/devis/recherche-articles";
import type { VersionOuvrage } from "@/lib/devis/ouvrages";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

type Banc = {
  droits: { voirCouts: boolean; gererCouts: boolean; modifierPrix: boolean; modifierUnite: boolean };
  enregistrements: Array<{ devisId: string | null; entete: EnteteDevisV2; elements: ElementDevis[]; payload: ReturnType<typeof payloadEnregistrementV2> }>;
  recherches: string[];
};

declare global {
  interface Window { __banc: Banc }
}

const E = "ent-banc";
const article = (p: Partial<ArticleCatalogue> & { id: string; designation: string }): ArticleCatalogue => ({
  entrepriseId: E, source: "prestation", referenceInterne: null, referenceFabricant: null, description: null, fabricant: null,
  fournisseur: null, codeBarres: null, unite: "u", prixAchatHt: null, prixVenteHt: 0, tauxTva: 20, stockDisponible: null,
  actif: true, typeLigne: "fourniture", ...p,
});

export const CATALOGUE_FICTIF: ArticleCatalogue[] = [
  article({ id: "p1", designation: "Plaque de plâtre BA13 (fictif)", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521", fabricant: "Fabricant fictif", fournisseur: "Fournisseur fictif", unite: "m²", prixAchatHt: 12.5, prixVenteHt: 20 }),
  article({ id: "p2", designation: "Plaque BA13 hydro (fictif)", referenceInterne: "ba13 200", unite: "m²", prixAchatHt: 15, prixVenteHt: 24 }),
  article({ id: "p3", designation: "Rail métallique 48 (fictif)", referenceInterne: "RAIL-48", referenceFabricant: "BA13-200", unite: "ml", prixAchatHt: 1.8, prixVenteHt: 3 }),
  article({ id: "p4", designation: "Pose de cloison (fictif)", referenceInterne: "POSE-CL", unite: "h", prixAchatHt: 32, prixVenteHt: 55, tauxTva: 10, typeLigne: "main_oeuvre" }),
  article({ id: "s1", source: "article", designation: "Cheville à expansion (fictif)", referenceInterne: "STK-CHEV", codeBarres: "3760123456789", prixAchatHt: 0.12, prixVenteHt: 0.35, tauxTva: null, stockDisponible: 500 }),
  article({ id: "a1", designation: "Ancien rail (fictif)", referenceInterne: "RAIL-OLD", actif: false, prixVenteHt: 2 }),
];

const banc = (): Banc => window.__banc;

export async function rechercherArticlesDevisAction(recherche: string) {
  banc().recherches.push(recherche);
  const voir = banc().droits.voirCouts;
  return {
    articles: rechercherArticles(CATALOGUE_FICTIF, recherche, E).map((a) => ({
      ...a,
      prixAchatHt: voir ? a.prixAchatHt : null,
      rang: rangCorrespondance(a, recherche) ?? 7,
      origineReferenceInterne: a.source === "article" ? "reference_stock" : "reference_interne",
    })),
  };
}

export async function rechercherOuvragesAction(recherche: string) {
  const v = plancherChauffantFictif();
  const q = normaliser(recherche);
  const trouve = [v.referenceInterne, v.nom, v.categorie, ...v.composants.flatMap((c) => [c.referenceInterne, c.referenceFabricant, c.fabricant])]
    .some((x) => normaliser(x).includes(q));
  return {
    ouvrages: q && trouve
      ? [{ id: v.ouvrageId, referenceInterne: v.referenceInterne, nom: v.nom, categorie: v.categorie, unitePrincipale: v.unitePrincipale, versionCourante: v.version, statut: "actif" as const, correspondance: "référence" }]
      : [],
  };
}

export async function chargerOuvrageAction(ouvrageId: string): Promise<{ version: VersionOuvrage }> {
  // Le banc ne connaît qu'un ouvrage fictif : l'identifiant demandé est sans effet.
  void ouvrageId;
  const v = plancherChauffantFictif();
  const voir = banc().droits.voirCouts;
  return { version: { ...v, composants: v.composants.map((c) => ({ ...c, prixAchatHt: voir ? c.prixAchatHt : null })) } };
}

export async function enregistrerDevisV2Action(
  devisId: string | null,
  entete: EnteteDevisV2,
  elements: ElementDevis[],
  origines: Record<string, OrigineLigneLibre>,
) {
  const payload = payloadEnregistrementV2(entete, elements, { inclureCouts: banc().droits.gererCouts, origines });
  banc().enregistrements.push({ devisId, entete, elements, payload: JSON.parse(JSON.stringify(payload)) });
  return { id: "devis-banc" };
}

export async function publierOuvrageAction() {
  return { id: "ouvrage-banc" };
}

export async function changerStatutOuvrageAction() {
  return { ok: true as const };
}
