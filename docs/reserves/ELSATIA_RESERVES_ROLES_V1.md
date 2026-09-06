# ELSATIA Réserves — rôles et accès V1

## 1. Deux mécanismes distincts, jamais confondus

L'accès à Réserves se décide en deux temps, comme pour toute application ELSATIA :

1. **L'organisation** a-t-elle droit à l'application ? → `acces_applications_entreprises`
2. **L'utilisateur** est-il habilité, et à quel rôle ? →
   `habilitations_applications_utilisateurs`

Une habilitation est **propre à une application**. Elle ne se déduit ni d'un poste, ni
d'une permission métier Gestion Pro, ni d'un rôle détenu dans Colors ou Tools.

## 2. Rôles

| Code | Rôle | Ce qu'il peut faire |
| --- | --- | --- |
| `reserves_admin_organisation` | Administrateur | Tout, plus les paramètres et l'invitation d'entreprises extérieures |
| `reserves_responsable` | Responsable des réserves | Constate, attribue, **valide ou refuse les levées**, gère chantiers, plans et intervenants |
| `reserves_emetteur` | Émetteur | Constate, attribue, commente, exporte — **ne valide jamais une levée** |
| `reserves_intervenant` | Intervenant invité | Compte gratuit, limité aux réserves attribuées à son entreprise |
| `reserves_consultation` | Consultation | Lecture et export seulement |

La séparation entre `reserves_emetteur` et `reserves_responsable` est délibérée : celui
qui constate n'est pas nécessairement celui qui prononce que le désordre est réparé.

### Matrice des actions

| Action | admin | responsable | émetteur | consultation | intervenant |
| --- | :-: | :-: | :-: | :-: | :-: |
| `voir`, `exporter` | ✅ | ✅ | ✅ | ✅ | — |
| `creer_reserve`, `assigner`, `commenter` | ✅ | ✅ | ✅ | ❌ | — |
| `valider_levee` | ✅ | ✅ | ❌ | ❌ | — |
| `gerer_chantier`, `gerer_plans`, `gerer_intervenants` | ✅ | ✅ | ❌ | ❌ | — |
| `gerer_parametres`, `inviter_entreprise` | ✅ | ❌ | ❌ | ❌ | — |

Le rôle `reserves_intervenant` n'apparaît pas dans cette matrice parce qu'il ne s'y
applique pas : `reserves_action_autorisee()` lui répond `false` pour **toute** action, y
compris sur son propre tenant. Sa visibilité passe entièrement par l'autre porte,
`reserves_intervenant_courant()`.

## 3. L'entreprise extérieure invitée

Une entreprise intervenante est **son propre tenant ELSATIA**, jamais un sous-compte de
l'organisation hôte. L'invitation se fait en **deux temps délibérés** :

**Temps 1 — l'hôte désigne.** `reserves_designer_entreprise_intervenante()` rattache la
ligne d'intervenant à une organisation ELSATIA et lui ouvre l'accès applicatif Réserves
avec la source `reserves_invitation_gratuite`. La clause `on conflict do nothing`
garantit qu'un client Réserves payant ne voit jamais son propre droit réécrit par
l'invitation d'un tiers.

**Temps 2 — l'entreprise rejoint.** `reserves_rejoindre_intervention()` est appelée par
un **membre de l'entreprise invitée**, qui s'habilite au rôle gratuit `reserves_intervenant`
dans sa propre organisation.

Pourquoi deux temps : un hôte ne doit jamais pouvoir écrire une habilitation dans le
tenant d'un tiers à sa place. Le test pgTAP vérifie qu'après la désignation, l'entreprise
invitée n'a **aucune** habilitation utilisateur, et que l'hôte ne peut même pas relire
les droits applicatifs du tenant qu'il vient d'inviter.

### Ce que voit exactement une entreprise invitée

✅ Les réserves qui lui sont **nominativement attribuées**
✅ L'**identité** des chantiers où elle intervient (nom, adresse) — pour situer la réserve
✅ **Sa propre** ligne d'intervenant
✅ Les plans **effectivement référencés** par ses réserves
✅ Les conversations partagées avec elle
✅ L'historique et les photos de ses réserves

❌ Les réserves des **autres corps d'état** du même chantier
❌ Les **autres entreprises** intervenantes
❌ Les clients, devis, plannings, factures de l'hôte (Gestion Pro, RLS inchangées)
❌ Les conversations internes de l'hôte
❌ Toute écriture métier — elle agit uniquement par les RPC de workflow

## 4. Propriétaire global

`julien@elsatia.fr` accède à Réserves **automatiquement**, dès l'inscription de
l'application au catalogue, sans habilitation manuelle et sans exception codée dans
l'interface. Ce comportement vient de `a_acces_application()` (migration `00234`) et de
la désignation de propriétaire (`00266`) — Réserves n'ajoute rien.

**Ce que cela ne lui donne pas** : la lecture des réserves d'un client, ni la moindre
écriture métier. `reserves_action_autorisee()` ne lui accorde que `voir`, et seulement
sous **session support explicitement ouverte** — exactement la règle déjà appliquée par
Colors. Les tests le vérifient dans les deux sens.

## 5. Ce qu'il reste à construire

- **Écran d'administration des habilitations Réserves.** Aujourd'hui l'attribution des
  rôles passe par les RPC plateforme de `00234`, réservées à l'administrateur plateforme.
  Une organisation ne peut donc pas encore habiliter ses propres membres en autonomie.
- **Recherche d'organisation à l'invitation.** L'écran demande l'identifiant technique de
  l'organisation invitée ; un annuaire ou un envoi par e-mail sera nécessaire pour un
  usage réel.
- **Révocation côté entreprise invitée.** `reserves_revoquer_intervenant()` existe mais
  n'a pas encore d'écran.
