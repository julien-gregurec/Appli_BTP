-- Train canonique V9 — données de l'ère V8 (+ 813) avant upgrade V8 → V9
-- (scripts/qualification/upgrade-v8-v9.sh). Base historisée jetable uniquement.
--   * entreprise créée PAR LA PLATEFORME, sans aucun membre, avec ses postes et permissions
--     (cas exact du résiduel de sécurité 1001) ;
--   * contrat Pro MENSUEL en cours au prix d'une grille antérieure (P1 : aucun repricing par
--     la migration 1002, prix historique conservé à offre et périodicité inchangées).
begin;
insert into public.entreprises (id, nom, raison_sociale, abonnement_statut, abonnement_note, code_adhesion)
values ('e9000000-0000-4000-8000-0000000000e9', 'UPG9 plateforme sans membre', 'UPG9 plateforme sans membre', 'essai', 'Créée par la plateforme', 'UPG9VIDE')
on conflict (id) do nothing;
do $$ declare r record; begin
  if not exists (select 1 from public.postes where entreprise_id = 'e9000000-0000-4000-8000-0000000000e9') then
    for r in select cle from public.modeles_roles_predefinis order by ordre loop
      perform public.appliquer_modele_role_predefini_interne('e9000000-0000-4000-8000-0000000000e9', r.cle, true);
    end loop;
  end if;
end $$;

insert into public.entreprises (id, nom, raison_sociale, code_adhesion, stripe_customer_id, stripe_subscription_id, abonnement_statut, abonnement_offre, abonnement_periodicite)
values ('e9000000-0000-4000-8000-0000000000a1', 'UPG9 Pro mensuel', 'UPG9 Pro mensuel', 'UPG9PROM', 'cus_upg9', 'sub_upg9', 'actif', 'pro', 'mensuel')
on conflict (id) do nothing;
insert into public.abonnements_entreprises (entreprise_id, plan_id, code_offre, version_tarif, periodicite, prix_contractuel_ht, statut, stripe_subscription_id, stripe_customer_id)
select 'e9000000-0000-4000-8000-0000000000a1', p.id, 'pro', p.version, 'mensuel', 199.00, 'actif', 'sub_upg9', 'cus_upg9'
from public.plans_abonnement p where p.code = 'pro' order by p.version limit 1
on conflict (entreprise_id) do nothing;
commit;
