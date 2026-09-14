-- AVENANTS-V1 — intégration du montant contractuel canonique (devis + avenants
-- acceptés) au plafond de facturation. Réutilise strictement la source
-- canonique montant_facture_devis (FACTURATION-BTP-V1B) pour « déjà facturé » :
-- aucune seconde logique anti-surfacturation spécifique aux avenants.
--
-- Choix délibéré, pour rester V1 minimal (« ne duplique pas le moteur de
-- facture ») : seul creer_situation_travaux recalcule ses montants sur la base
-- du montant contractuel courant (un « 100 % du marché » doit refléter les
-- avenants acceptés, explicitement demandé). creer_facture_avancee
-- (acompte/finale) continue de calculer le montant d'un document en
-- pourcentage du devis d'origine (comportement inchangé, déjà testé) mais son
-- plafond de refus utilise désormais le montant contractuel, pas seulement
-- devis.montant_ht — un acompte/une finale ne peut donc jamais faire dépasser
-- le montant contractuel réel, avenants compris. creer_facture_depuis_devis
-- (classique) n'a besoin d'aucun changement : son garde-fou (« déjà facturé »)
-- réutilise déjà montant_facture_devis sans référencer directement
-- devis.montant_ht.

create or replace function public.creer_situation_travaux(
 p_entreprise_id uuid,p_devis_id uuid,p_avancement_pct numeric,
 p_retenue_garantie_pct numeric default 0,p_notes text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_devis public.devis;v_id uuid;v_numero integer;v_precedent numeric:=0;v_cumule numeric;v_periode numeric;
  v_deja_facture numeric;v_montant_contractuel numeric;v_deja_situations numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_avancement_pct<=0 or p_avancement_pct>100 then raise exception 'Avancement invalide';end if;
 if coalesce(p_retenue_garantie_pct,0)<0 or coalesce(p_retenue_garantie_pct,0)>20 then raise exception 'Retenue de garantie invalide';end if;
 select * into v_devis from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte' for update;
 if not found then raise exception 'Le devis doit être accepté';end if;
 if v_devis.chantier_id is null then raise exception 'Un chantier doit être associé au devis';end if;

 v_montant_contractuel := public.montant_contractuel_devis(p_entreprise_id, p_devis_id);

 select coalesce(max(ls.avancement_cumule_pct),0) into v_precedent
 from public.situations_travaux s join public.lignes_situations ls on ls.situation_id=s.id
 where s.entreprise_id=p_entreprise_id and s.devis_id=p_devis_id and s.statut<>'annulee';
 if p_avancement_pct<=v_precedent then raise exception 'L''avancement doit être supérieur au cumul précédent (%)',v_precedent;end if;

 -- Cumul cible en euros calculé sur le montant contractuel COURANT (avenants
 -- compris), la période étant la différence avec ce qui a réellement été
 -- facturé via des situations jusqu'ici — pas un simple pourcentage du
 -- pourcentage précédent, qui serait faux si le montant contractuel a changé
 -- entre deux situations (un avenant accepté entre-temps, par exemple : 60 %
 -- d'un marché à 10 000 € puis 100 % d'un marché passé à 12 000 € doivent
 -- redonner exactement 12 000 € au total, pas 60 % de 12 000 € + 40 % de 12 000 €).
 select coalesce(sum(s.montant_periode_ht),0) into v_deja_situations
 from public.situations_travaux s where s.entreprise_id=p_entreprise_id and s.devis_id=p_devis_id and s.statut<>'annulee';

 v_cumule:=round(v_montant_contractuel*p_avancement_pct/100,2);
 v_periode:=round(v_cumule-v_deja_situations,2);

 v_deja_facture:=public.montant_facture_devis(p_entreprise_id,p_devis_id);
 if v_deja_facture+v_periode>v_montant_contractuel+0.01 then
   raise exception 'Cette situation dépasserait le montant contractuel autorisé pour ce devis (avenants compris) : déjà facturé %, montant contractuel %',
     to_char(v_deja_facture,'FM999999990.00'),to_char(v_montant_contractuel,'FM999999990.00');
 end if;

 select coalesce(max(numero),0)+1 into v_numero from public.situations_travaux where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
 insert into public.situations_travaux(entreprise_id,devis_id,chantier_id,numero,retenue_garantie_pct,montant_marche_ht,montant_cumule_ht,montant_periode_ht,montant_retenue,notes)
 values(p_entreprise_id,p_devis_id,v_devis.chantier_id,v_numero,coalesce(p_retenue_garantie_pct,0),v_montant_contractuel,v_cumule,v_periode,round(v_periode*coalesce(p_retenue_garantie_pct,0)/100,2),nullif(btrim(p_notes),'')) returning id into v_id;
 -- Répartit v_periode (déjà correct en euros, avenants compris) proportionnellement
 -- entre les lignes du devis d'origine selon leur poids dans le devis initial —
 -- les avenants ne sont pas itemisés séparément sur une situation (V1 minimal,
 -- « ne duplique pas le moteur de facture »), leur valeur est lissée sur les
 -- lignes existantes, exactement comme creer_facture_avancee le fait déjà pour
 -- les acomptes/finales.
 insert into public.lignes_situations(entreprise_id,situation_id,ligne_devis_id,avancement_precedent_pct,avancement_cumule_pct,montant_periode_ht)
 select p_entreprise_id,v_id,l.id,v_precedent,p_avancement_pct,
  round(((l.quantite*l.prix_unitaire_ht)*(1-l.remise_ligne/100)) * (v_periode/nullif(v_devis.montant_ht,0)),2)
 from public.lignes_devis l where l.devis_id=p_devis_id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','situation_travaux',v_id,'Situation d''avancement créée',jsonb_build_object('devis_id',p_devis_id,'avancement_pct',p_avancement_pct));
 return v_id;
end;$$;

create or replace function public.creer_facture_avancee(
 p_entreprise_id uuid,p_devis_id uuid,p_type text,p_pourcentage numeric default 100,p_est_dgd boolean default false,p_facture_origine_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_d public.devis;v_id uuid;v_facteur numeric;v_signe numeric:=1;v_deja_facture numeric;v_montant_nouveau numeric;v_montant_contractuel numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_type not in('acompte','avoir','finale') then raise exception 'Type de facture invalide';end if;
 if p_pourcentage<=0 or p_pourcentage>100 then raise exception 'Pourcentage invalide';end if;
 select * into v_d from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte' for update;
 if not found then raise exception 'Le devis doit être accepté';end if;
 v_facteur:=p_pourcentage/100;if p_type='avoir' then v_signe:=-1;end if;
 if p_type='avoir' and p_facture_origine_id is not null then
   if not exists(select 1 from public.factures where id=p_facture_origine_id and entreprise_id=p_entreprise_id and devis_origine_id=p_devis_id and type<>'avoir') then
     raise exception 'La facture créditée doit appartenir au même devis et ne peut pas être elle-même un avoir';
   end if;
 end if;
 if p_type<>'avoir' then
   v_montant_contractuel := public.montant_contractuel_devis(p_entreprise_id, p_devis_id);
   v_deja_facture:=public.montant_facture_devis(p_entreprise_id,p_devis_id);
   v_montant_nouveau:=v_d.montant_ht*v_facteur;
   if v_deja_facture+v_montant_nouveau>v_montant_contractuel+0.01 then
     raise exception 'Ce document (%) dépasserait le montant contractuel du devis (avenants compris) : déjà facturé %, montant contractuel %',
       to_char(v_montant_nouveau,'FM999999990.00'),to_char(v_deja_facture,'FM999999990.00'),to_char(v_montant_contractuel,'FM999999990.00');
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

-- facturer_situation_travaux : générait ses lignes en recalculant depuis les
-- lignes de devis brutes (quantité × pourcentage), ignorant le montant déjà
-- correctement ajusté (avenants compris) que creer_situation_travaux calcule
-- et stocke dans lignes_situations.montant_periode_ht. Corrigé pour dériver la
-- quantité facturée directement de ce montant déjà correct, plutôt que de le
-- recalculer une seconde fois avec une formule qui ignore les avenants.
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
  round(ls.montant_periode_ht / nullif(l.prix_unitaire_ht*(1-l.remise_ligne/100),0),3),l.unite,l.prix_unitaire_ht,l.remise_ligne,l.taux_tva,l.ordre
 from public.lignes_situations ls join public.lignes_devis l on l.id=ls.ligne_devis_id where ls.situation_id=v_s.id order by l.ordre;
 update public.situations_travaux set statut='facturee',facture_id=v_facture,updated_at=now() where id=v_s.id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'facturation','situation_travaux',v_s.id,'Facture de situation créée',jsonb_build_object('facture_id',v_facture));
 return v_facture;
end;$$;

notify pgrst, 'reload schema';
