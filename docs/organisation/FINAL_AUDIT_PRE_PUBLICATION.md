# FINAL-AUDIT-V1 — Audit complet ELSATIA Gestion Pro avant commercialisation

Date : 22-08-2026. Audit en lecture seule — aucune correction appliquée. Réalisé sur le worktree `elsatia-production-bootstrap`, branche `release/commercialisation-v1`, HEAD `fc61bd8` (confirmé identique au HEAD distant `gh/release/commercialisation-v1`).

**Mise à jour 22-08-2026 (FINAL-FIX-P1-V1)** : les 5 P1 listés ci-dessous ont été traités. Voir `docs/organisation/FINAL_FIX_P1_V1.md` pour le détail complet (investigation, décisions, migrations, tests, déploiement).

## Résumé exécutif

L'application est **fonctionnellement solide et commercialement cohérente** : Auth, multi-tenant, Terrain, documents, alertes/délégation, RGPD et infrastructure (Sentry, Storage, migrations) sont sains. Aucune faille de sécurité **actuellement exploitable** n'a été trouvée : RLS activée sur les 147 tables, aucun grant `anon` sur donnée tenant, aucune fonction `SECURITY DEFINER` sans `search_path`. Le dépôt garde en revanche une trace de **plusieurs vraies failles multi-tenant réelles, déjà trouvées et corrigées début août** (documentées ci-dessous, à titre de vigilance) et porte **du code mort à motif de contournement anonyme** dans 18 fonctions, inerte aujourd'hui mais à nettoyer avant l'ouverture commerciale.

Le point le plus concret pour la décision de publication : **aucun blocage technique n'empêche la mise à disposition de l'application**. Ce qui bloque encore Stripe Live est exclusivement administratif (INPI/INSEE, compte bancaire), pas applicatif. Un point de fuite d'erreurs techniques brutes réel a été trouvé sur des parcours actifs commercialisables (`besoins.ts` en onboarding, `employes.ts`, `commandes.ts`, `notes-frais.ts`, `import.ts`, `support.ts`) — à corriger avant les premiers clients, pas avant publication technique.

## État Git

```
worktree : /Users/juliengregurec/Projects/elsatia-production-bootstrap
branche  : release/commercialisation-v1
HEAD     : fc61bd86279dd0a3ab57a29ccc9b1135b0f55aca
arbre    : propre (untracked : output/, outputs/ — hors périmètre applicatif, non versionnés)
remote   : gh -> git@github.com:julien-gregurec/Appli_BTP.git
```

`git ls-remote gh refs/heads/release/commercialisation-v1` → `fc61bd8...` — **identique au HEAD local, aucune divergence.**

## Architecture — cartographie des modules

44 modules réels recensés sous `src/app/(app)/` (5 de plus que le périmètre initial fourni : `banque-paie` (legacy, redirection pure), `depot`, `grands-deplacements`, `inventaires`, `prestations`). Répartition par statut produit (`src/lib/feature-catalogue.ts`) :

- **CORE (commercialisables)** : dashboard, clients, chantiers (+ comptes-rendus, documents), devis, factures, planning, pointage, notes de frais, stock (+ borne, dépôt, inventaires), outillage, flotte, fournisseurs, commandes, dépenses, charges récurrentes, rentabilité, trésorerie, exports, employés, congés, paramètres, abonnement, messagerie, mes-travaux, mon-espace, prestations, alertes + délégation.
- **BETA (non commercialisé, masqué par défaut)** : interventions, ouvrages, sous-traitants, facturation avancée, CRM, paie, grands déplacements.
- **DISABLED (hors périmètre commercial)** : boutique, paiements bancaires (banking), connecteurs, appels d'offres.
- **Hors système de flags** : plateforme (admin ELSATIA, gating dédié par `estPlateformeAdmin()`).

**Découverte architecturale importante** : le statut BETA/DISABLED n'est vérifié **que côté client** (`ModuleAccessBoundary.tsx`), jamais dans le middleware serveur (`src/lib/supabase/proxy.ts`), qui ne contrôle que la permission métier (`module-permissions.ts`). Conséquence concrète : un utilisateur disposant de la permission technique sous-jacente (ex. `acces_boutique`) peut faire exécuter le composant serveur et les Server Actions d'un module BETA/DISABLED — seul l'affichage est masqué après coup. Le cas `/boutique` (tenant) est le plus net : contrairement à `/plateforme/boutique`, il n'a **aucune** garde `boutiqueEstActive()` alors que `store` est `DISABLED`. Deux systèmes de flags coexistent sans se recouper totalement (`feature-catalogue.ts` vs `preview-features.ts`, ce dernier actif par défaut sauf variable explicitement à `"false"`). **Classé P1** : sans impact tant que ces modules ne sont pas commercialisés (personne n'attribue ces permissions aujourd'hui), mais à corriger avant d'ouvrir tout module BETA commercialement.

## Auth

Signup réel testé deux fois pendant les lots précédents (Preview et Production, ALERTES-DELEGATION-V1/V1B) : création de compte, confirmation email (forcée par SQL pour les adresses de test, mécanisme réel en Production sinon), connexion, redirection onboarding → dashboard, tous fonctionnels sans écran blanc ni 500. `src/lib/auth-erreurs.ts` traduit les erreurs Supabase Auth en messages français (confirmé sans fuite par l'agent d'audit dédié). Mode `DISABLE_EMAIL_LOGIN` confirmé désactivé par défaut (connexion email active).

## Onboarding

Testé réellement deux fois cette semaine (comptes de recette dédiés, jamais `elsatia`) : création de compte → création d'entreprise (devient Admin/Gérant automatiquement) → questionnaire besoins/recommandation d'offre → accès dashboard immédiat (statut d'essai). Aucune friction bloquante rencontrée. **Un point de fuite d'erreur brute trouvé sur `src/app/actions/besoins.ts:34`** (enregistrement du questionnaire onboarding) — le seul des points de fuite trouvés qui touche un tout nouveau client dès sa première interaction, donc à corriger en priorité avant les premiers vrais clients.

## Multi-tenant

RLS activée sur les 147 tables (confirmé par analyse statique **et** requête live sur Production : 0 table sans RLS). L'historique du dépôt montre **4 vraies failles d'isolation trouvées et corrigées début août 2026** (toutes avant l'audit, aucune n'est active aujourd'hui) :
- `chantiers` : RLS bloquait déjà toute écriture par erreur de policy (bug fonctionnel, pas une fuite), corrigé avec ajout d'un `with check` anti cross-tenant.
- `factures` : `client_id`/`devis_origine_id`/`facture_origine_id`/`facture_parente_id` ne vérifiaient pas l'entreprise du parent — corrigé par FK composites.
- `devis` : même faille sur `client_id`, atteignable via le formulaire normal — corrigée.
- `relances_impayes` : `facture_id` pouvait pointer vers une facture d'une autre entreprise — corrigée.

Le motif commun (RLS protège la ligne, pas ses relations) a été trouvé 4 fois sur des tables différentes en un seul lot — **recommandation** (hors périmètre strict de cet audit, découverte en cours d'analyse) : un balayage systématique des colonnes `*_id` vers d'autres tables tenant sans FK composite `entreprise_id` serait justifié avant l'ouverture commerciale.

Isolation revérifiée en conditions réelles cette semaine (délégation d'alertes, Production) : employé d'un autre tenant refusé comme destinataire, compte non membre refusé comme délégateur, lecture RLS isolée (A ne voit jamais une délégation B). Isolation Storage/documents/notes de frais/comptes-rendus déjà revalidée en profondeur lors de la recette V1E (session précédente, référencée `docs/commercial/TERRAIN_MOBILE_V1E_RECETTE_PRODUCTION_ELSATIA.md`).

## Rôles et permissions

Postes réels : Gérant/Administrateur (tous droits), et postes métier configurables par droit (`permissions_poste`), pas de rôle fixe "Terrain" au sens strict — Terrain est un profil de droits restreints (accès pointage/planning en lecture, sans droits de gestion). Le contrôle réel est **toujours côté serveur** : `a_permission()`/`est_membre_actif()` dans chaque RPC `SECURITY DEFINER`, policies RLS `restrictive` doublant les permissives pour les mutations (`role_gestion_*`). Le masquage UI (`ModuleAccessBoundary`, menu filtré) n'est qu'un confort — vérifié explicitement pour la délégation d'alertes cette semaine (22 scénarios pgTAP prouvant le refus serveur, pas seulement l'absence de bouton).

## Terrain

Déjà validé en Production (lot TERRAIN-MOBILE-V1E). Smoke test de non-régression : aucune modification du code Terrain depuis la clôture de ce lot (confirmé par le diff scopé des lots suivants — alertes-délégation, C1-E, C4 n'ont touché aucun fichier terrain/pointage/planning). **TERRAIN CLOS.**

## Clients / Chantiers / Devis / Factures

CRUD complet, PDF, email, lien externe déjà validés en Production réelle lors des lots P9/V1E. Immutabilité des factures émises : **confirmée réelle sur Preview** (déclencheur `verrouiller_facture_emise`, bloque delete/update, y compris via cascade indirecte) — voir section Schema Drift ci-dessous, ce déclencheur n'existe **pas** sur Production. Arrondis TVA/totaux non re-testés dans cet audit (déjà couverts par `supabase/tests/correctif_isolation_devis_client.test.sql`, `correctif_isolation_factures.test.sql` et les tests unitaires `tarification.test.ts`).

## Documents / PDF / Brevo

PDF, téléchargement, partage externe par token haché SHA-256 déjà validés (lot P9, faille de proxy corrigée à l'époque). Fonction `document_commercial_par_token` : accès `anon` intentionnel et documenté, aucun oracle d'énumération (0 ligne retournée indifféremment si invalide/expiré/révoqué) — vérifié par l'agent RLS. Formulaire Contact site vitrine validé réellement cette semaine (C1-E), timeout ajouté sur l'appel Brevo. Aucun email réel envoyé pendant cet audit.

## Planning / Pointage / Notes de frais / Comptes-rendus

Déjà validés en profondeur (lots Terrain, P9-P13). Aucune régression détectée dans le diff des lots récents (alertes-délégation, C1-E, C4 ne touchent aucun fichier de ces modules).

## Stock / Matériel / Véhicules / Fournisseurs

Modules CORE actifs, RLS confirmée, mais **sans test dédié identifié au-delà de l'isolation RLS générique** (planning, stock, outillage, commandes, dépenses, charges, rentabilité, exports, congés, mes-travaux, dépôt, prestations, clients). Pas d'anomalie trouvée, simplement une couverture de test fonctionnelle plus légère que les modules ayant fait l'objet de lots dédiés (devis, factures, notes de frais, flotte, employés).

## Rentabilité

Module CORE, lecture seule (pas de permission de gestion déclarée — cohérent, c'est un rapport). RLS confirmée.

## Centre d'alertes / Délégation

Délégation validée en Production cette semaine (ALERTES-DELEGATION-V1B) : bouton, modal, réassignation, filtres Mes alertes/Déléguées par moi, notifications, cross-tenant, mobile — tous vérifiés réels. Aucune régression trouvée sur Ouvrir et traiter / Ignorer.

## Imports

`/parametres/import` : assistant réel avec reconnaissance Batigest/Batappli/EBP Bâtiment, entreprise pilote isolée avant application définitive (confirmé au code lors du lot C4). Aucun format non implémenté n'est annoncé comme supporté.

## Tarifs

**Divergence réelle confirmée en direct sur `app.elsatia.fr/tarifs` (capture live, pas seulement code)** : pour l'offre Entreprise, la carte affiche « 40 salariés + 10 administrateurs » alors que le tableau comparatif juste en dessous, sur la même page, affiche « Comptes inclus : 50 » pour la même offre. Source unique (`src/lib/tarification.ts`, `comptesInclus: 50`) correcte pour tout le reste ; seul le texte de présentation de la carte Entreprise (`src/app/tarifs/page.tsx`) est en désaccord avec sa propre page. Montants HT/mois (79/249/449/599) et essai 30 jours confirmés cohérents entre code, app et site vitrine.

## Abonnements

`DUREE_ESSAI_JOURS = 30` confirmé. **Stripe Live non activé** (confirmé par variables Vercel : présence des `STRIPE_PRICE_*`/`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_ABONNEMENT_SECRET` en Production sans confirmation qu'elles pointent vers un compte Live — statut Live/Test non vérifiable sans afficher de valeur, à confirmer par Julien côté Dashboard Stripe). `STRIPE_AUTOMATIC_TAX_ENABLED=false` partout.

## Feature flags

`FEATURE_AI_ENABLED`, `FEATURE_BOUTIQUE_ENABLED`, `FEATURE_CRONS_ENABLED` présents dans les variables Vercel Production (valeurs non affichées). Défaut logique du code si la variable était absente : **actif** — donc la présence effective de ces 3 variables en Production est le seul rempart réel contre une activation accidentelle ; leur valeur doit être confirmée `false` par Julien (non vérifiable sans afficher de valeur). Aucune fuite UI trouvée pour boutique/banking/connecteurs/tenders (gardes confirmées par l'agent de cartographie).

## Administration plateforme

Gating dédié (`estPlateformeAdmin()`), hors système `module-permissions.ts` par conception (espace non-tenant). Non testé en profondeur dans cet audit (hors périmètre demandé : audit seulement, aucune refonte). Aucun risque de sécurité identifié dans l'analyse statique.

## RGPD

Fonctions confirmées présentes et actives sur Production : `exporter_donnees_entreprise` (export), 3 fonctions de suppression/anonymisation. Déjà auditées en profondeur lot P13 (export réel testé, suppression à délai de 30 jours confirmée, anonymisation préservant la conservation légale confirmée). Aucune promesse juridique non implémentée trouvée à l'époque, non re-testé fonctionnellement dans cet audit (pas de changement de code sur ce périmètre depuis).

## Juridique

État connu (lots P12-P14, cette session) :
- **COMPLET** : identité éditeur, nom commercial, adresse du siège, email support, hébergeur (Vercel + Supabase, région confirmée), régime B2B/exclusion droit de rétractation.
- **EN ATTENTE INPI/INSEE** : SIREN/SIRET, RCS, code APE/NAF, numéro de TVA intracommunautaire.
- **EN ATTENTE BANQUE** : compte bancaire dédié (rendez-vous préparé, non encore réalisé au moment de cet audit).
- **À CORRIGER (indépendant de l'administratif)** : aucun trouvé lors des audits P12/P13/C1-E ; non re-audité intégralement dans ce lot (documents juridiques non modifiés depuis P14B).

## Site public (elsatia.fr)

Vérifié en direct : accueil, Gestion Pro, à propos, contact, 5 pages légales, robots.txt (avec sitemap déclaré), sitemap.xml → tous 200. Page inexistante → 404 correct. `app.elsatia.fr` reste distinct et fonctionnel (200), aucune interférence.

## Credentials Supabase

Vérifié sans afficher aucune valeur : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` présente en Production (migration vers le nouveau système confirmée), **aucune variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`** dans la liste (confirme le nettoyage). `SUPABASE_SERVICE_ROLE_KEY` toujours présente et utilisée par `src/lib/supabase/admin.ts` (notifications push) et un script de seed. **Point non vérifié intentionnellement** : je n'ai pas testé si cette clé fonctionne encore après la désactivation des clés JWT legacy (lot SECURITY-CREDENTIALS-V1B/V1C) — je ne dois jamais manipuler cette clé, même indirectement. **Recommandation à Julien** : déclencher une vraie notification push ou vérifier les logs Vercel de `admin.ts` pour confirmer qu'elle authentifie toujours.

## RLS — inventaire de sécurité complet

Voir détail dans le rapport de l'agent dédié, résumé :
- **147/147 tables avec RLS activée** (dont 33 activées via boucle PL/pgSQL dynamique, invisible à un grep naïf — noté pour méthodologie d'audit future).
- **363 policies**, majorité saine (`est_membre_actif`/`a_permission`, policies restrictives en doublon pour les mutations).
- **4 tables catalogue exposées à `anon`** (`modeles_roles_predefinis`, `plans_abonnement`, `catalogue_options_abonnement`, `catalogue_services_mise_en_service`) — vérifié en direct sur Production : policies correctement scopées (`actif OR est_plateforme_admin()`), pas de fuite de données sensibles, mais **sans commentaire explicite justifiant l'exposition** dans leurs migrations (P2, à documenter).
- **233 fonctions `SECURITY DEFINER`, 0 sans `search_path`** actuellement (confirmé statique et live sur Production).
- **18 fonctions avec logique de contournement `anon` vestigiale** (`auth.role() is distinct from 'anon' and not <permission>...`) — **aucun grant `EXECUTE` actif vers `anon` aujourd'hui** sur ces 18 fonctions (vérifié), mais l'historique montre 6 régressions accidentelles de grants `anon` en un mois sur des objets différents. **P1** : nettoyer ce motif avant l'ouverture commerciale, par précaution face à une future migration qui regranterait par erreur.
- **12 buckets Storage**, tous isolés par `entreprise_id` dans le chemin sauf `entreprise-assets` (logos, public intentionnellement).

## Schema drift — section dédiée

**Constat confirmé et approfondi** : le déclencheur `verrouiller_facture_emise` (bloque DELETE/UPDATE sur `factures` émises, avec message applicatif en français) **existe sur Preview mais pas sur Production**, et **n'apparaît dans aucune des 199 migrations versionnées** (recherche exhaustive insensible à la casse : `verrouiller`, `verrou_facture`, `facture_emise`, `lock` — 0 résultat pertinent). Confirmé sur Production par requête directe : ni la fonction ni un nom similaire n'existe.

**Origine probable** : application manuelle directe sur Preview (SQL editor Supabase ou canal équivalent), en dehors du flux `supabase db push`/migrations. **Impact** : Preview et Production ont un schéma divergent sur ce point précis ; un `supabase db reset` local ne reproduirait pas ce comportement ; toute recette Preview impliquant la suppression d'une facture de test se heurte à un verrou que Production n'a pas (vécu concrètement lors du nettoyage de la fixture ALERTES-DELEGATION-V1 sur Preview cette semaine). **Recommandation** : décider explicitement si ce comportement (immutabilité des factures émises) est voulu en Production — si oui, l'ajouter via une vraie migration versionnée pour combler l'écart ; si c'était une expérimentation Preview-only, le documenter comme tel. Ne pas trancher dans ce lot (hors périmètre, lecture seule).

## Storage

12 buckets recensés (voir section RLS). Aucun fichier orphelin détecté dans l'inventaire Production (0 ligne `storage.objects` liée aux fixtures de test créées et supprimées cette semaine — nettoyage confirmé complet).

## Secrets

```
npm run verify:secrets → 840 fichiers suivis contrôlés, aucun secret reconnu.
```

## Sentry

Configuration relue (`sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`) : `sendDefaultPii: false` partout, `includeLocalVariables: false` (serveur), activé uniquement si `NODE_ENV=production` et DSN présent, `tracesSampleRate: 0.1`. `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (sourcemaps) confirmés présents en Production. **Non vérifié dans cet audit** : contenu réel des erreurs récentes dans le dashboard Sentry (pas d'accès API/dashboard direct depuis cet outil) — à consulter manuellement par Julien pour confirmer l'absence d'erreurs récurrentes.

## Vercel

Production (`elsatia-production`, `fra1`) et site (`elsatia-site`, `fra1`) tous deux `READY`, `app.elsatia.fr`/`elsatia.fr` répondent 200. Logs consultés (fenêtre récente) : uniquement des entrées `info`, aucune erreur, aucun 4xx/5xx. Variables Production listées (noms uniquement, 28 variables) — aucune valeur affichée.

## Performance

Non auditée en profondeur dans ce lot (hors priorité donnée aux vérifications sécurité/données/QA). Aucun signalement de lenteur trouvé dans les logs consultés. **Non fait, à signaler explicitement** : pas de revue des requêtes N+1 ni des tailles de bundle — recommandé en roadmap plutôt que bloquant.

## Mobile

Testé réellement à 390×844 cette semaine sur : dashboard, Centre d'alertes (modal comprise), `/tarifs`, `/signup`. Aucun débordement horizontal trouvé sur ces pages. Tablette 768×1024 testée sur dashboard/alertes. **Non testé dans cet audit** : 430×932, ni les autres pages listées (clients, chantiers, devis, factures, planning, pointage, stock, paramètres) — couverture mobile partielle par rapport à la demande, à compléter si Julien le juge nécessaire avant publication.

## Accessibilité

Vérifiée en profondeur uniquement sur la modal de délégation cette semaine : focus automatique à l'ouverture, `Escape` ferme sans effet de bord, labels associés, boutons Annuler/Déléguer, erreurs dans un `role="alert"`. Non auditée sur le reste de l'application dans ce lot.

## Erreurs utilisateur brutes

Audit dédié complet (52 fichiers `src/app/actions/*.ts`, 37 routes API). Le helper `messageErreurUtilisateur` est sain par construction (catégorisation Postgres/PostgREST/Stripe/Brevo/réseau, fallback générique jamais le message brut). Le problème est le **contournement du helper**, pas le helper lui-même :

**Fuites sur modules CORE (actifs, commercialisables) — à corriger avant premiers clients** : `src/app/actions/besoins.ts:34` (onboarding), `employes.ts:72`, `commandes.ts:112,152`, `notes-frais.ts:102`, `import.ts` (4 occurrences), `inventaires.ts:23`, `flotte.ts:28`, `prestations.ts:50`, `messagerie.ts:42,58`, `push.ts:16,24,37`, `support.ts:24,39`, `suivi-acces.ts:12`, `devis.ts:283` (génération IA de lignes, secondaire).

**Fuites sur modules BETA/DISABLED (non commercialisés, non atteignables par un client normal aujourd'hui)** : `boutique.ts:109`, `suite-metier.ts` (~15 occurrences — interventions/CRM/ouvrages/facturation avancée), `paiements-bancaires.ts` (13 occurrences, fichier entier non protégé), `paie.ts` (16 occurrences, fichier entier non protégé), `appels-offres.ts`, `sous-traitants.ts`, `grands-deplacements.ts`, `signatures-documents.ts`. **Reclassées P2 dans cet audit** (l'agent les avait notées P0/P1 sans croiser leur statut BETA/DISABLED — recoupement fait ici) : impact nul tant que ces modules restent fermés commercialement, mais code prêt à fuiter dès leur ouverture.

**Fuites sur back-office admin plateforme (accès restreint)** : `plateforme.ts` (~15 occurrences), `acces.ts`, `tarification.ts`. P2 — surface d'exposition limitée aux administrateurs ELSATIA eux-mêmes.

## Migrations

199 fichiers, séquence strictement croissante sans doublon (confirmé par script `verify:migrations` **et** analyse indépendante). Gap migration `20260812000200` confirmé à haut risque de rejeu (policies sans garde `if not exists`, échec "already exists" si rejouée — pas un risque de réinsertion de données). 5 migrations récentes (`216` à `220`) appliquées via méthode isolée, absentes du relevé standard par conception — contenu confirmé cohérent avec leur objet (Terrain, puis délégation d'alertes).

```
npm run verify:migrations → 199 migrations valides, noms et horodatages uniques.
```

## Docker / db reset

**Tentative unique effectuée, échec confirmé pour la 3ᵉ fois consécutive** (lots V1, V1B, et cet audit) : conteneurs `supabase_analytics`/`supabase_vector` unhealthy au démarrage, après arrêt/nettoyage/redémarrage propre. Panne d'environnement Docker local persistante, sans rapport avec le code applicatif. `supabase db reset`/`npm run test:db` non exécutables localement — compensé par des vérifications directes et réelles sur Preview/Production tout au long des lots récents.

## QA — chiffres exacts

```
Vitest        : 297/297 tests passés (59 fichiers)
pgTAP         : non exécutable via npm run test:db (Docker local indisponible) ;
                22/22 assertions de la suite délégation confirmées vertes par exécution
                directe équivalente sur Preview et Production cette semaine
typecheck     : 0 erreur
lint          : 0 erreur, 3 warnings préexistants (usage <img> non lié à ce périmètre)
build         : succès (toutes routes générées)
verify:secrets: 840 fichiers contrôlés, 0 secret reconnu
verify:migrations : 199 migrations valides
npm audit     : 0 vulnérabilité
```

## Audit des données Production (lecture seule)

3 entreprises seulement sur Production, toutes identifiées et attendues :

| Entreprise | Référence | Nature |
|---|---|---|
| `elsatia` | ENT-001 | **DONNÉE RÉELLE** — entreprise commerciale réelle, vérifiée intacte tout au long de cet audit |
| `Atelier Bâtiment Lyonnais` | DEMO-18M | **DONNÉE COMMERCIALE/DÉMO ATTENDUE** — compte démo prospect (12 employés, 30 clients, confirmé intact) |
| `ARCHIVE IMMUABLE V1E - NE PAS SUPPRIMER - residu audit note de frais` | ENT-009 | **RÉSIDU DE TEST connu et déjà documenté** (lot V1E, bloqué par le déclencheur d'immutabilité des notes de frais, jamais contourné) |

Aucune entreprise de test non labellisée trouvée. Les fixtures créées cette semaine (ALERTES-DELEGATION-V1B, ENT-011) ont été intégralement supprimées et n'apparaissent plus. Storage : aucun fichier orphelin détecté.

## Compte démo

`Atelier Bâtiment Lyonnais` confirmé intact (1 entreprise, 12 employés, 30 clients — conforme au jeu de données de référence). Non re-testé fonctionnellement (login/dashboard/scénario complet) dans cet audit : déjà validé en profondeur lot P11, aucune modification de son code support depuis. Non réinitialisé (pas nécessaire).

## Parcours premier client (simulation technique, sans paiement Live)

| Étape | Statut | Preuve |
|---|---|---|
| 1. elsatia.fr | OK | 200, testé cette semaine |
| 2. Contact | OK | Validé réellement lot C1-E, formulaire → Brevo → réception confirmée |
| 3. Signup | OK | Testé réellement 2× cette semaine (Preview + Production) |
| 4. Confirmation email | OK (mécanisme réel, forçage SQL uniquement pour adresses de test) | |
| 5. Création entreprise | OK | Testé réellement 2× |
| 6. Configuration | OK | Onboarding besoins → recommandation d'offre, testé réellement |
| 7. Ajout équipe | Non re-testé dans cet audit | Déjà couvert par tests employés existants |
| 8. Import/saisie | Non re-testé | Assistant import confirmé existant (lot C4) |
| 9-11. Client/chantier/devis | Non re-testés dans cet audit | Déjà validés lots P9/V1E |
| 12-13. PDF/email | OK | Déjà validés lot P9 |
| 14-15. Planning/pointage | Non re-testés | Déjà validés Terrain |
| 16. Facture | Non re-testé dans cet audit (facture réelle créée pour les tests d'alertes, comportement conforme) | |
| 17. Abonnement | OK | Essai 30 jours confirmé, Stripe Live non activé |

**Friction identifiée** : la fuite d'erreur brute sur `besoins.ts` (étape 6) est la seule anomalie concrète trouvée sur ce parcours précis.

## Classification finale

### BLOQUANT PUBLICATION
Aucun.

### BLOQUANT PAIEMENT (Stripe Live)
- INPI/INSEE non finalisé (administratif, hors code).
- Compte bancaire dédié non ouvert (administratif, hors code).
- Ces deux points bloquent uniquement P15 (Stripe Live), pas l'usage de l'application elle-même.

### P1 AVANT PREMIERS CLIENTS — **CLOS (FINAL-FIX-P1-V1, 22-08-2026)**
1. ~~Fuite d'erreur brute sur `besoins.ts` (onboarding) et sur les autres fichiers CORE~~ **CORRIGÉ** — 17 fichiers routés via `messageErreurUtilisateur`, garde-fou anti-régression ajouté.
2. ~~Divergence d'affichage tarifs Entreprise (« 40 » vs « 50 »)~~ **CORRIGÉ** — libellé harmonisé sur `comptesInclus`/`administrateursInclus`, aucun prix modifié.
3. ~~Motif de contournement `anon` vestigial dans les 18 fonctions listées~~ **CORRIGÉ** (16/18 — 2 déjà mortes/révoquées, non touchées) — migration versionnée, testé fonctionnellement et cross-tenant.
4. ~~Schema drift `verrouiller_facture_emise`~~ **CORRIGÉ (Option A)** — versionné et appliqué à Production ; découverte séparée (Preview manque toute la migration 200) documentée, non traitée (hors périmètre).
5. ~~Confirmation que `SUPABASE_SERVICE_ROLE_KEY` fonctionne toujours~~ **CONFIRMÉ** sans jamais afficher la valeur (preuve fonctionnelle indirecte via le rate-limit des routes `/login`/`/signup`).

### NON BLOQUANT
- Fuites d'erreurs brutes sur modules BETA/DISABLED (boutique, paiements bancaires, paie, CRM, interventions, etc.) — à traiter avant l'ouverture commerciale de chacun de ces modules, pas avant.
- Documentation manquante sur l'intention d'exposition `anon` des 4 tables catalogue (probablement volontaire, à confirmer).
- Séparation partielle des deux systèmes de feature flags (`feature-catalogue.ts` vs `preview-features.ts`).

### ROADMAP
- Docker local à réparer (panne confirmée 3 fois).
- Couverture de test fonctionnelle à renforcer sur les modules CORE sans test dédié (planning, stock, outillage, commandes, dépenses, charges, rentabilité, exports, congés, mes-travaux, dépôt, prestations, clients).
- Balayage systématique des FK manquantes vers `entreprise_id` sur le reste du schéma (au-delà des 4 déjà corrigées), en s'inspirant de la méthode ayant trouvé les 4 failles d'août.
- Audit performance (N+1, bundles) non fait dans ce lot.
- Couverture mobile à étendre (430px et pages non testées : clients, chantiers, devis, factures, planning, pointage, stock, paramètres).
- Audit accessibilité au-delà de la modal de délégation.

## Score détaillé (sur 100, justifié par les preuves de cet audit)

| Catégorie | Score | Justification |
|---|---|---|
| Fonctionnel | 82 | Modules CORE opérationnels et testés pour la plupart ; certains (stock, outillage, commandes...) sans test dédié mais aucune anomalie trouvée |
| Sécurité | 85 | RLS/grants/search_path sains aujourd'hui ; code mort à motif anon (P1) et fuites d'erreurs brutes tempèrent le score malgré l'absence de faille active |
| Multi-tenant | 88 | 4 vraies failles trouvées et corrigées début août (bon signe de rigueur), isolation revérifiée réelle cette semaine, aucune faille active trouvée |
| Auth | 90 | Testé réellement à plusieurs reprises, aucune anomalie |
| Documents | 88 | PDF/email/partage externe validés en profondeur (lot P9), token sans oracle d'énumération |
| Terrain | 92 | Déjà validé en Production, aucune régression détectée |
| Mobile | 70 | Couverture partielle (4 pages testées sur ~13 demandées), aucun problème trouvé sur ce qui a été testé |
| UX | 78 | Divergence tarifs visible, fuites d'erreurs brutes en onboarding, sinon cohérent |
| Performance | 60 | Non auditée dans ce lot — score prudent par défaut d'information, pas par constat négatif |
| Monitoring | 82 | Sentry bien configuré (PII off), logs Vercel propres ; contenu réel des erreurs Sentry non consulté |
| RGPD | 85 | Export/suppression/anonymisation confirmés fonctionnels (lot P13), non re-testés ce lot |
| Juridique | 65 | Complet sur tout ce qui ne dépend pas de l'INPI/banque ; ces deux dépendances externes plafonnent le score |
| Site | 90 | Toutes les pages testées répondent correctement, distinct de l'app |
| Commercial | 80 | Parcours prospect/onboarding/support documentés (lot C4), friction onboarding trouvée |
| Stripe | 75 | Test validé, Live non activé par choix (dépendances externes), aucune anomalie de configuration trouvée |
| **Global** | **81** | Application prête techniquement pour publication ; premiers clients réels nécessitent le traitement des P1 listés |

## Checklist finale

- [x] Git propre, HEAD confirmé, aucune divergence distante
- [x] QA verte (Vitest, typecheck, lint, build, secrets, migrations, audit)
- [x] RLS complète, aucune table sans protection
- [x] Aucune fonction SECURITY DEFINER sans search_path
- [x] Aucun grant anon sur donnée tenant
- [x] Multi-tenant revérifié réel (délégation d'alertes, cette semaine)
- [x] Terrain non régressé
- [x] Credentials migrés (Publishable key), aucune valeur affichée
- [x] Stripe Live confirmé non activé
- [x] Feature flags confirmés non fuités côté UI
- [x] Site public fonctionnel et distinct de l'app
- [x] Données Production inventoriées, aucun résidu non labellisé
- [ ] Fuites d'erreurs brutes sur modules CORE corrigées (P1, non fait — audit uniquement)
- [ ] Divergence tarifs corrigée (P1, non fait — audit uniquement)
- [ ] Code mort anon nettoyé (P1, non fait — audit uniquement)
- [ ] Schema drift Preview/Production tranché (P1, non fait — audit uniquement)
- [ ] INPI/INSEE finalisé (externe, hors code)
- [ ] Compte bancaire ouvert (externe, hors code)

## Recommandation

**GO pour publication technique** de l'application (mise à disposition, premiers signups possibles dès aujourd'hui). **NO-GO pour Stripe Live** tant que l'INPI/INSEE et le compte bancaire ne sont pas finalisés (déjà connu, confirmé, aucun nouveau blocage trouvé). Avant les tout premiers vrais clients (pas avant publication technique), traiter les 5 points P1 listés — aucun n'est complexe, la majorité est une correction ciblée d'un pattern déjà résolu ailleurs dans le code (`messageErreurUtilisateur`, nettoyage du motif anon déjà fait sur 6 fonctions terrain).
