# ELSATIA Colors → Bibliothèque technique — contrat futur (préparation, sans dépendance dure)

> **Statut : préparation documentaire uniquement.**
> Aucun code, aucune table, aucune migration, aucun écran. Colors ne connaît pas
> la Bibliothèque technique et ne doit pas la connaître : le contrat décrit
> ci-dessous est **facultatif des deux côtés**, et Colors doit continuer de
> fonctionner intégralement si la Bibliothèque n'existe jamais.

Lot d'origine : `ELSATIA-COLORS-CANONICAL-CODE-REBASE-V1`.
Voir aussi : `ELSATIA_COLORS_MARKET_EXPORT_CONTRACT_V1.md` (contrat frère,
mêmes règles de non-développement).

---

## 1. Le besoin réel

Un seau de peinture réel porte deux documents que le compagnon cherche sur le
terrain :

- la **fiche technique** (FT) : support, dilution, temps de recouvrement,
  rendement au m² ;
- la **fiche de données de sécurité** (FDS) : pictogrammes, EPI, mentions de
  danger, conduite à tenir.

Aujourd'hui, **ni l'un ni l'autre n'existe dans Colors** : aucune colonne,
aucune table, aucun champ d'écran, aucune référence dans les migrations 246 à
271. C'est un manque assumé du jalon V1.4, pas un oubli à combler en douce.

## 2. Principe directeur : aucune dépendance dure

La règle est plus forte qu'une simple bonne pratique, parce qu'elle décide de la
suite :

1. **Colors reste autonome.** Un seau sans FT ni FDS est un seau valide. Aucun
   écran ne doit afficher une erreur, un état dégradé ou un espace vide
   parlant parce que la Bibliothèque est absente ou injoignable.
2. **Aucune clé étrangère.** Le lien éventuel se fait par une **référence molle**
   (couple `marque` + `reference_produit`), jamais par une contrainte SQL vers
   une table d'un autre périmètre. Une FK créerait exactement la dépendance dure
   que ce document interdit.
3. **Aucune requête synchrone dans le rendu.** Si un jour Colors affiche un lien
   « fiche technique », il devra être rendu à partir de données déjà présentes,
   ou chargé après coup, sans jamais bloquer l'affichage d'un seau.
4. **Le résolveur appartient à la Bibliothèque.** C'est elle qui sait faire
   correspondre une marque et une référence à un document, pas Colors.

## 3. Forme du contrat de résolution (indicative, non implémentée)

```
resoudre(marque: string, reference?: string | null, teinte?: string | null)
  -> { fiche_technique?: DocRef, fds?: DocRef } | null
```

```jsonc
// DocRef
{
  "titre": "StoColor Dryonic — fiche technique",
  "type": "fiche_technique",   // ou "fds"
  "langue": "fr",
  "version": "2025-03",
  "url": "…"                   // toujours une URL signée à durée courte
}
```

Règles attachées à ce contrat :

- `null` est une réponse normale, pas une erreur ;
- une correspondance approximative doit être **signalée comme telle** à l'écran
  (« correspondance probable »), jamais présentée comme certaine — une FDS
  erronée est un risque de sécurité au travail, pas un défaut d'affichage ;
- aucune donnée personnelle ni identifiant d'entreprise ne transite dans la
  requête de résolution : `marque` et `reference_produit` suffisent.

## 4. Données que Colors peut fournir aujourd'hui

| Élément | Source | Disponible |
| --- | --- | --- |
| `marque` | `colors_seaux.marque` | oui, obligatoire |
| `reference_produit` | `colors_seaux.reference_produit` | oui, facultatif |
| `produit` | `colors_seaux.produit` | oui, obligatoire |
| `teinte_nom` / `teinte_reference` | `colors_seaux` | oui, facultatifs |
| fabricant distinct de la marque | — | **non** (le modèle ne connaît que `marque`) |
| conditionnement normalisé | `mode_quantite` + `unite` + `quantite_nominale` | partiel (pas de format catalogue) |

## 5. Ce que ce contrat ne fait pas

- Il ne réserve **aucun** numéro de migration.
- Il n'introduit **aucune** colonne « en prévision ».
- Il n'autorise **aucun** libellé d'écran annonçant les fiches techniques ou les
  FDS comme disponibles ou imminentes.
- Il ne transforme pas les pages `Nuanciers` et `Catalogues produits` — qui sont
  aujourd'hui des écrans `ComingSoon` honnêtes (« Aucune fonctionnalité métier
  n'est simulée dans ce jalon ») — en avant-goût fonctionnel.

## 6. Ordre de réalisation recommandé, le jour venu

1. Créer la Bibliothèque technique comme périmètre autonome, avec son propre
   stockage documentaire et son propre cloisonnement.
2. Exposer le résolveur décrit au §3, testable seul.
3. **Alors seulement** brancher Colors, en lecture, derrière un état
   « indisponible » silencieux, dans un lot Colors dédié avec sa propre recette.

Tout ordre différent recrée la dépendance dure que ce document existe pour
empêcher.
