-- Correctif capacité : débordement de la numérotation des documents (devis/factures/avoirs/commandes)
-- au-delà de 999 documents cumulés pour une même entreprise.
--
-- Constat (mission perf/gp-capacity-readiness-v1, fixture ~5000 devis / ~3000 factures sur une PME
-- BTP synthétique de plusieurs années d'historique) : `formater_numero_document` utilise
-- `lpad(p_numero::text, greatest(p_largeur, 1), '0')` avec la largeur par défaut (3). `lpad` en
-- PostgreSQL TRONQUE la chaîne si elle dépasse déjà la largeur demandée (et non l'inverse) : dès que
-- le compteur `devis`/`facture`/`avoir`/`commande` d'une entreprise dépasse 999, les numéros 1000,
-- 1001, 1002... sont tous formatés sur 3 caractères ('100', '100', '100'...), ce qui viole la
-- contrainte d'unicité `(entreprise_id, numero)` et bloque l'émission du devis/de la facture suivant
-- avec une erreur 23505 (« duplicate key value »), visible côté utilisateur comme une opération qui
-- échoue sans raison apparente.
--
-- Le compteur lui-même (`compteurs_reference`) ne se remet jamais à zéro par défaut
-- (`compteur_annuel = false`, comportement historique documenté dans la migration 294) : une PME BTP
-- active (plusieurs devis/jour) franchit 999 devis cumulés en moins d'un an. C'est donc un défaut de
-- CAPACITÉ réel, pas seulement théorique — reproduit de façon déterministe en générant la fixture de
-- qualification (§ 21 du rapport).
--
-- Correctif : ne jamais tronquer le numéro — la largeur configurée reste un plancher, pas un plafond.
-- Comportement inchangé pour tout compteur <= 999 (le cas normal aujourd'hui en Production).

create or replace function public.formater_numero_document(p_prefixe text, p_avec_annee boolean, p_avec_mois boolean, p_separateur text, p_largeur integer, p_numero integer, p_date date)
returns text language sql immutable as $$
  select array_to_string(array_remove(array[
           nullif(p_prefixe, ''),
           case when p_avec_annee then to_char(p_date, 'YYYY') end,
           case when p_avec_mois then to_char(p_date, 'MM') end,
           lpad(p_numero::text, greatest(p_largeur, length(p_numero::text), 1), '0')
         ], null), p_separateur)
$$;
