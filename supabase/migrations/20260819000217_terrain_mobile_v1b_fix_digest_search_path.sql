-- TERRAIN-MOBILE-V1B : corrige ajouter_audit_note_frais, cassée depuis sa
-- création (20260713000060) — digest() n'est jamais résolu car pgcrypto est
-- installé dans le schéma extensions alors que la fonction, security definer,
-- verrouille son search_path sur public seul. Résultat : toute création de
-- note de frais échoue avec "function digest(text, unknown) does not exist"
-- avant même la création du brouillon.
--
-- Corrigé par qualification explicite du schéma (extensions.digest), sans
-- élargir le search_path implicite de la fonction.

create or replace function public.ajouter_audit_note_frais(
  p_entreprise_id uuid,p_action text,p_ressource_type text,p_ressource_id uuid,
  p_ancien_statut text default null,p_nouveau_statut text default null,
  p_metadata jsonb default '{}'::jsonb,p_empreinte_document text default null,
  p_adresse_ip text default null,p_user_agent text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_precedent text;v_id uuid:=gen_random_uuid();v_date timestamptz:=now();v_hash text;v_role text;
begin
  if not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
  perform pg_advisory_xact_lock(hashtext(p_entreprise_id::text));
  select empreinte_evenement into v_precedent from public.journal_audit_notes_frais
    where entreprise_id=p_entreprise_id order by date_serveur desc,id desc limit 1;
  v_role:=public.role_courant_entreprise(p_entreprise_id);
  v_hash:=encode(extensions.digest(concat_ws('|',v_id::text,p_entreprise_id::text,coalesce(auth.uid()::text,''),p_action,p_ressource_type,
    coalesce(p_ressource_id::text,''),coalesce(p_ancien_statut,''),coalesce(p_nouveau_statut,''),v_date::text,
    coalesce(p_empreinte_document,''),coalesce(v_precedent,''),coalesce(p_metadata,'{}'::jsonb)::text),'sha256'),'hex');
  insert into public.journal_audit_notes_frais(id,entreprise_id,utilisateur_id,role_utilisateur,adresse_ip,user_agent,action,
    ressource_type,ressource_id,ancien_statut,nouveau_statut,date_serveur,metadata,empreinte_document,empreinte_evenement_precedent,empreinte_evenement)
  values(v_id,p_entreprise_id,auth.uid(),v_role,nullif(p_adresse_ip,'')::inet,left(nullif(p_user_agent,''),500),p_action,
    p_ressource_type,p_ressource_id,p_ancien_statut,p_nouveau_statut,v_date,coalesce(p_metadata,'{}'::jsonb),p_empreinte_document,v_precedent,v_hash);
  return v_id;
end;$$;
