-- Décor de la recette ELSATIA Réserves — HOST SUSPENSION POLICY V1 (décision D-01).
--
-- Base jetable uniquement. Décor AUTONOME et ISOLÉ du décor V3–V6 : la recette suspend
-- l'organisation hôte ; le faire sur l'organisation A des autres recettes ferait échouer
-- tout ce qui tournerait après une interruption. On crée donc :
--
--   • H — organisation HÔTE (« RECETTE_HOTE_SUSPENSION »), abonnée à Réserves, avec son
--     administrateur hote-suspension@invalid.local ;
--   • S — entreprise INTERVENANTE (« RECETTE_COUVREUR_S »), tenant à part entière, compte
--     gratuit couvreur-s@invalid.local, RATTACHÉE au chantier de H par les fonctions du
--     domaine (désignation par l'hôte, puis `reserves_rejoindre_intervention`) — c'est
--     l'état réel d'un intervenant invité, pas une insertion à la main ;
--   • un chantier de H. Les réserves sont créées par la recette elle-même, à chaque
--     passage : l'état du workflow reste ainsi juste quel que soit le nombre de rejeux.
--
-- Rejouable : chaque étape est idempotente. Remet H à l'état « actif ».

begin;

-- ── Comptes (représentation GoTrue identique à prepare-local-recipe.sql) ─────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data
) values
  ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-0000000000a1', 'authenticated',
   'authenticated', 'hote-suspension@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now(),
   '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}'),
  ('00000000-0000-0000-0000-000000000000', 'c9000000-0000-0000-0000-0000000000a1', 'authenticated',
   'authenticated', 'couvreur-s@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now(),
   '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
select id, id::text, id,
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users
where id in ('a9000000-0000-0000-0000-0000000000a1', 'c9000000-0000-0000-0000-0000000000a1')
on conflict (provider_id, provider) do nothing;

insert into public.utilisateurs (id, prenom, nom) values
  ('a9000000-0000-0000-0000-0000000000a1', 'Hélène', 'Hôte'),
  ('c9000000-0000-0000-0000-0000000000a1', 'Sacha', 'Couvreur')
on conflict (id) do nothing;

insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_offre, abonnement_echeance) values
  ('a9000000-0000-0000-0000-000000000001', 'RECETTE_HOTE_SUSPENSION', 'RHSU0001', 'actif', 'entreprise', current_date + 365),
  ('c9000000-0000-0000-0000-000000000001', 'RECETTE_COUVREUR_S', 'RCSU0001', 'actif', 'entreprise', current_date + 365)
on conflict (id) do nothing;

-- Rejouable : une recette interrompue pendant la suspension laisse H suspendu.
update public.entreprises
set abonnement_statut = 'actif', suspension_prevue_at = null
where id in ('a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001');

insert into public.postes (id, entreprise_id, nom) values
  ('a9100000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001', 'Conducteur de travaux H'),
  ('c9100000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Gérant S')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('a9000000-0000-0000-0000-0000000000a1', 'a9000000-0000-0000-0000-000000000001', 'a9100000-0000-0000-0000-000000000001', 'actif'),
  ('c9000000-0000-0000-0000-0000000000a1', 'c9000000-0000-0000-0000-000000000001', 'c9100000-0000-0000-0000-000000000001', 'actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'a9000000-0000-0000-0000-000000000001'
where id = 'a9000000-0000-0000-0000-0000000000a1';
update public.utilisateurs set entreprise_active_id = 'c9000000-0000-0000-0000-000000000001'
where id = 'c9000000-0000-0000-0000-0000000000a1';

-- ── H est abonnée à Réserves ─────────────────────────────────────────────────
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a9000000-0000-0000-0000-000000000001', 'reserves', true, 'recette_suspension_hote_v1')
on conflict (entreprise_id, application_code) do update
  set autorise = true, valide_du = null, valide_jusqu_au = null;

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code, autorise
) values (
  'a9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-0000000000a1',
  'reserves', 'reserves_admin_organisation', true
)
on conflict (entreprise_id, utilisateur_id, application_code)
  do update set role_code = excluded.role_code, autorise = true;

-- ── Chantier et intervenant, sous l'identité de l'administrateur de H ─────────
select set_config('request.jwt.claims',
  '{"sub":"a9000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a9000000-0000-0000-0000-0000000000a1', true);
set local role authenticated;

insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville)
values ('e9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
        'RECETTE_H_Résidence Les Tilleuls', 'H-2026', 'Colmar')
on conflict (id) do nothing;

insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat)
values ('e9200000-0000-0000-0000-00000000005a'::uuid, 'a9000000-0000-0000-0000-000000000001',
        'e9000000-0000-0000-0000-000000000001', 'Couverture S', 'Couverture')
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from public.reserves_intervenants
             where id = 'e9200000-0000-0000-0000-00000000005a'::uuid and entreprise_intervenante_id is null) then
    perform public.reserves_designer_entreprise_intervenante(
      'e9200000-0000-0000-0000-00000000005a'::uuid, 'c9000000-0000-0000-0000-000000000001');
  end if;
end $$;

-- ── S rejoint, sous sa propre identité ───────────────────────────────────────
-- La condition est lue HORS RLS (S ne voit pas encore la ligne), l'appel est fait sous S.
reset role;
do $$
begin
  if exists (select 1 from public.reserves_intervenants
             where id = 'e9200000-0000-0000-0000-00000000005a'::uuid and statut = 'invitee') then
    perform set_config('request.jwt.claims',
      '{"sub":"c9000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
    perform set_config('request.jwt.claim.sub', 'c9000000-0000-0000-0000-0000000000a1', true);
    execute 'set local role authenticated';
    perform public.reserves_rejoindre_intervention('e9200000-0000-0000-0000-00000000005a'::uuid);
    execute 'reset role';
  end if;
end $$;

reset role;
commit;
