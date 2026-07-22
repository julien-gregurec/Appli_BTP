-- Remises/avoirs commerciaux appliques par la plateforme (geste commercial suite a un
-- probleme client) : un coupon Stripe par entreprise a la fois, sur l'abonnement de base.
-- Le detail (montant/pourcentage, duree) reste dans Stripe (source de verite pour la
-- facturation) ; on ne stocke ici que l'identifiant du coupon et une description lisible,
-- pour afficher "remise active" sans refaire un appel Stripe a chaque affichage de la page.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents) : le copier-coller de
-- caracteres accentues dans l'editeur SQL Supabase corrompt l'encodage, cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme.

alter table public.entreprises add column if not exists remise_stripe_coupon_id text;
alter table public.entreprises add column if not exists remise_description text;
alter table public.entreprises add column if not exists remise_appliquee_at timestamptz;

create or replace function public.plateforme_appliquer_remise(p_entreprise_id uuid, p_coupon_id text, p_description text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception '%',('Acc'||chr(232)||'s r'||chr(233)||'serv'||chr(233)||' '||chr(224)||' la plateforme');end if;
  update public.entreprises set remise_stripe_coupon_id=p_coupon_id, remise_description=p_description, remise_appliquee_at=now(), updated_at=now() where id=p_entreprise_id;
end;
$$;

create or replace function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception '%',('Acc'||chr(232)||'s r'||chr(233)||'serv'||chr(233)||' '||chr(224)||' la plateforme');end if;
  update public.entreprises set remise_stripe_coupon_id=null, remise_description=null, remise_appliquee_at=null, updated_at=now() where id=p_entreprise_id;
end;
$$;

revoke all on function public.plateforme_appliquer_remise(uuid,text,text) from public,anon,authenticated;
grant execute on function public.plateforme_appliquer_remise(uuid,text,text) to authenticated;
revoke all on function public.plateforme_retirer_remise(uuid) from public,anon,authenticated;
grant execute on function public.plateforme_retirer_remise(uuid) to authenticated;

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
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;
revoke all on function public.plateforme_entreprises() from public,anon,authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

notify pgrst, 'reload schema';
