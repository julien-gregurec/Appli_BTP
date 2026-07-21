-- Journalisation des appels IA (fournisseur OpenAI) : succès/erreurs, et base pour
-- un plafond de consommation quotidien par entreprise.

create table public.journal_ia (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  fonctionnalite text not null,
  statut text not null default 'succes' check (statut in ('succes', 'erreur')),
  message_erreur text,
  created_at timestamptz not null default now()
);

create index journal_ia_quota_idx on public.journal_ia(entreprise_id, created_at desc);

alter table public.journal_ia enable row level security;

create policy journal_ia_membres on public.journal_ia
  for all to authenticated
  using (public.est_membre_actif(entreprise_id))
  with check (public.est_membre_actif(entreprise_id));

grant select, insert on public.journal_ia to authenticated;
