-- Option IA payante : accueil des comptes existants sans changement (acces gratuit et
-- permanent, "grandfather"), et pour les nouvelles entreprises un essai gratuit de 15
-- jours finance par Liria, puis facturation Stripe automatique si non resiliee.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme d'encodage.

alter table public.entreprises add column if not exists option_ia_statut text not null default 'indisponible';
alter table public.entreprises add column if not exists option_ia_essai_fin timestamptz;
alter table public.entreprises add column if not exists option_ia_stripe_item_id text;
alter table public.entreprises add column if not exists option_ia_debut_at timestamptz;

alter table public.entreprises drop constraint if exists entreprises_option_ia_statut_check;
alter table public.entreprises add constraint entreprises_option_ia_statut_check
  check (option_ia_statut in ('indisponible','essai','actif','gratuit','annule'));

-- Comptes existants a ce jour : acces IA gratuit et permanent, aucun changement de
-- comportement pour eux.
update public.entreprises set option_ia_statut='gratuit' where option_ia_statut='indisponible';

-- Nouvelles entreprises (creees a partir de maintenant) : essai gratuit de 15 jours,
-- finance par Liria (aucune ligne Stripe ajoutee pendant l'essai).
create or replace function public.trg_option_ia_essai_creation() returns trigger language plpgsql as $$
begin
  new.option_ia_statut := 'essai';
  new.option_ia_essai_fin := now() + interval '15 days';
  new.option_ia_debut_at := now();
  return new;
end;
$$;

drop trigger if exists option_ia_essai_creation on public.entreprises;
create trigger option_ia_essai_creation before insert on public.entreprises
  for each row execute function public.trg_option_ia_essai_creation();

-- Visibilite plateforme : ajoute le statut Option IA au retour de plateforme_entreprises().
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
  option_ia_statut text,option_ia_essai_fin timestamptz,
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
         e.option_ia_statut,e.option_ia_essai_fin,
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;
revoke all on function public.plateforme_entreprises() from public,anon,authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

notify pgrst, 'reload schema';
