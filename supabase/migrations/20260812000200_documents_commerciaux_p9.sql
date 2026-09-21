-- P9 : documents commerciaux serveur (PDF, emails, accès client externe).
--
-- 1. Traçabilité d'envoi minimale sur devis/factures (qui/quand, pas un CRM).
-- 2. Snapshot immuable de l'identité légale de l'entreprise au moment de
--    l'émission d'une facture : une facture déjà émise ne doit jamais changer
--    de contenu affiché si l'entreprise modifie ensuite son adresse, son SIRET
--    ou son logo. Rempli une seule fois par l'application, jamais réécrit.
-- 3. Accès externe par token pour que le client consulte/télécharge son
--    devis/sa facture sans compte ELSATIA. Le token n'est jamais stocké en
--    clair (seul son empreinte SHA-256, calculée côté application) : une
--    fuite de cette table ne donne accès à aucun document.

alter table public.devis
  add column if not exists email_envoye_le timestamptz,
  add column if not exists email_envoye_a text;

alter table public.factures
  add column if not exists email_envoye_le timestamptz,
  add column if not exists email_envoye_a text,
  add column if not exists entreprise_snapshot jsonb;

create table if not exists public.acces_externes_documents (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type_document text not null check (type_document in ('devis', 'facture')),
  document_id uuid not null,
  token_hash text not null unique,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.utilisateurs(id) on delete set null,
  expire_le timestamptz,
  revoque_le timestamptz
);

comment on table public.acces_externes_documents is
  'Tokens d''accès externe (client, sans compte) à un devis/une facture. token_hash = SHA-256 du token, calculé côté application ; le token en clair n''est jamais persisté.';

create index if not exists idx_acces_externes_documents_document
  on public.acces_externes_documents (type_document, document_id);

create index if not exists idx_acces_externes_documents_entreprise
  on public.acces_externes_documents (entreprise_id);

alter table public.acces_externes_documents enable row level security;

-- Lecture/gestion réservées aux membres actifs de l'entreprise avec le droit
-- de gérer devis/factures. Aucune policy anon ici : l'accès externe passe
-- exclusivement par la fonction security definer ci-dessous, qui ne renvoie
-- jamais plus que l'identité du document déjà validée par le token.
create policy "membres gerent acces externes documents" on public.acces_externes_documents
  for all
  to authenticated
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

create policy "lecture acces externes selon permission" on public.acces_externes_documents
  as restrictive for select
  to authenticated
  using (
    (type_document = 'devis' and public.a_permission(entreprise_id, 'acces_devis'))
    or (type_document = 'facture' and public.a_permission(entreprise_id, 'acces_factures'))
  );

-- Émettre/révoquer un lien externe exige le droit de gérer le document
-- concerné (pas seulement d'être membre actif) — même exigence que pour
-- modifier les lignes d'un devis/d'une facture (voir role_gestion_insert/
-- update dans 20260713000043_permissions_rls_gestion.sql).
create policy "ecriture acces externes selon permission" on public.acces_externes_documents
  as restrictive for insert
  to authenticated
  with check (
    (type_document = 'devis' and public.a_permission(entreprise_id, 'gerer_devis'))
    or (type_document = 'facture' and public.a_permission(entreprise_id, 'gerer_factures'))
  );

create policy "revocation acces externes selon permission" on public.acces_externes_documents
  as restrictive for update
  to authenticated
  using (
    (type_document = 'devis' and public.a_permission(entreprise_id, 'gerer_devis'))
    or (type_document = 'facture' and public.a_permission(entreprise_id, 'gerer_factures'))
  )
  with check (
    (type_document = 'devis' and public.a_permission(entreprise_id, 'gerer_devis'))
    or (type_document = 'facture' and public.a_permission(entreprise_id, 'gerer_factures'))
  );

-- Résout un token externe vers l'identité du document, sans jamais exposer
-- d'autre donnée de l'entreprise. Le token n'est jamais reçu en clair par
-- cette fonction : seule son empreinte SHA-256 (calculée côté application,
-- avant tout appel réseau) transite. Un token invalide/expiré/révoqué ne
-- retourne aucune ligne, sans distinguer les cas (pas d'oracle d'énumération).
create or replace function public.document_commercial_par_token(p_token_hash text)
returns table (type_document text, document_id uuid, entreprise_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select a.type_document, a.document_id, a.entreprise_id
  from public.acces_externes_documents a
  where a.token_hash = p_token_hash
    and a.revoque_le is null
    and (a.expire_le is null or a.expire_le > now())
  limit 1;
$$;

revoke all on function public.document_commercial_par_token(text) from public;
grant execute on function public.document_commercial_par_token(text) to anon, authenticated;
