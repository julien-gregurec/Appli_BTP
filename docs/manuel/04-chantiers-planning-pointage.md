# Chapitre 4 — Chantiers, planning et pointage

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre de créer et suivre un chantier, d'affecter une équipe et de la planifier, de pointer les heures travaillées, et de conserver les documents et photos liés au chantier.

### Utilisateurs concernés

- Dirigeant / chef de chantier / conducteur de travaux : création et suivi des chantiers, affectations, planning.
- Salarié terrain : pointage, consultation de ses propres tâches et documents chantier autorisés.

### Permissions nécessaires

- `acces_chantiers` — consulter et utiliser le module Chantiers
- `acces_planning` — consulter et modifier le planning
- `acces_pointage` — consulter et saisir les pointages
- `gerer_chantiers` — créer/modifier une fiche chantier et ses affectations (permission de gestion, distincte du simple accès)
- `gerer_planning` — modifier le planning des équipes
- `saisir_son_pointage` — pointer pour soi-même
- `valider_pointages` — valider les pointages de l'équipe, recevoir les alertes associées (dont la sortie de zone, voir plus bas)

### Procédure

**Créer et consulter un chantier**
1. Depuis le module Chantiers, créer une nouvelle fiche avec le client, l'adresse et les informations de base.
2. La fiche chantier centralise ensuite devis/factures associés, documents, tâches et suivi financier.

**Affecter une équipe**
1. Depuis la fiche chantier ou depuis le Planning, affecter un ou plusieurs salariés à une période donnée.
2. Une affectation détermine qui est attendu sur le chantier à une date donnée — c'est cette information que le pointage et le planning utilisent ensuite.

**Planning**
1. Le planning présente les affectations sous forme de tableau (vue ordinateur) ou de vue par jour (vue mobile).
2. Toute modification de planning doit rester cohérente avec les affectations déjà enregistrées.

**Pointage**
1. Le salarié ouvre l'écran de pointage, sélectionne le chantier concerné (le chantier du jour ou déjà affecté est proposé en priorité) et enregistre son arrivée.
2. **Le salarié ne peut pointer que pour lui-même.** Un contrôle serveur dédié refuse toute tentative de pointage réalisée au nom d'un autre salarié sans permission explicite — ce n'est pas une simple précaution d'interface, c'est vérifié côté serveur à chaque enregistrement.
3. Selon la configuration de l'entreprise, la position GPS peut être demandée à l'arrivée et au départ ; si elle est indisponible, un motif peut être saisi à la place plutôt que de bloquer le pointage.
4. Si l'entreprise a activé le **suivi de zone** (voir Limites de la géolocalisation ci-dessous), un bandeau visible informe le salarié que sa position est vérifiée périodiquement pendant qu'il est pointé.
5. Le responsable pointage valide ensuite les heures saisies depuis l'écran de gestion du pointage.

**Documents et photos chantier**
1. Depuis la fiche chantier, ajouter des documents (plans, DOE, pièces administratives) ou des photos.
2. La visibilité d'un document dépend de l'audience choisie à son ajout (par exemple : équipe affectée uniquement).

**Tâches et suivi**
1. Un devis accepté associé au chantier génère automatiquement les tâches correspondantes.
2. L'avancement des tâches se suit depuis la fiche chantier.

### Résultat attendu

Un chantier est créé, une équipe y est affectée et planifiée, les salariés pointent leurs heures sur le bon chantier, et les documents/photos utiles sont accessibles aux bonnes personnes.

### Erreurs fréquentes

- Tentative de pointage sans chantier affecté ce jour-là : le chantier du jour n'apparaît pas en priorité dans la liste — vérifier l'affectation avant de conclure à un problème technique.
- Position GPS indisponible au moment de pointer : un motif peut être saisi pour continuer sans bloquer le pointage — ne pas présenter le GPS comme obligatoire dans tous les cas.
- Document chantier invisible pour un salarié : vérifier l'audience choisie lors de l'ajout du document, qui peut restreindre sa visibilité à l'équipe affectée.

### Limites connues

- **La géolocalisation dépend des permissions accordées par l'appareil du salarié** (téléphone ou ordinateur). Si l'utilisateur refuse l'accès à sa position, l'application ne peut pas la récupérer — ce n'est pas un défaut de l'application, c'est une limite du terminal utilisé.
- **Le suivi de zone en arrière-plan peut être limité par iOS et Android** : il fonctionne de façon fiable tant que l'application reste ouverte à l'écran ; un navigateur mobile ne peut pas garantir un suivi continu une fois l'application fermée ou l'écran verrouillé longtemps. Ne jamais présenter cette fonction comme un suivi permanent façon application native.
- Le suivi de zone est **transparent** : le salarié en est explicitement informé à l'écran pendant qu'il est actif ; ce n'est jamais un mécanisme caché, et ce point doit être conservé tel quel dans toute communication commerciale.
- **Un salarié ne doit jamais pouvoir pointer au nom d'un autre** sans permission explicite — ce comportement est un contrôle de sécurité volontaire, à présenter comme une garantie plutôt que comme une contrainte.

### Fonctions volontairement exclues de ce chapitre

Interventions (contrats, bons de travail), grands et petits déplacements (frais de route/paniers automatisés), ouvrages et métrés. Ces fonctions existent dans l'application mais ne sont pas présentées comme incluses dans la version commerciale V1 — voir `PERIMETRE-V1.md` et la section « Fonctions en bêta, limitées ou en préparation » (non encore rédigée).

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/(app)/pointage/page.tsx`, `src/components/SuiviZoneChantier.tsx`, `supabase/migrations/20260723000130_pointage_gps_optionnel.sql` (contrôle serveur `peut_pointer_pour_employe`), `supabase/migrations/20260723000137_suivi_zone_chantier.sql`. Le comportement précis du planning en vue mobile et la synchronisation exacte tâches/devis n'ont pas été vérifiés en exécution réelle — validation manuelle encore requise.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code (y compris le contrôle serveur anti-usurpation de pointage). Validation manuelle encore requise pour : le comportement du planning mobile, la synchronisation tâches/devis en conditions réelles, le suivi de zone (jamais testé par l'utilisateur final selon `docs/developpement/inventaire-fonctionnalites.md`).
