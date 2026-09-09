# ELSATIA-GP-SAFE-DEMO-CAPTURE-ENVIRONMENT-AUDIT-V1

**Date** : 2026-09-06 · **Mode** : audit / préparation uniquement · **Production touchée** : NON
**Objet** : définir l'environnement le plus sûr pour produire 5 captures de Gestion Pro
(tableau de bord desktop, chantiers desktop, devis desktop, planning desktop, mes travaux mobile)
avec **uniquement des données fictives**.

---

## 1. Solutions trouvées

### Existant audité

| Élément | Ce qu'il fait réellement | Utilisable pour les captures ? |
|---|---|---|
| `scripts/capturer-guide.mjs` | Playwright headless, se connecte réellement sur `/login`, photographie 36 sections en desktop (1440×1000, dSF 1) et mobile (390×844, dSF 3). Cadrage : rogne la barre latérale hors dashboard, plafonne la hauteur à 1100 px (desktop) / 844 px (mobile). Écrit `output/audit/*.png` + `manifeste.json`. Cible pilotée par `ELSATIA_AUDIT_URL/EMAIL/PASSWORD`. | **Oui comme socle**, non tel quel : les formats produits sont 1440×1000 et 1170×2532, pas 2560×1600 / 780×1688 (voir §7). |
| `scripts/seed-elsatia-preview-year.mjs` | Une année de données fictives marquées `RECETTE_ELSATIA_PREVIEW_2025_2026` / `DOCUMENT FICTIF…`. **Verrouillé en dur sur le projet Supabase Preview `pgvvpqyjziyapbbkydmc`** : `safeEnvironment()` refuse toute autre URL, tout autre `SUPABASE_PROJECT_REF`, tout autre nom de projet ; `--execute` exige `--confirm=PEUPLER_pgvvpqyjziyapbbkydmc_…`. | **Non en local** (impossible de le pointer ailleurs, par conception). Utilisable seulement contre le cloud Preview. |
| `scripts/seed-demo-history.mjs` | Complète un historique via la RPC `dev_contexte_entreprise`. | **Non** : cette RPC a été **supprimée** par `20260714000078_fermeture_acces_anonyme_production.sql`. Script mort sur toute base à jour. |
| `supabase/production/creer_entreprise_demo_18_mois.sql` | Crée une entreprise **autonome** `reference_interne='DEMO-18M'` avec 18 mois d'historique : 7 postes, 12 employés, 30 clients, 30 chantiers, 108 devis, 72 factures + paiements, 2 340 affectations et 2 340 pointages, 8 fournisseurs, 30 articles de stock, 8 véhicules, 24 outils. Tout est marqué `[DEMO 18M]`, références `DEMO-*`, e-mails `@example.test`, SIRET `99999999999999`. Idempotent. | **Oui — c'est la meilleure base**, après correction (voir §9, défaut D1). |
| `supabase/production/seed_entreprise_test_5_ans.sql` (+ `…_tous_onglets`, `…_suivi_terrain`) | 5 exercices de données. | **Non en l'état** : ces scripts **exigent une entreprise « Entreprise Test » et un compte admin préexistants** ; ils ne créent pas l'entreprise. Non autonomes. |
| `supabase/tests/fixtures/isolation_multitenant.inc` + `scripts/e2e/prepare-local-recipe.sql` | Créent des utilisateurs `auth.users` locaux (`…@invalid.local`, mot de passe `test`), leurs identités GoTrue, et les rattachent à des entreprises de recette. | **Oui comme patron** pour fabriquer le compte de démonstration local sans jamais demander de mot de passe à Julien. |
| `scripts/garde-scripts-production.mjs` | Garde-fou : n'autorise l'exécution des SQL de `supabase/production/` que si `SUPABASE_PROJECT_REF` **et** l'hôte de `NEXT_PUBLIC_SUPABASE_URL` **et** la ref liée par la CLI valent toutes `pgvvpqyjziyapbbkydmc` (Preview). Toute autre cible, Production comprise, est refusée par défaut. | Confirme que rien ne peut partir vers Production par ce chemin. |
| `docs/organisation/DEMO_COMMERCIALE.md` | Documente l'entreprise `DEMO-18M` telle qu'elle existe **en Production** (renommée « Atelier Bâtiment Lyonnais », compte `julien.gregurec+demo-elsatia@gmail.com`). | **À ne pas utiliser ici** : c'est la base Production. Le *script* est réutilisable, pas l'instance. |

### État réel de la machine (vérifié, lecture seule)

- Supabase **local déjà démarré** : API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio `54323`, Mailpit `54324`, projet `btp-platform`.
- Base locale **à jour** : dernière migration appliquée `20260905000265`, 265 migrations, 100 permissions au catalogue.
- Contenu local actuel : 3 entreprises (`Sentinelle Drill Production`, `ELSATIA TEST Multi-App A/B`), 4 comptes `auth.users`. **Aucune entreprise `DEMO-18M`.**
- `.env.development.local` pointe déjà sur `http://127.0.0.1:54321` (priorité Next.js sur `.env.local`), donc `npm run dev` attaque **la base locale**, jamais Production.
- `supabase/.temp/project-ref` = `pgvvpqyjziyapbbkydmc` (**Preview**, pas Production) — aucun `--linked` ne peut viser Production sans changer ce fichier.
- Serveur de développement démarré pendant l'audit : `http://127.0.0.1:3000/login` répond **HTTP 200**, titre « ELSATIA Gestion Pro ». Aucune écriture effectuée.
- Playwright 1.62.1 + Chromium installés.
- `auth.email.enable_confirmations = false` en local : **aucune confirmation d'e-mail** nécessaire pour un compte de démonstration local.

---

## 2. Comparaison des environnements

| | A. Supabase **local** | B. Supabase **Preview** (cloud) | C. Mocks applicatifs | D. Environnement dédié temporaire |
|---|---|---|---|---|
| **Sécurité** | **Maximale** : base dans Docker sur le poste, aucun réseau sortant, aucune donnée réelle, aucun tiers (Stripe/Brevo) atteignable | Bonne mais **cloud partagé** : projet réel, données persistantes, visibles de toute personne ayant les clés | Maximale mais artificielle | Bonne, mais nouveau projet cloud à créer/détruire |
| **Fidélité visuelle** | **Totale** : le vrai code, les vraies RLS, les vraies RPC, le vrai rendu | Totale | **Faible** : il faudrait mocker RPC, RLS, permissions — risque de capturer un écran qui n'existe pas vraiment | Totale |
| **Temps** | **Court** : stack déjà démarrée, migrations à jour ; reste 3 livrables (§6/§7) | Moyen : seed d'une année, quotas réseau, allers-retours | Long : réécrire les couches de données | Long : création projet, migrations, seed |
| **Risque** | **Très faible** : aucun chemin vers Production ; garde-fous déjà en place | Moyen : pollue un projet partagé, `julien.gregurec@gmail.com` codé en dur comme gérant du jeu Preview | Moyen : capture non représentative → risque commercial (montrer un écran qui n'existe pas) | Moyen : nouveau secret, nouvelle surface à nettoyer |
| **Reproductibilité** | **Excellente** : `supabase db reset` + SQL idempotent = jeu identique à volonté | Bonne (script idempotent) mais dépend du cloud | Mauvaise | Bonne mais coûteuse |

**Classement** : **A ≫ D > B ≫ C**.

---

## 3. Solution recommandée

**A. Supabase local (`btp-platform`, déjà démarré), entreprise de démonstration `DEMO-CAPT` créée par un script SQL local dédié, dérivé de `creer_entreprise_demo_18_mois.sql`.**

Trois livrables à construire (aucun n'existe encore) :

1. `supabase/local/creer_entreprise_demo_captures.sql` — copie corrigée et augmentée du script 18 mois (corrections D1 + D2 ci-dessous), placée **hors de `supabase/production/`** pour qu'elle reste hors du registre du garde-fou et ne puisse jamais être poussée vers un projet distant.
2. `supabase/local/compte_demo_captures.sql` — le compte de connexion local (patron `isolation_multitenant.inc` + `prepare-local-recipe.sql`).
3. `scripts/capturer-site-elsatia.mjs` — variante de `capturer-guide.mjs` produisant exactement les 5 images aux formats demandés.

---

## 4. Base de données utilisée

**Supabase local uniquement** : `http://127.0.0.1:54321` / `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, projet Docker `btp-platform`.

- Jamais Production (`exhvuzegsefmoguxoiak`).
- Jamais Preview (`pgvvpqyjziyapbbkydmc`).
- Les clés locales sont les clés de développement publiques de Supabase CLI, identiques sur toutes les installations : elles n'ouvrent rien d'autre que ce conteneur.

---

## 5. Données fictives nécessaires

Le script 18 mois couvre déjà **tout** ce qu'exigent les 5 écrans :

| Écran | Ce qu'il lit réellement | Couvert par le jeu 18 mois |
|---|---|---|
| Tableau de bord | devis, factures + paiements, chantiers, stock, véhicules, outils, commandes fournisseurs, **affectations à venir (`date >= aujourd'hui`)**, notifications | Oui, **sauf les affectations à venir** → défaut D2 |
| Chantiers | 30 chantiers, statuts `facture` / `termine` / `en_cours` / `accepte` | Oui |
| Devis | 108 devis (`accepte` / `envoye` / `refuse`), 3 lignes chacun, montants TTC calculés | Oui |
| Planning | affectations de la **semaine courante** (`lundi()` = aujourd'hui, param `?semaine=YYYY-MM-DD` accepté) | Non par défaut → défaut D2 |
| Mes travaux (mobile) | RPC `mes_devis_chantiers_sans_prix` : exige la permission `voir_devis_chantier_sans_prix` **et** un `employes.utilisateur_id = auth.uid()` rattaché à des chantiers | Données oui, **rattachement du compte à un employé à créer** |

**Nommage.** Le jeu existant est déjà manifestement fictif (`[DEMO 18M]`, `DEMO-*`, `@example.test`, SIRET `99999999999999`, chantiers « Amenagement bureaux - Projet 12 », clients « Societe Demo 9 »). Deux options, à trancher par Julien :

- **Option 1 (recommandée)** — garder les volumes (30 chantiers / 30 clients / 12 employés : c'est ce qui rend une capture crédible) et **renommer seulement les lignes visibles en tête de liste** avec les libellés demandés :
  - Entreprise : `ELSATIA Démonstration` (raison sociale `ELSATIA Démonstration SAS`)
  - Chantiers récents : `Résidence Horizon`, `Bureaux République`, `Centre médical Demo`
  - Clients : `Client Démonstration A`, `Client Démonstration B`
  - Employés : `Jean Exemple`, `Marie Démonstration`
- **Option 2** — n'utiliser que ces 3 chantiers / 2 clients / 2 employés. Les écrans seraient **visiblement vides** (dashboard sans graphiques, planning à 2 lignes) : peu vendeur pour un site commercial.

Réserve mineure : les téléphones générés (`06 01 00 xx xx`, `04 78 00 xx xx`) sont des numéros **plausibles**. Ils n'apparaissent sur aucun des 5 écrans retenus, mais si une fiche client/employé est capturée un jour, il faudra basculer sur les plages réservées à la fiction (`06 39 98 xx xx`).

---

## 6. Compte de démonstration

**Aucun mot de passe n'est demandé à Julien, et aucun compte réel n'est utilisé.**

- Identité : `demo-captures@invalid.local` (domaine `.invalid`, RFC 2606 — jamais délivrable, jamais routable).
- Créé **directement en SQL dans `auth.users` de la base locale**, sur le patron déjà éprouvé de `supabase/tests/fixtures/isolation_multitenant.inc` :
  `crypt('demo', gen_salt('bf'))`, `email_confirmed_at = now()`, plus la ligne `auth.identities` correspondante (exigée par GoTrue local, cf. `scripts/e2e/prepare-local-recipe.sql`).
- Le trigger `on_auth_user_created` crée automatiquement le profil `public.utilisateurs`.
- Rattachement : `utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id = poste « Administrateur », statut = 'actif')` + `utilisateurs.entreprise_active_id`.
- Rattachement terrain (indispensable au capture n°5) : `update public.employes set utilisateur_id = <compte démo>` sur un employé **qui possède des affectations** (indices 3 à 8 du script). Le poste Administrateur porte `voir_devis_chantier_sans_prix` (profil « tous »), donc la RPC répondra.
- Mot de passe local `demo` : valeur de test locale, écrite dans un fichier SQL de recette locale, jamais un secret ; `minimum_password_length = 6` en local. Elle n'ouvre **que** ce conteneur Docker.
- Aucune confirmation d'e-mail à ouvrir (`enable_confirmations = false` en local), aucun e-mail réellement envoyé (Mailpit intercepte tout sur `127.0.0.1:54324`).

**Geste interactif nécessaire de Julien : aucun.**

---

## 7. Script de seed

**À créer : `supabase/local/creer_entreprise_demo_captures.sql`** (copie de `creer_entreprise_demo_18_mois.sql` + corrections). Exécution locale :

```bash
docker exec -i supabase_db_btp-platform psql -U postgres -d postgres \
  -f /dev/stdin < supabase/local/creer_entreprise_demo_captures.sql
```

(ou `npx supabase db query --local`. **Jamais `--linked`** : la ref liée est Preview.)

### Défaut D1 — le script de référence est cassé depuis le 18/08/2026 (bloquant)

`creer_entreprise_demo_18_mois.sql` insère `employes.cout_horaire`. Cette colonne a été **supprimée** par
`supabase/migrations/20260818000205_securiser_cout_horaire_employe.sql` (isolation du coût salarial dans la
table dédiée `public.employes_cout_horaire`, protégée par RLS). Le script **échoue donc sur toute base à jour**
(vérifié : c'est le seul écart de schéma sur les 19 tables et l'unique script en défaut des 8 de `supabase/production/`).

*Correction* : retirer `cout_horaire` de la liste de colonnes de l'insert `employes`, puis alimenter
`public.employes_cout_horaire(employe_id, entreprise_id, cout_horaire)`.

> Conséquence hors périmètre de cet audit : la procédure de réinitialisation de la démo **Production**
> documentée dans `docs/organisation/DEMO_COMMERCIALE.md` est cassée par le même défaut. À traiter séparément.

### Défaut D2 — le planning s'arrête la semaine dernière

La boucle d'affectations couvre `v_semaine in 0..77` à partir de `date_trunc('week', current_date) - 78 semaines` :
la dernière semaine générée est **S-1**. Or `/planning` s'ouvre sur la **semaine courante** et le widget
« Prochaines affectations » du tableau de bord filtre `date >= aujourd'hui`. **Deux des cinq captures seraient vides.**

*Correction* (au choix) :
- **(a) recommandée** — étendre la génération à `0..80` (soit S-78 → S+2), en n'insérant des `pointages` que pour les dates passées ;
- (b) contournement sans modification de données — capturer `/planning?semaine=<lundi de la semaine dernière>`. Ne corrige pas le tableau de bord.

### Complément — abonnement et offre

`abonnement_statut = 'actif'` + `abonnement_echeance = current_date + 365` sont déjà posés par le script : aucune
redirection vers `/abonnement-suspendu`. `abonnement_offre` peut rester `NULL` : `permissionIncluseDansOffre()`
n'ouvre aucun filtre sans offre, et `a_permission()` en base ne dépend que du poste. **Aucun Stripe n'est requis.**

---

## 8. Script de capture

**À créer : `scripts/capturer-site-elsatia.mjs`**, dérivé de `capturer-guide.mjs` (même connexion, même
`waitUntil: "domcontentloaded"` puis `networkidle`, même `locale: fr-FR` / `Europe/Paris`).

Différences nécessaires — le script actuel **ne peut pas** produire les formats demandés :

| | Script actuel | Variante à créer |
|---|---|---|
| Desktop | viewport 1440×1000, `deviceScaleFactor` 1, clip rogné sur `<main>`, hauteur plafonnée à 1100 | viewport **1280×800**, `deviceScaleFactor` **2**, **aucun rognage** → **2560×1600** exactement |
| Mobile | viewport 390×844, `deviceScaleFactor` **3** → 1170×2532 | viewport **390×844**, `deviceScaleFactor` **2** → **780×1688** exactement |
| Sections | 36 sections + fiches + impressions | **5 vues seulement** |

Playwright applique le `deviceScaleFactor` au `clip` exprimé en pixels CSS : `1280×800 @ 2 = 2560×1600`,
`390×844 @ 2 = 780×1688`. **Aucun chrome navigateur** : `chromium.launch({ headless: true })` +
`page.screenshot()` ne capturent que le document — pas de barre d'adresse, pas d'onglets, pas de cadre d'OS.

Sorties proposées : `output/site/` → `dashboard-desktop.png`, `chantiers-desktop.png`, `devis-desktop.png`,
`planning-desktop.png`, `mes-travaux-mobile.png` + `manifeste.json`.

Environnement d'exécution :
`ELSATIA_AUDIT_URL=http://127.0.0.1:3000`, `ELSATIA_AUDIT_EMAIL=demo-captures@invalid.local`, `ELSATIA_AUDIT_PASSWORD=demo`.

---

## 9. Écrans disponibles

| # | Capture demandée | Route | Format | Disponible ? |
|---|---|---|---|---|
| 1 | Tableau de bord desktop | `/dashboard` | 2560×1600 | Oui, **après D2** (sinon « Prochaines affectations » vide) |
| 2 | Chantiers desktop | `/chantiers` | 2560×1600 | Oui |
| 3 | Devis desktop | `/devis` | 2560×1600 | Oui |
| 4 | Planning desktop | `/planning` | 2560×1600 | Oui, **après D2** (sinon semaine vide) |
| 5 | Mes travaux mobile | `/mes-travaux` | 780×1688 | Oui, **si** le compte démo est rattaché à un employé affecté (§6) |

Le script `capturer-guide.mjs` couvre par ailleurs 31 autres sections si d'autres visuels sont voulus plus tard.

---

## 10. Limites

1. **D1 bloquant** : le script de référence échoue tant que `cout_horaire` n'est pas corrigé.
2. **D2 bloquant pour 2 captures sur 5** : pas d'affectation à partir d'aujourd'hui.
3. `seed-elsatia-preview-year.mjs` **ne peut pas** servir en local (verrou Preview par conception) — ce n'est pas un défaut, c'est le garde-fou qui fonctionne.
4. `seed-demo-history.mjs` est **mort** (RPC `dev_contexte_entreprise` supprimée par la migration 078). À signaler pour suppression.
5. Le « mode sans connexion » (`DISABLE_EMAIL_LOGIN` + `ELSATIA_LOCAL_DEMO`) est **inopérant** pour la même raison : un vrai compte `auth.users` local est obligatoire.
6. Le rendu local est celui du **serveur de développement** (`next dev`). Fidèle au HTML/CSS de production, mais si une capture pixel-parfaite est exigée, refaire les 5 vues sur `next build && next start` local.
7. Les données sont **datées relativement à `current_date`** au moment du seed : les captures « vieillissent ». Rejouer le seed avant toute nouvelle campagne.
8. Décision de nommage §5 (Option 1 vs Option 2) **non tranchée** — elle appartient à Julien.
9. Un serveur de développement a été démarré sur le port 3000 pendant cet audit (lecture seule, aucune écriture en base).

---

## 11. Production touchée

**NON.** Aucun déploiement, aucune migration, aucun seed, aucune écriture, aucun appel Stripe réel, aucun appel Brevo.
Aucune donnée n'a été écrite nulle part pendant cet audit — y compris en local. Les seules actions ont été :
lecture de fichiers, requêtes `SELECT` sur la base **locale**, et démarrage d'un serveur de développement local.

Garde-fous constatés et intacts : `supabase/.temp/project-ref` = Preview ; `garde-scripts-production.mjs` refuse toute
cible autre que Preview ; `seed-elsatia-preview-year.mjs` refuse toute URL hors Preview ; les livrables proposés vivent
dans `supabase/local/`, hors du registre du garde-fou.

---

## 12. Action exacte à lancer ensuite

Sur accord de Julien, dans l'ordre, **entièrement en local** :

1. Trancher le nommage (§5, Option 1 recommandée).
2. Créer `supabase/local/creer_entreprise_demo_captures.sql` (18 mois + correction D1 + correction D2(a) + nommage retenu).
3. Créer `supabase/local/compte_demo_captures.sql` (compte `demo-captures@invalid.local`, poste Administrateur, rattachement employé).
4. Exécuter les deux SQL contre la base **locale** uniquement :
   ```bash
   docker exec -i supabase_db_btp-platform psql -U postgres -d postgres < supabase/local/creer_entreprise_demo_captures.sql
   docker exec -i supabase_db_btp-platform psql -U postgres -d postgres < supabase/local/compte_demo_captures.sql
   ```
5. Créer `scripts/capturer-site-elsatia.mjs` (2560×1600 / 780×1688, 5 vues).
6. Produire les captures :
   ```bash
   ELSATIA_AUDIT_URL=http://127.0.0.1:3000 ELSATIA_AUDIT_EMAIL=demo-captures@invalid.local ELSATIA_AUDIT_PASSWORD=demo node scripts/capturer-site-elsatia.mjs
   ```
7. Relire les 5 PNG un par un avant toute publication sur le site (aucun nom, aucune adresse, aucun montant réel).

**Prochain lot proposé** : `ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1`.

---

**ELSATIA-GP-SAFE-DEMO-CAPTURE-ENVIRONMENT-AUDIT-V1 VALIDÉ — ENVIRONNEMENT DÉMO SÛR DÉFINI**
