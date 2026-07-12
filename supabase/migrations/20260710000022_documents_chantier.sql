-- Photos et documents de chantier dans un bucket privé, isolés par entreprise.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chantier-documents',
  'chantier-documents',
  false,
  15728640,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.documents_chantier (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null,
  nom text not null check (btrim(nom) <> ''),
  categorie text not null default 'autre'
    check (categorie in (
      'photo_avant', 'photo_pendant', 'photo_apres', 'plan',
      'bon_livraison', 'facture_fournisseur', 'piece_technique', 'autre'
    )),
  storage_path text not null unique check (btrim(storage_path) <> ''),
  mime_type text not null check (btrim(mime_type) <> ''),
  taille_octets bigint not null check (taille_octets > 0 and taille_octets <= 15728640),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (chantier_id, entreprise_id)
    references public.chantiers(id, entreprise_id) on delete cascade
);

create index documents_chantier_liste_idx
  on public.documents_chantier(entreprise_id, chantier_id, created_at desc);

alter table public.documents_chantier enable row level security;

create policy documents_chantier_membres on public.documents_chantier
  for all to authenticated
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

create policy documents_chantier_prototype on public.documents_chantier
  for all to anon using (true) with check (true);

grant select, insert, update, delete on public.documents_chantier to anon, authenticated;

-- Le premier dossier du chemin est toujours l'identifiant de l'entreprise.
create policy chantier_documents_lecture_membres on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chantier-documents'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  );
create policy chantier_documents_ajout_membres on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chantier-documents'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  );
create policy chantier_documents_modification_membres on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chantier-documents'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'chantier-documents'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  );
create policy chantier_documents_suppression_membres on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chantier-documents'
    and public.est_membre_actif(((storage.foldername(name))[1])::uuid)
  );

-- Mode prototype sans connexion, limité à ce seul bucket.
create policy chantier_documents_prototype on storage.objects
  for all to anon
  using (bucket_id = 'chantier-documents')
  with check (bucket_id = 'chantier-documents');
