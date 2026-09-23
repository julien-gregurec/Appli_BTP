-- CM-06 (recette pilote) : « Une commande fournisseur non-brouillon ne peut pas
-- être supprimée » n'était vérifié QUE côté server action Next.js
-- (src/app/actions/commandes.ts, supprimerCommandeAction relit le statut et
-- redirige avec un message avant le DELETE).
--
-- Reproduit par exécution réelle sur la fixture pilote (PILOTE-BTP-V1), sous
-- l'identité RLS du gérant (a_permission(...,'gerer_achats') = true) :
--   delete from commandes_fournisseurs where id = <commande statut 'recue'>;
-- supprime la ligne sans erreur. Les policies de la table ne regardent que le
-- droit ('membres commandes' = est_membre_actif, restrictive
-- 'role_gestion_delete' = a_permission('gerer_achats')), jamais le statut :
-- tout chemin qui n'est pas cette server action précise (PostgREST direct,
-- RPC, future migration) contournait entièrement la règle métier.
--
-- Garde-fou infranchissable, même principe que trg_affectation_employe_actif
-- (PL-02, 20260922000325) : un trigger BEFORE DELETE côté DB couvre tous les
-- chemins d'accès, pas seulement le bouton de l'écran commande.
--
-- Statuts autorisés à la suppression : exactement ceux que la server action
-- accepte déjà ('brouillon', 'annulee') — la garde DB ne durcit pas la règle
-- produit, elle la rend inviolable.

create or replace function public.trg_commande_fournisseur_suppression_statut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.statut not in ('brouillon', 'annulee') then
    raise exception 'COMMANDE_SUPPRESSION_STATUT_INTERDIT'
      using errcode = 'P0001',
            detail = format(
              '{"code":"COMMANDE_SUPPRESSION_STATUT_INTERDIT","commande_id":"%s","statut":"%s"}',
              old.id, old.statut
            ),
            hint = 'Seule une commande fournisseur en brouillon ou annulée peut être supprimée.';
  end if;
  return old;
end;
$$;

comment on function public.trg_commande_fournisseur_suppression_statut() is
  'CM-06 : garde-fou infranchissable — une commande fournisseur ne peut être supprimée que si son statut est ''brouillon'' ou ''annulee''. Défense en profondeur : le préfiltre applicatif de supprimerCommandeAction reste en place mais n''est plus la seule barrière.';

drop trigger if exists trg_commande_fournisseur_suppression_statut on public.commandes_fournisseurs;
create trigger trg_commande_fournisseur_suppression_statut
  before delete on public.commandes_fournisseurs
  for each row execute function public.trg_commande_fournisseur_suppression_statut();

notify pgrst, 'reload schema';
