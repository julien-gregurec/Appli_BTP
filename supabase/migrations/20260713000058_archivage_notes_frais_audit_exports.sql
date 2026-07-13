-- Journal append-only, exports comptables, gel juridique et suggestions OCR.

create table public.journal_audit_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  role_utilisateur text,
  adresse_ip inet,
  user_agent text,
  action text not null,
  ressource_type text not null,
  ressource_id uuid,
  ancien_statut text,
  nouveau_statut text,
  date_serveur timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  empreinte_document text,
  empreinte_evenement_precedent text,
  empreinte_evenement text not null,
  check(empreinte_document is null or empreinte_document ~ '^[0-9a-f]{64}$'),
  check(empreinte_evenement_precedent is null or empreinte_evenement_precedent ~ '^[0-9a-f]{64}$'),
  check(empreinte_evenement ~ '^[0-9a-f]{64}$')
);
create index journal_audit_notes_frais_entreprise_idx
  on public.journal_audit_notes_frais(entreprise_id,date_serveur desc);
create index journal_audit_notes_frais_ressource_idx
  on public.journal_audit_notes_frais(ressource_type,ressource_id,date_serveur);

create table public.exports_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  periode_debut date not null,
  periode_fin date not null,
  filtres jsonb not null default '{}'::jsonb,
  statut text not null default 'en_cours' check(statut in ('en_cours','termine','erreur')),
  storage_path text,
  nom_fichier text,
  empreinte_sha256 text,
  nombre_depenses integer not null default 0,
  taille_octets bigint,
  cree_par uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  termine_at timestamptz,
  check(periode_fin>=periode_debut),
  check(empreinte_sha256 is null or empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  unique(id,entreprise_id)
);

create table public.elements_export_notes_frais(
  export_id uuid not null,
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  note_frais_id uuid not null,
  document_version_id uuid,
  chemin_dans_archive text not null,
  empreinte_sha256 text,
  created_at timestamptz not null default now(),
  primary key(export_id,note_frais_id,chemin_dans_archive),
  foreign key(export_id,entreprise_id) references public.exports_notes_frais(id,entreprise_id) on delete cascade,
  foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete restrict,
  foreign key(document_version_id,entreprise_id) references public.versions_documents_notes_frais(id,entreprise_id) on delete restrict
);

create table public.legal_holds_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  note_frais_id uuid not null,
  motif text not null check(btrim(motif)<>''),
  actif boolean not null default true,
  pose_par uuid references public.utilisateurs(id) on delete set null,
  pose_at timestamptz not null default now(),
  leve_par uuid references public.utilisateurs(id) on delete set null,
  leve_at timestamptz,
  foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete cascade
);
create unique index legal_hold_notes_frais_actif_unique
  on public.legal_holds_notes_frais(note_frais_id) where actif;

create table public.suggestions_ocr_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  note_frais_id uuid not null,
  document_version_id uuid,
  provider text not null,
  statut text not null default 'en_attente' check(statut in ('en_attente','termine','erreur','non_configure')),
  suggestions jsonb not null default '{}'::jsonb,
  confiances jsonb not null default '{}'::jsonb,
  incoherences text[] not null default array[]::text[],
  brut_metadata jsonb not null default '{}'::jsonb,
  valide_par_utilisateur boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete cascade,
  foreign key(document_version_id,entreprise_id) references public.versions_documents_notes_frais(id,entreprise_id) on delete set null(document_version_id)
);

create table public.tentatives_acces_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  ressource_type text not null,
  ressource_id uuid,
  action text not null,
  motif text,
  adresse_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

notify pgrst,'reload schema';
