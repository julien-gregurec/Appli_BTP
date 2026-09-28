// Canal e-mail commun à toutes les applications ELSATIA.
//
// Architecture (docs/qualification/ELSATIA_TRANSACTIONAL_EMAIL_ARCHITECTURE_V1.md) :
//   environnement  — Production avérée ou non (fail-safe) ;
//   destinataires  — liste d'autorisation hors Production ;
//   applications   — une origine par application, liens validés ;
//   identite       — éditeur, RCS, contact configurable ;
//   gabarit        — rendu commun HTML + texte, bannière d'environnement ;
//   journal        — traces sans jeton, sans URL complète, sans adresse ;
//   livraison      — reprise, lettre morte, idempotence, fournisseur factice ;
//   brevo          — transport HTTP Brevo.

export * from "./environnement.ts";
export * from "./identite.ts";
export * from "./applications.ts";
export * from "./destinataires.ts";
export * from "./journal.ts";
export * from "./gabarit.ts";
export * from "./livraison.ts";
export * from "./brevo.ts";
