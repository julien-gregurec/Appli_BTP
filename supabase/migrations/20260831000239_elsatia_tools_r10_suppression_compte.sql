-- R10 : initiation in-app de la suppression du compte ELSATIA commun.
create table public.tools_demandes_suppression_compte (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  statut text not null default 'pending' check(statut in ('pending','processing','completed','cancelled')),
  origine text not null default 'tools' check(origine='tools'),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object')
);
create unique index tools_suppression_compte_pending_unique on public.tools_demandes_suppression_compte(utilisateur_id) where statut in ('pending','processing');
alter table public.tools_demandes_suppression_compte enable row level security;
create policy tools_suppression_compte_lecture on public.tools_demandes_suppression_compte for select to authenticated using(utilisateur_id=auth.uid() or public.est_plateforme_admin());
grant select on public.tools_demandes_suppression_compte to authenticated;

create or replace function public.tools_demander_suppression_compte()
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  select id into v_id from public.tools_demandes_suppression_compte where utilisateur_id=auth.uid() and statut in ('pending','processing') order by requested_at desc limit 1;
  if v_id is null then
    insert into public.tools_demandes_suppression_compte(utilisateur_id,metadata)
    values(auth.uid(),jsonb_build_object('application','tools')) returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.tools_demander_suppression_compte() from public,anon;
grant execute on function public.tools_demander_suppression_compte() to authenticated;
notify pgrst,'reload schema';
