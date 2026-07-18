-- Autorise le créateur à relire immédiatement la conversation qu'il vient
-- d'insérer. Cette policy est nécessaire pour le `insert ... returning id`
-- utilisé par l'application : la policy historique passe par une fonction
-- STABLE qui ne voit pas encore la ligne créée dans la même instruction.
--
-- La portée reste strictement limitée au membre actif de l'entreprise et à
-- la fiche employé reliée au compte connecté.

drop policy if exists conversations_createur_lecture on public.conversations_internes;

create policy conversations_createur_lecture
on public.conversations_internes
for select
to authenticated
using (
  public.est_membre_actif(entreprise_id)
  and cree_par_employe_id = public.employe_courant(entreprise_id)
);

notify pgrst, 'reload schema';
