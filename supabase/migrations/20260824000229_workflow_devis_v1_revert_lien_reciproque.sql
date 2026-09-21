-- WORKFLOW-DEVIS-V1 : la migration précédente (20260824000228) tentait de lier
-- réciproquement devis.chantier_id -> nouveau chantier à la création. Vérifié en recette
-- live sur Preview : CASSE INTÉGRALEMENT la création de chantier. Cause réelle, découverte
-- en base (fonction absente de tout fichier de migration versionné — dérive de schéma non
-- documentée, comme déjà rencontré ailleurs cette session) : un trigger
-- verrouiller_devis_accepte() bloque INCONDITIONNELLEMENT toute modification de
-- devis.chantier_id dès que statut='accepte' — or c'est précisément l'état du devis à ce
-- stade (l'éligibilité l'exige). La mise à jour levait donc systématiquement l'exception
-- du trigger, annulant toute la transaction (donc aussi l'INSERT du chantier lui-même).
--
-- Revert immédiat vers la version de 20260824000227 (sans la liaison réciproque). Le lien
-- devis.chantier_id sur un devis déjà accepté ne peut techniquement pas être posé
-- automatiquement dans ce produit tel qu'il existe aujourd'hui — la traçabilité reste
-- entièrement assurée par chantiers.devis_source_id (sens inverse, non concerné par ce
-- trigger). Documenté comme limite connue plutôt que contournée en affaiblissant un
-- verrou métier volontaire hors périmètre de ce lot.

create or replace function public.creer_chantier_depuis_devis(
  p_devis_id uuid,
  p_nom text,
  p_adresse text default null,
  p_code_postal text default null,
  p_ville text default null,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis%rowtype;
  v_chantier_existant uuid;
  v_chantier_id uuid;
  v_nom text := btrim(coalesce(p_nom, ''));
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found or not public.est_membre_actif(v_devis.entreprise_id) then
    raise exception 'Devis introuvable';
  end if;
  if not public.a_permission(v_devis.entreprise_id, 'gerer_chantiers') then
    raise exception 'Accès refusé';
  end if;
  if v_devis.statut <> 'accepte' then
    raise exception 'Le devis doit être accepté avant de créer un chantier';
  end if;
  if v_nom = '' then
    raise exception 'Le chantier doit avoir un nom';
  end if;

  select id into v_chantier_existant from public.chantiers where devis_source_id = p_devis_id;
  if found then
    raise exception 'chantier_existant:%', v_chantier_existant;
  end if;

  insert into public.chantiers (
    entreprise_id, client_id, nom, adresse, code_postal, ville, description,
    statut, budget_previsionnel, devis_source_id
  ) values (
    v_devis.entreprise_id, v_devis.client_id, v_nom,
    nullif(btrim(coalesce(p_adresse, '')), ''),
    nullif(btrim(coalesce(p_code_postal, '')), ''),
    nullif(btrim(coalesce(p_ville, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    'accepte', v_devis.montant_ht, p_devis_id
  )
  returning id into v_chantier_id;

  return v_chantier_id;
exception
  when unique_violation then
    select id into v_chantier_existant from public.chantiers where devis_source_id = p_devis_id;
    raise exception 'chantier_existant:%', v_chantier_existant;
end;
$$;

notify pgrst, 'reload schema';
