-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-B : contrat de sélection des relances automatiques.
-- Même fichier avant (V9.1 @ 24a0c2e9 : RED attendu) et après la migration
-- 20261003000201 (GREEN attendu). Appelle uniquement relances_auto_candidats_service
-- (signature inchangée), comme le cron.
-- Base : migrations + scripts/perf/generate_fixture.sql.
--   su postgres -c "pg_prove -d <base> scripts/perf/hardening/tests/relances_auto_contract.test.sql"
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(16);

\set entb '\'b0000000-0000-4000-b000-000000000001\''
\set enta '\'a0000000-0000-4000-a000-000000000001\''

-- État maîtrisé : toutes les factures/devis ouverts existants exclus.
update factures set relance_auto_exclue = true where entreprise_id in (:entb, :enta);
update devis set relance_auto_exclue = true where entreprise_id in (:entb, :enta);
insert into parametres_relances (entreprise_id, devis_auto_actif, factures_auto_actif,
  factures_delai_premiere_relance_jours, factures_delai_entre_relances_jours, factures_nombre_max_relances,
  devis_delai_premiere_relance_jours, devis_delai_entre_relances_jours, devis_nombre_max_relances)
values (:entb, true, true, 3, 7, 3, 7, 7, 2), (:enta, true, true, 3, 7, 3, 7, 7, 2)
on conflict (entreprise_id) do update set devis_auto_actif = true, factures_auto_actif = true,
  factures_delai_premiere_relance_jours = 3, factures_delai_entre_relances_jours = 7, factures_nombre_max_relances = 3,
  devis_delai_premiere_relance_jours = 7, devis_delai_entre_relances_jours = 7, devis_nombre_max_relances = 2;

-- Clients : un avec e-mail, un sans, un exclu (par tenant).
create temp table cli (ent uuid, genre text, id uuid);
insert into cli select e, g, gen_random_uuid() from (values (:entb::uuid), (:enta::uuid)) t(e), (values ('ok'), ('sans_email'), ('exclu')) v(g);
insert into clients (id, entreprise_id, type, nom, societe, adresse_facturation, code_postal, ville, email, statut, relance_auto_exclue)
select c.id, c.ent, 'professionnel', 'Contrat ' || c.genre, 'Contrat ' || c.genre, '1 rue', '67000', 'Strasbourg',
       case when c.genre = 'sans_email' then null else c.genre || '@contrat.invalid' end, 'actif', c.genre = 'exclu'
from cli c;

create temp table fac (rang serial, ent uuid, tag text, id uuid);
create function pg_temp.facture(p_ent uuid, p_tag text, p_echeance date, p_client text default 'ok', p_montant numeric default 120)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into factures (entreprise_id, client_id, type, statut, date_emission, date_echeance)
  values (p_ent, (select id from cli where ent = p_ent and genre = p_client), 'simple', 'brouillon', p_echeance - 30, p_echeance)
  returning id into v;
  insert into lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
  values (v, 'Contrat', 'fourniture', 1, 'u', p_montant / 1.2, 0, 20, 1);
  update factures set statut = 'envoyee' where id = v;
  insert into fac (ent, tag, id) values (p_ent, p_tag, v);
  return v;
end $$;
create function pg_temp.relances(p_doc uuid, p_n int, p_statut text, p_il_y_a interval) returns void language sql as $$
  insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi, created_at)
  select f.entreprise_id, 'facture', p_doc, n, p_statut, true,
         case when p_statut = 'envoyee' then now() - p_il_y_a end, now() - p_il_y_a
  from factures f, generate_series(1, p_n) n where f.id = p_doc $$;
create function pg_temp.candidats(p_ent uuid) returns setof uuid language sql as $$
  select id from relances_auto_candidats_service(p_ent, 'facture', 200) $$;

-- R1 famine (scénario du rapport) : 200 factures relancées au maximum, puis 1 saine.
select pg_temp.facture(:entb, 'max', current_date - 90) from generate_series(1, 200);
select pg_temp.relances(id, 3, 'envoyee', interval '20 days') from fac where tag = 'max';
select pg_temp.facture(:entb, 'saine', current_date - 20);
select ok((select id from fac where tag = 'saine') in (select pg_temp.candidats(:entb)),
  'R1 200 factures au maximum de relances n''évincent pas la facture saine');
select is((select count(*)::int from pg_temp.candidats(:entb) c join fac on fac.id = c where fac.tag = 'max'), 0,
  'R2 aucune facture au maximum de relances n''est candidate (le LIMIT porte sur le bon ensemble)');

-- R3 délai : 200 factures relancées hier (délai entre relances 7 j non écoulé) + 1 saine.
select pg_temp.facture(:entb, 'hier', current_date - 60) from generate_series(1, 200);
select pg_temp.relances(id, 1, 'envoyee', interval '1 day') from fac where tag = 'hier';
select ok((select id from fac where tag = 'saine') in (select pg_temp.candidats(:entb)),
  'R3 200 factures en attente de délai n''évincent pas la facture saine');

-- R4 client sans e-mail / client exclu : jamais candidats, n'évincent pas.
select pg_temp.facture(:entb, 'sans_email', current_date - 60, 'sans_email') from generate_series(1, 150);
select pg_temp.facture(:entb, 'client_exclu', current_date - 60, 'exclu') from generate_series(1, 150);
select ok((select id from fac where tag = 'saine') in (select pg_temp.candidats(:entb))
  and not exists (select 1 from pg_temp.candidats(:entb) c join fac on fac.id = c where fac.tag in ('sans_email', 'client_exclu')),
  'R4 clients sans e-mail ou exclus : écartés sans évincer la facture saine');

-- R5 dates : échéance future, échéance aujourd'hui, première relance pas encore due (3 j).
select pg_temp.facture(:entb, 'future', current_date + 10);
select pg_temp.facture(:entb, 'aujourdhui', current_date);
select pg_temp.facture(:entb, 'trop_recente', current_date - 1);
select pg_temp.facture(:entb, 'due', current_date - 4);
select is((select count(*)::int from pg_temp.candidats(:entb) c join fac on fac.id = c where fac.tag in ('future', 'aujourdhui', 'trop_recente')), 0,
  'R5 échéance non dépassée ou délai de première relance non écoulé : non candidates');
select ok((select id from fac where tag = 'due') in (select pg_temp.candidats(:entb)), 'R6 première relance due : candidate');

-- R7 soldée : non candidate.
select pg_temp.facture(:entb, 'soldee', current_date - 30);
insert into paiements (facture_id, montant, date, mode, reference)
select id, 120, current_date - 5, 'virement', 'CONTRAT' from fac where tag = 'soldee';
select is((select count(*)::int from pg_temp.candidats(:entb) c join fac on fac.id = c where fac.tag = 'soldee'), 0,
  'R7 facture soldée : non candidate');

-- R8 ordre : la plus en retard d'abord.
select ok((select c from pg_temp.candidats(:entb) c limit 1) = (select id from fac where tag = 'saine'),
  'R8 tri explicite : la relance la plus due passe en premier');

-- R9 fournisseur indisponible : 200 factures dues dont la tentative d'aujourd'hui a échoué
-- (Brevo en panne) ne bloquent pas une facture due jamais tentée.
select pg_temp.facture(:enta, 'echec', current_date - 120) from generate_series(1, 200);
select pg_temp.relances(id, 1, 'echec', interval '1 hour') from fac where tag = 'echec';
select pg_temp.facture(:enta, 'jamais_tentee', current_date - 10);
select ok((select id from fac where tag = 'jamais_tentee') in (select pg_temp.candidats(:enta)),
  'R9 200 échecs fournisseur répétés ne bloquent pas une facture jamais tentée');
select ok((select count(*) from pg_temp.candidats(:enta) c join fac on fac.id = c where fac.tag = 'echec') > 0,
  'R10 une facture en échec fournisseur reste candidate (réessai), derrière les jamais tentées');

-- R11 replay : après l'envoi du niveau 1, la facture n'est plus candidate le même jour.
select relance_finaliser(relance_reclamer(:enta, 'facture', (select id from fac where tag = 'jamais_tentee'), 1,
  'ok@contrat.invalid', 's', true, null), 'envoyee', 'msg-1', null, null);
select is((select count(*)::int from pg_temp.candidats(:enta) c where c = (select id from fac where tag = 'jamais_tentee')), 0,
  'R11 rejouer le cron le même jour ne resélectionne pas une facture tout juste relancée');

-- R12 multi-tenant : aucun candidat hors tenant, de part et d'autre.
select is((select count(*)::int from pg_temp.candidats(:entb) c join factures f on f.id = c where f.entreprise_id <> :entb)
        + (select count(*)::int from pg_temp.candidats(:enta) c join factures f on f.id = c where f.entreprise_id <> :enta), 0,
  'R12 aucun candidat d''un autre tenant');

-- R13 10 000 factures (A) : 9 000 au maximum de relances + 1 000 dues ; le lot ne contient que des dues.
select pg_temp.facture(:enta, 'masse_max', current_date - 200) from generate_series(1, 9000);
insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi, created_at)
select :enta, 'facture', f.id, n, 'envoyee', true, now() - interval '30 days', now() - interval '30 days'
from fac f cross join generate_series(1, 3) n where f.tag = 'masse_max';
select pg_temp.facture(:enta, 'masse_due', current_date - 15) from generate_series(1, 1000);
select is((select count(*)::int from pg_temp.candidats(:enta) c join fac on fac.id = c where fac.tag = 'masse_max'), 0,
  'R13 10k factures : aucune facture au maximum de relances dans le lot');
select is((select count(*)::int from pg_temp.candidats(:enta)), 200, 'R14 10k factures : le lot de 200 est plein de candidats dus');

-- R15 passages successifs : en relançant chaque lot, les 1 000 dues sont toutes atteintes
-- en ceil(1001/200) passages, sans jamais resélectionner une facture déjà relancée (pas de boucle).
create temp table vus (passage int, id uuid);
create function pg_temp.passages() returns int language plpgsql as $$
declare p int; r record; n int;
begin
  for p in 1..8 loop
    n := 0;
    for r in select c id from pg_temp.candidats('a0000000-0000-4000-a000-000000000001') c loop
      n := n + 1;
      insert into vus values (p, r.id);
      begin
        perform relance_finaliser(relance_reclamer('a0000000-0000-4000-a000-000000000001', 'facture', r.id,
          (select count(*)::int + 1 from relances_documents where document_id = r.id and statut = 'envoyee'),
          'ok@contrat.invalid', 's', true, null), 'envoyee', 'msg', null, null);
      exception when others then null; -- avant correctif : candidats inéligibles (niveau > 5…)
      end;
    end loop;
    exit when n = 0;
  end loop;
  return (select count(*)::int from fac where tag in ('masse_due', 'echec') and id not in (select id from vus));
end $$;
select is(pg_temp.passages(), 0, 'R15 toutes les factures dues (10k au total) sont atteintes en passages successifs');
select is((select count(*) - count(distinct id) from vus)::int, 0, 'R16 aucune facture resélectionnée après sa relance (pas de boucle)');

select * from finish();
rollback;
