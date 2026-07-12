-- Mode prototype sans connexion email.
-- TEMPORAIRE : a retirer avant toute mise en production.
-- Cette migration ouvre les donnees au role anon pour pouvoir tester l'application
-- sans creer de compte Supabase Auth.

create or replace function public.dev_contexte_entreprise()
returns table (
  user_id uuid,
  prenom text,
  entreprise_id uuid,
  entreprise_nom text,
  entreprise_reference text
)
language sql
security definer
set search_path = public
as $$
  select
    '00000000-0000-0000-0000-000000000000'::uuid as user_id,
    'Prototype'::text as prenom,
    e.id as entreprise_id,
    e.nom as entreprise_nom,
    e.reference_interne as entreprise_reference
  from public.entreprises e
  order by e.created_at asc
  limit 1;
$$;

grant execute on function public.dev_contexte_entreprise() to anon, authenticated;
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;
grant execute on all functions in schema public to anon;

create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found then
    raise exception 'Devis introuvable';
  end if;
  if v_devis.statut <> 'accepte' then
    raise exception 'Le devis doit etre accepte avant facturation';
  end if;

  insert into public.factures (entreprise_id, client_id, chantier_id, devis_origine_id, type, notes_client)
  values (v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id, p_devis_id, p_type, v_devis.notes_client)
  returning id into v_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select
    v_facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis
  where devis_id = p_devis_id
  order by ordre;

  return v_facture_id;
end;
$$;

grant execute on function public.creer_facture_depuis_devis(uuid, text) to anon, authenticated;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'entreprises',
    'postes',
    'permissions_disponibles',
    'permissions_poste',
    'utilisateurs',
    'utilisateurs_entreprises',
    'codes_acces',
    'cles_api',
    'acces_support_log',
    'types_chantier',
    'clients',
    'contacts_clients',
    'chantiers',
    'taches',
    'chantier_transferts',
    'devis',
    'lignes_devis',
    'factures',
    'lignes_factures',
    'paiements'
  ];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null
      and not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = v_table
          and policyname = 'prototype acces anonyme'
      )
    then
      execute format(
        'create policy %I on public.%I for all to anon using (true) with check (true)',
        'prototype acces anonyme',
        v_table
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
