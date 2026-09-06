# ELSATIA-GP-FIRST-WEEK-POSTFIX-REVALIDATION-V1

Rejeu de l'audit « première semaine client » **sur le correctif**
`ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-CAPACITY-FIX-V1`.

| | |
|---|---|
| Commit audité | `f34601a6fe070bf6af480bb27315d82bc838c0c4` |
| Base historique | `996be15` |
| Branche d'audit | `audit/gp-first-week-postfix-revalidation-v1` (worktree isolé) |
| Ledger migrations | **263** (inchangé) |
| Code modifié | **NON** (`git status` vide, `git diff f34601a` vide) |
| Production / Stripe Live / migration | **AUCUNE** |
| Audit précédent | `ELSATIA-GP-FIRST-WEEK-CUSTOMER-OPERABILITY-AUDIT-V1` — verdict NO-GO |

## 0. Périmètre et limites de la revalidation

Vérification faite par **analyse de source + exécution de la suite de tests + sonde
programmatique** sur la matrice d'accès réelle (`droitOuvertSansModule`,
`MODULE_PERMISSION_PAR_CHEMIN`, `droitsGestionPour`).

**Limite explicite :** le démon Docker n'est pas démarré sur cette machine, donc
`supabase start` / `supabase test db` / Playwright E2E n'ont **pas** pu être exécutés.
Le contrat SQL (trigger `trg_capacite_personnes_actives`, RPC
`acces_module_pour_permission`, `capacite_personnes_base`,
`plateforme_definir_capacite_personnes_supplementaire`) est vérifié **par lecture des
migrations**, pas par exécution. Aucune conclusion ci-dessous ne repose sur une
supposition non tracée jusqu'au fichier de migration.

---

## 1. SOCLE — entreprise en essai valide, aucune offre, aucun module, aucun geste plateforme

`PERMISSIONS_SOCLE` est dérivé de la grille canonique (offre d'entrée `mini`), jamais
codé en dur :

```
acces_dashboard, acces_messagerie, acces_clients, acces_chantiers, acces_devis,
acces_factures, acces_facturation_avancee, acces_planning, acces_ia, acces_employes
```

Sonde d'accès (essai débuté le 2026-09-01, évalué au 2026-09-10, `abonnement_offre = null`,
zéro ligne `modules_entreprises`) :

| Route | Droit d'accès | Accès | Droit de gestion |
|---|---|---|---|
| `/dashboard` | — | OUVERT (aucun droit module) | n/a |
| `/clients` | `acces_clients` | OUVERT | OUVERT |
| `/chantiers` | `acces_chantiers` | OUVERT | OUVERT |
| `/devis` | `acces_devis` | OUVERT | OUVERT |
| `/prestations` | `acces_devis` | OUVERT | OUVERT |
| `/factures` | `acces_factures` | OUVERT | OUVERT |
| `/facturation-avancee` | `acces_facturation_avancee` | OUVERT | OUVERT |
| `/planning` | `acces_planning` | OUVERT | OUVERT |
| `/employes` | `acces_employes` | OUVERT | OUVERT |
| `/messagerie` | `acces_messagerie` | OUVERT | OUVERT |
| `/aide` | — | OUVERT (aucun droit module) | n/a |
| `/abonnement` | `acces_parametres` | OUVERT | OUVERT |
| `/parametres` | `acces_parametres` | OUVERT | OUVERT |

Les **deux** gardes de `src/lib/supabase/proxy.ts` (garde de route et
`permissionOuvertePourEntreprise`) consomment la même décision centrale
`droitOuvertSansModule`. `src/lib/permissions.ts` ne filtre rien quand
`abonnement_offre` est nul (`permissionIncluseDansOffre` renvoie `true`) : aucun
second filtre serveur ne peut re-fermer le SOCLE.

**Verdict §1 : FERMÉ.** Les 9 domaines demandés sont accessibles, en lecture ET en
écriture, sans SQL, sans geste plateforme.

## 2. Modules optionnels — aucun élargissement accidentel

Sonde : sur les 25 permissions `PERMISSIONS_HORS_SOCLE`, **0** est ouverte par le
correctif (`droitOuvertSansModule` → `[]`). Le correctif est strictement additif et
borné au périmètre `mini`.

Contrat effectif de l'essai (inchangé, hérité de `ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1`,
migration `20260905000265`) : la branche « essai » de `acces_module_pour_permission`
ouvre en plus les modules `modules_gestion_pro` dont `statut_catalogue = 'actif'` —
`pointage`, `notes_frais`, `vehicules`, `materiel`, `stock`, `rentabilite_avancee`,
`chantier`, `ia`. Ce n'est **pas** un effet du correctif, c'est la politique d'essai
existante.

Restent fermés pendant l'essai (aucun module `actif` ne les couvre) : `acces_achats`,
`acces_interventions`, `acces_crm`, `acces_ouvrages`, `acces_appels_offres`,
`acces_sous_traitants`, `acces_paiements_bancaires`, `acces_connecteurs`,
paie (`consulter_sa_paie`, `gerer_paie`, …), `voir_devis_chantier_sans_prix`,
`demander_ses_conges`.

**Verdict §2 : FERMÉ.** Contrat préservé à l'identique.

## 3. Premier parcours

| Étape | État | Intervention manuelle |
|---|---|---|
| signup | `supabase.auth.signUp`, métadonnées nom/prénom/code/offre | aucune |
| confirmation e-mail | Supabase Auth (`emailRedirectTo`), pas Brevo | aucune (dépend du SMTP Supabase configuré) |
| login | `signInWithPassword`, redirection `/plateforme` si admin plateforme | aucune |
| création entreprise | RPC atomique `creer_entreprise_bootstrap` : entreprise + 9 rôles prédéfinis + poste Gérant + membre actif + entreprise active | aucune |
| essai | trigger `initialiser_essai_entreprise` : `essai_debut = created_at`, `essai_fin = debut + 30` ; `abonnement_statut` défaut `'essai'` | aucune |
| onboarding besoins | `/onboarding/besoins` (questionnaire ou recommandation directe si offre pré-choisie) | aucune |
| client, chantier, devis | SOCLE ouvert (cf. §1) ; le Gérant a `tous_les_droits` | aucune |
| envoi devis | `envoyerDocumentCommercialParEmail` (Brevo + lien signé `/document/[token]` + PDF ≤ 8 Mo) **ou** repli `mailto` toujours disponible | aucune |
| facture | idem devis | aucune |
| avoir | `/facturation-avancee` → `creer_facture_avancee(p_type='avoir')`, imputation sur facture d'origine | aucune |
| employé | `/employes`, pré-contrôle `verifierCapacitePersonnes` | aucune sous 3 personnes |
| planning | `/planning` ouvert | aucune |
| aide | `/aide` — messagerie support intégrée, aucune permission module requise | aucune |

**Verdict §3 : aucune intervention manuelle dans le parcours nominal.**

## 4. Capacité

`capacite_personnes_base` normalise une entreprise sans offre vers `mini` →
`plans_abonnement.mini.utilisateurs_inclus = 3`. Le fondateur n'est **pas** inséré dans
`employes` par le bootstrap : les 3 places sont intégralement disponibles.

| Scénario | Comportement |
|---|---|
| 1 personne | OK |
| 3 personnes | OK, limite atteinte |
| 4ᵉ personne | Refus. Pré-contrôle applicatif `verifierCapacitePersonnes` (4 points d'appel dans `actions/employes.ts`) + garde-fou DUR `trg_capacite_personnes_actives` |

Message produit sous `ABONNEMENTS_PUBLICS_OUVERTS=false`, offre nulle, pas d'abonnement
Stripe → `actionsQuotaPersonnes` = **[archiver, contacter ELSATIA]**. Ni `/abonnement#choisir-offre`,
ni « ajouter de la capacité » ne sont proposés. **Aucun faux CTA.**

Action opérateur : `/plateforme` → formulaire « Places supplémentaires » (valeur absolue +
motif ≥ 5 caractères) → RPC `plateforme_definir_capacite_personnes_supplementaire`
(plateforme + AAL2, journalisée dans `historique_capacite_personnes`).

**Gestes opérateur pour dépasser 3 personnes : 1** (le formulaire), précédé d'une session
AAL2. **Zéro SQL.**

**Verdict §4 : FERMÉ.**

## 5. Quota / `ABONNEMENTS_PUBLICS_OUVERTS=false`

- `/abonnement/module-non-inclus` : CTA « Comparer les offres » remplacé par « Contacter
  ELSATIA » ; alerte explicite si un droit du SOCLE y atterrit (ne devrait plus arriver).
- `/abonnement` § « Choisir une offre » : bandeau « La souscription en ligne est
  temporairement fermée », chaque carte d'offre → « Ouverture prochaine » vers le contact.
- Messages de quota : cf. §4, aucune action impossible.
- Repli générique `erreurs-utilisateur.ts` : « archivez une personne […] ou contactez le
  support », plus « changez d'offre ».

**Réserve P2 :** le bandeau d'essai de `/abonnement` conserve une ancre « Choisir une offre »
qui mène à une section fermée, et son énumération des accès d'essai (« chantiers, pointage,
notes de frais, véhicules, matériel, stock, rentabilité avancée, assistant IA ») n'a pas été
mise à jour avec le SOCLE réellement ouvert par le correctif (clients, devis, factures,
facturation avancée, planning, employés, messagerie).

**Verdict §5 : FERMÉ**, avec une réserve de formulation P2.

## 6. Essai expiré (jour 31)

`getContexteEntreprise` : `essaiExpireSansOffre = statut 'essai' && essai_fin < now`
→ `redirect("/abonnement-suspendu?motif=essai_expire")` pour **tout chemin sauf
`/abonnement`** (`CHEMIN_EXEMPTE_ESSAI_EXPIRE`, valeur unique).

| Point | Constat |
|---|---|
| Accès | Coupé (comportement voulu). Côté proxy, `essaiEnCours` est faux → SOCLE refermé : cohérent, pas de fuite d'API. |
| Message | Page dédiée, distincte de l'impayé, sans portail Stripe : « Votre essai gratuit est terminé […] vos données restent intégralement conservées ». |
| Récupération des données | **DÉFAUT.** `/parametres/donnees` et `/api/rgpd/export` appellent tous deux `getContexteEntreprise()` → redirigés. Le client ne peut pas récupérer ses données lui-même, alors que la page lui promet qu'elles sont conservées. Contournement : l'opérateur ouvre une session support (`acces_support = true` neutralise `essaiExpireSansOffre`) et exporte pour lui → **action opérateur**, pas SQL. |
| Aide / support | **DÉFAUT.** `/aide` n'est pas exempté : la messagerie support devient injoignable exactement au moment où le client doit agir. Seul canal restant : le lien externe `https://elsatia.fr/contact`. |
| Possibilité d'action | `/abonnement` est atteignable, mais sous `ABONNEMENTS_PUBLICS_OUVERTS=false` il n'y propose que « Ouverture prochaine » → contact. |
| Prolongation d'essai | **DÉFAUT.** `abonnement_essai_fin` n'est écrit que par le trigger d'insertion. `plateforme_modifier_abonnement` ne pilote que `statut` / `echeance` / `note`, et **aucun écran plateforme ne fixe `abonnement_offre`**. Passer `statut='actif'` sans offre **referme** le SOCLE (`essaiEnCours` exige `'essai'`, et aucune ligne `modules_entreprises` n'existe) : le contournement apparent aggrave la situation. Prolonger un pilote au-delà de 30 jours exige donc du **SQL manuel**. |
| Préavis | **DÉFAUT.** Aucun cron, aucun e-mail, aucune notification d'essai expirant (ni client, ni opérateur). La falaise du jour 31 arrive en silence. |

**Verdict §6 : l'expiration coupe trop brutalement le support et la réversibilité.**
Hors fenêtre « première semaine », mais bloquant pour tout pilote dépassant 30 jours.

## 7. E-mail

| Flux | Transport | État |
|---|---|---|
| signup / confirmation | Supabase Auth SMTP | dépend de la configuration SMTP du projet Supabase |
| mot de passe oublié | Supabase Auth SMTP | idem |
| devis / facture / avoir | Brevo (`envoyerEmailBrevo`) + lien signé `/document/[token]` + PDF ≤ 8 Mo | opérationnel |
| partage document | token `/document/[token]` + `/imprimer/partage/[token]` (chemins publics) | opérationnel |
| relances | `relances-moteur.ts`, `actions/relances.ts`, `suite-metier.ts` | opérationnel |
| erreurs Brevo | non configuré → « L'envoi automatique par e-mail n'est pas encore configuré » ; HTTP non-2xx → `Envoi email impossible (Brevo a répondu <status>)`. Les deux remontent dans `EmailDocumentButton` sans casser la page. Échec de génération PDF → l'e-mail part quand même avec le lien. | dégradation propre |
| repli | « Ouvrir ma messagerie » (`construireLienMailto`) toujours disponible, marque le document comme envoyé | **le client n'est jamais bloqué par une panne Brevo** |

Aucun envoi Production déclenché pendant cet audit ; vérification par lecture de code et
par les tests unitaires (`brevo.test.ts`, `email.test.ts`).

**Verdict §7 : FERMÉ.**

## 8. Support (au ledger 263, lot 264 « e-mail support » hors cutover)

- Client : `/aide` — fil de messages `support_messages_entreprise`, marquage lu automatique.
- Opérateur : `/plateforme/support` — liste des fils, compteur `non_lus`, badge rouge.
- **Aucune notification sortante** : ni e-mail, ni push, ni alerte. Julien ne sait qu'un
  client a écrit **que s'il ouvre la page**.

**Julien peut-il surveiller correctement le premier pilote ?** Oui, à la condition
explicite d'une **relève manuelle quotidienne** de `/plateforme/support`. C'est tenable
pour 1 pilote, fragile à 5, non tenable à 10 (cf. §11) — ce qui est précisément la
justification du lot 264.

## 9. Recovery

| Scénario | État | Classement |
|---|---|---|
| Mot de passe oublié | `/mot-de-passe-oublie` + `/nouveau-mot-de-passe` (chemins publics) | AUTONOME |
| Reset par l'opérateur | `/plateforme` → `reinitialiserMotDePassePlateformeAction` (e-mail + motif obligatoire) | ACTION OPÉRATEUR |
| Session expirée | proxy Supabase SSR, refresh cookie ; redirection `/login` | AUTONOME |
| Second admin **client** | `/parametres/acces` + `/employes` : le Gérant a `gerer_utilisateurs` | AUTONOME |
| Second admin **plateforme** | **DÉFAUT.** `plateforme_ajouter_admin` est câblée (crée une identité `en_attente`), mais `plateforme_rattacher_admin` et `plateforme_activer_admin` **n'ont aucun câblage applicatif** (0 occurrence dans `src/`). Créer un second administrateur plateforme exige **du SQL**. | INTERVENTION TECHNIQUE |
| MFA opérateur | `/parametres/securite` (`MfaSecurityPanel`, enrôlement TOTP) + `/mfa/challenge` (step-up) ; `plateforme_exiger_session_aal2()` appliquée sur 64 points d'appel | AUTONOME |

**Conséquence du défaut « second admin plateforme » : bus factor = 1.** Perte du facteur
MFA de Julien ⇒ plus aucune action plateforme possible (capacité, support, abonnements)
sans intervention en base. À traiter **une fois, avant le pilote**, comme étape
d'installation — pas dans le fonctionnement courant.

## 10. Observabilité et checklist quotidienne

| Source | État |
|---|---|
| Sentry | `sentry.server.config.ts` / `.edge` / `instrumentation-client.ts`, `enabled: NODE_ENV==='production' && dsn`, `tracesSampleRate 0.1`, tunnel `/monitoring` |
| Logs | `console.error` serveur (Vercel) — pas de canal dédié |
| Audit DB | `journal_activite`, `journal_ia`, `journal_abus_securite`, `journal_audit_paie`, `journal_audit_notes_frais`, `journal_paiements_bancaires`, `historique_capacite_personnes` |
| Stripe plateforme | `/plateforme/facturation`, `verify:stripe-prices` — **gelé** (`ABONNEMENTS_PUBLICS_OUVERTS=false`, mode Test) |
| Support | `/plateforme/support`, compteur `non_lus` — **poll manuel** |
| Actions capacité | écriture journalisée dans `historique_capacite_personnes` — **aucun écran de lecture** (relecture = SQL) |
| Santé applicative | aucun endpoint `/health`, aucun cron de surveillance d'essai |

### Checklist quotidienne opérateur (pilote GP, ledger 263)

1. `/plateforme/support` — traiter tout fil avec badge rouge (`non_lus > 0`).
2. Sentry — trier les nouvelles issues serveur/edge des 24 h ; escalader toute erreur 5xx récurrente.
3. `/plateforme` — pour chaque entreprise pilote : statut d'abonnement, **jours restants d'essai**
   (surveillance manuelle : aucun préavis automatique — noter J-7 et J-1 dans un agenda).
4. `/plateforme` — capacité : traiter les demandes de places supplémentaires (formulaire, motif obligatoire).
5. Stripe — vérifier qu'**aucun** paiement Live n'a été déclenché (gel commercial).
6. Logs Vercel — relire les échecs `envoyerEmailBrevo` et `genererPdfDepuisUrl` de la veille.
7. Une fois par semaine : `verify:migrations` + `verify:secrets` sur la branche déployée ;
   confirmer ledger = 263.

## 11. Temps opérateur (avec le correctif)

Estimations, hypothèse : `ABONNEMENTS_PUBLICS_OUVERTS=false`, pilotes dans leur
fenêtre de 30 jours.

| Charge | Support normal (métier) | Intervention technique | Total /jour |
|---|---|---|---|
| 1 client pilote | 10–15 min (relève support + réponse) | **0** | ~15 min |
| 5 clients | 30–45 min | **0** en régime nominal ; ponctuellement une prolongation d'essai (SQL) | ~45 min |
| 10 clients | 60–90 min — la relève manuelle du support devient le goulot | **0** en régime nominal ; les expirations d'essai se cumulent et deviennent récurrentes | ~1 h 30 |

Les actions capacité (`/plateforme`) sont comptées dans le support normal : elles
n'exigent ni SQL ni déploiement. La seule intervention **technique** structurelle du
cycle de vie reste la prolongation d'essai au-delà de J30 (§6).

## 12. Classement d'autonomie

**AUTONOME** — signup, confirmation, login, création d'entreprise, onboarding, clients,
chantiers, devis, envoi (Brevo ou mailto), factures, avoirs, employés (≤ 3), planning,
messagerie, aide, mot de passe oublié, session expirée, second admin client, MFA opérateur,
export RGPD (pendant l'essai).

**ASSISTANCE MÉTIER** — questions d'usage via `/aide` ; recommandation d'offre
(`/onboarding/besoins`) ; accompagnement au paramétrage.

**ACTION OPÉRATEUR** — capacité > 3 personnes (`/plateforme`) ; réinitialisation de mot de
passe salarié ; entrée en session support ; remise / statut d'abonnement ; export RGPD au
nom d'un client dont l'essai est expiré.

**INTERVENTION TECHNIQUE** — prolongation d'un essai au-delà de J30 (§6) ; attribution
d'une `abonnement_offre` hors Stripe ; création d'un second administrateur plateforme (§9).

**Objectif « INTERVENTION TECHNIQUE = 0 dans le fonctionnement normal » : ATTEINT** pour
la fenêtre d'essai de 30 jours, qui est le périmètre du pilote. **NON ATTEINT** pour le
cycle de vie complet (J31) et pour la mise en place initiale (second admin).

## 13. Commercialisation

**A. Pilote gratuit / essai — READY.** Aucun chemin payant requis, aucun Stripe Live,
aucune TVA. Le correctif ferme le blocage qui rendait le pilote inopérable.

**B. Premier client payant — NON READY.** Restent ouverts :
- `ABONNEMENTS_PUBLICS_OUVERTS=false` (gel volontaire) ;
- Stripe en mode Test (`STRIPE_WEBHOOK_EXPECTED_MODE`, Price IDs Test), `verify:stripe-prices` à repasser en Live ;
- `STRIPE_AUTOMATIC_TAX_ENABLED=false` par défaut → TVA à câbler et à valider ;
- aucun écran plateforme ne fixe `abonnement_offre` : la souscription passe obligatoirement par Stripe ;
- réconciliation commerciale hors dépôt : la grille canonique de l'application est
  **79 / 249 / 449 / 599** (`docs/organisation/TARIFICATION_CANONIQUE.md`, qui déclare
  69/199/399 « obsolète, jamais câblée ») — à confirmer côté site vitrine `elsatia.fr`,
  dépôt séparé.

## 14. Classement P0 / P1 / P2

Critère P0 retenu : *un pilote normal est réellement bloqué*.

### P0 — aucun

Les trois P0 de l'audit précédent sont fermés :
- P0-1 SOCLE refusé pendant l'essai → **fermé** (§1, §2, sonde) ;
- P0-2 capacité impossible sans SQL → **fermé** (§4, RPC câblée) ;
- P0-3 faux CTA sous commercialisation fermée → **fermé** (§5).

Aucun nouveau P0 découvert.

### P1

| # | Constat | Localisation |
|---|---|---|
| P1-1 | Jour 31 : `/aide` non exempté — le client perd le canal support au moment d'agir | `src/lib/entreprise.ts` (`CHEMIN_EXEMPTE_ESSAI_EXPIRE`, valeur unique) |
| P1-2 | Jour 31 : export RGPD injoignable alors que la page promet la conservation des données | `src/app/api/rgpd/export/route.ts`, `src/app/(app)/parametres/donnees/page.tsx` |
| P1-3 | Prolonger un essai (ou attribuer une offre hors Stripe) exige du SQL ; `statut='actif'` sans offre **referme** le SOCLE | `plateforme_modifier_abonnement`, `src/app/actions/plateforme.ts` |
| P1-4 | Second administrateur plateforme impossible sans SQL (`plateforme_rattacher_admin` / `plateforme_activer_admin` non câblées) → bus factor 1 | `src/app/(app)/plateforme/page.tsx` |
| P1-5 | Navigation non filtrée par entitlement module : ~14 entrées visibles mènent au cul-de-sac `/abonnement/module-non-inclus` pendant l'essai | `src/app/(app)/layout.tsx`, `src/components/Sidebar.tsx` |
| P1-6 | Aucun préavis d'expiration d'essai (ni client, ni opérateur) : la coupure J31 est silencieuse | `src/app/api/cron/abonnements/route.ts` |
| P1-7 | Support sans notification sortante : la surveillance repose sur une relève manuelle (objet du lot 264, hors cutover) | `/plateforme/support` |

### P2

| # | Constat |
|---|---|
| P2-1 | Bandeau d'essai `/abonnement` : ancre « Choisir une offre » vers une section fermée ; énumération des accès d'essai non mise à jour avec le SOCLE |
| P2-2 | `historique_capacite_personnes` écrit mais sans écran de lecture (relecture = SQL) |
| P2-3 | `definirModuleEntrepriseAction` volontairement non câblée (documentée dans le correctif) |
| P2-4 | Aucun endpoint de santé applicative (`/health`) |
| P2-5 | 3 avertissements ESLint préexistants `@next/next/no-img-element` (`boutique`, `SignatureEmploye`) |

**Conformément au §16 du lot : aucun de ces points n'a été corrigé ici.**

## 15. Tests et vérifications

| Contrôle | Commande | Résultat |
|---|---|---|
| Tests GP | `vitest run` | **94 fichiers / 867 tests — PASS** |
| Tests Outils | `npm --prefix apps/tools run test` | **20 fichiers / 107 tests — PASS** |
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Lint | `npm run lint` | **PASS** (0 erreur, 3 warnings préexistants) |
| Build | `npm run build` | **PASS** (exit 0, GP + Outils) |
| Migrations | `npm run verify:migrations` | **263 migrations valides**, noms et horodatages uniques |
| Secrets | `npm run verify:secrets` | **1309 fichiers contrôlés, aucun secret reconnu** |
| Espaces parasites | `git diff --check` | **PASS** |
| Sonde d'accès (temporaire, supprimée) | `vitest run` sur `droitOuvertSansModule` | matrices §1 et §2 |

`supabase test db` et Playwright E2E **non exécutés** : démon Docker indisponible (§0).

## 16. Modifications

Aucune. `git status` vide, `git diff f34601a` vide, HEAD = `f34601a`. Le seul fichier
ajouté par ce lot est le présent rapport, dans `docs/audits/`.

## 17. Verdict

Le correctif fait ce qu'il annonce : un pilote GP en essai valide travaille de bout en
bout — clients, chantiers, devis, envoi, factures, avoirs, employés, planning, messagerie,
aide — **sans SQL manuel et sans intervention technique**, et l'ajustement de capacité
au-delà de 3 personnes est devenu un geste opérateur unique dans `/plateforme`. Les
modules réellement optionnels n'ont pas bougé d'un pouce.

Les défauts qui subsistent (P1-1 à P1-7) portent tous sur la **sortie** de l'essai, la
**résilience de l'opérateur** et le **confort de navigation** — aucun ne bloque un pilote
dans son fonctionnement normal.

`ELSATIA-GP-FIRST-WEEK-POSTFIX-REVALIDATION-V1 VALIDÉ — PILOTE GP OPÉRABLE SANS INTERVENTION TECHNIQUE`
