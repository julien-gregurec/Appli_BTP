-- Phase 1 commercialisation :
-- restaure les privilèges métier retirés lors du durcissement global des
-- fonctions et tables. Chaque opération reste obligatoirement filtrée par les
-- policies RLS existantes ; aucun accès n'est accordé au rôle anon.

grant select, insert, update, delete
  on table public.devis, public.factures
  to authenticated;

grant select
  on table public.articles_stock
  to authenticated;

grant update
  on table public.commandes_fournisseurs
  to authenticated;

grant delete, update
  on table public.mouvements_stock
  to authenticated;

revoke all
  on table
    public.devis,
    public.factures,
    public.articles_stock,
    public.commandes_fournisseurs,
    public.mouvements_stock
  from anon;

notify pgrst, 'reload schema';
