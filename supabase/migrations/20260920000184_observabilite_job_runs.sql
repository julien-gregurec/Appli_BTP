-- Traçabilité des jobs planifiés (crons Vercel). Absente jusqu'ici : un job qui
-- échoue silencieusement ou ne s'exécute plus n'était visible que dans le corps
-- JSON de la réponse HTTP, jamais persisté. Table réservée au rôle de service
-- (aucun accès anon/authenticated), au même titre que stripe_webhook_events.
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (char_length(job_name) between 1 and 120),
  request_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'succes', 'echec_partiel', 'echec')),
  duree_ms integer,
  resume jsonb,
  erreur text
);

create index if not exists job_runs_job_name_started_idx
  on public.job_runs (job_name, started_at desc);

alter table public.job_runs enable row level security;

revoke all on public.job_runs from public, anon, authenticated;

comment on table public.job_runs is
  'Historique d''exécution des jobs planifiés (crons). Écriture/lecture réservées au rôle de service (route API + tooling d''exploitation).';

notify pgrst, 'reload schema';
