-- ELS-REC-004 : les codes d'identification internes (étiquettes QR chantier, véhicule,
-- outil, article, employé) étaient générés avec l'ancien préfixe de marque "LGP-" hérité
-- de Liria Gestion Pro. L'application s'appelle désormais ELSATIA Gestion Pro : cette
-- migration fait basculer la génération et les codes déjà stockés vers le préfixe "ELS-".
-- Les étiquettes physiques imprimées avant ce changement restent lisibles : leur
-- compatibilité est assurée côté application par normaliserCodeIdentification() (voir
-- src/lib/qr-identification.ts), appelée avant toute recherche par code scanné — aucun
-- code LGP-* n'est donc plus jamais réécrit en base après cette migration.
--
-- Ne modifie ni ne remplace 20260713000068_codes_qr_borne_stock_securisee.sql : les
-- fonctions ci-dessous sont re-déclarées via CREATE OR REPLACE, comme le veut la
-- convention déjà suivie dans ce dossier pour faire évoluer une fonction existante.
-- CREATE OR REPLACE conserve les privilèges déjà accordés sur ces fonctions (revoke/grant
-- de 20260713000068) : aucun droit n'est donc réinitialisé ici.
--
-- Ordre des opérations (chaque étape dépend de la précédente) :
--   1. validation SQL temporaire acceptant LGP-* et ELS-*, pour ne pas bloquer la
--      conversion en masse de l'étape 4 ;
--   2. génération future exclusivement en ELS-* ;
--   3. contrôle GLOBAL de toutes les collisions possibles, avant la moindre écriture ;
--   4. conversion en masse des 5 préfixes connus, suffixe préservé au caractère près ;
--   5. garde-fou explicite : confirme qu'aucun code LGP-* connu ne subsiste ;
--   6. validation SQL définitive, strictement ELS-* (fin de la fenêtre de compatibilité).

-- 1) Compatibilité temporaire : le trigger doit accepter les deux formats le temps que
-- l'étape 4 réécrive chaque ligne LGP-* en ELS-*, sans quoi il rejetterait lui-même la
-- valeur qu'il est en train de valider (BEFORE UPDATE, exécuté sur chaque ligne convertie).
create or replace function public.verifier_code_identification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.code_identification_existe(new.entreprise_id,new.type_ressource,new.ressource_id) then
    raise exception 'La ressource ne correspond pas à cette entreprise';
  end if;
  new.code:=upper(btrim(new.code));
  if new.code !~ '^(LGP|ELS)-[A-Z]{2,4}-[A-Z0-9]{6,16}$' then raise exception 'Format de code interne invalide'; end if;
  new.updated_at:=now();
  return new;
end;$$;

-- 2) Génération future : les nouvelles ressources reçoivent exclusivement un code ELS-*.
create or replace function public.creer_code_identification(
  p_entreprise_id uuid,p_type text,p_ressource_id uuid
) returns public.codes_identification
language plpgsql security definer set search_path=public as $$
declare v_prefix text;v_code text;v_ligne public.codes_identification;
begin
  if auth.uid() is not null and auth.role() is distinct from 'anon' and not (
    public.a_permission(p_entreprise_id,'gerer_stock') or
    (p_type='chantier' and public.a_permission(p_entreprise_id,'gerer_chantiers')) or
    (p_type='vehicule' and public.a_permission(p_entreprise_id,'gerer_flotte')) or
    (p_type='outil' and public.a_permission(p_entreprise_id,'gerer_outillage')) or
    (p_type='employe' and public.a_permission(p_entreprise_id,'gerer_employes'))
  ) then raise exception 'Accès refusé'; end if;
  if not public.code_identification_existe(p_entreprise_id,p_type,p_ressource_id) then raise exception 'Ressource introuvable'; end if;
  v_prefix:=case p_type when 'article' then 'ART' when 'chantier' then 'CH' when 'vehicule' then 'VEH' when 'outil' then 'OUT' else 'EMP' end;
  loop
    v_code:='ELS-'||v_prefix||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.codes_identification where entreprise_id=p_entreprise_id and code=v_code);
  end loop;
  insert into public.codes_identification(entreprise_id,type_ressource,ressource_id,code,actif)
  values(p_entreprise_id,p_type,p_ressource_id,v_code,true)
  on conflict(entreprise_id,type_ressource,ressource_id)
  do update set code=excluded.code,actif=true,updated_at=now()
  returning * into v_ligne;
  return v_ligne;
end;$$;

-- 3) Contrôle GLOBAL des collisions, avant toute conversion : pour chaque ligne LGP-* des
-- 5 préfixes connus, recherche si le code ELS-* cible existe déjà pour la même entreprise
-- (portée de la contrainte unique entreprise_id+code ; comparaison insensible à la casse,
-- cohérente avec les recherches applicatives existantes qui font toutes upper(code)=...).
-- Cette étape est un SELECT pur, exécutée intégralement avant le premier UPDATE de l'étape
-- 4 : la première collision trouvée fait échouer toute la migration sans avoir modifié une
-- seule ligne.
do $$
declare v_entreprise_id uuid; v_ancien_code text; v_nouveau_code text;
begin
  select conv.entreprise_id, conv.ancien_code, conv.nouveau_code
  into v_entreprise_id, v_ancien_code, v_nouveau_code
  from (
    select src.id, src.entreprise_id, src.code as ancien_code,
      p.nouveau || substr(src.code, length(p.ancien) + 1) as nouveau_code
    from public.codes_identification src
    join (values
      ('LGP-EMP-','ELS-EMP-'),
      ('LGP-ART-','ELS-ART-'),
      ('LGP-CH-','ELS-CH-'),
      ('LGP-VEH-','ELS-VEH-'),
      ('LGP-OUT-','ELS-OUT-')
    ) as p(ancien,nouveau) on src.code like p.ancien || '%'
  ) conv
  where exists (
    select 1 from public.codes_identification c2
    where c2.entreprise_id = conv.entreprise_id
      and c2.id <> conv.id
      and upper(c2.code) = upper(conv.nouveau_code)
  )
  order by conv.entreprise_id, conv.ancien_code
  limit 1;

  if v_ancien_code is not null then
    raise exception 'Migration QR LGP->ELS annulée avant toute modification : conversion de % vers % impossible pour l''entreprise % — ce code existe déjà',
      v_ancien_code, v_nouveau_code, v_entreprise_id;
  end if;
end $$;

-- 4) Conversion en masse : LGP-<PREFIXE>-<SUFFIXE> -> ELS-<PREFIXE>-<SUFFIXE>, exactement
-- pour les 5 préfixes connus, suffixe préservé au caractère près. Aucune collision n'est
-- possible ici : l'étape 3 les a déjà exclues pour l'ensemble du jeu de données avant ce
-- point. Idempotente : une ré-exécution ne trouve plus aucune ligne LGP-* et met à jour 0
-- ligne.
update public.codes_identification cible
set code = conv.nouveau_code, updated_at = now()
from (
  select src.id,
    p.nouveau || substr(src.code, length(p.ancien) + 1) as nouveau_code
  from public.codes_identification src
  join (values
    ('LGP-EMP-','ELS-EMP-'),
    ('LGP-ART-','ELS-ART-'),
    ('LGP-CH-','ELS-CH-'),
    ('LGP-VEH-','ELS-VEH-'),
    ('LGP-OUT-','ELS-OUT-')
  ) as p(ancien,nouveau) on src.code like p.ancien || '%'
) conv
where cible.id = conv.id;

-- 5) Garde-fou explicite : confirme qu'aucun code LGP-* connu ne subsiste avant de refermer
-- la fenêtre de compatibilité de la validation SQL. Ne devrait jamais se déclencher compte
-- tenu des étapes 3 et 4 ci-dessus ; sert de filet de sécurité avant l'étape 6.
do $$
begin
  if exists (
    select 1 from public.codes_identification
    where code like 'LGP-EMP-%' or code like 'LGP-ART-%' or code like 'LGP-CH-%'
       or code like 'LGP-VEH-%' or code like 'LGP-OUT-%'
  ) then
    raise exception 'Migration QR LGP->ELS incomplète : des codes LGP-* subsistent après la conversion';
  end if;
end $$;

-- 6) Validation SQL définitive : ne référence plus que le préfixe ELS-*, seul désormais
-- généré (étape 2) et seul stocké (étapes 4 et 5). Aucun autre point d'écriture n'existe
-- vers codes_identification.code (vérifié : la seule fonction qui y insère est
-- creer_code_identification() ci-dessus ; aucune route ni server action n'y insère ou n'y
-- met à jour de code directement). La forme du motif ([A-Z]{2,4} pour le segment de type)
-- reste identique à celle d'origine, seul le préfixe de marque change.
create or replace function public.verifier_code_identification()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not public.code_identification_existe(new.entreprise_id,new.type_ressource,new.ressource_id) then
    raise exception 'La ressource ne correspond pas à cette entreprise';
  end if;
  new.code:=upper(btrim(new.code));
  if new.code !~ '^ELS-[A-Z]{2,4}-[A-Z0-9]{6,16}$' then raise exception 'Format de code interne invalide'; end if;
  new.updated_at:=now();
  return new;
end;$$;

-- Aucune autre table n'est modifiée : codes_identification.code n'est référencé par
-- aucune clé étrangère (vérifié : aucun "references ... codes_identification(code)" dans
-- tout le dossier supabase/migrations). mouvements_stock.code_scan_utilise est une colonne
-- d'audit renseignée une seule fois à l'insertion, jamais relue ni recomparée par
-- l'application (aucune lecture dans src/) : les lignes déjà écrites, qui contiennent des
-- valeurs LGP-*, restent volontairement inchangées. Pour les nouveaux mouvements créés
-- après cette migration à partir d'une ancienne étiquette LGP-* scannée, cette colonne
-- enregistrera désormais la forme ELS-* normalisée (nécessaire côté application pour que
-- la recherche retrouve l'article, cf. src/app/actions/stock.ts) plutôt que la valeur brute
-- scannée : décision assumée en l'absence de tout lecteur exigeant la valeur brute.
notify pgrst,'reload schema';
