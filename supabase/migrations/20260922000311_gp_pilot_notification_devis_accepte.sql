-- GP-EXTERNAL-PILOT-CLOSURE-V1 — notification interne fiable quand un devis
-- passe à 'accepte' (mission §20).
--
-- Constat : ce dépôt n'a AUCUN mécanisme d'acceptation en libre-service par le
-- client (le lien public /document/[token] permet de consulter le devis, pas
-- de l'accepter ; aucune action `accepter_devis`, aucun bouton "Accepter"
-- trouvé). Le passage au statut 'accepte' se fait aujourd'hui exclusivement
-- via changerStatutDevisAction, une action authentifiée réservée à un membre
-- de l'entreprise (gerer_devis) : c'est TOUJOURS une saisie administrative
-- interne enregistrant un accord obtenu hors-ligne (oral, e-mail, signature
-- papier...), jamais un clic du client lui-même. Ce correctif se limite donc
-- à ce qui existe réellement : personne n'était informé qu'un devis venait
-- d'être marqué accepté, et rien n'en gardait trace dans le journal d'audit.
-- Construire un vrai parcours d'acceptation client en libre-service (preuve
-- IP/user-agent/texte accepté, séparée de la saisie interne) est un chantier
-- distinct, plus important, volontairement laissé pour une prochaine session
-- (nouveau module public, hors périmètre "aucun nouveau gros module" de
-- cette nuit) — voir le rapport de clôture.
create or replace function public.notifier_devis_accepte(p_devis_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_numero text;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found or not public.a_permission(v_devis.entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé';
  end if;

  v_numero := coalesce(v_devis.numero, 'brouillon');

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
  values (
    v_devis.entreprise_id, auth.uid(), 'devis_accepte', 'devis', p_devis_id,
    'Devis ' || v_numero || ' marqué accepté (saisie interne, accord obtenu hors ligne)',
    jsonb_build_object('numero', v_devis.numero, 'montant_ttc', v_devis.montant_ttc)
  );

  -- Un responsable visible = tout membre actif ayant le droit de gérer les
  -- devis pour cette entreprise, hors l'auteur du changement lui-même (il
  -- vient de le faire, inutile de le notifier de sa propre action).
  insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message, lien, niveau)
  select distinct v_devis.entreprise_id, ue.utilisateur_id, 'devis_accepte',
    'Devis accepté',
    'Le devis ' || v_numero || ' (' || to_char(v_devis.montant_ttc, 'FM999999990.00') || ' €) a été marqué accepté.',
    '/devis/' || p_devis_id, 'info'
  from public.utilisateurs_entreprises ue
  join public.permissions_poste pp
    on pp.entreprise_id = ue.entreprise_id and pp.poste_id = ue.poste_id
   and pp.cle_permission = 'gerer_devis' and pp.autorise
  where ue.entreprise_id = v_devis.entreprise_id
    and ue.statut = 'actif'
    and ue.utilisateur_id is distinct from auth.uid();
end;
$$;

comment on function public.notifier_devis_accepte(uuid) is
  'Journalise et notifie en interne le passage d''un devis à ''accepte'' (saisie administrative, pas une acceptation client en libre-service — ce parcours n''existe pas encore).';

revoke all on function public.notifier_devis_accepte(uuid) from public, anon;
grant execute on function public.notifier_devis_accepte(uuid) to authenticated;

notify pgrst, 'reload schema';
