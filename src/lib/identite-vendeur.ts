// ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1 — identité du VENDEUR (ELSATIA → clients).
//
// Source unique, côté Gestion Pro, de l'identité de l'éditeur qui vend l'abonnement.
// Ne pas confondre avec l'identité des entreprises clientes (table `entreprises`), qui
// émettent leurs propres devis et factures sous leur nom.
//
// Règles :
//   * chaque champ porte un statut : `PROUVE` (valeur et provenance citées dans le dépôt)
//     ou `DECISION_REQUIRED` (valeur `null`, jamais devinée) ;
//   * aucune donnée personnelle non nécessaire : ni date de naissance, ni adresse
//     personnelle tant que sa publication n'a pas fait l'objet d'une décision explicite ;
//   * aucun régime de TVA n'est choisi ici. `mentionTva` reste `null` tant que le régime
//     n'est pas confirmé par l'exploitant (et son comptable) ;
//   * `packages/email/src/identite.ts` (ligne légale des e-mails) et
//     `docs/juridique/*.md` doivent rester alignés : `identite-vendeur.test.ts` le vérifie.
//
// Rapport : docs/qualification/ELSATIA_LEGAL_CONSENT_COMMERCIALIZATION_PACK_V1.md (§1).

export type StatutChampLegal = "PROUVE" | "DECISION_REQUIRED";

export type ChampLegal<T = string> = Readonly<{
  valeur: T | null;
  statut: StatutChampLegal;
  /** Où la valeur est prouvée, ou pourquoi elle manque. */
  provenance: string;
}>;

function prouve<T>(valeur: T, provenance: string): ChampLegal<T> {
  return Object.freeze({ valeur, statut: "PROUVE", provenance });
}

function decisionRequise(provenance: string): ChampLegal<never> {
  return Object.freeze({ valeur: null, statut: "DECISION_REQUIRED", provenance });
}

export const IDENTITE_VENDEUR = Object.freeze({
  exploitant: prouve(
    "Julien GREGUREC",
    "docs/juridique/mentions-legales.md ; packages/email/src/identite.ts ; audit ELSATIA_LEGAL_IDENTITY_COMMERCIALIZATION_AUDIT_V1 (branche claude/awesome-franklin-se2s33)",
  ),
  nomCommercial: prouve("ELSATIA", "docs/juridique/mentions-legales.md (« exerçant sous le nom commercial ELSATIA »)"),
  forme: prouve("entrepreneur individuel (EI)", "docs/juridique/mentions-legales.md ; packages/email/src/identite.ts"),
  formeAbregee: prouve("EI", "packages/email/src/identite.ts"),
  siren: prouve(
    "850 559 873",
    "préfixe du SIRET provisionné en Production et du RCS (docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md §10 ; packages/email/src/identite.ts)",
  ),
  rcs: prouve("850 559 873 R.C.S. Strasbourg", "packages/email/src/identite.ts ; audit identité légale V1 (immatriculation du 28/09/2026)"),
  // L'immatriculation au RNE est un fait distinct du RCS : aucun numéro ni attestation
  // RNE n'est cité dans le dépôt.
  rne: decisionRequise("aucune attestation RNE citée dans le dépôt — à confirmer sur l'avis d'immatriculation"),
  siret: prouve(
    "850 559 873 00011",
    "NEXT_PUBLIC_LEGAL_SIRET, « provisionnée et vérifiée conforme » sur elsatia-production le 2026-09-05 (docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md §5.8)",
  ),
  domaineSite: prouve("elsatia.fr", "docs/juridique/README.md (domaine final)"),
  domaineApplication: prouve("app.elsatia.fr", "docs/juridique/README.md ; NEXT_PUBLIC_APP_URL vérifiée en Production (runbook rollback §10)"),
  emailContact: prouve(
    "support@elsatia.fr",
    "docs/juridique/README.md (« opérationnelle, configurée en Production ») ; diffusé via SUPPORT_EMAIL, jamais codé en dur dans les gabarits",
  ),
  // Une adresse figure dans docs/juridique/mentions-legales.md comme « retenue pour
  // l'immatriculation ». Aucune décision explicite de PUBLIER cette adresse personnelle
  // (plutôt qu'une domiciliation) n'est tracée : elle n'est donc pas reprise ici.
  adresse: decisionRequise("publication de l'adresse personnelle vs domiciliation non tranchée explicitement"),
  regimeTva: decisionRequise("régime non confirmé — NEXT_PUBLIC_LEGAL_TVA laissée vide en Production (runbook préflight §5.8)"),
  numeroTvaIntracommunautaire: decisionRequise("dépend du régime de TVA, non confirmé"),
  codeApe: decisionRequise("aucun code APE/NAF cité dans le dépôt"),
});

/** Ligne légale courte réutilisable (factures, e-mails, pied de page). Champs prouvés uniquement. */
export function ligneLegaleVendeur(): string {
  const i = IDENTITE_VENDEUR;
  return `${i.nomCommercial.valeur} — édité par ${i.exploitant.valeur}, ${i.formeAbregee.valeur}, ${i.rcs.valeur}.`;
}

/** Champs encore manquants, pour les contrôles et le rapport. */
export function champsVendeurNonTranches(): string[] {
  return Object.entries(IDENTITE_VENDEUR)
    .filter(([, champ]) => champ.statut === "DECISION_REQUIRED")
    .map(([nom]) => nom);
}
