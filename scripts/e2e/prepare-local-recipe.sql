-- Adaptateur strictement local pour la recette navigateur multi-rôles.
-- Le jeu métier est fourni par supabase/tests/fixtures/isolation_multitenant.inc.
-- Ce fichier corrige uniquement la représentation Auth requise par GoTrue local
-- et neutralise la limitation d'offre afin de tester les permissions métier.

update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email like '%@invalid.local';

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
)
select
  id,
  id::text,
  id,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email',
  coalesce(created_at, now()),
  coalesce(updated_at, now())
from auth.users
where email like '%@invalid.local'
on conflict (provider_id, provider) do update
set identity_data = excluded.identity_data,
    updated_at = excluded.updated_at;

update public.entreprises
set nom = case id
    when 'a0000000-0000-0000-0000-000000000001'::uuid then 'RECETTE_A_ENTREPRISE'
    when 'b0000000-0000-0000-0000-000000000001'::uuid then 'RECETTE_B_ENTREPRISE'
    else nom
  end,
  abonnement_statut = 'actif',
  abonnement_offre = 'entreprise',
  abonnement_echeance = current_date + 365
where id in (
  'a0000000-0000-0000-0000-000000000001'::uuid,
  'b0000000-0000-0000-0000-000000000001'::uuid
);

-- Le layout authentifié exige toujours une entreprise active, y compris pour
-- l'espace plateforme. On donne donc au compte plateforme une entreprise
-- technique dédiée, sans jamais le rattacher aux entreprises clientes A/B.
insert into public.entreprises (
  id, nom, code_adhesion, abonnement_statut, abonnement_offre,
  abonnement_echeance
) values (
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'RECETTE_PLATEFORME_INTERNE',
  'ISOC0001',
  'actif',
  'entreprise',
  current_date + 365
)
on conflict (id) do update
set nom = excluded.nom,
    abonnement_statut = excluded.abonnement_statut,
    abonnement_offre = excluded.abonnement_offre,
    abonnement_echeance = excluded.abonnement_echeance;

insert into public.postes (id, entreprise_id, nom)
values (
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'Plateforme interne'
)
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (
  utilisateur_id, entreprise_id, poste_id, statut
) values (
  '30000000-0000-0000-0000-000000000001'::uuid,
  'c0000000-0000-0000-0000-000000000001'::uuid,
  'c1000000-0000-0000-0000-000000000001'::uuid,
  'actif'
)
on conflict (utilisateur_id, entreprise_id) do update
set poste_id = excluded.poste_id,
    statut = excluded.statut;

update public.utilisateurs
set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'::uuid
where id = '30000000-0000-0000-0000-000000000001'::uuid;

-- Le fixture pgTAP n'a pas besoin de l'entreprise active, contrairement à
-- l'application qui la résout dès le premier rendu après connexion.
update public.utilisateurs u
set entreprise_active_id = ue.entreprise_id
from public.utilisateurs_entreprises ue
where ue.utilisateur_id = u.id
  and ue.statut = 'actif'
  and ue.entreprise_id in (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'b0000000-0000-0000-0000-000000000001'::uuid
  );

-- Les postes administrateur/dirigeant du fixture reçoivent toutes les
-- permissions par cross join. Le mode dépôt est toutefois un verrouillage de
-- terminal, pas un droit ordinaire : aucun compte de recette ne doit l'avoir.
update public.permissions_poste
set autorise = false
where entreprise_id in (
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'b0000000-0000-0000-0000-000000000001'::uuid
  )
  and cle_permission = 'mode_compte_depot';
