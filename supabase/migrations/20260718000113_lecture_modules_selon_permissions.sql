-- Défense en profondeur : les droits de consultation sont imposés par Postgres.
-- Une policy RESTRICTIVE doit être satisfaite même si une ancienne policy membre,
-- plus permissive, existe encore sur la table.

drop policy if exists lecture_clients_selon_permission on public.clients;
create policy lecture_clients_selon_permission on public.clients
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_clients'));

drop policy if exists lecture_contacts_selon_permission on public.contacts_clients;
create policy lecture_contacts_selon_permission on public.contacts_clients
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = contacts_clients.client_id
      and public.a_permission(c.entreprise_id, 'acces_clients')
  ));

-- Le périmètre chantier est global ou limité aux affectations selon le poste.
-- Une ancienne affectation de planning ne doit pas ouvrir le chantier à vie :
-- seuls l'équipe active et le planning du jour donnent un accès terrain.
create or replace function public.peut_consulter_chantier(p_entreprise_id uuid,p_chantier_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select auth.role()='anon'
    or (
      public.est_membre_actif(p_entreprise_id)
      and (
        public.a_permission(p_entreprise_id,'acces_chantiers')
        or public.a_permission(p_entreprise_id,'gerer_chantiers')
        or (
          public.a_permission(p_entreprise_id,'voir_chantiers_assignes')
          and exists(
            select 1 from public.employes e
            where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid()
              and e.statut not in ('sorti','suspendu')
              and (
                exists(
                  select 1 from public.equipes_chantiers ec
                  where ec.entreprise_id=p_entreprise_id and ec.chantier_id=p_chantier_id
                    and ec.employe_id=e.id and ec.date_debut<=current_date
                    and (ec.date_fin is null or ec.date_fin>=current_date)
                )
                or exists(
                  select 1 from public.affectations a
                  where a.entreprise_id=p_entreprise_id and a.chantier_id=p_chantier_id
                    and a.employe_id=e.id and a.date=current_date
                )
              )
          )
        )
      )
    );
$$;
revoke all on function public.peut_consulter_chantier(uuid,uuid) from public,anon;
grant execute on function public.peut_consulter_chantier(uuid,uuid) to authenticated;

drop policy if exists lecture_chantiers_selon_permission on public.chantiers;
create policy lecture_chantiers_selon_permission on public.chantiers
  as restrictive for select to authenticated
  using (public.peut_consulter_chantier(entreprise_id, id));

drop policy if exists lecture_taches_selon_permission on public.taches;
create policy lecture_taches_selon_permission on public.taches
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.chantiers c
    where c.id = taches.chantier_id
      and public.peut_consulter_chantier(c.entreprise_id, c.id)
  ));

drop policy if exists lecture_devis_selon_permission on public.devis;
create policy lecture_devis_selon_permission on public.devis
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_devis'));

drop policy if exists lecture_lignes_devis_selon_permission on public.lignes_devis;
create policy lecture_lignes_devis_selon_permission on public.lignes_devis
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.devis d
    where d.id = lignes_devis.devis_id
      and public.a_permission(d.entreprise_id, 'acces_devis')
  ));

drop policy if exists lecture_prestations_selon_permission on public.prestations_catalogue;
create policy lecture_prestations_selon_permission on public.prestations_catalogue
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_devis'));

drop policy if exists lecture_factures_selon_permission on public.factures;
create policy lecture_factures_selon_permission on public.factures
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_factures'));

drop policy if exists lecture_lignes_factures_selon_permission on public.lignes_factures;
create policy lecture_lignes_factures_selon_permission on public.lignes_factures
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.factures f
    where f.id = lignes_factures.facture_id
      and public.a_permission(f.entreprise_id, 'acces_factures')
  ));

drop policy if exists lecture_paiements_selon_permission on public.paiements;
create policy lecture_paiements_selon_permission on public.paiements
  as restrictive for select to authenticated
  using (exists (
    select 1 from public.factures f
    where f.id = paiements.facture_id
      and public.a_permission(f.entreprise_id, 'acces_factures')
  ));

do $$
declare r record;
begin
  for r in select * from (values
    ('fournisseurs'),
    ('commandes_fournisseurs'),
    ('lignes_commande'),
    ('depenses_fournisseurs'),
    ('reglements_fournisseurs'),
    ('charges_recurrentes')
  ) as x(table_name)
  loop
    if to_regclass('public.' || r.table_name) is null then continue; end if;
    execute format('drop policy if exists lecture_achats_selon_permission on public.%I', r.table_name);
    execute format(
      'create policy lecture_achats_selon_permission on public.%I as restrictive for select to authenticated using (public.a_permission(entreprise_id, %L))',
      r.table_name, 'acces_achats'
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
