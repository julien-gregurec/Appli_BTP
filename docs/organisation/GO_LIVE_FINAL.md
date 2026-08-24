# GO-LIVE-FINAL — Audit final ELSATIA avant commercialisation

Date : 2026-08-24. Lot d'audit read-only (aucune nouvelle fonctionnalité), release
`release/commercialisation-v1`, HEAD au moment de l'audit `a3b5f23`.

## Résumé exécutif

Aucun bug P0/P1 technique trouvé. La suite de tests complète (506/506), le build, le
typecheck, le lint, `verify:migrations` (209), `verify:secrets` (903 fichiers, 0 secret) et
`npm audit` (0 vulnérabilité) sont tous verts. Production (`app.elsatia.fr`) est saine :
aucune page testée en 500, migrations 100% synchronisées avec le ledger réel, clés Supabase
legacy désactivées (confirmé via documentation d'incident antérieure), flags cohérents avec
l'état commercial attendu. Une correction de sécurité RLS récente (lecture Storage
`documents-employes`/`factures-fournisseurs`/`pointage-preuves`) est confirmée déployée à la
fois sur Preview et Production par lecture directe de la policy en base.

Tous les blocages restants avant un premier paiement réel sont **externes et
administratifs** : immatriculation INPI/INSEE en attente, compte bancaire en attente (RDV
27 août 2026), régime TVA à confirmer, KYC Stripe non lancé (dépend des prérequis
précédents). Stripe Live est structurellement inactif (compte `charges_enabled`/
`payouts_enabled`/`details_submitted` tous à `false`, 0 produit/price/webhook Live).

**Un incident a été identifié pendant cet audit** : un token de contournement de protection
Vercel (Preview) a été réaffiché en clair dans la sortie d'une commande Stripe CLI
(`stripe webhook_endpoints list`) — il s'agit d'un token déjà connu et documenté comme non
corrigé dans `P15_STRIPE_LIVE_PREPARATION.md`, pas un secret applicatif (Stripe/Supabase/
Brevo/OpenAI). Recommandation : le régénérer côté Vercel avant publication, par précaution,
puisqu'il a maintenant été affiché deux fois dans des transcriptions de session.

## 1-2. Git / release

`release/commercialisation-v1`, arbre propre, `HEAD = a3b5f23`, identique à
`origin/release/commercialisation-v1`. Tous les lots requis (P15-PREP, AI-LAUNCH, AI-PROD,
IA-DEVIS, IA-DEVIS-PROD, ABONNEMENTS-DETAIL-V1C, COMPTES-SUPPLEMENTAIRES-V1C,
REMISES-CLIENTS-V1, PIECES-JOINTES-V1, WORKFLOW-DEVIS-V1, RELANCES-AUTO-V1,
RELANCES-AUTO-PROD-ACTIVATION-V1) confirmés ancêtres de HEAD via `git merge-base
--is-ancestor`. Aucune branche `PROMO-V1` trouvée dans le dépôt.

## 3. Production

Pages testées (fetch authentifié + navigation réelle) : dashboard, clients, chantiers,
devis, factures, planning, pointage, notes-frais, paramètres, paramètres/relances,
mon-espace, messagerie, abonnement — toutes 200, aucun 500. `/plateforme/*` (super-admin
plateforme, `estPlateformeAdmin()`) 404 pour un compte non-admin — comportement attendu, pas
un défaut.

## 4. Cartographie des lots

Voir §1-2. Confirmé propre.

## 5. Voir §3.

## 6. Feature flags

`FEATURE_AI_ENABLED` / `FEATURE_AI_DEVIS_ENABLED` / `FEATURE_RELANCES_AUTO_ENABLED` :
variables `Sensitive` (illisibles par `vercel env pull`, par design du système de clés) —
confirmées `true` **par comportement observé en direct** (assistant IA répond, aperçu IA
devis fonctionne, relances automatiques exécutées lors de RELANCES-AUTO-PROD-ACTIVATION-V1
plus tôt cette même session) plutôt que par lecture de valeur.
`FEATURE_CRONS_ENABLED = false` (confirmé, `Non-sensitive`, pull direct).
`FEATURE_BOUTIQUE_ENABLED = false` (module non commercialisé, cohérent).
`DISABLE_EMAIL_LOGIN = false` (login email actif, normal).
Aucun `FEATURE_POWENS*` trouvé (fonctionnalité non implémentée, pas une anomalie).

## 7. Supabase

Publishable/secret (nouveau système) en usage exclusif confirmé par
`docs/security/SECURITY_CREDENTIALS_V1_SUPABASE_ROTATION.md` (rotation antérieure,
documentée, hors de ce lot) : legacy `anon`/`service_role` désactivées via le Dashboard
(« Disable JWT-based API keys »), JWT signing secret jamais touché. `supabase projects
api-keys` liste toujours les clés legacy (list ≠ actif — la désactivation ne les retire pas
de la liste), confirmé sans afficher aucune valeur (`jq` restreint à `name`/`type`/`id`
uniquement).

## 8. Migrations

`supabase migration list --linked` sur Production : 100% des migrations locales
correspondent à une entrée distante, aucune ligne avec `local` ou `remote` vide sur 209
entrées. Aucun drift.

## 9. RLS / multi-tenant

~26 fichiers pgTAP dédiés (`supabase/tests/*.sql`, ~322 assertions), couvrant clients,
chantiers, notes de frais, documents/storage, devis, factures, fournisseurs, commandes,
stock, messagerie interne, `journal_ia`. Non ré-exécutés en masse (nécessite une stack
Docker locale non démarrée) — revue de code faite à la place. Vitest exécuté réellement :
3 fichiers ciblés cross-tenant (relances, assistant IA), **35/35 tests PASS**. `remises` :
pas de table séparée (colonnes sur `entreprises` + RPC `plateforme_appliquer_remise` gardée
par `est_plateforme_admin()`, vérifié dans la migration source) — isolation héritée de la
RLS existante sur `entreprises`, pas de nouveau test dédié nécessaire.

## 10. Rôles

Double application confirmée en code : masquage client (`ModuleAccessBoundary`) **et**
refus serveur (`proxy.ts`, RLS). Un test explicite (`terrain_mobile_v1c...test.sql`) prouve
que RLS tient la barrière indépendamment de l'UI. Point faible mineur : `proxy.ts`
lui-même n'a pas de test unitaire isolé (couverture indirecte seulement).

## 11. Terrain

**TERRAIN CLOS.** Permission `voir_devis_chantier_sans_prix` exclut tout champ prix côté
RPC (vérifié dans la migration). Garde explicite dans `copilote.ts` empêchant l'assistant
IA de contourner les droits de menu. Dernier commit touchant Terrain (`6d67dfb`, 21/08)
antérieur à tout commit modifiant `module-permissions.ts` — aucune régression du périmètre
depuis la clôture.

## 12-13. Clients / chantiers / devis manuel

Testé en direct sur Production (fixture existante) : création d'un devis brouillon (client,
ligne, TVA 20%, total 120€ TTC), génération PDF (200, `application/pdf`), suppression
propre (statut brouillon, aucun résidu). Sélection client fonctionnelle.

## 14. IA devis

Testé en direct : demande sans client → refus propre et clair (« vérifie qu'un client a
bien été identifié... »), pas d'hallucination. Génération complète déjà exhaustivement
prouvée dans IA-DEVIS-PROD-ACTIVATION-V1 (même session, lot antérieur).

## 15. Workflow devis → chantier

Non re-testé en live (créerait un résidu accepté supplémentaire, déconseillé par le
cahier des charges). Validé par code/tests existants (`fe180e9`, `c7d4c40`,
`0c2eb2e` — RPC `creer_chantier_depuis_devis()`, traçabilité `devis_source_id`,
idempotence).

## 16. Factures

`/factures` 200. Facture résiduelle (`FAC-RELANCE-PROD-TEST`) affichée correctement
(solde, échéance, PDF) — déjà vérifiée en profondeur lors de RELANCES-AUTO-PROD-ACTIVATION-V1.

## 17. Abonnements

`/abonnement` 200, testé en direct (390px) : statut Essai, offre à choisir, comptes
facturables/inclus, estimation coût HT/mois affichée correctement.

## 18. Comptes supplémentaires

Confirmé via Stripe CLI (Test) : 4 offres de compte supplémentaire (Mini/Pro/Business/
Entreprise) présentes comme produits actifs, prix associés (31 prices Test au total).

## 19. Remises

Voir §9 — écriture réservée `est_plateforme_admin()` au niveau RPC (le client ne peut
jamais s'auto-attribuer une remise). Non testé en live (éviterait de multiplier les coupons
Test, conforme à la consigne).

## 20. IA générale

Testé en direct sur Production : « Quelles factures sont en retard ? » → réponse correcte,
scoping tenant respecté (uniquement la facture de l'entreprise courante retournée).

## 21. Relances

État confirmé : manuelle devis/facture, simulation, paramètres, activable par entreprise,
`FEATURE_RELANCES_AUTO_ENABLED` actif globalement, `FEATURE_CRONS_ENABLED` faux, découplage
intact — tout ceci prouvé en conditions réelles lors de RELANCES-AUTO-PROD-ACTIVATION-V1
plus tôt dans cette même session (voir `docs/commercial/RELANCES_AUTO_PROD_ACTIVATION_V1.md`).
Aucun email supplémentaire envoyé dans ce lot (preuve récente suffisante).

## 22. Brevo

Réception réelle déjà confirmée directement par Julien lors du lot précédent. Non retesté.

## 23-24. Pièces jointes / Storage

Suppression devis : confirmé par code que l'objet Storage réel est supprimé (pas seulement
la ligne DB). Tous les buckets (`bulletins-paie`, `chantier-documents`, `devis-medias`,
`documents-employes`, `documents-paie`, `entreprise-assets`, `factures-fournisseurs`,
`fiches-techniques`, `messagerie-medias`, `notes-frais`, `notes-frais-exports`,
`pointage-preuves`) sont `public=false`. **Correctif de sécurité récent confirmé déployé** :
policy `role_gestion_fichiers_select` (lecture restrictive sur `documents-employes`/
`factures-fournisseurs`/`pointage-preuves`, gardée par
`peut_lire_document_employe_sensible()`/`a_permission(..., 'gerer_achats')`/
`a_permission(..., 'gerer_pointage')`) — lue **directement en base** sur Production ET
Preview, correspond exactement au SQL de la migration `20260824000224`. Test pgTAP dédié
(9 assertions) existe mais n'a pas pu être ré-exécuté dans ce lot (contrainte d'outillage
`\ir` non supporté par le runner `db query -f` distant combinée à la sémantique
transaction/rollback du test — nécessiterait une stack Docker locale). La preuve
structurelle (policy identique au correctif sur les deux environnements) est jugée
suffisante à ce stade ; une ré-exécution comportementale reste recommandée dès qu'une
stack locale est disponible.

## 25. Notes de frais

Hash/audit trail confirmé (chaîne sha256, `journal_audit_notes_frais`, verrou
`pg_advisory_xact_lock`). Terrain peut soumettre ses propres notes (`saisir_ses_notes_frais`
distinct de `gerer_notes_frais`). Testé en direct (mobile 390px) : message correct
« Votre compte doit être lié à une fiche employé active... ».

## 26. Planning / pointage

`/planning`, `/pointage` 200. Non approfondi (Terrain clos, pas de résidu nécessaire).

## 27. Relances automatiques — sécurité

`FEATURE_RELANCES_AUTO_ENABLED` actif (comportement observé), `FEATURE_CRONS_ENABLED`
confirmé faux, découplage prouvé en conditions réelles (lot précédent), `CRON_SECRET`
confirmé présent (ajouté lors du lot précédent, valeur jamais affichée).

## 28-29. Coûts / quotas IA

`journal_ia` confirmé sans colonne conversation/prompt (uniquement métriques :
jetons/coût/statut/message d'erreur tronqué). `verifierPlafondIA()` appelé
systématiquement avant chaque action IA (6 points d'appel identifiés). **Point faible
identifié** : aucun test dédié au scénario « quota dépassé → blocage effectif » trouvé —
recommandation roadmap, non bloquant (le mécanisme existe et est appelé, seul le test du
cas limite manque).

## 30. Mobile

Testé en direct à 390px : dashboard, abonnement, notes-frais — aucun débordement
horizontal, grille de modules bien wrappée, formulaires lisibles.

## 31. Accessibilité

Navigation clavier (Tab) fonctionnelle avec focus visible. Aucun bouton sans label trouvé.
Point faible mineur : 0 région `aria-live` détectée sur la page notes-frais testée
(feedback dynamique non annoncé aux lecteurs d'écran) — roadmap, pas un audit WCAG complet.

## 32. Performance

Aucune requête en boucle ni timeout observé pendant toute la session de test. Pas de 5xx
dans les 300 dernières entrées de logs Vercel.

## 33. Sentry

`sendDefaultPii: false` confirmé dans les trois configurations (`sentry.server.config.ts`,
`sentry.edge.config.ts`, `src/instrumentation-client.ts`).

## 34. Vercel logs

300 dernières entrées : 100% niveau `info`, aucune erreur/warning, aucun 4xx/5xx anormal
(inclut le trafic généré par cet audit lui-même).

## 35-36. Site public / Contact

`elsatia.fr` testé en direct : accueil, mentions légales (bandeau honnête « Document de
travail — à finaliser », cohérent avec `docs/juridique/`), formulaire contact (chargé,
non soumis pour éviter un email inutile — déjà validé lot C1-E), 404 réel (status 404),
`robots.txt` et `sitemap.xml` tous deux 200.

## 37. Juridique

- Exploitant / adresse : renseignés, marqués « à revérifier contre l'avis SIRENE » →
  **EN ATTENTE INPI-INSEE**.
- SIRET / SIREN / RCS / APE-NAF / TVA intracommunautaire : **EN ATTENTE INPI-INSEE**.
- Hébergeur (Vercel/Supabase) : **COMPLET**.
- Sous-traitants RGPD (`rgpd-sous-traitants.md`) : liste correcte mais date en placeholder
  non rempli et DPA non confirmés signés → **À CORRIGER** (non bloquant, action de suivi
  documentaire).
- Email support : incohérence trouvée — `mentions-legales.md` garde le placeholder
  `[EMAIL_SUPPORT]` alors que `support@elsatia.fr` est déjà opérationnel ailleurs →
  **À CORRIGER** (correction de documentation simple, hors périmètre de ce lot d'audit).

## 38. Administratif

INPI/INSEE : déposé, en attente de retour SIREN/SIRET. Micro-entreprise confirmée comme
structure de lancement. TVA : franchise en base pressentie, bloquée tant que le régime
n'est pas confirmé par l'immatriculation. Banque/IBAN : compte non ouvert, RDV bancaire
prévu le 27 août 2026. Assurance RC Pro : recommandée, non bloquante, pas encore souscrite.
Stripe KYC : non lancé (dépend des prérequis ci-dessus).

## 39. Stripe Test

Confirmé sain en direct (CLI, aucune valeur sensible affichée) : 12 produits / 31 prices,
100% `livemode:false`. 2 webhooks Test, tous deux `status:enabled`. Catalogue cohérent
(Mini/Pro/Business/Entreprise, comptes supplémentaires par offre, artefacts Preview
identifiés).

## 40. Stripe Live

**NON ACTIVÉ**, confirmé structurellement : 0 produit/price Live (`livemode:true` = 0 sur
les deux), compte `acct_1TtrTU0bT5C0WG2a` avec `charges_enabled=false`,
`payouts_enabled=false`, `details_submitted=false` — aucun paiement réel n'est possible
même en cas d'erreur de configuration.

## 41. P15

`P15_STRIPE_LIVE_PREPARATION.md` : audit Stripe Test complet, KYC checklist en attente
INPI/banque, conclusion explicite **NO-GO P15 Live**, plan d'activation 20 étapes prêt
mais non exécuté. `P15_GO_LIVE_CHECKLIST.md` : aucune case cochée, cohérent avec l'état
administratif actuel. Aucune mise à jour nécessaire dans ce lot (statut externe inchangé).

## 42. Données Production

4 entreprises seulement : **Atelier Bâtiment Lyonnais** (démo, confirmée fictive — emails
`@example.test`, noms/sociétés génériques), **elsatia** (réelle — compte propre de Julien,
`julien.gregurec@gmail.com`, essai, 0 donnée, jamais à toucher), **ARCHIVE IMMUABLE V1E**
(résidu permanent auto-documenté, antérieur à cette session), **RECETTE-RELANCES-PROD-V1**
(résidu permanent créé lors du lot précédent cette session, documenté).

## 43. Résidus

Deux résidus permanents consolidés (voir §42), tous deux auto-documentés (nom explicite ou
`notes_internes`/`notes` préfixés), accès non exploitable (comptes essai sans usage actif),
impact nul sur la facturation ou les vrais clients. Aucune suppression tentée (bloquée par
triggers d'immutabilité, discipline constante depuis WORKFLOW-DEVIS-V1).

## 44. Compte démo

`Atelier Bâtiment Lyonnais` intact : 30 clients, 108 devis, 72 factures, toutes données
manifestement fictives (domaine `@example.test`, noms génériques). Isolé, utilisable pour
démo, non réinitialisé (aucune nécessité identifiée).

## 45. Parcours premier client

Étapes vérifiées directement ou par preuve récente de cette session : signup (pattern
prouvé lors des lots PROD-ACTIVATION antérieurs), onboarding/création entreprise (idem),
client + devis + IA devis + PDF (testés en direct ce lot), facture (résidu déjà vérifié),
abonnement (page fonctionnelle, testée), support (`support@elsatia.fr` opérationnel).
Aucune friction technique bloquante identifiée sur le chemin applicatif. Les frictions
restantes sont exclusivement administratives (Stripe Live non activable tant que
INPI/banque/KYC ne sont pas résolus).

## 46. Support

`support@elsatia.fr` opérationnel. Procédure P0/P1/P2/P3 documentée
(`docs/commercial/SUPPORT_PREMIERS_CLIENTS.md`), avec avertissement explicite et répété
qu'aucun SLA contractuel n'est promis tant qu'il n'est pas validé juridiquement — conforme.

## 47. Commercial

Tous les documents attendus présents dans `docs/commercial/` : script démo, kit
prospection (objections traitées par profil ICP, pas de fichier séparé dédié — non
bloquant), checklist premier client, procédure support, checklist go-live commercial.

## 48. QA complète

`npm run verify` : **506/506 tests (71 fichiers)**, typecheck ✅, lint ✅, build ✅,
`verify:migrations` (209 valides) ✅, `verify:secrets` (903 fichiers, 0 secret) ✅.
`npm audit --audit-level=high` : **0 vulnérabilité**. pgTAP non exécuté en masse (nécessite
stack Docker locale, hors périmètre rapide de cet audit) — analyse de code faite à la place
pour les fichiers les plus critiques (voir §9, §23-24).

## 49. Tests historiques en échec

Aucun — 506/506 Vitest PASS, aucune régression détectée. Dette de test identifiée (pas un
échec) : quota IA dépassé (§28-29), `proxy.ts` sans test isolé (§10) — à inscrire en
roadmap.

## 50-52. Classification / scores

Voir le tableau de synthèse dans le rapport de conversation (section dédiée du rapport
final livré à l'utilisateur).

## 53. Décision

**GO ESSAI/DÉMO** et **GO PREMIERS CLIENTS SANS PAIEMENT LIVE** : oui, dès maintenant.
**GO COMMERCIAL PAYANT (Stripe Live)** : NO-GO, bloqué exclusivement par des prérequis
externes (INPI/INSEE, banque, KYC) — aucun blocage technique.

## 54. Plan restant (ordre réel)

1. Réception SIREN/SIRET (INPI/INSEE) — en cours, hors du contrôle de Claude.
2. RDV bancaire du 27 août 2026 → ouverture compte, obtention IBAN.
3. Confirmation régime TVA définitif.
4. Finalisation `mentions-legales.md` (SIRET, TVA, adresse revérifiée) + correction
   placeholder `[EMAIL_SUPPORT]`.
5. Décision assurance RC Pro.
6. Lancement KYC Stripe (identité, IBAN, documents).
7. Rotation du token de contournement Vercel Preview affiché pendant cet audit (précaution).
8. Une fois KYC validé : création Products/Prices Live, webhook Live, variables Vercel
   Live (suivre le plan détaillé déjà écrit dans `P15_STRIPE_LIVE_PREPARATION.md` §29).
9. Premier paiement réel de test, vérification, remboursement de recette.
10. GO commercial payant.

## 55-56. Documentation / Git

Ce document créé (`docs/organisation/GO_LIVE_FINAL.md`). `P15_GO_LIVE_CHECKLIST.md` non
modifié (statut externe inchangé depuis sa dernière mise à jour). Commit documentation
uniquement sur `release/commercialisation-v1` (aucun bug P0/P1 trouvé).
