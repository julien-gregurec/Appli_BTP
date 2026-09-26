-- WORKFLOW-DEVIS-V1 : découverte réelle en recette live — le tableau de bord financier du
-- chantier (budget vs devis accepté, lignes devis -> tâches automatiques) dépend
-- entièrement de devis.chantier_id, qui n'était jamais renseigné par
-- creer_chantier_depuis_devis(). Le chantier fraîchement créé restait donc « vide »
-- (0 tâche, 0 € de devis accepté) malgré son budget prévisionnel correct, et le devis
-- source violait l'invariant déjà appliqué ailleurs par associerDevisChantierAction
-- (« Un devis accepté doit rester associé à un chantier afin de conserver ses tâches »).
--
-- Correction : lier réciproquement devis.chantier_id -> nouveau chantier, une seule fois
-- à la création (pas de synchronisation continue ensuite, conformément au cahier des
-- charges — le lien peut être changé manuellement plus tard via associerDevisChantierAction
-- comme pour n'importe quel autre devis).

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

  -- Lien réciproque unique, à la création seulement : réutilise le même mécanisme que le
  -- rattachement manuel (associerDevisChantierAction) pour que ce chantier bénéficie
  -- immédiatement du calcul budget/tâches déjà existant, sans dupliquer cette logique.
  if v_devis.chantier_id is null then
    update public.devis set chantier_id = v_chantier_id, updated_at = now() where id = p_devis_id;
  end if;

  return v_chantier_id;
exception
  when unique_violation then
    select id into v_chantier_existant from public.chantiers where devis_source_id = p_devis_id;
    raise exception 'chantier_existant:%', v_chantier_existant;
end;
$$;

notify pgrst, 'reload schema';
