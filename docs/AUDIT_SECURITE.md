# Audit de sécurité — Liria Gestion Pro

_Réalisé le 18 juillet 2026 (revue statique du code et des migrations). Ne remplace pas un audit certifié par un cabinet accrédité, mais couvre les risques majeurs d'un SaaS multi-entreprises._

## Verdict global : architecture saine ✅

Le cœur de sécurité — l'isolation des données entre entreprises clientes — est **correctement implémenté**. Deux alertes levées pendant l'audit ont été **vérifiées puis écartées** (fausses alertes dues à l'analyse statique, pas à des failles).

## Ce qui a été vérifié

### 1. Isolation multi-entreprises (le point critique) — ✅ conforme
- Toutes les tables « métier » portent `entreprise_id` et sont protégées par RLS.
- ⚠️ **Fausse alerte initiale** : 18 tables semblaient sans RLS. En réalité, la RLS est activée pour elles via un **bloc dynamique** (`do $$ … execute format('alter table … enable row level security') … $$`, migration `…080` ligne 321), invisible à une recherche de texte. Isolation réelle via la policy `isolation_entreprise` + policies restrictives par permission.
- Tout repose sur deux fonctions `SECURITY DEFINER` : `est_membre_actif(entreprise_id)` (appartenance active) et `a_permission(entreprise_id, clé)` (droit du poste). Les deux vérifient `utilisateurs_entreprises` / `permissions_poste`. **Solides.**

### 2. Stockage des fichiers (photos, documents) — ✅ conforme
- Buckets **privés** : `chantier-documents`, `documents-employes`, `notes-frais`, `factures-fournisseurs`, `bulletins-paie`, `pointage-preuves`, `fiches-techniques`, `notes-frais-exports`.
- Cloisonnement par entreprise au niveau `storage.objects` : les policies vérifient `est_membre_actif(((storage.foldername(name))[1])::uuid)` — c.-à-d. le 1er dossier du chemin = `entreprise_id`. Un membre d'une entreprise ne peut pas lire les fichiers d'une autre.
- Seul bucket **public** : `entreprise-assets` (logos). Intentionnel (les logos apparaissent sur les devis/factures). → **À confirmer** : n'y stocker que des éléments non sensibles.

### 3. Webhook Stripe — ✅ conforme
- Signature vérifiée (`verifierSignatureStripe`) avant tout traitement, avec tolérance d'horodatage.
- Déduplication via `stripe_webhook_events`.
- Écritures via client service-role isolé.

## Le seul vrai point d'attention : la bascule de mise en service 🔴

L'application tourne actuellement en **mode prototype** (`DISABLE_EMAIL_LOGIN=true`) : des policies `to anon` donnent volontairement un accès sans connexion, pour la démo. **Tant que ce mode est actif, toute personne disposant de la clé publique (`anon`) peut accéder aux données.**

C'est **acceptable aujourd'hui** (aucune donnée client réelle — uniquement les données de démonstration), mais c'est **LE geste de sécurité obligatoire au lancement commercial**.

### Action de mise en service (à faire le jour J, dans l'ordre)
1. Mettre `DISABLE_EMAIL_LOGIN=false` (Vercel).
2. Exécuter `supabase/production/sortie_mode_prototype.sql` dans le SQL Editor **après une sauvegarde**.
   - ✅ Vérifié : ce script supprime **toutes** les policies où `anon` figure (les 41 « prototype »), révoque tous les privilèges `anon` (tables, séquences, fonctions, storage), retire l'exécution `PUBLIC` des fonctions `SECURITY DEFINER`, et supprime la fonction de dev `dev_contexte_entreprise()`. **Couverture complète.**
3. Tester une connexion réelle + vérifier qu'un utilisateur d'une entreprise ne voit pas les données d'une autre.

## Recommandations de durcissement (mineures)

| # | Sujet | Sévérité | Action |
|---|---|---|---|
| H1 | `est_membre_actif` n'a pas `set search_path = public` (alors que `a_permission` l'a) | Faible | Ajouter `set search_path = public` par cohérence et bonne pratique |
| H2 | Bucket public `entreprise-assets` | Faible | Confirmer qu'il ne contient que des logos/éléments non sensibles |
| H3 | Rappel go-live | — | Supprimer le compte de démo `demo@entreprise-test.fr` et les données de test |

### Correctif H1 (à intégrer dans une prochaine migration — domaine Codex)
```sql
create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean language sql security definer stable
set search_path = public          -- ← ajout
as $$
  select exists (
    select 1 from public.utilisateurs_entreprises ue
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
  );
$$;
```

## Conclusion

Rien ne bloque la mise en service côté sécurité, à condition d'exécuter correctement la **sortie du mode prototype** au lancement. L'isolation multi-entreprises, la protection des fichiers et le webhook de paiement sont conformes aux attentes d'un SaaS. Les corrections restantes sont du durcissement de confort.
