-- Un avoir (facture de type 'avoir') n'etait jusqu'ici lie qu'a un devis, jamais a la
-- facture precise qu'il credite : impossible de reduire le "reste a payer" de la BONNE
-- facture (tresorerie, fiche facture) sans deviner. Ajoute un lien optionnel explicite.

alter table public.factures add column if not exists facture_origine_id uuid references public.factures(id) on delete set null;

-- Nouveau parametre en fin de liste = nouvelle signature Postgres : supprime
-- explicitement l'ancienne (5 arguments) pour eviter toute ambiguite d'overload.
drop function if exists public.creer_facture_avancee(uuid,uuid,text,numeric,boolean);

create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false,p_facture_origine_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;v_deja_facture numeric;v_montant_nouveau numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_type not in('acompte','avoir','finale') then raise exception 'Type de facture invalide';end if;
 if p_pourcentage<=0 or p_pourcentage>100 then raise exception 'Pourcentage invalide';end if;
 select * into v_d from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte';
 if not found then raise exception 'Le devis doit être accepté';end if;
 v_facteur:=p_pourcentage/100;if p_type='avoir' then v_signe:=-1;end if;
 if p_type='avoir' and p_facture_origine_id is not null then
   if not exists(select 1 from public.factures where id=p_facture_origine_id and entreprise_id=p_entreprise_id and devis_origine_id=p_devis_id and type<>'avoir') then
     raise exception 'La facture créditée doit appartenir au même devis et ne peut pas être elle-même un avoir';
   end if;
 end if;
 if p_type<>'avoir' then
   select coalesce(sum(f.montant_ht),0) into v_deja_facture from public.factures f
     where f.devis_origine_id=p_devis_id and f.entreprise_id=p_entreprise_id and f.statut<>'annulee';
   v_montant_nouveau:=v_d.montant_ht*v_facteur;
   if v_deja_facture+v_montant_nouveau>v_d.montant_ht+0.01 then
     raise exception 'Ce document (%) dépasserait le montant du devis : déjà facturé %, devis %',
       to_char(v_montant_nouveau,'FM999999990.00'),to_char(v_deja_facture,'FM999999990.00'),to_char(v_d.montant_ht,'FM999999990.00');
   end if;
 end if;
 insert into public.factures(entreprise_id,client_id,chantier_id,devis_origine_id,type,statut,avancement_pct,est_dgd,notes_client,facture_origine_id)
 values(p_entreprise_id,v_d.client_id,v_d.chantier_id,v_d.id,p_type,'brouillon',p_pourcentage,coalesce(p_est_dgd,false),v_d.notes_client,case when p_type='avoir' then p_facture_origine_id else null end) returning id into v_id;
 insert into public.lignes_factures(facture_id,designation,description,type,quantite,unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre)
 select v_id,designation,description,type,round(quantite*v_facteur*v_signe,3),unite,prix_unitaire_ht,remise_ligne,taux_tva,ordre
 from public.lignes_devis where devis_id=v_d.id order by ordre;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','facture',v_id,'Document de facturation avancée créé',jsonb_build_object('type',p_type,'pourcentage',p_pourcentage,'dgd',p_est_dgd,'facture_origine_id',p_facture_origine_id));
 return v_id;
end;$$;
revoke all on function public.creer_facture_avancee(uuid,uuid,text,numeric,boolean,uuid) from public,anon;
grant execute on function public.creer_facture_avancee(uuid,uuid,text,numeric,boolean,uuid) to authenticated;

notify pgrst,'reload schema';
