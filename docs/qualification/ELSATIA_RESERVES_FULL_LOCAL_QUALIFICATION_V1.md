# ELSATIA RÉSERVES — FULL LOCAL QUALIFICATION V1

**Objet** — Appliquer à ELSATIA Réserves le niveau d'exigence de Colors
(`ELSATIA_COLORS_FULL_QUALIFICATION_V2.md`, verdict `COLORS LOCALLY QUALIFIED`) : Réserves
doit fonctionner **seule**, avec un **compte ELSATIA partagé**, avec **Gestion Pro**, et avec
des **entreprises invitées au compte gratuit**. Chaque chiffre de ce rapport a été produit
dans cette session, sur la branche ci-dessous.

| | |
|---|---|
| Branche de base | `origin/integration/elsatia-canonical-train-v1` @ `1c1fed66` (train canonique le plus récent contenant `apps/reserves`, verdict `CANONICAL TRAIN LOCALLY QUALIFIED`) |
| Fusion préalable | `origin/claude/quirky-franklin-mb6eth` @ `76d57833` (Colors V2 : correctif de suspension `20260923000330`, qui conditionne aussi l'accès Réserves) — commit `11f94c74` |
| Branche de travail | `claude/brave-pascal-agrr5v` |
| Migrations | **330** (train 328 + Colors `…330` + ce lot `20260926000347`), `verify:migrations` vert |
| Base | PostgreSQL 16 réel + pgTAP 1.3, train complet rejoué depuis zéro |
| Pile e2e | **réelle, sans Docker ni simulation** : GoTrue v2.196.0 compilé, PostgREST v12.2.3 (binaire officiel), **storage-api officiel** (supabase/storage, stockage fichier), proxy de chemins ; Réserves compilée (`next start`) ; Chromium 151 (Chrome for Testing, version attendue par Playwright 1.62.1) |

## 0. Verdict

**RESERVES LOCALLY QUALIFIED**

Tout le périmètre exécutable sans infrastructure hébergée est prouvé : **640 assertions
pgTAP Réserves** (dont une nouvelle suite de 227 assertions couvrant le scénario métier
complet), **178 tests unitaires**, **73 tests Playwright** (dont 13 nouveaux) verts sur
**quatre passes consécutives** contre l'application compilée et une pile Supabase dont
**aucun service n'est simulé** — y compris Storage (la recette Colors V2 et le pilote V3
passaient par une passerelle ou une simulation). Build prouvé dans les deux sens.

La qualification a trouvé et corrigé **sept défauts produit réels**, dont trois de
cloisonnement / intégrité (§2). Chacun est prouvé **rouge sans correctif, vert avec**.

Ce n'est **pas** `RESERVES READY FOR PREVIEW` :

- aucune preuve n'a touché un projet Supabase hébergé ni Vercel (même limite que Colors) ;
- l'intégration Gestion Pro est prouvée côté Réserves (import, résumé, lien) mais **le bloc
  « réserves » de la fiche chantier Gestion Pro n'est pas câblé**, et la reprise des plans /
  contacts GP reste une décision ouverte (§10) ;
- une décision produit est ouverte sur le nombre de personnes d'une entreprise invitée (§6.3).

## 1. Tableau de bord

| # | Domaine | Statut | Preuve |
|---|---|---|---|
| 1 | auth | **PROVEN (local, GoTrue réel)** | connexion, lien profond, invitation, déconnexion ; session révoquée ailleurs → `/login` (e2e 12) |
| 2 | organisations | **PROVEN** | A hôte, B invitée (tenant propre), C cliente payante invitée ; aucune donnée d'une organisation chez l'autre (pgTAP §5, §12) |
| 3 | entitlements | **PROVEN** | accès gratuit né de l'invitation (source `reserves_invitation_gratuite`), abonnement payant jamais réécrit ni retiré (2.13–2.17, 11.27–11.28) |
| 4 | rôles | **PROVEN** | admin / responsable / émetteur / consultation / intervenant : matrice rejouée, émetteur ne valide pas, consultation ne crée pas (3.27, 5.29–5.30, 6.1) |
| 5 | RLS | **PROVEN (Postgres réel + PostgREST réel)** | 640 assertions sous `authenticated` réel ; e2e par les vraies portes REST/RPC |
| 6 | Storage | **PROVEN (storage-api réel)** | avant/après, propriété, URL signées émises / refusées / altérées / expirées, suppression et réécriture impossibles, anonyme refusé (pgTAP §8, e2e 4–5) |
| 7 | notifications | **PROVEN** | événements à chaque étape, in-app, préparation e-mail aux seuls habilités, idempotente (3.11–3.41, §13, e2e 3) ; **envoi SMTP réel non testé** |
| 8 | plans | **PROVEN** | plan PDF déclaré, déposé, confirmé ; fichier absent refusé ; intervenant ne voit que le plan de ses réserves (2.2–2.5, 5.4, 8.3) |
| 9 | photos | **PROVEN** | chemin composé par la base, confirmation contre le bucket, verrou après décision (3.5–3.32) |
| 10 | commentaires | **PROVEN** | hôte et intervenant, historisés, conversation partagée avec le seul porteur (3.8, 3.15, 5.8–5.9, e2e 3) |
| 11 | assignation | **PROVEN** | assignation, réassignation, dessaisissement notifié et effectif immédiatement (3.9–3.42) |
| 12 | accept / refuse | **PROVEN** | refus sans motif rejeté, motif historisé, hôte notifié (3.16–3.39) |
| 13 | levée | **PROVEN** | demande, refus avec motif, redemande, validation, réouverture (3.19–3.36, 7.19, e2e 7) |
| 14 | historique | **PROVEN (après correctifs D1, D5)** | append-only sous toutes les formes d'attaque ; ordre chronologique réel prouvé en e2e (§7) |
| 15 | PDF | **PROVEN (après D3)** | liste par entreprise, en-tête cloisonné, vrai PDF serveur (§9, e2e 8, recette V4 11/11) |
| 16 | intégration GP | **PARTIAL — côté Réserves PROVEN (après D4)** | import + métadonnées + resynchronisation + résumé + lien ; bloc fiche GP non câblé ; plans/contacts : décision (§10) |
| 17 | session / suspension | **PROVEN (après D2)** | 10 formes de retrait, toutes sans reconnexion (§11, e2e 9–12) |

## 2. Défauts trouvés et corrigés — migration `20260926000347_reserves_qualification_locale_v1.sql`

Aucune table, colonne ni policy créée ou supprimée : six fonctions redéfinies à signature
identique, deux fonctions internes et un trigger ajoutés. Preuve « avant » : base
reconstruite **sans** la migration (`rsv_sans`) ; « après » : base neuve avec (`rsv_final`).

| # | Gravité | Défaut | Preuve avant | Correctif | Preuve après |
|---|---|---|---|---|---|
| D1 | **Intégrité (P1)** | La garde de workflow honorait un drapeau de session (`elsatia.reserves_transition`) que **n'importe quel client SQL** peut poser : un utilisateur `authenticated` de l'hôte fait repasser une réserve **levée** à « assignée » et efface `levee_at`, **sans aucune ligne d'historique**. Non atteignable par PostgREST (pas de `set_config` exposé), mais la garantie d'immuabilité ne doit pas dépendre de la surface HTTP. | pgTAP 7.12 puis 7.18–7.20 rouges | drapeau honoré seulement si la mise à jour est exécutée par une fonction `SECURITY DEFINER` (`current_user` ≠ rôle d'API) | vert ; toutes les RPC métier inchangées |
| D2 | **Cloisonnement (P1)** | L'accès **gratuit** d'une entreprise invitée **survivait à la suspension de l'hôte** : A suspendue pour impayé ne voyait plus rien, mais B continuait de lire et d'écrire dans les réserves de A. L'accès gratuit n'existe que parce que l'hôte paie. | pgTAP 11.3, 11.4, 11.11 ; **e2e 9 rouge** | `reserves_hote_actif()` (tenant actif, suspension non échue, droit Réserves valide) exigé par `reserves_intervenant_courant()` — donc par toute RLS, RPC, Storage et export côté invité | vert, sans reconnexion |
| D3 | Cloisonnement (P2) | L'en-tête du PDF d'une entreprise invitée comptait **toutes** les réserves du chantier (total, ouvertes, levées, en retard), y compris internes et d'autres corps d'état. | pgTAP 9.7 ; **e2e 8 rouge** (compteur « au chantier » ≠ 1) | compteurs sous le même prédicat que la liste | vert |
| D4 | Fonctionnel GP (P2) | L'import d'un chantier Gestion Pro ne reprenait que le nom ; adresse, CP, ville vides dans Réserves et dans les PDF (le contrat les listait « à faire »). | pgTAP 10.2 | repris à l'import et à chaque resynchronisation, bornés aux contraintes | vert ; e2e 13 |
| D5 | Traçabilité (P2) | Les transitions jouées par l'intervenant (acceptation, refus, demande de levée) étaient historisées avec `auteur_entreprise_id` **nul** : l'historique exporté ne disait pas quelle entreprise avait agi. | pgTAP 11.23 | organisation porteuse au moment du geste | vert ; e2e 7 (« CARRELAGE LIBRE SARL ») |
| D6 | **Cloisonnement / traçabilité (P1)** | Défaut **connu depuis la V6** (`test.fixme`, SQL proposé jamais numéroté) : un `PATCH` PostgREST de l'hôte sur `reserves_intervenants.entreprise_intervenante_id` **dessaisissait** l'entreprise porteuse sans révocation tracée ; un `POST` créait une intervention déjà « active » pour une organisation qui n'avait rien accepté. | pgTAP 5.32–5.34 (et 17 échecs en cascade : B perd tout) ; e2e V6 `fixme` | trigger `reserves_intervenants_garde_rattachement` : rôles d'API limités aux champs descriptifs, rattachement réservé aux actions métier (aucune fonction modifiée) | vert ; `fixme` V6 **devenu test actif** et vert |
| D7 | Annuaire (P2) | Jokers `%`/`_` non échappés : « `%%%` » franchissait la borne des trois caractères et rendait **toutes** les organisations publiées. Le test V6 existant passait uniquement parce que son décor ne publie personne. | pgTAP 2.18 | motif échappé (`escape '\'`) | vert ; 2.19 (vraie recherche) vert |

### Autres corrections (tests et outillage, sans effet produit)

| Objet | Constat | Correction |
|---|---|---|
| `colors_suspension_application_v16` test 61 | Après fusion Colors V2 sur le train, `…332` retire l'UPDATE de colonne : refus **42501** au lieu d'un filtrage à 0 ligne (garantie plus forte). | assertion alignée (`throws_ok 42501`), état revérifié ensuite |
| e2e V3 | `.first()` révoquait « Menuiserie C » au lieu de B (É trié après M) | bouton ciblé sur la carte de B |
| e2e V6 « un intervenant ne valide pas sa propre levée » | dépendait de l'ordre d'exécution des specs (B rattachée par une autre spec) | condition d'entrée établie par le test, comme en V5 |
| e2e V5 « réserve saisie hors ligne » | la coquille présélectionne le premier chantier en cache ; avec le chantier Gestion Pro repris par la nouvelle recette, la réserve partait sur un autre chantier (vert seul, rouge en suite complète) | le test désigne son chantier |
| `recette-reserves-v4.sh` | n'acceptait qu'un conteneur Docker | accepte aussi `RESERVES_DB_URL` (base locale 127.0.0.1) |
| Échec e2e V5 « rechargement hors ligne » sur Chromium 141 | écart de version navigateur (Playwright 1.62 attend Chromium 151) ; vert sur Chromium 151 | pile e2e sur Chrome for Testing 151 |

## 3. Scénario métier complet

Acteurs réels (identités `@invalid.local`) :

| Rôle mission | Identité | Rôle Réserves |
|---|---|---|
| Entreprise A | `a000…01` (utilise aussi Gestion Pro) | hôte, abonnement Réserves |
| Responsable réserves | `conducteur-a` | `reserves_responsable` |
| (émetteur) | `ouvrier-a` | `reserves_emetteur` |
| Entreprise B invitée | pgTAP : `b000…01` ; e2e : « QUALIF_Carrelage Libre » `c800…01` | aucun accès avant l'invitation |
| Intervenant B | pgTAP : `chef-equipe-b` ; e2e : `intervenant-libre` | `reserves_intervenant` (gratuit) |
| (compte partagé) | Entreprise C `c700…01`, `admin-c` | admin Réserves chez elle **et** intervenante chez A |

Déroulé prouvé (pgTAP §2–§3, e2e 1–7) — chaque étape jouée sous l'identité de son acteur,
avec les refus attendus des autres :

création chantier → plan (PDF déposé + confirmé) → création réserve (écran) → photo
« avant » → commentaire → localisation plan (x/y normalisés, page) → assignation B →
notification (événement, in-app, e-mail préparé) → acceptation → refus justifié (réserve 2)
→ réassignation à C (B dessaisie et notifiée) → travaux terminés → demande de levée refusée
sans photo → photo « après » déposée dans le **vrai** Storage → demande acceptée → refus de
levée motivé → redemande → validation → historique complet, ordonné, signé.

## 4. Photo obligatoire, réserve par réserve

| Assertion | Test |
|---|---|
| aucun réglage global (ni chantier, ni aucune autre table) | pgTAP 4.1, 4.2 |
| deux réserves du même chantier et de la même entreprise, deux exigences | 4.3 |
| réserve sans exigence : levée sans photo | 4.5, 3.44 |
| l'intervenant ne peut pas désactiver l'exigence | 4.6 |
| l'émetteur peut l'activer après coup, effet immédiat | 4.7, 4.8 |
| une photo de **constat** ne vaut pas preuve de travaux | 4.9 |
| photo déclarée mais jamais déposée : refus | 3.20, 3.21 |
| à l'écran : bouton désactivé tant que la photo « après » manque | e2e 4 |

## 5. Cross-tenant

B (et C) n'ont jamais lu ni modifié une réserve non assignée — par la table, par
identifiant exact, par RPC (commenter, accepter, lever, photo, confirmer, supprimer), par
les exports (liste, photos, historique, entreprises), par les conversations, par les repères
de plan, par Storage, par les écrans (liste et URL directe) : pgTAP 5.1–5.35, 8.1–8.11,
9.7–9.9, 12.7–12.8 ; e2e 3, 5, 8 ; recette V6 (A↔B sans lien) 23/23.
Une réserve **retirée** à B disparaît immédiatement, historique compris (3.42, 5.7).
Aucun droit n'est déduit de Gestion Pro : un dirigeant GP de A sans rôle Réserves ne voit
rien (5.28), l'administrateur GP de B non plus (5.24).

## 6. Intervenant gratuit

### 6.1 Ce qu'il peut faire (prouvé)

voir ses réserves, commenter, accepter / refuser, joindre des photos, demander la levée,
exporter **ses** réserves (pgTAP §3, 6.18 ; e2e 3–4, 8).

### 6.2 Ce qu'il ne peut pas faire (prouvé, écran **et** API)

créer un chantier (chez lui ou chez l'hôte), émettre une réserve, déposer un plan, valider
sa levée, annuler, réassigner, transférer, inviter, gérer les membres ou les paramètres,
s'auto-promouvoir (RPC Réserves ou plateforme), convertir son accès gratuit en abonnement,
réécrire son habilitation, ouvrir une autre application ELSATIA (Colors, Tools, Gestion
Pro) : pgTAP 6.1–6.17 ; e2e 6 (6 écrans redirigés, 4 RPC et 1 insertion refusées).

### 6.3 DECISION_REQUIRED:RESERVES-INVITED-SEATS

Une invitation ouvre Réserves à **une seule personne** de l'entreprise invitée : une fois
l'intervention active, aucun autre membre ne peut la rejoindre (5.25), et l'intervenant ne
peut habiliter personne (6.10). Choix conservateur retenu : **ne rien ouvrir** ; à trancher
par le propriétaire (p. ex. permettre à l'intervenant rattaché d'inviter des collègues de
son organisation au même rôle gratuit).

## 7. Historique immuable

Tentatives refusées, par l'intervenant **et** par l'administrateur de l'hôte : insertion,
modification, suppression, `truncate`, réécriture d'auteur, suppression de la réserve ou du
chantier (cascade), transition d'état ou effacement d'horodatage hors action métier,
**pose manuelle du drapeau des RPC** (D1), modification de la matrice de transitions,
fausse notification, message réécrit, photo de constat requalifiée (pgTAP 7.1–7.16 ; e2e
V6 « historique ni réécrit ni effacé »). Après toutes les tentatives : historique et état
intacts (7.17–7.18) ; une réouverture légitime **s'ajoute** (7.19–7.21). Révoquer une
entreprise ne touche pas à ce qu'elle a signé (11.23). Ordre chronologique réel vérifié sur
transactions distinctes (e2e 7).

## 8. Storage (storage-api réel)

| Propriété | Preuve |
|---|---|
| buckets privés, aucune URL publique | pgTAP 8.13 ; e2e 5 (`object/public` refusé) |
| chemin imposé par la base (tenant/chantier/réserve/opaque) | 3.5 |
| photos avant (hôte) et après (intervenant) lisibles par le porteur | 8.1 ; e2e 5 (URL signée → JPEG) |
| aucune URL signée pour une photo non assignée | 8.2 ; e2e 5 |
| jeton d'URL signée altéré / expiré : refus | e2e 5 |
| dépôt dans le dossier d'une autre réserve ou sous préfixe forgé : refus | 8.4–8.6 ; e2e 5 |
| suppression et réécriture impossibles, pour tous | 8.7–8.9 ; e2e 5 (DELETE réel) |
| anonyme : refus | 8.12 ; e2e 5 |
| entreprise révoquée : plus aucun objet lisible | 11.22 |

## 9. PDF — liste des réserves par entreprise

Hôte : liste de B, de C, filtre « sans levées », nombre de photos, récapitulatif par
entreprise (pgTAP 9.1–9.6 ; e2e 8 ; recette V4 11/11). Intervenant : n'imprime que ses
réserves, en-tête compris (D3) ; C ne peut pas exporter la liste de B (9.9). PDF serveur réel
(`%PDF`, `application/pdf`) généré par Chromium à partir de la session de l'appelant.

## 10. Intégration Gestion Pro

| Point mission | Statut | Preuve |
|---|---|---|
| metadata chantier | **PROVEN** (après D4) : nom, adresse, CP, ville ; resynchronisation sans doublon ; double habilitation (Réserves + GP) revérifiée en base | pgTAP 10.1–10.6 ; e2e 13 via le **nouvel écran** « Reprendre un chantier Gestion Pro » |
| summary | **PROVEN** : total, ouvertes, en retard ; vide pour un utilisateur GP sans Réserves et pour l'invité | 10.7, 10.9–10.10 ; e2e 13 |
| status link | **PROVEN (donnée)** : `chantier_reserves_id` + URL du catalogue ; **non affiché** côté GP | 10.8 ; e2e 13 |
| plans | **NOT IMPLEMENTED** — `DECISION_REQUIRED:GP-PLANS-STORAGE` (bucket `chantier-documents` partagé ou copie dans `reserves-plans`), déjà ouverte par le contrat V1 |
| contacts / companies | **NOT IMPLEMENTED** — `DECISION_REQUIRED:GP-CONTACTS-TO-INTERVENANTS` (contrat V1) |
| bloc « réserves » sur la fiche chantier GP | **NOT WIRED** — lot côté Gestion Pro, hors périmètre Réserves |
| isolation | **PROVEN** : l'invité ne lit ni chantier ni client GP de l'hôte | 10.11–10.12 |

Contrat mis à jour : `docs/reserves/ELSATIA_RESERVES_GP_INTEGRATION_CONTRACT_V1.md`.

## 11. Session / suspension sans reconnexion

Même session (pgTAP : claims inchangés ; e2e : mêmes cookies, simple rechargement) :

| Retrait | Effet immédiat | Retour sans reconnexion | Preuve |
|---|---|---|---|
| hôte `suspendu` | hôte **et invités** coupés (D2) | oui | 11.1–11.7 ; e2e 9 |
| suspension programmée échue ; auto-annulation impossible | coupé ; refus | — | 11.8–11.9 |
| droit Réserves de l'hôte retiré | hôte et invités coupés | oui | 11.10–11.11 |
| habilitation intervenant retirée / échue | coupé | oui | 11.12–11.13 ; e2e 11 |
| membre désactivé dans B | coupé | oui | 11.14 ; e2e 11 |
| B suspendue | coupée | oui | 11.15–11.16 |
| application désactivée globalement | tous coupés | oui | 11.17–11.18 |
| entreprise révoquée par l'hôte | accès gratuit supprimé, Storage fermé | réactivation | 11.19–11.26 ; e2e 10 |
| cliente payante révoquée chez A | ne voit plus A, garde son abonnement | — | 11.27–11.29 |
| déconnexion globale depuis un autre appareil | l'écran repart sur `/login` | — | e2e 12 |

Résidu **R1 (P3, standard Supabase)** : après une déconnexion globale, GoTrue refuse la
session (403 `session_not_found`) et l'application renvoie à `/login`, mais un **JWT déjà
émis** reste accepté par PostgREST jusqu'à son expiration (≤ 1 h, `GOTRUE_JWT_EXP=3600`).
Mesuré en local. Les retraits de **droits** (tableau ci-dessus), eux, sont immédiats car
décidés en base à chaque requête.

## 12. Tests

| Gate | Résultat |
|---|---|
| pgTAP Réserves (7 fichiers) | **640/640** ; nouvelle suite `reserves_full_local_qualification_v1` **227/227** (10 échecs + cascade sur base sans correctifs) |
| pgTAP Colors + Réserves | 1 082/1 082 |
| pgTAP complet (120 fichiers, 2 882 assertions) | 11 fichiers en échec, **tous préexistants et hors Réserves**, ensemble identique avec et sans la migration de ce lot : `platform_stripe_state_attestation_r72` (pgsodium réel requis), 7 × `studio_*` (fixtures antérieures à « Inscription fermée »), `elsatia_tools_cloud_sync_entitlement_closure_v1` (`permission denied for table tools_projects`), `purge_entreprise_architecture_v2` 8/26 et `purge_entreprise_supprimee` 1/20 (défaut d'intégration RGPD × tronc, `DECISION_REQUIRED` du train canonique §6) |
| Vitest Réserves | **178/178** (13 fichiers) |
| Playwright Réserves (pile réelle) | voir §13 — **4 passes consécutives vertes** |
| typecheck | Réserves 0 erreur ; racine `tsc` 0 erreur |
| lint | Réserves 0 ; racine 0 erreur (15 avertissements préexistants) |
| build Réserves | **exit 1 sans env** (4 variables nommées, aucune valeur imprimée) ; **exit 0** avec env `local` |
| `verify:migrations` / `verify:env-manifest` / `verify:secrets` | 330 valides / 0 erreur / aucun secret |

## 13. Recette navigateur — pile Supabase réelle

`scripts/e2e/pile-locale-reserves.sh` reconstruit la pile **depuis zéro en ~30 s** (binaires
en cache) : schéma `auth` par les migrations de GoTrue, schéma `storage` par celles de
storage-api, puis le train complet. Aucune passerelle : un refus e2e vient du vrai service.

| Spec | Tests | Résultat |
|---|---|---|
| `reserves-qualification-v1` (**nouvelle**) | 13 | ✅ ×4 |
| `reserves-v3-collaboration` | 1 | ✅ ×4 |
| `reserves-v4-listes-pdf` | 11 | ✅ ×4 |
| `reserves-v4-offline-mobile` | 6 | ✅ ×4 |
| `reserves-v5-offline` | 14 | ✅ ×4 |
| `reserves-v6-performance` | 5 (décor de charge : 2 000 réserves) | ✅ ×4 |
| `reserves-v6-securite` | 23 (le `fixme` D6 est actif) | ✅ ×4 |
| **Total** | **73** | **73/73 sur 4 passes consécutives (5 à 8)** |

Historique complet des passes sur l'état final (décor rejoué avant chaque passe,
`workers: 1`, `retries: 0`) :

| Passe | Résultat |
|---|---|
| 1, 2, 3 | 73/73 |
| 4 | 67 verts, **1 échec avant tout corps de test** (`browser.newContext: … browser has been closed`, 3 ms, processus Chromium fermé entre deux tests ; aucune trace de mémoire ou disque saturés), 5 non exécutés par le mode série |
| **5, 6, 7, 8** | **73/73** chacune — quatre passes consécutives |

Les 13 parcours nouveaux : invitation → compte gratuit ; création à l'écran avec photo
obligatoire ; notification, cloisonnement de la liste et des URL directes, commentaire,
acceptation ; levée bloquée puis débloquée par un dépôt Storage réel ; URL signées (émise,
altérée, expirée, refusée, anonyme), dépôt intrus, suppression impossible ; compte gratuit
refusé sur 6 écrans et 5 appels ; refus puis validation de levée avec historique ordonné et
signé ; PDF de l'intervenant et PDF par entreprise de l'hôte ; suspension de l'hôte ;
révocation / réactivation ; habilitation retirée et membre désactivé ; session révoquée
ailleurs ; reprise d'un chantier Gestion Pro.

Détection prouvée : sur la base e2e, réinjecter l'ancienne `reserves_export_entete` fait
échouer le test 8, l'ancienne `reserves_intervenant_courant` le test 9.

## 14. Ce qui n'est PAS prouvé

- projet Supabase hébergé, Vercel, domaine, Preview : aucun déploiement (même limite que Colors) ;
- envoi e-mail réel (SMTP / fournisseur) : la file et les destinataires sont prouvés, pas la remise ;
- navigateurs WebKit (iPhone/iPad) : non disponibles sur le poste ; les parcours `@responsive`
  ont tourné en Chromium aux tailles mobiles ;
- storage-api : stockage `file` au lieu de S3 (même code applicatif, backend d'octets différent),
  transformations d'image désactivées ;
- `pgsodium` réel (hors Réserves).

## 15. Décisions et résidus ouverts

| Code | Sujet | Choix conservateur appliqué |
|---|---|---|
| `DECISION_REQUIRED:RESERVES-INVITED-SEATS` | un seul membre par entreprise invitée (§6.3) | rien ouvert |
| `DECISION_REQUIRED:GP-PLANS-STORAGE` | reprise des plans GP | non implémenté |
| `DECISION_REQUIRED:GP-CONTACTS-TO-INTERVENANTS` | reprise des entreprises / contacts GP | non implémenté |
| `DECISION_REQUIRED:GP-RESERVES-BLOCK` | bloc résumé + lien sur la fiche chantier GP | non câblé (lot Gestion Pro) |
| R1 (P3) | JWT valide jusqu'à expiration après déconnexion globale (§11) | standard Supabase, documenté |
| R2 (P3) | `reserves_designer_entreprise_intervenante` accepte une organisation non publiée (proposition V6 §2) : ouvre un accès gratuit à un tenant qui n'a rien demandé (sans aucune donnée visible tant qu'un membre ne rejoint pas) | non modifié : la recherche par SIRET exact, voulue, désigne aussi des organisations non publiées |
| R3 (P3) | purge du registre `reserves_mutations_appliquees` (proposition V6 §4) | dette d'exploitation, non traitée |
| R4 (P3) | un intervenant peut déposer un objet au nom arbitraire dans le dossier de SA réserve (non référencé par `reserves_photos`, donc jamais affiché) | orphelin sans effet ; non traité |
| R5 (P3) | un tenant hôte suspendu reste destinataire des e-mails préparés sur ses réserves (`reserves_notification_destinataires` vérifie le droit, pas l'état du tenant) | non traité |

## 16. Reproduire

```bash
git checkout claude/brave-pascal-agrr5v
# pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh rsv && (cd supabase/tests && pg_prove -d rsv reserves_*.test.sql)
# pile réelle + e2e
scripts/e2e/pile-locale-reserves.sh /tmp/rsv-stack      # imprime la suite des commandes
```
