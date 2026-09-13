-- ELSATIA GP V1 — presse-papier de lignes : références catalogue et ouvrages de la MÊME entreprise.
--
-- L'enregistrement v2 (`enregistrer_devis_brouillon_v2`) recopie `source_id` / `source_catalogue` et
-- `ouvrage_id` tels que fournis par le client. Une ligne de devis reste un instantané (désignation,
-- prix, références figés) : une référence vers un article ou un ouvrage d'une AUTRE entreprise ne
-- fuite aucune donnée (RLS), mais n'a aucun sens métier et pourrait être forgée (presse-papier
-- inter-entreprises, appel direct de la RPC). La base devient l'autorité : deux déclencheurs BEFORE
-- refusent toute référence qui n'appartient pas à l'entreprise du document. Les références nulles
-- (lignes libres, structure) restent libres. Idempotent.

create or replace function public.verifier_source_ligne_devis_meme_entreprise()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entreprise uuid;
begin
  if new.source_id is null then
    return new;
  end if;
  select d.entreprise_id into v_entreprise from public.devis d where d.id = new.devis_id;
  if v_entreprise is null then
    return new; -- le devis absent est refusé par la clé étrangère, pas ici
  end if;
  if new.source_catalogue = 'article' then
    if not exists (select 1 from public.articles_stock a where a.id = new.source_id and a.entreprise_id = v_entreprise) then
      raise exception 'Référence d''article étrangère à l''entreprise du devis.' using errcode = '23514';
    end if;
  elsif not exists (select 1 from public.prestations_catalogue p where p.id = new.source_id and p.entreprise_id = v_entreprise) then
    raise exception 'Référence de prestation étrangère à l''entreprise du devis.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists lignes_devis_source_meme_entreprise on public.lignes_devis;
create trigger lignes_devis_source_meme_entreprise
  before insert or update of source_id, source_catalogue on public.lignes_devis
  for each row execute function public.verifier_source_ligne_devis_meme_entreprise();

create or replace function public.verifier_ouvrage_devis_meme_entreprise()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ouvrage_id is null then
    return new;
  end if;
  if not exists (select 1 from public.ouvrages o where o.id = new.ouvrage_id and o.entreprise_id = new.entreprise_id) then
    raise exception 'Ouvrage étranger à l''entreprise du devis.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists devis_ouvrages_ouvrage_meme_entreprise on public.devis_ouvrages;
create trigger devis_ouvrages_ouvrage_meme_entreprise
  before insert or update of ouvrage_id, entreprise_id on public.devis_ouvrages
  for each row execute function public.verifier_ouvrage_devis_meme_entreprise();
