-- Nettoyage production demandé le 14 juillet 2026.
-- Conserve exclusivement LIRIA CONCEPT et supprime les deux sociétés de test juju.
-- Le contrôle par ID + nom évite toute suppression accidentelle.

begin;

do $$
declare
  v_liria_count integer;
  v_other_count integer;
begin
  select count(*) into v_liria_count
  from public.entreprises
  where id = 'cc90ee48-7c9a-4983-a143-0df72ca0c937'
    and upper(btrim(nom)) = 'LIRIA CONCEPT';

  if v_liria_count <> 1 then
    raise exception 'Sécurité : entreprise LIRIA CONCEPT attendue introuvable';
  end if;

  select count(*) into v_other_count
  from public.entreprises
  where id not in (
    'cc90ee48-7c9a-4983-a143-0df72ca0c937',
    '142fd408-1ff8-43ec-adc0-b109b39142e0',
    '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
  );

  if v_other_count <> 0 then
    raise exception 'Sécurité : une entreprise non répertoriée est présente, arrêt du nettoyage';
  end if;
end $$;

update public.utilisateurs
set entreprise_active_id = null
where entreprise_active_id in (
  '142fd408-1ff8-43ec-adc0-b109b39142e0',
  '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
);

delete from public.plateforme_acces_entreprises
where entreprise_id in (
  '142fd408-1ff8-43ec-adc0-b109b39142e0',
  '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
)
or entreprise_precedente_id in (
  '142fd408-1ff8-43ec-adc0-b109b39142e0',
  '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
);

delete from public.acces_support_log
where entreprise_id in (
  '142fd408-1ff8-43ec-adc0-b109b39142e0',
  '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
);

delete from public.entreprises
where id in (
  '142fd408-1ff8-43ec-adc0-b109b39142e0',
  '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
)
and lower(btrim(nom)) = 'juju';

do $$
begin
  if exists (
    select 1 from public.entreprises
    where id in (
      '142fd408-1ff8-43ec-adc0-b109b39142e0',
      '91c9db2b-927d-4ed4-877a-6092afb9c2e5'
    )
  ) then
    raise exception 'Le nettoyage des entreprises de test est incomplet';
  end if;
end $$;

commit;

select id, nom, reference_interne
from public.entreprises
order by created_at;
