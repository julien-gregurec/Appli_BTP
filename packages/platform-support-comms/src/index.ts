/**
 * Contrat transverse ELSATIA : assistance interapplications et centre de
 * communications. Voir `README.md` pour la portée exacte de ce paquet.
 */

export * from "./applications";
export * from "./motifs";
export * from "./perimetres";
export * from "./session";
export * from "./mode-assistance";
export * from "./audit";
export * from "./notifications-assistance";
export * from "./texte";
export * from "./liens";
export * from "./image";
export * from "./consentement";
export * from "./affichage";
export * from "./communications";
export * from "./ciblage";
export * from "./offline";

/** Version du contrat. Toute application qui l'annonce peut être vérifiée côté serveur. */
export const VERSION_CONTRAT_ASSISTANCE_COMMUNICATIONS = "1.0.0";
