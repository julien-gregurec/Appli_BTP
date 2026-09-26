-- NF-01 (recette pilote) — enforcement DB découvert pendant la clôture V2.
--
-- Reproduit par exécution réelle (Playwright, ouvrier pilote, 2 échecs sur 5
-- rejeux) : /api/notes-frais/upload insère d'abord la ligne
-- documents_notes_frais, PUIS envoie le fichier dans Storage, PUIS écrit
-- versions_documents_notes_frais. Si la soumission arrive pendant l'upload (clic
-- sur « Soumettre » avant la fin de l'envoi), l'upload échoue sur la RLS (la note
-- n'est plus en brouillon) et laisse une ligne documents_notes_frais sans aucun
-- fichier. Or transition_note_frais ne vérifiait QUE l'existence de cette ligne :
-- la note est passée `soumis` avec 0 objet Storage (constaté en base :
-- statut soumis, 1 document, 0 version, 0 objet).
--
-- Correctif minimal : la règle « au moins un justificatif » exige désormais une
-- version `original` enregistrée, écrite par la route d'upload uniquement après
-- le stockage réussi du fichier. Seule cette condition change ; le reste de la
-- fonction est la définition en vigueur (20260713000059), reprise telle quelle.

create or replace function public.transition_note_frais(p_note_id uuid, p_nouveau_statut text, p_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- NF-01 : un justificatif compte seulement si son fichier original est réellement
    -- stocké (la version 'original' n'est écrite qu'après l'upload Storage réussi).
    if not exists(
         select 1 from public.documents_notes_frais d
         join public.versions_documents_notes_frais v on v.document_id=d.id and v.role_fichier='original'
         where d.note_frais_id=n.id
       ) and n.justificatif_storage_path is null then
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
end;$function$;

notify pgrst, 'reload schema';
