-- GP-EXTERNAL-PILOT-CLOSURE-V1 — fige l'identité émettrice (entreprise) sur
-- un devis, comme c'est déjà fait pour une facture.
--
-- `factures.entreprise_snapshot` existe depuis 20260812000200 ; rien
-- d'équivalent n'existe sur `devis`. `construire_rendu_devis()` (moteur v2,
-- 20260912000282) appelle `construire_entreprise_snapshot(d.entreprise_id)`
-- À CHAQUE LECTURE, sans jamais figer le résultat — contrairement à
-- `construire_rendu_facture()` qui fait `coalesce(f.entreprise_snapshot, ...)`.
-- Un devis déjà envoyé change donc de logo/adresse/CGV/assurances affichés si
-- l'entreprise modifie sa fiche après l'envoi : exactement le risque que le
-- gel des documents émis doit fermer (logo historique, identité légale figée).
--
-- Capture : même point de déclenchement que client_snapshot (capturer_client_
-- snapshot, 20260908000272) — dès que le devis quitte le statut brouillon,
-- avant insert ou update, jamais réécrite une fois renseignée. Plus robuste
-- que le mécanisme actuel des factures (capture faite en TypeScript dans
-- changerStatutFactureAction, donc contournable par toute écriture qui ne
-- passe pas par cette action précise) : ici la capture est un trigger DB,
-- non contournable par construction, cohérent avec capturer_client_snapshot.

alter table public.devis add column if not exists entreprise_snapshot jsonb;

create or replace function public.capturer_entreprise_snapshot_devis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'brouillon' or new.entreprise_snapshot is not null then
    return new;
  end if;
  new.entreprise_snapshot := public.construire_entreprise_snapshot(new.entreprise_id);
  return new;
end;
$$;

comment on function public.capturer_entreprise_snapshot_devis() is
  'Fige l''identité émettrice (entreprise) au moment où un devis quitte le statut brouillon. Ne réécrit jamais un snapshot existant.';

-- Nom préfixé capturer_ : se déclenche avant verrou_entreprise_snapshot_devis
-- (ordre alphabétique des triggers BEFORE ROW), donc avant la garde
-- d'immuabilité posée juste après.
drop trigger if exists capturer_entreprise_snapshot_devis on public.devis;
create trigger capturer_entreprise_snapshot_devis
  before insert or update on public.devis
  for each row execute function public.capturer_entreprise_snapshot_devis();

-- Backfill des devis déjà émis (jamais brouillon, jamais de snapshot) :
-- reconstitue depuis l'entreprise actuelle, comme le backfill client_snapshot
-- de 20260908000272 (« identité reconstituée », faute de mieux pour un
-- document antérieur à ce lot).
update public.devis d
set entreprise_snapshot = public.construire_entreprise_snapshot(d.entreprise_id)
where d.statut <> 'brouillon'
  and d.entreprise_snapshot is null;

create or replace function public.verrouiller_entreprise_snapshot_devis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.entreprise_snapshot is not null and new.entreprise_snapshot is distinct from old.entreprise_snapshot then
    raise exception 'L''identité émettrice figée à l''envoi de ce devis ne peut plus être modifiée.';
  end if;
  return new;
end;
$$;

comment on function public.verrouiller_entreprise_snapshot_devis() is
  'Rend devis.entreprise_snapshot immuable dès qu''il est renseigné, sur tout chemin d''écriture (RPC, PostgREST, script).';

drop trigger if exists verrou_entreprise_snapshot_devis on public.devis;
create trigger verrou_entreprise_snapshot_devis
  before update on public.devis
  for each row execute function public.verrouiller_entreprise_snapshot_devis();

-- Rendu v2 : lit désormais le snapshot figé s'il existe, comme pour les
-- factures. Comportement inchangé pour un brouillon (jamais de snapshot) ou
-- pour un devis émis avant ce lot mais déjà couvert par le backfill ci-dessus.
create or replace function public.construire_rendu_devis(d public.devis, p_provenance text default 'emission')
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'version', 1,
    'moteur', coalesce(d.moteur_presentation, 1),
    'type_document', 'devis',
    'provenance', p_provenance,
    'capture_le', now(),
    'numero', d.numero,
    'statut', d.statut,
    'date_emission', d.date_emission,
    'date_validite', d.date_validite,
    'remise_globale', d.remise_globale,
    'montants', jsonb_build_object('ht', d.montant_ht, 'tva', d.montant_tva, 'ttc', d.montant_ttc),
    'conditions', d.conditions,
    'notes_client', d.notes_client,
    'entreprise', coalesce(d.entreprise_snapshot, public.construire_entreprise_snapshot(d.entreprise_id)),
    'client', coalesce(d.client_snapshot, public.construire_client_snapshot(d.client_id, d.entreprise_id, p_provenance)),
    'filigrane', public.filigrane_a_figer(d.filigrane, d.entreprise_id),
    'filigrane_document', d.filigrane,
    'filigranes_entreprise', (select e.filigranes_documents from public.entreprises e where e.id = d.entreprise_id),
    'ouvrages', coalesce((select jsonb_agg(public.ouvrage_pour_rendu(to_jsonb(o)) order by o.ordre)
                            from public.devis_ouvrages o where o.devis_id = d.id), '[]'::jsonb),
    'lignes', coalesce((select jsonb_agg(public.ligne_pour_rendu(to_jsonb(l)) order by l.ordre)
                          from public.lignes_devis l where l.devis_id = d.id), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- Lecture publique par jeton (20260922000305) : elle lisait TOUJOURS
-- l'entreprise en direct (v_entreprise, en fin de fonction), qu'un snapshot
-- soit figé ou non — pour une facture émise, c'était déjà une divergence avec
-- la lecture authentifiée (chargerDonneesFactureImprimable, qui préfère bien
-- le snapshot figé) : le lien public pouvait donc afficher un logo/une adresse
-- différents de l'aperçu émetteur pour EXACTEMENT le même document. Corrigé
-- ici pour les deux types de document, maintenant que devis a aussi son
-- entreprise_snapshot : chaque document renvoie son propre entreprise figée si
-- elle existe, sinon retombe sur l'entreprise courante (brouillon — mais un
-- brouillon n'est de toute façon jamais résolu par cette fonction).
create or replace function public.document_commercial_public_par_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_cles_entete constant text[] := array[
    'nom', 'raison_sociale', 'siret', 'adresse', 'code_postal', 'ville',
    'logo_url', 'assurance_decennale_numero', 'assurance_decennale_assureur',
    'assurance_rc_pro_numero', 'taux_penalites_retard', 'texte_entete',
    'texte_pied_page', 'police_documents', 'taille_police_documents',
    'logo_largeur_documents', 'couleur_documents', 'couleur_secondaire_documents',
    'mise_en_page_documents', 'position_logo_documents', 'afficher_logo_documents',
    'afficher_descriptions_documents', 'afficher_tva_lignes_documents'
  ];
  c_cles_client constant text[] := array[
    'nom_affiche', 'nom', 'prenom', 'societe', 'adresse_facturation',
    'code_postal', 'ville', 'siret', 'identite_incertaine'
  ];
  v_acces record;
  v_document jsonb;
  v_client_id uuid;
  v_client jsonb;
  v_lignes jsonb;
  v_photos jsonb := '[]'::jsonb;
  v_signatures jsonb;
  v_entreprise jsonb;
  v_entreprise_figee jsonb;
begin
  if p_token is null or length(p_token) not between 32 and 128 then
    return null;
  end if;

  select a.type_document, a.document_id, a.entreprise_id
    into v_acces
  from public.acces_externes_documents a
  where a.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and a.revoque_le is null
    and (a.expire_le is null or a.expire_le > now())
  limit 1;
  if not found then
    return null;
  end if;

  if v_acces.type_document = 'devis' then
    select jsonb_build_object(
             'id', d.id,
             'numero', d.numero,
             'statut', d.statut,
             'date_emission', d.date_emission,
             'date_validite', d.date_validite,
             'montant_ht', d.montant_ht,
             'montant_tva', d.montant_tva,
             'montant_ttc', d.montant_ttc,
             'notes_client', d.notes_client,
             'client_snapshot',
               case when jsonb_typeof(d.client_snapshot) = 'object' then
                 coalesce(
                   (select jsonb_object_agg(s.key, s.value)
                    from jsonb_each(d.client_snapshot) s
                    where s.key = any (c_cles_client)),
                   '{}'::jsonb)
               end,
             'client_snapshot_at', d.client_snapshot_at),
           d.client_id, d.entreprise_snapshot
      into v_document, v_client_id, v_entreprise_figee
    from public.devis d
    where d.id = v_acces.document_id
      and d.entreprise_id = v_acces.entreprise_id
      and d.statut <> 'brouillon';
    if not found then
      return null;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'designation', l.designation,
             'description', l.description,
             'quantite', l.quantite,
             'unite', l.unite,
             'prix_unitaire_ht', l.prix_unitaire_ht,
             'remise_ligne', l.remise_ligne,
             'taux_tva', l.taux_tva)
           order by l.ordre, l.created_at, l.id), '[]'::jsonb)
      into v_lignes
    from public.lignes_devis l
    where l.devis_id = v_acces.document_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'nom_original', p.nom_original,
             'legende', p.legende)
           order by p.created_at, p.id), '[]'::jsonb)
      into v_photos
    from public.pieces_jointes_devis p
    where p.entreprise_id = v_acces.entreprise_id
      and p.devis_id = v_acces.document_id
      and p.type_media = 'image';

  elsif v_acces.type_document = 'facture' then
    select jsonb_build_object(
             'id', f.id,
             'numero', f.numero,
             'statut', f.statut,
             'type', f.type,
             'date_emission', f.date_emission,
             'date_echeance', f.date_echeance,
             'montant_ht', f.montant_ht,
             'montant_tva', f.montant_tva,
             'montant_ttc', f.montant_ttc,
             'notes_client', f.notes_client,
             'client_snapshot',
               case when jsonb_typeof(f.client_snapshot) = 'object' then
                 coalesce(
                   (select jsonb_object_agg(s.key, s.value)
                    from jsonb_each(f.client_snapshot) s
                    where s.key = any (c_cles_client)),
                   '{}'::jsonb)
               end,
             'client_snapshot_at', f.client_snapshot_at),
           f.client_id, f.entreprise_snapshot
      into v_document, v_client_id, v_entreprise_figee
    from public.factures f
    where f.id = v_acces.document_id
      and f.entreprise_id = v_acces.entreprise_id
      and f.statut <> 'brouillon';
    if not found then
      return null;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
             'designation', l.designation,
             'description', l.description,
             'quantite', l.quantite,
             'unite', l.unite,
             'prix_unitaire_ht', l.prix_unitaire_ht,
             'remise_ligne', l.remise_ligne,
             'taux_tva', l.taux_tva)
           order by l.ordre, l.created_at, l.id), '[]'::jsonb)
      into v_lignes
    from public.lignes_factures l
    where l.facture_id = v_acces.document_id;

  else
    return null;
  end if;

  -- Fiche client courante : uniquement pour un document sans identité figée.
  if jsonb_typeof(v_document -> 'client_snapshot') is distinct from 'object' then
    select jsonb_build_object(
             'nom', c.nom,
             'prenom', c.prenom,
             'societe', c.societe,
             'adresse_facturation', c.adresse_facturation,
             'code_postal', c.code_postal,
             'ville', c.ville,
             'siret', c.siret)
      into v_client
    from public.clients c
    where c.id = v_client_id
      and c.entreprise_id = v_acces.entreprise_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'employe_id', s.employe_id,
           'nom_signataire', s.nom_signataire,
           'fonction_signataire', s.fonction_signataire,
           'signed_at', s.signed_at,
           'document_sha256', s.document_sha256)
         order by s.signed_at, s.id), '[]'::jsonb)
    into v_signatures
  from public.signatures_documents s
  where s.entreprise_id = v_acces.entreprise_id
    and s.type_document = v_acces.type_document
    and s.document_id = v_acces.document_id;

  -- Identité émettrice : celle figée sur LE DOCUMENT si elle existe (déjà
  -- réduite aux colonnes d'en-tête par construire_entreprise_snapshot), sinon
  -- l'entreprise actuelle réduite aux mêmes colonnes.
  if jsonb_typeof(v_entreprise_figee) = 'object' then
    select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
      into v_entreprise
    from jsonb_each(v_entreprise_figee) s
    where s.key = any (c_cles_entete);
  else
    select (select jsonb_object_agg(k.key, k.value)
            from jsonb_each(to_jsonb(e)) k
            where k.key = any (c_cles_entete))
      into v_entreprise
    from public.entreprises e
    where e.id = v_acces.entreprise_id;
  end if;

  return jsonb_build_object(
    'type_document', v_acces.type_document,
    'document', v_document,
    'client', v_client,
    'lignes', v_lignes,
    'entreprise', v_entreprise,
    'signatures', v_signatures,
    'photos', v_photos
  );
end;
$$;

comment on function public.document_commercial_public_par_token(text) is
  'Accès externe (client sans compte) à UN devis ou UNE facture émis (jamais brouillon) par jeton de partage. Hache le jeton en clair, vérifie révocation/expiration/entreprise/statut, et ne renvoie que les champs imprimés — identité émettrice figée sur le document si elle existe. Remplace la lecture service_role des pages /document/[token] et /imprimer/partage/[token], fermée par 20260911000297.';

revoke all on function public.document_commercial_public_par_token(text) from public;
revoke all on function public.document_commercial_public_par_token(text) from anon, authenticated;
grant execute on function public.document_commercial_public_par_token(text) to service_role;

notify pgrst, 'reload schema';
