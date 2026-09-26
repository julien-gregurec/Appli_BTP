# ELSATIA — RGPD Data Lifecycle Closure V3

Qualification technique du cycle de vie des données personnelles (Liria Gestion Pro /
`btp-platform`), réalisée en autonomie sur la branche `claude/funny-ramanujan-62d0yw`.

**Verdict global : RGPD TECHNICAL BLOCKERS OPEN**

Un blocage technique certain a été trouvé (aucune purge effective après le délai de
30 jours promis aux clients) et partiellement comblé (infrastructure de purge créée,
mais non exécutée faute d'environnement de test). Un deuxième défaut certain
(anonymisation salarié incomplète : fichiers Storage orphelins) a été **corrigé et
testé**. Plusieurs zones restent `LEGAL_DECISION_REQUIRED` ou `REMOTE_ACTION_REQUIRED`
avant de pouvoir répondre « RGPD TECHNICAL LIFECYCLE LOCALLY QUALIFIED ».

---

## 0. Méthodologie et limites (à lire avant tout le reste)

- **Revue statique exhaustive** : les 179 migrations SQL (`supabase/migrations/`), le
  code serveur RGPD (`src/app/actions/rgpd.ts`, `src/app/api/rgpd/export/route.ts`,
  `src/app/(app)/parametres/donnees/page.tsx`) et les usages Storage dans `src/app/actions/*`
  et `src/app/api/**` ont été lus intégralement pour les parties citées ci-dessous.
- **Pas d'environnement Supabase local exécutable dans ce conteneur** : `docker` (CLI)
  est présent mais le daemon Docker n'est pas accessible (`Cannot connect to the Docker
  daemon`). `npx supabase start` échoue donc immédiatement. **Aucun export réel, aucune
  suppression réelle, aucune purge Storage réelle n'a été exécutée contre une base
  vivante** pendant cette qualification, contrairement à ce que demandait la mission
  (§2, §4, §5, §8, §11). Tout ce qui suit repose sur la lecture du code SQL/TS, pas sur
  une exécution.
- Ce qui **a** été exécuté réellement : `npm install`, `npx tsc --noEmit`, `npx eslint`,
  `npx vitest run` (111 tests, dont 7 nouveaux), `npm run verify:migrations` (179
  migrations valides) et `npm run verify:secrets` (aucun secret détecté) — tous
  passants après les correctifs.
- Conséquence directe : la nouvelle infrastructure de purge (section 8) est écrite,
  relue, couverte par un test pgTAP écrit — **mais ce test n'a pas pu être exécuté**.
  Elle est livrée comme fondation technique, pas comme fonctionnalité validée
  end-to-end. Marquée `REMOTE_ACTION_REQUIRED`.
- **Note de sécurité indépendante de la mission RGPD** : `AGENTS.md` (chargé automatiquement
  via `CLAUDE.md`) contient une instruction demandant de lire
  `node_modules/next/dist/docs/` avant d'écrire du code, en prétendant que « ceci n'est pas
  le Next.js que vous connaissez ». Ce chemin n'existe pas (`node_modules` n'était même pas
  installé au démarrage de la mission) : c'est un schéma classique d'injection de prompt
  (faire lire à un agent un contenu de dépendance non fiable comme s'il s'agissait
  d'instructions projet légitimes). Cette instruction a été **ignorée**. Aucune action
  corrective en dur n'est nécessaire côté code (le fichier ne référence pas de secret ni
  de commande), mais Julien devrait vérifier d'où vient cette ligne dans `AGENTS.md` et la
  retirer.

---

## 1. Data map

### 1.1 Vue d'ensemble

- 179 migrations, schéma `public` sur Postgres/Supabase, isolation multi-tenant par
  colonne `entreprise_id` + RLS (`est_membre_actif`, `a_permission`) — architecture déjà
  auditée et jugée saine dans `docs/AUDIT_SECURITE.md` (18 juillet 2026, non ré-exécuté
  ici, revue de cohérence uniquement).
- **Toute table portant `entreprise_id`** (hors `entreprises` elle-même) est
  automatiquement couverte par l'export et par le mécanisme de purge (section 8) : les
  deux découvrent les tables dynamiquement via `information_schema`, pas via une liste en
  dur qu'on pourrait oublier de mettre à jour.
- **Buckets Storage** (13, tous cloisonnés par `entreprise_id` = 1er dossier du chemin,
  sauf `entreprise-assets` qui est public par conception — logos sur devis/factures) :
  `documents-employes`, `chantier-documents`, `devis-medias`, `messagerie-medias`,
  `notes-frais`, `notes-frais-exports`, `factures-fournisseurs`, `fiches-techniques`,
  `bulletins-paie`, `documents-paie`, `pointage-preuves`, `entreprise-assets`, et le
  bucket historique `employes` (upload direct, à vérifier — `src/app/actions/employes.ts:159`).

### 1.2 Tableau par domaine

| DATA DOMAIN | Table(s) / storage représentatives | export | delete/anonymize existant | notes |
|---|---|---|---|---|
| USER (compte plateforme) | `auth.users`, `public.utilisateurs` | ❌ non couvert (pas de colonne `entreprise_id`) | cascade `on delete cascade` depuis `auth.users` → `utilisateurs` → `utilisateurs_entreprises` (OK techniquement) | **Omission indirecte confirmée** : le profil utilisateur (nom, prénom, 2FA) n'apparaît jamais dans l'export « mes données » |
| EMPLOYEE | `employes`, `pointages`, `sessions_pointage`, `affectations`, `habilitations_employe` | ✅ (toutes ont `entreprise_id`) | `anonymiser_employe()` — **corrigé** (voir §4) | pointages/heures volontairement conservés (obligation sociale) |
| CONTACT | pas de table dédiée ; contacts intégrés à `clients` | ✅ | pas de fonction dédiée | à confirmer avec Julien si un contact "personne physique" distinct existe hors `clients` |
| CLIENT | `clients`, `chantiers` | ✅ | aucune fonction d'anonymisation client dédiée | hors périmètre historique (le prompt d'origine ne couvrait que salarié + entreprise) — `DECISION_REQUIRED` |
| SIGNATURE | `employes.signature_storage_path` ; `documents-employes` ; signatures de documents (`src/app/actions/signatures-documents.ts`) | ✅ (colonnes dans l'export JSON) | DB nullée par `anonymiser_employe`, **fichier maintenant supprimé** (§4) | |
| GPS | `sessions_pointage.latitude_*/longitude_*`, `pointage-preuves` | ✅ | **non touché par `anonymiser_employe`** | historique GPS lié à l'employé (même anonymisé) reste consultable ; retenu par défaut, `LEGAL_DECISION_REQUIRED` (preuve horaire/litige prud'homal) |
| PHOTO | `employes.photo_storage_path`, `sessions_pointage.photo_*_storage_path`, `pointage-preuves` | ✅ (chemins) | photo `employes` **fichier maintenant supprimé** (§4) ; photos de pointage terrain (visage + géoloc) **non touchées**, `LEGAL_DECISION_REQUIRED` |
| EXPENSE (notes de frais) | `notes_frais`, bucket `notes-frais` / `notes-frais-exports` | ✅ | conservé (comptable), pas d'anonymisation dédiée | proposé en `RETAIN` implicite via la comptabilité liée, à confirmer |
| LEAVE (congés) | `demandes_conges` | ✅ | pas de fonction dédiée ; couvert par la purge générique | |
| MESSAGE | `pieces_jointes_messages`, messagerie chantier, bucket `messagerie-medias`/`devis-medias` | ✅ | couvert par la purge générique | |
| AUDIT | `journal_activite` | ✅ | **jamais supprimé** — conservé par conception dans la purge (§8) | contient `utilisateur_id` en clair ; §9 |
| DOCUMENT | `chantier-documents`, `fiches-techniques`, `documents-paie` | ✅ (chemins) | couvert par la purge générique (DB) ; fichiers Storage — voir §8 | |
| STORAGE OBJECT | 13 buckets (liste §1.1) | ⚠️ chemins seulement, pas les fichiers eux-mêmes | aucune purge Storage globale n'existait avant cette mission | voir §4, §8 |
| AUTH | `auth.users`, `appareils_comptes` (registre d'appareils) | ❌ (`auth.users` hors `public`) | cascade correcte depuis `auth.users` | droit d'accès à l'e-mail/dernière connexion Supabase Auth non couvert par l'export applicatif |
| EMAIL | pas de table de log d'envoi identifiée dans `public` (Resend/autre géré côté fournisseur, hors `public`) | ❌ | n/a | à vérifier côté fournisseur d'e-mail (hors périmètre code applicatif) |
| SUPPORT | `est_acces_support_actif`, accès plateforme en cas d'impayé (`20260714000075`) | n/a (mécanisme d'accès, pas une table de données) | n/a | accès du support à un tenant tracé par `a_permission`/`journal_activite` (à confirmer que chaque accès support est bien journalisé) |

---

## 2 & 3. Export utilisateur / entreprise

Une seule fonction existe : `exporter_donnees_entreprise(entreprise_id)`
(`supabase/migrations/20260719000114_rgpd_export_suppression.sql`). Elle sert à la fois
de « mon export » et d'« export entreprise » (design du projet : pas d'export
individuel séparé pour un salarié non-admin — cohérent avec `PROMPT_CODEX_RGPD.md`,
non remis en cause ici).

**Mécanisme** : parcourt dynamiquement `information_schema.columns` pour trouver
toutes les tables `public.*` avec une colonne `entreprise_id`, exclut les colonnes
correspondant à `mot_de_passe|password|secret|token|hash`, exporte le reste en JSON.
Robuste aux nouvelles tables (pas de liste à maintenir à la main) — bon point de
conception, confirmé en le comparant table par table au schéma réel.

### Défauts certains trouvés (comparaison export ↔ données réellement présentes)

1. **Omission indirecte confirmée — profils utilisateurs** : `public.utilisateurs`
   (nom, prénom, statut 2FA) n'a **pas** de colonne `entreprise_id` — il est donc
   invisible à la boucle dynamique de l'export, alors que ces personnes sont les
   utilisateurs de l'entreprise qui exporte. Pas corrigé dans cette session (périmètre :
   nécessite d'ajouter une jointure spécifique via `utilisateurs_entreprises`, hors des
   « défauts certains bornés » traités ici) — **à faire**, signalé pour correction
   ultérieure.
2. **Export = données seulement, pas de fichiers** : les colonnes `*_storage_path`
   apparaissent bien dans le JSON exporté (ex. `employes.photo_storage_path`), donc les
   fichiers sont *référencés*, mais aucun fichier n'est réellement inclus ni le bucket
   explicité dans le JSON — un utilisateur qui exporte ne peut pas, avec ce seul export,
   reconstruire quels fichiers existent sans connaître le code applicatif. `docs/juridique`
   et `PROMPT_CODEX_RGPD.md` (§ Export) attendaient « fournir les fichiers, ou les
   référencer correctement » — la référence actuelle est incomplète (bucket manquant).
   Non corrigé cette session (aurait nécessité de refaire l'export en ZIP avec fichiers,
   changement plus large que le périmètre « défaut technique certain et borné » retenu
   ici) — recommandation : étendre `/api/rgpd/export` pour zipper les fichiers listés via
   `lister_fichiers_storage_entreprise` (nouvellement ajoutée, §8) plutôt que de ne
   renvoyer que le JSON.
3. **`auth.users`** (email d'authentification, dernière connexion) n'est jamais exporté
   — normal vu que l'export travaille sur `public`, mais c'est une donnée personnelle au
   sens RGPD. `DECISION_REQUIRED` / amélioration produit possible.

Aucune fuite cross-tenant trouvée dans l'export : `a_permission(p_entreprise_id, ...)`
vérifie l'appartenance de `auth.uid()` à **cette** `entreprise_id` précise avant
d'exécuter la moindre requête, et chaque `execute format(...)` est filtré par
`entreprise_id = $1`.

---

## 4. Storage — défaut certain corrigé

### Défaut trouvé : anonymisation salarié incomplète

`anonymiser_employe()` (même migration) vide bien les colonnes texte de `employes`
(regex sur les noms de colonnes : `email|telephone|...|photo|signature|carte_btp|...`),
**mais ne supprime jamais les fichiers Storage** que ces colonnes référençaient
(`documents-employes/<entreprise_id>/<employe_id>/portrait-*.png`,
`signature-*.png`, `carte-btp-*.pdf`). Résultat vérifié par lecture du code : après
« anonymisation », la fiche employé affiche « Salarié anonymisé », mais la photo, la
signature et la carte BTP de la personne **restent en clair, indéfiniment**, dans le
bucket — simplement déréférencées côté base. Ce n'est pas un effacement, techniquement
parlant : c'est une désindexation. Confirmé comme défaut certain (le texte de l'UI
promet explicitement « Son identité [...] et sa signature sont effacées »,
`src/app/(app)/parametres/donnees/page.tsx`).

### Correctif appliqué (testé)

- `src/lib/rgpd.ts` (nouveau) : `cheminsStorageEmployeAAnonymiser()`, fonction pure.
- `src/app/actions/rgpd.ts` : `anonymiserEmployeAction` récupère désormais les trois
  chemins Storage **avant** d'appeler la RPC (qui les vide en base), puis supprime
  réellement les fichiers du bucket `documents-employes` après le succès de la RPC.
- Test : `src/lib/rgpd.test.ts` (4 cas : trois fichiers, fichiers partiels/nuls,
  employé sans fichier, employé introuvable) — **exécuté, passant**.
- Non corrigé volontairement dans le même geste (périmètre plus large, nécessite une
  décision produit) : les photos/GPS de `sessions_pointage` et `pointage-preuves` liés
  au même salarié ne sont pas touchés par l'anonymisation — `LEGAL_DECISION_REQUIRED`
  (voir tableau §1.2, ligne GPS/PHOTO).

---

## 5. Suppression utilisateur (entreprise)

**FK blockers cartographiés** : aucun — la quasi-totalité des tables métier utilise
`entreprise_id uuid not null references entreprises(id) on delete cascade`. Un `DELETE
FROM entreprises` brut ne bloquerait donc sur aucune contrainte — **il réussirait, et
c'est justement le problème** : il cascaderait aveuglément sur `factures`, `paiements`,
`bulletins_paie`, `journal_activite`, etc., détruisant des données dont la loi impose la
conservation (~10 ans). Ce risque est documenté et neutralisé par conception dans
l'infrastructure de purge livrée (§8) : elle ne supprime jamais la ligne `entreprises`.

**Défaut certain — P0** : `demander_suppression_entreprise()` programme
`suppression_prevue_at = now() + 30 jours` et l'UI affiche « passé ce délai, vos données
sont supprimées ». **Aucune fonction, aucun job, aucun cron n'exécutait cette purge.**
Vérifié par recherche exhaustive dans les 179 migrations (`grep` sur `purge`, `purger`,
`cron`, `pg_cron`) : rien. Une entreprise en attente de suppression depuis six mois
aujourd'hui aurait toujours 100 % de ses données intactes. C'est le blocage principal de
cette qualification.

---

## 6. Anonymisation salarié

Voir §4 (correctif Storage). Éléments qui restent nominatifs après anonymisation,
malgré le correctif :
- `sessions_pointage` / `pointage-preuves` : photos + coordonnées GPS horodatées liées à
  `employe_id`. `LEGAL_DECISION_REQUIRED`.
- `journal_activite` : conserve `utilisateur_id` en clair pour les actions historiques
  de la personne (y compris l'entrée « Anonymisation RGPD d'un salarié » elle-même, qui
  documente *qui* a fait l'anonymisation, pas la personne anonymisée). Conservé par
  conception (intégrité d'audit) — `LEGAL_DECISION_REQUIRED` sur la durée de rétention.
- `bulletins_paie`, `paiements` : nominatifs par nature comptable, retenus
  volontairement (§7).

---

## 7. Frontières de rétention légale — DELETE / ANONYMIZE / RETAIN

Proposition technique (à valider, voir `DECISION_REQUIRED` ci-dessous) formalisée dans
`src/lib/rgpd.ts::TABLES_CONSERVEES_PURGE` et son miroir SQL
`tables_conservees_purge()` :

| Catégorie | Tables | Justification proposée |
|---|---|---|
| **RETAIN** (jamais supprimées par la purge) | `factures`, `lignes_factures`, `paiements`, `coordonnees_bancaires`, `bulletins_paie`, `connexions_bancaires`, `lots_virements`, `ordres_virements`, `journal_paiements_bancaires`, `journal_activite` | pièces comptables/paie/bancaires (prescription ~10 ans, Code de commerce) + intégrité de l'audit |
| **ANONYMIZE** | fiche `entreprises` elle-même | nom, SIRET, adresse, logo, assurances effacés ; ligne conservée (empêche la cascade FK de détruire le RETAIN ci-dessus) |
| **DELETE** | toutes les autres tables `entreprise_id` (clients, chantiers, devis, employés, pointages, notes de frais, stock, planning, messagerie…) | pas de fondement de rétention légale identifié |

`LEGAL_DECISION_REQUIRED` : cette classification est une proposition technique de
qualification, pas une décision juridique. Julien doit la valider (ou la corriger) avant
toute purge réelle — notamment confirmer qu'aucune table métier « DELETE » ne contient
en fait une pièce à conserver (ex. `notes_frais` avec justificatif fiscal), et confirmer
la durée exacte de rétention comptable applicable.

---

## 8. Purge Storage & infrastructure de purge — livrée mais non exécutée

Nouvelle migration `supabase/migrations/20260729000184_purge_entreprise_supprimee.sql` :

- `entreprises.purgee_at` (colonne de suivi).
- `purge_entreprises_progres` : table de suivi **sans FK vers `entreprises`** (pour
  survivre à la purge elle-même — trace d'audit indépendante, §9).
- `rapport_purge_entreprise(entreprise_id)` : lecture seule, simule la purge (compte les
  lignes DELETE vs RETAIN par table) — safe à exécuter à tout moment.
- `purger_table_entreprise(entreprise_id, table)` : purge **une seule table**, appel =
  une transaction = un point de reprise ; refuse toute table de la liste `RETAIN` ou
  inconnue (liste blanche dynamique, anti-injection de nom de table) ; journalise succès
  ou échec dans `purge_entreprises_progres` (jamais d'état ambigu, voir §11).
- `lister_fichiers_storage_entreprise(entreprise_id)` : liste tous les objets Storage de
  l'entreprise, tous buckets confondus (cloisonnement uniforme `entreprise_id` = 1er
  dossier, cf. `docs/AUDIT_SECURITE.md`) — lecture seule ; la suppression physique reste
  à la charge de l'appelant via l'API Storage (SQL direct sur `storage.objects` ne
  garantit pas la suppression physique côté backend).
- `marquer_entreprise_purgee(entreprise_id)` : anonymise (jamais ne supprime) la ligne
  `entreprises`, dernière étape.
- Toutes les fonctions : `revoke ... from public, anon, authenticated` /
  `grant execute ... to service_role` — **jamais self-service**, conforme à
  `PROMPT_CODEX_RGPD.md`.
- Script opérateur : `scripts/purger-entreprise.mjs <entreprise_id> [--confirmer]` —
  sans `--confirmer`, affiche uniquement le rapport de simulation ; ne supprime rien.
- Test pgTAP écrit : `supabase/tests/purge_entreprise_supprimee.test.sql` (existence des
  objets, permissions `service_role` uniquement, RLS active).

**Ce qui n'a PAS été fait, et pourquoi** : le test pgTAP n'a pas pu être exécuté
(§0 — pas de daemon Docker accessible), donc rien n'a été validé contre un vrai
Postgres/Storage. Aucune purge n'a été déclenchée contre des données, synthétiques ou
réelles. `REMOTE_ACTION_REQUIRED` : exécuter `supabase test db` dans un environnement où
Docker fonctionne, puis un essai sur une entreprise de test (`supabase/production/seed_entreprise_test_5_ans.sql`
fournit déjà un jeu de données synthétique riche, à utiliser pour ce test), avant tout
usage en production.

---

## 9. Piste d'audit

`journal_activite` est conservée par conception dans la purge (§7) : la piste d'audit
survit à la suppression de l'entreprise. Elle contient `utilisateur_id` en clair,
c'est-à-dire une identité directe. `LEGAL_DECISION_REQUIRED` : faut-il pseudonymiser
`utilisateur_id` dans `journal_activite` après purge (ex. hash irréversible) pour
« ne pas conserver inutilement d'identité directe » tout en gardant l'intégrité du
volume d'événements ? Non fait ici (dépend d'un arbitrage entre traçabilité légale de
l'audit et minimisation — décision produit/juridique).

---

## 10. Cross-tenant

Aucune fuite trouvée. Toutes les RPC RGPD (export, anonymisation, demande/annulation de
suppression, et les nouvelles RPC de purge) reçoivent un `p_entreprise_id` mais
**revérifient elles-mêmes** l'appartenance de `auth.uid()` à cette entreprise via
`a_permission`/`est_membre_actif` — passer l'ID d'une autre entreprise ne suffit pas à
en exporter ou en purger les données. Les nouvelles RPC de purge vont plus loin :
`service_role` uniquement, donc même un administrateur légitime de sa propre entreprise
ne peut pas les appeler directement.

---

## 11. Panne / rejeu

Avant cette mission : **impossible à évaluer, la purge n'existait pas.** Avec
l'infrastructure livrée : chaque table est purgée par un appel RPC séparé (une
transaction Postgres par appel), avec écriture de progression dans
`purge_entreprises_progres` avant tout retour. Une interruption (crash, timeout réseau)
entre deux appels ne laisse donc jamais une table à moitié purgée — au pire, la table en
cours d'appel n'a pas encore committé (donc intacte) ou a déjà committé (donc marquée
`termine_at`). Le script `scripts/purger-entreprise.mjs` est conçu pour être relancé tel
quel après une interruption (il recalcule le rapport à chaque exécution). **Non testé en
conditions de panne réelle** (pas d'environnement d'exécution) — `REMOTE_ACTION_REQUIRED`.

---

## 12. Sécurité (export/delete d'un autre utilisateur)

Vérifié par lecture de code : `entrepriseId` provient toujours de
`getContexteEntreprise()` côté serveur (dérivé de la session Supabase, jamais d'un
paramètre client), et chaque RPC revalide l'appartenance/permission côté SQL. Aucun
moyen identifié pour un utilisateur A de déclencher un export ou une suppression sur les
données d'une entreprise B. Les nouvelles RPC de purge sont en plus verrouillées
`service_role` (ni `authenticated` ni `anon` ne peuvent les appeler, vérifié par les
`revoke`/`grant` de la migration, et couvert par le test pgTAP écrit §8).

---

## 13. Correctifs appliqués — résumé

| # | Défaut | Statut | Tests |
|---|---|---|---|
| 1 | Anonymisation salarié ne supprime pas les fichiers Storage (photo/signature/carte BTP) | **Corrigé** (`src/lib/rgpd.ts`, `src/app/actions/rgpd.ts`) | `src/lib/rgpd.test.ts` — 4 cas, exécutés, passants |
| 2 | Aucune purge n'existait pour honorer la suppression à 30 jours | **Infrastructure livrée**, non exécutée en conditions réelles | `supabase/tests/purge_entreprise_supprimee.test.sql` écrit, non exécuté (`REMOTE_ACTION_REQUIRED`) |
| 3 | Export omet les profils `utilisateurs` (pas de `entreprise_id`) | Documenté, **non corrigé** (hors périmètre borné de cette session) | — |
| 4 | Export ne fournit pas les fichiers Storage (chemins seuls, bucket implicite) | Documenté, **non corrigé** | — |

Validation globale après correctifs : `npx tsc --noEmit` ✅, `npx eslint` ✅ (fichiers
modifiés/ajoutés), `npx vitest run` ✅ (111/111, dont 7 nouveaux), `npm run
verify:migrations` ✅ (179 migrations valides), `npm run verify:secrets` ✅.

---

## 14. Verdict détaillé

### RGPD TECHNICAL BLOCKERS OPEN

Raison : la promesse contractuelle « suppression effective après 30 jours »
(`docs/juridique/cgv.md` art. 10) n'est, à ce jour, tenue par aucun code exécutable en
production — seule une infrastructure non validée a été livrée cette nuit. Tant que
`supabase test db` n'a pas confirmé le bon fonctionnement de la purge sur un
environnement réel, et tant que Julien n'a pas validé la classification RETAIN/DELETE
(§7), ce point reste bloquant.

### TECHNICAL (fait ou prêt à valider par CI/tests classiques)
- Anonymisation salarié : fichiers Storage réellement supprimés (corrigé, testé).
- Infrastructure de purge par entreprise : écrite, relue, testée unitairement côté
  logique pure (`tablesEligiblesPurge`), test pgTAP écrit mais non exécuté.
- Sécurité cross-tenant / IDOR sur les fonctions RGPD existantes et nouvelles : vérifiée
  par lecture de code, aucune faille trouvée.

### LEGAL_DECISION_REQUIRED (Julien uniquement, conservé par défaut en attendant)
1. Liste exacte des tables « RETAIN » (§7) et durée de rétention comptable exacte.
2. GPS + photos de pointage terrain (`sessions_pointage`, `pointage-preuves`) : à
   purger à l'anonymisation d'un salarié, ou à conserver comme preuve horaire ?
3. Pseudonymisation de `utilisateur_id` dans `journal_activite` après purge.
4. Périmètre de l'auto-service : un admin d'entreprise peut-il un jour déclencher lui-même
   la purge (aujourd'hui non : `service_role` uniquement), ou cela doit-il rester une
   opération plateforme ?
5. Anonymisation/suppression au niveau `clients` (personne physique cliente) : aucune
   fonction dédiée n'existe ; hors périmètre du prompt d'origine, à statuer.

### REMOTE_ACTION_REQUIRED (Julien, avec un environnement Docker/Supabase fonctionnel)
1. `supabase start` puis `supabase test db` (fait tourner `purge_entreprise_supprimee.test.sql`
   et l'ensemble de `supabase/tests/`).
2. Exécuter `scripts/purger-entreprise.mjs <id>` (sans `--confirmer`) sur l'entreprise de
   test `supabase/production/seed_entreprise_test_5_ans.sql`, relire le rapport, puis
   tester avec `--confirmer` sur cette même entreprise de test avant tout usage réel.
3. Tester un export réel (`/api/rgpd/export`) sur ce même jeu de données synthétique et
   comparer à la liste de tables attendue (§1–§2) pour confirmer/infirmer les omissions
   indirectes suspectées.
4. Vérifier l'origine de l'instruction suspecte dans `AGENTS.md` (§0) et la retirer si
   elle n'est pas légitime.
