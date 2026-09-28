-- ELSATIA — Baseline performance V1 : variante « encaissements réalistes » d'un jeu GP.
-- La fixture laisse ~70 % des factures « envoyées » impayées sur 5 ans : le tableau de bord porte
-- alors des milliers d'alertes « à encaisser » (10 736 sur le jeu gros), ce qu'aucune entreprise
-- réelle ne connaît. Ici, toute facture échue depuis plus de 120 jours est soldée par un paiement
-- (le trigger de paiement la fait passer « payée ») : il ne reste que les impayés récents.
-- Base jetable uniquement ; rejouable (ne paie que ce qui reste dû).
insert into public.paiements (facture_id, montant, date, mode, reference)
select f.id, f.montant_ttc - f.montant_paye, f.date_echeance + 20, 'virement', 'PERF-SOLDE-' || f.numero
from public.factures f
where f.entreprise_id = 'a0000000-0000-4000-a000-000000000001'
  and f.statut in ('envoyee', 'payee_partiel')
  and f.date_echeance < current_date - 120
  and f.montant_ttc > f.montant_paye;
analyze public.factures;
select count(*) filter (where statut in ('envoyee', 'payee_partiel')) restant_dues,
       count(*) filter (where statut in ('envoyee', 'payee_partiel') and date_echeance <= current_date + 7) alertes_encaissement
from public.factures where entreprise_id = 'a0000000-0000-4000-a000-000000000001';
