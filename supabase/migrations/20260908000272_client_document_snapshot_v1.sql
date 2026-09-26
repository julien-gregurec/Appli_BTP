-- ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1
--
-- Faille corrigée : un devis / une facture / un avoir ne conservait AUCUNE trace
-- de l'identité du destinataire au moment de l'émission. `public.devis` et
-- `public.factures` ne portent qu'un `client_id`, et tout le rendu (page
-- /imprimer, PDF, page publique /document/[token], e-mail d'envoi et de
-- renvoi, exports comptables) relisait `public.clients` en direct via une
-- jointure PostgREST. Conséquence : renommer un client, corriger son SIRET ou
-- déménager son adresse de facturation réécrivait rétroactivement TOUS ses
-- documents déjà émis, y compris des factures comptabilisées.
--
-- L'identité de l'ÉMETTEUR était déjà figée depuis
-- 20260812000200_documents_commerciaux_p9.sql (`factures.entreprise_snapshot`).
-- Ce lot applique exactement le même principe au DESTINATAIRE, et l'étend aux
-- devis, qui n'avaient aucun snapshot du tout.
--
-- Différence de conception assumée avec `entreprise_snapshot` : la capture
-- n'est PAS faite côté application (changerStatutFactureAction) mais par un
-- déclencheur base. `entreprise_snapshot` reste contournable par toute écriture
-- qui ne passe pas par l'action serveur (RPC creer_facture_avancee, PostgREST
-- direct, script d'import). Une identité de destinataire manquante sur une
-- facture émise n'est pas rattrapable a posteriori : la capture doit donc être
-- au niveau table, seul point que rien ne contourne.

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------

alter table public.devis
  add column if not exists client_snapshot jsonb,
  add column if not exists client_snapshot_at timestamptz;

alter table public.factures
  add column if not exists client_snapshot jsonb,
  add column if not exists client_snapshot_at timestamptz;

comment on column public.devis.client_snapshot is
  'Identité du destinataire figée à l''émission du devis (sortie du statut brouillon). Jamais réécrite ensuite. NULL = brouillon jamais émis : le rendu lit alors la fiche client en direct. Voir 20260908000272_client_document_snapshot_v1.sql.';
comment on column public.factures.client_snapshot is
  'Identité du destinataire figée à l''émission de la facture / de l''avoir. Jamais réécrite ensuite. Un avoir rattaché à une facture d''origine hérite du snapshot de celle-ci. NULL = brouillon jamais émis.';
comment on column public.devis.client_snapshot_at is
  'Horodatage de la capture de client_snapshot.';
comment on column public.factures.client_snapshot_at is
  'Horodatage de la capture de client_snapshot.';

-- ---------------------------------------------------------------------------
-- 2. Construction du snapshot
-- ---------------------------------------------------------------------------
--
-- Le snapshot est construit à partir de `to_jsonb(client)` filtré par une liste
-- blanche, plutôt que champ par champ : une colonne d'identité ajoutée plus tard
-- à public.clients (nom_commercial, forme_juridique, numero_tva,
-- adresse_complement, pays — demandées par le cahier des charges mais ABSENTES
-- du modèle de données actuel) n'a qu'à être ajoutée à la liste, sans réécrire
-- la fonction, et une colonne absente est simplement rendue à null au lieu de
-- faire échouer la capture.
--
-- `nom_affiche` est calculé et figé ici pour que le rendu n'ait jamais à
-- recomposer un nom depuis societe/prenom/nom : c'est exactement la chaîne
-- imprimée sur le document, gelée telle quelle (miroir SQL de nomClient(),
-- src/lib/chantier-statuts.ts).
--
-- `provenance` distingue explicitement une identité réellement observée à
-- l'émission d'une identité reconstituée après coup par le backfill : aucune
-- ancienne identité n'est jamais inventée silencieusement.

create or replace function public.construire_client_snapshot(
  p_client_id uuid,
  p_entreprise_id uuid,
  p_provenance text default 'emission'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client jsonb;
  v_contact jsonb;
  v_snapshot jsonb := '{}'::jsonb;
  v_champ text;
  v_champs text[] := array[
    'reference_interne', 'type', 'statut',
    'nom', 'prenom', 'societe', 'raison_sociale',
    'nom_commercial', 'forme_juridique',
    'siret', 'numero_tva',
    'adresse_facturation', 'adresse_complement', 'code_postal', 'ville', 'pays',
    'telephone', 'email', 'conditions_paiement'
  ];
begin
  -- Le client est relu SOUS CONTRAINTE d'appartenance à l'entreprise du
  -- document. La fonction est security definer (elle doit pouvoir écrire un
  -- snapshot même quand la RLS de public.clients masquerait la ligne) : sans
  -- ce garde-fou, un document portant un client_id d'un autre tenant se verrait
  -- capturer l'identité de ce tenant. Ici, ce cas rend simplement NULL.
  select to_jsonb(c) into v_client
  from public.clients c
  where c.id = p_client_id and c.entreprise_id = p_entreprise_id;

  if v_client is null then
    return null;
  end if;

  foreach v_champ in array v_champs loop
    v_snapshot := v_snapshot || jsonb_build_object(v_champ, v_client -> v_champ);
  end loop;

  -- Contact principal du client, tel qu'il figure sur le document au moment de
  -- l'émission (nom du contact, e-mail destinataire, téléphone).
  select jsonb_build_object(
           'nom', ct.nom, 'fonction', ct.fonction,
           'telephone', ct.telephone, 'email', ct.email
         )
  into v_contact
  from public.contacts_clients ct
  where ct.client_id = p_client_id
  order by ct.principal desc, ct.created_at
  limit 1;

  return v_snapshot || jsonb_build_object(
    'version', 1,
    'client_id', p_client_id,
    'provenance', p_provenance,
    'nom_affiche', coalesce(
      nullif(v_client ->> 'societe', ''),
      nullif(trim(concat_ws(' ', v_client ->> 'prenom', v_client ->> 'nom')), ''),
      '(sans nom)'
    ),
    'contact', v_contact
  );
end;
$$;

revoke all on function public.construire_client_snapshot(uuid, uuid, text) from public, anon;
grant execute on function public.construire_client_snapshot(uuid, uuid, text) to authenticated;

comment on function public.construire_client_snapshot(uuid, uuid, text) is
  'Construit l''identité figée d''un destinataire de document commercial. Le client n''est lu que s''il appartient à p_entreprise_id : aucune capture inter-tenant possible.';

-- ---------------------------------------------------------------------------
-- 3. Capture automatique à l'émission
-- ---------------------------------------------------------------------------
--
-- Déclencheur BEFORE INSERT OR UPDATE. Il ne capture QUE si :
--   - le document n'est pas (ou plus) un brouillon, et
--   - aucun snapshot n'est encore présent.
-- Il ne réécrit donc jamais un snapshot existant, et laisse un brouillon sans
-- snapshot : tant que le document est un brouillon, le rendu lit la fiche
-- client en direct, ce qui est le comportement voulu (le brouillon reflète
-- toujours les données client à jour, et l'interface l'annonce).
--
-- Nom préfixé `capturer_` : les déclencheurs BEFORE ROW se déclenchent dans
-- l'ordre alphabétique, donc AVANT `verrou_client_snapshot_*` (garde
-- d'immuabilité) et avant `verrou_facture_emise` / `verrou_devis_accepte`.

create or replace function public.capturer_client_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_herite jsonb;
begin
  if new.statut = 'brouillon' or new.client_snapshot is not null then
    return new;
  end if;

  -- Avoir : il crédite une facture précise et doit donc porter EXACTEMENT le
  -- destinataire de cette facture, pas l'identité courante du client (règle
  -- documentée : un avoir n'ouvre pas une identité nouvelle, il annule une
  -- écriture déjà émise). Si la facture d'origine n'a pas de snapshot, on
  -- retombe sur la capture normale ci-dessous.
  -- IF imbriqués (et non un AND unique) : `new.type` / `new.facture_origine_id`
  -- n'existent pas sur un enregistrement `devis`, et PostgreSQL ne garantit pas
  -- l'évaluation court-circuitée d'un AND. Le test de table doit donc être
  -- franchi avant toute lecture d'un champ propre aux factures.
  if tg_table_name = 'factures' then
    if new.type = 'avoir' and new.facture_origine_id is not null then
      select f.client_snapshot
        || jsonb_build_object(
             'provenance', 'herite_facture_origine',
             'herite_de', jsonb_build_object('facture_id', f.id, 'numero', f.numero)
           )
      into v_herite
      from public.factures f
      where f.id = new.facture_origine_id
        and f.entreprise_id = new.entreprise_id
        and f.client_snapshot is not null;

      if v_herite is not null then
        new.client_snapshot := v_herite;
        new.client_snapshot_at := now();
        return new;
      end if;
    end if;
  end if;

  new.client_snapshot := public.construire_client_snapshot(
    new.client_id, new.entreprise_id, 'emission'
  );
  if new.client_snapshot is not null then
    new.client_snapshot_at := now();
  end if;
  return new;
end;
$$;

comment on function public.capturer_client_snapshot() is
  'Fige l''identité du destinataire au moment où un devis / une facture / un avoir quitte le statut brouillon. Ne réécrit jamais un snapshot existant.';

drop trigger if exists capturer_client_snapshot_devis on public.devis;
create trigger capturer_client_snapshot_devis
  before insert or update on public.devis
  for each row execute function public.capturer_client_snapshot();

drop trigger if exists capturer_client_snapshot_factures on public.factures;
create trigger capturer_client_snapshot_factures
  before insert or update on public.factures
  for each row execute function public.capturer_client_snapshot();

-- ---------------------------------------------------------------------------
-- 4. Immuabilité côté verrou facture existant
-- ---------------------------------------------------------------------------
--
-- `verrouiller_facture_emise` (20260822000222) compare l'ancienne et la
-- nouvelle ligne en JSON, liste blanche des champs non contractuels retirée.
-- Sans adaptation, il refuserait la capture initiale de `client_snapshot` sur
-- une facture émise (cas du backfill ci-dessous, et cas d'une facture émise
-- restée sans snapshot). On applique la même exemption que celle déjà en place
-- pour `entreprise_snapshot` : exemptée UNIQUEMENT tant que l'ancienne valeur
-- est nulle. Une fois renseignée, toute tentative de modification retombe dans
-- le refus général « facture déjà émise ».

create or replace function public.verrouiller_facture_emise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_champs_libres text[] := array[
    'statut', 'montant_paye', 'notes_internes', 'email_envoye_le', 'email_envoye_a',
    'date_echeance', 'stripe_checkout_id', 'stripe_checkout_url', 'stripe_payment_intent_id',
    'stripe_payment_status', 'lien_paiement_expire_at', 'updated_at'
  ];
  v_champ text;
  v_snapshot text;
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut plus être supprimée.';
    end if;
    return old;
  end if;

  if old.statut <> 'brouillon' then
    if new.statut = 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut pas redevenir brouillon.';
    end if;

    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_champ in array v_champs_libres loop
      v_old := v_old - v_champ;
      v_new := v_new - v_champ;
    end loop;
    -- entreprise_snapshot / client_snapshot : verrouillés seulement une fois
    -- déjà renseignés, pour ne pas bloquer leur capture initiale (sortie du
    -- brouillon, ou rattrapage d'un document historique) tout en empêchant
    -- toute falsification ultérieure de l'identité légale figée.
    foreach v_snapshot in array array['entreprise_snapshot', 'client_snapshot', 'client_snapshot_at'] loop
      if (v_old ? v_snapshot) and (v_old ->> v_snapshot) is null then
        v_old := v_old - v_snapshot;
        v_new := v_new - v_snapshot;
      end if;
    end loop;

    if v_old is distinct from v_new then
      raise exception 'Cette facture a déjà été émise et ne peut plus être modifiée.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists verrou_facture_emise on public.factures;
create trigger verrou_facture_emise
  before delete or update on public.factures
  for each row execute function public.verrouiller_facture_emise();

-- ---------------------------------------------------------------------------
-- 5. Backfill des documents historiques
-- ---------------------------------------------------------------------------
--
-- Stratégie, par cas :
--
--  a) Document brouillon → AUCUN snapshot. Il n'a pas été émis, il n'y a pas
--     d'identité historique à figer ; il sera capturé à sa propre émission.
--
--  b) Document émis dont le client est toujours présent → snapshot reconstitué
--     depuis l'identité ACTUELLE du client, marqué
--     `provenance = 'backfill_identite_actuelle'` et
--     `identite_incertaine = true`. C'est le seul matériau disponible : le
--     dépôt ne conserve nulle part l'identité passée d'un client
--     (public.clients n'est pas historisé, et journal_activite ne journalise
--     pas les modifications de fiche client). Le marquage est explicite pour
--     qu'aucun lecteur — humain ou code — ne prenne cette valeur pour une
--     identité réellement observée à l'émission.
--
--  c) Document émis dont le client a disparu → aucun snapshot possible.
--     `clients.id` est référencé `on delete restrict` par devis et factures :
--     ce cas ne peut pas exister aujourd'hui. Il est traité malgré tout
--     (construire_client_snapshot rend NULL, la ligne reste sans snapshot et
--     le rendu retombe sur la lecture directe, exactement comme avant ce lot).
--
-- Idempotence : `where client_snapshot is null`. Rejoué, le backfill ne
-- retouche aucune ligne déjà pourvue et n'en duplique aucune. Sur une
-- installation neuve (aucun document), il ne fait rien.
--
-- Il s'exécute AVANT la pose des gardes d'immuabilité du §6, pour ne pas être
-- bloqué par elles.

update public.devis d
set client_snapshot = public.construire_client_snapshot(
      d.client_id, d.entreprise_id, 'backfill_identite_actuelle'
    ) || jsonb_build_object('identite_incertaine', true),
    client_snapshot_at = now()
where d.statut <> 'brouillon'
  and d.client_snapshot is null
  and public.construire_client_snapshot(d.client_id, d.entreprise_id) is not null;

update public.factures f
set client_snapshot = public.construire_client_snapshot(
      f.client_id, f.entreprise_id, 'backfill_identite_actuelle'
    ) || jsonb_build_object('identite_incertaine', true),
    client_snapshot_at = now()
where f.statut <> 'brouillon'
  and f.client_snapshot is null
  and public.construire_client_snapshot(f.client_id, f.entreprise_id) is not null;

-- ---------------------------------------------------------------------------
-- 6. Garde d'immuabilité du snapshot destinataire
-- ---------------------------------------------------------------------------
--
-- `verrouiller_facture_emise` protège déjà une facture émise dans son ensemble,
-- mais `verrouiller_devis_accepte` (20260818000210) ne protège un devis qu'au
-- statut 'accepte' : un devis 'envoye' reste modifiable par écriture directe.
-- Cette garde dédiée, posée sur les deux tables, ferme le cas et couvre tous
-- les chemins d'écriture (RPC, PostgREST direct, script) : une fois le snapshot
-- renseigné, il ne peut plus être modifié ni effacé, quel que soit le statut et
-- quel que soit l'appelant.
--
-- Le client_id source reste conservé séparément et n'est volontairement PAS
-- verrouillé ici : le rattachement CRM d'un brouillon reste modifiable, et sur
-- un document émis il est déjà verrouillé par les deux triggers existants.

create or replace function public.verrouiller_client_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.client_snapshot is not null
     and (new.client_snapshot is distinct from old.client_snapshot
          or new.client_snapshot_at is distinct from old.client_snapshot_at) then
    raise exception 'L''identité du destinataire figée à l''émission de ce document ne peut plus être modifiée.';
  end if;
  return new;
end;
$$;

comment on function public.verrouiller_client_snapshot() is
  'Rend client_snapshot immuable dès qu''il est renseigné, sur tout chemin d''écriture (RPC, PostgREST, script).';

drop trigger if exists verrou_client_snapshot_devis on public.devis;
create trigger verrou_client_snapshot_devis
  before update on public.devis
  for each row execute function public.verrouiller_client_snapshot();

drop trigger if exists verrou_client_snapshot_factures on public.factures;
create trigger verrou_client_snapshot_factures
  before update on public.factures
  for each row execute function public.verrouiller_client_snapshot();

notify pgrst, 'reload schema';
