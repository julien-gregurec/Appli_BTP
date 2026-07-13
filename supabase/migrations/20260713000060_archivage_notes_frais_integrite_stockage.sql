-- Immutabilité applicative, chaîne d'audit et stockage privé des justificatifs.

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
  v_hash:=encode(digest(concat_ws('|',v_id::text,p_entreprise_id::text,coalesce(auth.uid()::text,''),p_action,p_ressource_type,
    coalesce(p_ressource_id::text,''),coalesce(p_ancien_statut,''),coalesce(p_nouveau_statut,''),v_date::text,
    coalesce(p_empreinte_document,''),coalesce(v_precedent,''),coalesce(p_metadata,'{}'::jsonb)::text),'sha256'),'hex');
  insert into public.journal_audit_notes_frais(id,entreprise_id,utilisateur_id,role_utilisateur,adresse_ip,user_agent,action,
    ressource_type,ressource_id,ancien_statut,nouveau_statut,date_serveur,metadata,empreinte_document,empreinte_evenement_precedent,empreinte_evenement)
  values(v_id,p_entreprise_id,auth.uid(),v_role,nullif(p_adresse_ip,'')::inet,left(nullif(p_user_agent,''),500),p_action,
    p_ressource_type,p_ressource_id,p_ancien_statut,p_nouveau_statut,v_date,coalesce(p_metadata,'{}'::jsonb),p_empreinte_document,v_precedent,v_hash);
  return v_id;
end;$$;

create or replace function public.trg_notes_frais_immutables()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.verrouille_at is not null and (
    new.montant_ht is distinct from old.montant_ht or new.montant_tva is distinct from old.montant_tva
    or new.montant_ttc is distinct from old.montant_ttc or new.fournisseur is distinct from old.fournisseur
    or new.date_frais is distinct from old.date_frais or new.chantier_id is distinct from old.chantier_id
    or new.employe_id is distinct from old.employe_id or new.categorie is distinct from old.categorie
  ) then raise exception 'Une dépense verrouillée ne peut plus être modifiée';end if;
  return new;
end;$$;
drop trigger if exists notes_frais_immutables on public.notes_frais;
create trigger notes_frais_immutables before update on public.notes_frais for each row execute function public.trg_notes_frais_immutables();

create or replace function public.trg_refuser_mutation_archive()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Cet enregistrement d’archive est immuable';end;$$;
drop trigger if exists versions_documents_immutables on public.versions_documents_notes_frais;
create trigger versions_documents_immutables before update or delete on public.versions_documents_notes_frais
for each row execute function public.trg_refuser_mutation_archive();
drop trigger if exists journal_audit_immuable on public.journal_audit_notes_frais;
create trigger journal_audit_immuable before update or delete on public.journal_audit_notes_frais
for each row execute function public.trg_refuser_mutation_archive();
drop trigger if exists validations_notes_frais_immuables on public.validations_notes_frais;
create trigger validations_notes_frais_immuables before update or delete on public.validations_notes_frais
for each row execute function public.trg_refuser_mutation_archive();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('notes-frais','notes-frais',false,15728640,array[
  'application/pdf','image/png','image/jpeg','image/webp','image/heic','image/heif'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists notes_frais_documents_select on storage.objects;
drop policy if exists notes_frais_documents_insert on storage.objects;
drop policy if exists notes_frais_documents_update on storage.objects;
drop policy if exists notes_frais_documents_delete on storage.objects;
drop policy if exists notes_frais_documents_prototype on storage.objects;

create or replace function public.note_frais_id_depuis_storage(p_name text)
returns uuid language plpgsql immutable set search_path=public as $$
declare p text[]:=storage.foldername(p_name);
begin
  if array_length(p,1)>=4 and p[1]='companies' and p[3]='expenses' and p[4] ~* '^[0-9a-f-]{36}$' then return p[4]::uuid;end if;
  return null;
exception when others then return null;
end;$$;

create or replace function public.entreprise_id_depuis_storage_depense(p_name text)
returns uuid language plpgsql immutable set search_path=public as $$
declare p text[]:=storage.foldername(p_name);
begin
  if array_length(p,1)>=4 and p[1]='companies' and p[2] ~* '^[0-9a-f-]{36}$' then return p[2]::uuid;end if;
  if array_length(p,1)>=2 and p[1] ~* '^[0-9a-f-]{36}$' then return p[1]::uuid;end if;
  return null;
exception when others then return null;
end;$$;

create or replace function public.employe_id_depuis_storage_depense(p_name text)
returns uuid language plpgsql immutable set search_path=public as $$
declare p text[]:=storage.foldername(p_name);
begin
  if array_length(p,1)>=2 and p[1] ~* '^[0-9a-f-]{36}$' and p[2] ~* '^[0-9a-f-]{36}$' then return p[2]::uuid;end if;
  return null;
exception when others then return null;
end;$$;

create policy notes_frais_documents_select on storage.objects for select to authenticated using(
  bucket_id='notes-frais' and (
    (public.note_frais_id_depuis_storage(name) is not null and public.peut_consulter_note_frais(public.note_frais_id_depuis_storage(name)))
    or (
      public.note_frais_id_depuis_storage(name) is null
      and public.est_membre_actif(public.entreprise_id_depuis_storage_depense(name))
      and (
        public.peut_voir_notes_frais_equipe(public.entreprise_id_depuis_storage_depense(name))
        or public.est_employe_du_compte(
          public.entreprise_id_depuis_storage_depense(name),
          public.employe_id_depuis_storage_depense(name)
        )
      )
    )
  )
);
create policy notes_frais_documents_insert on storage.objects for insert to authenticated with check(
  bucket_id='notes-frais' and public.note_frais_id_depuis_storage(name) is not null
  and public.peut_modifier_note_frais_personnelle(public.note_frais_id_depuis_storage(name))
);

grant select,insert on storage.objects to authenticated;
revoke all on function public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text) to authenticated;
revoke all on function public.trg_notes_frais_immutables() from public,anon,authenticated;
revoke all on function public.trg_refuser_mutation_archive() from public,anon,authenticated;
grant execute on function public.note_frais_id_depuis_storage(text) to authenticated;
grant execute on function public.entreprise_id_depuis_storage_depense(text) to authenticated;
grant execute on function public.employe_id_depuis_storage_depense(text) to authenticated;

notify pgrst,'reload schema';
