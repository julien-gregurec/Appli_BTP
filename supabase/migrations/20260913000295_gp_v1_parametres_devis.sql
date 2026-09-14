-- GP V1 — réglages de devis par entreprise (Paramètres > Devis) : valeurs par défaut des nouveaux devis et
-- rappel de sauvegarde configurable (demandes de Julien, validation utilisateur 2026-09-13).
--
-- * validite_jours : durée de validité par défaut (date de validité = émission + N jours) ;
-- * conditions_defaut, mode_reglement_defaut, conditions_paiement_defaut : textes repris dans un nouveau devis ;
-- * unite_defaut, taux_tva_defaut : valeurs des nouvelles lignes ;
-- * rappel_sauvegarde_actif / rappel_sauvegarde_minutes : rappel « Sauvegarder le devis ? » pendant l'édition,
--   distinct de l'autosauvegarde technique (qui reste inchangée) ; 10 minutes recommandées.
-- Absence de ligne = valeurs historiques (30 jours, aucun texte, « u », 20 %, rappel 10 min actif).

create table if not exists public.parametres_devis (
  entreprise_id              uuid primary key references public.entreprises (id) on delete cascade,
  validite_jours             integer not null default 30 check (validite_jours between 1 and 365),
  conditions_defaut          text check (coalesce(length(conditions_defaut), 0) <= 4000),
  mode_reglement_defaut      text check (coalesce(length(mode_reglement_defaut), 0) <= 60),
  conditions_paiement_defaut text check (coalesce(length(conditions_paiement_defaut), 0) <= 500),
  unite_defaut               text not null default 'u' check (length(btrim(unite_defaut)) between 1 and 20),
  taux_tva_defaut            numeric(5,2) not null default 20 check (taux_tva_defaut between 0 and 100),
  rappel_sauvegarde_actif    boolean not null default true,
  rappel_sauvegarde_minutes  integer not null default 10 check (rappel_sauvegarde_minutes between 1 and 240),
  maj_le                     timestamptz not null default now(),
  maj_par                    uuid default auth.uid()
);
comment on table public.parametres_devis is 'Réglages de devis par entreprise : défauts des nouveaux devis, rappel de sauvegarde. Absent = valeurs historiques.';

alter table public.parametres_devis enable row level security;
drop policy if exists parametres_devis_lecture on public.parametres_devis;
create policy parametres_devis_lecture on public.parametres_devis for select to authenticated using (public.est_membre_actif(entreprise_id));
drop policy if exists parametres_devis_ecriture on public.parametres_devis;
create policy parametres_devis_ecriture on public.parametres_devis for all to authenticated
  using (public.a_permission(entreprise_id, 'gerer_parametres')) with check (public.a_permission(entreprise_id, 'gerer_parametres'));
grant select, insert, update, delete on public.parametres_devis to authenticated;
revoke all on public.parametres_devis from anon;
