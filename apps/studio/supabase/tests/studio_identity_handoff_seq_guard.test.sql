-- ELSATIA-STUDIO-IDENTITY-HANDOFF-SEQ-GUARD (projet dédié) — REDTEAM-V2.
-- Migration : 20260928130000_studio_identity_handoff_seq_guard_v1.sql
--
-- Prouve qu'un jeton de passage PÉRIMÉ (seq inférieure à l'état local) ne peut
-- plus rétablir le droit d'écriture après une révocation d'entitlement, tout en
-- gardant le rafraîchissement légitime (même génération, ou génération plus récente).

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- État initial : compte actif à la séquence 6, droit accordé (jeton de passage seq 6).
select public.studio_identity_accept_handoff('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 6, true, 'pro', null);
select is(
  (select granted from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), true,
  'seq 6 : droit accordé'
);
select is(
  (select state_seq from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 6::bigint,
  'seq 6 : séquence enregistrée'
);

-- La plateforme révoque l'entitlement à la séquence 7 (compte toujours actif).
select public.studio_identity_apply_lifecycle(
  gen_random_uuid(), 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 7, 'active', 'entitlement_changed', true, false, null, null);
select is(
  (select granted from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false,
  'seq 7 : droit retiré, compte actif'
);

-- EXPLOIT REDTEAM-V2 : re-présentation du jeton PÉRIMÉ seq 6 (droit accordé).
-- Avant correctif : `granted` repassait à true. Après : aucun effet.
select public.studio_identity_accept_handoff('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 6, true, 'pro', null);
select is(
  (select granted from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), false,
  'jeton périmé (seq 6) NE rétablit PAS le droit après révocation seq 7 (REDTEAM-V2)'
);
select is(
  (select state_seq from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 7::bigint,
  'la séquence locale reste à 7 (jeton périmé ignoré)'
);

-- Positif : un jeton plus récent (seq 8, droit accordé) rétablit légitimement l'accès.
select public.studio_identity_accept_handoff('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 8, true, 'pro', null);
select is(
  (select granted from studio_identity.subject_state where subject = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), true,
  'jeton plus récent (seq 8) rétablit le droit : chemin légitime préservé'
);

select * from finish();
rollback;
