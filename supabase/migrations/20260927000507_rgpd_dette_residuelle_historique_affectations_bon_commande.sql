-- RGPD — fermeture de la dette technique résiduelle V1.
-- Rapport : docs/qualification/ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md
--
-- Deux constats laissés ouverts par la réconciliation des commandes fournisseurs
-- (docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md §9 ¹ et §12) :
--
--  RD-1  Historique des affectations recréé par la purge elle-même.
--        Reproduit (pilote GP, politique contrats livrée) : l'étape `affectations` de
--        `purger_table_entreprise` supprime 300 affectations en DELETE direct. Le chantier,
--        le salarié (ANONYMIZE) et l'entreprise existent encore à ce moment-là, donc
--        `trg_historiser_affectation` (PL-03, 20260923000351) ne reconnaît pas une
--        suppression « de contexte » et écrit 300 lignes `suppression` dans
--        `affectations_historique` (table DELETE), APRÈS l'étape qui les aurait purgées
--        (elle n'était même pas listée : 0 ligne au rapport initial). Une purge complète les
--        rattrape au balayage final ; une purge incomplète (contrats) s'arrête avant ce
--        balayage, et seul un second passage les supprime.
--        Cause : le trigger détecte la purge par l'absence du parent ; la purge qui supprime
--        les affectations elles-mêmes n'en fait pas disparaître. Son propre commentaire pose
--        pourtant la règle : « historiser une purge RGPD irait à l'encontre de la purge ».
--        Correctif : une écriture faite DANS une étape de purge autorisée (autorisation R1,
--        20260926000501 : liée à txid_current(), déposée par la seule fonction de purge,
--        service_role, échéance échue vérifiée, retirée avant de rendre la main) n'est pas
--        historisée. Rien n'est supprimé en plus : on cesse de créer des lignes que la purge
--        doit ensuite effacer. Hors purge, PL-03 est inchangé.
--        Les déroulés (script, planificateur, pilote SQL de test) gagnent en plus un
--        balayage final même quand la purge est incomplète (filet générique, voir rapport).
--
--  RD-2  Le bon de commande imprimé relit la fiche fournisseur et la fiche entreprise
--        COURANTES. Reproduit : commande envoyée → fournisseur renommé / déménagé → la
--        réimpression du bon historique affiche la nouvelle identité.
--        Données réellement imprimées (src/app/imprimer/commandes/[id]/page.tsx →
--        DocumentImprimable) :
--          fournisseur : nom, adresse, code postal, ville, SIRET (ni contact, ni e-mail, ni
--                        téléphone, ni TVA : non imprimés, donc NON figés) ;
--          émetteur    : l'en-tête entreprise, exactement comme devis et factures
--                        (construire_entreprise_snapshot, 20260922000308).
--        Correctif, même patron que devis/factures (client_snapshot 20260908000272,
--        entreprise_snapshot 20260922000308), sans décision juridique nouvelle :
--          - `fournisseur_snapshot` et `entreprise_snapshot` calculés PAR LA BASE quand la
--            commande quitte le brouillon (envoi, ou annulation d'un brouillon), jamais
--            fournis par le client : une valeur envoyée avec la requête est ignorée ;
--          - immuables ensuite : le verrou PO-1 (20260926000506) fige déjà toute colonne
--            d'une commande non brouillon, y compris celles-ci ;
--          - contrainte : brouillon ⇔ aucune identité figée ; sinon identité, date et
--            provenance présentes ;
--          - rattrapage conservateur des commandes existantes non brouillon depuis les fiches
--            actuelles, marqué `identite_provenance = 'reconstituee'` (l'identité réellement
--            imprimée à l'époque n'est pas connue) ;
--          - RGPD : ces colonnes font partie du document complet (empreinte
--            `_document_commande_fournisseur`, to_jsonb) mais PAS de l'instantané minimisé de
--            la purge (liste blanche `_commande_minimisee`, inchangée) ; elles partent avec
--            la commande (table DELETE). L'export RGPD les restitue (to_jsonb).

-- ═══════════════════════════════════════════════════════════════════════
-- RD-1. Pas d'historique d'affectation écrit par une étape de purge
-- ═══════════════════════════════════════════════════════════════════════
-- Vrai seulement pendant une étape de `purger_table_entreprise` pour cette entreprise, dans
-- cette transaction (autorisation R1). Aucun rôle applicatif ne peut écrire dans
-- platform.purge_autorisations_facture.
create or replace function public._etape_purge_en_cours(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform.purge_autorisations_facture a
     where a.txid = txid_current() and a.entreprise_id = p_entreprise_id)
$$;
revoke all on function public._etape_purge_en_cours(uuid) from public, anon, authenticated, service_role;

-- Corps identique à 20260923000351 hors des blocs « RD-1 ».
create or replace function public.trg_historiser_affectation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avant jsonb := to_jsonb(old) - 'updated_at';
  v_apres jsonb;
  v_champs text[];
begin
  -- RD-1 : la purge RGPD n'est pas historisée (ni suppression directe de l'étape
  -- `affectations`, ni effet de bord d'une autre étape).
  if public._etape_purge_en_cours(old.entreprise_id) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if not exists (select 1 from public.employes where id = old.employe_id)
       or not exists (select 1 from public.entreprises where id = old.entreprise_id)
       or (old.chantier_id is not null and not exists (select 1 from public.chantiers where id = old.chantier_id))
       or (old.demande_conge_id is not null and not exists (select 1 from public.demandes_conges where id = old.demande_conge_id)) then
      return old;
    end if;
    insert into public.affectations_historique
      (entreprise_id, affectation_id, employe_id, operation, avant, auteur_id)
    values
      (old.entreprise_id, old.id, old.employe_id, 'suppression', v_avant, auth.uid());
    return old;
  end if;

  v_apres := to_jsonb(new) - 'updated_at';
  if v_avant = v_apres then
    return new;
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_champs
    from jsonb_object_keys(v_apres) as k
   where v_apres -> k is distinct from v_avant -> k;

  insert into public.affectations_historique
    (entreprise_id, affectation_id, employe_id, operation, champs_modifies, avant, apres, auteur_id)
  values
    (new.entreprise_id, new.id, new.employe_id, 'modification', v_champs, v_avant, v_apres, auth.uid());
  return new;
end;
$$;

comment on function public.trg_historiser_affectation() is
  'PL-03 : historique append-only des modifications et suppressions directes d''affectations (avant/après, champs modifiés, auteur, horodatage). Les suppressions en cascade (employé, chantier, congé, entreprise) et toute écriture faite pendant une étape de purge RGPD (autorisation R1) ne sont pas historisées.';
revoke all on function public.trg_historiser_affectation() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RD-2. Identité imprimée figée sur le bon de commande
-- ═══════════════════════════════════════════════════════════════════════
alter table public.commandes_fournisseurs
  add column if not exists fournisseur_snapshot jsonb,
  add column if not exists entreprise_snapshot jsonb,
  add column if not exists identite_figee_le timestamptz,
  add column if not exists identite_provenance text;

comment on column public.commandes_fournisseurs.fournisseur_snapshot is
  'Destinataire imprimé sur le bon de commande, figé par la base quand la commande quitte le brouillon : nom, adresse, code postal, ville, SIRET (seuls champs imprimés). Immuable (verrou PO-1).';
comment on column public.commandes_fournisseurs.entreprise_snapshot is
  'En-tête émetteur imprimé sur le bon de commande (construire_entreprise_snapshot), figé quand la commande quitte le brouillon. Immuable (verrou PO-1).';
comment on column public.commandes_fournisseurs.identite_provenance is
  '''envoi'' : identité figée par la base au moment où la commande a quitté le brouillon ; ''reconstituee'' : commande antérieure à 20260927000507, identité reprise des fiches au moment de la migration (peut différer du bon réellement envoyé).';

-- Seuls les champs imprimés (DocumentImprimable, bloc « Destinataire »). Même entreprise
-- exigée (la FK composite le garantit déjà ; la fonction est SECURITY DEFINER).
create or replace function public.construire_fournisseur_snapshot_commande(p_fournisseur_id uuid, p_entreprise_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', 1,
    'fournisseur_id', f.id,
    'nom', f.nom, 'adresse', f.adresse, 'code_postal', f.code_postal, 'ville', f.ville, 'siret', f.siret)
    from public.fournisseurs f
   where f.id = p_fournisseur_id and f.entreprise_id = p_entreprise_id
$$;
revoke all on function public.construire_fournisseur_snapshot_commande(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.capturer_identite_commande_fournisseur()
returns trigger
language plpgsql
security definer
set search_path = public
set timezone = 'UTC'
as $$
begin
  -- Hors brouillon, l'identité ne se calcule qu'une fois : au moment où la commande quitte
  -- le brouillon. Ensuite, le verrou PO-1 refuse toute modification de ces colonnes.
  if tg_op = 'UPDATE' and old.statut <> 'brouillon' then
    return new;
  end if;
  if new.statut = 'brouillon' then
    -- Un brouillon n'a pas d'identité figée (il affiche les fiches à jour).
    new.fournisseur_snapshot := null;
    new.entreprise_snapshot := null;
    new.identite_figee_le := null;
    new.identite_provenance := null;
    return new;
  end if;
  -- Calculée par la base, jamais reprise de la requête (pas de valeur forgée).
  new.fournisseur_snapshot := public.construire_fournisseur_snapshot_commande(new.fournisseur_id, new.entreprise_id);
  new.entreprise_snapshot := public.construire_entreprise_snapshot(new.entreprise_id);
  new.identite_figee_le := now();
  new.identite_provenance := 'envoi';
  return new;
end;
$$;
revoke all on function public.capturer_identite_commande_fournisseur() from public, anon, authenticated;

comment on function public.capturer_identite_commande_fournisseur() is
  'RD-2 : fige l''identité imprimée (fournisseur destinataire, entreprise émettrice) quand une commande fournisseur quitte le brouillon. Ne reprend jamais une valeur fournie par la requête.';

-- BEFORE ROW, ordre alphabétique : `capturer_…` passe avant `verrouiller_…` (PO-1).
drop trigger if exists capturer_identite_commande_fournisseur on public.commandes_fournisseurs;
create trigger capturer_identite_commande_fournisseur
  before insert or update on public.commandes_fournisseurs
  for each row execute function public.capturer_identite_commande_fournisseur();

-- Rattrapage conservateur : commandes déjà sorties du brouillon. Ce n'est pas un événement
-- métier : seuls le verrou PO-1 (qui fige toute colonne d'une commande engagée) et la
-- capture (qui marquerait 'envoi') sont suspendus, le temps de cette seule instruction.
alter table public.commandes_fournisseurs disable trigger verrouiller_commande_fournisseur_engagee;
alter table public.commandes_fournisseurs disable trigger capturer_identite_commande_fournisseur;
update public.commandes_fournisseurs c
   set fournisseur_snapshot = coalesce(
         public.construire_fournisseur_snapshot_commande(c.fournisseur_id, c.entreprise_id),
         jsonb_build_object('version', 1, 'fournisseur_id', c.fournisseur_id, 'nom', null, 'adresse', null,
                            'code_postal', null, 'ville', null, 'siret', null)),
       entreprise_snapshot = coalesce(public.construire_entreprise_snapshot(c.entreprise_id), '{}'::jsonb),
       identite_figee_le = now(),
       identite_provenance = 'reconstituee'
 where c.statut <> 'brouillon' and c.fournisseur_snapshot is null;
alter table public.commandes_fournisseurs enable trigger capturer_identite_commande_fournisseur;
alter table public.commandes_fournisseurs enable trigger verrouiller_commande_fournisseur_engagee;

alter table public.commandes_fournisseurs
  drop constraint if exists commandes_fournisseurs_identite_figee_check;
alter table public.commandes_fournisseurs
  add constraint commandes_fournisseurs_identite_figee_check check (
    case when statut = 'brouillon'
      then fournisseur_snapshot is null and entreprise_snapshot is null
           and identite_figee_le is null and identite_provenance is null
      else fournisseur_snapshot is not null and entreprise_snapshot is not null
           and identite_figee_le is not null and identite_provenance in ('envoi', 'reconstituee')
    end);

notify pgrst, 'reload schema';
