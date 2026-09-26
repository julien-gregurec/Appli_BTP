# ROADMAP-CLEANUP-V1 — Dettes techniques non bloquantes

Date : 2026-08-24. Suite de PRE-LIVE-CLEANUP-V1. Branche `chore/roadmap-cleanup-v1`.

## Schema drift / triggers live (§4)

Découverte majeure, validée avec Julien avant toute action (deux triggers touchant devis/
abonnements, domaines explicitement hors périmètre de ce lot sauf accord explicite) :

- **`verrouiller_devis_accepte()` + `verrouiller_lignes_devis_accepte()`** : existaient sur
  Preview (utilisés depuis WORKFLOW-DEVIS-V1, voir sa propre migration de revert) mais
  **absents de Production** — un devis accepté pouvait y être modifié/supprimé sans
  protection base de données. **Corrigé** : migration
  `20260824000231_roadmap_cleanup_v1_reconciliation_drift_production.sql`, définitions
  identiques à Preview, appliquée à Production, testée en direct (transaction
  auto-annulée, zéro résidu) — bloque bien la modification.
- **`initialiser_essai_entreprise()`** : la colonne `abonnement_essai_debut` n'existait
  même pas sur Production, et rien n'y renseignait `abonnement_essai_fin` à la création.
  Conséquence vérifiée : les 2 entreprises en statut `essai` sur Production avaient
  `abonnement_essai_fin = NULL`, et `getContexteEntreprise()` ne coupe l'accès pour essai
  expiré que si cette date est renseignée ET dépassée — **un essai gratuit ne s'arrêtait
  donc jamais tout seul sur Production**. **Corrigé** dans la même migration (colonne +
  trigger), testé en direct. Décision volontaire : **pas de rétro-remplissage** des 2
  entreprises déjà en essai (dont l'entreprise réelle ELSATIA) — seules les entreprises
  créées à partir de maintenant sont couvertes.
- **`proteger_facturation_entreprise()`** (empêcherait un membre tenant de modifier
  directement les colonnes d'abonnement/facturation) : vu sur Preview mais **non porté**
  dans ce lot — dépend de `plateforme_a_permission()`, absente de Production (voir
  convergence `plateforme_admins` ci-dessous). Nécessiterait de porter aussi ce système de
  permission granulaire, hors du périmètre explicitement accordé. **Point de suivi
  distinct, non traité.**
- **`avenants`/`lignes_avenants`** (+ 3 triggers associés) : présents sur Preview,
  absents de Production. **Ce n'est pas une dérive accidentelle** — ce sont les artefacts
  de test d'une fonctionnalité complète (« AVENANTS-V1 », 4 commits `feat(avenants)`)
  développée sur une branche dédiée (`claude/avenants-v1-implementation`) **jamais
  mergée** dans `release/commercialisation-v1`. Aucune action : décision produit à prendre
  séparément (reprendre le merge, ou nettoyer ces objets orphelins de Preview si
  abandonnée).

## Plateforme_admin drift (§5)

Confirmé, comme anticipé par le cahier des charges : **Production et Preview ont deux
implémentations différentes**, toutes deux fonctionnelles pour ce qu'elles font
aujourd'hui :

| | Production | Preview |
|---|---|---|
| Colonnes `plateforme_admins` | `email, created_at, role, nom, ajoute_par` | + `utilisateur_id, actif` |
| `est_plateforme_admin()` | `auth.email() in (select email from plateforme_admins)` | `plateforme_role_courant() is not null` (via `utilisateur_id = auth.uid()`) |
| `plateforme_a_permission()` | **N'existe pas** | Existe (permissions granulaires par rôle) |

Le comportement live de Production est correct pour son usage actuel (email suffit pour
un contrôle binaire admin/non-admin). **Non réécrit** (conforme à la consigne). **Note de
convergence future** : si des permissions granulaires plateforme (`gerer_facturation` etc.,
utilisées par `proteger_facturation_entreprise` sur Preview) deviennent nécessaires en
Production, il faudra porter `utilisateur_id`/`actif`/`plateforme_a_permission()` — un lot
dédié, pas une correction ponctuelle.

## Résidus permanents (§6)

Confirmés, inchangés depuis PRE-LIVE-CLEANUP-V1 : `ARCHIVE IMMUABLE V1E` (aucun Auth actif)
et `RECETTE-RELANCES-PROD-V1` (données bloquées par `verrouiller_facture_emise()`, Auth déjà
nettoyé lors du lot précédent). Aucune modification dans ce lot.

## Branding Liria (§7)

**Confirmé propre**, aucune action nécessaire. Les seules occurrences trouvées sont : des
clés `localStorage` de migration historique (`liria-*` → `elsatia-*`, jamais affichées), un
test de régression (`brand.test.ts`) qui garantit justement l'absence de fuite, et un
commentaire documentant que d'anciennes étiquettes physiques « LGP » peuvent circuler.

## Stripe Test hygiene (§8)

| Objet | Utilisé par le code | Env var | Actif | Action future |
|---|---|---|---|---|
| ELSATIA Mini/Pro/Business/Entreprise (4 produits) | Oui (`tarification.ts`) | `STRIPE_PRICE_*` (Production+Preview) | Oui | — |
| Comptes sup Mini/Pro/Business/Entreprise (4 produits) | Oui | `STRIPE_PRICE_COMPTE_SUP_*` | Oui | — |
| Comptes sup Administratif/Chef d'équipe/Terrain (3 produits, Preview) | Oui (Preview uniquement) | `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_*` | Oui (Preview) | — |
| `myproduct` | Non | Aucune | Non | Candidat sûr à suppression future |

31 prices au total, 100% Test (`livemode:false` confirmé). Business profile Stripe Test
corrigé dans PRE-LIVE-CLEANUP-V1 (branding ELSATIA). Aucun objet supprimé dans ce lot.

## Env var hygiene (§9)

**Production** (39 variables) : toutes classées **ACTIVE**, y compris
`ELSATIA_SUPABASE_PROJECT_NAME`/`SUPABASE_PROJECT_REF` (usage restreint aux scripts de
tooling, pas l'app elle-même, mais réel — `garde-scripts-production.mjs`,
`seed-elsatia-preview-year.mjs`). Aucune variable `LEGACY INERTE` (confirmé : les clés
Supabase legacy ont déjà été retirées lors de la rotation de sécurité antérieure). Aucune
mention Liria.

**Preview** (39 variables) : globalement le miroir de Production + 3 spécificités
propres à Preview, toutes **ACTIVE** : les 3 offres comptes-sup Preview-only
(`ADMINISTRATIF/CHEF_EQUIPE/TERRAIN`), et `STRIPE_AUTOMATIC_TAX_ENABLED` (absente de
Production — cohérent avec le blocage TVA externe déjà documenté, pas un oubli : on ne peut
pas activer la taxe automatique Stripe avant que le régime fiscal réel soit confirmé).
Preview n'a ni `SENTRY_*` ni `BREVO_API_KEY`/`EMAIL_FROM_ADDRESS`/`SUPPORT_EMAIL` — déjà
documenté dans RELANCES_AUTO_V1.md comme limitation connue de Preview, pas un gap nouveau.

Aucune variable dupliquée, obsolète ou inconnue identifiée dans les deux environnements.

## Duplication documents chantier (§10)

Pas une duplication de données réelle (aucun objet Storage dupliqué) mais un chevauchement
d'usage assumé et déjà partiellement traité (les deux sources s'affichent sur la même page
`chantiers/[id]/documents`). **Recommandation : garder séparés** — `documents_chantier`
(GED chantier avec audience/permissions fines par rôle) et `pieces_jointes_messages`
(sous-produit de messagerie, permission binaire liée à la conversation) servent des
workflows réellement distincts dans le code actuel ; fusionner perdrait la granularité
`audience` sans bénéfice clair démontré.

## Pièces jointes restantes (§11)

Classification déjà faite par PIECES_JOINTES_V1.md, reprise telle quelle (non re-dérivée) :
1. Support (tickets) — P1, modèle de table prêt à étendre.
2. Commandes fournisseurs (bon de livraison scanné) — P2.
3. Clients — P3, pas d'amorce dans le modèle de données.
4. Factures (pièce jointe additionnelle) — P4, délicat (immutabilité).
5. Dette de tests pgTAP (voir ci-dessous) — traité dans ce lot.

## Tests pgTAP historiques (§12)

2 des 3 fichiers signalés par PIECES_JOINTES_V1.md identifiés et **corrigés** :
- `correctif_rls_isolation_factures.test.sql` : 7 assertions attendaient `%violates%`
  alors que `verrouiller_facture_emise()` (ajouté après coup) intercepte désormais ces
  mêmes tentatives en premier avec son propre message. Corrigé pour attendre le message
  réel — l'isolation cross-tenant reste bien vérifiée, seul le mécanisme qui la garantit a
  changé.
- `isolation_multitenant_surface.test.sql` : l'assertion « aucune fonction SECURITY
  DEFINER exécutable par anon » ne tenait pas compte de `document_commercial_par_token`,
  volontairement anon-exécutable pour les liens de partage public. Exclusion explicite
  ajoutée (documentée en commentaire, pas une simple relaxation de l'assertion).

3e fichier : **non identifié avec certitude** malgré une recherche exhaustive — aucun
candidat clair trouvé. Nécessiterait une exécution pgTAP complète (stack Docker locale,
indisponible dans ce lot) pour le repérer avec certitude plutôt que de deviner.

Une pgTAP supplémentaire ajoutée pour combler un gap réel (§13) :
`remises_clients_v1_protection_colonnes.test.sql`.

## Tests cross-tenant non dédiés (§13)

- **Remises** : GAP réel comblé. Nouveau test
  `remises_clients_v1_protection_colonnes.test.sql` (4 assertions) vérifiant que
  `proteger_colonnes_remise_entreprise()` réinitialise silencieusement les colonnes
  `remise_*` pour un membre non-admin-plateforme, et les accepte pour un admin plateforme.
  Le mécanisme sous-jacent a été vérifié réellement fonctionnel via une reproduction
  isolée directe (`est_plateforme_admin()` correctement `true`/`false` selon le contexte,
  colonne effectivement réinitialisée) — mais l'exécution du fichier de test complet via
  le harnais de diagnostic distant utilisé cette session (wrapping `db query -f` +
  tables temporaires) n'a pas pu être menée à un résultat net, pour des raisons qui
  semblent tenir au harnais lui-même (changement de rôle/contexte transactionnel dans un
  script exécuté hors psql) plutôt qu'au comportement réel du trigger, déjà validé
  séparément. **Recommandation : ré-exécuter ce fichier via `supabase test db` (stack
  Docker) dès que disponible pour confirmation définitive.**
- **Quotas IA / `journal_ia`** : PASS, déjà couvert (tests unitaires + isolation
  multi-tenant existante).
- **Autres outils IA** (rentabilité, messagerie, documents, comptes-rendus) : GAP mineur
  (pas de test direct sur les server actions elles-mêmes), risque faible car le filtrage
  par `entreprise_id` est systématique dans le code appelant et les tables sous-jacentes
  sont déjà couvertes par ailleurs — non traité (priorité faible).
- **Documents sensibles** (`factures-fournisseurs`, `pointage-preuves`) : GAP identifié
  (le pattern de test cross-tenant existe déjà pour `documents-employes`, pas dupliqué
  pour ces deux buckets) — non traité dans ce lot, candidat pour un futur lot de tests
  ciblé (peu coûteux : dupliquer le test existant).

## Performance légère (§14)

Aucun problème réel identifié lors des vérifications de cette session (300 dernières
entrées de logs Vercel : 0 erreur, 0 5xx, aucun signe de requête en boucle observé pendant
les nombreuses actions live effectuées sur Production ce lot et les deux précédents).

## Mobile (§15)

Dashboard/abonnement/notes-frais/paramètres-relances : déjà confirmés propres à 390px lors
de PRE-LIVE-CLEANUP-V1 (même release, non re-testés pour éviter une action inutile).
Plateforme admin (`/plateforme/tarification`, `/plateforme/facturation`) : vérifié par
revue de code (pas de session admin disponible pour un test live) — les tableaux larges
(`min-w-[900px]`, `min-w-[760px]`) sont correctement enveloppés dans `overflow-x-auto`,
pattern cohérent avec le reste du produit. Aucun problème trouvé.

## Accessibilité (§16)

Aucun nouvel écart trouvé au-delà de ceux déjà corrigés lors de PRE-LIVE-CLEANUP-V1
(aria-live sur le retour de statut des relances). Dette résiduelle documentée : audit
`aria-live` exhaustif sur tous les messages async du produit — ROADMAP, pas traité (hors
périmètre « pas de refonte »).

## Service worker / PWA (§17)

Architecture volontairement minimaliste et sûre : réseau d'abord pour la navigation
(fallback `/offline`), cache-first uniquement pour les assets statiques versionnés,
jamais de cache de page privée. Versioning manuel (`VERSION = "elsatia-v4"`) avec
`skipWaiting`/`clientsClaim` — fonctionnel mais nécessite un bump manuel à chaque
changement de logique du SW. Le seul incident « stale » tracé dans les docs a été
investigué et attribué à un artefact de test Local (Turbopack dev, pas un défaut du SW en
Production) — aucune action corrective nécessaire. Point de vigilance documenté (pas une
dette) : « installation réelle sur appareil » n'a jamais été testée en conditions réelles.

## Logs (§18)

Vercel (300 dernières entrées avant ce lot, 100 après) : 100% niveau info, 0 erreur, 0 5xx.
Un incident transitoire observé pendant ce lot (`Invalid Refresh Token`) était auto-infligé
(mon propre onglet navigateur tenait la session du compte de recette supprimé lors de
PRE-LIVE-CLEANUP-V1) — résolu en fermant l'onglet, confirmé disparu dans les logs suivants.
Sentry non vérifié en détail dans ce lot (config déjà confirmée saine lors de GO-LIVE-FINAL,
`sendDefaultPii:false`).

## Documentation active (§19)

2 documents vivants corrigés (affirmaient à tort que l'IA est désactivée en Production,
alors qu'elle est active depuis AI-PROD-ACTIVATION-V1) :
- `docs/commercial/SCRIPT_DEMO_ELSATIA.md` — IA reclassée « activée, peut être montrée en
  démo » plutôt que « désactivée, ne pas activer ».
- `docs/organisation/DEMO_COMMERCIALE.md` — même correction, plus un chemin de commande
  obsolète (`liria-codex`/`elsatia-production-bootstrap`, workspaces qui n'existent plus)
  corrigé vers le workspace réel `elsatia-main`.

`docs/organisation/REGISTRE_CENTRAL.md` : retard de consolidation identifié (les lots IA
n'y apparaissent pas dans le tableau « État des lots »), mais aucune affirmation activement
fausse trouvée — signalé comme point de vigilance, pas corrigé (aurait nécessité de
reconstituer tout l'historique récent, hors périmètre d'un correctif trivial).

## Roadmap consolidée (§20)

### Post-lancement court terme
- Pièces jointes support (tickets) — modèle de table déjà prêt à étendre.
- Test cross-tenant dédié pour `factures-fournisseurs`/`pointage-preuves` (peu coûteux).
- Identifier avec certitude le 3e fichier pgTAP historique (nécessite exécution Docker).
- Ré-exécuter `remises_clients_v1_protection_colonnes.test.sql` via stack Docker pour
  confirmation définitive.
- Décision avenants : reprendre le merge de `claude/avenants-v1-implementation`, ou
  nettoyer ses objets orphelins de Preview si abandonnée.

### Moyen terme
- Convergence `plateforme_admins` (porter `utilisateur_id`/`plateforme_a_permission()` à
  Production) si des permissions granulaires plateforme deviennent nécessaires.
- `proteger_facturation_entreprise()` sur Production (dépend du point précédent).
- Pièces jointes commandes fournisseurs (bon de livraison scanné).
- Tests dédiés pour les autres outils IA (rentabilité, messagerie, documents,
  comptes-rendus) au niveau server action.
- Audit `aria-live` exhaustif.
- Consolidation `REGISTRE_CENTRAL.md`.

### Long terme
- Pièces jointes clients / factures (nécessiterait une nouvelle table dédiée, jamais
  toucher `factures` directement).
- Convergence éventuelle documents chantier / pièces jointes messagerie (si un besoin
  business concret de "promouvoir" une pièce jointe de chat en document chantier émerge).
- GED, signature électronique qualifiée (hors périmètre actuel, non commencé).

(Les prérequis externes Stripe Live/INPI/banque/TVA/juridique ne figurent pas ici —
suivis dans `GO_LIVE_FINAL.md`/`P15_STRIPE_LIVE_PREPARATION.md`.)

## QA (§21)

`npm run verify` : **513/513 tests** (71 fichiers), typecheck/lint/build ✅,
`verify:migrations` (**210**, +1 vs PRE-LIVE-CLEANUP-V1) ✅, `verify:secrets` (906
fichiers, 0 secret) ✅. `npm audit --audit-level=high` : **0 vulnérabilité**. pgTAP non
exécuté en masse (stack Docker indisponible) — les 3 fichiers concernés par ce lot ont été
vérifiés individuellement dans la mesure du possible (voir §12-13).

## Production (§22)

Modifications Production dans ce lot : migration de réconciliation de dérive (trigger
verrou devis accepté + colonne/trigger initialisation essai), toutes deux accordées
explicitement par Julien avant application, testées en direct sans résidu. Code/docs
mergés et redéployés séparément (voir rapport final pour le détail Git/déploiement).
