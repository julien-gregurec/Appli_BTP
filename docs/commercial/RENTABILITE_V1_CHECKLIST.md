# RENTABILITÉ-V1 — Checklist des écarts

Référence : `docs/commercial/RENTABILITE_V1_AUDIT_ELSATIA.md`. Les 3 écarts P0 ont été corrigés dans RENTABILITÉ-V1B (voir `docs/commercial/RENTABILITE_V1B_CORRECTIONS_P0_ELSATIA.md`) ; P1/P2/P3 restent non traités, à dessein.

## P0 — Bloquant commercialisation

- [x] Unifier les 3 implémentations de la formule de marge (`src/lib/rentabilite.ts`, `src/app/actions/rentabilite.ts`, `src/app/(app)/rentabilite/page.tsx`) — le copilote IA omet aujourd'hui 3 postes de coût et n'exclut pas les pointages non validés/rejetés. **Corrigé RENTABILITÉ-V1B** : source unique `calculerRentabiliteChantiers`, les 3 consommateurs délèguent désormais à cette fonction.
- [x] Ajouter une policy RLS restrictive sur `employes` pour le SELECT de `cout_horaire`, conditionnée à une permission (aujourd'hui lisible par tout salarié authentifié via appel API direct, contournant le masquage UI). **Corrigé RENTABILITÉ-V1B** : colonne isolée dans `employes_cout_horaire`, RLS restrictive par permission (`voir_cout_interne_employe` ou `acces_rentabilite`).
- [x] Décider et implémenter le traitement du coût horaire dans le temps (snapshot au pointage vs recalcul rétroactif assumé) — aujourd'hui, changer le coût d'un salarié modifie silencieusement la rentabilité de tous ses chantiers passés. **Corrigé RENTABILITÉ-V1B** : `pointages.cout_horaire_applique`, figé à la validation par `valider_preuve_pointage()`.

## P1 — Important avant premier client

- [ ] Relier `chantiers.budget_previsionnel` aux devis acceptés, ou supprimer ce champ au profit de la seule source réellement utilisée.
- [ ] Décider d'un vrai concept d'avenant (au minimum un lien de parenté entre devis), ou documenter officiellement que « nouveau devis sur le même chantier » est la méthode voulue.
- [ ] Ajouter une policy RLS restrictive sur `mouvements_stock` (actuellement lisible par tout membre actif sans permission).
- [ ] Corriger le garde-fou de surfacturation pour qu'il tienne compte de `situations_travaux` (aujourd'hui contournable en combinant les deux mécanismes).
- [ ] Décider si achats engagés (commandes non facturées) et sous-traitance prévisionnelle doivent entrer dans un futur calcul de « coûts prévus ».
- [ ] Ajouter une comparaison prévu/réalisé (CA et marge) sur l'écran `/rentabilite` — actuellement seul le réalisé est affiché.
- [ ] Uniformiser `coutNotesFrais` en HT (actuellement seul poste en TTC dans la formule de marge).

## P2 — Amélioration post-lancement

- [ ] Factoriser les 3 implémentations en une seule fonction partagée, même une fois B/C alignées avec A.
- [ ] Revoir l'inclusion du statut `litige` dans le coût réel des factures fournisseurs.
- [ ] Nettoyer `planning_evenements` (table morte, non utilisée par l'UI).
- [ ] Ajouter des tests automatisés sur les formules de rentabilité et sur les RLS sensibles (`employes.cout_horaire`, `mouvements_stock`).
- [ ] Vérifier l'absence de dérive d'arrondi sur un volume réel de données.
- [ ] Surveiller la performance de `/rentabilite` si le volume de pointages/dépenses croît significativement (agrégation en mémoire, sans pagination).

## P3 — Futur module

- [ ] Imputation automatique du coût matériel/véhicules à un chantier.
- [ ] Export rentabilité (PDF/CSV/Excel).
- [ ] Exploiter les commandes fournisseurs comme « achats engagés » dans un futur module Commandes V1.

## Non exécuté dans ce lot (à faire en suivi immédiat recommandé)

- [x] Chantier fictif Local/Preview avec injection progressive de données réelles (devis 8 000 € HT, facturation, MO, achats, sous-traitance, stock, notes de frais, facture annulée, pointage rejeté) pour valider empiriquement les constats ci-dessus. **Fait RENTABILITÉ-V1B** : chantier « Audit Rentabilité P0 » construit en Local (vérifié programmatiquement contre `calculerRentabiliteChantiers` réelle) et en Preview (entreprise ELSATIA — Recette Preview, pour vérification visuelle humaine).
