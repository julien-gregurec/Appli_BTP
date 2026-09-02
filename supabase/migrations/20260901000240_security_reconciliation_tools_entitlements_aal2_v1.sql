-- SECURITY RECONCILIATION V1
-- Les RPC d'entitlements Tools ont été ajoutées après le durcissement plateforme
-- 00236-00247. Leur logique métier historique est conservée derrière deux helpers
-- internes ; seule la surface publique canonique impose rôle explicite puis AAL2.

alter function public.plateforme_attribuer_entitlement_utilisateur(
  uuid,text,text,text[],text,integer,timestamptz,timestamptz,text
) rename to tools_attribuer_entitlement_utilisateur_interne;

alter function public.plateforme_revoquer_entitlement_utilisateur(uuid,text)
  rename to tools_revoquer_entitlement_utilisateur_interne;

revoke all on function public.tools_attribuer_entitlement_utilisateur_interne(
  uuid,text,text,text[],text,integer,timestamptz,timestamptz,text
) from public, anon, authenticated, service_role;
revoke all on function public.tools_revoquer_entitlement_utilisateur_interne(uuid,text)
  from public, anon, authenticated, service_role;

create function public.plateforme_attribuer_entitlement_utilisateur(
  p_utilisateur_id uuid,
  p_application_code text,
  p_niveau text,
  p_capabilities text[],
  p_source text,
  p_priorite integer default 0,
  p_valide_du timestamptz default now(),
  p_expire_le timestamptz default null,
  p_reference_externe text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  return public.tools_attribuer_entitlement_utilisateur_interne(
    p_utilisateur_id,
    p_application_code,
    p_niveau,
    p_capabilities,
    p_source,
    p_priorite,
    p_valide_du,
    p_expire_le,
    p_reference_externe
  );
end;
$$;

create function public.plateforme_revoquer_entitlement_utilisateur(
  p_entitlement_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  perform public.tools_revoquer_entitlement_utilisateur_interne(
    p_entitlement_id,
    p_reason
  );
end;
$$;

revoke all on function public.plateforme_attribuer_entitlement_utilisateur(
  uuid,text,text,text[],text,integer,timestamptz,timestamptz,text
) from public, anon;
revoke all on function public.plateforme_revoquer_entitlement_utilisateur(uuid,text)
  from public, anon;
grant execute on function public.plateforme_attribuer_entitlement_utilisateur(
  uuid,text,text,text[],text,integer,timestamptz,timestamptz,text
) to authenticated;
grant execute on function public.plateforme_revoquer_entitlement_utilisateur(uuid,text)
  to authenticated;
