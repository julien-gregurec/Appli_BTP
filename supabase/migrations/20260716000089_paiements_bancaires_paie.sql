-- Paiements bancaires sortants : fournisseurs, salaires et remboursements de notes de frais.
-- Les IBAN sont chiffrés côté serveur applicatif avant stockage. La base ne conserve
-- en clair que les quatre derniers caractères nécessaires à l'identification visuelle.

alter table public.entreprises
  add column if not exists forme_juridique text;

insert into public.permissions_disponibles(cle,module,description) values
 ('acces_paiements_bancaires','Banque et paie','Consulter les lots de virements autorisés'),
 ('gerer_coordonnees_bancaires','Banque et paie','Enregistrer les RIB des salariés et fournisseurs'),
 ('gerer_paie','Banque et paie','Importer et contrôler les bulletins de paie'),
 ('preparer_virements','Banque et paie','Préparer les virements fournisseurs, salaires et notes de frais'),
 ('valider_virements','Banque et paie','Valider les lots de virements avant transmission bancaire'),
 ('executer_virements','Banque et paie','Transmettre les lots validés au prestataire bancaire')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,
  lower(p.nom) in ('admin','administrateur','admin / gérant','admin/gérant','gérant','rh / comptable','comptable')
from public.postes p
cross join public.permissions_disponibles d
where d.cle in ('acces_paiements_bancaires','gerer_coordonnees_bancaires','gerer_paie','preparer_virements','valider_virements','executer_virements')
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create unique index if not exists employes_id_entreprise_unique on public.employes(id,entreprise_id);
create unique index if not exists fournisseurs_id_entreprise_unique on public.fournisseurs(id,entreprise_id);

create table public.coordonnees_bancaires(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 type_beneficiaire text not null check(type_beneficiaire in('employe','fournisseur')),
 employe_id uuid,
 fournisseur_id uuid,
 titulaire text not null check(btrim(titulaire)<>''),
 iban_chiffre text not null check(length(iban_chiffre)>=40),
 iban_hash text not null check(iban_hash~'^[0-9a-f]{64}$'),
 iban_quatre_derniers text not null check(iban_quatre_derniers~'^[A-Z0-9]{4}$'),
 bic_chiffre text,
 actif boolean not null default true,
 verification_statut text not null default 'a_verifier' check(verification_statut in('a_verifier','verifie','rejete')),
 verification_message text,
 verifie_at timestamptz,
 verifie_par uuid references public.utilisateurs(id) on delete set null,
 created_by uuid references public.utilisateurs(id) on delete set null,
 updated_by uuid references public.utilisateurs(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,entreprise_id),
 foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete cascade,
 foreign key(fournisseur_id,entreprise_id) references public.fournisseurs(id,entreprise_id) on delete cascade,
 check(
  (type_beneficiaire='employe' and employe_id is not null and fournisseur_id is null)
  or (type_beneficiaire='fournisseur' and fournisseur_id is not null and employe_id is null)
 )
);
create unique index coord_bancaires_employe_active_unique on public.coordonnees_bancaires(entreprise_id,employe_id) where actif and employe_id is not null;
create unique index coord_bancaires_fournisseur_active_unique on public.coordonnees_bancaires(entreprise_id,fournisseur_id) where actif and fournisseur_id is not null;
create index coord_bancaires_hash_idx on public.coordonnees_bancaires(entreprise_id,iban_hash);

create table public.bulletins_paie(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 employe_id uuid not null,
 periode date not null check(extract(day from periode)=1),
 version integer not null default 1 check(version>0),
 montant_net_a_payer numeric(12,2) not null check(montant_net_a_payer>0),
 date_paiement_prevue date,
 statut text not null default 'a_verifier' check(statut in('a_verifier','valide','paiement_prepare','transmis','paye','annule')),
 nom_fichier_original text not null,
 type_mime text not null check(type_mime='application/pdf'),
 taille_octets bigint not null check(taille_octets between 1 and 20971520),
 empreinte_sha256 text not null check(empreinte_sha256~'^[0-9a-f]{64}$'),
 storage_path text not null unique,
 reference_expert_comptable text,
 importe_par uuid references public.utilisateurs(id) on delete set null,
 importe_at timestamptz not null default now(),
 valide_par uuid references public.utilisateurs(id) on delete set null,
 valide_at timestamptz,
 paye_at timestamptz,
 remplace_bulletin_id uuid references public.bulletins_paie(id) on delete restrict,
 unique(id,entreprise_id),
 foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete restrict,
 unique(entreprise_id,employe_id,periode,version)
);
create index bulletins_paie_liste_idx on public.bulletins_paie(entreprise_id,periode desc,statut);
create index bulletins_paie_employe_idx on public.bulletins_paie(employe_id,periode desc);

create table public.connexions_bancaires(
 entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
 provider text not null default 'powens' check(provider in('powens','qonto','swan')),
 environnement text not null default 'test' check(environnement in('test','production')),
 statut text not null default 'a_configurer' check(statut in('a_configurer','pret','actif','erreur','suspendu')),
 dernier_message text,
 dernier_lot_at timestamptz,
 active_par uuid references public.utilisateurs(id) on delete set null,
 active_at timestamptz,
 updated_at timestamptz not null default now()
);

create table public.lots_virements(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 numero text not null,
 type_lot text not null check(type_lot in('fournisseurs','salaires','notes_frais','mixte')),
 statut text not null default 'brouillon' check(statut in('brouillon','a_valider','valide','consentement_requis','transmis','en_cours','execute','partiel','echec','annule')),
 date_execution date not null,
 devise text not null default 'EUR' check(devise='EUR'),
 nombre_ordres integer not null default 0 check(nombre_ordres>=0),
 montant_total numeric(14,2) not null default 0 check(montant_total>=0),
 provider text check(provider is null or provider in('powens','qonto','swan')),
 provider_payment_id text,
 provider_statut text,
 provider_message text,
 consent_url text,
 idempotency_key uuid not null default gen_random_uuid(),
 cree_par uuid references public.utilisateurs(id) on delete set null,
 valide_par uuid references public.utilisateurs(id) on delete set null,
 transmis_par uuid references public.utilisateurs(id) on delete set null,
 created_at timestamptz not null default now(),
 valide_at timestamptz,
 transmis_at timestamptz,
 execute_at timestamptz,
 updated_at timestamptz not null default now(),
 unique(id,entreprise_id),
 unique(entreprise_id,numero),
 unique(provider,provider_payment_id)
);
create index lots_virements_liste_idx on public.lots_virements(entreprise_id,created_at desc);

create table public.ordres_virements(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 lot_id uuid not null,
 type_beneficiaire text not null check(type_beneficiaire in('employe','fournisseur')),
 employe_id uuid,
 fournisseur_id uuid,
 bulletin_paie_id uuid,
 note_frais_id uuid,
 depense_fournisseur_id uuid,
 titulaire text not null,
 iban_chiffre text not null,
 iban_quatre_derniers text not null,
 bic_chiffre text,
 montant numeric(12,2) not null check(montant>0),
 devise text not null default 'EUR' check(devise='EUR'),
 libelle text not null check(length(libelle) between 1 and 140),
 statut text not null default 'prepare' check(statut in('prepare','transmis','en_cours','execute','echec','annule')),
 provider_instruction_id text,
 provider_statut text,
 erreur text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,entreprise_id),
 foreign key(lot_id,entreprise_id) references public.lots_virements(id,entreprise_id) on delete cascade,
 foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete restrict,
 foreign key(fournisseur_id,entreprise_id) references public.fournisseurs(id,entreprise_id) on delete restrict,
 foreign key(bulletin_paie_id,entreprise_id) references public.bulletins_paie(id,entreprise_id) on delete restrict,
 foreign key(note_frais_id,entreprise_id) references public.notes_frais(id,entreprise_id) on delete restrict,
 foreign key(depense_fournisseur_id,entreprise_id) references public.depenses_fournisseurs(id,entreprise_id) on delete restrict,
 check(
  (type_beneficiaire='employe' and employe_id is not null and fournisseur_id is null)
  or (type_beneficiaire='fournisseur' and fournisseur_id is not null and employe_id is null)
 ),
 check(num_nonnulls(bulletin_paie_id,note_frais_id,depense_fournisseur_id)=1)
);
create index ordres_virements_lot_idx on public.ordres_virements(lot_id,created_at);
create unique index ordre_bulletin_actif_unique on public.ordres_virements(bulletin_paie_id) where bulletin_paie_id is not null and statut not in('echec','annule');
create unique index ordre_note_frais_actif_unique on public.ordres_virements(note_frais_id) where note_frais_id is not null and statut not in('echec','annule');
create unique index ordre_depense_actif_unique on public.ordres_virements(depense_fournisseur_id) where depense_fournisseur_id is not null and statut not in('echec','annule');

create table public.journal_paiements_bancaires(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 utilisateur_id uuid references public.utilisateurs(id) on delete set null,
 action text not null,
 ressource_type text not null,
 ressource_id uuid,
 ancien_statut text,
 nouveau_statut text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index journal_paiements_bancaires_idx on public.journal_paiements_bancaires(entreprise_id,created_at desc);

create or replace function public.enregistrer_coordonnees_bancaires(
 p_entreprise_id uuid,p_type text,p_beneficiaire_id uuid,p_titulaire text,
 p_iban_chiffre text,p_iban_hash text,p_iban_quatre_derniers text,p_bic_chiffre text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.a_permission(p_entreprise_id,'gerer_coordonnees_bancaires') then raise exception 'Accès refusé';end if;
 if p_type='employe' then
  if not exists(select 1 from public.employes where id=p_beneficiaire_id and entreprise_id=p_entreprise_id) then raise exception 'Salarié introuvable';end if;
  update public.coordonnees_bancaires set actif=false,updated_at=now(),updated_by=auth.uid() where entreprise_id=p_entreprise_id and employe_id=p_beneficiaire_id and actif;
  insert into public.coordonnees_bancaires(entreprise_id,type_beneficiaire,employe_id,titulaire,iban_chiffre,iban_hash,iban_quatre_derniers,bic_chiffre,created_by,updated_by)
  values(p_entreprise_id,p_type,p_beneficiaire_id,btrim(p_titulaire),p_iban_chiffre,p_iban_hash,p_iban_quatre_derniers,p_bic_chiffre,auth.uid(),auth.uid()) returning id into v_id;
 elsif p_type='fournisseur' then
  if not exists(select 1 from public.fournisseurs where id=p_beneficiaire_id and entreprise_id=p_entreprise_id) then raise exception 'Fournisseur introuvable';end if;
  update public.coordonnees_bancaires set actif=false,updated_at=now(),updated_by=auth.uid() where entreprise_id=p_entreprise_id and fournisseur_id=p_beneficiaire_id and actif;
  insert into public.coordonnees_bancaires(entreprise_id,type_beneficiaire,fournisseur_id,titulaire,iban_chiffre,iban_hash,iban_quatre_derniers,bic_chiffre,created_by,updated_by)
  values(p_entreprise_id,p_type,p_beneficiaire_id,btrim(p_titulaire),p_iban_chiffre,p_iban_hash,p_iban_quatre_derniers,p_bic_chiffre,auth.uid(),auth.uid()) returning id into v_id;
 else raise exception 'Type de bénéficiaire invalide';end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,nouveau_statut,metadata)
 values(p_entreprise_id,auth.uid(),'coordonnees_enregistrees','coordonnees_bancaires',v_id,'a_verifier',jsonb_build_object('type',p_type,'iban_fin',p_iban_quatre_derniers));
 return v_id;
end;$$;

create or replace function public.valider_coordonnees_bancaires(p_entreprise_id uuid,p_id uuid,p_accepte boolean,p_message text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'valider_virements') then raise exception 'Accès refusé';end if;
 update public.coordonnees_bancaires set verification_statut=case when p_accepte then 'verifie' else 'rejete' end,verification_message=nullif(btrim(p_message),''),verifie_at=now(),verifie_par=auth.uid(),updated_at=now(),updated_by=auth.uid()
 where id=p_id and entreprise_id=p_entreprise_id and actif;
 if not found then raise exception 'RIB introuvable';end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,nouveau_statut)
 values(p_entreprise_id,auth.uid(),'coordonnees_verifiees','coordonnees_bancaires',p_id,case when p_accepte then 'verifie' else 'rejete' end);
end;$$;

create or replace function public.creer_lot_virements(
 p_entreprise_id uuid,p_type_lot text,p_date_execution date,p_ordres jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_lot uuid;v_numero text;v_ordre jsonb;v_total numeric:=0;v_nombre integer:=0;
begin
 if not public.a_permission(p_entreprise_id,'preparer_virements') then raise exception 'Accès refusé';end if;
 if p_type_lot not in('fournisseurs','salaires','notes_frais','mixte') then raise exception 'Type de lot invalide';end if;
 if p_date_execution<current_date then raise exception 'Date d’exécution invalide';end if;
 if jsonb_typeof(p_ordres)<>'array' or jsonb_array_length(p_ordres)=0 then raise exception 'Aucun ordre sélectionné';end if;
 v_numero:=public.next_reference(p_entreprise_id,'lot_virement','VIR',6,true);
 insert into public.lots_virements(entreprise_id,numero,type_lot,statut,date_execution,cree_par)
 values(p_entreprise_id,v_numero,p_type_lot,'a_valider',p_date_execution,auth.uid()) returning id into v_lot;
 for v_ordre in select value from jsonb_array_elements(p_ordres) loop
  if (v_ordre->>'montant')::numeric<=0 then raise exception 'Montant de virement invalide';end if;
  if not exists(
   select 1 from public.coordonnees_bancaires c
   where c.entreprise_id=p_entreprise_id and c.actif and c.verification_statut='verifie'
    and c.iban_chiffre=v_ordre->>'iban_chiffre'
    and ((v_ordre->>'type_beneficiaire'='employe' and c.employe_id=nullif(v_ordre->>'employe_id','')::uuid)
      or (v_ordre->>'type_beneficiaire'='fournisseur' and c.fournisseur_id=nullif(v_ordre->>'fournisseur_id','')::uuid))
  ) then raise exception 'RIB absent, modifié ou non vérifié';end if;
  if nullif(v_ordre->>'bulletin_paie_id','') is not null and not exists(
   select 1 from public.bulletins_paie b where b.id=(v_ordre->>'bulletin_paie_id')::uuid and b.entreprise_id=p_entreprise_id
    and b.employe_id=(v_ordre->>'employe_id')::uuid and b.statut='valide' and b.montant_net_a_payer=(v_ordre->>'montant')::numeric
  ) then raise exception 'Bulletin de paie non valide ou montant incohérent';end if;
  if nullif(v_ordre->>'note_frais_id','') is not null and not exists(
   select 1 from public.notes_frais n where n.id=(v_ordre->>'note_frais_id')::uuid and n.entreprise_id=p_entreprise_id
    and n.employe_id=(v_ordre->>'employe_id')::uuid and n.statut in('valide','validee','exporte_comptabilite') and n.montant_ttc=(v_ordre->>'montant')::numeric
  ) then raise exception 'Note de frais non validée ou montant incohérent';end if;
  if nullif(v_ordre->>'depense_fournisseur_id','') is not null and not exists(
   select 1 from public.depenses_fournisseurs d where d.id=(v_ordre->>'depense_fournisseur_id')::uuid and d.entreprise_id=p_entreprise_id
    and d.fournisseur_id=(v_ordre->>'fournisseur_id')::uuid and d.statut in('a_payer','payee_partiel')
    and round(d.montant_ttc-d.montant_regle,2)=(v_ordre->>'montant')::numeric
  ) then raise exception 'Facture fournisseur non payable ou montant incohérent';end if;
  insert into public.ordres_virements(
   entreprise_id,lot_id,type_beneficiaire,employe_id,fournisseur_id,bulletin_paie_id,note_frais_id,depense_fournisseur_id,
   titulaire,iban_chiffre,iban_quatre_derniers,bic_chiffre,montant,libelle
  ) values(
   p_entreprise_id,v_lot,v_ordre->>'type_beneficiaire',nullif(v_ordre->>'employe_id','')::uuid,nullif(v_ordre->>'fournisseur_id','')::uuid,
   nullif(v_ordre->>'bulletin_paie_id','')::uuid,nullif(v_ordre->>'note_frais_id','')::uuid,nullif(v_ordre->>'depense_fournisseur_id','')::uuid,
   v_ordre->>'titulaire',v_ordre->>'iban_chiffre',v_ordre->>'iban_quatre_derniers',nullif(v_ordre->>'bic_chiffre',''),(v_ordre->>'montant')::numeric,left(v_ordre->>'libelle',140)
  );
  v_total:=v_total+(v_ordre->>'montant')::numeric;v_nombre:=v_nombre+1;
 end loop;
 update public.lots_virements set nombre_ordres=v_nombre,montant_total=round(v_total,2),updated_at=now() where id=v_lot;
 update public.bulletins_paie set statut='paiement_prepare' where id in(select bulletin_paie_id from public.ordres_virements where lot_id=v_lot and bulletin_paie_id is not null);
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,nouveau_statut,metadata)
 values(p_entreprise_id,auth.uid(),'lot_prepare','lot_virements',v_lot,'a_valider',jsonb_build_object('nombre',v_nombre,'montant',v_total));
 return v_lot;
exception when others then
 if v_lot is not null then delete from public.lots_virements where id=v_lot;end if;
 raise;
end;$$;

create or replace function public.valider_bulletin_paie(p_entreprise_id uuid,p_bulletin_id uuid,p_accepte boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'gerer_paie') then raise exception 'Accès refusé';end if;
 update public.bulletins_paie set statut=case when p_accepte then 'valide' else 'annule' end,valide_par=auth.uid(),valide_at=case when p_accepte then now() else null end
 where id=p_bulletin_id and entreprise_id=p_entreprise_id and statut='a_verifier';
 if not found then raise exception 'Bulletin non disponible pour validation';end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,ancien_statut,nouveau_statut)
 values(p_entreprise_id,auth.uid(),'bulletin_controle','bulletin_paie',p_bulletin_id,'a_verifier',case when p_accepte then 'valide' else 'annule' end);
end;$$;

create or replace function public.valider_lot_virements(p_entreprise_id uuid,p_lot_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'valider_virements') then raise exception 'Accès refusé';end if;
 if exists(select 1 from public.ordres_virements o left join public.coordonnees_bancaires c on c.entreprise_id=o.entreprise_id and c.actif and ((o.employe_id is not null and c.employe_id=o.employe_id) or (o.fournisseur_id is not null and c.fournisseur_id=o.fournisseur_id)) where o.lot_id=p_lot_id and (c.id is null or c.verification_statut<>'verifie')) then raise exception 'Tous les RIB doivent être vérifiés avant validation';end if;
 update public.lots_virements set statut='valide',valide_par=auth.uid(),valide_at=now(),updated_at=now() where id=p_lot_id and entreprise_id=p_entreprise_id and statut='a_valider';
 if not found then raise exception 'Lot non disponible pour validation';end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,ancien_statut,nouveau_statut)
 values(p_entreprise_id,auth.uid(),'lot_valide','lot_virements',p_lot_id,'a_valider','valide');
end;$$;

create or replace function public.demarrer_transmission_lot(p_entreprise_id uuid,p_lot_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'executer_virements') then raise exception 'Accès refusé';end if;
 update public.lots_virements set statut='transmis',transmis_par=auth.uid(),transmis_at=now(),updated_at=now()
 where id=p_lot_id and entreprise_id=p_entreprise_id and statut='valide' and provider_payment_id is null;
 if not found then raise exception 'Lot déjà transmis ou non validé';end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,ancien_statut,nouveau_statut)
 values(p_entreprise_id,auth.uid(),'transmission_demarre','lot_virements',p_lot_id,'valide','transmis');
end;$$;

create or replace function public.retablir_lot_apres_echec_transmission(p_entreprise_id uuid,p_lot_id uuid,p_message text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'executer_virements') then raise exception 'Accès refusé';end if;
 update public.lots_virements set statut='valide',provider_message=left(p_message,500),transmis_par=null,transmis_at=null,updated_at=now()
 where id=p_lot_id and entreprise_id=p_entreprise_id and statut='transmis' and provider_payment_id is null;
end;$$;

create or replace function public.annuler_lot_virements(p_entreprise_id uuid,p_lot_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not (public.a_permission(p_entreprise_id,'preparer_virements') or public.a_permission(p_entreprise_id,'valider_virements')) then raise exception 'Accès refusé';end if;
 update public.lots_virements set statut='annule',updated_at=now() where id=p_lot_id and entreprise_id=p_entreprise_id and statut in('a_valider','valide') and provider_payment_id is null;
 if not found then raise exception 'Ce lot ne peut plus être annulé';end if;
 update public.ordres_virements set statut='annule',updated_at=now() where lot_id=p_lot_id;
 update public.bulletins_paie set statut='valide' where id in(select bulletin_paie_id from public.ordres_virements where lot_id=p_lot_id and bulletin_paie_id is not null) and statut='paiement_prepare';
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,nouveau_statut)
 values(p_entreprise_id,auth.uid(),'lot_annule','lot_virements',p_lot_id,'annule');
end;$$;

create or replace function public.marquer_lot_transmis(
 p_entreprise_id uuid,p_lot_id uuid,p_provider text,p_provider_payment_id text,p_consent_url text,p_provider_statut text
) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.a_permission(p_entreprise_id,'executer_virements') then raise exception 'Accès refusé';end if;
 update public.lots_virements set statut='consentement_requis',provider=p_provider,provider_payment_id=p_provider_payment_id,consent_url=p_consent_url,provider_statut=p_provider_statut,transmis_par=auth.uid(),transmis_at=now(),updated_at=now()
 where id=p_lot_id and entreprise_id=p_entreprise_id and statut='transmis' and provider_payment_id is null;
 if not found then raise exception 'Transmission non réservée ou déjà enregistrée';end if;
 update public.ordres_virements set statut='transmis',updated_at=now() where lot_id=p_lot_id;
 update public.bulletins_paie set statut='transmis' where id in(select bulletin_paie_id from public.ordres_virements where lot_id=p_lot_id and bulletin_paie_id is not null);
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,ancien_statut,nouveau_statut,metadata)
 values(p_entreprise_id,auth.uid(),'lot_transmis','lot_virements',p_lot_id,'transmis','consentement_requis',jsonb_build_object('provider',p_provider,'provider_id',p_provider_payment_id));
end;$$;

create or replace function public.reconcilier_lot_virements(
 p_lot_id uuid,p_provider_statut text,p_message text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_lot public.lots_virements;v_statut text;v_ordre record;
begin
 select * into v_lot from public.lots_virements where id=p_lot_id for update;
 if not found then raise exception 'Lot introuvable';end if;
 if auth.role()<>'service_role' and not public.a_permission(v_lot.entreprise_id,'executer_virements') then raise exception 'Accès refusé';end if;
 v_statut:=case p_provider_statut when 'done' then 'execute' when 'partial' then 'partiel' when 'rejected' then 'echec' when 'accepted' then 'en_cours' when 'pending' then 'en_cours' else 'en_cours' end;
 update public.lots_virements set statut=v_statut,provider_statut=p_provider_statut,provider_message=p_message,execute_at=case when v_statut='execute' then now() else execute_at end,updated_at=now() where id=p_lot_id;
 update public.ordres_virements set statut=case when v_statut='execute' then 'execute' when v_statut='echec' then 'echec' else 'en_cours' end,provider_statut=p_provider_statut,erreur=case when v_statut='echec' then p_message else erreur end,updated_at=now() where lot_id=p_lot_id;
 if v_statut='execute' then
  for v_ordre in select * from public.ordres_virements where lot_id=p_lot_id loop
   if v_ordre.depense_fournisseur_id is not null and not exists(select 1 from public.reglements_fournisseurs where depense_id=v_ordre.depense_fournisseur_id and reference='Lot '||v_lot.numero) then
    insert into public.reglements_fournisseurs(entreprise_id,depense_id,montant,date,mode,reference)
    values(v_lot.entreprise_id,v_ordre.depense_fournisseur_id,v_ordre.montant,current_date,'virement','Lot '||v_lot.numero);
   end if;
   if v_ordre.note_frais_id is not null then update public.notes_frais set statut='remboursee',updated_at=now() where id=v_ordre.note_frais_id and entreprise_id=v_lot.entreprise_id and statut in('valide','validee','exporte_comptabilite');end if;
   if v_ordre.bulletin_paie_id is not null then update public.bulletins_paie set statut='paye',paye_at=now() where id=v_ordre.bulletin_paie_id and entreprise_id=v_lot.entreprise_id;end if;
  end loop;
 end if;
 insert into public.journal_paiements_bancaires(entreprise_id,utilisateur_id,action,ressource_type,ressource_id,ancien_statut,nouveau_statut,metadata)
 values(v_lot.entreprise_id,auth.uid(),'lot_reconcilie','lot_virements',p_lot_id,v_lot.statut,v_statut,jsonb_build_object('provider_statut',p_provider_statut,'message',p_message));
end;$$;

alter table public.coordonnees_bancaires enable row level security;
alter table public.bulletins_paie enable row level security;
alter table public.connexions_bancaires enable row level security;
alter table public.lots_virements enable row level security;
alter table public.ordres_virements enable row level security;
alter table public.journal_paiements_bancaires enable row level security;

create policy coord_bancaires_lecture on public.coordonnees_bancaires for select to authenticated using(public.a_permission(entreprise_id,'gerer_coordonnees_bancaires') or public.a_permission(entreprise_id,'valider_virements'));
create policy bulletins_paie_lecture on public.bulletins_paie for select to authenticated using(public.a_permission(entreprise_id,'gerer_paie'));
create policy bulletins_paie_insert on public.bulletins_paie for insert to authenticated with check(public.a_permission(entreprise_id,'gerer_paie'));
create policy connexions_bancaires_lecture on public.connexions_bancaires for select to authenticated using(public.a_permission(entreprise_id,'acces_paiements_bancaires'));
create policy connexions_bancaires_gestion on public.connexions_bancaires for all to authenticated using(public.a_permission(entreprise_id,'executer_virements')) with check(public.a_permission(entreprise_id,'executer_virements'));
create policy lots_virements_lecture on public.lots_virements for select to authenticated using(public.a_permission(entreprise_id,'acces_paiements_bancaires'));
create policy ordres_virements_lecture on public.ordres_virements for select to authenticated using(public.a_permission(entreprise_id,'acces_paiements_bancaires'));
create policy journal_bancaire_lecture on public.journal_paiements_bancaires for select to authenticated using(public.a_permission(entreprise_id,'acces_paiements_bancaires'));
create policy notes_frais_sources_bancaires on public.notes_frais for select to authenticated
using(public.a_permission(entreprise_id,'preparer_virements') and statut in('valide','validee','exporte_comptabilite'));

grant select on public.coordonnees_bancaires,public.bulletins_paie,public.connexions_bancaires,public.lots_virements,public.ordres_virements,public.journal_paiements_bancaires to authenticated;
grant insert on public.bulletins_paie to authenticated;
grant insert,update on public.connexions_bancaires to authenticated;
revoke update,delete on public.coordonnees_bancaires,public.bulletins_paie,public.lots_virements,public.ordres_virements,public.journal_paiements_bancaires from authenticated;

revoke all on function public.enregistrer_coordonnees_bancaires(uuid,text,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.valider_coordonnees_bancaires(uuid,uuid,boolean,text) from public,anon;
revoke all on function public.creer_lot_virements(uuid,text,date,jsonb) from public,anon;
revoke all on function public.valider_bulletin_paie(uuid,uuid,boolean) from public,anon;
revoke all on function public.valider_lot_virements(uuid,uuid) from public,anon;
revoke all on function public.demarrer_transmission_lot(uuid,uuid) from public,anon;
revoke all on function public.retablir_lot_apres_echec_transmission(uuid,uuid,text) from public,anon;
revoke all on function public.annuler_lot_virements(uuid,uuid) from public,anon;
revoke all on function public.marquer_lot_transmis(uuid,uuid,text,text,text,text) from public,anon;
grant execute on function public.enregistrer_coordonnees_bancaires(uuid,text,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.valider_coordonnees_bancaires(uuid,uuid,boolean,text) to authenticated;
grant execute on function public.creer_lot_virements(uuid,text,date,jsonb) to authenticated;
grant execute on function public.valider_bulletin_paie(uuid,uuid,boolean) to authenticated;
grant execute on function public.valider_lot_virements(uuid,uuid) to authenticated;
grant execute on function public.demarrer_transmission_lot(uuid,uuid) to authenticated;
grant execute on function public.retablir_lot_apres_echec_transmission(uuid,uuid,text) to authenticated;
grant execute on function public.annuler_lot_virements(uuid,uuid) to authenticated;
grant execute on function public.marquer_lot_transmis(uuid,uuid,text,text,text,text) to authenticated;
revoke all on function public.reconcilier_lot_virements(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reconcilier_lot_virements(uuid,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('bulletins-paie','bulletins-paie',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy bulletins_paie_storage_lecture on storage.objects for select to authenticated
using(bucket_id='bulletins-paie' and public.a_permission((storage.foldername(name))[1]::uuid,'gerer_paie'));
create policy bulletins_paie_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='bulletins-paie' and public.a_permission((storage.foldername(name))[1]::uuid,'gerer_paie'));

revoke all on public.journal_paiements_bancaires from anon;
notify pgrst,'reload schema';
