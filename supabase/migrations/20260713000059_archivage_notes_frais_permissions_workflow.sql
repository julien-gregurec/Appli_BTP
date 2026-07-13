-- Permissions fines, RLS et workflow sécurisé des notes de frais.

insert into public.permissions_disponibles(cle,module,description) values
 ('consulter_ses_notes_frais','Notes de frais','Consulter ses propres dépenses et justificatifs'),
 ('verifier_notes_frais','Notes de frais','Vérifier les dépenses autorisées et demander une correction'),
 ('comptabiliser_notes_frais','Notes de frais','Ajouter les références comptables et exporter les dépenses validées'),
 ('exporter_notes_frais','Notes de frais','Créer et télécharger les exports pour l’expert-comptable'),
 ('verrouiller_notes_frais','Notes de frais','Verrouiller et archiver les justificatifs validés'),
 ('administrer_archivage_notes_frais','Notes de frais','Gérer catégories, conservation et suspensions de suppression'),
 ('consulter_audit_notes_frais','Notes de frais','Consulter le journal d’audit des dépenses')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,
  case
    when d.cle='consulter_ses_notes_frais' then true
    when d.cle in ('verifier_notes_frais','comptabiliser_notes_frais','exporter_notes_frais') then
      lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','rh / comptable','comptable','conducteur de travaux')
    when d.cle in ('verrouiller_notes_frais','administrer_archivage_notes_frais','consulter_audit_notes_frais') then
      lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','rh / comptable','comptable')
    else false end
from public.postes p
cross join public.permissions_disponibles d
where d.cle in (
 'consulter_ses_notes_frais','verifier_notes_frais','comptabiliser_notes_frais','exporter_notes_frais',
 'verrouiller_notes_frais','administrer_archivage_notes_frais','consulter_audit_notes_frais'
)
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create or replace function public.peut_consulter_note_frais(p_note_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(
    select 1 from public.notes_frais n
    where n.id=p_note_id and public.est_membre_actif(n.entreprise_id)
      and (
        public.est_employe_du_compte(n.entreprise_id,n.employe_id)
        or public.a_permission(n.entreprise_id,'verifier_notes_frais')
        or public.a_permission(n.entreprise_id,'gerer_notes_frais')
        or public.a_permission(n.entreprise_id,'comptabiliser_notes_frais')
        or public.a_permission(n.entreprise_id,'administrer_archivage_notes_frais')
      )
  );
$$;

create or replace function public.peut_modifier_note_frais_personnelle(p_note_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select exists(
    select 1 from public.notes_frais n
    where n.id=p_note_id
      and public.est_employe_du_compte(n.entreprise_id,n.employe_id)
      and public.a_permission(n.entreprise_id,'saisir_ses_notes_frais')
      and n.statut in ('brouillon','a_completer','correction_demandee')
      and n.verrouille_at is null
  );
$$;

create or replace function public.role_courant_entreprise(p_entreprise_id uuid)
returns text language sql security definer stable set search_path=public as $$
  select p.nom from public.utilisateurs_entreprises ue
  left join public.postes p on p.id=ue.poste_id and p.entreprise_id=ue.entreprise_id
  where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif'
  limit 1;
$$;

create or replace function public.transition_note_frais(
  p_note_id uuid,p_nouveau_statut text,p_message text default null
)
returns void language plpgsql security definer set search_path=public as $$
declare n public.notes_frais;v_action text;v_role text;v_personnel boolean;v_verif boolean;v_compta boolean;v_archive boolean;
begin
  select * into n from public.notes_frais where id=p_note_id for update;
  if not found or not public.est_membre_actif(n.entreprise_id) then raise exception 'Dépense inaccessible';end if;
  v_personnel:=public.est_employe_du_compte(n.entreprise_id,n.employe_id);
  v_verif:=public.a_permission(n.entreprise_id,'verifier_notes_frais') or public.a_permission(n.entreprise_id,'gerer_notes_frais');
  v_compta:=public.a_permission(n.entreprise_id,'comptabiliser_notes_frais');
  v_archive:=public.a_permission(n.entreprise_id,'verrouiller_notes_frais');
  v_role:=public.role_courant_entreprise(n.entreprise_id);
  if n.verrouille_at is not null and p_nouveau_statut not in ('archive') then raise exception 'Document verrouillé';end if;

  if p_nouveau_statut='soumis' and v_personnel and n.statut in ('brouillon','a_completer','correction_demandee') then
    if not exists(select 1 from public.documents_notes_frais d where d.note_frais_id=n.id) and n.justificatif_storage_path is null then
      raise exception 'Ajoutez au moins un justificatif';end if;
    v_action:='soumission';
  elsif p_nouveau_statut='en_verification' and v_verif and n.statut in ('soumis','soumise') then v_action:='prise_en_charge';
  elsif p_nouveau_statut='correction_demandee' and v_verif and n.statut in ('soumis','soumise','en_verification') then
    if nullif(btrim(p_message),'') is null then raise exception 'Le message de correction est obligatoire';end if;v_action:='correction_demandee';
  elsif p_nouveau_statut='valide' and v_verif and n.statut in ('soumis','soumise','en_verification') then v_action:='validation';
  elsif p_nouveau_statut='refuse' and v_verif and n.statut in ('soumis','soumise','en_verification') then
    if nullif(btrim(p_message),'') is null then raise exception 'Le motif du refus est obligatoire';end if;v_action:='refus';
  elsif p_nouveau_statut='exporte_comptabilite' and v_compta and n.statut in ('valide','validee','remboursee') then v_action:='export';
  elsif p_nouveau_statut='verrouille' and v_archive and n.statut in ('valide','validee','remboursee','exporte_comptabilite') then v_action:='verrouillage';
  elsif p_nouveau_statut='archive' and v_archive and n.statut='verrouille' then v_action:='archivage';
  else raise exception 'Transition de statut non autorisée';end if;

  update public.notes_frais set statut=p_nouveau_statut,motif_decision=nullif(btrim(p_message),''),
    soumis_at=case when p_nouveau_statut='soumis' then now() else soumis_at end,
    verification_at=case when p_nouveau_statut='en_verification' then now() else verification_at end,
    valide_at=case when p_nouveau_statut='valide' then now() else valide_at end,
    valide_par=case when p_nouveau_statut='valide' then auth.uid() else valide_par end,
    refuse_at=case when p_nouveau_statut='refuse' then now() else refuse_at end,
    verrouille_at=case when p_nouveau_statut='verrouille' then now() else verrouille_at end,
    verrouille_par=case when p_nouveau_statut='verrouille' then auth.uid() else verrouille_par end,
    statut_export=case when p_nouveau_statut='exporte_comptabilite' then 'exporte' else statut_export end,
    exporte_at=case when p_nouveau_statut='exporte_comptabilite' then now() else exporte_at end,
    updated_at=now() where id=n.id;
  if p_nouveau_statut='verrouille' then update public.documents_notes_frais set verrouille_at=now(),updated_at=now() where note_frais_id=n.id;end if;
  insert into public.validations_notes_frais(entreprise_id,note_frais_id,action,ancien_statut,nouveau_statut,message,utilisateur_id,role_utilisateur)
  values(n.entreprise_id,n.id,v_action,n.statut,p_nouveau_statut,nullif(btrim(p_message),''),auth.uid(),v_role);
end;$$;

create or replace function public.modifier_reference_comptable_note_frais(p_note_id uuid,p_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.notes_frais where id=p_note_id;
  if v_entreprise is null or not public.a_permission(v_entreprise,'comptabiliser_notes_frais') then raise exception 'Autorisation comptable requise';end if;
  update public.notes_frais set reference_comptable=nullif(btrim(p_reference),''),updated_at=now() where id=p_note_id;
end;$$;

alter table public.categories_notes_frais enable row level security;
alter table public.politiques_conservation_notes_frais enable row level security;
alter table public.documents_notes_frais enable row level security;
alter table public.versions_documents_notes_frais enable row level security;
alter table public.validations_notes_frais enable row level security;
alter table public.journal_audit_notes_frais enable row level security;
alter table public.exports_notes_frais enable row level security;
alter table public.elements_export_notes_frais enable row level security;
alter table public.legal_holds_notes_frais enable row level security;
alter table public.suggestions_ocr_notes_frais enable row level security;
alter table public.tentatives_acces_notes_frais enable row level security;

drop policy if exists "membres notes frais" on public.notes_frais;
drop policy if exists "prototype notes frais" on public.notes_frais;
drop policy if exists notes_frais_select_authenticated on public.notes_frais;
drop policy if exists notes_frais_insert_authenticated on public.notes_frais;
drop policy if exists notes_frais_update_authenticated on public.notes_frais;
drop policy if exists notes_frais_delete_authenticated on public.notes_frais;
create policy notes_frais_select_authenticated on public.notes_frais for select to authenticated
using(public.peut_consulter_note_frais(id));
create policy notes_frais_insert_authenticated on public.notes_frais for insert to authenticated
with check(
  public.est_membre_actif(entreprise_id)
  and public.a_permission(entreprise_id,'saisir_ses_notes_frais')
  and public.est_employe_du_compte(entreprise_id,employe_id)
  and cree_par_utilisateur_id=auth.uid()
  and statut in ('brouillon','a_completer')
);
create policy notes_frais_update_authenticated on public.notes_frais for update to authenticated
using(public.peut_modifier_note_frais_personnelle(id))
with check(public.peut_modifier_note_frais_personnelle(id));
create policy notes_frais_delete_authenticated on public.notes_frais for delete to authenticated
using(public.peut_modifier_note_frais_personnelle(id) and statut='brouillon');

create policy categories_notes_frais_select on public.categories_notes_frais for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy categories_notes_frais_manage on public.categories_notes_frais for all to authenticated
using(public.a_permission(entreprise_id,'administrer_archivage_notes_frais')) with check(public.a_permission(entreprise_id,'administrer_archivage_notes_frais'));
create policy politiques_notes_frais_select on public.politiques_conservation_notes_frais for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy politiques_notes_frais_manage on public.politiques_conservation_notes_frais for update to authenticated
using(public.a_permission(entreprise_id,'administrer_archivage_notes_frais')) with check(public.a_permission(entreprise_id,'administrer_archivage_notes_frais'));
create policy documents_notes_frais_select on public.documents_notes_frais for select to authenticated using(public.peut_consulter_note_frais(note_frais_id));
create policy documents_notes_frais_insert on public.documents_notes_frais for insert to authenticated
with check(public.peut_modifier_note_frais_personnelle(note_frais_id) or public.a_permission(entreprise_id,'administrer_archivage_notes_frais'));
create policy documents_notes_frais_update on public.documents_notes_frais for update to authenticated
using(verrouille_at is null and (public.peut_modifier_note_frais_personnelle(note_frais_id) or public.a_permission(entreprise_id,'administrer_archivage_notes_frais')))
with check(verrouille_at is null and (public.peut_modifier_note_frais_personnelle(note_frais_id) or public.a_permission(entreprise_id,'administrer_archivage_notes_frais')));
create policy versions_notes_frais_select on public.versions_documents_notes_frais for select to authenticated
using(exists(select 1 from public.documents_notes_frais d where d.id=document_id and public.peut_consulter_note_frais(d.note_frais_id)));
create policy versions_notes_frais_insert on public.versions_documents_notes_frais for insert to authenticated
with check(exists(select 1 from public.documents_notes_frais d where d.id=document_id and d.verrouille_at is null and (public.peut_modifier_note_frais_personnelle(d.note_frais_id) or public.a_permission(d.entreprise_id,'administrer_archivage_notes_frais'))));
create policy validations_notes_frais_select on public.validations_notes_frais for select to authenticated using(public.peut_consulter_note_frais(note_frais_id));
create policy audit_notes_frais_select on public.journal_audit_notes_frais for select to authenticated using(public.a_permission(entreprise_id,'consulter_audit_notes_frais'));
create policy exports_notes_frais_select on public.exports_notes_frais for select to authenticated using(public.a_permission(entreprise_id,'exporter_notes_frais'));
create policy exports_notes_frais_insert on public.exports_notes_frais for insert to authenticated with check(public.a_permission(entreprise_id,'exporter_notes_frais') and cree_par=auth.uid());
create policy exports_notes_frais_update on public.exports_notes_frais for update to authenticated using(public.a_permission(entreprise_id,'exporter_notes_frais')) with check(public.a_permission(entreprise_id,'exporter_notes_frais'));
create policy elements_export_select on public.elements_export_notes_frais for select to authenticated using(public.a_permission(entreprise_id,'exporter_notes_frais'));
create policy elements_export_insert on public.elements_export_notes_frais for insert to authenticated with check(public.a_permission(entreprise_id,'exporter_notes_frais'));
create policy legal_holds_select on public.legal_holds_notes_frais for select to authenticated using(public.a_permission(entreprise_id,'administrer_archivage_notes_frais'));
create policy legal_holds_manage on public.legal_holds_notes_frais for all to authenticated using(public.a_permission(entreprise_id,'administrer_archivage_notes_frais')) with check(public.a_permission(entreprise_id,'administrer_archivage_notes_frais'));
create policy ocr_notes_frais_select on public.suggestions_ocr_notes_frais for select to authenticated using(public.peut_consulter_note_frais(note_frais_id));

revoke all on function public.peut_consulter_note_frais(uuid) from public,anon;
revoke all on function public.peut_modifier_note_frais_personnelle(uuid) from public,anon;
revoke all on function public.role_courant_entreprise(uuid) from public,anon;
revoke all on function public.transition_note_frais(uuid,text,text) from public,anon;
revoke all on function public.modifier_reference_comptable_note_frais(uuid,text) from public,anon;
grant execute on function public.peut_consulter_note_frais(uuid) to authenticated;
grant execute on function public.peut_modifier_note_frais_personnelle(uuid) to authenticated;
grant execute on function public.role_courant_entreprise(uuid) to authenticated;
grant execute on function public.transition_note_frais(uuid,text,text) to authenticated;
grant execute on function public.modifier_reference_comptable_note_frais(uuid,text) to authenticated;
grant select,insert,update on public.categories_notes_frais,public.politiques_conservation_notes_frais,public.documents_notes_frais,public.versions_documents_notes_frais,public.exports_notes_frais,public.elements_export_notes_frais,public.legal_holds_notes_frais to authenticated;
grant select on public.validations_notes_frais,public.journal_audit_notes_frais,public.suggestions_ocr_notes_frais to authenticated;
notify pgrst,'reload schema';
