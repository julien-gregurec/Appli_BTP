-- ELSATIA — harnais d'upgrade — profil ACL « supabase » (défaut) : privilèges par défaut d'un VRAI projet
-- Supabase, absents de scripts/local-postgres-bootstrap/pg_bootstrap.sql (qui n'accorde que service_role).
-- Sur un projet hébergé, le socle accorde tout objet créé par postgres dans public à anon, authenticated et
-- service_role ; les migrations ELSATIA RESTREIGNENT ensuite (20260714000078 : anon ; 20260729000185 ;
-- 20260902000255 : 1 220 révocations objet par objet + 14 défauts, calculées sur un dump Production réel).
-- Sans ce profil, la Production reconstruite serait PLUS fermée que la vraie et l'upgrade de ses ACL ne
-- serait pas réellement exercé (docs/audits/elsatia-acl-reconciliation-v1.md : 854 ACL excédentaires réelles).
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
