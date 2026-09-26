-- ELS-REC-004 : les codes d'identification internes (étiquettes QR chantier, véhicule,
-- outil, article, employé) étaient générés avec l'ancien préfixe de marque "LGP-" hérité
-- de Liria Gestion Pro. L'application s'appelle désormais ELSATIA Gestion Pro : cette
-- migration fait basculer la génération et les codes déjà stockés vers le préfixe "ELS-".
--
-- Compatibilité de bascule (déploiement app / migration DB non simultané) : cette
-- migration installe une fonction de normalisation SQL (étape 1) et l'utilise dans les 2
-- RPC de la borne stock (étapes 4-5) *avant* de convertir les codes stockés (étapes 7-8).
-- Cela rend la migration atomique du point de vue des appels externes :
--   • avant la migration            : ancienne appli (envoie LGP-*) + base en LGP-* -> OK ;
--   • migration appliquée,
--     ancienne appli pas déployée   : ancienne appli envoie LGP-*, les RPC normalisent
--                                     vers ELS-* avant de comparer à la base (déjà en
--                                     ELS-*) -> OK ;
--   • nouvelle appli déployée       : nouvelle appli envoie déjà du ELS-* (normalisation
--     (après la migration)            côté application, src/lib/qr-identification.ts), les
--                                     RPC re-normalisent en pure perte (ELS-* -> ELS-*,
--                                     no-op) -> OK.
-- Le seul ordre de bascule sûr reste donc « migration puis déploiement » : déployer la
-- nouvelle application AVANT que cette migration ne soit appliquée resterait risqué (la
-- nouvelle appli normaliserait un scan LGP-* vers ELS-* alors que les RPC pas encore
-- migrées ne compareraient qu'à des codes encore stockés en LGP-*) ; ce n'est pas résolu
-- ici et devra être respecté à l'exécution réelle, hors du périmètre de ce fichier.
--
-- Ne modifie ni ne remplace 20260713000068_codes_qr_borne_stock_securisee.sql ni
-- 20260715000081_securite_terrain_alertes_personnalisation.sql ni
-- 20260717000097_scanner_universel_destinations_stock.sql : les fonctions ci-dessous sont
-- re-déclarées via CREATE OR REPLACE, comme le veut la convention déjà suivie dans ce
-- dossier pour faire évoluer une fonction existante. CREATE OR REPLACE conserve les
-- privilèges déjà accordés sur ces fonctions (revoke/grant existants) : aucun droit n'est
-- donc réinitialisé ici.
--
-- Ordre des opérations retenu (chaque étape peut dépendre des précédentes) :
--   1. fonction de normalisation SQL LGP-* -> ELS-*, pure, réutilisable ;
--   2. validation SQL temporaire acceptant LGP-* et ELS-*, pour ne pas bloquer la
--      conversion en masse de l'étape 7 ;
--   3. génération future exclusivement en ELS-* ;
--   4. identifiant_employe_depuis_qr_borne : recherche normalisée ;
--   5. enregistrer_mouvement_stock_borne_v4 : recherches normalisées (article, chantier,
--      véhicule, outil) ;
--   6. contrôle GLOBAL de toutes les collisions possibles, avant la moindre écriture ;
--   7. conversion en masse des 5 préfixes connus, suffixe préservé au caractère près ;
--   8. garde-fou explicite : confirme qu'aucun code LGP-* connu ne subsiste ;
--   9. validation SQL définitive, strictement ELS-* (fin de la fenêtre de compatibilité).
-- Les étapes 4 et 5 sont placées avant la conversion (7) : elles ne dépendent d'aucun état
-- des données (la normalisation est une fonction pure), et l'ensemble du fichier s'exécute
-- dans une seule transaction — leur position exacte dans le fichier n'affecte donc aucune
-- garantie externe, seul l'état final compte. Elles sont regroupées avec les autres
-- définitions de fonctions (1-5) avant les opérations sur les données (6-9) par lisibilité.

-- 1) Fonction de normalisation centralisée, pure et réutilisable par les RPC de recherche.
-- Convertit un code reçu de l'application vers sa forme actuelle : les 5 anciens préfixes
-- LGP-* sont réécrits en ELS-*, suffixe préservé au caractère près ; un code déjà en ELS-*,
-- une référence article, un code-barres EAN ou un identifiant salarié personnel
-- (ex. ELS-0001, distinct du format ELS-EMP-<hex> ici traité) traversent la fonction
-- inchangés (hormis la casse et les espaces superflus, comme le faisaient déjà tous les
-- appelants avec upper(btrim(...))). NULL en entrée retourne NULL. IMMUTABLE : aucune
-- dépendance à une table, résultat entièrement déterminé par l'argument.
create or replace function public.normaliser_code_identification(p_code text)
returns text
language sql immutable set search_path=public as $$
  select case
    when p_code is null then null
    when upper(btrim(p_code)) like 'LGP-EMP-%' then 'ELS-EMP-' || substr(upper(btrim(p_code)), 9)
    when upper(btrim(p_code)) like 'LGP-ART-%' then 'ELS-ART-' || substr(upper(btrim(p_code)), 9)
    when upper(btrim(p_code)) like 'LGP-CH-%'  then 'ELS-CH-'  || substr(upper(btrim(p_code)), 8)
    when upper(btrim(p_code)) like 'LGP-VEH-%' then 'ELS-VEH-' || substr(upper(btrim(p_code)), 9)
    when upper(btrim(p_code)) like 'LGP-OUT-%' then 'ELS-OUT-' || substr(upper(btrim(p_code)), 9)
    else upper(btrim(p_code))
  end;
$$;
-- Fonction utilitaire pure, sans accès aux données : privilèges d'exécution par défaut de
-- PostgreSQL (PUBLIC) conservés intentionnellement, aucun REVOKE/GRANT nécessaire — l'appel
-- direct de cette fonction ne présente aucun risque (aucun effet de bord, aucune donnée
-- exposée au-delà de la transformation de chaîne elle-même).

-- 2) Compatibilité temporaire : le trigger doit accepter les deux formats le temps que
-- l'étape 7 réécrive chaque ligne LGP-* en ELS-*, sans quoi il rejetterait lui-même la
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

-- 3) Génération future : les nouvelles ressources reçoivent exclusivement un code ELS-*.
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

-- 4) identifiant_employe_depuis_qr_borne : seule la comparaison du code scanné change
-- (upper(btrim(p_code)) -> normaliser_code_identification(p_code)), pour accepter aussi
-- bien un ancien badge LGP-EMP-* scanné par une application pas encore mise à jour qu'un
-- badge ELS-EMP-* actuel. Signature, type de retour, langage, STABLE, SECURITY DEFINER,
-- search_path, contrôle d'autorisation (est_membre_actif + a_permission) et logique
-- métier restent identiques à 20260715000081.
create or replace function public.identifiant_employe_depuis_qr_borne(p_entreprise_id uuid,p_code text) returns text
language plpgsql security definer stable set search_path=public as $$declare v_identifiant text;begin
 if not public.est_membre_actif(p_entreprise_id) or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then raise exception 'Accès refusé';end if;
 select coalesce(e.identifiant_interne,e.reference_interne,e.numero_inscription) into v_identifiant
 from public.codes_identification c join public.employes e on e.id=c.ressource_id and e.entreprise_id=c.entreprise_id
 where c.entreprise_id=p_entreprise_id and c.type_ressource='employe' and c.actif and upper(c.code)=public.normaliser_code_identification(p_code);
 return v_identifiant;
end;$$;

-- 5) enregistrer_mouvement_stock_borne_v4 : seules les comparaisons des codes scannés
-- (article/chantier/véhicule/outil) et l'écriture d'audit code_scan_utilise changent
-- (upper(btrim(p_code_X)) -> normaliser_code_identification(p_code_X)) pour accepter les
-- anciens badges LGP-*. code_scan_utilise enregistrera donc désormais la forme ELS-*
-- normalisée pour un scan LGP-*, comme déjà décidé et documenté côté application
-- (src/app/actions/stock.ts) : cette colonne d'audit n'est relue nulle part dans
-- l'application (vérifié), aucun contrat n'exige la valeur brute. Signature (14
-- paramètres, ordre et valeurs par défaut identiques), type de retour uuid, langage,
-- SECURITY DEFINER, search_path=public,extensions (nécessaire à crypt()), limitation de
-- tentatives, vérification du mot de passe personnel (crypt), contrôle du poste/droit
-- d'entrée-sortie, contrainte d'une seule destination, écritures dans mouvements_stock et
-- tentatives_borne_stock restent strictement identiques à 20260717000097.
create or replace function public.enregistrer_mouvement_stock_borne_v4(
  p_entreprise_id uuid,p_identifiant_employe text,p_mot_de_passe text,
  p_code_article text,p_type text,p_quantite numeric,p_chantier_id uuid default null,
  p_code_chantier text default null,p_vehicule_id uuid default null,p_code_vehicule text default null,
  p_outil_id uuid default null,p_code_outil text default null,p_teinte_id uuid default null,p_motif text default null
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_uid uuid:=auth.uid();v_employe public.employes;v_article public.articles_stock;
  v_chantier uuid:=p_chantier_id;v_vehicule uuid:=p_vehicule_id;v_outil uuid:=p_outil_id;
  v_id uuid;v_echecs integer;v_droit text;v_destinations integer;
begin
  if v_uid is null or not public.est_membre_actif(p_entreprise_id)
    or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then raise exception 'Accès refusé';end if;
  if p_type not in ('entree','sortie') or p_quantite is null or p_quantite<=0 then raise exception 'Mouvement invalide';end if;
  select count(*) into v_echecs from public.tentatives_borne_stock
  where entreprise_id=p_entreprise_id and utilisateur_id=v_uid and not reussie and created_at>now()-interval '10 minutes';
  if v_echecs>=8 then raise exception 'Trop de tentatives. Réessayez dans quelques minutes.';end if;

  select * into v_employe from public.employes
  where entreprise_id=p_entreprise_id
    and upper(btrim(coalesce(p_identifiant_employe,''))) in (upper(identifiant_interne),upper(reference_interne),upper(numero_inscription))
    and code_stock_active and code_stock_hash is not null
    and crypt(coalesce(p_mot_de_passe,''),code_stock_hash)=code_stock_hash
    and statut not in ('sorti','suspendu') limit 1;
  if v_employe.id is null then
    insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
    values(p_entreprise_id,v_uid,false,'identifiants_personnels_invalides');
    raise exception 'Identifiant salarié ou mot de passe incorrect';
  end if;
  v_droit:=case when p_type='entree' then 'effectuer_entree_stock' else 'effectuer_sortie_stock' end;
  if v_employe.poste_id is null or not exists(
    select 1 from public.permissions_poste pp where pp.entreprise_id=p_entreprise_id
      and pp.poste_id=v_employe.poste_id and pp.cle_permission=v_droit and pp.autorise
  ) then raise exception 'Votre poste n''autorise pas ce type de mouvement de stock';end if;

  select a.* into v_article from public.articles_stock a
  left join public.codes_identification c on c.entreprise_id=a.entreprise_id and c.type_ressource='article' and c.ressource_id=a.id and c.actif
  where a.entreprise_id=p_entreprise_id and a.actif and (
    upper(a.reference)=public.normaliser_code_identification(p_code_article) or upper(coalesce(a.code_barres,''))=public.normaliser_code_identification(p_code_article) or upper(c.code)=public.normaliser_code_identification(p_code_article)
  ) limit 1;
  if v_article.id is null then raise exception 'Article inconnu ou QR incompatible';end if;

  if nullif(btrim(coalesce(p_code_chantier,'')),'') is not null then
    select ressource_id into v_chantier from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='chantier' and actif and upper(code)=public.normaliser_code_identification(p_code_chantier);
    if v_chantier is null then raise exception 'QR chantier inconnu ou incompatible';end if;
  end if;
  if nullif(btrim(coalesce(p_code_vehicule,'')),'') is not null then
    select ressource_id into v_vehicule from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='vehicule' and actif and upper(code)=public.normaliser_code_identification(p_code_vehicule);
    if v_vehicule is null then raise exception 'QR véhicule inconnu ou incompatible';end if;
  end if;
  if nullif(btrim(coalesce(p_code_outil,'')),'') is not null then
    select ressource_id into v_outil from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='outil' and actif and upper(code)=public.normaliser_code_identification(p_code_outil);
    if v_outil is null then raise exception 'QR outil inconnu ou incompatible';end if;
  end if;
  if v_chantier is not null and not exists(select 1 from public.chantiers where id=v_chantier and entreprise_id=p_entreprise_id) then raise exception 'Chantier invalide';end if;
  if v_vehicule is not null and not exists(select 1 from public.vehicules where id=v_vehicule and entreprise_id=p_entreprise_id and statut<>'vendu') then raise exception 'Véhicule invalide';end if;
  if v_outil is not null and not exists(select 1 from public.outils where id=v_outil and entreprise_id=p_entreprise_id and statut not in ('hors_service','perdu')) then raise exception 'Outil indisponible';end if;
  v_destinations:=num_nonnulls(v_chantier,v_vehicule,v_outil);
  if p_type='sortie' and v_destinations=0 then raise exception 'Choisissez ou scannez le chantier, le véhicule ou le matériel destinataire';end if;
  if v_destinations>1 then raise exception 'Une seule destination est autorisée par mouvement';end if;

  insert into public.mouvements_stock(
    entreprise_id,article_id,chantier_id,vehicule_id,outil_id,teinte_id,type,quantite,date,motif,
    employe_id,cree_par_utilisateur_id,saisi_via_borne,code_scan_utilise
  ) values (
    p_entreprise_id,v_article.id,v_chantier,v_vehicule,v_outil,p_teinte_id,p_type,p_quantite,current_date,
    nullif(btrim(p_motif),''),v_employe.id,v_uid,true,public.normaliser_code_identification(p_code_article)
  ) returning id into v_id;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
  values(p_entreprise_id,v_uid,true,'mouvement_stock:'||p_type);
  return v_id;
end;$$;

-- 6) Contrôle GLOBAL des collisions, avant toute conversion : pour chaque ligne LGP-* des
-- 5 préfixes connus, recherche si le code ELS-* cible existe déjà pour la même entreprise
-- (portée de la contrainte unique entreprise_id+code ; comparaison insensible à la casse,
-- cohérente avec les recherches applicatives existantes qui font toutes upper(code)=...).
-- Cette étape est un SELECT pur, exécutée intégralement avant le premier UPDATE de l'étape
-- 7 : la première collision trouvée fait échouer toute la migration sans avoir modifié une
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

-- 7) Conversion en masse : LGP-<PREFIXE>-<SUFFIXE> -> ELS-<PREFIXE>-<SUFFIXE>, exactement
-- pour les 5 préfixes connus, suffixe préservé au caractère près. Aucune collision n'est
-- possible ici : l'étape 6 les a déjà exclues pour l'ensemble du jeu de données avant ce
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

-- 8) Garde-fou explicite : confirme qu'aucun code LGP-* connu ne subsiste avant de refermer
-- la fenêtre de compatibilité de la validation SQL. Ne devrait jamais se déclencher compte
-- tenu des étapes 6 et 7 ci-dessus ; sert de filet de sécurité avant l'étape 9.
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

-- 9) Validation SQL définitive : ne référence plus que le préfixe ELS-*, seul désormais
-- généré (étape 3) et seul stocké (étapes 7 et 8) pour les LIGNES de codes_identification.
-- Les RPC (étapes 4-5) continuent, elles, à accepter un argument LGP-* en entrée : elles le
-- normalisent en ELS-* avant recherche, elles n'écrivent jamais un code LGP-* dans
-- codes_identification. Aucun autre point d'écriture n'existe vers codes_identification.code
-- (vérifié : la seule fonction qui y insère est creer_code_identification() ci-dessus ;
-- aucune route ni server action n'y insère ou n'y met à jour de code directement). La forme
-- du motif ([A-Z]{2,4} pour le segment de type) reste identique à celle d'origine, seul le
-- préfixe de marque change.
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
-- après cette migration à partir d'une ancienne étiquette LGP-* scannée (ancienne ou
-- nouvelle application), cette colonne enregistrera désormais la forme ELS-* normalisée
-- plutôt que la valeur brute scannée : décision assumée en l'absence de tout lecteur
-- exigeant la valeur brute (cf. étape 5 ci-dessus).
--
-- Versions historiques enregistrer_mouvement_stock_borne / _v2 / _v3 (20260713000068,
-- 20260714000074, 20260714000076) : recensées, non modifiées ici. Ce sont des noms de
-- fonction distincts (pas des surcharges de _v4), jamais appelés par l'application (seul
-- enregistrer_mouvement_stock_borne_v4 est invoqué depuis src/app/actions/stock.ts, vérifié
-- par recherche exhaustive) : elles ne participent à aucun chemin de bascule réel et sont
-- hors du périmètre de cette migration.
notify pgrst,'reload schema';
