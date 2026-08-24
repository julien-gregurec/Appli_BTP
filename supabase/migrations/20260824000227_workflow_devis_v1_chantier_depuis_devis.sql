-- WORKFLOW-DEVIS-V1 : créer un chantier depuis un devis accepté, avec traçabilité et
-- idempotence garanties en base (pas seulement côté application).
--
-- devis.chantier_id existant = "ce devis concerne CE chantier" (choisi librement à tout
-- moment, chantier pouvant préexister). chantiers.devis_source_id (nouveau) = relation
-- inverse et distincte : "ce chantier a été CRÉÉ à partir de ce devis" — jamais réécrit,
-- jamais synchronisé après coup (cf. cahier des charges §21 : pas de synchronisation
-- bidirectionnelle).

alter table public.devis
  add constraint devis_id_entreprise_id_key unique (id, entreprise_id);

alter table public.chantiers
  add column if not exists description text,
  add column if not exists devis_source_id uuid;

-- FK composite (id, entreprise_id) : un chantier ne doit jamais pouvoir référencer le
-- devis d'une AUTRE entreprise, même avec un devis_id valide connu (même erreur déjà
-- corrigée ailleurs sur factures.devis_origine_id et documents_chantier.compte_rendu_id).
alter table public.chantiers
  add constraint chantiers_devis_source_id_fkey
  foreign key (devis_source_id, entreprise_id)
  references public.devis(id, entreprise_id);

-- Un seul chantier par devis source : la garantie d'idempotence la plus forte possible
-- (contrainte DB, pas seulement une vérification applicative contournable par un double
-- clic ou deux requêtes simultanées).
create unique index chantiers_devis_source_id_unique
  on public.chantiers(devis_source_id) where devis_source_id is not null;

create index chantiers_devis_source_id_idx
  on public.chantiers(devis_source_id) where devis_source_id is not null;

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

  -- Idempotence applicative (message clair) en plus de la contrainte unique ci-dessus
  -- (qui reste le filet de sécurité en cas de double clic/requêtes concurrentes).
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

revoke all on function public.creer_chantier_depuis_devis(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.creer_chantier_depuis_devis(uuid,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
