-- Décision réparation/rebut pour l’outillage et détail des travaux sur véhicules.
alter table public.outils add column if not exists reparation_requise_at timestamptz,add column if not exists rebut_at timestamptz,add column if not exists motif_rebut text;
alter table public.outils drop constraint if exists outils_statut_check;
alter table public.outils add constraint outils_statut_check check(statut in ('disponible','affecte','maintenance','hors_service','perdu','rebut'));
alter table public.mouvements_outillage drop constraint if exists mouvements_outillage_type_check;
alter table public.mouvements_outillage add constraint mouvements_outillage_type_check check(type in ('affectation','retour','maintenance','remise_service','hors_service','perte','rebut'));
create or replace function public.mettre_outil_rebut(p_entreprise_id uuid,p_outil_id uuid,p_motif text) returns void language plpgsql security definer set search_path=public as $$
declare o public.outils;begin
 if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_outillage') then raise exception 'Accès refusé';end if;
 if nullif(btrim(p_motif),'') is null then raise exception 'Le motif de mise au rebut est obligatoire';end if;
 select * into o from public.outils where id=p_outil_id and entreprise_id=p_entreprise_id for update;if not found then raise exception 'Outil introuvable';end if;
 if o.statut not in ('hors_service','maintenance') then raise exception 'Seul un outil hors service ou en réparation peut être mis au rebut';end if;
 update public.outils set statut='rebut',etat='hors_service',employe_id=null,chantier_id=null,rebut_at=now(),motif_rebut=btrim(p_motif),updated_at=now() where id=o.id;
 insert into public.mouvements_outillage(entreprise_id,outil_id,type,statut_avant,statut_apres,etat,note) values(p_entreprise_id,o.id,'rebut',o.statut,'rebut','hors_service',btrim(p_motif));
end;$$;
create or replace function public.trg_alerte_outil_hors_service() returns trigger language plpgsql set search_path=public as $$begin if new.statut='hors_service' and old.statut is distinct from 'hors_service' then new.reparation_requise_at:=now();end if;if new.statut='disponible' then new.reparation_requise_at:=null;end if;return new;end;$$;
drop trigger if exists alerte_outil_hors_service on public.outils;create trigger alerte_outil_hors_service before update of statut on public.outils for each row execute function public.trg_alerte_outil_hors_service();
alter table public.depenses_fournisseurs add column if not exists travaux_effectues text;
revoke all on function public.mettre_outil_rebut(uuid,uuid,text) from public;grant execute on function public.mettre_outil_rebut(uuid,uuid,text) to anon,authenticated;
revoke all on function public.trg_alerte_outil_hors_service() from public,anon,authenticated;
notify pgrst,'reload schema';
