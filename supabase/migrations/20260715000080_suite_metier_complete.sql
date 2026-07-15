-- Suite métier avancée Liria Gestion Pro : facturation d'avancement, interventions,
-- contrats, modèles, métrés, CRM, relances, champs personnalisés et connecteurs.

insert into public.permissions_disponibles(cle,module,description) values
 ('acces_interventions','Interventions','Consulter les contrats, interventions et bons de travail'),
 ('gerer_interventions','Interventions','Gérer les contrats, interventions et bons de travail'),
 ('acces_crm','CRM','Consulter les appels, relances et communications clients'),
 ('gerer_crm','CRM','Gérer les appels, relances et communications clients'),
 ('acces_facturation_avancee','Facturation avancée','Consulter situations, acomptes, avoirs, DGD et remises en banque'),
 ('gerer_facturation_avancee','Facturation avancée','Gérer situations, acomptes, avoirs, DGD et remises en banque'),
 ('acces_ouvrages','Ouvrages et métrés','Consulter les ouvrages, modèles et métrés'),
 ('gerer_ouvrages','Ouvrages et métrés','Gérer les ouvrages, modèles et métrés'),
 ('acces_connecteurs','Connecteurs','Consulter les connexions fournisseurs et comptables'),
 ('gerer_connecteurs','Connecteurs','Configurer les connexions fournisseurs et comptables')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

-- Reprend les droits actuels pour ne pas casser les postes existants.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,x.nouveau,pp.autorise
from public.permissions_poste pp
join (values
 ('acces_chantiers','acces_interventions'),('gerer_chantiers','gerer_interventions'),
 ('acces_clients','acces_crm'),('gerer_clients','gerer_crm'),
 ('acces_factures','acces_facturation_avancee'),('gerer_factures','gerer_facturation_avancee'),
 ('acces_devis','acces_ouvrages'),('gerer_devis','gerer_ouvrages'),
 ('acces_achats','acces_connecteurs'),('gerer_achats','gerer_connecteurs')
) x(existant,nouveau) on x.existant=pp.cle_permission
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

-- Facturation d'avancement.
alter table public.factures
  add column if not exists facture_parente_id uuid references public.factures(id) on delete set null,
  add column if not exists situation_numero integer,
  add column if not exists avancement_pct numeric(5,2),
  add column if not exists retenue_garantie_pct numeric(5,2) not null default 0,
  add column if not exists montant_retenue numeric(12,2) not null default 0,
  add column if not exists cumul_precedent_ht numeric(12,2) not null default 0,
  add column if not exists est_dgd boolean not null default false,
  add column if not exists stripe_checkout_id text,
  add column if not exists stripe_checkout_url text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_payment_status text,
  add column if not exists lien_paiement_expire_at timestamptz;
alter table public.entreprises
  add column if not exists stripe_account_id text,
  add column if not exists stripe_onboarding_complete boolean not null default false;
create unique index if not exists entreprises_stripe_account_unique on public.entreprises(stripe_account_id) where stripe_account_id is not null;
alter table public.paiements add column if not exists stripe_session_id text;
create unique index if not exists paiements_stripe_session_unique on public.paiements(stripe_session_id);

alter table public.factures drop constraint if exists factures_avancement_check;
alter table public.factures add constraint factures_avancement_check check(avancement_pct is null or avancement_pct between 0 and 100);
alter table public.factures drop constraint if exists factures_retenue_check;
alter table public.factures add constraint factures_retenue_check check(retenue_garantie_pct between 0 and 20);
create index if not exists factures_parent_idx on public.factures(facture_parente_id) where facture_parente_id is not null;
create unique index if not exists factures_situation_numero_unique on public.factures(devis_origine_id,situation_numero) where situation_numero is not null and type='situation';

create table if not exists public.situations_travaux(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 devis_id uuid not null references public.devis(id) on delete restrict,
 chantier_id uuid not null references public.chantiers(id) on delete restrict,
 numero integer not null,
 date_situation date not null default current_date,
 statut text not null default 'brouillon' check(statut in('brouillon','validee','facturee','annulee')),
 retenue_garantie_pct numeric(5,2) not null default 0 check(retenue_garantie_pct between 0 and 20),
 montant_marche_ht numeric(12,2) not null default 0,
 montant_cumule_ht numeric(12,2) not null default 0,
 montant_periode_ht numeric(12,2) not null default 0,
 montant_retenue numeric(12,2) not null default 0,
 facture_id uuid references public.factures(id) on delete set null,
 notes text,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(entreprise_id,devis_id,numero)
);
create table if not exists public.lignes_situations(
 id uuid primary key default gen_random_uuid(),
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 situation_id uuid not null references public.situations_travaux(id) on delete cascade,
 ligne_devis_id uuid not null references public.lignes_devis(id) on delete restrict,
 avancement_precedent_pct numeric(5,2) not null default 0 check(avancement_precedent_pct between 0 and 100),
 avancement_cumule_pct numeric(5,2) not null default 0 check(avancement_cumule_pct between 0 and 100),
 montant_periode_ht numeric(12,2) not null default 0,
 created_at timestamptz not null default now(),
 unique(situation_id,ligne_devis_id)
);

-- Modèles complets de devis et ouvrages hiérarchiques.
create table if not exists public.modeles_devis(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 nom text not null,description text,categorie text,actif boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(entreprise_id,nom)
);
create table if not exists public.lignes_modeles_devis(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 modele_id uuid not null references public.modeles_devis(id) on delete cascade,parent_id uuid references public.lignes_modeles_devis(id) on delete cascade,
 designation text not null,description text,type text not null default 'forfait' check(type in('titre','main_oeuvre','fourniture','sous_traitance','deplacement','forfait')),
 quantite numeric(12,3) not null default 1,unite text not null default 'u',prix_unitaire_ht numeric(12,2) not null default 0,taux_tva numeric(5,2) not null default 20,ordre integer not null default 0
);
create table if not exists public.metres(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 chantier_id uuid references public.chantiers(id) on delete cascade,devis_id uuid references public.devis(id) on delete set null,
 numero text not null,nom text not null,date_releve date not null default current_date,notes text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(entreprise_id,numero)
);
create table if not exists public.lignes_metres(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 metre_id uuid not null references public.metres(id) on delete cascade,designation text not null,
 formule text not null default 'longueur*largeur',longueur numeric(12,3),largeur numeric(12,3),hauteur numeric(12,3),nombre numeric(12,3) not null default 1,
 deduction numeric(12,3) not null default 0,resultat numeric(12,3) not null default 0,unite text not null default 'm²',ordre integer not null default 0
);

-- Contrats et interventions.
create table if not exists public.contrats_entretien(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 numero text not null,client_id uuid not null references public.clients(id) on delete restrict,chantier_id uuid references public.chantiers(id) on delete set null,
 libelle text not null,description text,statut text not null default 'actif' check(statut in('brouillon','actif','suspendu','termine','resilie')),
 date_debut date not null,date_fin date,periodicite text not null default 'annuelle' check(periodicite in('hebdomadaire','mensuelle','trimestrielle','semestrielle','annuelle','personnalisee')),
 prochaine_intervention date,montant_ht numeric(12,2) not null default 0,taux_tva numeric(5,2) not null default 20,reconduction_tacite boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(entreprise_id,numero),check(date_fin is null or date_fin>=date_debut)
);
create table if not exists public.interventions(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 numero text not null,client_id uuid not null references public.clients(id) on delete restrict,chantier_id uuid references public.chantiers(id) on delete set null,
 contrat_id uuid references public.contrats_entretien(id) on delete set null,employe_id uuid references public.employes(id) on delete set null,
 type text not null default 'depannage' check(type in('depannage','entretien','sav','visite','livraison','autre')),
 statut text not null default 'a_planifier' check(statut in('a_planifier','planifiee','en_cours','terminee','facturee','annulee')),
 priorite text not null default 'normale' check(priorite in('basse','normale','haute','urgente')),
 objet text not null,description text,date_prevue date,heure_prevue time,duree_prevue numeric(6,2),date_realisation timestamptz,
 compte_rendu text,signature_client_nom text,signature_client_at timestamptz,facture_id uuid references public.factures(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(entreprise_id,numero)
);
create table if not exists public.bons_livraison(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 numero text not null,client_id uuid not null references public.clients(id) on delete restrict,chantier_id uuid references public.chantiers(id) on delete set null,
 commande_id uuid references public.commandes_fournisseurs(id) on delete set null,date_livraison date not null default current_date,
 statut text not null default 'brouillon' check(statut in('brouillon','livre','accepte','refuse','annule')),
 livre_par uuid references public.employes(id) on delete set null,receptionnaire text,observations text,signature_at timestamptz,
 created_at timestamptz not null default now(),unique(entreprise_id,numero)
);

-- CRM, relances et champs personnalisés.
alter table public.taches add column if not exists responsable_id uuid references public.employes(id) on delete set null;
alter table public.taches add column if not exists description text;
alter table public.taches add column if not exists priorite text not null default 'normale';
alter table public.taches add column if not exists completed_at timestamptz;
alter table public.taches drop constraint if exists taches_priorite_check;
alter table public.taches add constraint taches_priorite_check check(priorite in('basse','normale','haute','urgente'));
alter table public.clients add column if not exists latitude numeric(10,7);
alter table public.clients add column if not exists longitude numeric(10,7);

create table if not exists public.appels_contacts(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 client_id uuid references public.clients(id) on delete cascade,contact_id uuid references public.contacts_clients(id) on delete set null,
 employe_id uuid references public.employes(id) on delete set null,type text not null default 'appel' check(type in('appel','email','sms','courrier','rendez_vous')),
 sens text not null default 'sortant' check(sens in('entrant','sortant')),objet text not null,compte_rendu text,a_rappeler_at timestamptz,termine boolean not null default false,
 created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);
create table if not exists public.relances_impayes(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 facture_id uuid not null references public.factures(id) on delete cascade,niveau integer not null default 1 check(niveau between 1 and 4),
 canal text not null default 'email' check(canal in('email','sms','courrier','telephone')),statut text not null default 'a_envoyer' check(statut in('a_envoyer','preparee','envoyee','annulee')),
 date_prevue date not null default current_date,date_envoi timestamptz,destinataire text,sujet text,message text,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);
create unique index if not exists relances_facture_niveau_unique on public.relances_impayes(facture_id,niveau) where statut<>'annulee';
create table if not exists public.champs_personnalises(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 ressource text not null check(ressource in('client','chantier','devis','facture','employe','vehicule','outil','fournisseur','intervention')),
 cle text not null,libelle text not null,type text not null default 'texte' check(type in('texte','nombre','date','booleen','liste','texte_long')),
 options jsonb not null default '[]'::jsonb,obligatoire boolean not null default false,actif boolean not null default true,ordre integer not null default 0,unique(entreprise_id,ressource,cle)
);
create table if not exists public.valeurs_champs_personnalises(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 champ_id uuid not null references public.champs_personnalises(id) on delete cascade,ressource_id uuid not null,valeur jsonb not null default 'null'::jsonb,updated_at timestamptz not null default now(),unique(champ_id,ressource_id)
);

-- Banque, connecteurs officiels et audit global.
create table if not exists public.remises_banque(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 numero text not null,date_remise date not null default current_date,compte_bancaire text,mode text not null check(mode in('cheque','especes','cb','virement')),
 statut text not null default 'brouillon' check(statut in('brouillon','deposee','rapprochee','annulee')),montant numeric(12,2) not null default 0,reference_banque text,notes text,created_at timestamptz not null default now(),unique(entreprise_id,numero)
);
create table if not exists public.remises_banque_paiements(
 remise_id uuid not null references public.remises_banque(id) on delete cascade,paiement_id uuid not null references public.paiements(id) on delete restrict,
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,primary key(remise_id,paiement_id)
);
create table if not exists public.connecteurs_externes(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 domaine text not null check(domaine in('fournisseur','comptabilite','paiement','sms','batichiffrage')),
 fournisseur_id uuid references public.fournisseurs(id) on delete cascade,nom text not null,type text not null check(type in('csv','xlsx','fabdis','api','edi','punchout_oci','punchout_cxml','oauth2')),
 statut text not null default 'a_configurer' check(statut in('a_configurer','actif','erreur','suspendu')),
 configuration jsonb not null default '{}'::jsonb,secret_reference text,derniere_synchro_at timestamptz,prochaine_synchro_at timestamptz,dernier_message text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(entreprise_id,domaine,nom)
);
create table if not exists public.tarifs_fournisseurs(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 fournisseur_id uuid not null references public.fournisseurs(id) on delete cascade,reference_fournisseur text not null,eancode text,designation text not null,unite text not null default 'u',
 prix_public_ht numeric(12,4),prix_negocie_ht numeric(12,4) not null,devise text not null default 'EUR',disponibilite text,minimum_commande numeric(12,3),valide_du date,valide_au date,source text,updated_at timestamptz not null default now(),unique(entreprise_id,fournisseur_id,reference_fournisseur)
);
create table if not exists public.journal_activite(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 utilisateur_id uuid references auth.users(id) on delete set null,action text not null,ressource text not null,ressource_id uuid,description text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create table if not exists public.stripe_webhook_events(
 id text primary key,event_type text not null,livemode boolean not null default false,
 facture_id uuid references public.factures(id) on delete set null,created_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
revoke all on public.stripe_webhook_events from public,anon,authenticated;

-- Références automatiques.
create or replace function public.trg_reference_suite_metier() returns trigger language plpgsql security definer set search_path=public as $$
declare v_prefixe text;v_type text;
begin
 if new.numero is null or btrim(new.numero)='' then
  v_prefixe:=case tg_table_name when 'contrats_entretien' then 'CTR' when 'interventions' then 'INT' when 'bons_livraison' then 'BL' when 'metres' then 'MET' when 'remises_banque' then 'RB' else 'DOC' end;
  v_type:=tg_table_name||'-'||to_char(current_date,'YYYY');
  new.numero:=public.next_reference(new.entreprise_id,v_type,v_prefixe,4,true);
 end if;return new;
end;$$;
drop trigger if exists reference_contrats on public.contrats_entretien;create trigger reference_contrats before insert on public.contrats_entretien for each row execute function public.trg_reference_suite_metier();
drop trigger if exists reference_interventions on public.interventions;create trigger reference_interventions before insert on public.interventions for each row execute function public.trg_reference_suite_metier();
drop trigger if exists reference_bons_livraison on public.bons_livraison;create trigger reference_bons_livraison before insert on public.bons_livraison for each row execute function public.trg_reference_suite_metier();
drop trigger if exists reference_metres on public.metres;create trigger reference_metres before insert on public.metres for each row execute function public.trg_reference_suite_metier();
drop trigger if exists reference_remises on public.remises_banque;create trigger reference_remises before insert on public.remises_banque for each row execute function public.trg_reference_suite_metier();

-- Une situation est calculée côté base à partir du devis accepté. Le navigateur ne
-- choisit jamais directement les montants, ce qui protège les cumuls et les arrondis.
create or replace function public.creer_situation_travaux(
 p_entreprise_id uuid,p_devis_id uuid,p_avancement_pct numeric,
 p_retenue_garantie_pct numeric default 0,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_devis public.devis;v_id uuid;v_numero integer;v_precedent numeric:=0;v_cumule numeric;v_periode numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_avancement_pct<=0 or p_avancement_pct>100 then raise exception 'Avancement invalide';end if;
 if coalesce(p_retenue_garantie_pct,0)<0 or coalesce(p_retenue_garantie_pct,0)>20 then raise exception 'Retenue de garantie invalide';end if;
 select * into v_devis from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte';
 if not found then raise exception 'Le devis doit être accepté';end if;
 if v_devis.chantier_id is null then raise exception 'Un chantier doit être associé au devis';end if;
 select coalesce(max(ls.avancement_cumule_pct),0) into v_precedent
 from public.situations_travaux s join public.lignes_situations ls on ls.situation_id=s.id
 where s.entreprise_id=p_entreprise_id and s.devis_id=p_devis_id and s.statut<>'annulee';
 if p_avancement_pct<=v_precedent then raise exception 'L’avancement doit être supérieur au cumul précédent (%)',v_precedent;end if;
 select coalesce(max(numero),0)+1 into v_numero from public.situations_travaux where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
 v_cumule:=round(v_devis.montant_ht*p_avancement_pct/100,2);v_periode:=round(v_devis.montant_ht*(p_avancement_pct-v_precedent)/100,2);
 insert into public.situations_travaux(entreprise_id,devis_id,chantier_id,numero,retenue_garantie_pct,montant_marche_ht,montant_cumule_ht,montant_periode_ht,montant_retenue,notes)
 values(p_entreprise_id,p_devis_id,v_devis.chantier_id,v_numero,coalesce(p_retenue_garantie_pct,0),v_devis.montant_ht,v_cumule,v_periode,round(v_periode*coalesce(p_retenue_garantie_pct,0)/100,2),nullif(btrim(p_notes),'')) returning id into v_id;
 insert into public.lignes_situations(entreprise_id,situation_id,ligne_devis_id,avancement_precedent_pct,avancement_cumule_pct,montant_periode_ht)
 select p_entreprise_id,v_id,l.id,v_precedent,p_avancement_pct,
  round(((l.quantite*l.prix_unitaire_ht)*(1-l.remise_ligne/100))*(p_avancement_pct-v_precedent)/100,2)
 from public.lignes_devis l where l.devis_id=p_devis_id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','situation_travaux',v_id,'Situation d’avancement créée',jsonb_build_object('devis_id',p_devis_id,'avancement_pct',p_avancement_pct));
 return v_id;
end;$$;

create or replace function public.facturer_situation_travaux(p_entreprise_id uuid,p_situation_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_s public.situations_travaux;v_d public.devis;v_facture uuid;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 select * into v_s from public.situations_travaux where id=p_situation_id and entreprise_id=p_entreprise_id for update;
 if not found then raise exception 'Situation introuvable';end if;
 if v_s.facture_id is not null then return v_s.facture_id;end if;
 if v_s.statut not in('brouillon','validee') then raise exception 'Cette situation ne peut plus être facturée';end if;
 select * into v_d from public.devis where id=v_s.devis_id and entreprise_id=p_entreprise_id;
 insert into public.factures(entreprise_id,client_id,chantier_id,devis_origine_id,type,statut,situation_numero,avancement_pct,retenue_garantie_pct,montant_retenue,cumul_precedent_ht,notes_client)
 values(p_entreprise_id,v_d.client_id,v_s.chantier_id,v_s.devis_id,'situation','brouillon',v_s.numero,
  case when v_s.montant_marche_ht>0 then round(v_s.montant_cumule_ht*100/v_s.montant_marche_ht,2) else 0 end,
  v_s.retenue_garantie_pct,v_s.montant_retenue,v_s.montant_cumule_ht-v_s.montant_periode_ht,v_s.notes) returning id into v_facture;
 insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select v_facture,l.designation,l.description,l.type,
  round(l.quantite*(ls.avancement_cumule_pct-ls.avancement_precedent_pct)/100,3),l.unite,l.prix_unitaire_ht,l.remise_ligne,l.taux_tva,l.ordre
 from public.lignes_situations ls join public.lignes_devis l on l.id=ls.ligne_devis_id where ls.situation_id=v_s.id order by l.ordre;
 update public.situations_travaux set statut='facturee',facture_id=v_facture,updated_at=now() where id=v_s.id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'facturation','situation_travaux',v_s.id,'Facture de situation créée',jsonb_build_object('facture_id',v_facture));
 return v_facture;
end;$$;

-- Acompte, avoir, facture finale ou DGD à partir d'un devis accepté.
create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_type not in('acompte','avoir','finale') then raise exception 'Type de facture invalide';end if;
 if p_pourcentage<=0 or p_pourcentage>100 then raise exception 'Pourcentage invalide';end if;
 select * into v_d from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte';
 if not found then raise exception 'Le devis doit être accepté';end if;
 v_facteur:=p_pourcentage/100;if p_type='avoir' then v_signe:=-1;end if;
 insert into public.factures(entreprise_id,client_id,chantier_id,devis_origine_id,type,statut,avancement_pct,est_dgd,notes_client)
 values(p_entreprise_id,v_d.client_id,v_d.chantier_id,v_d.id,p_type,'brouillon',p_pourcentage,coalesce(p_est_dgd,false),v_d.notes_client) returning id into v_id;
 insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select v_id,designation,description,type,round(quantite*v_facteur*v_signe,3),unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
 from public.lignes_devis where devis_id=v_d.id order by ordre;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','facture',v_id,'Document de facturation avancée créé',jsonb_build_object('type',p_type,'pourcentage',p_pourcentage,'dgd',p_est_dgd));
 return v_id;
end;$$;

-- Instancie un modèle chiffré dans un devis existant encore en brouillon.
create or replace function public.appliquer_modele_devis(p_entreprise_id uuid,p_modele_id uuid,p_devis_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_nb integer;
begin
 if not public.a_permission(p_entreprise_id,'gerer_devis') then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='brouillon') then raise exception 'Devis brouillon introuvable';end if;
 if not exists(select 1 from public.modeles_devis where id=p_modele_id and entreprise_id=p_entreprise_id and actif) then raise exception 'Modèle introuvable';end if;
 insert into public.lignes_devis(devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select p_devis_id,designation,description,type,quantite,unite,prix_unitaire_ht,0,taux_tva,
  coalesce((select max(ordre)+1 from public.lignes_devis where devis_id=p_devis_id),0)+row_number() over(order by ordre,id)-1
 from public.lignes_modeles_devis where modele_id=p_modele_id and type<>'titre' order by ordre,id;
 get diagnostics v_nb=row_count;return v_nb;
end;$$;

-- Isolation multi-entreprises : toutes les nouvelles tables portent entreprise_id.
do $$declare t text;begin foreach t in array array['situations_travaux','lignes_situations','modeles_devis','lignes_modeles_devis','metres','lignes_metres','contrats_entretien','interventions','bons_livraison','appels_contacts','relances_impayes','champs_personnalises','valeurs_champs_personnalises','remises_banque','remises_banque_paiements','connecteurs_externes','tarifs_fournisseurs','journal_activite'] loop execute format('alter table public.%I enable row level security',t);execute format('drop policy if exists isolation_entreprise on public.%I',t);execute format('create policy isolation_entreprise on public.%I for select to authenticated using(public.est_membre_actif(entreprise_id))',t);end loop;end$$;

-- Droits d'écriture par familles.
do $$declare t text;p text;begin
 foreach t in array array['situations_travaux','lignes_situations','remises_banque','remises_banque_paiements'] loop execute format('create policy module_lecture on public.%I as restrictive for select to authenticated using(public.a_permission(entreprise_id,%L))',t,'acces_facturation_avancee');p:='gerer_facturation_avancee';execute format('create policy gestion_insert on public.%I for insert to authenticated with check(public.a_permission(entreprise_id,%L))',t,p);execute format('create policy gestion_update on public.%I for update to authenticated using(public.a_permission(entreprise_id,%L)) with check(public.a_permission(entreprise_id,%L))',t,p,p);execute format('create policy gestion_delete on public.%I for delete to authenticated using(public.a_permission(entreprise_id,%L))',t,p);end loop;
 foreach t in array array['contrats_entretien','interventions','bons_livraison'] loop execute format('create policy module_lecture on public.%I as restrictive for select to authenticated using(public.a_permission(entreprise_id,%L))',t,'acces_interventions');p:='gerer_interventions';execute format('create policy gestion_insert on public.%I for insert to authenticated with check(public.a_permission(entreprise_id,%L))',t,p);execute format('create policy gestion_update on public.%I for update to authenticated using(public.a_permission(entreprise_id,%L)) with check(public.a_permission(entreprise_id,%L))',t,p,p);execute format('create policy gestion_delete on public.%I for delete to authenticated using(public.a_permission(entreprise_id,%L))',t,p);end loop;
 foreach t in array array['appels_contacts','relances_impayes','champs_personnalises','valeurs_champs_personnalises'] loop execute format('create policy module_lecture on public.%I as restrictive for select to authenticated using(public.a_permission(entreprise_id,%L))',t,'acces_crm');p:='gerer_crm';execute format('create policy gestion_insert on public.%I for insert to authenticated with check(public.a_permission(entreprise_id,%L))',t,p);execute format('create policy gestion_update on public.%I for update to authenticated using(public.a_permission(entreprise_id,%L)) with check(public.a_permission(entreprise_id,%L))',t,p,p);execute format('create policy gestion_delete on public.%I for delete to authenticated using(public.a_permission(entreprise_id,%L))',t,p);end loop;
 foreach t in array array['modeles_devis','lignes_modeles_devis','metres','lignes_metres'] loop execute format('create policy module_lecture on public.%I as restrictive for select to authenticated using(public.a_permission(entreprise_id,%L))',t,'acces_ouvrages');p:='gerer_ouvrages';execute format('create policy gestion_insert on public.%I for insert to authenticated with check(public.a_permission(entreprise_id,%L))',t,p);execute format('create policy gestion_update on public.%I for update to authenticated using(public.a_permission(entreprise_id,%L)) with check(public.a_permission(entreprise_id,%L))',t,p,p);execute format('create policy gestion_delete on public.%I for delete to authenticated using(public.a_permission(entreprise_id,%L))',t,p);end loop;
 foreach t in array array['connecteurs_externes','tarifs_fournisseurs'] loop execute format('create policy module_lecture on public.%I as restrictive for select to authenticated using(public.a_permission(entreprise_id,%L))',t,'acces_connecteurs');p:='gerer_connecteurs';execute format('create policy gestion_insert on public.%I for insert to authenticated with check(public.a_permission(entreprise_id,%L))',t,p);execute format('create policy gestion_update on public.%I for update to authenticated using(public.a_permission(entreprise_id,%L)) with check(public.a_permission(entreprise_id,%L))',t,p,p);execute format('create policy gestion_delete on public.%I for delete to authenticated using(public.a_permission(entreprise_id,%L))',t,p);end loop;
end$$;

-- Audit : ajout autorisé aux membres, jamais de modification/suppression par l'application.
create policy journal_insert on public.journal_activite for insert to authenticated with check(public.est_membre_actif(entreprise_id));
create policy journal_lecture on public.journal_activite as restrictive for select to authenticated using(public.a_permission(entreprise_id,'gerer_parametres'));

grant select,insert,update,delete on public.situations_travaux,public.lignes_situations,public.modeles_devis,public.lignes_modeles_devis,public.metres,public.lignes_metres,public.contrats_entretien,public.interventions,public.bons_livraison,public.appels_contacts,public.relances_impayes,public.champs_personnalises,public.valeurs_champs_personnalises,public.remises_banque,public.remises_banque_paiements,public.connecteurs_externes,public.tarifs_fournisseurs to authenticated;
grant select,insert on public.journal_activite to authenticated;
revoke update,delete on public.journal_activite from authenticated;
revoke all on function public.trg_reference_suite_metier() from public,anon,authenticated;
revoke all on function public.creer_situation_travaux(uuid,uuid,numeric,numeric,text) from public,anon;
revoke all on function public.facturer_situation_travaux(uuid,uuid) from public,anon;
revoke all on function public.creer_facture_avancee(uuid,uuid,text,numeric,boolean) from public,anon;
revoke all on function public.appliquer_modele_devis(uuid,uuid,uuid) from public,anon;
grant execute on function public.creer_situation_travaux(uuid,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.facturer_situation_travaux(uuid,uuid) to authenticated;
grant execute on function public.creer_facture_avancee(uuid,uuid,text,numeric,boolean) to authenticated;
grant execute on function public.appliquer_modele_devis(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
