-- Catalogue enrichi, nuanciers, codes-barres et import atomique catalogue/inventaire.
alter table public.articles_stock add column if not exists marque text;
alter table public.articles_stock add column if not exists code_barres text;
create unique index if not exists articles_stock_code_barres_unique on public.articles_stock(entreprise_id,code_barres) where code_barres is not null;

create table public.article_teintes(
 id uuid primary key default gen_random_uuid(),entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 article_id uuid not null,nom text not null,reference text,code_hex text,actif boolean not null default true,created_at timestamptz not null default now(),
 unique(article_id,nom),foreign key(article_id,entreprise_id) references public.articles_stock(id,entreprise_id) on delete cascade,
 check(code_hex is null or code_hex ~ '^#[0-9A-Fa-f]{6}$')
);
alter table public.mouvements_stock add column if not exists teinte_id uuid;
alter table public.mouvements_stock add constraint mouvements_stock_teinte_fk foreign key(teinte_id) references public.article_teintes(id) on delete set null;

create or replace function public.verifier_teinte_mouvement() returns trigger language plpgsql set search_path=public as $$
begin if new.teinte_id is not null and not exists(select 1 from public.article_teintes where id=new.teinte_id and article_id=new.article_id and entreprise_id=new.entreprise_id and actif) then raise exception 'Teinte incompatible avec l’article';end if;return new;end;$$;
create trigger verifier_teinte_mouvement before insert or update of teinte_id,article_id,entreprise_id on public.mouvements_stock for each row execute function public.verifier_teinte_mouvement();

alter table public.article_teintes enable row level security;
create policy article_teintes_membres on public.article_teintes for all to authenticated using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy article_teintes_prototype on public.article_teintes for all to anon using(true) with check(true);
grant select,insert,update,delete on public.article_teintes to anon,authenticated;

create or replace function public.importer_articles_stock(p_entreprise_id uuid,p_type text,p_lignes jsonb)
returns int language plpgsql security definer set search_path=public as $$
declare r record;v_article public.articles_stock;v_nb int:=0;v_souhaite numeric;v_delta numeric;
begin
 if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if p_type not in('catalogue','inventaire') then raise exception 'Type d’import invalide';end if;
 if jsonb_typeof(p_lignes)<>'array' or jsonb_array_length(p_lignes)=0 or jsonb_array_length(p_lignes)>5000 then raise exception 'L’import doit contenir entre 1 et 5000 lignes';end if;
 for r in select * from jsonb_to_recordset(p_lignes) as x(reference text,designation text,unite text,prix_achat_ht numeric,seuil_alerte numeric,quantite numeric,emplacement text,marque text,code_barres text,teinte text,teinte_reference text,code_hex text) loop
  if nullif(trim(r.reference),'') is null or nullif(trim(r.designation),'') is null then raise exception 'Référence et désignation obligatoires à chaque ligne';end if;
  insert into public.articles_stock(entreprise_id,reference,designation,unite,prix_achat_ht,seuil_alerte,emplacement,marque,code_barres)
  values(p_entreprise_id,trim(r.reference),trim(r.designation),coalesce(nullif(trim(r.unite),''),'u'),greatest(coalesce(r.prix_achat_ht,0),0),greatest(coalesce(r.seuil_alerte,0),0),nullif(trim(r.emplacement),''),nullif(trim(r.marque),''),nullif(trim(r.code_barres),''))
  on conflict(entreprise_id,reference) do update set designation=excluded.designation,unite=excluded.unite,prix_achat_ht=excluded.prix_achat_ht,seuil_alerte=excluded.seuil_alerte,emplacement=coalesce(excluded.emplacement,public.articles_stock.emplacement),marque=coalesce(excluded.marque,public.articles_stock.marque),code_barres=coalesce(excluded.code_barres,public.articles_stock.code_barres),actif=true,updated_at=now()
  returning * into v_article;
  if nullif(trim(r.teinte),'') is not null then insert into public.article_teintes(entreprise_id,article_id,nom,reference,code_hex) values(p_entreprise_id,v_article.id,trim(r.teinte),nullif(trim(r.teinte_reference),''),case when r.code_hex~'^#[0-9A-Fa-f]{6}$' then upper(r.code_hex) else null end) on conflict(article_id,nom) do update set reference=coalesce(excluded.reference,public.article_teintes.reference),code_hex=coalesce(excluded.code_hex,public.article_teintes.code_hex),actif=true;end if;
  if p_type='inventaire' and r.quantite is not null then v_souhaite:=greatest(r.quantite,0);v_delta:=v_souhaite-v_article.quantite_stock;if v_delta<>0 then insert into public.mouvements_stock(entreprise_id,article_id,type,quantite,date,motif) values(p_entreprise_id,v_article.id,case when v_delta>0 then 'ajustement_plus' else 'ajustement_moins' end,abs(v_delta),current_date,'Import inventaire');end if;end if;
  v_nb:=v_nb+1;
 end loop;return v_nb;
end;$$;
revoke all on function public.importer_articles_stock(uuid,text,jsonb) from public;
grant execute on function public.importer_articles_stock(uuid,text,jsonb) to anon,authenticated;
revoke all on function public.verifier_teinte_mouvement() from public,anon,authenticated;
notify pgrst,'reload schema';
