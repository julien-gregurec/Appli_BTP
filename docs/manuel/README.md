# Manuel utilisateur Liria Gestion Pro — en préparation

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

**Note interne : le nom commercial de l'application est provisoire et devra être remplacé dans l'ensemble du manuel avant publication.**

Ce dossier contient la refonte du manuel utilisateur de Liria Gestion Pro, construite à partir de `docs/developpement/inventaire-fonctionnalites.md`. Travail en cours, réalisé worktree par worktree — voir `docs/developpement/organisation-worktrees.md` pour l'organisation Git.

## État d'avancement

| Fichier | Rôle | Statut |
|---|---|---|
| `PERIMETRE-V1.md` | Matrice des modules inclus / bêta / exclus pour la V1 | Rédigé |
| `PLAN-CAPTURES.md` | Liste détaillée des captures d'écran nécessaires | Rédigé |
| `MODELE-CHAPITRE.md` | Gabarit standard pour chaque chapitre | Rédigé |
| `01-introduction.md` | Chapitre 1 — Introduction | Rédigé |
| `02-prise-en-main.md` | Chapitre 2 — Prise en main (connexion, tableau de bord) | Rédigé |
| `03-ventes-clients-devis-factures.md` | Chapitre 3 — Clients, devis, prestations et factures standard | Rédigé |
| `04-chantiers-planning-pointage.md` | Chapitre 4 — Chantiers, planning et pointage (dont suivi de zone) | Rédigé |
| `05-equipe-rh-conges-notes-de-frais.md` | Chapitre 5 — Employés, congés et notes de frais | Rédigé |
| `06-achats-fournisseurs-stock-materiel.md` | Chapitre 6 — Fournisseurs, commandes, stock et matériel | Rédigé |
| `07-pilotage-rentabilite-tresorerie-exports.md` | Chapitre 7 — Pilotage, rentabilité, trésorerie et exports | Rédigé |
| `08-assistant-ia-abonnement-parametres.md` | Chapitre 8 — Assistant IA, abonnement et paramètres | Rédigé |
| `09-messagerie-notifications.md` | Chapitre 9 — Messagerie et notifications | À rédiger |
| `10-fonctions-beta-limitees.md` | Fonctions en bêta, limitées ou en préparation | À rédiger |
| `11-annexes.md` | Annexes (FAQ, glossaire, aide) | À rédiger |

*Les chapitres 3 à 8 regroupent plusieurs domaines proches (validé les 31 juillet 2026 : ventes complètes ; chantiers/planning/pointage ; équipe/RH/congés/notes de frais ; achats/fournisseurs/stock/matériel ; pilotage/rentabilité/trésorerie/exports ; assistant IA/abonnement/paramètres) plutôt que d'être éclatés en un fichier par module, pour limiter le nombre de fichiers à maintenir sur un périmètre cohérent. La numérotation ci-dessous a été ajustée en conséquence par rapport à la première version de ce tableau.*

## Périmètre

Voir `PERIMETRE-V1.md` pour la liste précise des modules inclus en V1, des modules en bêta/limités, et des modules exclus du manuel client.

## Méthode de mise à jour

- Un chapitre = un fichier Markdown. Modifier un module ne doit pas obliger à retoucher tout le manuel.
- Chaque chapitre porte sa propre date de vérification, son commit de référence et son statut de validation (voir `MODELE-CHAPITRE.md`) : ne jamais mettre à jour le texte d'un chapitre sans mettre à jour ces trois champs.
- Avant toute révision majeure, rejouer une vérification de type inventaire (comme `docs/developpement/inventaire-fonctionnalites.md`) plutôt que de se fier au manuel existant.
- Avant publication commerciale, comparer explicitement le contenu avec l'état de `release/commercialisation-v1` (branche de Codex, non fusionnée ici) — voir la mention en tête de chaque fichier.

## Ce que ce dossier ne contient pas encore

- Les chapitres 9 à 11 (texte complet).
- Les captures d'écran elles-mêmes (liste préparée dans `PLAN-CAPTURES.md`, aucune image encore réalisée).
- Le PDF final.
- Toute information sur les modules en bêta/limités présentés comme des procédures pas-à-pas — ils font l'objet d'un traitement à part, jamais d'un mode d'emploi détaillé tant qu'ils ne sont pas validés (voir `PERIMETRE-V1.md`).
