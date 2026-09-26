-- ELSATIA-ACTIVE-PERSON-CAPACITY-R1-V1
-- Plafond DUR de personnes actives par abonnement Gestion Pro.
--
-- Décision produit figée : une entreprise ne peut pas dépasser sa capacité
-- autorisée sans acheter de la capacité, changer de forfait ou archiver une
-- personne active. La limite porte sur les PERSONNES ACTIVES ENREGISTRÉES
-- (fiches `employes`), pas seulement sur les comptes de connexion.
--
-- Contrat "personne active" (canonique, appliqué par compter_personnes_actives_entreprise) :
--   ligne public.employes de l'entreprise AVEC
--     statut <> 'sorti'                       (exclut l'ancien salarié)
--     ET compte_application_statut <> 'ferme' (exclut le compte archivé — libère la place)
--   → comptent : dirigeant, bureau, ouvrier, chef d'équipe, conducteur, apprenti,
--     intérimaire actif, ET la personne sans compte Auth présente pour planning/pointage
--     (compte_application_statut = 'non_ouvert').
--   → ne comptent pas : salarié sorti, compte fermé/archivé, et toute entité non
--     personnelle (clients, fournisseurs, sous-traitants, contacts) qui ne sont pas
--     des lignes `employes`.
--   `actif` ET `pause` comptent : une personne en pause reste enregistrée et réactivable.
--
-- Additif : aucune migration historique modifiée, aucun droit client élargi.
-- Aucune suppression de données. Rollback conceptuel = restore/forward-fix.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Capacité achetée explicite + traçabilité (socle R2)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.entreprises
  add column if not exists capacite_personnes_supplementaire integer not null default 0
    check (capacite_personnes_supplementaire >= 0 and capacite_personnes_supplementaire <= 100000),
  add column if not exists capacite_personnes_source text,
  add column if not exists capacite_personnes_reference_externe text,
  add column if not exists capacite_personnes_maj_at timestamptz;

comment on column public.entreprises.capacite_personnes_supplementaire is
  'Places de personnes actives achetées en plus de la base du forfait (R1 : posé par la plateforme ; R2 : réconcilié depuis Stripe).';

-- Aucun GRANT n'est ajouté pour ces colonnes : le régime de droits de
-- public.entreprises est colonne-par-colonne, donc `authenticated` ne peut pas
-- les écrire. Seule la RPC plateforme SECURITY DEFINER ci-dessous les modifie.

create table if not exists public.historique_capacite_personnes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  action text not null check (action in (
    'capacite_supplementaire_definie','capacite_supplementaire_reduite','ajustement_plateforme'
  )),
  ancien jsonb,
  nouveau jsonb,
  source text not null default 'admin_plateforme' check (source in ('admin_plateforme','stripe','systeme')),
  reference_externe text,
  acteur_id uuid references auth.users(id),
  motif text,
  created_at timestamptz not null default now()
);
create index if not exists historique_capacite_personnes_entreprise_idx
  on public.historique_capacite_personnes(entreprise_id, created_at desc);

alter table public.historique_capacite_personnes enable row level security;

-- Lecture : plateforme, ou membre de l'entreprise habilité aux paramètres.
-- Aucune écriture directe : la table n'est alimentée que par la RPC plateforme.
drop policy if exists "historique capacite lecture" on public.historique_capacite_personnes;
create policy "historique capacite lecture" on public.historique_capacite_personnes
  for select using (
    public.est_plateforme_admin()
    or (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, 'gerer_parametres'))
  );

revoke all on table public.historique_capacite_personnes from anon, authenticated, service_role;
grant select on table public.historique_capacite_personnes to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Décompte canonique des personnes actives (source de vérité serveur)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.compter_personnes_actives_entreprise(p_entreprise_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.employes e
  where e.entreprise_id = p_entreprise_id
    and e.statut is distinct from 'sorti'
    and e.compte_application_statut is distinct from 'ferme';
$$;

comment on function public.compter_personnes_actives_entreprise(uuid) is
  'Nombre de personnes actives enregistrées (contrat R1). Source de vérité unique du plafond.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Capacité autorisée : base (forfait) + supplément acheté
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.capacite_personnes_base(p_entreprise_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_offre text;
  v_code  text;
  v_inclus integer;
begin
  select nullif(btrim(lower(abonnement_offre)), '') into v_offre
  from public.entreprises where id = p_entreprise_id;

  -- Normalisation des libellés historiques vers la grille canonique.
  v_code := case v_offre
              when 'essentiel' then 'mini'
              when 'premium'   then 'business'
              when null        then 'mini'
              else coalesce(v_offre, 'mini')
            end;

  select utilisateurs_inclus into v_inclus
  from public.plans_abonnement
  where code = v_code and actif
  order by version desc
  limit 1;

  if v_inclus is not null then
    return greatest(v_inclus, 0);
  end if;

  -- Repli si aucun plan actif ne correspond (offre inconnue / catalogue absent).
  return case v_code
           when 'pro'        then 15
           when 'business'   then 30
           when 'entreprise' then 50
           when 'sur_mesure' then 50
           else 3
         end;
end;
$$;

create or replace function public.capacite_personnes_totale(p_entreprise_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select public.capacite_personnes_base(p_entreprise_id)
       + coalesce((select capacite_personnes_supplementaire
                   from public.entreprises where id = p_entreprise_id), 0);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. État de capacité : ok / limite_atteinte / over_capacity
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.etat_capacite_personnes(p_entreprise_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.compter_personnes_actives_entreprise(p_entreprise_id)
                > public.capacite_personnes_totale(p_entreprise_id) then 'over_capacity'
           when public.compter_personnes_actives_entreprise(p_entreprise_id)
                = public.capacite_personnes_totale(p_entreprise_id) then 'limite_atteinte'
           else 'ok'
         end;
$$;

-- Vue applicative consolidée (lecture UX abonnement).
create or replace function public.capacite_personnes_entreprise(p_entreprise_id uuid)
returns table(
  personnes_actives integer,
  capacite_base integer,
  capacite_supplementaire integer,
  capacite_totale integer,
  etat text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
    select public.compter_personnes_actives_entreprise(p_entreprise_id),
           public.capacite_personnes_base(p_entreprise_id),
           coalesce((select capacite_personnes_supplementaire from public.entreprises where id = p_entreprise_id), 0),
           public.capacite_personnes_totale(p_entreprise_id),
           public.etat_capacite_personnes(p_entreprise_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Garde-fou : validation d'une opération qui augmente le nombre actif
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.verifier_capacite_personnes(
  p_entreprise_id uuid,
  p_delta integer default 1
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actives integer;
  v_totale  integer;
begin
  if p_delta is null or p_delta <= 0 then
    return; -- une opération qui n'augmente pas la population active passe toujours
  end if;
  if not (public.est_membre_actif(p_entreprise_id) or public.est_plateforme_admin()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  v_actives := public.compter_personnes_actives_entreprise(p_entreprise_id);
  v_totale  := public.capacite_personnes_totale(p_entreprise_id);

  if v_actives + p_delta > v_totale then
    raise exception 'CAPACITE_PERSONNES_ATTEINTE'
      using errcode = 'P0001',
            detail = format(
              '{"code":"CAPACITE_PERSONNES_ATTEINTE","actives":%s,"capacite":%s,"demande":%s}',
              v_actives, v_totale, p_delta
            ),
            hint = 'Archivez une personne, ajoutez de la capacité ou changez d''offre.';
  end if;
end;
$$;

comment on function public.verifier_capacite_personnes(uuid, integer) is
  'Pré-contrôle applicatif du plafond de personnes actives. Le garde-fou infranchissable reste le trigger trg_capacite_personnes_actives sur public.employes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Garde-fou infranchissable : trigger BEFORE INSERT/UPDATE sur public.employes
--    Couvre TOUS les chemins : création manuelle, self-service, import en lot,
--    réactivation, duplication, RPC, PostgREST direct.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.trg_capacite_personnes_actives()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compte_actuel integer;
  v_capacite integer;
  v_compte_nouveau boolean;
  v_compte_ancien  boolean;
begin
  -- Échappatoire réservée aux contextes d'amorçage de confiance (migrations,
  -- fixtures pgTAP, restauration, backfill) : n'a d'effet QUE si la session est
  -- une connexion superutilisateur (`session_user = 'postgres'`). Le trafic API
  -- Supabase s'exécute sous `session_user = 'authenticator'`, donc `authenticated`
  -- / `anon` / `service_role` ne peuvent jamais franchir le garde-fou, même en
  -- positionnant eux-mêmes ce paramètre.
  if session_user = 'postgres'
     and coalesce(current_setting('elsatia.capacite_personnes_bypass', true), '') = 'on' then
    return new;
  end if;

  v_compte_nouveau := (new.statut is distinct from 'sorti'
                       and new.compte_application_statut is distinct from 'ferme');

  if tg_op = 'UPDATE' then
    v_compte_ancien := (old.statut is distinct from 'sorti'
                        and old.compte_application_statut is distinct from 'ferme'
                        and old.entreprise_id = new.entreprise_id);
    -- Aucune augmentation de population active : on laisse passer (édition d'une
    -- fiche existante, mise en pause, fermeture, sortie...). Indispensable pour
    -- pouvoir gérer une entreprise déjà en over_capacity après un downgrade.
    if v_compte_ancien or not v_compte_nouveau then
      return new;
    end if;
  else
    if not v_compte_nouveau then
      return new;
    end if;
  end if;

  v_compte_actuel := (
    select count(*)
    from public.employes e
    where e.entreprise_id = new.entreprise_id
      and e.statut is distinct from 'sorti'
      and e.compte_application_statut is distinct from 'ferme'
      and e.id <> new.id
  );
  v_capacite := public.capacite_personnes_totale(new.entreprise_id);

  if v_compte_actuel + 1 > v_capacite then
    raise exception 'CAPACITE_PERSONNES_ATTEINTE'
      using errcode = 'P0001',
            detail = format(
              '{"code":"CAPACITE_PERSONNES_ATTEINTE","actives":%s,"capacite":%s}',
              v_compte_actuel, v_capacite
            ),
            hint = 'Archivez une personne, ajoutez de la capacité ou changez d''offre.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capacite_personnes_actives on public.employes;
create trigger trg_capacite_personnes_actives
  before insert or update on public.employes
  for each row execute function public.trg_capacite_personnes_actives();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Mutation sécurisée de la capacité achetée (plateforme uniquement, R1)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.plateforme_definir_capacite_personnes_supplementaire(
  p_entreprise_id uuid,
  p_capacite integer,
  p_motif text default null,
  p_source text default 'admin_plateforme',
  p_reference_externe text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien integer;
  v_acteur uuid;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  perform public.plateforme_exiger_session_aal2();
  if p_capacite is null or p_capacite < 0 or p_capacite > 100000 then
    raise exception 'Capacité supplémentaire invalide' using errcode = '22023';
  end if;
  if p_source not in ('admin_plateforme','stripe','systeme') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;

  select capacite_personnes_supplementaire into v_ancien
  from public.entreprises where id = p_entreprise_id for update;
  if not found then
    raise exception 'Entreprise introuvable' using errcode = 'P0002';
  end if;

  begin
    v_acteur := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  exception when others then
    v_acteur := null;
  end;

  update public.entreprises
  set capacite_personnes_supplementaire = p_capacite,
      capacite_personnes_source = p_source,
      capacite_personnes_reference_externe = nullif(btrim(p_reference_externe), ''),
      capacite_personnes_maj_at = now()
  where id = p_entreprise_id;

  insert into public.historique_capacite_personnes(
    entreprise_id, action, ancien, nouveau, source, reference_externe, acteur_id, motif
  ) values (
    p_entreprise_id,
    case when p_capacite >= coalesce(v_ancien, 0) then 'capacite_supplementaire_definie'
         else 'capacite_supplementaire_reduite' end,
    jsonb_build_object('capacite_personnes_supplementaire', coalesce(v_ancien, 0)),
    jsonb_build_object('capacite_personnes_supplementaire', p_capacite),
    p_source,
    nullif(btrim(p_reference_externe), ''),
    v_acteur,
    nullif(btrim(p_motif), '')
  );

  return p_capacite;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ACL des fonctions (cohérent avec la réconciliation ACL canonique)
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.compter_personnes_actives_entreprise(uuid) from public, anon;
revoke all on function public.capacite_personnes_base(uuid)              from public, anon;
revoke all on function public.capacite_personnes_totale(uuid)            from public, anon;
revoke all on function public.etat_capacite_personnes(uuid)              from public, anon;
revoke all on function public.capacite_personnes_entreprise(uuid)        from public, anon, service_role;
revoke all on function public.verifier_capacite_personnes(uuid, integer) from public, anon;
revoke all on function public.plateforme_definir_capacite_personnes_supplementaire(uuid, integer, text, text, text)
  from public, anon, service_role;

grant execute on function public.compter_personnes_actives_entreprise(uuid) to authenticated;
grant execute on function public.capacite_personnes_base(uuid)              to authenticated;
grant execute on function public.capacite_personnes_totale(uuid)            to authenticated;
grant execute on function public.etat_capacite_personnes(uuid)              to authenticated;
grant execute on function public.capacite_personnes_entreprise(uuid)        to authenticated;
grant execute on function public.verifier_capacite_personnes(uuid, integer) to authenticated;
grant execute on function public.plateforme_definir_capacite_personnes_supplementaire(uuid, integer, text, text, text)
  to authenticated;

commit;
