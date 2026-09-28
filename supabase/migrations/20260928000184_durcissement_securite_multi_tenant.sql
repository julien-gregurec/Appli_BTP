-- Durcissement sécurité multi-tenant (red team V1).
--
-- Trois correctifs indépendants, tous vérifiés localement :
--
-- 1) entreprise_sans_membres() : search_path non épinglé.
--    Cette fonction SECURITY DEFINER est utilisée à l'intérieur de policies RLS
--    critiques. Sans `set search_path`, un rôle capable de créer un objet plus
--    prioritaire dans son search_path pourrait masquer public.utilisateurs_entreprises
--    et fausser son résultat. Sa jumelle est_membre_actif() avait déjà été corrigée
--    ainsi (20260714000075) ; celle-ci avait été oubliée.
--
-- 2) Clause « bootstrap tenant vide » ouverte en écriture.
--    Les policies de postes / permissions_poste / utilisateurs_entreprises
--    autorisaient TOUT utilisateur authentifié à lire/écrire dès lors qu'une
--    entreprise n'avait plus aucune ligne de membre (entreprise_sans_membres = vrai),
--    permettant de s'insérer soi-même comme membre d'un tenant vide (reprise de
--    tenant abandonné) puis d'en gérer postes et permissions.
--    Or la création d'entreprise est atomique et SECURITY DEFINER
--    (creer_entreprise_bootstrap, 20260710000003) et l'adhésion par code l'est aussi
--    (rejoindre_entreprise_par_code, 20260710000035) : aucun parcours légitime ne
--    dépend de cette clause côté RLS. On la retire donc partout (fail-closed).
--
-- 3) compteurs_reference : RLS jamais activée.
--    Table tenant (entreprise_id) sans RLS. Aucun grant anon/authenticated
--    aujourd'hui, donc pas de fuite active, mais défense en profondeur : on active
--    la RLS (deny-all pour les rôles PostgREST ; service_role et les fonctions
--    SECURITY DEFINER propriétaires continuent d'y accéder).

-- 1) search_path épinglé.
create or replace function public.entreprise_sans_membres(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.utilisateurs_entreprises ue where ue.entreprise_id = p_entreprise_id
  );
$$;

-- 2) Retrait de la clause fail-open sur les tables sensibles.
drop policy if exists "membres voient les postes" on public.postes;
create policy "membres voient les postes" on public.postes
  for select using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres gèrent les postes" on public.postes;
create policy "membres gèrent les postes" on public.postes
  for all using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres voient les permissions" on public.permissions_poste;
create policy "membres voient les permissions" on public.permissions_poste
  for select using (public.est_membre_actif(entreprise_id));

drop policy if exists "membres gèrent les permissions" on public.permissions_poste;
create policy "membres gèrent les permissions" on public.permissions_poste
  for all using (public.est_membre_actif(entreprise_id));

drop policy if exists "bootstrap ou invitation par un membre actif" on public.utilisateurs_entreprises;
create policy "invitation par un membre actif" on public.utilisateurs_entreprises
  for insert with check (public.est_membre_actif(entreprise_id));

-- 3) RLS défensive sur la table de compteurs.
alter table public.compteurs_reference enable row level security;

notify pgrst, 'reload schema';
