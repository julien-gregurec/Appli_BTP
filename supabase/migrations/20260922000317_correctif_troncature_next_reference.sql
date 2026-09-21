-- Correctif réel du débordement de numérotation (devis/factures/avoirs/commandes) —
-- audit dédié : docs/qualification/ELSATIA_GP_NUMBERING_OVERFLOW_FIX_V1.md.
--
-- Constat : `public.next_reference()` formate le compteur avec
-- `lpad(v_numero::text, p_largeur, '0')`. `lpad` en PostgreSQL TRONQUE la chaîne
-- si elle dépasse déjà la largeur demandée (au lieu de l'élargir) : dès que le
-- compteur d'une entreprise dépasse 999 (largeur 3, utilisée par devis/factures/
-- commandes_fournisseurs), les numéros 1000, 1001, 1002... sont tous formatés sur
-- 3 caractères ('100', '100', '100'...), ce qui viole la contrainte d'unicité
-- `(entreprise_id, numero)` et bloque l'émission du document suivant avec une
-- erreur 23505 — reproduit de façon déterministe (voir le rapport, sans même
-- nécessiter de concurrence).
--
-- Une migration antérieure (20260921000299_correctif_debordement_numerotation_
-- documents.sql) avait déjà diagnostiqué ce défaut, mais avait corrigé
-- `public.formater_numero_document()` — une fonction distincte, jamais appelée
-- par aucun trigger ni RPC de ce dépôt (vérifié par recherche exhaustive) — sans
-- toucher à `next_reference()`, qui est la fonction réellement invoquée par tous
-- les triggers de numérotation (`trg_devis_numero`, `trg_facture_numero`,
-- `trg_commande_numero`, etc.). Le bug documenté par cette migration n'a donc
-- jamais été corrigé dans le chemin de code réel. `formater_numero_document()`
-- reste inchangée par ce correctif (code mort inoffensif en l'état — voir le
-- rapport pour la justification de ne pas la brancher ici, hors périmètre de ce
-- lot).
--
-- Correctif : reprend exactement le principe déjà écrit (mais jamais utilisé)
-- dans `formater_numero_document` — la largeur configurée devient un plancher,
-- jamais un plafond : `greatest(p_largeur, length(v_numero::text))`. Comportement
-- strictement inchangé tant que le compteur tient dans la largeur demandée (cas
-- normal aujourd'hui). Signature, propriétaire, mode de sécurité (invoker),
-- absence de `search_path` explicite, logique du compteur
-- (`compteurs_reference`, verrouillage implicite via `INSERT ... ON CONFLICT DO
-- UPDATE`), isolation par entreprise, gestion de l'année et préfixes : tous
-- strictement identiques à la version précédente. `CREATE OR REPLACE FUNCTION`
-- sur une signature inchangée préserve automatiquement les GRANT/REVOKE déjà en
-- place (migration 20260902000255_acl_reconciliation_v1.sql) — aucun grant
-- touché ici.
create or replace function public.next_reference(p_entreprise_id uuid, p_type text, p_prefix text, p_largeur int default 4, p_avec_annee boolean default false)
returns text
language plpgsql
as $$
declare
  v_numero int;
  v_annee text := to_char(now(), 'YYYY');
  v_scope uuid := coalesce(p_entreprise_id, '00000000-0000-0000-0000-000000000000');
begin
  insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
  values (v_scope, p_type, 1)
  on conflict (entreprise_id, type)
  do update set dernier_numero = public.compteurs_reference.dernier_numero + 1
  returning dernier_numero into v_numero;

  if p_avec_annee then
    return p_prefix || '-' || v_annee || '-' || lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0');
  else
    return p_prefix || '-' || lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0');
  end if;
end;
$$;
