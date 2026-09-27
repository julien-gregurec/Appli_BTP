-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — RECOVERY V2
-- Complément du contrat de données des éléments (`tools_releves_elements.donnees`).
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT2_FOUNDATION_RECOVERY_V2.md (§6).
--
-- Écarts constatés entre le contrat produit du Lot 2 et 20260927000601, comblés ici de façon
-- STRICTEMENT ADDITIVE (toute charge valide avant l'est encore ; aucune donnée migrée) :
--   mesure     : types `largeur`, `distance` (distance libre), `volume` (unité `mm3`) ;
--                source `calcule` (manuel / calculé / capturé) ;
--   annotation : `forme` facultative (texte, flèche, cercle, zone, cote, symbole, commentaire ;
--                absente = texte), `geometrie` facultative ; texte exigé pour texte/commentaire ;
--   ouverture  : `metadata` facultative (objet) ;
--   mur        : `piecesAdjacentesIds` (mur mitoyen) et `materiauId` facultatifs ;
--   materiau   : `revetement` facultatif (peinture, carrelage, faïence, parquet, …) ;
--   quantite   : `sources` (objets mesurés : pièce, mur, ouverture…) et `gpOuvrageRef` facultatifs.
-- Miroir TypeScript : packages/releve-domain/src/{model,validation}.ts (parité : sql-parity.test.ts).
-- Bornes JSON : le domaine borne `JSON.stringify` à 8 000 caractères, la base borne le texte
-- jsonb (qui ajoute des espaces) à 16 000 : le domaine est toujours au moins aussi strict.
-- L'appariement type ↔ unité (mm, mm2, mm3, rad) reste appliqué par le domaine, comme avant :
-- l'imposer ici rendrait invalides à la mise à jour d'éventuelles lignes existantes.
-- Le CHECK de `tools_releves_elements` référence cette fonction : `create or replace` suffit, et
-- les lignes existantes, valides pour l'ancienne définition, le restent pour la nouvelle.

create or replace function public.tools_releve_uuid_facultatif_valide(p_valeur jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_valeur is null or jsonb_typeof(p_valeur) = 'null'
    or (jsonb_typeof(p_valeur) = 'string' and p_valeur #>> '{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
$$;

create or replace function public.tools_releve_liste_uuid_valide(p_valeur jsonb, p_max integer)
returns boolean language sql immutable set search_path = public as $$
  select p_valeur is null or (jsonb_typeof(p_valeur) = 'array' and jsonb_array_length(p_valeur) <= p_max
    and not exists (select 1 from jsonb_array_elements(p_valeur) e
                    where jsonb_typeof(e) <> 'string'
                       or e #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'));
$$;

create or replace function public.tools_releve_objet_facultatif_valide(p_valeur jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_valeur is null or jsonb_typeof(p_valeur) = 'null'
    or (jsonb_typeof(p_valeur) = 'object' and char_length(p_valeur::text) <= 16000);
$$;

create or replace function public.tools_releve_element_donnees_valides(p_type text, p_donnees jsonb)
returns boolean language sql immutable set search_path = public as $$
  -- `coalesce(…, false)` : une clé absente rend l'expression NULL, qu'un CHECK accepterait.
  select coalesce(jsonb_typeof(p_donnees) = 'object' and case p_type
    when 'mur' then jsonb_typeof(p_donnees->'a') = 'object' and jsonb_typeof(p_donnees->'b') = 'object'
      and jsonb_typeof(p_donnees->'a'->'x') = 'number' and jsonb_typeof(p_donnees->'a'->'y') = 'number'
      and jsonb_typeof(p_donnees->'b'->'x') = 'number' and jsonb_typeof(p_donnees->'b'->'y') = 'number'
      and jsonb_typeof(p_donnees->'epaisseurMm') = 'number' and (p_donnees->>'epaisseurMm')::numeric > 0
      and p_donnees->>'typeMur' in ('exterieur','porteur','cloison','doublage')
      and public.tools_releve_liste_uuid_valide(p_donnees->'piecesAdjacentesIds', 50)
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'materiauId')
    when 'ouverture' then jsonb_typeof(p_donnees->'decalageMm') = 'number' and (p_donnees->>'decalageMm')::numeric >= 0
      and jsonb_typeof(p_donnees->'largeurMm') = 'number' and (p_donnees->>'largeurMm')::numeric > 0
      and jsonb_typeof(p_donnees->'hauteurMm') = 'number' and (p_donnees->>'hauteurMm')::numeric > 0
      and p_donnees->>'typeOuverture' in ('porte','fenetre','porte_fenetre','baie','tremie','passage')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'metadata')
    when 'equipement' then p_donnees->>'categorie' in ('mobilier','electricite','plomberie','cvc','eclairage','autre')
      and jsonb_typeof(p_donnees->'position') = 'object' and coalesce(btrim(p_donnees->>'libelle'), '') <> ''
    when 'mesure' then jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'typeMesure' in ('longueur','largeur','hauteur','diagonale','distance','angle','surface','volume')
      and p_donnees->>'unite' in ('mm','rad','mm2','mm3')
      and p_donnees->>'source' in ('manuel','calcule','laser','photo','ar','lidar')
      and jsonb_typeof(p_donnees->'cible') = 'object'
    when 'photo_anchor' then coalesce(p_donnees->>'mediaId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_donnees->'ancre') = 'object'
    when 'annotation' then jsonb_typeof(p_donnees->'ancre') = 'object'
      and (p_donnees->'forme' is null or jsonb_typeof(p_donnees->'forme') = 'null'
           or p_donnees->>'forme' in ('texte','fleche','cercle','zone','cote','symbole','commentaire'))
      and jsonb_typeof(p_donnees->'texte') = 'string' and char_length(p_donnees->>'texte') <= 2000
      and (coalesce(p_donnees->>'forme', 'texte') not in ('texte','commentaire') or btrim(p_donnees->>'texte') <> '')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'geometrie')
    when 'materiau' then coalesce(btrim(p_donnees->>'libelle'), '') <> ''
      and p_donnees->>'categorie' in ('sol','mur','plafond','plinthe','menuiserie','autre')
      and p_donnees->>'unite' in ('m2','ml','m3','u')
      and (p_donnees->'revetement' is null or jsonb_typeof(p_donnees->'revetement') = 'null'
           or p_donnees->>'revetement' in ('peinture','carrelage','faience','parquet','stratifie','moquette','pvc','panneau_decoratif','papier_peint','enduit','beton','autre'))
    when 'quantite' then coalesce(btrim(p_donnees->>'cle'), '') <> '' and coalesce(btrim(p_donnees->>'formule'), '') <> ''
      and jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'unite' in ('m2','ml','m3','u') and p_donnees->>'qualite' in ('exacte','estimee')
      and (p_donnees->'sources' is null or (jsonb_typeof(p_donnees->'sources') = 'array'
           and jsonb_array_length(p_donnees->'sources') <= 50
           and not exists (select 1 from jsonb_array_elements(p_donnees->'sources') s where jsonb_typeof(s) <> 'object')))
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'gpOuvrageRef')
    else false
  end, false);
$$;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.tools_releve_uuid_facultatif_valide(jsonb)',
    'public.tools_releve_liste_uuid_valide(jsonb,integer)',
    'public.tools_releve_objet_facultatif_valide(jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
