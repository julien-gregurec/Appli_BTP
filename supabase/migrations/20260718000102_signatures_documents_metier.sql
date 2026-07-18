-- Signatures internes traçables des documents métier.
--
-- La signature source de l'employé est copiée dans un chemin immuable lors de
-- l'apposition. Les deux empreintes relient la copie de signature et l'état du
-- document au moment exact de la signature. Ce mécanisme ne doit pas être
-- présenté comme une signature électronique qualifiée eIDAS.
create table if not exists public.signatures_documents (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null references public.employes(id) on delete restrict,
  type_document text not null check (type_document in (
    'devis','facture','commande','intervention','bon_livraison'
  )),
  document_id uuid not null,
  signature_storage_path text not null,
  signature_sha256 text not null check (signature_sha256 ~ '^[0-9a-f]{64}$'),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  nom_signataire text not null,
  fonction_signataire text,
  declaration text not null default
    'Je confirme avoir pris connaissance du document et l''avoir signé en mon nom propre.',
  signed_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  unique (entreprise_id, type_document, document_id, employe_id)
);

create index if not exists signatures_documents_ressource_idx
  on public.signatures_documents (entreprise_id, type_document, document_id, signed_at);

alter table public.signatures_documents enable row level security;
drop policy if exists signatures_documents_lecture on public.signatures_documents;
create policy signatures_documents_lecture on public.signatures_documents
  for select to authenticated
  using (public.est_membre_actif(entreprise_id));

-- Les écritures passent exclusivement par l'action serveur qui contrôle
-- l'identité, les droits, le document et crée la copie immuable via le client
-- d'administration. Aucun navigateur ne peut insérer, modifier ou effacer une
-- signature directement.
revoke all on public.signatures_documents from public, anon, authenticated;
grant select on public.signatures_documents to authenticated;
grant all on public.signatures_documents to service_role;

-- Une signature apposée est append-only. Même le client d'administration de
-- l'application ne peut pas la réécrire ou la supprimer silencieusement ; une
-- correction passe par un nouveau document ou une nouvelle version métier.
create or replace function public.proteger_signature_document()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Une signature de document est immuable';
end;
$$;
drop trigger if exists signature_document_immuable on public.signatures_documents;
create trigger signature_document_immuable
  before update or delete on public.signatures_documents
  for each row execute function public.proteger_signature_document();
revoke all on function public.proteger_signature_document() from public, anon, authenticated;

notify pgrst, 'reload schema';
