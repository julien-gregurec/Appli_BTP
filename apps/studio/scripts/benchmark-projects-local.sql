-- Synthetic local-only benchmark. Everything is rolled back, including identity fixtures.
begin;
insert into auth.users(id,email) values('55000000-0000-0000-0000-000000000001','benchmark-projects@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select set_config('test.bench.ws',public.studio_create_workspace('Benchmark Projects','personal')::text,true);
do $$ begin for i in 1..100 loop
 perform public.studio_create_project(current_setting('test.bench.ws')::uuid,'Projet '||lpad(i::text,3,'0'),'travel');
end loop; end $$;
reset role;
insert into public.studio_media_assets(workspace_id,project_id,uploaded_by,request_id,storage_key,original_filename,mime_type,media_type,file_size_bytes,upload_status,width,height)
select p.workspace_id,p.id,p.created_by,gen_random_uuid(),'studio/benchmark/'||gen_random_uuid()||'/original.jpg','fixture.jpg','image/jpeg','image',1000,'ready',10,10
from public.studio_projects p cross join generate_series(1,5) n where p.workspace_id=current_setting('test.bench.ws')::uuid;
set local role authenticated;
explain(analyze,buffers,format json) select public.studio_project_summaries(current_setting('test.bench.ws')::uuid,'','travel','active',null,'updated',0);
explain(analyze,buffers,format json) select public.studio_dashboard_stats(current_setting('test.bench.ws')::uuid);
rollback;
