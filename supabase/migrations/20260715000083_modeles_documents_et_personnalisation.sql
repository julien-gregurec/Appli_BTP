-- Modèles visuels supplémentaires pour devis, factures et commandes.
alter table public.entreprises
  add column if not exists couleur_secondaire_documents text not null default '#c9a24a',
  add column if not exists position_logo_documents text not null default 'gauche',
  add column if not exists afficher_logo_documents boolean not null default true,
  add column if not exists afficher_descriptions_documents boolean not null default true,
  add column if not exists afficher_tva_lignes_documents boolean not null default true;

alter table public.entreprises drop constraint if exists entreprises_mise_en_page_documents_check;
alter table public.entreprises add constraint entreprises_mise_en_page_documents_check
  check (mise_en_page_documents in ('classique','compacte','epuree','moderne','elegante','technique'));

alter table public.entreprises drop constraint if exists entreprises_couleur_secondaire_documents_check;
alter table public.entreprises add constraint entreprises_couleur_secondaire_documents_check
  check (couleur_secondaire_documents ~ '^#[0-9A-Fa-f]{6}$');

alter table public.entreprises drop constraint if exists entreprises_position_logo_documents_check;
alter table public.entreprises add constraint entreprises_position_logo_documents_check
  check (position_logo_documents in ('gauche','centre','droite'));

notify pgrst, 'reload schema';
