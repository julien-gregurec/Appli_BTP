-- ELSATIA-PLATFORM-AUDIT-LOG-BOUNDED-V1
--
-- Le journal d'audit plateforme cesse d'être écrivable à la main.
--
-- ÉTAT AVANT. Le lot annuaire avait dû accorder `plateforme_journaliser` au rôle
-- générique `authenticated` pour que l'export CSV puisse tracer son extraction.
-- Conséquence : n'importe quel porteur d'un rôle plateforme pouvait appeler
-- directement cette fonction et FABRIQUER l'événement d'audit de son choix —
-- action, cible et détails libres. Un journal dont le contenu peut être composé
-- par celui qu'il surveille ne prouve rien.
--
-- ÉTAT APRÈS. Plus personne n'appelle le journal directement : l'exécution est
-- révoquée du rôle applicatif. La journalisation ne se fait plus qu'À L'INTÉRIEUR
-- de fonctions métier bornées, `SECURITY DEFINER`, qui vérifient l'identité, la
-- session, l'entreprise et l'action avant d'écrire, et qui fixent elles-mêmes le
-- libellé de l'événement. On ne choisit plus ce qu'on écrit dans le journal : on
-- fait une action, et l'action laisse sa trace.
--
-- AAL2. Les actions sensibles ordinaires l'exigent. Deux exceptions, et deux
-- seulement, au titre de la FERMETURE : `assistance_quitter` et
-- `assistance_revoquer` doivent rester utilisables même après expiration de
-- l'AAL2, sans quoi un accès de support ouvert ne pourrait plus être refermé au
-- moment où on en a le plus besoin. Le rôle reste exigé, la trace reste écrite.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Le journal n'est plus appelable par un rôle applicatif
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.plateforme_journaliser(text, text, text, jsonb)
  from public, anon, authenticated;

comment on function public.plateforme_journaliser(text, text, text, jsonb) is
  'INTERNE. N''est plus exécutable par un rôle applicatif : la journalisation passe par des fonctions métier bornées, qui fixent elles-mêmes l''action écrite. Voir migration 00280.';

-- Les huit appelants existants sont tous `SECURITY DEFINER` et s'exécutent donc
-- sous le propriétaire : la révocation ne les affecte pas. Vérifié au moment de
-- l'écriture de cette migration sur une base issue d'un fresh install.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Export de l'annuaire — une fonction bornée, à action fixe
-- ─────────────────────────────────────────────────────────────────────────────

-- L'appelant ne choisit ni l'action ni la cible : il déclare le PÉRIMÈTRE de son
-- extraction, et la fonction écrit l'événement qui lui correspond. Le contenu
-- exporté n'est jamais journalisé — seulement de quoi savoir qui a extrait quoi.
create or replace function public.plateforme_annuaire_journaliser_export(
  p_onglet text,
  p_recherche_non_vide boolean,
  p_colonnes integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rôle plateforme ET permission d'export : l'écran ne fait pas autorité ici.
  perform public.plateforme_exiger_permission('consulter_plateforme');
  -- Un export massif de données clients est une action sensible ordinaire :
  -- il exige l'authentification renforcée, contrairement aux deux fermetures.
  perform public.plateforme_exiger_session_aal2();

  if p_colonnes is null or p_colonnes < 1 then
    raise exception 'Périmètre d''export invalide' using errcode = '22023';
  end if;

  perform public.plateforme_journaliser(
    'annuaire_export_csv',
    'annuaire',
    coalesce(nullif(btrim(p_onglet), ''), 'toutes'),
    jsonb_build_object(
      'recherche_non_vide', coalesce(p_recherche_non_vide, false),
      'onglet', coalesce(nullif(btrim(p_onglet), ''), 'toutes'),
      'colonnes', p_colonnes
    )
  );
end;
$$;

revoke all on function public.plateforme_annuaire_journaliser_export(text, boolean, integer)
  from public, anon;
grant execute on function public.plateforme_annuaire_journaliser_export(text, boolean, integer)
  to authenticated;

comment on function public.plateforme_annuaire_journaliser_export(text, boolean, integer) is
  'Trace une extraction de l''annuaire. L''action journalisée est FIXE : l''appelant déclare un périmètre, il ne compose pas l''événement.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fermeture d'un accès de support — possible même sans AAL2
-- ─────────────────────────────────────────────────────────────────────────────

-- `assistance_quitter` ne ferme QUE la session de l'appelant (`acteur_id =
-- auth.uid()`) : personne ne peut refermer, ni a fortiori manipuler, la session
-- d'un autre. Elle n'exigeait déjà pas d'AAL2 ; on le documente sans le changer.

-- `assistance_revoquer` exigeait AAL2. On la lève, et uniquement elle : révoquer
-- un accès de support est une action de FERMETURE, et exiger une authentification
-- renforcée au moment où l'on veut couper un accès en urgence revient à laisser
-- l'accès ouvert. Le rôle « total » reste exigé, le motif reste obligatoire, la
-- notification et la trace restent écrites.
create or replace function public.assistance_revoquer(p_session_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_session public.assistance_sessions;
begin
  perform public.plateforme_exiger_role('total');
  -- Pas d'AAL2 ici : voir le commentaire ci-dessus. Fermer doit toujours rester
  -- possible ; c'est OUVRIR un accès qui exige l'authentification renforcée,
  -- et `assistance_ouvrir` continue de l'exiger.
  if char_length(btrim(coalesce(p_motif, ''))) < 5 then
    raise exception 'Indiquez le motif de révocation' using errcode = '22023';
  end if;
  select * into v_session from public.assistance_sessions where id = p_session_id for update;
  if not found then raise exception 'Session introuvable' using errcode = 'P0002'; end if;
  if v_session.terminee_at is not null then
    raise exception 'Session déjà close' using errcode = '22023';
  end if;
  update public.assistance_sessions
  set terminee_at = now(), terminee_motif = 'revocation',
      revoquee_at = now(), revoquee_par = auth.uid()
  where id = p_session_id;
  perform public.assistance_notifier_fermeture(p_session_id);
  perform public.plateforme_journaliser(
    'assistance_session_revoquee', 'session', p_session_id::text,
    jsonb_build_object('motif', btrim(p_motif), 'acteur_revoque', v_session.acteur_id)
  );
end;
$$;

revoke all on function public.assistance_revoquer(uuid, text) from public, anon;
grant execute on function public.assistance_revoquer(uuid, text) to authenticated;

commit;
