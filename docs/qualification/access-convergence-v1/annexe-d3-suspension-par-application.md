# Annexe D3 — Suspension par application et décision d'accès figée

Périmètre : découpler la suspension commerciale d'une application des autres (décision D3 de Julien),
faire évoluer `decision_acces_application` au contrat figé. **Rien n'est appliqué** : SQL en `.proposed`,
sans numéro de migration (`NEXT_MIGRATION_AFTER_CONVERGED_TRAIN`), aucune donnée réelle, aucun prix ni plan modifié.
Marqueurs : `[LU]` code/migration lu · `[EXÉCUTÉ]` rejoué sur base jetable (`template_base`, 279 migrations) ·
`[INFÉRÉ]` déduit, non rejoué.

## 0. Résumé (à lire d'abord)

1. **Une seule réécriture découple presque tout.** `colors_role_courant`, `reserves_role_courant`, les 3 policies
   `tools_projects`, `tools_lister_entreprises_autorisees`, `tools_changer_entreprise_active`,
   `tools_resoudre_entitlements_entreprise`, `tools_sync_project_entreprise` et `applications_autorisees`
   appellent `a_acces_application` — pas `est_membre_actif`. `a_acces_application` embarquait `est_membre_actif`
   (donc l'abonnement GP, migration `20260714000075`). En la réécrivant, ces 9 chemins cessent d'hériter de la suspension GP.
2. **Le risque « autorisé mais aucune donnée » est RÉFUTÉ pour Colors et Tools, RÉEL pour 11 objets Réserves**
   (§4). Preuve rejouée : GP suspendu, même utilisateur, avant → `a_acces_application` faux partout et 0 seau / 0 chantier /
   0 projet visibles ; après → vrai pour Colors/Réserves/Tools et 1/1/1 ligne visible (`[EXÉCUTÉ]`, §5).
3. **Non-régression prouvée** : sur la matrice (14 utilisateurs × 3 organisations × 6 applications) dans 6 états du monde,
   l'ancienne et la nouvelle `a_acces_application` ne diffèrent **que** par des autorisations NOUVELLES hors `gestion_pro`
   (le découplage voulu) : 0 refus nouveau, 0 autorisation nouvelle pour `gestion_pro`, 0 violation de l'invariant.
4. **Trouvaille de sécurité (DECISION_REQUIRED n°1)** : `suspension_plateforme` coupe la *décision* mais **pas les données
   Gestion Pro** : ces tables passent par `est_membre_actif`, qui ne lit pas la nouvelle table. Prouvé (§6).

## 1. Inventaire du couplage `est_membre_actif` / `a_acces_application` [EXÉCUTÉ + LU]

Méthode : la base modèle reflète l'application des 279 migrations dans l'ordre des préfixes à 14 chiffres (la dernière
définition gagne : ex. `est_membre_actif` = `20260714000075`, `est_plateforme_admin` = `…236`, `a_acces_application` = `…234`,
`plateforme_desactiver_application_entreprise` = `…239`). J'ai lu les définitions **effectives** (`pg_proc.prosrc`,
`pg_policies`), lignes de commentaire exclues, puis le graphe d'appels transitif. Chiffres :

| Famille | Fonctions (appel direct) | Policies RLS (appel direct) | Hérite de la suspension GP **avant** | Classement | Après la réécriture |
|---|---|---|---|---|---|
| **Colors** | 1 (`colors_role_courant` → `a_acces_application`) ; 0 `est_membre_actif` | 0 direct ; 8 policies `colors_*` + 1 storage via `colors_action_autorisee` → `colors_role_courant` | OUI (par `a_acces_application`) | **doit être découplé** (donnée Colors) | **découplé**, aucune RLS à toucher |
| **Tools** | 4 (`tools_changer_entreprise_active`, `tools_lister_entreprises_autorisees`, `tools_resoudre_entitlements_entreprise`, `tools_sync_project_entreprise`) → `a_acces_application` ; 0 `est_membre_actif` | 3 (`tools_projects` lecture/insertion/modification) → `a_acces_application` | OUI | **doit être découplé** (projet d'organisation Tools) | **découplé** |
| **Plateforme — accès applicatif** | 1 (`applications_autorisees` → `a_acces_application`) | — | OUI | **doit être découplé** | **découplé** |
| **Réserves — via `a_acces_application` seul** | 1 (`reserves_role_courant`) ; `reserves_action_autorisee`/`reserves_lecture_autorisee`/`reserves_storage_*` en dérivent | 15 policies sur tables `reserves_*` + 5 storage via `reserves_action_autorisee` / `reserves_lecture_autorisee` / `reserves_storage_*` (les 5 autres policies Réserves sont personnelles ou publiques, sans couplage) | OUI | **doit être découplé** | **découplé** |
| **Réserves — `est_membre_actif` direct (RÉSIDU)** | 9 (§4) dont 4 combinées à `a_acces_application` | 2 (`reserves_annuaire_select`, `reserves_notifications_select`) | OUI, **persiste** | **doit être découplé** (donnée Réserves) | **reste couplé** tant que non corrigé (§4) |
| **Plateforme — support / commun** | 1 (`support_marquer_lus_entreprise`) ; `support_messages_entreprise` déjà découplée (commentaire explicite) | `support_msg_select`, `acces_applications_entreprises_lecture` | OUI | **à découpler** (`acces_applications_entreprises_lecture`) ; **DECISION_REQUIRED n°4** (support) | reste couplé (non modifié) |
| **Gestion Pro / administration / facturation** | 56 (`a_permission`, devis, factures, pointage, stock, notes de frais, messagerie, modules…) | 142 sur 146 (clients, chantiers, devis, factures, employés, `entreprises`, `utilisateurs_entreprises`, tables d'abonnement, 12 storage GP…) | OUI | **doit rester couplé** (donnée GP : la protection vient de l'abonnement) | inchangé, `est_membre_actif` **intact** |
| **Total** | **73 fonctions** appelantes directes (hors `est_membre_actif` et `a_acces_application` elles-mêmes) ; 210 atteignent l'une des deux par le graphe | **146 policies** `est_membre_actif` + 4 `a_acces_application` | | | |

Notes de lecture :
- `est_membre_actif` = `est_acces_support_actif(entreprise)` **OU** (appartenance `actif` ET `abonnement_statut ∉ {suspendu, annule}` ET
  `suspension_prevue_at` non échue) `[LU 20260714000075]`. Le second terme est ce qui couple tout à l'abonnement GP.
- `a_permission` (GP) embarque `est_membre_actif` : les permissions de poste GP restent donc couplées — normal (données GP).
  `peut_gerer_acces` (gestion des habilitations applicatives par l'admin d'organisation) **n'utilise pas** `est_membre_actif` : déjà découplée.
- `communications_pour_utilisateur` ne mentionne `est_membre_actif` qu'en commentaire ; elle dérive toutefois un segment `expire`
  de l'abonnement GP (ciblage de messages, pas un contrôle d'accès) — signalé au DECISION_REQUIRED n°4.
- Colors : aucune des tables/fonctions Colors ne référence `est_membre_actif` (vérifié dans `pg_proc`/`pg_policies`, base modèle).

## 2. Conception minimale et justification

Fichier : `supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed` (socle) puis
`packages/application-access/sql/decision_acces_application.sql.proposed` (décision + réécriture de `a_acces_application`).
**Ordre d'application : socle d'abord.** Tout est additif ; les lignes existantes restent `actif`.

**(a) Colonne `statut_commercial` sur `acces_applications_entreprises`** (`actif|suspendu|annule`, défaut `actif`, + `suspendu_depuis`,
contrainte de cohérence). Pourquoi pas `autorise`/`valide_jusqu_au` : `autorise=false` produit `application_non_incluse` (indiscernable de
« jamais souscrit », l'écran ne peut pas proposer de régulariser) ; les fenêtres `valide_*` sont réécrites par
`plateforme_activer_application_entreprise`. Le statut GP reste `entreprises.abonnement_statut` (Stripe) : la colonne est **ignorée pour
`gestion_pro`** et le RPC refuse de l'écrire pour `gestion_pro` (deux sources de vérité = un piège).

**(b) `est_membre_organisation(uuid)`** = `est_acces_support_actif` OU appartenance `actif`, **sans** abonnement. Mêmes règles que
`est_membre_actif` moins l'abonnement : remplacer l'une par l'autre dans une RLS non-GP ne change rien d'autre. `est_membre_actif`
n'est **pas** modifié. `est_membre_organisation` ne lit pas la suspension plateforme (DECISION_REQUIRED n°1).

**(c) `suspensions_plateforme`** (portée `compte` ou `organisation`, motif ≥ 5 car., début, fin nullable, auteur, révocation
horodatée/motivée ; jamais supprimée) + `_suspension_plateforme_active(uid, entreprise)` (interne, non appelable) lue par la décision +
2 RPC d'écriture `plateforme_suspendre_globalement` / `plateforme_lever_suspension_globale` (`total` + AAL2 ; refus de
s'auto-suspendre). Lecture RLS réservée aux administrateurs plateforme ; aucun `INSERT/UPDATE/DELETE` pour les rôles API. Les 2 RPC
d'écriture dépassent la lettre de la mission (une table sans chemin d'écriture serait inutilisable) — à valider (DECISION_REQUIRED n°8).

**(d) `plateforme_definir_statut_application_entreprise(entreprise, app, statut, motif)`** : mêmes gardes que
`plateforme_desactiver_application_entreprise` (`…239`) : `plateforme_exiger_role('total')`, `plateforme_exiger_session_aal2()`, ligne dans
`historique_acces_applications` (action `statut_commercial:<statut>`, motif dans `nouveau`). Refuse `gestion_pro`, un statut invalide, une
suspension sans motif, et l'absence de droit d'usage (pas de création implicite). Idempotent (`false` si inchangé).
`plateforme_activer_application_entreprise` **ne réinitialise pas** le statut : lever un impayé et réactiver un droit sont deux actes tracés.

**(e) `a_acces_application` réécrite** = `_decision_acces_noyau(auth.uid(), …)->>'decision' = 'autorise'`. Signature, `SECURITY DEFINER`, `STABLE`,
`search_path`, ACL (`postgres` + `authenticated`, comparées avant/après `[EXÉCUTÉ]`) et bypass administrateur (`plateforme_admins` actif +
`statut_identite='active'`, identique à `est_plateforme_admin()`) inchangés. Elle appelle le **noyau** et non la vue client : même décision, sans JSON
ni nom d'entreprise, car elle est évaluée ligne à ligne dans les RLS.

**Décision au contrat figé** (14 étapes, priorité = ordre) : `suspension_plateforme` évaluée **avant** le bypass administrateur ;
`abonnement_suspendu` **par application** (GP : `abonnement_statut ∈ {suspendu, annule}` ou `suspension_prevue_at` échue ; autres :
`statut_commercial ∈ {suspendu, annule}` de la ligne d'entitlement) ; `entreprise_inactive` supprimé ; `essai_expire` inchangé. Noyau non appelable
(`postgres` seul) ; vue client sans diagnostic ni motif, nom d'entreprise seulement si l'appelant a une appartenance ; `diagnostic_acces_application`
réservée à `est_plateforme_admin()`. Le bloc « session d'assistance passe l'abonnement » du prototype est supprimé : une session d'assistance exige
un administrateur plateforme actif, qui prend déjà le bypass à l'étape 4 — code mort.

Écarts de comportement assumés par rapport à l'ancienne `a_acces_application` : (i) une suspension plateforme prime sur le bypass administrateur ;
(ii) un `statut_commercial ≠ actif` refuse l'application concernée ; (iii) l'abonnement GP ne refuse plus que `gestion_pro`. Rien d'autre :
vérifié par le différentiel du §5.

## 3. Priorités vérifiées (`decision_acces_application.test.sql`, 66 assertions)

Un membre `desactive` d'une organisation GP suspendue reçoit `utilisateur_desactive` (pas `abonnement_suspendu`) ; un invité, `invitation_en_attente` ;
`suspension_plateforme` prime sur l'invitation et sur le bypass administrateur (portée compte **et** organisation, uniquement pour l'organisation
suspendue) ; une suspension échue, révoquée ou programmée dans le futur n'est pas appliquée ; application inconnue ou désactivée au catalogue et
statut d'appartenance `pause` → `erreur_configuration` (échec fermé).

## 4. Résidu Réserves : les 11 objets encore couplés à `est_membre_actif` (à décider par Julien) [LU + EXÉCUTÉ]

**Réfutation du risque** : Colors et Tools n'ont **aucun** objet couplé (§1) ; l'utilisateur « autorisé » voit ses données (preuve §5).
Pour Réserves, `reserves_role_courant`/`reserves_action_autorisee` (donc toutes les tables métier, plans, photos, storage) passent par
`a_acces_application` et sont découplés. **Restent** ces objets, où l'utilisateur est « autorisé » Réserves mais **n'obtient rien** tant que GP est suspendu
(preuve : `reserves_preferences_lire` → 0 ligne alors que `decision='autorise'`, `[EXÉCUTÉ]` test `per_application_status` n°2) :

| Objet | Ligne à corriger | Type de correctif | Risque estimé |
|---|---|---|---|
| `reserves_notifications_compteur()` | `and public.est_membre_actif(ev.destinataire_entreprise_id)` | `est_membre_organisation(...)` — déjà combiné à `a_acces_application(...,'reserves')` | **Très faible** : la garde applicative reste |
| `reserves_notifications_in_app(int,bool)` | idem | idem | Très faible |
| `reserves_notifications_marquer_lues(uuid[])` | idem | idem | Très faible |
| `reserves_intervenant_courant(uuid)` | `and public.est_membre_actif(i.entreprise_intervenante_id)` | idem (déjà combiné à `a_acces_application`) | Très faible |
| policy `reserves_notifications_select` (`reserves_evenements_notifications`) | `est_membre_actif(destinataire_entreprise_id) AND a_acces_application(...)` | idem | Très faible |
| `reserves_preferences_lire(uuid)` | `where public.est_membre_actif(p_entreprise_id)` | `est_membre_organisation(...)` **+** `a_acces_application(p_entreprise_id,'reserves')` | Faible-moyen : sans la garde applicative, un membre d'une organisation dont **Réserves** est suspendu pourrait encore lire/écrire ses préférences |
| `reserves_preferences_definir(uuid,text,bool)` | `if not public.est_membre_actif(p_entreprise_id) then` | idem | Faible-moyen |
| `reserves_invitation_accepter(text,uuid)` | `if not public.est_membre_actif(p_entreprise_id) then` | idem | **Moyen** : chemin d'acceptation d'invitation inter-organisations, à rejouer avec `reserves_v3_*` |
| `reserves_invitations_en_attente()` | `and public.est_membre_actif(i.entreprise_intervenante_id)` | idem | Moyen (même raison) |
| `reserves_rejoindre_intervention(uuid)` | `if not public.est_membre_actif(v_cible) then` | idem | Moyen |
| policy `reserves_annuaire_select` (`reserves_annuaire_publication`) | `est_membre_actif(entreprise_id)` | idem | Faible-moyen |

`[INFÉRÉ]` : ces correctifs n'ont pas été rejoués (hors périmètre, interdiction de modifier ces objets). Recommandation : les 5 « très faible »
d'abord (un seul train, zéro nouvelle surface), puis les 6 autres avec la garde `a_acces_application(…,'reserves')` et rejeu de
`reserves_v1/v2/v3/v4/v5`.

Autres objets à découpler (hors Colors/Réserves/Tools) : `acces_applications_entreprises_lecture` (une organisation GP suspendue ne peut plus lire la
liste de ses propres droits d'usage, donc ne peut pas afficher « Colors suspendu / actif ») → `est_membre_organisation(entreprise_id) or est_plateforme_admin()`,
risque faible. Le nouveau `statut_commercial` devient lisible par les membres actifs de l'organisation : voulu (l'écran doit afficher la raison).

## 5. Preuves exécutées [EXÉCUTÉ]

**Base** : `accessbase`, bases `dbA` (proposition appliquée) et `dbA0` (témoin sans proposition), toutes deux copies de `template_base`.

**Sonde « autorisé mais aucune donnée »** (GP suspendu, ouvrier habilité sur 4 apps ; 1 seau Colors, 1 chantier Réserves, 1 projet Tools d'organisation) :

| | `a_acces_application` gp / colors / réserves / tools | seaux Colors | chantiers Réserves | projets Tools | `reserves_preferences_lire` |
|---|---|---|---|---|---|
| **Avant** (`dbA0`) | f / f / f / f | 0 | 0 | 0 | 0 |
| **Après** (`dbA`) | f / **t / t / t** | **1** | **1** | **1** | 0 (résidu §4) |

**Différentiel** (fonction `pg_temp.a_acces_ancienne` = copie de la migration 234, comparée dans le test `per_application_status`) :
état tout actif → 0/0/0/0 ; GP suspendu, GP annulé, suspension prévue échue → 0 refus nouveau, 0 autorisation nouvelle pour `gestion_pro`, invariant
tenu (et `>0` autorisations nouvelles hors GP pour l'état « GP suspendu ») ; essai expiré → identique à l'ancienne.

**Performance** (indicatif, machine chargée par d'autres bases) : 3 000 seaux, lecture RLS : ~0,95 s avant → ~0,29 s après ; 20 000 appels de
`a_acces_application` : ~4,0 s avant → ~0,57 s après. Pas de régression (l'ancienne recalculait `est_membre_actif` + `est_acces_support_actif` à chaque appel).

## 6. Trouvaille : la suspension plateforme ne coupe pas les données Gestion Pro [EXÉCUTÉ]

Sonde : compte suspendu (`suspensions_plateforme`, portée compte), abonnement GP actif :
`decision_acces_application('gestion_pro')='suspension_plateforme'`, `a_acces_application=false`, **mais** `est_membre_actif=true` et
**5 lignes** de `types_chantier` lisibles (RLS `est_membre_actif`). Conforme à D1 (aucun enforcement direct sur GP dans ce lot) mais contraire à
l'intention « seule la suspension plateforme coupe tout le compte ». Colors/Réserves/Tools, eux, sont bien coupés (données invisibles, test §5.n°5).

## 7. Tests

| Fichier | Résultat |
|---|---|
| `supabase/proposed/tests/decision_acces_application.test.sql` | PASS 66/66 |
| `supabase/proposed/tests/per_application_status.test.sql` | PASS 103/103 |
| `docs/qualification/access-convergence-v1/decision-cases.sql` (rejeu, base fraîche) | PASS 103/103, invariant 0 violation, 0 décision hors contrat |
| 7 pgTAP existants demandés (`elsatia_multi_app_convergence_v1` 27/27, `platform_global_owner_all_apps_v1` 40/40, `platform_support_isolation_audit_v1` 67/67, `platform_aal2_role_integrity_v1` 80/80, `reserves_v1_foundation_workflow` 98/98, `colors_canonical_integration_v1` 8/8, `elsatia_tools_r10` 17/17) | PASS, plans identiques à la base témoin `dbA0` (0 régression) |
| 3 tests de surface ACL (`platform_residual_acl_hardening_r74` 28/28, `platform_write_surface_hardening_v1` 23/23, `isolation_multitenant_surface` 10/10) | PASS (nouvelle table et nouvelles fonctions sans fuite d'ACL) |
| 15 tests complémentaires Colors v11-v15 / Tools r8-r9 / Réserves v2-v5 / `plateforme_impayes` / `platform_support_uid_security` | PASS identique, `dbA` et `dbA0` (mêmes plans) |

`decision-cases.sql` : 59 cas d'origine dont **54 inchangés** et **5 dont l'attendu change** (D3) : `c7`×{colors, tools, reserves} et `x4`/`x1`×colors
passent à `autorise` (avant : `abonnement_suspendu`/`entreprise_inactive`) ; **44 cas ajoutés** (GP annulé/suspension prévue → gestion_pro refusé, Colors
suspendu/annulé, Tools suspendu + GP suspendu, suspension compte/organisation, admin suspendu, suspension échue/révoquée/programmée, priorités).

## 8. DECISION_REQUIRED

1. **Suspension plateforme et données GP.** `suspension_plateforme` ne coupe pas les tables GP (`est_membre_actif` ne lit pas la table) — prouvé §6. Défaut
   appliqué : non modifié (D1 : aucun enforcement sur GP dans ce lot). Correctif si validé : ajouter à `est_membre_actif` (et `est_membre_organisation`)
   `and public._suspension_plateforme_active(auth.uid(), p_entreprise_id) is null` ; sensible (142 policies, chemin chaud) → lot dédié + mesure de charge.
2. **Résidu Réserves (11 objets, §4).** Stratégie : `est_membre_organisation` seul (5 objets déjà gardés) ou `+ a_acces_application(…,'reserves')` (6 autres).
   Défaut appliqué : aucun objet Réserves modifié.
3. **`statut_commercial` sur la ligne `gestion_pro`.** Défaut appliqué : ignoré par la décision, refusé par le RPC (source de vérité = `entreprises.abonnement_statut`).
4. **Support et communications d'un client GP suspendu.** `support_msg_select`, `support_marquer_lus_entreprise` (`est_membre_actif`) : un client dont l'abonnement GP
   est suspendu ne lit plus les réponses du support, y compris s'il utilise Colors. `communications_pour_utilisateur` classe l'entreprise en segment `expire` selon
   l'abonnement GP. Défaut appliqué : non modifié ; recommandation : découpler ces deux points.
5. **Statut d'appartenance `pause`** (autorisé par la contrainte de table, absent du contrat) → `erreur_configuration`, échec fermé. Défaut appliqué : fail-closed.
6. **`diagnostic_acces_application`** : administrateur plateforme actif seulement, ou `total` + AAL2 comme les RPC d'habilitation (`…239`) ? Défaut appliqué :
   administrateur actif (lecture seule ; l'administrateur a déjà le bypass sur tout).
7. **Ordre `essai_expire` (10) / `application_non_incluse` (11)** : « inchangé » conservé — un droit `autorise=false` reste `application_non_incluse` même si sa
   fenêtre d'essai est échue. Une lecture stricte de l'ordre donnerait `essai_expire` ; à confirmer.
8. **Écriture de la suspension globale** : les 2 RPC (`total` + AAL2, auto-suspension interdite) dépassent la lettre de la mission. Défaut appliqué : ajoutés ;
   FK `ON DELETE CASCADE` (une suppression de compte/entreprise emporte la trace de suspension — à arbitrer avec l'audit RGPD) ; aucune garde « propriétaire plateforme ».
9. **`plateforme_activer_application_entreprise` ne lève pas une suspension commerciale.** Défaut appliqué : deux actes distincts ; à confirmer côté produit.
10. **`annule` vs `suspendu` hors GP** produisent la même décision `abonnement_suspendu` (le contrat n'a qu'un code). Défaut appliqué : identique ; distinction disponible
    dans `diagnostic_acces_application` uniquement.

## 9. Rejeu

```bash
export PATH=/usr/local/bin:$PATH
newdb.sh dbX                                                   # copie de template_base
psql … -d dbx -v ON_ERROR_STOP=1 < supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
psql … -d dbx -v ON_ERROR_STOP=1 < packages/application-access/sql/decision_acces_application.sql.proposed
# pgTAP : copier supabase/tests/ + le test dans le conteneur, puis psql -q -X -tA -f <test>
# jeu d'essai autonome (embarque les 2 propositions) : psql -A -d <base fraîche> < docs/qualification/access-convergence-v1/decision-cases.sql
```

Retour arrière (avant tout usage) : rétablir les définitions de `a_acces_application` (`…234`) ; `drop function` des 8 nouvelles fonctions (`est_membre_organisation`, `_suspension_plateforme_active`, `_decision_acces_noyau`, `decision_acces_application`, `diagnostic_acces_application`, `plateforme_suspendre_globalement`, `plateforme_lever_suspension_globale`, `plateforme_definir_statut_application_entreprise`) ; `drop table suspensions_plateforme` ;
`alter table acces_applications_entreprises drop column statut_commercial, drop column suspendu_depuis` (les contraintes tombent avec les colonnes).
