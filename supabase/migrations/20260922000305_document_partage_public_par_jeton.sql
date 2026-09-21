-- GP-EXTERNAL-PILOT-CLOSURE-V1 — restaure la lecture publique des documents
-- partagés (lien client + PDF joint aux e-mails), cassée par la révocation
-- des privilèges service_role de 20260911000297_gp_v1_rc_acl_prerequisites.sql
-- (héritée de 20260902000255_acl_reconciliation_v1.sql, Production).
--
-- Défaut : /document/[token] (lien envoyé au client) et
-- /imprimer/partage/[token] (source du PDF téléchargé ET de la pièce jointe
-- des e-mails, voir src/lib/documents-envoi.ts) lisent le document avec
-- createAdminClient() (service_role). 20260911000297 retire à service_role
-- tout privilège sur devis/factures/lignes_devis/lignes_factures/clients/
-- pieces_jointes_devis, et aucune migration postérieure ne les rétablit.
-- BYPASSRLS ne contourne pas les GRANT : PostgREST répond 42501, l'appli
-- traite ça comme "introuvable". Conséquence : lien client en 404, PDF
-- téléchargeable en 404, e-mail envoyé SANS pièce jointe (avec un lien qui
-- mène lui-même à une 404) — un vrai risque de "faux document" pour un
-- pilote externe (le client ne reçoit rien d'exploitable).
--
-- Correctif retenu : le plus étroit possible. On ne regrante AUCUNE table à
-- service_role (ce serait défaire 297/255 sur six tables entières pour un
-- seul usage). À la place, une fonction SECURITY DEFINER, résolue par le
-- jeton lui-même, renvoie uniquement le document visé :
--   - le jeton en clair est haché ici (SHA-256, comme hacherTokenPartage()) :
--     l'empreinte stockée dans acces_externes_documents ne suffit donc pas, à
--     elle seule, à ouvrir le document ;
--   - jeton révoqué, expiré, inconnu, pointant vers un document d'une autre
--     entreprise, OU document encore brouillon : NULL, sans distinction
--     (garde brouillon supplémentaire, en base, en plus du garde-fou
--     applicatif de envoyerDocumentCommercialParEmail — un brouillon ne doit
--     jamais pouvoir être consulté comme document officiel, même si un jeton
--     a été créé pour lui par un chemin non gardé) ;
--   - colonnes renvoyées = celles que DocumentImprimable affiche, rien
--     d'autre : jamais notes_internes, jamais les colonnes Stripe / bancaires
--     / de facturation de l'entreprise (seules les 23 colonnes d'en-tête de
--     ENTETE_ENTREPRISE_COLONNES), jamais l'e-mail, le téléphone ni le
--     contact du client (le snapshot est réduit aux clés de l'en-tête
--     destinataire) ;
--   - la fiche client courante n'est lue que pour un document sans identité
--     figée (brouillon en interne — mais alors non exposé, voir ci-dessus),
--     comme identiteClientDocument() côté application.
-- Exécution accordée à service_role SEUL : les pages serveur l'appellent avec
-- createAdminClient(). Ce rôle n'obtient qu'un accès « par jeton » : il ne
-- lit toujours ni devis, ni factures, ni leurs lignes, ni les clients, ni
-- même les empreintes de acces_externes_documents. Ni anon ni authenticated :
-- aucun point d'entrée PostgREST n'est ouvert à internet.
--
-- Retour arrière : drop function if exists public.document_commercial_public_par_token(text);
-- L'ancienne fonction public.document_commercial_par_token(text) n'est pas
-- modifiée ; elle n'est plus appelée par les pages publiques (remplacée par
-- chargerDonneesDocumentPartage() côté application).

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
begin
  -- Un jeton de partage fait 43 caractères base64url (32 octets aléatoires).
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
           d.client_id
      into v_document, v_client_id
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
             'entreprise_snapshot',
               case when jsonb_typeof(f.entreprise_snapshot) = 'object' then
                 coalesce(
                   (select jsonb_object_agg(s.key, s.value)
                    from jsonb_each(f.entreprise_snapshot) s
                    where s.key = any (c_cles_entete)),
                   '{}'::jsonb)
               end,
             'client_snapshot',
               case when jsonb_typeof(f.client_snapshot) = 'object' then
                 coalesce(
                   (select jsonb_object_agg(s.key, s.value)
                    from jsonb_each(f.client_snapshot) s
                    where s.key = any (c_cles_client)),
                   '{}'::jsonb)
               end,
             'client_snapshot_at', f.client_snapshot_at),
           f.client_id
      into v_document, v_client_id
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

  select (select jsonb_object_agg(k.key, k.value)
          from jsonb_each(to_jsonb(e)) k
          where k.key = any (c_cles_entete))
    into v_entreprise
  from public.entreprises e
  where e.id = v_acces.entreprise_id;

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
  'Accès externe (client sans compte) à UN devis ou UNE facture émis (jamais brouillon) par jeton de partage. Hache le jeton en clair, vérifie révocation/expiration/entreprise/statut, et ne renvoie que les champs imprimés. Remplace la lecture service_role des pages /document/[token] et /imprimer/partage/[token], fermée par 20260911000297.';

revoke all on function public.document_commercial_public_par_token(text) from public;
revoke all on function public.document_commercial_public_par_token(text) from anon, authenticated;
grant execute on function public.document_commercial_public_par_token(text) to service_role;

notify pgrst, 'reload schema';
