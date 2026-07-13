-- Réglages rares de mise en page des devis, factures et commandes.
alter table public.entreprises
  add column if not exists police_documents text not null default 'arial',
  add column if not exists taille_police_documents integer not null default 13,
  add column if not exists logo_largeur_documents integer not null default 105,
  add column if not exists couleur_documents text not null default '#0d1b2a',
  add column if not exists mise_en_page_documents text not null default 'classique';
alter table public.entreprises drop constraint if exists entreprises_police_documents_check;
alter table public.entreprises add constraint entreprises_police_documents_check check(police_documents in ('arial','georgia','trebuchet','verdana'));
alter table public.entreprises drop constraint if exists entreprises_taille_police_documents_check;
alter table public.entreprises add constraint entreprises_taille_police_documents_check check(taille_police_documents between 10 and 16);
alter table public.entreprises drop constraint if exists entreprises_logo_largeur_documents_check;
alter table public.entreprises add constraint entreprises_logo_largeur_documents_check check(logo_largeur_documents between 60 and 180);
alter table public.entreprises drop constraint if exists entreprises_couleur_documents_check;
alter table public.entreprises add constraint entreprises_couleur_documents_check check(couleur_documents ~ '^#[0-9A-Fa-f]{6}$');
alter table public.entreprises drop constraint if exists entreprises_mise_en_page_documents_check;
alter table public.entreprises add constraint entreprises_mise_en_page_documents_check check(mise_en_page_documents in ('classique','compacte','epuree'));
notify pgrst,'reload schema';
