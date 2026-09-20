# Annexe D3 — Résidu Réserves : découpler les 11 objets encore liés à l'abonnement Gestion Pro

Périmètre : décision D3 (« une suspension commerciale de Gestion Pro ne coupe PAS les autres applications »), suite de
`annexe-d3-suspension-par-application.md` §4. **Rien n'est appliqué en dehors de bases jetables** : SQL en `.proposed`, sans
numéro de migration (`NEXT_MIGRATION_AFTER_CONVERGED_TRAIN`), aucune donnée réelle, aucun prix ni plan modifié.
Marqueurs : `[LU]` code/migration lu · `[EXÉCUTÉ]` rejoué sur base jetable · `[INFÉRÉ]` déduit, non rejoué.

Fichiers : `supabase/proposed/reserves_decouple_gp_suspension_v1.sql.proposed` (proposition) ·
`supabase/proposed/tests/reserves_decouple_gp_suspension.test.sql` (pgTAP, 30 assertions).

## 0. Résumé

1. **11 objets découplés** (9 fonctions, 2 policies), diff limité au prédicat d'appartenance `est_membre_actif` →
   `est_membre_organisation` (+ garde applicative Réserves sur 3 objets qui n'en avaient aucune). `[EXÉCUTÉ]` comparaison
   `pg_get_functiondef` avant/après : seules les lignes de prédicat changent, `SECURITY DEFINER`, `search_path=public`, signatures et
   ACL `{postgres, authenticated}` identiques ; `pg_policies` : mêmes commande (`SELECT`) et rôle (`authenticated`).
2. **La recommandation d'une ligne du §4 est FAUSSE pour 3 objets** (`reserves_invitation_accepter`, `reserves_rejoindre_intervention`,
   `reserves_invitations_en_attente`) : y ajouter `a_acces_application(…,'reserves')` rend le parcours d'invitation impossible
   (poule et oeuf, §3). Appliqué : `est_membre_organisation` **seule** pour ces trois-là ; les 6 autres suivent le §4.
3. **Preuve** : `reserves_decouple_gp_suspension.test.sql` PASS 30/30 ; échoue 16/30 sans la proposition (base `dbr1`) ; échoue 8/30 avec la
   variante « garde partout » du §4 littéral (base `dbr2`). **Non-régression** : 8 pgTAP Réserves/isolation + 3 tests de surface ACL,
   plans atteints, 0 `not ok`, résultats **identiques** à la base témoin `dbr0` (copie du modèle sans aucune proposition).

## 1. Les 11 objets

`est_membre_organisation(x)` = soutien actif OU appartenance `actif`, **sans** l'abonnement GP (créée par le socle D3). `AA(x)` =
`a_acces_application(x,'reserves')` (droit d'usage d'organisation + habilitation + rôle, statut propre de Réserves, suspension plateforme).
« Dernière définition » = celle de la migration `20260907000270` (vérifiée par `pg_get_functiondef` sur la base modèle : 279 migrations).

| # | Objet | Ancienne condition | Nouvelle condition | Risque | Preuve |
|---|---|---|---|---|---|
| 1 | `reserves_notifications_compteur()` | `est_membre_actif(dest) AND AA(dest)` | `est_membre_organisation(dest) AND AA(dest)` | très faible (garde inchangée) | test 8-9, 20-26 |
| 2 | `reserves_notifications_in_app(int,bool)` | idem | idem | très faible | idem |
| 3 | `reserves_notifications_marquer_lues(uuid[])` | idem | idem | très faible | 9, 11 (effet : 2 lectures écrites) |
| 4 | `reserves_intervenant_courant(uuid)` | `est_membre_actif(i.entreprise_intervenante_id) AND AA(…)` | `est_membre_organisation(…) AND AA(…)` | très faible | 8-9, 20-26 (`courant`, `interv_rls`) |
| 5 | `reserves_preferences_lire(uuid)` | `est_membre_actif(p_entreprise_id)` seul | `est_membre_organisation(p) AND AA(p)` | faible : **restreint** un membre sans habilitation Réserves (avant : lisait ses préférences) | 8-9, 20, 23-26, 30 |
| 6 | `reserves_preferences_definir(uuid,text,bool)` | `est_membre_actif` seul → « pas membre actif » | `est_membre_organisation` → même message ; **puis** `AA(p)` sinon « Accès à Réserves non autorisé pour cette organisation » | faible : idem restriction ; messages d'erreur d'origine conservés (le pgTAP v3 les teste) | 9, 12, 20-26 |
| 7 | `reserves_invitation_accepter(text,uuid)` | `est_membre_actif(p)` | `est_membre_organisation(p)` — **sans** AA | moyen : voir §3-4 | 9-10, 18-19, 27-29 + `reserves_v3_*` 148/148 |
| 8 | `reserves_invitations_en_attente()` | `est_membre_actif(i.entreprise_intervenante_id)` | `est_membre_organisation(…)` — **sans** AA | moyen : idem | 14, 20-26 |
| 9 | `reserves_rejoindre_intervention(uuid)` | `est_membre_actif(v_cible)` | `est_membre_organisation(v_cible)` — **sans** AA | moyen : idem | 16-17 |
| 10 | policy `reserves_notifications_select` | `dest is not null AND est_membre_actif AND AA` | `dest is not null AND est_membre_organisation AND AA` | très faible | `notif_rls` : 2 lignes GP actif = 2 lignes GP suspendu, 0 hors droit |
| 11 | policy `reserves_annuaire_select` | `est_membre_actif(entreprise_id)` | `est_membre_organisation(entreprise_id) AND AA(entreprise_id)` | faible : **restreint** (sa propre fiche seulement pour un utilisateur Réserves) | `annuaire_rls` : 1 ligne GP actif = GP suspendu, 0 hors droit |

Décompte structurel `[EXÉCUTÉ]` (pgTAP 3-4) : fonctions `reserves_*` référençant `est_membre_actif` 9 → 0 ; policies `reserves_*` 2 → 0
(base entière : 68 → 58 fonctions et 146 → 144 policies référençant `est_membre_actif`, l'écart de 10 fonctions = ces 9 + `a_acces_application`).

## 2. Ce que prouve le test (30 assertions)

- **Identique GP suspendu / GP actif** (même utilisateur, Réserves actif) : la « sonde » des 11 objets (lectures : compteur, in-app, préférences,
  RLS notifications, annuaire, interventions, intervenant courant, invitations en attente ; gestes : régler, marquer lu, rejoindre, accepter) rend
  **la même ligne** dans les deux mondes (assertion 9), avec une valeur de référence écrite en dur pour le monde actif (assertion 8) et la preuve des
  **effets** (lectures écrites, préférence enregistrée, intervention rattachée : 10-12).
- **Pas d'élargissement** (GP suspendu partout) : membre **sans habilitation Réserves** (20), compte **désactivé** même habilité (21), membre d'une
  **autre organisation** (22), **droit d'usage Réserves désactivé** (23), **Réserves suspendu commercialement** (24), **suspension plateforme** du
  compte (25) et de l'organisation (26) : lectures à 0, réglage refusé. Les valeurs attendues sont écrites en dur (refus/vide), jamais comparées à la
  sonde elle-même.
- Structure : ACL, `SECURITY DEFINER`, `search_path` et commandes/rôles de policies inchangés (5-7).

## 3. Pourquoi le §4 de l'annexe D3 est faux pour 3 objets [EXÉCUTÉ]

`accepter`, `rejoindre` et `invitations_en_attente` servent une personne qui **n'a pas encore** d'accès Réserves : l'acceptation d'un lien *crée*
l'entitlement gratuit d'organisation (`source = reserves_invitation_gratuite`) et l'habilitation `reserves_intervenant` ; `rejoindre` crée
l'habilitation ; `invitations_en_attente` liste ce qu'on peut rejoindre avant toute habilitation (`apps/reserves/src/app/rejoindre/page.tsx`).
`a_acces_application` exige entitlement + habilitation (décisions `sans_habilitation`/`application_non_incluse`). Exiger cette garde dans ces trois
objets est donc circulaire. Le pgTAP existant `reserves_v3_collaboration_livrables` l'illustre : l'organisation C n'a aucun accès avant d'accepter.

Preuve rejouée (`dbr2` = la proposition + garde applicative sur les trois flux, soit le §4 littéral) : le test échoue notamment sur 14 (invitation invisible), 16
(rejoindre refusé), 18 (accepter refusé) et 19 (organisation C sans accès après acceptation), plus 20, 23, 25, 27 (mêmes flux, autres personas). Avec la proposition livrée, ces assertions passent : une
organisation GP-suspendue **sans** accès préalable voit l'invitation, la rejoint ou l'accepte, obtient l'accès Réserves (`a_acces_application` faux
avant, vrai après acceptation) — sans jamais toucher Gestion Pro.

## 4. Ce qui reste volontairement couplé, et risques d'élargissement

Reste couplé à l'abonnement GP (inchangé) : les 142 policies et ~56 fonctions de données Gestion Pro, `support_msg_select`,
`support_marquer_lus_entreprise`, `acces_applications_entreprises_lecture` (annexe D3 §4, DECISION_REQUIRED n°4 de l'annexe D3). Cette proposition ne
touche ni `est_membre_actif` ni aucune table GP.

Risques d'accès (aucun inter-organisations : chaque test « autre organisation » rend 0 / refus) :

1. **Élargissement voulu (D3)** : une organisation GP suspendue retrouve, pour ses membres autorisés à Réserves, exactement ce qu'elle avait GP actif
   (assertion 9). C'est l'objet de la décision, pas une fuite.
2. **Flux d'invitation ouverts à tout membre actif** (7, 8, 9) : comme **avant** la proposition (GP actif), *tout* membre actif d'une organisation peut
   lister/rejoindre/accepter une invitation destinée à son organisation, y compris **sans** habilitation Réserves, et s'octroie ainsi le rôle limité
   `reserves_intervenant` (assertion 20 `rejoindre=ok`, 27). Le changement est qu'il vaut désormais aussi GP suspendu. Aucune donnée n'est ouverte
   tant que le droit d'usage de l'organisation est désactivé (28-29), mais le rôle auto-octroyé **subsiste** si Réserves est réactivé ensuite
   (DECISION_REQUIRED n°2).
3. **Restrictions (pas d'élargissement)** : 5, 6, 11 exigent maintenant le droit Réserves ; un membre sans habilitation Réserves ne lit/règle plus les préférences
   ni ne lit sa fiche d'annuaire, alors que c'était possible GP actif. `[INFÉRÉ]` sans effet UI : ces lectures ne servent qu'à l'application Réserves
   (`apps/reserves/src/lib/donnees.ts`), dont l'accès exige déjà ce droit.
4. **Suspension plateforme** : coupe les 8 objets gardés (via `a_acces_application`, assertions 25-26) mais **pas** les 3 flux d'invitation (comme avant la
   proposition, `est_membre_organisation` ne lit pas `suspensions_plateforme`). Ne crée que des lignes d'entitlement/habilitation : aucune lecture.

## 5. Retour arrière

Avant tout usage : rejouer les 9 fonctions avec `est_membre_actif` (corps d'origine = migration `20260907000270`, ou le `create or replace` de ce
fichier en remplaçant `est_membre_organisation` par `est_membre_actif` et en supprimant les gardes ajoutées à `preferences_lire`/`preferences_definir`),
puis `alter policy` des 2 policies avec les qualifications d'origine (recopiées en pied du fichier `.proposed`). Aucune donnée n'est migrée ni supprimée ;
`create or replace` conserve les GRANT : aucun REVOKE/GRANT à rejouer.

## 6. Rejeu

```bash
export PATH=/usr/local/bin:$PATH
newdb.sh dbx                                                   # copie de template_base
psql … -d dbx -v ON_ERROR_STOP=1 < supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
psql … -d dbx -v ON_ERROR_STOP=1 < packages/application-access/sql/decision_acces_application.sql.proposed
psql … -d dbx -v ON_ERROR_STOP=1 < supabase/proposed/reserves_decouple_gp_suspension_v1.sql.proposed
# pgTAP : copier supabase/tests/ + supabase/proposed/tests/reserves_decouple_gp_suspension.test.sql dans le conteneur,
#         puis psql -q -X -tA -f reserves_decouple_gp_suspension.test.sql   (plan 30, 0 not ok)
```

Résultats `[EXÉCUTÉ]` (bases `dbr` = 3 SQL appliqués ; `dbr0` = témoin sans aucune proposition ; `dbr1` = socle + décision, sans cette proposition) :

| Fichier | `dbr` | `dbr0` |
|---|---|---|
| `supabase/proposed/tests/reserves_decouple_gp_suspension.test.sql` | PASS 30/30 | non applicable (prérequis absents) ; `dbr1` : FAIL 16/30 (attendu) |
| `reserves_v1_foundation_workflow` | PASS 98/98 | 98/98 |
| `reserves_v2_terrain_capture` | PASS 94/94 | 94/94 |
| `reserves_v3_collaboration_livrables` | PASS 148/148 | 148/148 |
| `reserves_v3_parcours_bout_en_bout` | PASS 41/41 | 41/41 |
| `reserves_v4_resilience_reseau` | PASS 14/14 | 14/14 |
| `reserves_v5_offline_idempotence` | PASS 18/18 | 18/18 |
| `platform_support_isolation_audit_v1` | PASS 67/67 | 67/67 |
| `isolation_multitenant_comportement` | PASS 56/56 | 56/56 |
| `isolation_multitenant_surface`, `platform_residual_acl_hardening_r74`, `platform_write_surface_hardening_v1` | PASS 10/10, 28/28, 23/23 | 10/10, 28/28, 23/23 |

Différence vs témoin : **aucune** (mêmes plans, mêmes `ok`, 0 `not ok`, 0 `ERROR`).

## 7. DECISION_REQUIRED

1. **Écart à la recommandation §4 de l'annexe D3.** Question : confirmer que `accepter`/`rejoindre`/`invitations_en_attente` restent sans garde
   `a_acces_application` (elle rend l'invitation impossible, §3). Défaut conservateur appliqué : `est_membre_organisation` seule sur ces 3 objets,
   garde applicative sur les 8 autres. Alternative si Julien veut une garde : une garde **spécifique** (« Réserves non explicitement désactivé/suspendu pour
   l'organisation »), à concevoir — ne pas réutiliser `a_acces_application`.
2. **Rôle `reserves_intervenant` auto-octroyé** (§4 point 2) : faut-il refuser `rejoindre`/`accepter` quand l'organisation a un droit Réserves
   explicitement désactivé/suspendu, et/ou réserver ces gestes aux administrateurs de l'organisation ? Défaut conservateur appliqué : comportement d'origine
   conservé (tout membre actif), simplement indépendant de l'abonnement GP ; aucune lecture n'est ouverte.
3. **Suspension plateforme sur les 3 flux d'invitation** : ajouter `_suspension_plateforme_active(auth.uid(), org) is null` ? Défaut conservateur appliqué :
   non ajouté (aucun changement de périmètre ; même lacune qu'avant, cf. annexe D3 DECISION_REQUIRED n°1, à traiter avec `est_membre_organisation`
   elle-même dans un lot dédié).
4. **Restriction des préférences et de la fiche d'annuaire** (5, 6, 11) à qui détient le droit Réserves. Défaut conservateur appliqué : oui (garde ajoutée,
   conforme au §4). Alternative moins restrictive : `est_membre_organisation` seule, à l'identique d'avant pour les membres sans habilitation.
