# Écart GP vs `a_acces_application` — analyse lecture seule

Racine : `<N>` = `scratchpad/night/` (tip `d7d59c9e`). `S`=`<N>/src/lib`, `M`=`<N>/supabase/migrations`. [LU] = lu dans le code ; [INFÉRÉ] = déduit. Rien n'a été exécuté ni modifié.

## 1. Situation actuelle

**Pourquoi GP autorise alors que `a_acces_application=false`** : les deux décisions ne partagent aucune brique.
- `contexte_acces_proxy` (M/20260719000117:17-92) calcule `droit_acces` par une seule jointure `utilisateurs_entreprises(statut='actif') × permissions_poste(autorise, cle ∈ p_droits_acces)` (:52-65). Il ne lit ni `habilitations_applications_utilisateurs`, ni `acces_applications_entreprises`, ni l'abonnement. [LU]
- `a_acces_application` (M/20260826000234:134-174) exige : admin plateforme (bypass) OU (`est_membre_actif` ET ligne `acces_applications_entreprises` autorisée et dans sa fenêtre ET habilitation utilisateur active avec rôle actif). Le commentaire de la table (:70-71) dit qu'une habilitation « ne dérive ni d'un poste ni d'une permission métier Gestion Pro ». [LU]
- Le socle multi-app a été « porté à la main » depuis Colors et n'accorde « aucun droit automatiquement » (:1-7) ; GP n'y a jamais été branché. [LU]

**Chaîne GP réelle** (`S/supabase/proxy.ts`) : public/sans session (:20, :101-103) → `getUser` → `contexte_acces_proxy` (:152) → limite de débit → cul-de-sac module (:171) → routage compte dépôt (:198-223) → si `!isPublic && entreprise_id && acces_support!==true` (:226) : offre/socle `droitOuvertSansModule` (`S/acces-socle-essai.ts:142-151`) OU `acces_module_pour_permission` (M/20260905000265:36-70) sinon 307 `/abonnement/module-non-inclus` (:241-256), puis `droit_acces!==true` → 307 `/dashboard?acces=refuse` (:259-263), puis `droit_gestion` (:265). La garde ne s'applique qu'aux chemins de `MODULE_PERMISSION_PAR_CHEMIN` (`S/module-permissions.ts:1-26`, :144) : `/dashboard`, `/aide`, `/mon-espace`, `/onboarding`, `/en-attente` n'ont aucun `droitRequis` et sont donc ouverts à tout membre connecté. [LU]
Côté serveur : `S/entreprise.ts:131-133,172-203` (abonnement suspendu/annulé/essai expiré, membre non actif → `/en-attente`) ; `S/permissions.ts:16-68` (droits = poste ∩ offre, `[]` si pas de poste).

**Redéfinitions (ordre préfixe)** [LU, grep exhaustif] :
- `a_acces_application` : UNE seule définition, 00234:134. Jamais redéfinie ; seulement ACL (M/20260902000255:7).
- `est_membre_actif` : 00001:148 puis 20260714000075:50-65 (ajoute abonnement ∉ {suspendu, annule}, `suspension_prevue_at`, et `est_acces_support_actif`). Dernière version = 00075.
- `est_acces_support_actif(uuid)` : 00075:30, 00202:219, 00236:79 ; surcharge `(uuid,text)` 00277:1704.
- `habilitations_applications_utilisateurs` : créée 00234:76-95 ; RPC réécrites 00236/00237/00239 (dernière : 00239:243-290, rôle `total` + AAL2 + cible membre actif) ; ACL 00252:39 (aucun DML `authenticated`), 00255:734-737 (`service_role` sans aucun droit).

| Couche | Évaluée par a_acces_application | Évaluée par GP |
|---|---|---|
| Organisation (membre) | `est_membre_actif` (statut + abonnement) | `ue.statut='actif'` (`contexte_acces_proxy`:52) + abonnement dans `entreprise.ts:172` |
| Abonnement/offre | `acces_applications_entreprises` (fenêtre) — indépendant du prix | `entreprises.abonnement_*` + `modules_entreprises` + socle (proxy:241-256) |
| Habilitation/rôle | `habilitations…` + `roles_applications_elsatia.actif` | jamais |
| Permission de poste | jamais | `permissions_poste` (proxy, `permissions.ts`) |

## 2. Rôles `gestion_pro_admin/utilisateur` : consommation

- Seed : 00234:49-50. Libellés : `src/lib/multi-app.ts:26-27`. Tests seuls : `multi-app.test.ts:41`, pgTAP `supabase/tests/elsatia_multi_app_convergence_v1.test.sql:16-19`. Aucune décision de GP ne les lit. [LU]
- Lectures des habilitations GP : sélecteur `applications_autorisees` (00234:176-208 via `S/multi-app-server.ts:84`, `layout.tsx:28`), catalogue plateforme (`multi-app-server.ts:93,124`), `plateforme_lire_entreprise_membres` (00236b), communications ciblées par rôle (00277:1399-1404). Aucune garde d'accès. **Un seul consommateur de décision : le sélecteur.** [LU]
- Backfill/trigger créant habilitation ou droit d'usage :
  - `creer_entreprise_bootstrap` (00104:116-132) : NON. `rejoindre_entreprise_par_code` (00035:38-56) : NON (insère `en_attente_validation`). `activer_compte_employe` (00044:83-149) : NON. `modifier_poste_membre` (00044:180-202) : NON. Stripe/essai (`abonnement_statut` défaut `essai`, 00036:6 ; aucun webhook ni action n'écrit ces tables, grep `src`) : NON.
  - Seuls écrivains : RPC plateforme (00234/00239) et Réserves, qui ne provisionne que `reserves` (00268:920-960, 00269:542, 00270:438-455). [LU]
- Conséquence [INFÉRÉ] : par défaut, AUCUNE entreprise GP n'a de ligne `acces_applications_entreprises('gestion_pro')` ni d'habilitation ; le sélecteur n'y liste pas GP. Bonus : la session d'assistance exige cette ligne (00277:675-686) — sans elle, le support ne peut pas ouvrir de session GP. Argument pour un backfill du droit d'usage indépendamment de tout enforcement.

## 3. Conséquences

**(a) Si GP exigeait `a_acces_application` demain** — perdraient l'accès :
1. Tout membre actif sans habilitation (= tous, cf. §2).
2. Toute entreprise sans ligne `gestion_pro` (= toutes, sauf gestes manuels).
3. Comptes dépôt/borne (`est_compte_depot_courant`, 00076:138) : membres actifs avec poste, sans habilitation → perte de `/stock/borne` (`routage-proxy.ts`).
4. Employés activés par `activer_compte_employe`, membres promus par `modifier_poste_membre`.
5. Cas de désync : suspension d'abonnement (déjà couvert par `est_membre_actif`, doublon sans risque).
À exclure impérativement (chemins publics/machine, [LU] proxy:20,101-103) : toutes les `PUBLIC_PATHS` (pages légales, `/login /signup /auth /mfa /tarifs /paiement /abonnement-suspendu`, portail client `/document`, `/imprimer/partage`, `/api/documents/partage`), webhooks `/api/stripe/{webhook,abonnement/webhook,boutique/webhook}`, `/api/webhooks/notifications-push`, `/api/cron/{abonnements,notifications-push}`, `/api/paiements-bancaires/powens`, `/api/paie/import`. Ces jobs n'ont pas d'`auth.uid()` ; `a_acces_application` dépend d'`auth.uid()` et `service_role` n'a même pas EXECUTE (00255:7). Exclure aussi : `/onboarding`, `/en-attente`, `/abonnement` (souscrire), `/aide`, `/parametres/donnees`, `/api/rgpd/export` (sortie d'essai, `acces-socle-essai.ts:184-189`), `/plateforme*` (admin, `entreprise_id` null → garde sautée), sessions support (`acces_support===true`, proxy:226), `/api/tools/monetization/*` (routes Tools servies par l'app GP, Bearer/Apple/Google — hors périmètre GP).
**(b) Risque inverse actuel** : `plateforme_desactiver_application_entreprise('gestion_pro')` (00239:210-245) met `autorise=false`, retire GP du sélecteur, mais ne bloque rien dans GP. Retrait d'habilitation idem. La suspension, elle, est bien portée par `est_membre_actif` (00075:50) et `entreprise.ts:172-183`. [LU]

## 4. Fichiers concernés

- `src/lib/supabase/proxy.ts` (point d'insertion unique) ; `src/lib/supabase/routage-proxy.ts` (exemptions).
- `M/20260719000117_contexte_acces_proxy.sql` : à NE PAS modifier au palier 0-1 (cible d'un futur `decision_acces_gp`).
- `M/20260826000234`, `…239` (RPC) ; `packages/application-access/src/index.ts:73-147` (client partagé) ; `src/lib/entreprise.ts`, `permissions.ts` (inchangés) ; `src/app/actions/multi-app.ts` (seule voie d'écriture, plateforme) ; `scripts/diagnostics/acces-application-compte.sql` (mesure de l'écart).

## 5. Patch minimal en 3 paliers

**Palier 0 — observation (risque nul, sans SQL)**. Dans `proxy.ts`, après le calcul de `ctx` et uniquement si `!isPublic && ctx.entreprise_id && !ctx.acces_support`, si `ELSATIA_GP_ACCES_APP=observe` : `supabase.rpc("a_acces_application",{p_entreprise_id, p_application_code:"gestion_pro"})` lancé en parallèle (même `Promise` que la limite de débit), résultat comparé à `ctx.droit_acces`/décision finale. Journaliser un événement structuré `{entreprise_id, user_id (haché), chemin, droit_requis, decision_gp, a_acces_app, cause}` — jamais bloquer, `try/catch` absorbe toute erreur (ledger < 234 en Production : la fonction n'existe pas). Échantillonner (ex. 1 %) pour ne pas payer un aller-retour de plus par requête (`contexte_acces_proxy` avait été créé pour l'éviter). Flag absent = off. Tests : fonction pure `comparerDecisions()` (table de vérité 2×2 + exemptions), test proxy « ne change jamais la décision » avec mock RPC qui échoue/expire.

**Palier 1 — backfill + triggers (sans enforcement)**. Migration additive : `acces_applications_entreprises(gestion_pro)` + habilitations pour les membres actifs (§6) ; triggers `after insert/update of statut,poste_id` sur `utilisateurs_entreprises` (SECURITY DEFINER) qui créent l'habilitation à l'activation et `after insert` sur `entreprises` pour la ligne d'usage ; `do nothing` en cas de conflit (jamais écraser un geste plateforme). Flag : aucun (additif), mais le palier 0 doit tourner AVANT pour mesurer l'écart résiduel → cible 0. Tests pgTAP : idempotence (2 exécutions = même état), `creer_entreprise_bootstrap`/`rejoindre`/`activer_compte_employe`/`modifier_poste_membre` produisent l'habilitation attendue, `service_role` inchangé, aucun `modules_entreprises`/prix/offre modifié (comparer hash de ces tables avant/après).

**Palier 2 — enforcement avec exemptions**. `ELSATIA_GP_ACCES_APP=enforce` (défaut `observe`, jamais `enforce` sans 7 jours d'écart = 0 en Production). Dans `proxy.ts`, après le bloc module et avant `droit_acces` : si `!a_acces_application` → 307 vers une page dédiée `/acces-refuse` (message honnête, pas `?acces=refuse` muet). Exemptions : liste §3(a), `acces_support`, `est_plateforme_admin`, compte dépôt (borne), routes de sortie d'essai. Tests : e2e par cas (membre habilité / non habilité / dépôt / support / essai expiré / suspendu / public / webhook), non-régression de la suite GP existante.

## 6. Migration éventuelle (esquisse, aucun n° réservé — placeholder `NEXT_MIGRATION_AFTER_CONVERGED_TRAIN`)

```sql
-- 1. droit d'usage : entreprises non annulées (suspendues INCLUSES : la suspension reste portée par est_membre_actif)
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source)
select e.id,'gestion_pro',true,'backfill_gp_socle'
from public.entreprises e where e.abonnement_statut <> 'annule'
on conflict (entreprise_id,application_code) do nothing;
-- 2. habilitation : membres actifs ; admin = même règle que peut_gerer_acces (00221:222)
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,autorise)
select ue.entreprise_id,ue.utilisateur_id,'gestion_pro',
  case when exists(select 1 from public.permissions_poste pp where pp.poste_id=ue.poste_id
       and pp.entreprise_id=ue.entreprise_id and pp.cle_permission='gerer_utilisateurs' and pp.autorise)
       or lower(p.nom) in ('admin','administrateur','admin/gérant','gérant')
       then 'gestion_pro_admin' else 'gestion_pro_utilisateur' end, true
from public.utilisateurs_entreprises ue left join public.postes p on p.id=ue.poste_id
where ue.statut='actif'
on conflict (entreprise_id,utilisateur_id,application_code) do nothing;
```
**Sans changer prix/plan ?** Oui [LU] : ces tables n'ont aucune colonne de prix/plan ; `capacite_personnes_base` (00256) et le moteur commercial ne les lisent pas ; les commentaires posent que la source commerciale « ne participe pas à la décision » (00234:70-71). Ne JAMAIS écrire `modules_entreprises`, `abonnement_offre`, `capacite_*`. Effets visibles à annoncer : GP apparaît dans le sélecteur de tous les membres ; compteurs « entreprises autorisées / utilisateurs habilités » du catalogue plateforme et de l'annuaire (`plateforme-annuaire-serveur.ts:325`, `plateforme-fiche-entreprise.ts:204`) montent ; l'assistance peut désormais cibler GP (00277:675-686). Écrire via migration (`service_role` n'a aucun droit, 00255:734-737 ; `authenticated` non plus, 00252:38-39). Aucun historique ajouté par défaut : ajouter une ligne `historique_acces_applications` « backfill » (traçabilité).

## 7. Risques historiques et retour arrière

- Habilitation manquante après le backfill (membre activé entre-temps, poste `null` → `en_attente`) : couvert par triggers palier 1 + palier 0 de mesure.
- Comptes dépôt : `gestion_pro_utilisateur` est le seul rôle non-admin ; à confirmer produit.
- Entreprise sans `entreprise_active_id` cohérent, ou dont un `abonnement_statut` passe de `annule` à actif : le trigger `entreprises` doit couvrir le changement de statut, pas seulement l'insert.
- Production au ledger 210 (mémoire projet) : tables absentes → aucun palier 1-2 avant migration ; palier 0 doit tolérer l'erreur.
- Retour arrière : palier 2 → `ELSATIA_GP_ACCES_APP=observe` (variable d'environnement : redéploiement Vercel requis, ou flag en base pour un retour instantané). Palier 1 → les lignes portent `source='backfill_gp_socle'` (entreprises) ; pour les habilitations, `attribue_par is null` + horodatage de la migration sert de marqueur : suppression ciblée possible ; les triggers se retirent par `drop trigger`. Palier 0 → retirer la variable.

## 8. Non trivial — hors petit lot

- Fusionner `contexte_acces_proxy` et `a_acces_application` en une `decision_acces_gp` unique avec motifs (l'audit préconise `decision_acces_application`, `ELSATIA_APP_FIRST_ACCESS_AUDIT_V1.md:103`).
- Modèle d'admin des habilitations côté entreprise : aujourd'hui seul un admin plateforme `total` + AAL2 peut habiliter (00239:251-252) ; l'admin d'entreprise ne peut pas. Il faut une RPC/UX dans `/parametres/acces` avant `enforce`, sinon chaque nouvel employé exige un geste ELSATIA.
- Rôles `gestion_pro_*` vs postes/permissions : décider si le rôle applicatif REMPLACE ou COMPLÈTE le poste (aujourd'hui le rôle n'a aucun effet sur les droits fins).
- Alignement des chaînes abonnement/offre (`modules_entreprises`) sur `acces_applications_entreprises` : commercial/prix, à traiter avec le Train V3 (figement du contrat de prix), pas ici.
- Support/assistance, admin plateforme AAL2, compte dépôt, portail public : arbitrages propres.
- Alignement de la Production (ledger 210) sur le socle 234+.
