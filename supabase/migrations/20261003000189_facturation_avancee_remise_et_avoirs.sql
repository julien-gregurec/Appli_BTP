-- Facturation avancée (module bêta) et encaissements : corrections de recette.
--
-- 1. creer_facture_avancee (acompte, finale, avoir) et facturer_situation_travaux
--    copiaient les lignes du devis sans sa remise globale. Recette : devis
--    21 665,58 € TTC remisé 3 % → acompte 30 % à 6 700,69 € au lieu de 6 499,67 €.
--    Même report de remise combinée que creer_facture_depuis_devis (migration 187).
-- 2. Le plafond d'encaissement ignorait les avoirs liés à la facture : un acompte
--    de 6 700,69 € crédité d'un avoir de 2 233,56 € a pu être encaissé en totalité.
--    Le reste dû tient désormais compte des avoirs non annulés.

CREATE OR REPLACE FUNCTION public.creer_facture_avancee(p_entreprise_id uuid, p_devis_id uuid, p_type text, p_pourcentage numeric DEFAULT 100, p_est_dgd boolean DEFAULT false, p_facture_origine_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 select v_id,designation,description,type,round(quantite*v_facteur*v_signe,3),unite,prix_unitaire_ht,100-(100-coalesce(remise_ligne,0))*(100-coalesce(v_d.remise_globale,0))/100,taux_tva,ordre
 from public.lignes_devis where devis_id=v_d.id order by ordre;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','facture',v_id,'Document de facturation avancée créé',jsonb_build_object('type',p_type,'pourcentage',p_pourcentage,'dgd',p_est_dgd,'facture_origine_id',p_facture_origine_id));
 return v_id;
end;$function$;

CREATE OR REPLACE FUNCTION public.facturer_situation_travaux(p_entreprise_id uuid, p_situation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  round(l.quantite*(ls.avancement_cumule_pct-ls.avancement_precedent_pct)/100,3),l.unite,l.prix_unitaire_ht,100-(100-coalesce(l.remise_ligne,0))*(100-coalesce(v_d.remise_globale,0))/100,l.taux_tva,l.ordre
 from public.lignes_situations ls join public.lignes_devis l on l.id=ls.ligne_devis_id where ls.situation_id=v_s.id order by l.ordre;
 update public.situations_travaux set statut='facturee',facture_id=v_facture,updated_at=now() where id=v_s.id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'facturation','situation_travaux',v_s.id,'Facture de situation créée',jsonb_build_object('facture_id',v_facture));
 return v_facture;
end;$function$;

create or replace function public.trg_paiement_garde_fous()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ttc numeric;
  v_paye numeric;
  v_avoirs numeric;
begin
  if new.stripe_session_id is not null then
    return new;
  end if;
  if new.montant is null or new.montant <= 0 then
    raise exception 'Montant de paiement invalide';
  end if;
  select montant_ttc, coalesce(montant_paye, 0) into v_ttc, v_paye
  from public.factures where id = new.facture_id for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  -- Les avoirs liés (montants négatifs) réduisent ce que le client doit encore.
  select coalesce(sum(montant_ttc), 0) into v_avoirs
  from public.factures
  where facture_origine_id = new.facture_id and type = 'avoir' and statut <> 'annulee';
  if new.montant > v_ttc + v_avoirs - v_paye + 0.005 then
    raise exception '%', ('Le paiement d' || chr(233) || 'passe le reste d' || chr(251) || ' (' || to_char(greatest(v_ttc + v_avoirs - v_paye, 0), 'FM999999990.00') || ' ' || chr(8364) || ')');
  end if;
  if exists (
    select 1 from public.paiements p
    where p.facture_id = new.facture_id and p.montant = new.montant and p.date = new.date
      and p.mode is not distinct from new.mode and p.reference is not distinct from new.reference
      and p.created_at > now() - interval '30 seconds'
  ) then
    raise exception '%', ('Ce paiement vient d' || chr(39) || chr(234) || 'tre enregistr' || chr(233) || ' (double envoi ignor' || chr(233) || ')');
  end if;
  return new;
end;
$$;
