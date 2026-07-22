-- Option IA a paliers : l'entreprise choisit un plafond d'appels IA par jour (compteur
-- existant journal_ia, simplement rendu reglable par entreprise au lieu d'un plafond
-- global unique) : 100/jour, 300/jour, ou illimite. Chaque palier a son propre prix
-- Stripe (voir STRIPE_PRICE_OPTION_IA_<palier>_<periodicite> cote application).
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme d'encodage.

alter table public.entreprises add column if not exists option_ia_palier text not null default '300';

alter table public.entreprises drop constraint if exists entreprises_option_ia_palier_check;
alter table public.entreprises add constraint entreprises_option_ia_palier_check
  check (option_ia_palier in ('100','300','illimite'));

-- Visibilite plateforme : ajoute le palier au retour de plateforme_entreprises().
drop function if exists public.plateforme_entreprises();
create function public.plateforme_entreprises()
returns table(
  id uuid,nom text,code_adhesion text,reference_interne text,
  abonnement_statut text,abonnement_echeance date,abonnement_note text,
  impaye_signale_at timestamptz,suspension_prevue_at timestamptz,
  impaye_message text,dernier_reglement_at timestamptz,
  abonnement_offre text,abonnement_periodicite text,abonnement_essai_fin date,
  abonnement_annulation_prevue_at timestamptz,stripe_customer_id text,
  stripe_subscription_id text,derniere_facture_url text,
  derniere_facture_pdf text,derniere_facture_statut text,
  remise_stripe_coupon_id text,remise_description text,remise_appliquee_at timestamptz,
  option_ia_statut text,option_ia_essai_fin timestamptz,option_ia_palier text,
  nb_membres bigint,nb_membres_actifs bigint,created_at timestamptz
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception '%',('Acc'||chr(232)||'s r'||chr(233)||'serv'||chr(233)||' '||chr(224)||' la plateforme');end if;
  perform public.appliquer_suspensions_impayes();
  return query
  select e.id,e.nom,e.code_adhesion,e.reference_interne,
         e.abonnement_statut,e.abonnement_echeance,e.abonnement_note,
         e.impaye_signale_at,e.suspension_prevue_at,e.impaye_message,e.dernier_reglement_at,
         e.abonnement_offre,e.abonnement_periodicite,e.abonnement_essai_fin,
         e.abonnement_annulation_prevue_at,e.stripe_customer_id,e.stripe_subscription_id,
         e.derniere_facture_url,e.derniere_facture_pdf,e.derniere_facture_statut,
         e.remise_stripe_coupon_id,e.remise_description,e.remise_appliquee_at,
         e.option_ia_statut,e.option_ia_essai_fin,e.option_ia_palier,
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;
revoke all on function public.plateforme_entreprises() from public,anon,authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

notify pgrst, 'reload schema';
