-- ELSATIA SATELLITES PREVIEW READINESS V1 — A-11 : url_preview administrable par le seul
-- propriétaire plateforme.
--
-- Constat (ELSATIA_V9_SATELLITE_APPS_PREVIEW_QUALIFICATION_V1, A-11) : `url_preview` vit dans
-- `applications_elsatia` ; UPDATE y est révoqué pour `authenticated` ET `service_role`
-- (20260902000255_acl_reconciliation_v1) et /plateforme/applications est en lecture seule.
-- Seule voie : du SQL propriétaire. Le runbook Preview V3 affirmait à tort « ou via
-- /plateforme/applications ».
--
-- Décision : une RPC dédiée, appelée par un formulaire réservé au propriétaire sur
-- /plateforme/applications. L'écriture directe sur la table reste fermée à tous les rôles
-- d'API ; la contrainte `applications_elsatia_url_preview_https` reste la dernière barrière.
--
-- Qui peut écrire :
--   - le propriétaire plateforme (`est_plateforme_proprietaire()`), en session AAL2 ;
--   - PERSONNE d'autre : ni un administrateur plateforme délégué (même « total »), ni un
--     administrateur d'entreprise, ni `anon`, ni `service_role` (geste humain tracé).
-- Ce qui est accepté (`p_url`) :
--   - NULL ou vide : efface l'URL (le lanceur cesse alors de proposer le lien, il ne
--     retombe jamais sur la Production) ;
--   - sinon une ORIGINE stricte `https://<projet>.vercel.app`, normalisée (espaces et une
--     barre finale retirés, minuscules) : pas de chemin, de requête, de fragment, de port ni
--     d'identifiants — donc ni `javascript:`, ni `data:`, ni redirection ouverte par un
--     `?next=` embarqué, ni hôte suffixé (`….vercel.app.evil.com`) ;
--   - jamais une URL égale à une `url_production` du catalogue.
--   Un domaine Preview personnalisé n'est PAS accepté : l'autoriser est une décision
--   propriétaire qui passe par une migration modifiant cette liste (DECISION_REQUIRED
--   documentée dans ELSATIA_SATELLITES_PREVIEW_READINESS_V2).
-- Chaque modification effective est journalisée dans `historique_mutations_plateforme`
-- (domaine multi_app, action url_preview_modifiee, ancien/nouveau). Rejouer la même valeur
-- n'écrit rien.

create or replace function public.plateforme_definir_url_preview_application(p_code text, p_url text)
returns text
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_ancienne text;
  v_url text;
begin
  perform public.plateforme_exiger_session_aal2();
  if not public.est_plateforme_proprietaire() then
    raise exception 'Modification réservée au propriétaire de la plateforme ELSATIA' using errcode = '42501';
  end if;

  select a.url_preview into v_ancienne
  from public.applications_elsatia a
  where a.code = p_code
  for update;
  if not found then
    raise exception 'Application inconnue' using errcode = 'P0002';
  end if;

  v_url := nullif(lower(btrim(coalesce(p_url, ''))), '');
  if v_url is not null then
    v_url := regexp_replace(v_url, '/$', '');
    if v_url !~ '^https://[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$' then
      raise exception 'URL Preview refusée : origine https://<projet>.vercel.app attendue, sans chemin, requête, port ni identifiants'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from public.applications_elsatia a
      where a.url_production is not null and lower(regexp_replace(btrim(a.url_production), '/$', '')) = v_url
    ) then
      raise exception 'URL Preview refusée : c''est une URL de Production' using errcode = '22023';
    end if;
  end if;

  if v_ancienne is not distinct from v_url then
    return v_url;
  end if;

  update public.applications_elsatia
     set url_preview = v_url, updated_at = now()
   where code = p_code;

  insert into public.historique_mutations_plateforme (
    domaine, action, entreprise_id, objet_type, objet_id, auteur_utilisateur_id, ancien, nouveau
  ) values (
    'multi_app', 'url_preview_modifiee', null, 'application', null, auth.uid(),
    jsonb_build_object('application_code', p_code, 'url_preview', v_ancienne),
    jsonb_build_object('application_code', p_code, 'url_preview', v_url)
  );
  return v_url;
end;
$function$;

revoke all on function public.plateforme_definir_url_preview_application(text, text) from public;
revoke all on function public.plateforme_definir_url_preview_application(text, text) from anon;
revoke all on function public.plateforme_definir_url_preview_application(text, text) from service_role;
grant execute on function public.plateforme_definir_url_preview_application(text, text) to authenticated;

comment on function public.plateforme_definir_url_preview_application(text, text) is
  'A-11 : définit url_preview d''une application du catalogue. Propriétaire plateforme + AAL2 ; origine https://<projet>.vercel.app stricte ; jamais une URL de Production ; journalisé (historique_mutations_plateforme).';
