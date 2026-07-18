-- Distingue les dépenses sans chantier de celles engagées au dépôt ou au
-- bureau, sans créer de faux chantiers dans les données métier.

alter table public.notes_frais
  add column if not exists lieu_hors_chantier text;

update public.notes_frais
set lieu_hors_chantier = 'sans_chantier'
where chantier_id is null
  and lieu_hors_chantier is null;

update public.notes_frais
set lieu_hors_chantier = null
where chantier_id is not null
  and lieu_hors_chantier is not null;

alter table public.notes_frais
  drop constraint if exists notes_frais_affectation_coherente_check;

alter table public.notes_frais
  add constraint notes_frais_affectation_coherente_check
  check (
    (chantier_id is not null and lieu_hors_chantier is null)
    or
    (chantier_id is null and lieu_hors_chantier in ('sans_chantier', 'depot', 'bureau'))
  );

create index if not exists notes_frais_lieu_hors_chantier_idx
  on public.notes_frais(entreprise_id, lieu_hors_chantier, date_frais desc)
  where chantier_id is null;

comment on column public.notes_frais.lieu_hors_chantier is
  'Lieu d affectation lorsque la dépense n est pas rattachée à un chantier : sans_chantier, depot ou bureau.';

-- L'application crée un brouillon avec `insert ... returning id`. La policy
-- SELECT historique appelle une fonction STABLE qui ne voit pas encore la
-- nouvelle ligne pendant cette instruction. Cette lecture directe est limitée
-- au créateur, à sa propre fiche employé et au droit de saisie.
drop policy if exists notes_frais_createur_lecture on public.notes_frais;

create policy notes_frais_createur_lecture
on public.notes_frais
for select
to authenticated
using (
  public.est_membre_actif(entreprise_id)
  and public.a_permission(entreprise_id, 'saisir_ses_notes_frais')
  and cree_par_utilisateur_id = auth.uid()
  and public.est_employe_du_compte(entreprise_id, employe_id)
);

notify pgrst, 'reload schema';
