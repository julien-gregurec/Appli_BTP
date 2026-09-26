/**
 * `@elsatia/releve-domain` — domaine Relevé & Métré d'ELSATIA Tools.
 *
 * Sans dépendance (ni React, ni Supabase, ni API navigateur hors `crypto.randomUUID`) :
 * réutilisable par le web, le WebView Capacitor et un futur module de capture natif.
 *
 * | Module | Rôle |
 * |---|---|
 * | `model` | 14 entités du modèle minimal, énumérations partagées avec le SQL |
 * | `validation` | saisies et charges d'éléments, bornes identiques aux CHECK |
 * | `hierarchy` | arbre chantier → bâtiment → étage → zone → pièce, intégrité |
 * | `permissions` | matrice view/create/edit/delete/share/export/sync-gp (miroir RLS) |
 * | `entitlement` | capability premium `releve-metre`, prix de travail, non-activation |
 * | `storage` | chemins du bucket privé `tools-releves` |
 * | `gp-sync` | contrat v1 de transmission vers Gestion Pro (non branché) |
 * | `repository` / `service` | port de persistance et cas d'usage |
 */

export * from "./ids";
export * from "./model";
export * from "./validation";
export * from "./hierarchy";
export * from "./permissions";
export * from "./entitlement";
export * from "./storage";
export * from "./gp-sync";
export * from "./repository";
export * from "./service";
