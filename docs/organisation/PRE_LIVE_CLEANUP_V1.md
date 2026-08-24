# PRE-LIVE-CLEANUP-V1 — Dernier nettoyage technique/documentaire avant Stripe Live

Date : 2026-08-24. Suite de GO-LIVE-FINAL (aucun P0/P1 technique). Lot de nettoyage
uniquement — aucune nouvelle fonctionnalité, aucune donnée métier réelle touchée.
Branche `chore/pre-live-cleanup-v1` (depuis `release/commercialisation-v1`, HEAD `b35fc47`).

## 1. Secrets/tokens

**Token Vercel Protection Bypass (Preview)** : considéré compromis (affiché en clair à deux
reprises dans des sorties d'outils — une fois lors de l'audit P15 initial, une fois pendant
GO-LIVE-FINAL via `stripe webhook_endpoints list`). Tentative de rotation via
`vercel project protection enable --protection-bypass` : **abandonnée délibérément**. Ce
mécanisme, contrairement aux variables d'environnement (`Sensitive`, jamais relisibles),
n'a pas de mode « caché » — Vercel affiche la nouvelle valeur en clair au moment de la
générer, pour permettre de la copier. Aucune commande CLI n'a permis de confirmer une
sortie garantie sans secret ; le fichier de sortie brute a été supprimé sans être lu. Il
s'agit exactement du cas anticipé par le cahier des charges (« Si la rotation nécessite une
action manuelle utilisateur : ARRÊT sur ce sous-point »). **Action manuelle transmise à
Julien** : régénérer le secret depuis le Dashboard Vercel (projet `elsatia-preview` →
Settings → Deployment Protection → Protection Bypass for Automation), puis mettre à jour
l'URL du webhook Stripe Preview (`we_1Tziay0bT5C0WG2a4Ib2ncwB`) avec la nouvelle valeur —
les deux actions doivent être faites par Julien lui-même, aucune valeur ne doit transiter
par le chat. Recherche confirmée : **aucune référence à ce token n'existe dans le dépôt**
(code, scripts, docs autres que la mention déjà rédigée dans `P15_STRIPE_LIVE_PREPARATION.md`,
volontairement redactée avec `...`) — la rotation est donc self-contained côté Vercel +
Stripe, aucun changement de code nécessaire.

## 2. Juridique — email support

`[EMAIL_SUPPORT]` **n'est pas un bug** : c'est un jeton de template résolu dynamiquement à
l'affichage par `src/components/DocumentLegal.tsx` (`.replaceAll("[EMAIL_SUPPORT]",
BRAND_SERVER.supportEmail ?? "—")`), utilisé par les 5 pages légales rendues dans
l'application (`/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies`).
Vérifié réellement en direct sur `app.elsatia.fr/mentions-legales` : affiche bien
`support@elsatia.fr`, jamais le jeton brut. Le finding initial de GO-LIVE-FINAL sur ce point
était un faux positif (lecture du fichier source brut sans tenir compte du templating) —
corrigé dans ce rapport. **Aucune action nécessaire, aucun fichier modifié pour ce point.**

## 3. Placeholders juridiques — classification et correction

Recherche exhaustive des motifs `[XXX]` dans `docs/juridique/*.md` :

| Placeholder | Classification | Action |
|---|---|---|
| `[EMAIL_SUPPORT]` / `[URL_APPLICATION]` | Jetons de template actifs (résolus au rendu) | Aucune (voir §2) |
| `SIRET : [À COMPLÉTER]` (mentions-legales.md) | **EN ATTENTE INPI/INSEE** | Non touché |
| RCS / APE-NAF / TVA définitif (README.md) | **EN ATTENTE INPI/INSEE** | Non touché |
| `[JJ/MM/AAAA]` (8 fichiers) | **ERREUR RÉELLE** — jeton non résolu, affiché littéralement aux utilisateurs réels (vérifié en direct sur `app.elsatia.fr/mentions-legales` avant correction) | **Corrigé** — voir §12 |

**Point signalé, non corrigé** : `mentions-legales.md` affirme *« Numéro de TVA
intracommunautaire : Non applicable — TVA non applicable, article 293 B »* comme un fait
acquis, alors que `P15_STRIPE_LIVE_PREPARATION.md` §14 qualifie ce régime de **BLOQUÉ**
tant que l'immatriculation ne l'a pas confirmé. Incohérence réelle entre deux documents —
ni ajoutée ni supprimée dans ce lot (décision juridique/business, pas technique) :
**signalée à Julien pour arbitrage**, à trancher avant toute publication définitive.

## 4. Juridique — interdiction d'inventer

Aucun SIRET, SIREN, RCS, code APE ou régime fiscal n'a été inventé ou modifié. Toutes les
pages légales concernées restent explicitement marquées comme provisoires
(« à revérifier contre l'avis SIRENE », `[À COMPLÉTER]`) exactement comme avant ce lot.

## 5. RGPD — sous-traitants (registre article 28)

**Gap réel trouvé et corrigé** : `rgpd-sous-traitants.md` contenait sa propre note
d'avertissement — *« Réévaluer ce registre [...] avant toute activation de l'IA (fournisseur
non listé tant qu'elle reste désactivée) »*. L'IA est désormais active en Production
(AI-PROD-ACTIVATION-V1, IA-DEVIS-PROD-ACTIVATION-V1, lots antérieurs à celui-ci) —
**OpenAI, L.L.C. était donc un sous-traitant réel non documenté**. Ajouté au tableau avec
une description honnête (traitement US, pas de résidence UE constatée dans le code, DPA à
vérifier/accepter formellement — pas de promesse de conformité non vérifiée). Le
sous-traitant Boutique/Powens explicitement laissé absent (non actifs).

Vérifié pour l'IA (§10 du cahier des charges) directement dans le code :
- `journal_ia` (`src/lib/ai/journal.ts`) : aucune colonne prompt/message/conversation,
  uniquement jetons/coût/statut — confirmé, pas de promesse à corriger.
- Historique de conversation affiché à l'écran (`src/components/AssistantIA.tsx`) : état
  React en mémoire (`useState`), aucun `localStorage`/`sessionStorage` — perdu au
  rechargement, jamais persisté même côté client.
- Modèle/fournisseur : client OpenAI standard (`src/lib/ai/providers/openai.ts`), aucune
  configuration de résidence de données UE ni de rétention zéro constatée — décrit tel quel
  dans la nouvelle entrée du registre, sans sur-promettre.

## 6. DPA entreprises clientes

`dpa-entreprises-clientes.md` §8 (« sous-traitants ultérieurs autorisés ») listait
Supabase/Vercel/Stripe/Brevo uniquement — **Sentry et OpenAI manquaient**, alors que le
document engage explicitement l'Éditeur (« Toute modification est notifiée »). Liste
corrigée pour refléter la réalité actuelle.

## 7. Dates RGPD / juridique

8 fichiers avaient un placeholder `[JJ/MM/AAAA]` littéral et non résolu (contrairement à
`[EMAIL_SUPPORT]`), affiché aux vrais visiteurs sur les pages légales de l'application.
Corrigé avec la **date réelle de dernière modification substantielle** de chaque fichier
(déterminée par `git log`, un fait vérifiable, pas une invention) :

| Fichier | Date appliquée | Nature |
|---|---|---|
| `mentions-legales.md` | 21/08/2026 | git log (aucun changement de fond dans ce lot) |
| `cgv.md` | 21/08/2026 | idem |
| `cgu.md` | 01/08/2026 | idem |
| `politique-confidentialite.md` | 21/08/2026 | idem |
| `politique-cookies.md` | 13/08/2026 | idem |
| `rgpd-registre-des-traitements.md` | 21/08/2026 | idem (pas de changement de fond — voir §8) |
| `rgpd-sous-traitants.md` | 24/08/2026 | date réelle du changement de fond (ajout OpenAI, §5) |
| `dpa-entreprises-clientes.md` | 24/08/2026 | idem (§6) |

## 8. Traitement IA — placement correct dans les registres

Décision documentée : le traitement par l'assistant IA des données métier d'une entreprise
cliente (devis, planning, etc.) relève du rôle **sous-traitant** (`dpa-entreprises-clientes.md`
/ `rgpd-sous-traitants.md`), pas du rôle **responsable de traitement**
(`rgpd-registre-des-traitements.md`, qui couvre explicitement, par sa propre définition,
uniquement les traitements réalisés « en tant que responsable » — compte, facturation,
support, prospection). Aucune section IA ajoutée à `rgpd-registre-des-traitements.md` :
l'ajouter là aurait été une erreur de classification, pas une amélioration.

## 9. Test quota IA dépassé

Absent avant ce lot (constat de GO-LIVE-FINAL). Ajouté dans `src/lib/ai/journal.test.ts`,
7 nouveaux tests (8/8 au total dans ce fichier, tous verts) :

1. Quota disponible → appel autorisé (`null`).
2. Quota exactement atteint → bloqué, message exact vérifié.
3. Quota dépassé → bloqué, message propre (pas de `undefined`/`NaN`/objet brut).
4. Politique `depassement_facture` → jamais bloqué (facturation à l'usage assumée).
5. Plafond budgétaire HT atteint → bloqué même si le quota d'opérations n'est pas atteint.
6. Reproduction du garde-fou réel de `genererDevisIAAction`
   (`src/app/actions/devis.ts:275-276`, vérifié en lisant le code) : quand
   `verifierPlafondIA` bloque, ni le provider IA ni `journaliserAppelIA` ne sont jamais
   appelés — aucun contournement possible côté IA devis, aucun coût fantôme journalisé.
7. `journaliserAppelIA` : vérifie explicitement l'ensemble exact des colonnes écrites
   (aucun champ prompt/conversation).

Aucun quota commercial modifié.

## 10. Feature flags fail-closed

Rejoué : `src/lib/preview-features.test.ts` — **10/10 verts**. Confirme
`FEATURE_AI_ENABLED`/`FEATURE_AI_DEVIS_ENABLED`/`FEATURE_RELANCES_AUTO_ENABLED` = `false`
si la variable est absente. Aucune modification.

## 11. Accessibilité

Pas de refonte. Vérifié : le panneau Assistant IA a déjà `role="log" aria-live="polite"`
sur son flux de messages (`src/components/AssistantIA.tsx:377`) — rien à corriger là,
contrairement à une lecture rapide du finding GO-LIVE-FINAL (qui portait sur une page
différente, `/notes-frais`). **Correctif trivial appliqué** : le message de statut
succès/erreur après une relance manuelle (`src/components/RelanceDocumentSection.tsx`)
n'avait aucun `aria-live` — ajouté (`role="status" aria-live="polite"`), changement
d'attribut JSX pur, aucun risque fonctionnel. Une revue exhaustive de tous les messages
async du produit reste **ROADMAP** (hors périmètre « pas de refonte » de ce lot).

## 12. Résidus Production — consolidation

| Entreprise | Type | Lot d'origine | Raison immutabilité | Utilisateur actif ? | Accès désactivé ? | Données fictives ? | Risque | Nettoyage futur |
|---|---|---|---|---|---|---|---|---|
| `ARCHIVE IMMUABLE V1E - NE PAS SUPPRIMER` | Résidu permanent | Terrain-mobile / audit note de frais (antérieur à cette session) | Trigger d'immutabilité (note de frais/facture) | **Non** — 0 ligne `utilisateurs_entreprises` (déjà propre) | N/A (aucun compte lié) | Oui | Nul | Impossible sans affaiblir un trigger métier — non recommandé |
| `RECETTE-RELANCES-PROD-V1` | Résidu permanent | RELANCES-AUTO-PROD-ACTIVATION-V1 (même session) | `verrouiller_facture_emise()` sur la facture de recette, cascade FK vers client + entreprise | **Non — supprimé dans ce lot** (voir §13) | Oui (plus de compte Auth du tout) | Oui (adresse `support@elsatia.fr`, contrôlée, jamais un vrai client) | Nul | Impossible sans affaiblir le trigger — non recommandé |

Aucune suppression de donnée métier tentée ou effectuée. Les deux résidus sont
auto-documentés (nom explicite ou `notes_internes`/`notes` préfixés `RESIDU-PERMANENT-*`).

## 13. Résidus Auth

`ARCHIVE IMMUABLE V1E` : déjà sans compte Auth actif (vérifié, 0 ligne
`utilisateurs_entreprises`) — aucune action nécessaire.

`RECETTE-RELANCES-PROD-V1` : le compte Auth de recette
(`recette-relances-prod-v1@example.invalid`, domaine `.invalid` — RFC 2606, jamais un
compte réel) était encore actif (dernière connexion le jour même, utilisée par cette
session). **Preuve de sécurité suffisante réunie** (adresse non-routable dès sa création,
entreprise déjà classée résidu documenté) : supprimé via `delete from auth.users` — cascade
propre confirmée (la ligne `utilisateurs_entreprises` associée a disparu avec lui, aucune
ligne orpheline), **la donnée métier résiduelle (entreprise/client/facture) reste intacte**,
inchangée. Amélioration de sécurité réelle : plus aucun identifiant de connexion actif pour
ce résidu.

## 14. Données démo

`Atelier Bâtiment Lyonnais` : non touchée. Reconfirmée démo (30 clients/108 devis/72
factures, emails `@example.test`, noms génériques — déjà vérifié en détail lors de
GO-LIVE-FINAL, non re-testé ici pour éviter toute manipulation inutile).

## 15. Vercel env hygiene

Noms uniquement listés (Production, 39 variables). Classification :

- **ACTIVE** : la quasi-totalité — tous les flags (`FEATURE_*`), toutes les clés de service
  (Stripe/Brevo/OpenAI/Sentry/Supabase/rate-limit), tous les `STRIPE_PRICE_*` (comptes de
  base + comptes supplémentaires), `CRON_SECRET` (ajouté lors du lot précédent), etc.
- **ACTIVE (usage restreint aux scripts)** : `ELSATIA_SUPABASE_PROJECT_NAME` et
  `SUPABASE_PROJECT_REF` — non utilisées par l'application déployée elle-même, mais bien
  utilisées par des scripts de tooling réels (`scripts/garde-scripts-production.mjs`,
  `scripts/seed-elsatia-preview-year.mjs`) — pas orphelines, vérifié par recherche de code.
- **LEGACY INERTE** : aucune trouvée (confirmé : `NEXT_PUBLIC_SUPABASE_ANON_KEY` déjà
  supprimée lors de la rotation de sécurité antérieure documentée).
- **À SUPPRIMER PLUS TARD** : aucune identifiée.
- **INCONNUE** : aucune.
- Aucune référence « Liria » trouvée dans les noms de variables.

## 16. Stripe Test hygiene

Inventaire complet (12 produits / 31 prices, 100% Test, vérifié sans jamais afficher de
clé) :

| Catégorie | Produits | Statut |
|---|---|---|
| Offres de base (Mini/Pro/Business/Entreprise) | 4, tag `PRODUCTION_APP_TEST_MODE` | ACTIVE, utilisés par l'app réelle |
| Comptes supplémentaires (Mini/Pro/Business/Entreprise) | 4, tag `PRODUCTION_APP_TEST_MODE` | ACTIVE, utilisés par l'app réelle |
| Comptes supplémentaires Preview (Administratif/Chef d'équipe/Terrain) | 3, tag `PREVIEW_TEST` | ACTIVE (Preview), pas orphelins |
| `myproduct` | 1, métadonnées vides, nom générique | **Orphelin réel** — aucun lien avec ELSATIA, candidat sûr à une suppression future (non supprimé dans ce lot, conformément à la consigne) |

Aucun objet Stripe supprimé. Aucune clé affichée.

## 17. Ancien branding « Liria » — user-facing

Recherche exhaustive (`grep -rni liria src/`). Toutes les occurrences trouvées sont
légitimes et non user-facing :
- Clés `localStorage` de migration historique (`liria-dashboard-masques`,
  `liria-appareil-id`, `liria-presence-*`, `liria:gps:*`, `liria-dashboard-widgets-v1`) —
  lues une fois pour migrer vers les clés `elsatia-*` actuelles, jamais affichées.
- Un test de régression dédié (`src/lib/ai/brand.test.ts`) dont le rôle est justement de
  **garantir** qu'aucune mention « Liria »/« LIRIA CONCEPT » ne reste dans les réponses IA.
- Un commentaire de code (`src/lib/qr-identification.ts`) documentant que d'anciennes
  étiquettes physiques imprimées avec le préfixe « LGP » peuvent encore circuler
  physiquement — fait réel, pas une fuite logicielle.

**Aucune correction nécessaire.** Les mentions dans `docs/*` (audits historiques) sont
volontairement laissées telles quelles (historique technique, pas user-facing).

## 18. Profil professionnel Stripe (Business Profile)

`P15_STRIPE_LIVE_PREPARATION.md` avait signalé `business_profile.name` = *« environnement
de test Liria Gestion Pro TEST »* et `business_profile.url` = ancien domaine
`liria-concept-gestion-btp.vercel.app`. Vérifié sûr à corriger maintenant : compte Test,
`details_submitted: false` (aucun KYC jamais soumis, donc aucun risque de revalidation).
**Corrigé** via l'API Stripe (`POST /v1/account`, Test uniquement, jamais `--live`) :
`business_profile.name` = « ELSATIA Gestion Pro », `business_profile.url` =
`https://elsatia.fr`. Vérifié : la route Connect (`accounts update <id>`) refuse
explicitement d'opérer sur le compte propre de la plateforme (« you may only use it on
connected accounts ») — la route correcte pour un compte non-Connect est `/v1/account`
(singulier), utilisée avec succès.

## 19. Legal noindex

Site vitrine (`elsatia.fr/mentions-legales`) : déjà `noindex, nofollow, nocache` — conforme.
**Gap réel trouvé** : l'application (`app.elsatia.fr`) n'a **aucun `robots.txt`** (404) et
ses 5 pages légales (`/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies`)
n'avaient **aucune balise `robots` de page** — indexables par défaut, alors qu'elles
affichent des informations juridiques provisoires (`[À COMPLÉTER]`). **Corrigé** :
`robots: { index: false, follow: false }` ajouté au `metadata` Next.js des 5 pages
(changement de métadonnées uniquement, aucun risque fonctionnel). Condition de retrait du
`noindex` : une fois les données juridiques finales confirmées (SIRET, TVA, adresse
revérifiée par avis SIRENE).

## 20. P15 checklist

`P15_GO_LIVE_CHECKLIST.md` : aucune case cochée avant ce lot, et c'est l'état réel — rien
n'a été fait côté bascule Live (confirmé : 0 produit Live, KYC non soumis, banque/IBAN non
ouverts). **Aucune case cochée** dans ce lot (aurait été une fabrication) — seule une note
de contexte ajoutée, renvoyant vers ce document et `GO_LIVE_FINAL.md`.

## 21. GO-LIVE-FINAL doc

Section « PRE-LIVE-CLEANUP-V1 » ajoutée à `docs/organisation/GO_LIVE_FINAL.md`.

## 22. QA

`npm run verify` : **513/513 tests** (71 fichiers, +7 par rapport à GO-LIVE-FINAL — les
nouveaux tests quota IA), typecheck ✅, lint ✅, build ✅, `verify:migrations` (209) ✅,
`verify:secrets` (904 fichiers, 0 secret) ✅. `npm audit --audit-level=high` : **0
vulnérabilité**.

## 23. Aucune recette destructrice

Confirmé : aucune nouvelle facture émise, aucun nouveau devis accepté, aucun email envoyé,
aucun paiement Stripe créé dans ce lot. Le seul changement de donnée réelle est une
suppression (compte Auth de recette, §13) — pas une création de résidu.

## 24. Production

Modifications Production dans ce lot : suppression du compte Auth de recette (§13,
lecture/écriture directe base, hors déploiement), correction du profil Stripe Test (§18,
API Stripe, hors déploiement). Le code/documentation (juridique, tests, accessibilité,
noindex) sera déployé via le merge normal de la branche vers `release/commercialisation-v1`
puis redéploiement — aucun changement fonctionnel métier.
