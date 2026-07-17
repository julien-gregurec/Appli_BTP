-- Collaboration interne, appels d'offres, DOE et fiches techniques produits.
-- Les conversations privées ne sont jamais ouvertes au rôle anon.

insert into public.permissions_disponibles(cle,module,description) values
  ('acces_messagerie','Messagerie','Échanger avec les collaborateurs et les équipes chantier'),
  ('gerer_messagerie','Messagerie','Accéder aux conversations de chantier et administrer la messagerie'),
  ('acces_appels_offres','Appels d’offres','Consulter les appels d’offres'),
  ('gerer_appels_offres','Appels d’offres','Créer et suivre les appels d’offres'),
  ('gerer_doe','Chantiers','Générer et figer les dossiers des ouvrages exécutés'),
  ('gerer_email_chantier','Chantiers','Connecter une boîte mail et classer les messages dans les chantiers')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

-- La messagerie est disponible pour tous les comptes actifs de l'entreprise.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'acces_messagerie',true from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

-- Les droits métier suivent les droits existants les plus proches.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,x.nouvelle,true
from public.permissions_poste pp
cross join lateral (values
  ('acces_chantiers','acces_appels_offres'),
  ('gerer_chantiers','gerer_appels_offres'),
  ('gerer_chantiers','gerer_doe'),
  ('gerer_chantiers','gerer_messagerie'),
  ('gerer_parametres','gerer_email_chantier')
) x(source,nouvelle)
where pp.cle_permission=x.source and pp.autorise
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

create table public.conversations_internes(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type text not null check(type in('directe','chantier')),
  titre text,
  chantier_id uuid,
  cree_par_employe_id uuid not null,
  destinataire_employe_id uuid,
  derniere_activite_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(id,entreprise_id),
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete cascade,
  foreign key(cree_par_employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete cascade,
  foreign key(destinataire_employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete cascade,
  check(
    (type='chantier' and chantier_id is not null and destinataire_employe_id is null)
    or (type='directe' and chantier_id is null and destinataire_employe_id is not null and destinataire_employe_id<>cree_par_employe_id)
  )
);
create unique index conversations_chantier_unique on public.conversations_internes(entreprise_id,chantier_id) where type='chantier';
create index conversations_internes_activite_idx on public.conversations_internes(entreprise_id,derniere_activite_at desc);

create table public.messages_internes(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  conversation_id uuid not null,
  auteur_employe_id uuid not null,
  contenu text not null check(length(btrim(contenu)) between 1 and 5000),
  lu_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(conversation_id,entreprise_id) references public.conversations_internes(id,entreprise_id) on delete cascade,
  foreign key(auteur_employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete restrict
);
create index messages_internes_fil_idx on public.messages_internes(conversation_id,created_at);

create or replace function public.employe_courant(p_entreprise_id uuid)
returns uuid language sql security definer stable set search_path=public as $$
  select e.id from public.employes e
  where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid() and e.statut not in('sorti','suspendu')
  limit 1
$$;
revoke all on function public.employe_courant(uuid) from public,anon;
grant execute on function public.employe_courant(uuid) to authenticated;

-- Annuaire minimal réservé à la messagerie : aucun coût, droit ou donnée RH sensible.
create or replace function public.contacts_messagerie(p_entreprise_id uuid)
returns table(id uuid,prenom text,nom text,poste text)
language plpgsql security definer stable set search_path=public as $$
begin
  if not public.est_membre_actif(p_entreprise_id) or not public.a_permission(p_entreprise_id,'acces_messagerie') then
    raise exception 'Accès messagerie refusé';
  end if;
  return query select e.id,e.prenom,e.nom,e.poste from public.employes e
    where e.entreprise_id=p_entreprise_id and e.statut not in('sorti','suspendu') order by e.nom,e.prenom;
end;$$;
revoke all on function public.contacts_messagerie(uuid) from public,anon;
grant execute on function public.contacts_messagerie(uuid) to authenticated;

create or replace function public.peut_acceder_conversation(p_conversation_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(
    select 1 from public.conversations_internes c
    where c.id=p_conversation_id and public.est_membre_actif(c.entreprise_id)
      and (
        public.a_permission(c.entreprise_id,'gerer_messagerie')
        or public.employe_courant(c.entreprise_id) in(c.cree_par_employe_id,c.destinataire_employe_id)
        or (c.type='chantier' and exists(
          select 1 from public.equipes_chantiers ec
          where ec.entreprise_id=c.entreprise_id and ec.chantier_id=c.chantier_id
            and ec.employe_id=public.employe_courant(c.entreprise_id) and ec.date_fin is null
        ))
      )
  )
$$;
revoke all on function public.peut_acceder_conversation(uuid) from public,anon;
grant execute on function public.peut_acceder_conversation(uuid) to authenticated;

alter table public.conversations_internes enable row level security;
alter table public.messages_internes enable row level security;
create policy conversations_lecture on public.conversations_internes for select to authenticated using(public.peut_acceder_conversation(id));
create policy conversations_creation on public.conversations_internes for insert to authenticated with check(
  public.est_membre_actif(entreprise_id)
  and cree_par_employe_id=public.employe_courant(entreprise_id)
  and (
    (type='directe' and exists(select 1 from public.employes e where e.id=destinataire_employe_id and e.entreprise_id=conversations_internes.entreprise_id and e.statut not in('sorti','suspendu')))
    or (type='chantier' and (public.a_permission(entreprise_id,'gerer_messagerie') or exists(select 1 from public.equipes_chantiers ec where ec.entreprise_id=conversations_internes.entreprise_id and ec.chantier_id=conversations_internes.chantier_id and ec.employe_id=public.employe_courant(conversations_internes.entreprise_id) and ec.date_fin is null)))
  )
);
create policy messages_lecture on public.messages_internes for select to authenticated using(public.peut_acceder_conversation(conversation_id));
create policy messages_creation on public.messages_internes for insert to authenticated with check(
  auteur_employe_id=public.employe_courant(entreprise_id) and public.peut_acceder_conversation(conversation_id)
);
grant select,insert on public.conversations_internes,public.messages_internes to authenticated;

create or replace function public.actualiser_conversation_message()
returns trigger language plpgsql security definer set search_path=public as $$
begin update public.conversations_internes set derniere_activite_at=new.created_at where id=new.conversation_id;return new;end;$$;
create trigger actualiser_conversation_apres_message after insert on public.messages_internes for each row execute function public.actualiser_conversation_message();
revoke all on function public.actualiser_conversation_message() from public,anon,authenticated;

create unique index if not exists clients_id_entreprise_unique on public.clients(id,entreprise_id);
create table public.appels_offres(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference text not null,
  titre text not null check(btrim(titre)<>''),
  client_id uuid,
  chantier_id uuid,
  source_url text,
  date_limite timestamptz,
  montant_estime_ht numeric(14,2) check(montant_estime_ht is null or montant_estime_ht>=0),
  statut text not null default 'a_etudier' check(statut in('a_etudier','en_preparation','depose','gagne','perdu','abandonne')),
  notes text,
  cree_par uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entreprise_id,reference),unique(id,entreprise_id),
  foreign key(client_id,entreprise_id) references public.clients(id,entreprise_id) on delete set null(client_id),
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete set null(chantier_id)
);
create index appels_offres_echeance_idx on public.appels_offres(entreprise_id,statut,date_limite);
alter table public.appels_offres enable row level security;
create policy appels_offres_lecture on public.appels_offres for select to authenticated using(public.a_permission(entreprise_id,'acces_appels_offres'));
create policy appels_offres_gestion on public.appels_offres for all to authenticated using(public.a_permission(entreprise_id,'gerer_appels_offres')) with check(public.a_permission(entreprise_id,'gerer_appels_offres'));
create policy appels_offres_prototype on public.appels_offres for all to anon using(true) with check(true);
grant select,insert,update,delete on public.appels_offres to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fiches-techniques','fiches-techniques',false,20971520,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.fiches_techniques_articles(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  article_id uuid not null,
  type_document text not null default 'fiche_technique' check(type_document in('fiche_technique','fiche_securite','declaration_performance','notice_pose','certificat','autre')),
  titre text not null check(btrim(titre)<>''),
  fabricant text,
  reference_fabricant text,
  storage_path text not null unique,
  nom_original text not null,
  mime_type text not null,
  taille_octets bigint not null check(taille_octets>0 and taille_octets<=20971520),
  source_url text,
  origine text not null default 'import_manuel' check(origine in('import_manuel','fournisseur_api','catalogue_importe')),
  version text,
  created_at timestamptz not null default now(),
  foreign key(article_id,entreprise_id) references public.articles_stock(id,entreprise_id) on delete cascade
);
create index fiches_techniques_article_idx on public.fiches_techniques_articles(entreprise_id,article_id,created_at desc);
alter table public.fiches_techniques_articles enable row level security;
create policy fiches_techniques_lecture on public.fiches_techniques_articles for select to authenticated using(
  public.a_permission(entreprise_id,'acces_stock') or public.a_permission(entreprise_id,'acces_chantiers') or public.a_permission(entreprise_id,'voir_devis_chantier_sans_prix')
);
create policy fiches_techniques_gestion on public.fiches_techniques_articles for all to authenticated using(public.a_permission(entreprise_id,'gerer_stock')) with check(public.a_permission(entreprise_id,'gerer_stock'));
create policy fiches_techniques_prototype on public.fiches_techniques_articles for all to anon using(true) with check(true);
grant select,insert,update,delete on public.fiches_techniques_articles to anon,authenticated;

create policy fiches_techniques_storage_lecture on storage.objects for select to authenticated using(
  bucket_id='fiches-techniques' and (public.a_permission(((storage.foldername(name))[1])::uuid,'acces_stock') or public.a_permission(((storage.foldername(name))[1])::uuid,'acces_chantiers') or public.a_permission(((storage.foldername(name))[1])::uuid,'voir_devis_chantier_sans_prix'))
);
create policy fiches_techniques_storage_gestion on storage.objects for all to authenticated using(bucket_id='fiches-techniques' and public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_stock')) with check(bucket_id='fiches-techniques' and public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_stock'));
create policy fiches_techniques_storage_prototype on storage.objects for all to anon using(bucket_id='fiches-techniques') with check(bucket_id='fiches-techniques');

create table public.doe_generations(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null,
  version integer not null,
  statut text not null default 'genere' check(statut in('genere','transmis','archive')),
  manifeste jsonb not null default '{}'::jsonb,
  genere_par uuid references auth.users(id) on delete set null default auth.uid(),
  genere_at timestamptz not null default now(),
  unique(entreprise_id,chantier_id,version),
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete cascade
);
alter table public.doe_generations enable row level security;
create policy doe_lecture on public.doe_generations for select to authenticated using(public.a_permission(entreprise_id,'acces_chantiers') or public.a_permission(entreprise_id,'voir_devis_chantier_sans_prix'));
create policy doe_gestion on public.doe_generations for all to authenticated using(public.a_permission(entreprise_id,'gerer_doe')) with check(public.a_permission(entreprise_id,'gerer_doe'));
create policy doe_prototype on public.doe_generations for all to anon using(true) with check(true);
grant select,insert,update on public.doe_generations to anon,authenticated;

-- Les secrets OAuth restent chez le prestataire ou dans le coffre de l'hébergeur.
create table public.connexions_email(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  fournisseur text not null check(fournisseur in('google','microsoft','imap')),
  adresse_email text not null,
  statut text not null default 'a_configurer' check(statut in('a_configurer','active','erreur','suspendue')),
  secret_reference text,
  derniere_synchro_at timestamptz,
  erreur_derniere_synchro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entreprise_id,adresse_email)
);
create table public.emails_chantier(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null,
  connexion_id uuid,
  identifiant_externe text not null,
  direction text not null check(direction in('entrant','sortant')),
  expediteur text,
  destinataires text[],
  copie text[],
  objet text,
  apercu text,
  recu_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(entreprise_id,identifiant_externe),
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete cascade,
  foreign key(connexion_id) references public.connexions_email(id) on delete set null
);
alter table public.connexions_email enable row level security;
alter table public.emails_chantier enable row level security;
create policy connexions_email_gestion on public.connexions_email for all to authenticated using(public.a_permission(entreprise_id,'gerer_email_chantier')) with check(public.a_permission(entreprise_id,'gerer_email_chantier'));
create policy emails_chantier_lecture on public.emails_chantier for select to authenticated using(public.a_permission(entreprise_id,'acces_chantiers'));
create policy emails_chantier_gestion on public.emails_chantier for all to authenticated using(public.a_permission(entreprise_id,'gerer_email_chantier')) with check(public.a_permission(entreprise_id,'gerer_email_chantier'));
create policy connexions_email_prototype on public.connexions_email for all to anon using(true) with check(true);
create policy emails_chantier_prototype on public.emails_chantier for all to anon using(true) with check(true);
grant select,insert,update,delete on public.connexions_email,public.emails_chantier to anon,authenticated;

create table public.ecritures_comptables_importees(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  journal text not null,
  date_ecriture date not null,
  numero_piece text,
  compte text not null,
  libelle text not null,
  debit numeric(14,2) not null default 0 check(debit>=0),
  credit numeric(14,2) not null default 0 check(credit>=0),
  source_logiciel text not null default 'Batappli',
  reference_source text,
  created_at timestamptz not null default now(),
  check(debit>0 or credit>0)
);
create index ecritures_comptables_import_idx on public.ecritures_comptables_importees(entreprise_id,date_ecriture,journal);
alter table public.ecritures_comptables_importees enable row level security;
create policy ecritures_import_lecture on public.ecritures_comptables_importees for select to authenticated using(public.a_permission(entreprise_id,'acces_exports'));
create policy ecritures_import_gestion on public.ecritures_comptables_importees for all to authenticated using(public.a_permission(entreprise_id,'gerer_parametres')) with check(public.a_permission(entreprise_id,'gerer_parametres'));
create policy ecritures_import_prototype on public.ecritures_comptables_importees for all to anon using(true) with check(true);
grant select,insert on public.ecritures_comptables_importees to anon,authenticated;

notify pgrst,'reload schema';
