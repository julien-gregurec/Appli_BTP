# Chapitre 5 — Équipe, RH, congés et notes de frais

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre de créer et gérer les fiches salariés, de comprendre les rôles et permissions visibles dans l'application, de traiter une demande de congé, et de saisir/valider une note de frais avec justificatif.

### Utilisateurs concernés

- Dirigeant / gestionnaire RH : création des fiches salariés, attribution des postes, décision sur les congés, validation des notes de frais de l'équipe.
- Salarié : consultation de sa propre fiche, demandes de congé, saisie de ses propres notes de frais.

### Permissions nécessaires

- `gerer_employes` — créer/modifier les fiches salariés, gérer leurs accès
- `gerer_conges` — consulter et décider les demandes de congés de l'équipe
- `gerer_notes_frais` — consulter, valider, refuser et rembourser les notes de frais de l'équipe
- `voir_indicateurs_financiers` — nécessaire pour voir le coût et le taux horaire d'un salarié sur sa fiche
- `saisir_son_pointage` — chaque salarié pointe uniquement pour lui-même (voir aussi chapitre 4)
- `voir_pointages_equipe` — consulter les pointages d'autres salariés

### Procédure

**Fiche salarié**
1. Depuis le module Employés, créer une nouvelle fiche avec les informations du salarié et son poste.
2. Le poste attribué détermine les permissions dont dispose le salarié dans l'ensemble de l'application (voir chapitre 16, non encore rédigé, pour le détail de la matrice des droits).
3. La fiche salarié peut recevoir une photo, une signature enregistrée et, si applicable, une carte professionnelle du bâtiment — ces documents restent des pièces sensibles, à traiter avec la même prudence qu'un dossier RH papier.
4. Le statut du compte applicatif du salarié (actif, en pause, etc.) se gère depuis sa fiche.

**Planning personnel**
1. Chaque salarié consulte ses propres affectations depuis le planning ou depuis « Mes travaux » — voir chapitre 4 pour la procédure complète de planning et pointage.

**Congés**
1. Le salarié dépose une demande de congé, avec ses dates.
2. La demande arrive chez le responsable habilité (`gerer_conges`), qui l'approuve ou la refuse, éventuellement avec un message.
3. Une demande approuvée est automatiquement reportée sur le planning.

**Notes de frais**
1. Le salarié crée une note de frais avec son montant et joint un justificatif (photo ou PDF).
2. La note suit un cycle de statuts (par exemple : en attente, validée, refusée, remboursée) piloté par le responsable habilité (`gerer_notes_frais`).
3. Le justificatif n'est jamais accessible par un lien public permanent : sa consultation passe par une vérification des droits à chaque demande, jamais par une simple URL partageable.
4. Une référence comptable peut être associée à une note validée, pour le suivi côté comptabilité.

### Résultat attendu

Une fiche salarié complète existe et détermine ses droits ; une demande de congé a été traitée et reflétée sur le planning ; une note de frais a été saisie avec son justificatif et validée par un responsable habilité.

### Erreurs fréquentes

- Un salarié ne voit pas le coût ou le taux horaire sur sa propre fiche ou celle d'un collègue : cette information nécessite la permission `voir_indicateurs_financiers`, distincte de `gerer_employes` — vérifier laquelle est manquante avant de conclure à un bug.
- Une note de frais reste bloquée « en attente » : elle nécessite l'action d'un responsable disposant de `gerer_notes_frais`, aucune validation automatique n'existe.
- Un justificatif refuse de s'ouvrir : peut indiquer un problème de droits (le lien n'est valable que pour un accès autorisé et vérifié), pas nécessairement un fichier corrompu.

### Limites connues

- **Le salarié agit en principe en son propre nom.** Un responsable ne peut agir à la place d'un autre salarié (pointage, demande de congé, note de frais) que si une permission explicite le lui accorde — ce n'est jamais un comportement par défaut.
- Les documents RH (photo, signature, carte professionnelle, justificatifs de notes de frais) sont des données sensibles ; leur accès doit toujours rester limité aux personnes habilitées, jamais élargi « pour simplifier ».
- **Les règles sociales encadrant congés, notes de frais et géolocalisation devront être validées juridiquement avant toute commercialisation** — ce chapitre décrit le fonctionnement de l'application, pas une garantie de conformité sociale ou du droit du travail.

### Fonctions RH en bêta ou dépendantes d'un prestataire externe

Ces fonctions existent dans l'application mais ne sont pas présentées comme finalisées dans ce chapitre :

| Fonction | Statut |
|---|---|
| Paie complète (calcul et émission des bulletins) | Non incluse dans la version commerciale actuelle |
| Virements de salaires | Dépendante d'un prestataire externe (Powens, contrat non souscrit) |
| Grands déplacements | Non incluse dans la version commerciale actuelle |
| Petits déplacements | Non incluse dans la version commerciale actuelle |
| Suivi GPS permanent du salarié | Non applicable — le suivi de zone (chapitre 4) ne fonctionne que pendant une session de pointage active, jamais en continu |
| Données bancaires / RIB au-delà de l'usage validé | Dépendante d'un prestataire externe ; seul le stockage chiffré et l'affichage partiel (derniers chiffres) sont considérés comme validés dans ce lot |

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/actions/employes.ts`, `src/app/actions/conges.ts`, `src/app/actions/notes-frais.ts`, et de la route `src/app/api/notes-frais/[id]/justificatif/route.ts` (accès contrôlé, confirmé par lecture directe du code, pas par exécution). Les statuts exacts du cycle de vie d'une note de frais n'ont pas tous été énumérés depuis le code — validation manuelle recommandée avant publication.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code. Validation manuelle encore requise pour : le cycle de statuts complet des notes de frais, le comportement réel du report d'un congé approuvé sur le planning, la conformité juridique des règles sociales (hors périmètre technique de cette vérification).
