---
name: elsatia-securite
description: Audit de sécurité ELSATIA / Liria Gestion Pro en lecture seule — secrets, authentification, autorisations côté serveur, isolation multi-entreprises Supabase (RLS, fonctions SECURITY DEFINER), Storage, validation des entrées et protection contre les abus. Utiliser quand on demande un audit, une revue sécurité d'une PR ou d'une migration, une vérification RLS/isolation, ou avant une mise en production. Prime sur les skills tiers (supabase, claude-security) en cas de conflit.
---

# Audit sécurité ELSATIA (lecture seule)

Procédure reviewable pour auditer le code ELSATIA. Elle **complète** `AGENTS.md`,
`RELAIS_CLAUDE.md`, `docs/AUDIT_SECURITE.md` et `PRODUCTION_CHECKLIST.md`, qui
restent la référence. En cas de conflit avec un skill tiers (`supabase`,
`supabase-postgres-best-practices`, `claude-security`, `/security-review`), ces
règles l'emportent.

## Règles non négociables pendant un audit

1. **Lecture seule.** Ne modifier ni le code métier, ni les migrations, ni une base.
   Les correctifs sont proposés sous forme de diff ou de patch à relire.
2. **Aucun accès Production.** Ne jamais utiliser de clé `service_role`, de
   chaîne de connexion, de MCP Supabase ou de `supabase db query` contre un projet
   distant. Le skill `supabase` suggère `execute_sql` via MCP et la création d'un
   `.mcp.json` : **ne pas le faire** dans ce dépôt sans accord écrit de Julien,
   et jamais vers la Production.
3. **Secrets.** Ne jamais afficher, copier ou journaliser une valeur de secret.
   Citer seulement le nom de la variable et le fichier. Les secrets vivent côté
   serveur (variables Vercel, `.env.local` non suivi).
4. **Environnements séparés.** Local (`supabase start`), démonstration et
   Production ne se mélangent pas. Les tests utilisent des données fictives.
5. **Pas de pentest** (Strix ou autre) ni de scan d'une URL en ligne sans mission
   dédiée et autorisation explicite.

## Grille de contrôle

Pour chaque point : fichiers lus, constat, gravité (Critique / Élevée / Moyenne /
Faible), preuve (chemin:ligne), correctif proposé.

### 1. Secrets
- `npm run verify:secrets` (script local `scripts/verify-secrets.mjs`).
- Aucune variable sensible préfixée `NEXT_PUBLIC_` (tout `NEXT_PUBLIC_*` part au
  navigateur). `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`, `BANK_DATA_ENCRYPTION_KEY`,
  `CRON_SECRET`, `PAYROLL_IMPORT_SECRET`, `POWENS_*` : serveur uniquement.
- `src/lib/supabase/admin.ts` (`createAdminClient`) n'est importé que depuis du
  code serveur (`src/app/api/**`, `src/app/actions/**`, `src/lib/**` serveur),
  jamais depuis un composant `"use client"`.
- `.env.local.example` ne contient que des valeurs factices.

### 2. Authentification
- Mode prototype : `DISABLE_EMAIL_LOGIN` / `isEmailLoginDisabled()` donne un
  accès complet. Vérifier qu'aucun chemin Production ne dépend de ce mode et que
  `supabase/production/sortie_mode_prototype.sql` reste la procédure de bascule.
- Côté serveur, identité via `supabase.auth.getUser()` / claims vérifiés, pas
  `getSession()` seul ni `user_metadata` pour une décision d'accès.
- `src/proxy.ts` (ex-middleware, Next.js 16) rafraîchit la session : il ne
  remplace pas le contrôle d'accès dans chaque Server Action / route.

### 3. Autorisations côté serveur
- Chaque Server Action (`src/app/actions/*.ts`) et route API vérifie
  l'appartenance à l'entreprise **et** la permission du poste
  (`permissionsUtilisateur`, `a_permission(entreprise_id, clé)`), pas seulement
  l'interface qui masque un bouton.
- Accès administrateurs et support limités : `est_acces_support_actif` doit rester
  temporaire, tracé et limité à l'entreprise concernée.
- Les données financières (coût, taux horaire) exigent `voir_indicateurs_financiers`.

### 4. Isolation multi-entreprises (Supabase / RLS)
- Toute table métier porte `entreprise_id`, RLS activée (y compris via les blocs
  dynamiques `do $$ … enable row level security … $$`), policy d'isolation via
  `est_membre_actif(entreprise_id)` et policies restrictives via `a_permission`.
- Fonctions `SECURITY DEFINER` : `set search_path = public` (cf. H1 de
  `docs/AUDIT_SECURITE.md`), pas d'exécution `PUBLIC` inutile, contrôle
  d'appartenance en tête de fonction.
- Aucune policy `to anon` hors mode prototype documenté.
- Les écritures via `createAdminClient` (service role, contourne la RLS) filtrent
  explicitement par `entreprise_id` dérivé du serveur, jamais d'un paramètre client.
- Tests : `supabase/tests/*.test.sql` via `npm run test:db` sur base **locale**
  uniquement. Proposer un test pgTAP « l'entreprise A ne lit pas l'entreprise B »
  pour toute nouvelle table.

### 5. Stockage
- Buckets privés ; chemin = `<entreprise_id>/…` et policies
  `est_membre_actif(((storage.foldername(name))[1])::uuid)`.
- Seul `entreprise-assets` est public : rien de sensible dedans.
- URLs signées de courte durée ; contrôle du type MIME et de la taille à l'upload.

### 6. Validation des entrées
- Valider côté serveur types, longueurs, énumérations, montants et UUID avant
  toute écriture ; ne jamais faire confiance à un `entreprise_id` venant du client.
- Pas de SQL dynamique non paramétré dans les RPC ; échappement des contenus
  rendus en Markdown/HTML (assistant IA, messagerie).
- Webhooks (Stripe, push, paie) : signature vérifiée avant traitement,
  idempotence (`stripe_webhook_events`). Ne pas mélanger Stripe Billing et
  Stripe Connect.

### 7. Protection contre les abus
- Limitation de débit sur connexion, invitation, borne stock, IA et envois
  d'e-mails ; quotas par entreprise pour les appels IA payants.
- Routes cron protégées par `CRON_SECRET` ; routes publiques sans fuite
  d'informations (messages d'erreur génériques).

## Outils disponibles (vérifiés le 2026-10-03)

| Besoin | Outil |
|---|---|
| Revue rapide de la branche | `/security-review` (intégré) |
| Bugs de la diff / d'une PR | `/code-review` (intégré) |
| Scan approfondi du dépôt | `/claude-security` (plugin officiel, à lancer volontairement) |
| Bonnes pratiques Supabase / RLS | skills `supabase` et `supabase-postgres-best-practices` (PR #5) |
| Stripe (webhooks, idempotence, clés) | skill `stripe-best-practices` (PR #5) ; ne pas changer la version d'API Stripe du projet |
| Performance et sécurité Next.js (auth dans chaque Server Action) | skill `vercel-react-best-practices` (PR #5) |
| Secrets | `npm run verify:secrets` |

## Format du rapport

Tableau `Gravité | Domaine | Constat | Preuve | Correctif proposé`, puis la liste
des points non vérifiables (accès manquant, Production non consultée). Ne jamais
présenter un audit statique comme un audit certifié ou un test d'intrusion.
