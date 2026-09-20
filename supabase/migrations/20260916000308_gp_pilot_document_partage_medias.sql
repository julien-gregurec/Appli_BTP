-- GP-EXTERNAL-PILOT-CLOSURE-V1 — rejoue et corrige le finding "PDF public /
-- images" (mission §9) : confirmé, pas seulement suspecté.
--
-- Preuve : `DocumentImprimable` (src/components/DocumentImprimable.tsx)
-- affiche les photos jointes à un devis via
-- `<img src="/api/devis/pieces-jointes/{id}">` et les signatures internes via
-- `<img src="/api/employes/{employe_id}/signature?document={id}">`. Les DEUX
-- routes appellent `getContexteEntreprise()` (session ELSATIA requise) avant
-- de générer l'URL signée Storage. Sur la page publique par jeton
-- (/document/[token], /imprimer/partage/[token] — donc aussi le PDF généré
-- par Chromium pour le lien public ET la pièce jointe e-mail), il n'y a AUCUNE
-- session : ces deux routes redirigent vers /login ou renvoient 401/403,
-- l'image ne charge jamais. Un devis avec photo(s) jointe(s) ou une facture
-- avec signature interne produit donc, côté public, un document avec des
-- images cassées — silencieusement, sans erreur visible côté serveur.
--
-- Correctif, même schéma que document_commercial_public_par_token
-- (20260915000300) : une fonction SECURITY DEFINER résolue par LE MÊME
-- jeton, qui ne renvoie le chemin de stockage QUE si le média demandé
-- appartient RÉELLEMENT au document que ce jeton précis ouvre (jamais un
-- média choisi librement par l'appelant) — jamais de table rouverte à
-- service_role, jamais de fichier interne rendu public en dehors de ce
-- document précis.
create or replace function public.document_partage_media_path(
  p_token text, p_type text, p_media_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acces record;
  v_storage_path text;
  v_bucket text;
begin
  if p_token is null or length(p_token) not between 32 and 128 then
    return null;
  end if;
  if p_type not in ('photo', 'signature') then
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

  -- Le document doit être émis (jamais un brouillon), même garde que
  -- document_commercial_public_par_token : un média ne doit pas être
  -- accessible pour un document que la fonction sœur refuserait déjà.
  if v_acces.type_document = 'devis' then
    if not exists (
      select 1 from public.devis d
      where d.id = v_acces.document_id and d.entreprise_id = v_acces.entreprise_id and d.statut <> 'brouillon'
    ) then
      return null;
    end if;
  elsif v_acces.type_document = 'facture' then
    if not exists (
      select 1 from public.factures f
      where f.id = v_acces.document_id and f.entreprise_id = v_acces.entreprise_id and f.statut <> 'brouillon'
    ) then
      return null;
    end if;
  else
    return null;
  end if;

  if p_type = 'photo' then
    -- Seule une photo (image, pas audio) du devis ouvert par CE jeton précis.
    if v_acces.type_document <> 'devis' then return null; end if;
    select p.storage_path into v_storage_path
    from public.pieces_jointes_devis p
    where p.id = p_media_id
      and p.entreprise_id = v_acces.entreprise_id
      and p.devis_id = v_acces.document_id
      and p.type_media = 'image';
    v_bucket := 'devis-medias';
  else
    -- Seule une signature attachée à CE document précis (même type et même id).
    select s.signature_storage_path into v_storage_path
    from public.signatures_documents s
    join public.employes e on e.id = s.employe_id and e.entreprise_id = s.entreprise_id
    where s.id = p_media_id
      and s.entreprise_id = v_acces.entreprise_id
      and s.type_document = v_acces.type_document
      and s.document_id = v_acces.document_id;
    v_bucket := 'documents-employes';
  end if;

  if v_storage_path is null then
    return null;
  end if;

  return jsonb_build_object('bucket', v_bucket, 'storage_path', v_storage_path);
end;
$$;

comment on function public.document_partage_media_path(text, text, uuid) is
  'Résout le chemin de stockage (bucket + storage_path) d''une photo ou d''une signature affichée sur un document commercial partagé, si et seulement si ce média appartient au document que CE jeton précis ouvre (document émis, jamais brouillon). Jamais de table rouverte à service_role.';

revoke all on function public.document_partage_media_path(text, text, uuid) from public;
revoke all on function public.document_partage_media_path(text, text, uuid) from anon, authenticated;
grant execute on function public.document_partage_media_path(text, text, uuid) to service_role;

notify pgrst, 'reload schema';
