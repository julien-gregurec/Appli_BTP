-- ELSATIA Colors V1.5 — finition du produit et persistance de la référence de nuancier.
--
-- Origine : `docs/migrations-proposees/colors-finition-et-reference-nuancier-v1.sql.proposed`,
-- conservé tel quel pour mémoire. Le présent fichier n'en est PAS la promotion :
-- l'audit ligne à ligne mené avant intégration y a relevé trois défauts dont un
-- aurait cassé la fonctionnalité à l'exécution. Ils sont corrigés ici, et
-- consignés dans `docs/audits/ELSATIA-COLORS-PILOT-READINESS-V1.md`.
--
--  1. La proposition appelait `public.colors_diff_seau_base`, fonction qui
--     n'existe pas, et laissait son extraction « à l'application de la
--     migration ». Une migration ne délègue pas une étape indispensable : la
--     voici écrite en entier, sans fonction intermédiaire.
--  2. Elle réécrivait `colors_diff_seau` en `plpgsql volatile` alors que la
--     fonction réelle est `sql immutable` bâtie sur une liste `VALUES`. Changer
--     la volatilité d'une fonction appelée dans des expressions n'est jamais
--     neutre ; la forme d'origine est conservée et seulement étendue.
--  3. Défaut bloquant : `colors_valider_mouvement` (V1.4) porte une liste
--     blanche des champs journalisables. Les entrées `finition`,
--     `reference_nuancier` et `reference_confirmee` que la proposition insérait
--     auraient été rejetées à l'exécution par
--     `raise exception 'Champ Colors non journalisable'`. Toute modification de
--     finition aurait échoué. La liste blanche est étendue ici, en même temps
--     que le diff qui l'alimente.
--
-- ## Ce que cette migration ne fait pas
--
-- Elle **n'élargit pas** `colors_seaux_ral_approxime_check`, qui impose
-- `^RAL [0-9]{4}$`. Conséquence assumée et documentée : seule une référence au
-- format RAL peut être PERSISTÉE. Une référence de nuancier fabricant reste
-- proposée à l'écran et exportée, sans pouvoir être confirmée. Élargir cette
-- contrainte est une décision de produit — que contient au juste une colonne
-- nommée `ral_approxime` — et non un détail technique : elle est laissée en
-- suspens plutôt que tranchée ici. `colors_definir_reference_nuancier` refuse
-- donc explicitement une référence non-RAL, sous le SQLSTATE dédié `CLR01`, au
-- lieu de laisser la contrainte de table produire une erreur opaque.
--
-- Elle ne supprime ni ne réécrit aucune donnée. `finition` arrive avec une
-- valeur par défaut applicable à toutes les lignes existantes, et cette valeur
-- est `indetermine` : l'état honnête d'un seau dont personne n'a lu
-- l'étiquette. Aucune finition n'est devinée pour l'historique.
--
-- Le DDL est protégé par des gardes d'existence : rejouer ce fichier ne produit
-- aucune erreur ni aucun effet second.

begin;

-- 1. Colonne `finition` ------------------------------------------------------
--    Déclarée d'après l'étiquette, jamais estimée depuis une photographie : le
--    brillant apparent d'une surface sur une image dépend de l'angle de prise
--    de vue et de l'éclairage. `indetermine` est une valeur de plein droit et
--    le défaut, pas un échec.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'colors_seaux' and column_name = 'finition'
  ) then
    alter table public.colors_seaux
      add column finition text not null default 'indetermine';
    alter table public.colors_seaux
      add constraint colors_seaux_finition_v15
      check (finition in ('mat','satine','brillant','texture','indetermine'));
  end if;
end;
$$;

comment on column public.colors_seaux.finition is
  'Finition déclarée d''après l''étiquette (mat, satiné, brillant, texturé) ou indéterminée. Jamais estimée depuis une photographie.';

-- Index partiel : les écrans filtrent « seaux dont la finition est connue »
-- pour préparer un chantier. Les lignes `indetermine` sont majoritaires et
-- n'ont aucun intérêt en filtre — les exclure garde l'index petit.
create index if not exists colors_seaux_finition_idx
  on public.colors_seaux (entreprise_id, finition)
  where finition <> 'indetermine';

-- 2. Diff journalisé ---------------------------------------------------------
--    Même forme que la V1.4 — `sql immutable`, liste `VALUES`, valeurs tronquées
--    par `colors_extrait_valeur` — étendue de trois lignes. `ral_distance` n'y
--    figure volontairement pas : c'est une valeur dérivée du couple
--    (teinte déclarée, nuancier chargé), elle ne décrit aucune intention
--    humaine et encombrerait le journal à chaque recalcul.
create or replace function public.colors_diff_seau(avant public.colors_seaux, apres public.colors_seaux)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'champ', c.champ,
        'avant', public.colors_extrait_valeur(c.valeur_avant),
        'apres', public.colors_extrait_valeur(c.valeur_apres)
      ) order by c.rang
    ),
    '[]'::jsonb
  )
  from (values
    (1,  'marque',                avant.marque,            apres.marque),
    (2,  'produit',               avant.produit,           apres.produit),
    (3,  'reference_produit',     avant.reference_produit, apres.reference_produit),
    (4,  'teinte_nom',            avant.teinte_nom,        apres.teinte_nom),
    (5,  'teinte_reference',      avant.teinte_reference,  apres.teinte_reference),
    (6,  'couleur_hex',           avant.couleur_hex,       apres.couleur_hex),
    (7,  'notes',                 avant.notes,             apres.notes),
    (8,  'finition',              avant.finition,          apres.finition),
    (9,  'reference_nuancier',    avant.ral_approxime,     apres.ral_approxime),
    (10, 'reference_confirmee',
         case when avant.ral_confirme then 'oui' else 'non' end,
         case when apres.ral_confirme then 'oui' else 'non' end)
  ) as c(rang, champ, valeur_avant, valeur_apres)
  where c.valeur_avant is distinct from c.valeur_apres;
$$;

comment on function public.colors_diff_seau(public.colors_seaux,public.colors_seaux) is
  'Diff des champs descriptifs d''un seau Colors, finition et référence de nuancier comprises. Ne couvre jamais la photo, les quantités ni l''état : ces flux ont leurs propres types de mouvement.';

-- 3. Liste blanche du journal ------------------------------------------------
--    Reprise fidèle de la V1.4 — écriture réservée à `postgres`, donc aux seules
--    RPC SECURITY DEFINER, bornes de taille et forme du diff — augmentée des
--    trois champs que la fonction ci-dessus peut désormais produire. Sans cette
--    extension, toute modification de finition échouerait sur
--    « Champ Colors non journalisable ».
create or replace function public.colors_valider_mouvement()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_entree jsonb; v_champ text;
begin
  if current_user <> 'postgres' then raise exception 'Le journal Colors est réservé aux actions métier'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.auteur_id := auth.uid(); end if;
  if new.champs_modifies is not null then
    if octet_length(new.champs_modifies::text) > 8192 then
      raise exception 'Diff Colors trop volumineux pour le journal';
    end if;
    for v_entree in select value from jsonb_array_elements(new.champs_modifies) loop
      if jsonb_typeof(v_entree) <> 'object' then raise exception 'Diff Colors invalide'; end if;
      v_champ := v_entree ->> 'champ';
      if v_champ is null or v_champ not in (
        'marque','produit','reference_produit','teinte_nom','teinte_reference',
        'couleur_hex','notes','photo',
        'finition','reference_nuancier','reference_confirmee'
      ) then
        raise exception 'Champ Colors non journalisable';
      end if;
      if (v_entree -> 'avant') is null or (v_entree -> 'apres') is null then
        raise exception 'Diff Colors incomplet';
      end if;
    end loop;
  end if;
  return new;
end; $$;

-- 4. Écriture de la finition -------------------------------------------------
--    `colors_valider_seau` refuse toute mutation de `colors_seaux` dont
--    l'appelant n'est pas `postgres` : c'est cette RPC, et elle seule, qui
--    ouvre la voie. Elle exige `modifier_seau`, comme la modification des
--    autres champs descriptifs.
create or replace function public.colors_definir_finition(p_seau_id uuid, p_finition text)
returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare avant public.colors_seaux; v public.colors_seaux; v_diff jsonb;
begin
  select * into avant from public.colors_seaux where id = p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'modifier_seau') then
    raise exception 'Accès Colors refusé';
  end if;
  if p_finition is null or p_finition not in ('mat','satine','brillant','texture','indetermine') then
    raise exception 'Finition Colors invalide';
  end if;
  if avant.finition = p_finition then return avant; end if;

  update public.colors_seaux set finition = p_finition where id = avant.id returning * into v;
  v_diff := public.colors_diff_seau(avant, v);
  if jsonb_array_length(v_diff) > 0 then
    insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,
      pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,
      etat_avant,etat_apres,auteur_id,motif,champs_modifies)
    values(v.entreprise_id,v.id,'modification',v.quantite_restante,v.quantite_restante,
      v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,
      v.etat,v.etat,auth.uid(),null,v_diff);
  end if;
  return v;
end; $$;

comment on function public.colors_definir_finition(uuid,text) is
  'Déclare la finition d''un seau. Seule voie d''écriture de cette colonne ; journalise la correction humaine.';

-- 5. Écriture de la référence de nuancier ------------------------------------
--    `p_confirme` est le seul point du modèle où une proposition de proximité
--    devient une donnée assumée par l'organisation. Il n'est jamais positionné
--    par un calcul : la couche applicative ne l'envoie qu'à la suite d'un geste
--    humain explicite.
create or replace function public.colors_definir_reference_nuancier(
  p_seau_id uuid, p_reference text, p_distance numeric default null, p_confirme boolean default false
) returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare avant public.colors_seaux; v public.colors_seaux; v_diff jsonb; v_reference text;
begin
  select * into avant from public.colors_seaux where id = p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'modifier_seau') then
    raise exception 'Accès Colors refusé';
  end if;

  v_reference := nullif(btrim(coalesce(p_reference,'')),'');

  -- Refus explicite plutôt qu'une violation de contrainte opaque. Voir l'en-tête
  -- de cette migration : la colonne n'accepte aujourd'hui que le format RAL, et
  -- l'élargir est une décision de produit non tranchée.
  if v_reference is not null and v_reference !~ '^RAL [0-9]{4}$' then
    -- SQLSTATE dédié, et non le P0001 générique : la couche applicative doit
    -- distinguer ce refus des autres pour afficher « la proposition reste
    -- visible, elle ne peut simplement pas être confirmée ». Faire reposer cette
    -- distinction sur le texte français du message serait un contrat fragile —
    -- une reformulation le romprait en silence.
    raise exception 'Référence de nuancier non persistable : seul le format RAL est accepté par ce schéma'
      using errcode = 'CLR01';
  end if;
  if coalesce(p_confirme,false) and v_reference is null then
    raise exception 'Une référence est requise pour être confirmée';
  end if;
  if p_distance is not null and p_distance < 0 then
    raise exception 'Écart de nuancier invalide';
  end if;

  update public.colors_seaux
     set ral_approxime = v_reference,
         ral_distance  = case when v_reference is null then null else p_distance end,
         ral_confirme  = coalesce(p_confirme,false)
   where id = avant.id returning * into v;

  v_diff := public.colors_diff_seau(avant, v);
  if jsonb_array_length(v_diff) > 0 then
    insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,
      pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,
      etat_avant,etat_apres,auteur_id,motif,champs_modifies)
    values(v.entreprise_id,v.id,'modification',v.quantite_restante,v.quantite_restante,
      v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,
      v.etat,v.etat,auth.uid(),null,v_diff);
  end if;
  return v;
end; $$;

comment on function public.colors_definir_reference_nuancier(uuid,text,numeric,boolean) is
  'Enregistre ou efface la référence de nuancier d''un seau et son écart. La confirmation est un geste humain, jamais le résultat d''un calcul.';

-- 6. Droits ------------------------------------------------------------------
--    Mêmes règles que les six RPC Colors existantes : rien pour `public`,
--    `anon` ni `service_role`, exécution pour `authenticated`, l'habilitation
--    étant vérifiée dans le corps par `colors_action_autorisee`.
revoke all on function public.colors_definir_finition(uuid,text) from public, anon, service_role;
revoke all on function public.colors_definir_reference_nuancier(uuid,text,numeric,boolean) from public, anon, service_role;
grant execute on function public.colors_definir_finition(uuid,text) to authenticated;
grant execute on function public.colors_definir_reference_nuancier(uuid,text,numeric,boolean) to authenticated;

-- La colonne suit les droits de la table : aucun `grant` supplémentaire n'est
-- nécessaire, et `colors_seaux` n'accorde toujours que SELECT et INSERT au rôle
-- applicatif — la mise à jour reste impossible hors RPC.

notify pgrst,'reload schema';

commit;
