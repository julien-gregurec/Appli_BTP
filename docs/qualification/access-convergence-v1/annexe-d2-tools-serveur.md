# D2 — Tools : projets d'organisation contrôlés côté serveur

Agent « D2 ». Fichiers livrés : `supabase/proposed/tools_projects_server_side_access_v1.sql.proposed` (non numérotée, `NEXT_MIGRATION_AFTER_CONVERGED_TRAIN`), `supabase/proposed/tests/tools_projects_access.test.sql` (pgTAP, 70 assertions), cette annexe. Aucun code client, aucune migration numérotée, aucun commit.
Légende : [LU] = lu dans le dépôt ; [EXÉCUTÉ] = rejoué sur base jetable `dbB` (279 migrations) avec témoin `dbB0` non modifié ; [INFÉRÉ] = déduit.

## 1. État actuel [LU]

| Élément | Définition en vigueur |
|---|---|
| `tools_projects` | `…236` puis `…238` (R10). Colonnes : `user_id` (créateur, `default auth.uid()`), `organization_id` (nullable, FK `on delete set null`), `local_id`, `project_payload jsonb` (aucune borne de taille), `revision`, `deleted_at`. Unicité `(user_id, organization_id, local_id)`. |
| RLS | 3 policies (`…238`) : `user_id = auth.uid() and organization_id is not null and a_acces_application(organization_id,'tools')`. Aucune policy de suppression ; `DELETE` révoqué (`…255:1164`). |
| RPC | `tools_sync_project_entreprise` (`security invoker`, `…238`) : vérifie seulement `a_acces_application`. `tools_sync_project` (R8) délègue à elle via `utilisateurs.entreprise_active_id`. |
| Droit d'usage | `a_acces_application(org,'tools')` = admin plateforme actif OU (`est_membre_actif(org)` ET ligne `acces_applications_entreprises` valide ET habilitation `tools_pro` valide). **`est_membre_actif` embarque l'abonnement GP** (`abonnement_statut not in ('suspendu','annule')`) et l'accès support. |
| Entitlement | `entitlements_utilisateurs_elsatia` (utilisateur, application, `niveau` free/pro, `capabilities[]`, `source`, `status` active/grace/…, `expire_le`, `revoked_at`). `tools_resoudre_entitlements()` en vigueur = version `…266` (superuser plateforme = Pro sans ligne ; sinon statuts `active`/`grace`, non révoqué, dans la fenêtre). Toujours `free` par défaut, jamais d'erreur. Aucun entitlement d'organisation n'existe : `tools_resoudre_entitlements_entreprise` rend `free` si `a_acces_application` est faux, sinon **l'entitlement personnel** de l'utilisateur. |
| Projets personnels | Aucun stockage serveur : toutes les policies exigent `organization_id is not null`. Les lignes à `organization_id null` (héritage R8, ou organisation supprimée) sont inaccessibles. Les projets Pro personnels sont locaux (IndexedDB). |
| Portée | `…277` : Tools déclaré `portee_donnees='compte'` alors que RLS/RPC restent par organisation (contradiction déjà relevée, T-P1-b). |
| Client | `AccountProvider` lit `tools_lister_entreprises_autorisees`, puis `tools_resoudre_entitlements_entreprise`, pousse via la RPC (`lib/projects/sync.ts`), lit via `from("tools_projects")`. Les capacités UI viennent de `capabilities` serveur (`entitlements.ts:50`), donc `saved-projects` est déjà la porte de l'interface. |

## 2. Test d'abus AVANT correctif [EXÉCUTÉ]

Huit acteurs en `authenticated`, deux organisations A et B, 19 opérations chacun (SELECT, INSERT, UPDATE, DELETE directs, RPC dans A, dans B, sur organisation inexistante, sur un `project_id` connu). Résultats bruts conservés dans le dossier de travail de session (`scratchpad/d2/abuse_before.txt`, `abuse_after.txt`).

**Ce qui tenait déjà.** Aucun accès inter-utilisateurs ni inter-organisations : la RLS impose `user_id = auth.uid()`. L'IDOR n'existe pas au sens « lire/écrire le projet d'autrui » : `select … where id = <projet d'un autre>` rend 0 ligne, l'UPDATE direct 0 ligne, et la RPC avec le `local_id` d'autrui crée SA PROPRE ligne (clé `user_id+org+local_id`) sans toucher celle d'autrui. Un membre de B ne peut rien dans A. `DELETE` refusé (42501).

**Ce qui passait (P1 confirmé).**

| Acteur | INSERT direct A | RPC dans A | RPC legacy | Payload 3 Mo |
|---|---|---|---|---|
| Free membre de A (habilitation `tools_pro`, sans Pro) | accepté | `applied` | `applied` | `applied` |
| Ex-abonné (entitlement expiré ET révoqué) | accepté | `applied` | `applied` | `applied` |
| Pro membre de A (référence saine) | accepté | `applied` | `applied` | `applied` |

Bornes : un payload de **60 Mo** est accepté et stocké (`applied`) ; **1500 projets** poussés par un seul utilisateur dans une seule organisation : 1500 acceptés, 0 refusé. Les erreurs de refus levaient `P0001` sans jeton exploitable (les conversions ratées `(…)::integer` sortaient en `22P02` brut).
Observation D3 [EXÉCUTÉ] : avec `abonnement_statut='suspendu'` sur l'organisation A, la RPC d'un Pro sain est refusée (« Entreprise non autorisée ») : la suspension GP coupe le cloud Tools, parce que `a_acces_application` s'appuie sur `est_membre_actif`.

## 3. Ce qui est bloqué APRÈS [EXÉCUTÉ]

Même matrice rejouée (`abuse_after.txt`) : seules les cases Free et ex-abonné changent (INSERT direct : `42501` ; RPC : `42501` + hint `tools_pro_requis` ; RPC legacy idem) ; les payloads volumineux passent de `applied` à `54000` ; le 501e projet actif passe de `applied` à `53400`. Les acteurs Pro membres de A gardent exactement les mêmes résultats (non-régression). Requête de pull de 500 lignes sous RLS : sous-requête hachée non corrélée, 1,9 ms.

## 4. Modèle implémenté

Accès (lecture ET écriture) si TOUT :
1. **(i)** membre `actif` (`utilisateurs_entreprises.statut='actif'`, lu inline, sans `est_membre_actif`) ;
2. **(ii)** `tools_resoudre_entitlements()` rend `tier='pro'` ET la capacité `saved-projects` (`tools_a_entitlement_projets_cloud()`) ;
3. **(iii)** droits sur le projet : `tools_droit_projet_organisation(org)` = `a_acces_application(org,'tools')` conservé, **point de substitution unique** ;
4. **(iv)** propriétaire : `user_id = auth.uid()` (créateur seul, comportement actuel).

Tools Free : `tools_resoudre_entitlements()` n'est pas modifiée, elle rend `free` sans erreur (testé pour Free et ex-abonné), le sélecteur d'organisations et la résolution par organisation restent disponibles. Seul le cloud se ferme, jamais l'application.

Ordre de vérification de la RPC : authentification (`28000`), organisation (`42501`, message identique pour organisation inexistante ou étrangère : aucune fuite), entitlement Pro (`42501`), validation (`22023`), taille (`54000`), quota (`53400`). Ordre choisi pour ne pas révéler l'état de Pro à quelqu'un qui n'a aucun droit sur l'organisation, et conserver le message « non autorisée » attendu par r10.

| SQLSTATE | Cas | `hint` (jeton stable) |
|---|---|---|
| 28000 | pas d'identité | — |
| 42501 | organisation non autorisée (non membre, désactivé, sans habilitation, sans droit d'usage) | `tools_org_non_autorisee` |
| 42501 | sans Pro / sans `saved-projects` | `tools_pro_requis` |
| 22023 | projet invalide, conversions de types comprises | — |
| 54000 | projet > 262 144 octets | `tools_projet_trop_volumineux` |
| 53400 | > 500 projets actifs par (utilisateur, organisation) | `tools_quota_projets` |
| 53400 | > 5000 lignes au total, supprimées comprises | `tools_quota_lignes` |

**Bornes, justification.** 256 Kio : un projet valide côté client pèse moins de 40 Kio au pire (nom 100, chantier 100, notes 1000, paramètres 80 car. par clé, 50 options de 250 car., 12 tags) ; marge ×6, sous la limite d'import de fichier du client (500 000 car.). Un projet ordinaire fait quelques Kio [INFÉRÉ]. 500 projets actifs par utilisateur et par organisation : usage artisan de l'ordre de la dizaine. Plafond de 5000 lignes tombstones compris : le `DELETE` est révoqué, donc sans plafond un cycle créer/supprimer remplit la base. Le trigger `tools_projects_bornes` s'applique à la RPC ET à l'écriture directe PostgREST, refuse (jamais de troncature), et modifier ou supprimer logiquement un projet reste possible à la borne (le quota n'enferme personne). Les trois valeurs vivent dans trois fonctions `tools_projets_*_max()` : un seul endroit à changer.

Durcissements annexes : révision attendue `null` traitée comme `0` (un `null` contournait le contrôle de conflit) ; conversions de types ratées → `22023` explicite.

## 5. DECISION_REQUIRED

1. **Habilitation `tools_pro` vs entitlement Pro** : redondantes ? — défaut appliqué : les deux exigées (couche iii conservée).
2. **Partage** : un gestionnaire d'accès (`peut_gerer_acces`) ou un autre membre peut-il lire/écrire les projets d'un créateur ? — le schéma porte un créateur mais **aucun partage n'existe aujourd'hui** (les projets « d'organisation » sont en réalité personnels dans une organisation). Défaut : créateur seul.
3. **Projets Pro personnels sans organisation** : aucun stockage serveur, NON créé. Aujourd'hui, un Pro sans entreprise reste sans cloud (testé) ; côté client il reste même Free (voir diff optionnel, T-P1-b).
4. **Ex-abonné** : lecture seule (fenêtre de X jours, export) ? — défaut : aucun accès ; les lignes ne sont pas supprimées et réapparaissent au renouvellement (testé).
5. **Purge des tombstones** : aucune purge automatique (le `DELETE` est révoqué) ; défaut : plafond de 5000 lignes.
6. **Suspension GP et cloud Tools (D3)** : tant que `a_acces_application` s'appuie sur `est_membre_actif`, une suspension GP coupe le cloud Tools [EXÉCUTÉ]. Cette proposition isole la dépendance dans `tools_droit_projet_organisation` (une ligne à changer vers la décision `autorise` par application du contrat v1). Pour (i), substituer l'appartenance inline par `est_membre_organisation(uuid)` (lot D3) une fois livré.
7. **Entitlement d'organisation (sièges)** : inexistant ; `portee_donnees='compte'` (`…277`) contredit RLS/RPC par organisation. Non tranché ici.
8. **Valeurs des bornes** (256 Kio / 500 / 5000) : défauts conservateurs, à confirmer.
9. **Administrateur plateforme et support** : `a_acces_application` les laissait écrire des projets dans n'importe quelle organisation ; l'exigence (i) « membre actif » les retire (un superuser Pro non membre n'a pas de cloud d'organisation). Jugé plus sûr ; à confirmer.

## 6. Rétro-compatibilité et détection avant déploiement

Aucune ligne n'est modifiée ni supprimée. Les lignes existantes restent lisibles par ceux qui ont Pro + `saved-projects` + membre actif + habilitation. Perdent l'accès cloud : les membres Free, les ex-abonnés (y compris ceux dont l'entitlement n'a pas `saved-projects`), et les Pro sans habilitation. Les lignes hors bornes déjà stockées restent lisibles mais toute écriture qui les conserve surdimensionnées est refusée.
Requêtes de diagnostic (lecture seule, en pied du fichier `.sql.proposed`, jouées sur base d'essai : elles ressortent bien le Free et l'ex-abonné et pas le Pro) :
- **Utilisateurs/organisations qui perdraient l'accès cloud** (avec nombre de projets actifs) ;
- lignes au-delà de 262 144 octets ; couples au-delà de 500 actifs ou 5000 lignes ;
- nombre de lignes orphelines (`organization_id null`) ;
- membres avec habilitation `tools` mais sans Pro (perte d'accès même sans projet).
À jouer en Production AVANT d'appliquer ; les cas à communiquer sont ceux de la première requête.

## 7. pgTAP

Fichier `supabase/proposed/tests/tools_projects_access.test.sql` : 70 assertions, matrice pro-A, pro2-A, free-A, membre-B, sans-org (Pro personnel), ex-abonné, pro sans habilitation, membre désactivé × (projet propre org / autre org / inexistant), IDOR lecture, écriture directe et RPC, ex-abonné puis renouvellement, Pro sans `saved-projects`, Free toujours `free`, bornes de taille (RPC et INSERT direct), quota et plafond de lignes (bornes abaissées dans la transaction), ACL. Lancement depuis `supabase/proposed/tests/` (le test applique la proposition par `\ir ../…`).

| Fichier | dbB (après proposition) | dbB0 (témoin) |
|---|---|---|
| `tools_projects_access.test.sql` | **70/70 PASS** | 70/70 (applique la proposition en transaction) ; **sans la proposition : 26 `not ok` puis abandon de la transaction** à l'assertion 56 (fonction `tools_projets_quota_max()` absente) : le test a des dents |
| `elsatia_tools_r8.test.sql` | 28/28 PASS | 28/28 |
| `elsatia_tools_r9.test.sql` | 26/26 PASS | 26/26 |
| `elsatia_tools_r10.test.sql` | **échec par conception** (aborte à l'assertion 6 : « Synchronisation cloud réservée à ELSATIA Tools Pro ») | 17/17 |
| `r10` avec delta de fixture (copie de travail) | **17/17 PASS** | — |

**r10 n'est pas une régression mais l'ancien comportement encodé.** L'utilisateur `10000000-…0002` y écrit dans le cloud avec l'habilitation `tools_pro` et sans entitlement : c'est exactement l'abus fermé. Delta à appliquer à `supabase/tests/elsatia_tools_r10.test.sql` (hors périmètre, non appliqué) :
- avant la première assertion `tools_sync_project_entreprise` (« écriture A autorisée ») : `reset role; insert into public.entitlements_utilisateurs_elsatia(utilisateur_id,application_code,niveau,capabilities,source) values('10000000-0000-0000-0000-000000000002','tools','pro',array['saved-projects'],'internal'); set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);`
- avant l'assertion « entitlement absent reste Free dans A » : `reset role; delete from public.entitlements_utilisateurs_elsatia where utilisateur_id='10000000-0000-0000-0000-000000000002'; set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);`
Le reste (dont « révocation bloque toute nouvelle écriture », `%non autorisée%`) passe tel quel.

## 8. Client : `AccountProvider` face aux nouveaux refus [LU + INFÉRÉ, non appliqué, non testé]

Constat : **aucune dégradation d'un Pro sain en Free n'est introduite.** `SupabaseCloudProjectStore.push` avale toute erreur en `Error("Synchronisation cloud impossible.")` ; `SyncService.sync` l'attrape par projet (statut `error`), donc ni `42501`, ni `53400`, ni `54000` n'atteignent le `catch` de `syncNow` qui passe en `FREE_ACCESS`. `pull` ne peut pas échouer sur refus de droit (RLS : 0 ligne). Limites : (a) l'utilisateur n'apprend jamais pourquoi (quota, taille, Pro expiré en cache 7 jours) ; (b) un Pro dont l'entitlement a expiré pendant la grâce hors ligne continue d'échouer sans que l'interface ne se re-résolve ; (c) le `catch` de `syncNow` dégrade toujours à Free sur simple erreur réseau (déjà relevé P2-a).

Diff minimal proposé (`apps/tools/src/lib/projects/sync.ts` et `components/AccountProvider.tsx`) :

```diff
--- a/apps/tools/src/lib/projects/sync.ts
+++ b/apps/tools/src/lib/projects/sync.ts
+export type CloudRefusal = "pro_requis" | "org_non_autorisee" | "quota" | "trop_volumineux" | "invalide" | "transitoire";
+export class CloudSyncError extends Error { constructor(readonly kind: CloudRefusal, message: string) { super(message); } }
+// Codes stables posés par la migration D2 (le `message` de base n'est jamais montré à l'utilisateur).
+function classifyCloudError(error: { code?: string; hint?: string }): CloudSyncError {
+  if (error.code === "42501" && error.hint === "tools_pro_requis") return new CloudSyncError("pro_requis", "Tools Pro requis pour la synchronisation cloud.");
+  if (error.code === "42501") return new CloudSyncError("org_non_autorisee", "Cette entreprise n’est plus autorisée pour Tools.");
+  if (error.code === "53400") return new CloudSyncError("quota", "Quota de projets cloud atteint : vos projets restent sur cet appareil.");
+  if (error.code === "54000") return new CloudSyncError("trop_volumineux", "Projet trop volumineux pour le cloud : il reste sur cet appareil.");
+  if (error.code === "22023") return new CloudSyncError("invalide", "Projet refusé par le serveur.");
+  return new CloudSyncError("transitoire", "Synchronisation cloud impossible pour le moment.");
+}
@@ SupabaseCloudProjectStore.push
-    if (error) throw new Error("Synchronisation cloud impossible.");
+    if (error) throw classifyCloudError(error);
@@ SupabaseCloudProjectStore.pull
-    if (error) throw new Error("Téléchargement des projets impossible.");
+    if (error) throw classifyCloudError(error);
@@ SyncService.sync (catch par projet)
-      } catch (error) { await this.state.put({ ...record, status: "error", error: error instanceof Error ? error.message : "Synchronisation impossible." }); }
+      } catch (error) {
+        await this.state.put({ ...record, status: "error", error: error instanceof Error ? error.message : "Synchronisation impossible." });
+        if (error instanceof CloudSyncError && (error.kind === "pro_requis" || error.kind === "org_non_autorisee")) throw error; // inutile d'insister : le serveur a tranché
+      }

--- a/apps/tools/src/components/AccountProvider.tsx
+++ b/apps/tools/src/components/AccountProvider.tsx
@@ syncNow
-    catch { setSyncStatus("error"); setAccess(FREE_ACCESS); setMessage("Accès entreprise retiré : écritures cloud bloquées."); }
+    catch (error) {
+      setSyncStatus("error");
+      if (error instanceof CloudSyncError && (error.kind === "pro_requis" || error.kind === "org_non_autorisee")) {
+        setMessage(error.message); await refresh(); // le serveur re-résout : Free honnête si le droit a réellement disparu
+      } else setMessage(error instanceof CloudSyncError ? error.message : "Synchronisation impossible pour le moment : vos projets restent sur cet appareil."); // réseau/quota/taille : le Pro est conservé
+    }
```

Optionnel, hors D2 strict (T-P1-b « payé mais Free ») : dans `resolve`, quand `!selected` (aucune organisation), résoudre l'entitlement personnel au lieu de forcer Free :

```diff
-      if (!selected) { setAccess(FREE_ACCESS); setStatus("verified"); setMessage("Aucune entreprise autorisée pour Tools · mode Free"); return; }
+      if (!selected) { // Pro personnel : local uniquement, aucun cloud sans organisation (DECISION_REQUIRED n°3)
+        const { data: own, error: ownError } = await getElsatiaClient().rpc("tools_resoudre_entitlements");
+        if (!ownError) { setAccess(entitlementToAccess(own as ServerEntitlement)); setActiveSources((own as ServerEntitlement).sources ?? []); }
+        else setAccess(FREE_ACCESS);
+        setStatus("verified"); setMessage("Aucune entreprise autorisée pour Tools : projets locaux uniquement"); return; }
```
(Le `useEffect` de synchronisation exige déjà `activeCompany`, donc un Pro sans organisation ne poussera rien.)

## 9. Risques résiduels

- Dépendance GP de la couche (iii) (§5.6) : levée seulement par le lot D3/contrat v1, pas par cette proposition.
- Deux premières poussées concurrentes du même projet depuis deux appareils peuvent lever `23505` brut (course entre `select for update` d'une ligne inexistante et l'insertion) ; le client la range en erreur puis rejoue en conflit. Non corrigé ici.
- `organization_id … on delete set null` : une organisation supprimée rend ses projets orphelins et invisibles (même comportement qu'avant).
- Le cache d'entitlement du client vaut jusqu'à 7 jours hors ligne : le serveur tranche à chaque poussée en ligne, donc un Pro périmé ne peut plus écrire même si l'interface le croit Pro (cf. §8 pour le message).
- `tools_resoudre_entitlements_entreprise` reste défini par R10 (non modifiée) ; elle dépend elle aussi de `a_acces_application`.

## 10. Rejouer

Base jetable : `newdb.sh <nom>` puis `psql -d <nom> < supabase/proposed/tools_projects_server_side_access_v1.sql.proposed`, et le pgTAP depuis `supabase/proposed/tests/` (`psql -U postgres -d <nom> -q -X -tA -f tools_projects_access.test.sql`).
