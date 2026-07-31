# Manuel utilisateur Liria Gestion Pro — en préparation

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

Ce dossier contient la refonte du manuel utilisateur de Liria Gestion Pro, construite à partir de `docs/developpement/inventaire-fonctionnalites.md`. Travail en cours, réalisé worktree par worktree — voir `docs/developpement/organisation-worktrees.md` pour l'organisation Git.

## État d'avancement

| Fichier | Rôle | Statut |
|---|---|---|
| `PERIMETRE-V1.md` | Matrice des modules inclus / bêta / exclus pour la V1 | Rédigé |
| `PLAN-CAPTURES.md` | Liste détaillée des captures d'écran nécessaires | Rédigé |
| `MODELE-CHAPITRE.md` | Gabarit standard pour chaque chapitre | Rédigé |
| `01-introduction.md` | Chapitre 1 — Introduction | Rédigé |
| `02-prise-en-main.md` | Chapitre 2 — Prise en main (connexion, tableau de bord) | Rédigé |
| `03-clients.md` | Chapitre 3 — Clients | À rédiger |
| `04-devis-prestations.md` | Chapitre 4 — Devis et prestations | À rédiger |
| `05-factures.md` | Chapitre 5 — Factures standard | À rédiger |
| `06-chantiers.md` | Chapitre 6 — Chantiers | À rédiger |
| `07-planning.md` | Chapitre 7 — Planning | À rédiger |
| `08-pointage.md` | Chapitre 8 — Pointage (et suivi de zone) | À rédiger |
| `09-employes.md` | Chapitre 9 — Employés | À rédiger |
| `10-conges.md` | Chapitre 10 — Congés | À rédiger |
| `11-notes-de-frais.md` | Chapitre 11 — Notes de frais | À rédiger |
| `12-fournisseurs.md` | Chapitre 12 — Fournisseurs | À rédiger |
| `13-commandes-receptions.md` | Chapitre 13 — Commandes et réceptions | À rédiger |
| `14-stock-inventaires.md` | Chapitre 14 — Stock et inventaires | À rédiger |
| `15-outillage-flotte.md` | Chapitre 15 — Outillage et flotte | À rédiger |
| `16-rentabilite-exports.md` | Chapitre 16 — Rentabilité et exports | À rédiger |
| `17-messagerie-notifications.md` | Chapitre 17 — Messagerie et notifications | À rédiger |
| `18-assistant-ia.md` | Chapitre 18 — Assistant IA (usages validés) | À rédiger |
| `19-abonnement.md` | Chapitre 19 — Abonnement | À rédiger |
| `20-parametres-permissions.md` | Chapitre 20 — Paramètres et permissions | À rédiger |
| `21-fonctions-beta-limitees.md` | Fonctions en bêta, limitées ou en préparation | À rédiger |
| `22-annexes.md` | Annexes (FAQ, glossaire, aide) | À rédiger |

*La numérotation ci-dessus diffère légèrement du plan initial à 12 chapitres présenté le 31 juillet 2026 : chaque domaine du périmètre V1 (`PERIMETRE-V1.md`) reçoit son propre fichier plutôt que d'être regroupé, pour faciliter la mise à jour indépendante de chacun (voir méthode de mise à jour ci-dessous).*

## Périmètre

Voir `PERIMETRE-V1.md` pour la liste précise des modules inclus en V1, des modules en bêta/limités, et des modules exclus du manuel client.

## Méthode de mise à jour

- Un chapitre = un fichier Markdown. Modifier un module ne doit pas obliger à retoucher tout le manuel.
- Chaque chapitre porte sa propre date de vérification, son commit de référence et son statut de validation (voir `MODELE-CHAPITRE.md`) : ne jamais mettre à jour le texte d'un chapitre sans mettre à jour ces trois champs.
- Avant toute révision majeure, rejouer une vérification de type inventaire (comme `docs/developpement/inventaire-fonctionnalites.md`) plutôt que de se fier au manuel existant.
- Avant publication commerciale, comparer explicitement le contenu avec l'état de `release/commercialisation-v1` (branche de Codex, non fusionnée ici) — voir la mention en tête de chaque fichier.

## Ce que ce dossier ne contient pas encore

- Les chapitres 3 à 22 (texte complet).
- Les captures d'écran elles-mêmes (liste préparée dans `PLAN-CAPTURES.md`, aucune image encore réalisée).
- Le PDF final.
- Toute information sur les modules en bêta/limités présentés comme des procédures pas-à-pas — ils font l'objet d'un traitement à part, jamais d'un mode d'emploi détaillé tant qu'ils ne sont pas validés (voir `PERIMETRE-V1.md`).
