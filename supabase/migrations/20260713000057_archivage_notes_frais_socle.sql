-- Archivage des justificatifs de dépenses : socle compatible avec les notes existantes.

alter table public.notes_frais drop constraint if exists notes_frais_statut_check;
alter table public.notes_frais
  add column if not exists reference text,
  add column if not exists fournisseur text,
  add column if not exists date_import timestamptz not null default now(),
  add column if not exists montant_ht numeric(12,2),
  add column if not exists montant_tva numeric(12,2),
  add column if not exists taux_tva numeric(5,2),
  add column if not exists devise text not null default 'EUR',
  add column if not exists moyen_paiement text,
  add column if not exists commentaire_salarie text,
  add column if not exists type_document_principal text,
  add column if not exists statut_document text not null default 'original_recu',
  add column if not exists motif_decision text,
  add column if not exists soumis_at timestamptz,
  add column if not exists verification_at timestamptz,
  add column if not exists valide_at timestamptz,
  add column if not exists valide_par uuid references public.utilisateurs(id) on delete set null,
  add column if not exists refuse_at timestamptz,
  add column if not exists verrouille_at timestamptz,
  add column if not exists verrouille_par uuid references public.utilisateurs(id) on delete set null,
  add column if not exists duree_conservation_annees integer not null default 10,
  add column if not exists suppression_theorique_at date,
  add column if not exists reference_comptable text,
  add column if not exists statut_export text not null default 'non_exporte',
  add column if not exists exporte_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.notes_frais
  add constraint notes_frais_statut_check check (statut in (
    'brouillon','a_completer','soumis','en_verification','correction_demandee',
    'valide','refuse','exporte_comptabilite','verrouille','archive',
    'soumise','validee','remboursee','refusee'
  )),
  add constraint notes_frais_montants_check check (
    (montant_ht is null or montant_ht >= 0)
    and (montant_tva is null or montant_tva >= 0)
    and (taux_tva is null or taux_tva between 0 and 100)
    and montant_ttc >= 0
  ),
  add constraint notes_frais_devise_check check (devise ~ '^[A-Z]{3}$'),
  add constraint notes_frais_document_principal_check check (
    type_document_principal is null or type_document_principal in (
      'facture','ticket_caisse','recu_paiement','recu_carte_bancaire',
      'facture_electronique_originale','autre_justificatif'
    )
  ),
  add constraint notes_frais_statut_document_check check (statut_document in (
    'original_recu','incomplet','illisible','anomalie_integrite','archive'
  )),
  add constraint notes_frais_statut_export_check check (statut_export in (
    'non_exporte','en_cours','exporte','erreur'
  )),
  add constraint notes_frais_conservation_check check (duree_conservation_annees between 1 and 50);

create unique index if not exists notes_frais_id_entreprise_unique
  on public.notes_frais(id,entreprise_id);
create unique index if not exists notes_frais_reference_unique
  on public.notes_frais(entreprise_id,reference) where reference is not null;
create index if not exists notes_frais_recherche_idx
  on public.notes_frais(entreprise_id,statut,date_frais desc,fournisseur);
create index if not exists notes_frais_export_idx
  on public.notes_frais(entreprise_id,statut_export,date_frais desc);

create or replace function public.trg_reference_note_frais()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if nullif(btrim(new.reference),'') is null then
    new.reference:=public.next_reference(new.entreprise_id,'note_frais','EXP',6,true);
  end if;
  new.updated_at:=now();
  return new;
end;$$;
drop trigger if exists reference_note_frais on public.notes_frais;
create trigger reference_note_frais before insert or update on public.notes_frais
for each row execute function public.trg_reference_note_frais();

update public.notes_frais
set reference=public.next_reference(entreprise_id,'note_frais','EXP',6,true)
where reference is null;
alter table public.notes_frais alter column reference set not null;

create table public.categories_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  code text not null,
  libelle text not null check(btrim(libelle)<>''),
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entreprise_id,code)
);

create or replace function public.seed_categories_notes_frais(p_entreprise_id uuid)
returns void language sql security definer set search_path=public as $$
  insert into public.categories_notes_frais(entreprise_id,code,libelle,ordre)
  values
    (p_entreprise_id,'repas','Repas',10),(p_entreprise_id,'carburant','Carburant',20),
    (p_entreprise_id,'peage','Péage',30),(p_entreprise_id,'stationnement','Stationnement',40),
    (p_entreprise_id,'hotel','Hôtel',50),(p_entreprise_id,'transport','Transport',60),
    (p_entreprise_id,'petit_materiel','Petit matériel',70),(p_entreprise_id,'fournitures','Fournitures',80),
    (p_entreprise_id,'outillage','Outillage',90),(p_entreprise_id,'achat_chantier','Achat chantier',100),
    (p_entreprise_id,'autre','Autre',999)
  on conflict(entreprise_id,code) do nothing;
$$;
select public.seed_categories_notes_frais(id) from public.entreprises;

create or replace function public.trg_seed_categories_notes_frais()
returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.seed_categories_notes_frais(new.id);return new;end;$$;
drop trigger if exists seed_categories_notes_frais on public.entreprises;
create trigger seed_categories_notes_frais after insert on public.entreprises
for each row execute function public.trg_seed_categories_notes_frais();

create table public.politiques_conservation_notes_frais(
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
  mode_archivage text not null default 'simple_document_storage'
    check(mode_archivage in ('simple_document_storage','reinforced_archive')),
  duree_conservation_annees integer not null default 10 check(duree_conservation_annees between 1 and 50),
  taille_max_octets bigint not null default 15728640 check(taille_max_octets between 1048576 and 52428800),
  analyse_antivirus_obligatoire boolean not null default false,
  suppression_automatique boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.utilisateurs(id) on delete set null
);
insert into public.politiques_conservation_notes_frais(entreprise_id)
select id from public.entreprises on conflict do nothing;

create or replace function public.trg_seed_politique_notes_frais()
returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.politiques_conservation_notes_frais(entreprise_id) values(new.id) on conflict do nothing;return new;end;$$;
drop trigger if exists seed_politique_notes_frais on public.entreprises;
create trigger seed_politique_notes_frais after insert on public.entreprises
for each row execute function public.trg_seed_politique_notes_frais();

create table public.documents_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  note_frais_id uuid not null,
  type_document text not null check(type_document in (
    'facture','ticket_caisse','recu_paiement','recu_carte_bancaire',
    'facture_electronique_originale','autre_justificatif'
  )),
  statut_document text not null default 'importe'
    check(statut_document in ('importe','a_verifier','verifie','anomalie','remplace')),
  facture_electronique_originale boolean not null default false,
  nombre_pages integer not null default 1 check(nombre_pages between 1 and 200),
  nom_fichier_original text,
  type_mime_original text,
  taille_originale bigint check(taille_originale is null or taille_originale >= 0),
  empreinte_sha256_originale text check(empreinte_sha256_originale is null or empreinte_sha256_originale ~ '^[0-9a-f]{64}$'),
  empreinte_sha256_archive text check(empreinte_sha256_archive is null or empreinte_sha256_archive ~ '^[0-9a-f]{64}$'),
  importe_par uuid references public.utilisateurs(id) on delete set null,
  importe_at timestamptz not null default now(),
  verrouille_at timestamptz,
  document_precedent_id uuid references public.documents_notes_frais(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,entreprise_id),
  foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete cascade
);
create index documents_notes_frais_note_idx on public.documents_notes_frais(note_frais_id,importe_at);
create index documents_notes_frais_hash_idx on public.documents_notes_frais(entreprise_id,empreinte_sha256_originale);

create table public.versions_documents_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  document_id uuid not null,
  numero_version integer not null default 1 check(numero_version>0),
  numero_page integer not null default 1 check(numero_page>0),
  role_fichier text not null check(role_fichier in ('original','consultation','archive_figee','ocr_source')),
  storage_path text not null,
  nom_fichier_original text not null,
  type_mime_declare text,
  type_mime_detecte text not null,
  taille_octets bigint not null check(taille_octets>0),
  empreinte_sha256 text not null check(empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  transformation text,
  transformation_metadata jsonb not null default '{}'::jsonb,
  antivirus_statut text not null default 'non_configure'
    check(antivirus_statut in ('non_configure','en_attente','sain','infecte','erreur')),
  horodatage_provider text not null default 'local_server',
  horodatage_reference text,
  created_by uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(document_id,numero_version,numero_page,role_fichier),
  unique(storage_path),
  unique(id,entreprise_id),
  foreign key(document_id,entreprise_id) references public.documents_notes_frais(id,entreprise_id) on delete cascade
);
create index versions_documents_hash_idx on public.versions_documents_notes_frais(entreprise_id,empreinte_sha256);

create table public.validations_notes_frais(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  note_frais_id uuid not null,
  action text not null check(action in ('soumission','prise_en_charge','correction_demandee','validation','refus','export','verrouillage','archivage')),
  ancien_statut text,
  nouveau_statut text not null,
  message text,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  role_utilisateur text,
  created_at timestamptz not null default now(),
  foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete cascade
);
create index validations_notes_frais_idx on public.validations_notes_frais(note_frais_id,created_at);

revoke all on function public.trg_reference_note_frais() from public,anon,authenticated;
revoke all on function public.seed_categories_notes_frais(uuid) from public,anon,authenticated;
revoke all on function public.trg_seed_categories_notes_frais() from public,anon,authenticated;
revoke all on function public.trg_seed_politique_notes_frais() from public,anon,authenticated;
notify pgrst,'reload schema';
