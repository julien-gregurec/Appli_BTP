-- Fige le prix d'achat au démarrage de l'inventaire pour produire une valorisation historique fiable.
alter table public.lignes_inventaire
  add column if not exists prix_achat_ht_snapshot numeric(12,2);

update public.lignes_inventaire l
set prix_achat_ht_snapshot = coalesce(a.prix_achat_ht, 0)
from public.articles_stock a
where a.id = l.article_id
  and a.entreprise_id = l.entreprise_id
  and l.prix_achat_ht_snapshot is null;

alter table public.lignes_inventaire
  alter column prix_achat_ht_snapshot set default 0,
  alter column prix_achat_ht_snapshot set not null;

alter table public.lignes_inventaire
  drop constraint if exists lignes_inventaire_prix_achat_snapshot_check;
alter table public.lignes_inventaire
  add constraint lignes_inventaire_prix_achat_snapshot_check
  check (prix_achat_ht_snapshot >= 0);

create or replace function public.trg_figer_prix_achat_inventaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(a.prix_achat_ht, 0)
  into new.prix_achat_ht_snapshot
  from public.articles_stock a
  where a.id = new.article_id
    and a.entreprise_id = new.entreprise_id;

  if not found then
    raise exception 'Article de stock introuvable';
  end if;
  return new;
end;
$$;

drop trigger if exists lignes_inventaire_figer_prix_achat on public.lignes_inventaire;
create trigger lignes_inventaire_figer_prix_achat
before insert on public.lignes_inventaire
for each row execute function public.trg_figer_prix_achat_inventaire();

revoke all on function public.trg_figer_prix_achat_inventaire() from public, anon, authenticated;
notify pgrst, 'reload schema';
