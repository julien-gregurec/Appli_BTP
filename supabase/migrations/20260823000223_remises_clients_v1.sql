-- REMISES-CLIENTS-V1 : enrichit le geste commercial existant
-- (remise_stripe_coupon_id/remise_description/remise_appliquee_at, voir
-- 20260723000132_remises_plateforme.sql) avec un motif interne distinct du motif visible
-- client, la tracabilite de qui a accorde la remise, et la duree en mois memorisee pour
-- affichage d'une echeance indicative cote admin quand la remise est "repeating".
-- Stripe reste la source de verite pour le calcul/la duree reelle : on ne stocke ici que
-- de quoi afficher l'etat sans rappeler Stripe a chaque affichage (meme philosophie que le
-- fichier d'origine).
--
-- IMPORTANT (verifie empiriquement, REMISES-CLIENTS-V1) : le compte Stripe de la plateforme
-- fonctionne en billing_mode "flexible". Un coupon pose sur un abonnement via
-- discounts[0][coupon] s'applique au PRORATA sur TOUTES les lignes de la facture, y compris
-- la ligne "comptes supplementaires" (reconciliation COMPTES-SUPPLEMENTAIRES-V1C) : ce n'est
-- pas une remise limitee au seul prix catalogue de l'offre. Voir docs/commercial/
-- REMISES_CLIENTS_V1.md pour le detail du test et le calcul.
--
-- remise_motif_interne n'est JAMAIS lu par la page /abonnement (cote client) : cette colonne
-- ne doit etre selectionnee que par le RPC plateforme_entreprises(), reserve aux
-- administrateurs plateforme. Pour la meme raison, les entrees historique_tarification
-- inserees par plateforme_appliquer_remise/plateforme_retirer_remise ci-dessous laissent
-- volontairement `motif` a null : cette table est deja lue par la page /abonnement
-- (section "changements de tarif") et exposerait sinon le motif interne au client.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), comme son fichier d'origine.

alter table public.entreprises add column if not exists remise_motif_interne text;
alter table public.entreprises add column if not exists remise_cree_par uuid references auth.users(id);
alter table public.entreprises add column if not exists remise_duree_mois integer;
-- Type/valeur bruts (en plus de remise_description, deja lisible) : permettent au client et a
-- l'admin d'estimer le total apres remise avec la meme formule que Stripe (percent_off/
-- amount_off sur le sous-total de la facture), sans reparser une chaine de texte francaise.
alter table public.entreprises add column if not exists remise_type text check (remise_type in ('pourcentage','montant'));
alter table public.entreprises add column if not exists remise_valeur numeric;

drop function if exists public.plateforme_appliquer_remise(uuid,text,text);

create or replace function public.plateforme_appliquer_remise(
  p_entreprise_id uuid, p_coupon_id text, p_description text,
  p_motif_interne text default null, p_duree_mois integer default null,
  p_type text default null, p_valeur numeric default null
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_ancien record;
begin
  if not public.est_plateforme_admin() then raise exception '%',('Acc'||chr(232)||'s r'||chr(233)||'serv'||chr(233)||' '||chr(224)||' la plateforme');end if;
  select remise_stripe_coupon_id, remise_description into v_ancien from public.entreprises where id=p_entreprise_id;
  update public.entreprises set
    remise_stripe_coupon_id=p_coupon_id, remise_description=p_description,
    remise_motif_interne=p_motif_interne, remise_duree_mois=p_duree_mois,
    remise_type=p_type, remise_valeur=p_valeur,
    remise_cree_par=auth.uid(), remise_appliquee_at=now(), updated_at=now()
  where id=p_entreprise_id;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values(
    p_entreprise_id,auth.uid(),'remise_appliquee',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
    jsonb_build_object('remise_stripe_coupon_id',p_coupon_id,'remise_description',p_description,'duree_mois',p_duree_mois),
    null
  );
end;
$$;

create or replace function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_ancien record;
begin
  if not public.est_plateforme_admin() then raise exception '%',('Acc'||chr(232)||'s r'||chr(233)||'serv'||chr(233)||' '||chr(224)||' la plateforme');end if;
  select remise_stripe_coupon_id, remise_description into v_ancien from public.entreprises where id=p_entreprise_id;
  update public.entreprises set
    remise_stripe_coupon_id=null, remise_description=null, remise_motif_interne=null,
    remise_duree_mois=null, remise_type=null, remise_valeur=null,
    remise_cree_par=null, remise_appliquee_at=null, updated_at=now()
  where id=p_entreprise_id;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values(
    p_entreprise_id,auth.uid(),'remise_retiree',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
    null,
    null
  );
end;
$$;

revoke all on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) from public,anon,authenticated;
grant execute on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) to authenticated;
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
  remise_motif_interne text,remise_duree_mois integer,remise_cree_par uuid,
  remise_type text,remise_valeur numeric,
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
         e.remise_motif_interne,e.remise_duree_mois,e.remise_cree_par,
         e.remise_type,e.remise_valeur,
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;
revoke all on function public.plateforme_entreprises() from public,anon,authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

-- RLS gap decouvert lors de l'audit REMISES-CLIENTS-V1 (section 25 : "aucun client ne doit
-- pouvoir modifier une remise via un appel direct") : la police "membres modifient leur
-- entreprise" (20260710000001_comptes_entreprises.sql, for update using
-- est_membre_actif(id)) autorise tout membre actif a modifier N'IMPORTE QUELLE colonne de
-- sa propre ligne entreprises, y compris les colonnes remise_* -- Postgres RLS ne filtre
-- que les LIGNES, pas les colonnes. Un membre pourrait donc forcer l'affichage d'une fausse
-- remise (remise_description/remise_valeur) sans jamais toucher a Stripe (qui reste la
-- source de verite pour la facturation reelle, donc pas de risque financier direct, mais un
-- risque d'affichage trompeur et une violation du principe "seul un admin plateforme accorde
-- une remise"). Ce trigger fige les colonnes remise_* a leur valeur precedente pour toute
-- UPDATE qui ne vient pas d'un administrateur plateforme, quelle que soit la policy RLS qui
-- a autorise la ligne. Les fonctions plateforme_appliquer_remise/plateforme_retirer_remise
-- ci-dessus continuent de fonctionner normalement : est_plateforme_admin() y est vrai.
--
-- NOTE (hors perimetre de ce lot) : la meme police RLS expose de la meme facon toutes les
-- AUTRES colonnes "admin uniquement" de entreprises (abonnement_statut, impaye_signale_at,
-- stripe_customer_id, etc.). Ce n'est pas corrige ici -- seules les colonnes remise_* le
-- sont, car elles sont l'objet de ce lot. Un lot dedie a l'audit RLS complet de la table
-- entreprises est recommande.

create or replace function public.proteger_colonnes_remise_entreprise()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then
    new.remise_stripe_coupon_id := old.remise_stripe_coupon_id;
    new.remise_description := old.remise_description;
    new.remise_motif_interne := old.remise_motif_interne;
    new.remise_duree_mois := old.remise_duree_mois;
    new.remise_type := old.remise_type;
    new.remise_valeur := old.remise_valeur;
    new.remise_cree_par := old.remise_cree_par;
    new.remise_appliquee_at := old.remise_appliquee_at;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_colonnes_remise on public.entreprises;
create trigger proteger_colonnes_remise before update on public.entreprises
  for each row execute function public.proteger_colonnes_remise_entreprise();

notify pgrst, 'reload schema';
