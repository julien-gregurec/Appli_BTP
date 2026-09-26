# ELSATIA Colors → Market — contrat d'export (préparation, non développé)

> **Statut : préparation documentaire uniquement.**
> Aucune ligne de code de ce pont n'existe dans le dépôt, et aucun écran Colors
> n'annonce Market. Ce document décrit ce que Colors *pourrait* exposer le jour
> où Market existera ; il ne crée aucune dépendance, aucune table, aucune
> migration et aucune route. Tant que Market n'est pas développé, la règle
> reste : **ne rien afficher, ne rien promettre, ne rien exporter**.

Lot d'origine : `ELSATIA-COLORS-CANONICAL-CODE-REBASE-V1`.
Périmètre technique de référence : `apps/colors` sur
`integration/colors-code-on-ecosystem-ledger-v1`, migrations Colors 246–249 et
271 du train global (aucune migration ajoutée par ce lot).

---

## 1. Pourquoi un contrat écrit avant tout code

Colors tient l'inventaire réel de peinture d'une entreprise : marque, produit,
teinte, quantité restante, état, photo. Un futur Market — revente ou cession de
seaux entre entreprises — consommerait exactement ces données. Écrire le contrat
maintenant a un seul objectif : **éviter que le modèle Colors ne dérive** vers
une forme inexploitable, et éviter qu'un développement Market futur ne réclame
une migration rétroactive sur des données déjà saisies par des clients.

Écrire le contrat n'autorise pas à le brancher.

## 2. Source de vérité

L'unique source est la table `public.colors_seaux` (migration
`20260828000246_colors_functional_core_v1.sql`, amendée par 247/248/249 et 271),
lue à travers les fonctions `SECURITY DEFINER` existantes. Le pont futur ne
devra **jamais** lire la table en direct : le cloisonnement multi-organisation
est porté par `colors_action_autorisee(entreprise_id, action)`, pas par le code
applicatif.

## 3. Données exportables

| Champ du contrat | Source Colors | Disponible aujourd'hui | Remarque |
| --- | --- | --- | --- |
| `marque` | `colors_seaux.marque` | oui (`not null`) | texte libre borné à 120 caractères ; aucun référentiel fabricant n'existe |
| `reference` | `colors_seaux.reference_produit` | oui (nullable) | référence catalogue du produit, saisie libre |
| `produit` | `colors_seaux.produit` | oui (`not null`) | libellé commercial ; complète `reference` quand celle-ci est absente |
| `teinte` | `colors_seaux.teinte_nom` + `teinte_reference` + `couleur_hex` | oui (nullable) | trois représentations complémentaires ; `couleur_hex` est contraint `^#[0-9A-F]{6}$` |
| `teinte_ral` | `colors_seaux.ral_approxime`, `ral_distance`, `ral_confirme` | **colonnes présentes, jamais alimentées** | voir §6 « réserves » |
| `finition` | **inexistant** | **non** | voir §6 |
| `quantite` | `mode_quantite`, `quantite_nominale`, `quantite_restante`, `unite`, `pourcentage_saisi`, `pourcentage_restant` | oui | trois modes exclusifs : `pourcentage`, `volume` (`l`/`ml`), `poids` (`kg`/`g`) |
| `etat` | `colors_seaux.etat` | oui | `ferme`, `ouvert`, `vide`, `archive` |
| `photos` | `colors_seaux.photo_principale_path` | oui (nullable) | chemin dans le bucket privé `colors-seaux`, jamais une URL publique |
| `idempotency_key` | **à construire** | **non** | voir §4 |
| `provenance` | `entreprise_id`, `emplacement_id`, `created_at`, `updated_at`, `updated_by`, journal `colors_mouvements` | oui | voir §5 |

### Forme proposée (indicative, non implémentée)

```jsonc
{
  "idempotency_key": "colors:<entreprise_id>:<seau_id>:<updated_at ISO>",
  "provenance": {
    "application": "colors",
    "entreprise_id": "uuid",
    "seau_id": "uuid",
    "emplacement": { "id": "uuid", "nom": "Dépôt Nord", "type": "depot" },
    "cree_le": "2026-09-01T08:12:00Z",
    "modifie_le": "2026-09-07T16:40:00Z",
    "modifie_par": "uuid | null"
  },
  "marque": "Sto",
  "reference": "REF-4821",
  "produit": "StoColor Dryonic",
  "teinte": { "nom": "Blanc cassé", "reference": "T-118", "hex": "#F2EFE6", "ral": null },
  "finition": null,
  "quantite": { "mode": "volume", "nominale": 15, "restante": 9.5, "unite": "l", "pourcentage_restant": 63.33 },
  "etat": "ouvert",
  "photos": [{ "bucket": "colors-seaux", "chemin": "<entreprise_id>/<seau_id>/<uuid>.jpg" }]
}
```

## 4. Clé d'idempotence

Aucune clé d'idempotence n'existe aujourd'hui dans le modèle Colors. Le contrat
en réclame une pour qu'une même annonce ne soit pas publiée deux fois si le pont
rejoue un lot.

Contrainte à respecter le jour venu : la clé doit être **dérivable sans écriture
en base**, donc **sans nouvelle colonne et sans nouvelle migration**. La forme
`colors:<entreprise_id>:<seau_id>:<updated_at>` satisfait cette contrainte —
`updated_at` est maintenu par le trigger `colors_set_updated_at`, et toute
mutation métier passe par une RPC qui le rafraîchit. Une remise en vente après
modification produit donc une clé différente, ce qui est le comportement
attendu.

Si Market exige une clé stable dans le temps, elle devra être portée **côté
Market**, pas côté Colors.

## 5. Provenance

La provenance exportable est déjà complète et n'exige aucun développement
Colors :

- `entreprise_id` — propriétaire du seau, seul cloisonnement qui fasse foi ;
- `emplacement_id` / nom / type — où le seau se trouve physiquement ;
- `created_at`, `updated_at`, `updated_by` (V1.4) ;
- le journal append-only `colors_mouvements`, lisible via
  `colors_activite_recente`, qui porte l'historique complet (entrées, sorties,
  déplacements, ouvertures, ajustements, archivages, restaurations,
  modifications champ par champ).

Un acheteur Market pourrait donc se voir présenter « ce seau a été ouvert le
X, il en reste Y depuis Z » sans qu'aucune donnée ne soit inventée.

## 6. Réserves explicites — ce qui manque

Trois manques sont réels et doivent être traités **avant** tout développement
Market, pas pendant :

1. **`finition` n'existe pas.** Le modèle Colors ne porte aucune notion de
   finition (mat, satiné, brillant, velours…). Un Market peinture en aura besoin.
   L'ajouter suppose une migration Colors — donc un lot dédié, hors de ce lot-ci.
   En attendant, `finition` est exporté à `null`, jamais deviné depuis le
   libellé produit.
2. **RAL non alimenté.** Les colonnes `ral_approxime` / `ral_distance` /
   `ral_confirme` existent et sont contraintes correctement, mais aucun écran ni
   aucune action ne les écrit : `apps/colors/src/lib/ral.ts` fournit le calcul de
   distance Lab et la recherche du plus proche, sans palette de référence et sans
   appelant. Le champ `teinte.ral` du contrat est donc structurellement `null`
   aujourd'hui.
3. **Photos privées.** Le bucket `colors-seaux` est privé (`public = false`,
   politiques de la migration 246). Aucun export ne doit produire d'URL
   publique : le pont devra passer par une URL signée à durée courte, générée au
   moment de la consultation par Market, et jamais stockée.

## 7. Ce que ce contrat interdit

- Créer une table, une colonne, une RPC ou une migration « en prévision » de
  Market.
- Afficher dans Colors un bouton, un onglet, une mention ou un état
  « bientôt sur Market ».
- Exposer une route d'export Market, même désactivée.
- Déduire `finition` ou `ral` par heuristique à partir du texte saisi.

Ces interdictions sont vérifiables : aucune occurrence de « market » n'existe
dans `apps/colors/`.
