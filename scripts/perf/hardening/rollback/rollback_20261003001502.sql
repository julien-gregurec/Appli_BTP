-- Retour arrière de 20261003001502_relances_auto_candidats_eligibles_v1 (revenir d'abord au code applicatif précédent).
begin;
-- Corps V9.1 (20261002001301, section A2) :
create or replace function public.relances_auto_candidats_service(
  p_entreprise_id uuid,
  p_type_document text,
  p_limite integer default 200
)
returns table(id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := greatest(0, least(coalesce(p_limite, 200), 200));
begin
  if p_type_document = 'devis' then
    return query
      select d.id from public.devis d
      where d.entreprise_id = p_entreprise_id
        and d.statut = 'envoye'
        and d.relance_auto_exclue = false
      limit v_limite;
  elsif p_type_document = 'facture' then
    return query
      select f.id from public.factures f
      where f.entreprise_id = p_entreprise_id
        and f.statut in ('envoyee', 'en_retard', 'payee_partiel')
        and f.relance_auto_exclue = false
      limit v_limite;
  else
    raise exception 'Type de document de relance invalide' using errcode = '22023';
  end if;
end;
$$;

drop function if exists public.relances_auto_candidats_selection(uuid, text, integer);
drop index if exists public.relances_documents_document_statut_idx;
revoke all on function public.relances_auto_candidats_service(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.relances_auto_candidats_service(uuid, text, integer) to service_role;
notify pgrst, 'reload schema';
commit;
