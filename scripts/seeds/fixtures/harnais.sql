-- Harnais de compatibilité des seeds — empreintes d'état et contrôles d'intégrité.
-- BASE JETABLE UNIQUEMENT (chargé par scripts/seeds/verify-seeds.mjs, jamais sur Preview/Production).
--
-- seed_harness.empreinte() : une ligne par table (schémas public, platform, auth, storage),
--   deux empreintes :
--     - `stricte`  : toutes les colonnes sauf les horodatages (timestamptz), qui dépendent de now() ;
--     - `metier`   : en plus, sans les colonnes uuid (identifiants régénérés par un seed qui
--                    supprime puis recrée ses lignes) — « même état final » au sens métier.
-- seed_harness.controles() : clés étrangères orphelines (y compris celles qu'un seed aurait pu
--   laisser en désactivant des triggers), contraintes NOT VALID, et invariants métier des
--   domaines devis, factures, paiements, commandes, réceptions, stock, pointages, Réserves,
--   Colors et Tools.

create schema if not exists seed_harness;

-- Valeurs aléatoires PAR CONCEPTION du produit (codes d'adhésion, numéros d'inscription, codes
-- d'identification) : identiques d'une exécution à l'autre dans une même base, mais tirées à
-- nouveau quand une entreprise ou un salarié est recréé. Exclues de l'empreinte métier seulement.
create table if not exists seed_harness.colonnes_aleatoires (table_nom text, colonne text, primary key (table_nom, colonne));
insert into seed_harness.colonnes_aleatoires values
  ('public.entreprises', 'code_adhesion'),
  ('public.employes', 'numero_inscription'),
  ('public.codes_identification', 'code'),
  ('auth.users', 'encrypted_password')
on conflict do nothing;

create or replace function seed_harness.empreinte()
returns table(table_nom text, lignes bigint, stricte text, metier text)
language plpgsql as $$
declare
  t record;
  v_strict text[];
  v_metier text[];
begin
  for t in
    select c.oid, n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p') and n.nspname in ('public', 'platform', 'auth', 'storage')
     order by n.nspname, c.relname
  loop
    select coalesce(array_agg(a.attname order by a.attname) filter (where a.atttypid <> 'timestamptz'::regtype), '{}'),
           coalesce(array_agg(a.attname order by a.attname) filter (
             where a.atttypid not in ('timestamptz'::regtype, 'uuid'::regtype)
               and not exists (select 1 from seed_harness.colonnes_aleatoires r
                                where r.table_nom = t.nspname || '.' || t.relname and r.colonne = a.attname)), '{}')
      into v_strict, v_metier
      from pg_attribute a
     where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped;
    -- Métier : les UUID contenus dans des valeurs (instantanés jsonb, textes) sont neutralisés.
    return query execute format(
      'select %L::text, count(*),
              coalesce(md5(string_agg(s, ''|'' order by s)), ''-''),
              coalesce(md5(string_agg(m, ''|'' order by m)), ''-'')
         from (select (select jsonb_object_agg(k, to_jsonb(x) -> k) from unnest($1::text[]) k)::text as s,
                      regexp_replace((select jsonb_object_agg(k, to_jsonb(x) -> k) from unnest($2::text[]) k)::text,
                                     ''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'', ''UUID'', ''g'') as m
                 from %I.%I x) y',
      t.nspname || '.' || t.relname, t.nspname, t.relname)
      using v_strict, v_metier;
  end loop;
end;
$$;

create or replace function seed_harness.controles()
returns table(controle text, anomalies bigint)
language plpgsql as $$
declare
  fk record;
  v_n bigint;
  v_cond text;
  v_not_null text;
begin
  -- 1. Clés étrangères : aucune ligne orpheline (MATCH SIMPLE : colonnes toutes non nulles).
  for fk in
    select con.conname, con.conrelid::regclass as enfant, con.confrelid::regclass as parent,
           array(select a.attname from unnest(con.conkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as cols,
           array(select a.attname from unnest(con.confkey) with ordinality k(n, i) join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as refs
      from pg_constraint con join pg_namespace n on n.oid = con.connamespace
     where con.contype = 'f' and n.nspname in ('public', 'platform', 'storage')
  loop
    select string_agg(format('c.%I = p.%I', fk.cols[i], fk.refs[i]), ' and '),
           string_agg(format('c.%I is not null', fk.cols[i]), ' and ')
      into v_cond, v_not_null
      from generate_subscripts(fk.cols, 1) i;
    execute format('select count(*) from %s c where %s and not exists (select 1 from %s p where %s)',
                   fk.enfant, v_not_null, fk.parent, v_cond) into v_n;
    if v_n > 0 then
      controle := 'fk_orpheline:' || fk.conname; anomalies := v_n; return next;
    end if;
  end loop;

  select count(*) into v_n from pg_constraint con join pg_namespace n on n.oid = con.connamespace
   where not con.convalidated and n.nspname in ('public', 'platform');
  controle := 'contraintes_not_valid'; anomalies := v_n; return next;

  -- Aucun garde laissé coupé : un seed qui désactive un trigger doit le réactiver, même en échec.
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and t.tgenabled = 'D' and n.nspname in ('public', 'platform', 'auth', 'storage');
  controle := 'triggers_desactives'; anomalies := v_n; return next;

  -- 2. Devis : un devis sorti du brouillon porte au moins une ligne.
  controle := 'devis_engage_sans_ligne';
  select count(*) into anomalies from public.devis d
   where d.statut <> 'brouillon' and not exists (select 1 from public.lignes_devis l where l.devis_id = d.id);
  return next;

  -- 3. Factures : émises avec lignes, montant payé = somme des paiements.
  controle := 'facture_emise_sans_ligne';
  select count(*) into anomalies from public.factures f
   where f.statut <> 'brouillon' and not exists (select 1 from public.lignes_factures l where l.facture_id = f.id);
  return next;
  controle := 'facture_montant_paye_incoherent';
  select count(*) into anomalies from public.factures f
   where f.montant_paye <> coalesce((select sum(p.montant) from public.paiements p where p.facture_id = f.id), 0);
  return next;
  controle := 'paiement_non_positif';
  select count(*) into anomalies from public.paiements p where p.montant <= 0;
  return next;

  -- 4. Commandes fournisseurs : totaux = lignes, identité figée hors brouillon, réception cohérente.
  controle := 'commande_total_incoherent';
  select count(*) into anomalies from public.commandes_fournisseurs c
   where c.montant_ht <> coalesce((select round(sum(l.quantite * l.prix_unitaire_ht), 2) from public.lignes_commande l where l.commande_id = c.id), 0);
  return next;
  controle := 'commande_engagee_sans_identite_figee';
  select count(*) into anomalies from public.commandes_fournisseurs c
   where c.statut <> 'brouillon' and (c.fournisseur_snapshot is null or c.entreprise_snapshot is null);
  return next;
  controle := 'commande_recue_non_soldee';
  select count(*) into anomalies from public.commandes_fournisseurs c
   where c.statut = 'recue' and exists (select 1 from public.lignes_commande l where l.commande_id = c.id and l.quantite_recue < l.quantite);
  return next;
  controle := 'commande_recue_partiel_sans_reception';
  select count(*) into anomalies from public.commandes_fournisseurs c
   where c.statut = 'recue_partiel' and not exists (select 1 from public.lignes_commande l where l.commande_id = c.id and l.quantite_recue > 0);
  return next;
  controle := 'reception_hors_commande_engagee';
  select count(*) into anomalies from public.lignes_commande l join public.commandes_fournisseurs c on c.id = l.commande_id
   where l.quantite_recue > 0 and c.statut in ('brouillon');
  return next;
  controle := 'ligne_commande_surreception';
  select count(*) into anomalies from public.lignes_commande l where l.quantite_recue > l.quantite or l.quantite_recue < 0;
  return next;

  -- 5. Réceptions → stock : une ligne reliée à un article est créditée exactement de sa quantité reçue.
  controle := 'reception_stock_incoherente';
  select count(*) into anomalies from public.lignes_commande l
   where l.article_id is not null
     and l.quantite_recue <> coalesce((select sum(case m.type when 'entree' then m.quantite else -m.quantite end)
                                         from public.mouvements_stock m where m.ligne_commande_id = l.id), 0);
  return next;

  -- 6. Stock : quantité en stock = cumul des mouvements, jamais négative.
  controle := 'stock_incoherent_avec_mouvements';
  select count(*) into anomalies from public.articles_stock a
   where exists (select 1 from public.mouvements_stock m where m.article_id = a.id)
     and a.quantite_stock <> (select sum(case m.type when 'entree' then m.quantite when 'sortie' then -m.quantite else 0 end)
                                from public.mouvements_stock m where m.article_id = a.id);
  return next;
  controle := 'stock_negatif';
  select count(*) into anomalies from public.articles_stock a where a.quantite_stock < 0;
  return next;

  -- 7. Pointages et affectations : salarié et chantier de la même entreprise.
  controle := 'pointage_hors_entreprise';
  select count(*) into anomalies from public.pointages p
   where not exists (select 1 from public.employes e where e.id = p.employe_id and e.entreprise_id = p.entreprise_id)
      or (p.chantier_id is not null and not exists (select 1 from public.chantiers c where c.id = p.chantier_id and c.entreprise_id = p.entreprise_id));
  return next;
  controle := 'affectation_hors_entreprise';
  select count(*) into anomalies from public.affectations a
   where not exists (select 1 from public.employes e where e.id = a.employe_id and e.entreprise_id = a.entreprise_id);
  return next;

  -- 8. Réserves : réserve, chantier Réserves et chantier GP relié dans la même entreprise.
  controle := 'reserve_hors_entreprise';
  select count(*) into anomalies from public.reserves r
   where not exists (select 1 from public.reserves_chantiers c where c.id = r.chantier_id and c.entreprise_id = r.entreprise_id);
  return next;
  controle := 'chantier_reserves_gp_hors_entreprise';
  select count(*) into anomalies from public.reserves_chantiers rc
   where rc.chantier_gp_id is not null
     and not exists (select 1 from public.chantiers c where c.id = rc.chantier_gp_id and c.entreprise_id = rc.entreprise_id);
  return next;

  -- 8 bis. Codes d'identification (sans clé étrangère vers leur ressource) : chaque code désigne
  --        une ressource existante — un nettoyage/reset qui supprime la ressource doit aussi
  --        supprimer son code.
  controle := 'code_identification_orphelin';
  select count(*) into anomalies from public.codes_identification ci
   where not case ci.type_ressource
     when 'employe' then exists (select 1 from public.employes x where x.id = ci.ressource_id)
     when 'chantier' then exists (select 1 from public.chantiers x where x.id = ci.ressource_id)
     when 'article' then exists (select 1 from public.articles_stock x where x.id = ci.ressource_id)
     when 'outil' then exists (select 1 from public.outils x where x.id = ci.ressource_id)
     when 'vehicule' then exists (select 1 from public.vehicules x where x.id = ci.ressource_id)
     else true end;
  return next;

  -- 9. Toute table multi-tenant (Colors, Tools, compteurs… y compris sans clé étrangère) :
  --    chaque ligne rattachée à une entreprise existante. Les tables de conservation RGPD
  --    (platform.*, instantanés de purge) survivent volontairement à leur entreprise.
  for fk in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'entreprise_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'entreprises'
  loop
    -- 00000000-… : sentinelle des compteurs globaux (numérotation des entreprises), par conception.
    execute format('select count(*) from public.%I x where x.entreprise_id is not null
                      and x.entreprise_id <> ''00000000-0000-0000-0000-000000000000''
                      and not exists (select 1 from public.entreprises e where e.id = x.entreprise_id)', fk.relname) into v_n;
    if v_n > 0 then controle := 'entreprise_orpheline:' || fk.relname; anomalies := v_n; return next; end if;
  end loop;
end;
$$;

-- Empreinte par colonne d'une table : permet de nommer précisément les colonnes qui diffèrent
-- entre deux exécutions (valeurs triées, indépendantes de l'ordre physique).
create or replace function seed_harness.empreinte_colonnes(p_table text)
returns table(colonne text, empreinte text)
language plpgsql as $$
declare
  a record;
  v_schema text := split_part(p_table, '.', 1);
  v_table text := split_part(p_table, '.', 2);
begin
  for a in
    select att.attname from pg_attribute att
     where att.attrelid = format('%I.%I', v_schema, v_table)::regclass and att.attnum > 0 and not att.attisdropped
       and att.atttypid <> 'timestamptz'::regtype
     order by att.attnum
  loop
    return query execute format(
      'select %L::text, coalesce(md5(string_agg(v, ''|'' order by v)), ''-'') from (select coalesce(to_jsonb(x.%I)::text, ''null'') v from %I.%I x) y',
      a.attname, a.attname, v_schema, v_table);
  end loop;
end;
$$;
