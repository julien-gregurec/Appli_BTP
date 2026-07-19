-- Droits RGPD : export des données (art. 15 & 20) et effacement (art. 17).
-- Engagements correspondants : docs/juridique/politique-confidentialite.md §7,
-- cgv.md art. 10 (réversibilité, 30 jours), dpa-entreprises-clientes.md §5.8.

-- ─────────────────────────────────────────────────────────────
-- Colonnes de suivi
-- ─────────────────────────────────────────────────────────────
alter table public.entreprises
  add column if not exists suppression_demandee_at timestamptz,
  add column if not exists suppression_prevue_at timestamptz,
  add column if not exists suppression_demandee_par uuid references auth.users(id) on delete set null;

alter table public.employes
  add column if not exists anonymise_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- 1. EXPORT — droit d'accès et de portabilité
-- Parcourt dynamiquement TOUTES les tables portant entreprise_id :
-- une table ajoutée plus tard est automatiquement incluse.
-- Les colonnes sensibles (mots de passe, jetons, secrets) sont exclues.
-- ─────────────────────────────────────────────────────────────
create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_sensibles text[];
  v_rows jsonb;
  v_donnees jsonb := '{}'::jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;

  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'entreprise_id'
      and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    -- Colonnes à ne jamais exporter (secrets d'authentification).
    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from public.%I x where x.entreprise_id = $1',
      v_table
    ) into v_rows using p_entreprise_id, v_sensibles;

    if jsonb_array_length(v_rows) > 0 then
      v_donnees := v_donnees || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;

  -- La fiche entreprise elle-même (clé « id », pas « entreprise_id »).
  select coalesce(array_agg(column_name), '{}') into v_sensibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'entreprises'
     and column_name ~* 'mot_de_passe|password|secret|token|hash';
  execute 'select coalesce(jsonb_agg(to_jsonb(e) - $2), ''[]''::jsonb) from public.entreprises e where e.id = $1'
    into v_rows using p_entreprise_id, v_sensibles;
  v_donnees := v_donnees || jsonb_build_object('entreprise', v_rows);

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'export_rgpd', 'entreprise', 'Export RGPD des données');

  return jsonb_build_object(
    'genere_le', now(),
    'entreprise_id', p_entreprise_id,
    'donnees', v_donnees
  );
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 2. ANONYMISATION D'UNE PERSONNE — droit à l'effacement (niveau salarié)
-- On neutralise l'identité et on vide dynamiquement toute colonne à
-- caractère personnel, tout en CONSERVANT les enregistrements nécessaires
-- aux obligations légales (pointages, paie, comptabilité).
-- ─────────────────────────────────────────────────────────────
create or replace function public.anonymiser_employe(p_entreprise_id uuid, p_employe_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_col text;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_employes') then
    raise exception 'Accès refusé';
  end if;
  if not exists (select 1 from public.employes where id = p_employe_id and entreprise_id = p_entreprise_id) then
    raise exception 'Employé introuvable';
  end if;

  update public.employes
     set prenom = 'Salarié', nom = 'anonymisé', anonymise_at = now(), updated_at = now()
   where id = p_employe_id and entreprise_id = p_entreprise_id;

  -- Vide toute colonne personnelle encore présente (robuste aux évolutions du schéma).
  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'employes'
       and is_nullable = 'YES'
       and column_name ~* 'email|telephone|adresse|notes|photo|signature|carte_btp|iban|bic|securite_sociale|naissance|identifiant|reference_interne'
  loop
    execute format('update public.employes set %I = null where id = $1 and entreprise_id = $2', v_col)
      using p_employe_id, p_entreprise_id;
  end loop;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, ressource_id, description)
  values (p_entreprise_id, auth.uid(), 'anonymisation_rgpd', 'employe', p_employe_id, 'Anonymisation RGPD d''un salarié');
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 3. DEMANDE DE SUPPRESSION DU COMPTE — délai de 30 jours (CGV art. 10)
-- La demande est en self-service ; la purge effective reste une opération
-- supervisée par la plateforme (irréversible, et soumise à la conservation
-- comptable légale d'environ 10 ans).
-- ─────────────────────────────────────────────────────────────
create or replace function public.demander_suppression_entreprise(p_entreprise_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_prevue timestamptz;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  v_prevue := now() + interval '30 days';
  update public.entreprises
     set suppression_demandee_at = now(),
         suppression_prevue_at = v_prevue,
         suppression_demandee_par = auth.uid(),
         updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_demandee', 'entreprise',
          'Demande de suppression du compte (purge prévue le ' || to_char(v_prevue, 'DD/MM/YYYY') || ')');
  return v_prevue;
end; $$;

create or replace function public.annuler_suppression_entreprise(p_entreprise_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  update public.entreprises
     set suppression_demandee_at = null, suppression_prevue_at = null,
         suppression_demandee_par = null, updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_annulee', 'entreprise', 'Demande de suppression annulée');
end; $$;

-- ─────────────────────────────────────────────────────────────
-- Droits d'exécution
-- ─────────────────────────────────────────────────────────────
revoke all on function public.exporter_donnees_entreprise(uuid) from public, anon;
revoke all on function public.anonymiser_employe(uuid, uuid) from public, anon;
revoke all on function public.demander_suppression_entreprise(uuid) from public, anon;
revoke all on function public.annuler_suppression_entreprise(uuid) from public, anon;
grant execute on function public.exporter_donnees_entreprise(uuid) to authenticated;
grant execute on function public.anonymiser_employe(uuid, uuid) to authenticated;
grant execute on function public.demander_suppression_entreprise(uuid) to authenticated;
grant execute on function public.annuler_suppression_entreprise(uuid) to authenticated;

notify pgrst, 'reload schema';
