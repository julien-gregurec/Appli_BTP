# ELSATIA — Qualification RGPD : portabilité & effacement (v1)

Réalisé en mission autonome, sans validation humaine en cours de route.
Toute ambiguïté a été résolue par le défaut le plus conservateur et marquée
`DECISION_REQUIRED`. Toute durée légale non vérifiable a été laissée vide et
marquée `LEGAL_REVIEW_REQUIRED` — **aucune durée légale n'a été inventée**.

Périmètre technique livré (branche `privacy/rgpd-erasure-portability-v1` via
`claude/nice-carson-g0attw`) :

- `supabase/migrations/20260729000184_rgpd_purge_entreprise_orchestree.sql` — état-machine de suppression, tombstone, régimes de rétention, legal holds, purge idempotente, export personnel, manifeste Storage.
- `src/lib/rgpd/storage.ts` — purge/inventaire Storage récursif, multi-bucket, idempotent.
- `src/lib/rgpd/auth.ts` — détachement des membres + suppression `auth.users` sans autre entreprise.
- `src/app/api/rgpd/export/route.ts` — export entreprise en ZIP (données + fichiers Storage + manifeste + checksums).
- `src/app/api/rgpd/export-personnel/route.ts` — export personnel (droit d'accès individuel).
- `src/app/actions/rgpd.ts`, `src/app/(app)/parametres/donnees/page.tsx` — UI et server actions (confirmation, legal holds).
- `src/app/api/cron/abonnements/route.ts` — orchestrateur de purge greffé (limite de crons Vercel Hobby, comme les autres jobs de ce fichier).
- `supabase/tests/rgpd_purge_entreprise.test.sql` — pgTAP (24 assertions, toutes vertes contre une base rejouée localement).
- `src/lib/rgpd/storage.test.ts` — Vitest (5 tests, idempotence + étanchéité cross-tenant).

Tout ce qui suit a été **exécuté réellement** : les 179 migrations du dépôt
ont été rejouées sur un Postgres 16 local (stub minimal du schéma Supabase :
`auth.*`, `storage.*`, rôles, privilèges par défaut), un scénario complet à
deux entreprises a été joué de bout en bout (demande → délai → confirmation
→ rétention → purge légale → clôture → tombstone), et `npm run verify`
(typecheck, lint, tests, migrations, secrets, build) passe intégralement.
Deux bugs réels ont été trouvés et corrigés pendant ces tests (voir
`FAILURE RECOVERY` et `COMPANY ERASURE`).

## Tableau de synthèse

| Domaine | Avant cette mission | Après cette mission | Automatique | Manuel | Legal review |
| --- | --- | --- | ---: | ---: | ---: |
| Cartographie des données | Implicite, non documentée | Documentée par régime (voir DATA MAP) | ✅ | — | — |
| Export utilisateur (personnel) | Inexistant | RPC + route dédiées, isolé par salarié | ✅ | — | — |
| Export entreprise | JSON tables seules, sans Storage | ZIP : tables + fichiers Storage réels + manifeste + checksums | ✅ | — | — |
| Suppression salarié (anonymisation) | Fonctionnelle (déjà existante) | Inchangée, revue et cohérente avec le reste | ✅ | — | — |
| Suppression entreprise — demande | Timestamp + délai 30j, pas de purge réelle | État-machine complète 7 états, orchestrée | ✅ | — | ⚠️ (délai/process) |
| Suppression entreprise — purge finale | **Inexistante** | RPC + cron, idempotente, anonymise sans casser la compta | ⚠️ bloquée tant que non validée | ✅ (validation durée) | ✅ |
| Storage — export | Inexistant | Listing récursif multi-bucket + téléchargement + checksum | ✅ | — | — |
| Storage — purge | Inexistant | Purge récursive idempotente, gère fichier absent/orphelin | ✅ (déclenchée par cron) | — | — |
| Auth (sessions/tokens) | Inexistant | `deleteUser` si plus aucune autre entreprise | ✅ | — | — |
| Rétention | Aucune mécanique générique (sauf notes de frais) | Régimes configurables, échéances recalculables | ✅ (mécanique) | ✅ (durées) | ✅ |
| Audit de purge | Inexistant | Journal chaîné par empreinte sha256 (mêmes principes que l'existant) | ✅ | — | — |
| Tombstone | Inexistant | Table minimale, sans donnée personnelle | ✅ | — | — |
| Cross-tenant | Non testé pour ce périmètre | Testé (pgTAP + scénario manuel) | ✅ | — | — |
| Idempotence / reprise après crash | Non testée pour ce périmètre | Testée (double purge, double clôture) | ✅ | — | — |
| Contenu binaire retenu (PDF paie…) | N/A | **Non redigé** (limite connue) | ❌ | ✅ | ✅ |

## DATA MAP

Classement par régime (mécanisme dynamique : toute nouvelle table portant
`entreprise_id` tombe automatiquement dans « opérationnel » sauf si elle est
explicitement rattachée à un autre régime — comme l'export existant, aucune
liste figée à maintenir à la main pour les nouvelles tables).

- **Opérationnel** (purgé immédiatement à la confirmation, aucune réserve
  légale) : `clients`, `chantiers`, `devis`, `planning_evenements`,
  `messages_internes`, `notes_frais` *(hors archive)*, `stock`, `outillage`,
  `appels_offres`, etc. — la quasi-totalité des ~84 tables portant
  `entreprise_id`. Exception notable trouvée en testant : `clients` est
  référencé par `factures.client_id` (`on delete restrict`) ; il est donc
  **anonymisé** (nom vidé) plutôt que supprimé quand une facture retenue le
  référence encore — géré automatiquement (voir COMPANY ERASURE).
- **Comptabilité/factures** (`comptabilite_factures`) : `factures`,
  `lignes_factures`, `paiements`, `ecritures_comptables_importees`,
  `facturation_comptes_mensuelle`. `LEGAL_REVIEW_REQUIRED` sur la durée.
- **Paie/social** (`paie_sociale`) : `bulletins_paie`, `pointages`,
  `dossiers_paie_salaries`, `temps_travail_paie`, `absences_paie`,
  `coordonnees_bancaires`, `lots_virements`, `ordres_virements`,
  `journal_paiements_bancaires`. `LEGAL_REVIEW_REQUIRED`.
- **Audit/sécurité** (`audit_securite`) : `journal_activite`, `journal_ia`,
  `acces_support_log`, `journal_purge_entreprise`. `LEGAL_REVIEW_REQUIRED`.
- **Notes de frais archivées** : système **déjà existant et dédié**
  (`politiques_conservation_notes_frais`, `legal_holds_notes_frais`,
  `journal_audit_notes_frais` — chaîne d'empreintes déjà en place). Non
  dupliqué : `verifier_purge_prete` l'interroge directement.
- **Personnel** : `utilisateurs`, `employes`, `clients` (coordonnées),
  `contacts_clients`.
- **Dérivé/temporaire** : exports (`exports_notes_frais`,
  `notes-frais-exports`), `codes_acces`,
  `plateforme_reinitialisations_mot_de_passe`.

`DECISION_REQUIRED` : certaines tables personnelles ne portent pas
`entreprise_id` mais `utilisateur_id` (ex. `push_abonnements`,
`preferences_notifications_push`) : leur nettoyage n'a **pas été audité
exhaustivement** ici ; elles dépendent des cascades `auth.users → utilisateurs`
déjà en place (`on delete cascade`), non revérifiées table par table pour ce
rapport. Gap identifié, pas bloquant (volumes faibles, pas de PII sensible).

## USER EXPORT

`exporter_donnees_utilisateur(p_utilisateur_id)` : réservé à `auth.uid() =
p_utilisateur_id` (aucun accès même en tant qu'admin d'entreprise — décision
volontairement stricte). Retourne le profil, les memberships propres, la ou
les fiches `employes` liées (`employes.utilisateur_id`), et — par balayage
dynamique des tables portant `employe_id` — toutes les lignes qui
appartiennent à ce salarié (pointages, notes de frais, etc.), **jamais**
celles des collègues. Testé implicitement via le même mécanisme que l'export
entreprise (balayage dynamique déjà éprouvé) ; pas de test pgTAP dédié à
l'isolation croisée sur cette fonction précise — `DECISION_REQUIRED` : à
ajouter avant mise en self-service.

## COMPANY EXPORT

`exporter_donnees_entreprise` (existant, inchangé) + nouveauté : la route
`/api/rgpd/export` construit désormais un **ZIP** (données JSON + fichiers
Storage réels + `manifeste.json` avec chemin, bucket, sha256, taille, et
statut absent/présent + `references-metier-storage.json` reliant chemins et
enregistrements métier). Testé manuellement (lecture de code + build), pas
d'appel réel contre un projet Supabase (aucun accès à un projet de
test dans cette mission). `DECISION_REQUIRED` : plafond de sécurité à 500 Mo
— au-delà, message d'erreur invitant à un export assisté (pas de job
asynchrone implémenté ; gap connu pour les très gros comptes).

## STORAGE EXPORT

Sujet traité en priorité comme demandé. `listerFichiersEntreprise` descend
récursivement dans les 12 buckets connus et reconnaît le dossier de
l'entreprise **à n'importe quelle profondeur** (découvert en testant :
`notes-frais-exports` utilise `companies/{entrepriseId}/exports/...`, pas
`{entrepriseId}/...` comme les autres buckets — un mapping statique aurait
été faux). Fichier absent entre le listing et le téléchargement : tracé
`absent: true` dans le manifeste, n'interrompt pas l'export. Testé (5 tests
Vitest : découverte multi-profondeur, étanchéité cross-tenant, suppression
complète, idempotence, couverture des 12 buckets).

## USER ERASURE

`anonymiser_employe` (existant, inchangé) : anonymise nom/prénom/coordonnées,
conserve les enregistrements légalement requis. Cohérent avec le nouveau
mécanisme (même heuristique par nom de colonne que la purge légale
entreprise). `AUTH` pour un salarié seul (hors fermeture d'entreprise) n'est
**pas traité** ici : `anonymiser_employe` ne touche pas à `auth.users`.
`DECISION_REQUIRED` : à traiter séparément si un salarié isolé (sans
fermeture d'entreprise) demande la suppression de son compte applicatif.

## COMPANY ERASURE

Cœur de la mission. État-machine à 7 états conforme à la demande : `requested
→ review → retention → purge_ready → purging → completed`, plus `blocked` en
circuit-breaker manuel à tout moment.

1. **`demander_suppression_entreprise`** (existant, étendu) : délai 30 jours.
2. **`avancer_purges_dues`** (cron) : `requested → review` une fois le délai
   écoulé.
3. **`confirmer_purge_entreprise`** (self-service, re-saisie du nom de
   l'entreprise, 2ᵉ confirmation forte) : `review → retention`, purge
   **immédiate** du régime opérationnel, calcul des échéances des régimes
   protégés.
   - Bug réel trouvé et corrigé en testant : `factures.client_id` référence
     `clients` en `on delete restrict` → un `DELETE` naïf sur `clients`
     aurait fait échouer **toute** la purge opérationnelle. Corrigé par un
     filet générique : toute table qui lève une violation de clé étrangère
     est **anonymisée** (heuristique par nom de colonne) au lieu d'être
     vidée, plutôt que de bloquer l'opération. Validé par scénario réel.
4. **`avancer_purges_pretes`** (cron) : recalcule les échéances à la volée
   (une validation légale tardive profite sans action de l'admin — 2ᵉ bug
   trouvé en testant : les échéances étaient figées à la confirmation,
   rendant une validation ultérieure sans effet ; corrigé en ancrant sur
   `retention_debutee_at` et en recalculant à chaque passage), puis
   `retention → purge_ready` si aucune réserve légale active et toutes les
   échéances (y compris celles, déléguées, du système notes de frais)
   atteintes.
5. **`executer_purge_legale_entreprise`** (cron/service_role) :
   `purge_ready → purging`, anonymise (sans supprimer les lignes ni les
   montants) les colonnes personnelles des régimes comptabilité/paie.
6. Couche applicative (cron) : purge Storage puis Auth (voir sections
   dédiées), journalisées.
7. **`marquer_purge_terminee_entreprise`** : `purging → completed`, écrit le
   tombstone, idempotent (rejouable sans erreur si déjà `completed`).

`DECISION_REQUIRED` (posée par défaut, la plus conservatrice) : la ligne
`entreprises` **n'est jamais supprimée physiquement**, seulement anonymisée à
terme — les factures/paiements gardent une clé étrangère valide pendant la
conservation légale. Alternative (export puis suppression totale) jugée plus
risquée juridiquement, écartée par défaut conformément à
`PROMPT_CODEX_RGPD.md`.

`DECISION_REQUIRED` : la confirmation reste **self-service** (l'admin de
l'entreprise confirme seul), sans validation humaine côté plateforme. Le
circuit `blocked` + les legal holds permettent une intervention manuelle si
nécessaire, mais rien ne l'impose par défaut.

## AUTH

`purgerAuthUtilisateursEntreprise` : détache les membres puis appelle
`supabase.auth.admin.deleteUser()` pour tout utilisateur qui n'a plus aucune
autre entreprise — ce qui révoque sessions et refresh tokens côté Supabase.
Idempotent (utilisateur déjà supprimé = no-op, pas une erreur). **Non
couvert** : invitations en attente sans compte `auth.users` créé, MFA (aucune
vérification spécifique — délégué à `deleteUser`, non testé séparément), et
le cas d'un salarié seul sans fermeture d'entreprise (voir USER ERASURE).
`DECISION_REQUIRED`/gap à combler avant self-service complet.

## RETENTION

Mécanique générique par régime (`politiques_retention_rgpd`), **aucune durée
inventée** : tous les régimes protégés démarrent `legal_review_required =
true`, `duree_conservation_mois = null` — la purge finale de ces données
reste **bloquée indéfiniment** tant qu'un opérateur plateforme n'a pas appelé
`valider_regime_retention_rgpd(cle, duree_mois)` (fonction `service_role`
uniquement, jamais appelable par un client). C'est le principal frein actuel
au self-service complet, et c'est volontaire. Les notes de frais archivées
utilisent leur système dédié existant (durée déjà configurable par
entreprise, défaut 10 ans **non revérifié indépendamment ici non plus**).

`LEGAL_REVIEW_REQUIRED` : durée de conservation comptable (facturation),
durée de conservation sociale (paie/pointages), durée de conservation des
journaux d'audit, durée de conservation des notes de frais (déjà en
production à 10 ans par défaut, à faire valider).

## AUDIT

`journal_purge_entreprise` : chaîné par empreinte sha256 (même principe que
`journal_audit_notes_frais` déjà en production), calculé côté SQL
(`pgcrypto.digest`, `search_path` élargi à `extensions` pour éviter un piège
de résolution de schéma découvert en testant). Contenu limité à
étape/compteurs/noms de table — **aucune IP ni user-agent** capturée (contrairement
à `journal_audit_notes_frais` qui, lui, les a) : gap volontaire (le contexte
HTTP n'est pas disponible depuis une fonction SQL ni depuis le cron), à
combler côté route applicative si le besoin de preuve renforcée se confirme.
`journal_activite` générique (existant) ne capture pas non plus IP/UA.

## STORAGE PURGE

`purgerStorageEntreprise` : réutilise `listerFichiersEntreprise`, supprime
par lots de 100 chemins. Testé : fichier normal (supprimé), fichier déjà
absent (silencieux, `remove()` ne renvoie pas d'erreur côté Supabase Storage
pour un chemin manquant), double purge (2ᵉ passage : 0 suppression, aucune
erreur). Erreur de listing capturée par bucket sans interrompre les autres
buckets. **Non testé en conditions réelles** (pas d'accès à un projet
Supabase dans cette mission) — testé uniquement via un faux client TypeScript
qui reproduit fidèlement le contrat `list()`/`remove()`.

## FAILURE RECOVERY

Le cron distingue `purge_ready` (encore à déclencher) de `purging` (déjà en
cours) : si la purge Storage ou Auth échoue après la purge légale SQL,
l'entreprise reste `purging` et est reprise **sans rejouer**
`executer_purge_legale_entreprise` (qui refuserait, n'étant plus
`purge_ready`) — seuls Storage/Auth/clôture sont retentés, tous trois
idempotents. `marquer_purge_terminee_entreprise` ne fait jamais passer à
`completed` avant l'appel explicite de la couche applicative, donc jamais de
clôture prématurée. Validé par scénario réel (double appel de clôture sans
erreur) mais **pas de simulation réelle d'un crash mi-Storage** (pas
d'environnement pour couper le worker à mi-course) — validé par lecture de
code + test de la propriété d'idempotence de chaque étape séparément.

## SECURITY

Cross-tenant testé (pgTAP + scénario manuel) : une entreprise ne peut ni lire
ni agir sur les fonctions d'une autre (`a_permission` systématique),
`exporter_donnees_utilisateur` n'autorise que `auth.uid() = p_utilisateur_id`.
Fonctions de purge/clôture/validation réservées à `service_role`, jamais
exposées à `authenticated`/`anon`. Colonnes sensibles (mots de passe,
secrets, tokens) explicitement exclues des deux exports par le même
mécanisme que l'export existant.

## TESTS

- **pgTAP** : `supabase/tests/rgpd_purge_entreprise.test.sql`, 24 assertions,
  **exécutées réellement** (Postgres 16 local + pgtap, rejeu complet des 179
  migrations) : 24/24 vertes.
- **Scénario fonctionnel complet** (hors dépôt, script de validation) :
  cross-tenant, confirmation prématurée refusée, confirmation réussie,
  anonymisation sur conflit FK, blocage par legal hold puis levée, recalcul
  d'échéance après validation tardive, transition `purge_ready`, purge
  légale (anonymisation sans suppression de ligne), clôture idempotente,
  chaîne d'audit vérifiée, étanchéité totale d'une 2ᵉ entreprise témoin.
  Deux bugs réels trouvés et corrigés grâce à ce scénario (voir COMPANY
  ERASURE).
- **Vitest** : `src/lib/rgpd/storage.test.ts`, 5 tests (multi-profondeur,
  cross-tenant, suppression complète, idempotence, couverture des buckets).
- **`npm run verify`** (typecheck, lint, tests — 109/109 tous fichiers
  confondus —, `verify:migrations`, `verify:secrets`, `build`) : **passe
  intégralement**.
- Non fait : `supabase test db` (CLI officielle, nécessite Docker,
  indisponible dans cet environnement) — remplacé par un rejeu manuel
  équivalent contre un Postgres local avec un stub du schéma Supabase.

## LEGAL REVIEW REQUIRED (récapitulatif)

1. Durée de conservation comptable (factures/paiements) — actuellement
   bloquante par défaut.
2. Durée de conservation sociale (paie/pointages) — actuellement bloquante
   par défaut.
3. Durée de conservation des journaux d'audit — actuellement bloquante par
   défaut.
4. Durée de conservation des notes de frais archivées (10 ans par défaut,
   déjà en production, jamais revérifiée indépendamment).
5. Stratégie de rédaction du contenu binaire retenu (PDF de bulletins de
   paie, justificatifs) : aucune anonymisation de fichier n'est faite ; seul
   le nom de fichier est nettoyé si personnel.
6. Choix entre confirmation self-service (retenu par défaut) et validation
   plateforme obligatoire avant purge finale.
7. Portée exacte de l'auto-service pour un salarié isolé (hors fermeture
   d'entreprise) sur son propre compte Auth.

## Verdict

**`RGPD PILOT READY`**

La mécanique technique complète — export (personnel et entreprise, avec
Storage), suppression en 7 états, anonymisation légale, purge Storage, purge
Auth, tombstone, audit chaîné — est implémentée, testée (pgTAP réel +
scénario fonctionnel réel + Vitest), idempotente et cloisonnée par
entreprise. Elle n'est pas encore `RGPD SELF-SERVICE CANDIDATE` parce que la
purge finale des données comptables/sociales/audit reste **volontairement
bloquée** tant qu'un opérateur n'a pas validé de vraies durées légales
(`valider_regime_retention_rgpd`), et parce que plusieurs zones (auth d'un
salarié isolé, invitations en attente, contenu binaire retenu, très gros
comptes) restent des gaps documentés plutôt que résolus. Ce n'est pas une
conclusion juridique.
