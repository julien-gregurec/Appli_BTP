-- Rollback of 20260920050000_studio_brand_kit. A saved kit is user data and is never destroyed.
begin;
do $$begin
 if exists(select 1 from public.studio_brand_kits) then
  raise exception 'Brand kits exist; rollback refused to preserve them';
 end if;
end$$;
drop function public.studio_attach_brand_logo(uuid);
drop function public.studio_list_brand_logo_candidates(uuid);
drop function public.studio_save_brand_kit(uuid,jsonb,integer);
drop function public.studio_get_brand_kit(uuid);
drop function public.studio_brand_kit_json(public.studio_brand_kits);
drop function public.studio_brand_text(text,integer,text);
drop trigger studio_brand_logo_guard on public.studio_media_assets;
drop function public.studio_brand_logo_guard();
drop table public.studio_brand_kits;
delete from supabase_migrations.schema_migrations where version='20260920050000';
commit;
