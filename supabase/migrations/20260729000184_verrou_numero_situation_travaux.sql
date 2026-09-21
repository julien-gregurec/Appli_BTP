-- Correction de la race condition sur la numerotation des situations de travaux
-- (public.situations_travaux.numero). Audit read-only prealable : le calcul
-- `select coalesce(max(numero),0)+1 ...` et l'INSERT qui suit sont dans la meme
-- transaction (fonction unique appelee via RPC), mais sans verrou protegeant la
-- fenetre lecture-puis-ecriture. Deux appels concurrents sur le meme
-- (entreprise_id, devis_id) peuvent calculer le meme numero ; la contrainte
-- unique(entreprise_id,devis_id,numero) empeche toute corruption persistante
-- mais fait remonter une erreur Postgres brute (23505) au second appelant.
--
-- Correctif : un verrou de ligne (`for update`) sur le devis concerne, pose
-- juste avant le calcul du MAX(numero), serialise l'attribution du numero pour
-- un meme devis sans verrou global : deux devis differents, ou deux
-- entreprises differentes, continuent de progresser independamment. La clause
-- `where id=p_devis_id and entreprise_id=p_entreprise_id` revalide au moment
-- du verrou que le devis appartient bien a l'entreprise appelante (isolation
-- multi-tenant), exactement comme le filtre deja applique lors de la lecture
-- initiale de `v_devis`.
--
-- Aucune autre modification : signature, type de retour, controles
-- d'autorisation, validations, calcul d'avancement, INSERT, ownership, grants,
-- SECURITY DEFINER et search_path restent strictement identiques a la version
-- definie dans 20260715000080_suite_metier_complete.sql (non modifiee).
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
 -- Verrou de ligne sur le devis concerne (portee entreprise_id+devis_id) : serialise
 -- l'attribution du numero pour ce devis, sans verrou global. Deux devis differents
 -- ou deux entreprises differentes obtiennent chacun leur propre verrou de ligne et
 -- progressent independamment. Revalide l'appartenance du devis a l'entreprise.
 perform 1 from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id for update;
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
