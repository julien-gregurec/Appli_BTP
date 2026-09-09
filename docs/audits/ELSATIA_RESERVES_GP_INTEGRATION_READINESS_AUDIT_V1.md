# ELSATIA-RESERVES-GP-INTEGRATION-READINESS-AUDIT-V1

Audit de préparation structurelle — **lecture seule**. Aucune ligne de code modifiée, aucune
migration créée, aucune action sur Production. ELSATIA Réserves n'est pas développée ici :
seule est évaluée la capacité de Gestion Pro et du socle multi-app à l'accueillir plus tard
sans refonte.

---

## 1. Repo / branche / SHA

| | |
|---|---|
| Dépôt | `elsatia-main` (dépôt canonique, propriétaire du schéma multi-app) |
| Branche | `feature/tools-production-workflow` |
| SHA audité | `7b18d9b10b7e820e1d68ddb196d80b9e12cb4e71` |
| Migrations | 263 fichiers, de `20260710000001_comptes_entreprises.sql` à `20260905000265_essai_30_jours_modules_catalogue_v1.sql` |
| Applications présentes | `apps/colors` (port 3010), `apps/tools` (port 3020), Gestion Pro à la racine (port 3000) |
| Paquet partagé | `packages/application-access` (`@elsatia/application-access`) |

Le worktree contient des fichiers non suivis (documents d'audit, moteur géométrique Tools).
Aucun d'eux n'a été modifié ni lu comme source d'autorité pour cet audit.

---

## 2. Multi-app core — **PRÊT**

Le socle est en place et **déjà éprouvé deux fois** : Colors (migration `…234`, 2026-08-26)
puis Tools (migration `…236`, 2026-08-30).

Tables (`supabase/migrations/20260826000234_elsatia_multi_app_convergence_v1.sql`) :

| Table | Rôle |
|---|---|
| `applications_elsatia` | catalogue (`code` PK text, contrainte `^[a-z][a-z0-9_]{1,49}$`), `actif`, `ordre`, `url_locale/preview/production`, `icone`, `statut_produit` (`disponible`/`bientot`/`interne`) |
| `roles_applications_elsatia` | vocabulaire de rôles **propre à chaque application**, PK `(application_code, code)` |
| `acces_applications_entreprises` | droit d'usage de l'organisation, fenêtre `valide_du`/`valide_jusqu_au`, `source`, `reference_externe`, `metadata` |
| `habilitations_applications_utilisateurs` | habilitation individuelle, FK composite vers `utilisateurs_entreprises` (impossible d'habiliter un non-membre) |
| `historique_acces_applications` | journal append-only des activations/habilitations |
| `entitlements_utilisateurs_elsatia` | niveau `free`/`pro` **par utilisateur et par application**, `capabilities text[]`, `source`, `priorite`, fenêtre, `revoked_at` |
| `historique_entitlements_elsatia` | journal append-only des entitlements |

RPC canoniques : `a_acces_application(uuid,text)`, `applications_autorisees(uuid)`,
`contexte_application_courant()`, `tools_resoudre_entitlements()`,
`plateforme_activer_application_entreprise(...)`, `plateforme_habiliter_utilisateur_application(...)`.

Administration déjà livrée : `/plateforme/applications` et
`/plateforme/entreprises/[entrepriseId]/applications`. La documentation d'architecture précise
que ces écrans « ne contiennent aucune liste fermée d'applications et acceptent une application
future sans changement de composant »
(`docs/architecture/ELSATIA_GESTION_PRO_MULTI_APP_UI_V1.md`).

**Conséquence directe** : faire exister ELSATIA Réserves dans le socle = **deux `INSERT`**
(une ligne `applications_elsatia`, N lignes `roles_applications_elsatia`). Zéro DDL, zéro
modification de Gestion Pro, zéro modification du paquet partagé — `CodeApplicationElsatia`
est typé `string` avec validation par regex, pas par union fermée
(`packages/application-access/src/index.ts`).

---

## 3. IDs entreprise — **VERT**

`entreprises.id uuid primary key default gen_random_uuid()`. Stable, opaque, non dérivé.
Toutes les tables métier portent `entreprise_id` avec des FK composites `(id, entreprise_id)`
généralisées — motif d'isolation multi-tenant appliqué de façon homogène.

**Ne jamais utiliser comme clé d'intégration** :
- `entreprises.reference_interne` — texte généré par `next_reference()` / `compteurs_reference`, unique mais sémantique ;
- `entreprises.siret`, `code_entreprise`, `codes_acces.code` — données humaines/mutables/révocables.

---

## 4. IDs chantier — **VERT** (référencement) / **ORANGE** (cycle de vie)

`chantiers.id uuid primary key default gen_random_uuid()`, plus l'index unique
`chantiers_id_entreprise_unique (id, entreprise_id)` (`…20_synchro_statuts.sql`), déjà
consommé comme cible de FK composite par une dizaine de modules.

**Mauvaise clé d'intégration** : `chantiers.reference_interne` (`CHA-2026-001`) — *nullable*,
généré par trigger **uniquement si NULL**, donc modifiable à la main, et rythmé par un compteur
annuel. Numéro humain, jamais une clé.

Point d'attention (non bloquant) : `chantiers.entreprise_id … on delete cascade`, et les
modules dépendants cascadent depuis `chantiers`. Une application externe qui référencerait
`chantier_id` en dur perdrait sa cible sans notification. Réserves doit donc **projeter** le
chantier (snapshot `chantier_source_id` + libellé + adresse) plutôt que de lire GP en jointure.

---

## 5. IDs utilisateurs — **VERT** (avec une réserve)

`utilisateurs.id` = `auth.users.id`. Identité unique pour toute la suite ; le contrat interdit
explicitement un second système d'authentification
(`docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`).

Deux faits importants pour Réserves :

1. **Un compte ELSATIA peut exister sans entreprise.** Tools l'a établi : « Aucun paiement,
   aucun droit accordé automatiquement et aucune dépendance à une entreprise »
   (`…236_elsatia_tools_r8`), avec `tools_projects.organization_id` nullable et des
   entitlements portés par l'utilisateur. C'est **le précédent exact** du compte invité gratuit.
2. **`utilisateurs.id` cascade depuis `auth.users`.** Un historique append-only qui référencerait
   l'auteur en `not null` serait détruit par une suppression RGPD. Le motif correct existe déjà
   dans GP : `comptes_rendus_chantier.auteur_id … on delete set null`, à compléter d'un libellé
   d'auteur dénormalisé.

Réserve : **`employes.id` ≠ `utilisateurs.id`**. La messagerie GP est indexée sur `employes`
(`messages_internes.auteur_employe_id`), pas sur l'identité ELSATIA. Ce modèle n'est **pas**
réutilisable pour Réserves, qui doit s'ancrer sur `auth.uid()`.

---

## 6. Plans — **ORANGE**

Existant : un plan est une ligne `documents_chantier` avec `categorie = 'plan'`, dans le bucket
privé `chantier-documents`, `storage_path text unique`, `mime_type`, `taille_octets`, colonne
`audience`, FK composite `(chantier_id, entreprise_id)`.

Référencer un plan depuis une app externe par `documents_chantier.id` (uuid) est **possible et
stable tant que la ligne vit**. En revanche, **rien dans les 263 migrations ne fournit** :

- de **version** ni de chaîne de versions (seul `versions_documents_notes_frais` existe, hors périmètre) ;
- d'**empreinte de contenu** (pas de hash) — remplacer le fichier casse silencieusement toute coordonnée ;
- de **métadonnée géométrique** : ni largeur/hauteur, ni page PDF, ni DPI, ni échelle, ni rotation ;
- de **hiérarchie bâtiment / niveau / zone** : aucune table de ce type n'existe (`zones_depot`
  concerne le dépôt, `colors_emplacements` le stock ; aucun rapport).

`on delete cascade` depuis `chantiers` supprime le plan sans trace.

**Verdict** : les contrats existants **permettent de référencer un plan**, mais ne permettent pas
de **garantir l'immuabilité géométrique** nécessaire au positionnement d'une réserve. Le
comblement appartient à Réserves (table `reserves_plans` : `document_source_id`, `storage_path`,
hash, dimensions, version), **pas à Gestion Pro**. Aucune modification GP requise.

---

## 7. Fichiers / photos — **ORANGE** (duplication assumée, pas de blocage)

Il n'existe **aucun contrat de fichier générique réutilisable**. Chaque domaine a sa table :
`documents_chantier`, `pieces_jointes_messages`, `pieces_jointes_devis`, `documents_notes_frais`,
`fiches_techniques_articles`, `colors_nettoyages_photos`, `bulletins_paie`…

Mais le **motif est homogène et copiable tel quel** :

- bucket privé dédié, `file_size_limit` + `allowed_mime_types` déclarés côté `storage.buckets` ;
- table applicative : `entreprise_id`, `storage_path text not null unique`, `mime_type`,
  `taille_octets` borné, FK composite tenant ;
- RLS `storage.objects` : premier segment du chemin = `entreprise_id`, contrôlé par
  `est_membre_actif(((storage.foldername(name))[1])::uuid)` ;
- lecture : **jamais d'URL publique** — route API serveur qui revérifie l'appartenance puis
  `createSignedUrl` à TTL court (60 s à 900 s selon la sensibilité). Onze occurrences
  cohérentes dans `src/app/api/**` et `src/app/(app)/**`.

Un seul bucket public : `entreprise-assets` (logos), volontaire.

Provenance/ownership : partielle. `documents_chantier` ne porte pas d'auteur ; d'autres tables si.
Réserves, qui aura beaucoup de photos et une exigence de preuve, devra porter auteur + horodatage
+ appareil **dans sa propre table**.

---

## 8. Événements — **À CRÉER POST-LAUNCH**

Aucune table d'événements de domaine, aucun outbox, aucun bus, aucun webhook interne
inter-applications. Aucun des sept événements cibles (`reserve.created`, `reserve.assigned`,
`reserve.responsibility_accepted`, `reserve.responsibility_refused`, `reserve.lift_requested`,
`reserve.lift_approved`, `reserve.lift_rejected`) n'a d'infrastructure d'accueil.

Ce qui existe et sert de modèle :

- **idempotence prouvée** : `tools_monetization_events` avec `unique (provider, environment, external_event_id)`, `status in ('processing','processed','ignored','failed')`, `before_state`/`after_state` ;
- **journaux append-only** : `historique_acces_applications`, `historique_entitlements_elsatia`, `journal_ia`, `journal_abus_securite`, `journal_audit_notes_frais` ;
- webhooks externes uniquement (Stripe, notifications push).

Rien à défaire : le manque est **purement additif**. C'est la raison pour laquelle ce domaine
n'est pas classé rouge.

---

## 9. Messagerie — **séparation possible, modèle non réutilisable**

`conversations_internes` / `messages_internes` : strictement mono-entreprise, `type in
('directe','chantier')`, auteur = `employes.id`, contenu 1–5000 caractères, pièces jointes via
`pieces_jointes_messages`. **Aucun statut métier de GP n'est dérivé d'un message** — la
séparation « message = discussion, action = état » est déjà respectée aujourd'hui dans GP.

En revanche ce modèle **ne peut pas** porter la messagerie Réserves : pas de participant externe
possible (FK vers `employes` du tenant), pas de rattachement à un objet arbitraire. Réserves
définira ses propres fils, et devra maintenir la même discipline : la demande de levée et la
validation finale sont **deux actions/événements distincts**, jamais des messages interprétés.

---

## 10. Permissions — **ORANGE**

RBAC actuel de Gestion Pro :

- `postes` → `permissions_poste(entreprise_id, poste_id, cle_permission, autorise)` → `a_permission(entreprise_id, cle)` ; **88 clés** de permission déclarées dans `permissions_disponibles` ;
- appartenance : `est_membre_actif(entreprise_id)` (`utilisateurs_entreprises.statut='actif'`) ;
- gouvernance : `peut_gerer_acces`, `est_plateforme_admin()`, `est_acces_support_actif()` ;
- porte de module : `modules_gestion_pro` / `modules_entreprises` (catalogue avec `offline_requis`, `donnees_persistantes`, `mode_apres_desactivation`) ;
- rôles applicatifs : `roles_applications_elsatia`, **explicitement non hérités** (« Un administrateur Gestion Pro n'obtient aucun rôle Colors par héritage »).

Correspondance avec les rôles Réserves attendus :

| Rôle Réserves | Existe côté GP ? |
|---|---|
| admin entreprise | oui — `peut_gerer_acces` + rôle applicatif dédié |
| gestionnaire réserve | non, mais trivial : nouveau `role_code` dans `roles_applications_elsatia` |
| créateur | non — notion **par objet**, absente du RBAC GP |
| lecteur | non, mais trivial (nouveau rôle applicatif, cf. `colors_consultation`) |
| entreprise assignée | **non — gap structurel** |
| intervenant externe | **non — gap structurel** |

**Les deux gaps réels** :

1. **Aucune permission par objet.** Tout le RBAC est *par tenant* (`a_permission(entreprise, clé)`).
   « Cette réserve-ci m'est assignée » n'a aucun équivalent.
2. **Aucun accès inter-entreprises.** Chaque policy exige `est_membre_actif(entreprise_id)` :
   il est aujourd'hui *impossible* qu'un utilisateur de l'entreprise B voie une donnée de
   l'entreprise A. Aucune primitive de partage, de délégation ou de jeton d'invitation n'existe.

Ces deux gaps se comblent **dans le schéma de Réserves** (`reserves_*` avec ses propres policies),
exactement comme Colors a défini ses rôles sans toucher au RBAC de GP. **Aucune modification du
RBAC de Gestion Pro n'est nécessaire** — et surtout, aucune ne serait souhaitable : élargir
`est_membre_actif` serait une régression de sécurité.

Ambiguïté à trancher plus tard : « entreprise responsable » aura **deux représentations
possibles** — soit un `fournisseurs.type_tiers='sous_traitant'` (tiers interne au tenant, déjà
présent, migration `…111_sous_traitants.sql`, avec `sous_traitants_chantiers`), soit une vraie
`entreprises` ELSATIA disposant d'un compte invité. Réserves devra porter le mapping entre les
deux ; GP n'a rien à changer pour cela.

---

## 11. Offline futur — **PRÊT (précédent existant)**

Gestion Pro : `public/sw.js`, `manifest.ts`, page `/offline`, notifications push
(`push_abonnements`, `preferences_notifications_push`), module `chantier` déclaré
`offline_requis = true` au catalogue.

Surtout, **Tools fournit un contrat de synchronisation local-first déjà en production**
(`tools_projects`, `tools_sync_project`) :

- `local_id text` généré côté client (`^[a-zA-Z0-9-]{16,80}$`) + `unique (user_id, organization_id, local_id)` ;
- `revision bigint` + paramètre `p_expected_revision` → **concurrence optimiste**, détection de conflit ;
- `cloud_updated_at` indexé → **pull incrémental** ;
- `device_id`, `deleted_at` → **soft delete** et traçabilité d'appareil ;
- `schema_version integer` → migration de payload côté client.

Le modèle d'identifiants supporte l'offline : les uuid v4 générés côté client sont compatibles.
**Contre-exemple à éviter** : `next_reference()` / `compteurs_reference` est un compteur **SQL
serveur** ; un numéro de réserve produit par ce mécanisme serait incompatible avec la création
hors ligne. Les photos différées relèvent du même motif que le sync de projets, avec en plus une
file d'upload — non couverte aujourd'hui, mais additive.

---

## 12. Faut-il modifier Gestion Pro avant commercialisation ?

### **AUCUNE MODIFICATION**

Justification :

1. Enregistrer une application supplémentaire = **deux `INSERT`**, aucune DDL, aucun composant à modifier (les écrans plateforme sont dynamiques par construction).
2. Réserves possède ses propres tables `reserves_*`, comme `colors_*` et `tools_*`. Le précédent Colors montre un couplage **nul** aux tables métier de GP : `colors_*` ne référence que `entreprises` et `utilisateurs`, et l'app n'appelle que deux RPC (`a_acces_application`, `contexte_application_courant`).
3. Gestion Pro n'a **pas besoin de connaître Réserves** pour être commercialisé. Les compteurs de réserves, statuts et lien de rebond côté GP sont des ajouts strictement additifs, post-launch.
4. Tout ce qui manque (événements, permissions par objet, versionnement de plan, compte invité) manque **de façon additive** : il n'y a rien à défaire, rien à migrer, aucune donnée à réécrire.

La seule préparation utile avant commercialisation est **documentaire** : figer un contrat
« future-app » (§14 de la commande). Elle ne produit ni code, ni migration.

---

## 13. Risque de refactor futur

| Domaine | Classement | Motif |
|---|---|---|
| Identité | **VERT** | `auth.users` unique, `utilisateurs.id` stable, compte sans entreprise déjà prouvé par Tools |
| Chantier | **VERT** | uuid PK + `(id, entreprise_id)` unique ; seul `reference_interne` est piégeux, et il est identifié |
| Entreprises | **ORANGE** | l'entreprise propriétaire est VERT ; l'« entreprise responsable » aura deux représentations concurrentes (`fournisseurs.type_tiers='sous_traitant'` vs `entreprises` invitée) → mapping à définir dans Réserves |
| Plans | **ORANGE** | référençables, mais sans version, sans hash, sans géométrie, sans hiérarchie bâtiment/niveau/zone ; cascade de suppression silencieuse |
| Fichiers | **ORANGE** | motif solide et homogène, mais aucun contrat générique → duplication d'un 9ᵉ système de stockage |
| Permissions | **ORANGE** | aucune permission par objet, aucun accès inter-entreprises ; à construire **dans Réserves**, jamais en élargissant le RBAC GP |
| Événements | **ORANGE** | inexistants ; purement additif, motif d'idempotence déjà disponible |

**Aucun domaine en ROUGE. Aucun blocage structurel.**

---

## 14. Integration Core readiness

Il n'existe **pas d'« Integration Core » en tant que service**. Le socle d'intégration réel est :

> **base Postgres partagée + RLS + RPC `SECURITY DEFINER` + `@elsatia/application-access`**

Le schéma `Gestion Pro ↔ Integration Core ↔ Réserves` est donc **possible aujourd'hui sans
refonte**, avec un périmètre précis :

| Flux | État |
|---|---|
| Identité, contexte de session, entreprise active | **PRÊT** (`contexte_application_courant()`) |
| Droit d'usage entreprise + habilitation utilisateur | **PRÊT** (`a_acces_application`) |
| Niveau free/pro par utilisateur (compte invité) | **PRÊT** (`entitlements_utilisateurs_elsatia`) |
| Sélecteur d'applications et rebond inter-apps | **PRÊT** (`applications_autorisees`, URLs par environnement) |
| Administration des accès | **PRÊT** (`/plateforme/applications`) |
| Lecture des **données métier** de GP par une app sœur (chantiers, plans, contacts, entreprises tierces) | **PARTIEL** — aucune RPC ni vue de projection n'est exposée ; un membre actif y accède par RLS, un invité **non** |
| Retour de compteurs/statuts vers GP | **À CRÉER POST-LAUNCH** |
| Événements de domaine | **À CRÉER POST-LAUNCH** |
| SSO silencieux entre domaines | **PARTIEL** — « la V1 partage les identifiants mais pas les cookies entre domaines ; le SSO silencieux reste un lot séparé » |

La bonne forme du flux descendant est une **projection explicite** (RPC de lecture bornée,
consommée par Réserves qui en garde un instantané), jamais une jointure table-à-table. C'est ce
que la trajectoire Colors/Tools valide déjà.

---

## 15. Gaps

1. Aucune RPC/vue de projection exposant chantier, plans, contacts et tiers à une application sœur.
2. Aucun mécanisme d'accès inter-entreprises : tout est `est_membre_actif(entreprise_id)`.
3. Aucune permission par objet (pas de « cette réserve m'est assignée »).
4. Aucun versionnement ni empreinte de contenu sur `documents_chantier` ; aucune métadonnée géométrique de plan.
5. Aucune hiérarchie bâtiment / niveau / zone / local.
6. Aucun contrat de fichier générique réutilisable (motif homogène, mais dupliqué à chaque module).
7. Aucun bus/outbox d'événements de domaine.
8. Aucun modèle de participation externe en messagerie (`messages_internes` est ancré sur `employes`).
9. Deux représentations concurrentes possibles de l'« entreprise responsable » (sous-traitant tenant vs entreprise ELSATIA invitée).
10. SSO inter-domaines non silencieux (friction UX pour l'invité, sans conséquence structurelle).
11. `next_reference()` (compteur SQL) incompatible avec une création hors ligne — ne pas l'employer côté Réserves.

**Aucun de ces gaps n'exige de modifier Gestion Pro.** Les points 1, 4, 5, 6, 7, 8 se comblent
dans le schéma de Réserves ou par ajout additif ; les points 2 et 3 ne doivent surtout pas être
comblés en élargissant le RBAC de GP.

---

## 16. Modifications de Gestion Pro nécessaires avant commercialisation

**AUCUNE.**

---

## 17. Migrations nécessaires avant commercialisation

**AUCUNE.** Aucune migration n'a été créée par cet audit.

---

## 18. Risque de refactor futur (synthèse)

Faible et borné. Sept domaines audités : **2 VERT, 5 ORANGE, 0 ROUGE**. Tous les points orange
sont des **manques additifs** (quelque chose à écrire plus tard), jamais des **erreurs de
modélisation à défaire** (quelque chose à réécrire). Le risque de refonte majeure de Gestion Pro
imposé par l'arrivée de Réserves est **structurellement écarté** par trois faits : identifiants
uuid opaques et stables, isolation multi-tenant homogène par FK composite, et un socle multi-app
dont l'extension se fait par données et non par schéma.

Le seul risque réel n'est pas technique mais **disciplinaire** : si Réserves lit les tables de
GP en jointure directe plutôt que par projection, le couplage fragile que la commande veut
éviter apparaîtra — non par défaut du socle, mais par renoncement au contrat.

---

## 19. Recommandations post-launch

Par ordre de dépendance :

1. **Écrire le contrat future-app** (`ELSATIA_RESERVES_INTEGRATION_CONTRACT_V1`) avant toute ligne de code : codes d'application, rôles, projections autorisées, événements, règle « pas de jointure table-à-table ». C'est la seule chose à faire avant la commercialisation, et elle est documentaire.
2. **Enregistrer l'application** : `INSERT` dans `applications_elsatia` (`reserves`, `statut_produit='bientot'` tant qu'elle n'est pas livrable) et ses `roles_applications_elsatia`.
3. **Concevoir le modèle d'invité** sur le précédent Tools : compte ELSATIA sans entreprise + `entitlements_utilisateurs_elsatia(application_code='reserves', niveau='free')`, jamais un second système d'authentification.
4. **Définir la projection descendante** : une RPC `SECURITY DEFINER` bornée exposant chantier/plans/tiers à Réserves, et un instantané côté Réserves (`chantier_source_id`, libellés dénormalisés).
5. **Construire les tables `reserves_*`** avec leurs propres policies : hiérarchie bâtiment/niveau/zone, plan versionné (hash + dimensions), réserve, historique append-only, `photo_obligatoire_pour_levee boolean` **par réserve**, assignation, fils de discussion.
6. **Séparer strictement** demande de levée et validation finale : deux actions, deux événements, deux traces — jamais un message interprété.
7. **Créer le socle d'événements** (`reserve.*`) en reprenant le motif d'idempotence de `tools_monetization_events`.
8. **Ajouter le retour vers GP** (compteurs, statuts agrégés, lien de rebond) — additif, sans FK inverse.
9. **Aligner l'offline** sur le contrat `tools_sync_project` : `local_id` client, `revision` + `expected_revision`, `cloud_updated_at`, `deleted_at`, `device_id`, plus une file d'upload photo.
10. **Traiter le SSO silencieux** comme lot séparé, quand la friction invité le justifiera.

---

## 20. Code modifié

**NON.**

## 21. Migration créée

**NON.**

## 22. Production touchée

**NON.** Aucune connexion, aucune lecture, aucune écriture sur l'environnement de Production.

---

## 23. Verdict

Le socle multi-app est réel, documenté, testé et **déjà réutilisé deux fois** sans refonte de
Gestion Pro. Les identifiants sont stables et opaques. L'isolation multi-tenant est homogène.
L'extension à une application supplémentaire se fait par insertion de données. Les manques
identifiés — événements, permissions par objet, versionnement de plan, hiérarchie de localisation,
compte invité inter-entreprises — sont tous **additifs** et se logent **dans Réserves**, pas dans
Gestion Pro.

Gestion Pro peut être commercialisé tel quel, sans aucune modification ni migration préalable,
sans compromettre l'intégration future d'ELSATIA Réserves.

`ELSATIA-RESERVES-GP-INTEGRATION-READINESS-AUDIT-V1 VALIDÉ — GESTION PRO PRÊT POUR INTÉGRATION FUTURE RÉSERVES`
