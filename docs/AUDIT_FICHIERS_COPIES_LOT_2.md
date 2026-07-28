# Audit des fichiers `* 2.tsx`

Date de l'audit : 28 juillet 2026

## Méthode

- inventaire avec `git ls-files '* 2.tsx'` ;
- recherche d'import explicite dans `src`, `package.json` et `next.config.ts` ;
- vérification de l'existence de la page ou du composant principal sans suffixe ;
- comparaison de la taille et du rôle apparent des deux fichiers ;
- rappel du routage Next.js : seul un fichier nommé exactement `page.tsx` crée une route.

## Résultat

Les onze fichiers sont suivis par Git, mais aucun n'est importé explicitement et aucun fichier
`page 2.tsx` ne participe au routage Next.js. Chaque fichier possède un équivalent principal
sans suffixe. Ils correspondent à d'anciennes copies, à des redirections historiques ou à des
versions réduites conservées lors de précédentes modifications.

| Copie | Principal actif | Conclusion |
|---|---|---|
| `src/app/(app)/conges/page 2.tsx` | `src/app/(app)/conges/page.tsx` | copie historique, non routée |
| `src/app/(app)/depenses/[id]/page 2.tsx` | `src/app/(app)/depenses/[id]/page.tsx` | copie historique, non routée |
| `src/app/(app)/factures/page 2.tsx` | `src/app/(app)/factures/page.tsx` | ancienne implémentation, non routée |
| `src/app/(app)/flotte/[id]/page 2.tsx` | `src/app/(app)/flotte/[id]/page.tsx` | copie historique, non routée |
| `src/app/(app)/flotte/nouveau/page 2.tsx` | `src/app/(app)/flotte/nouveau/page.tsx` | copie historique, non routée |
| `src/app/(app)/outillage/[id]/page 2.tsx` | `src/app/(app)/outillage/[id]/page.tsx` | copie historique, non routée |
| `src/app/(app)/outillage/nouveau/page 2.tsx` | `src/app/(app)/outillage/nouveau/page.tsx` | copie historique, non routée |
| `src/app/(app)/stock/page 2.tsx` | `src/app/(app)/stock/page.tsx` | ancienne implémentation, non routée |
| `src/app/paiement/annule/page 2.tsx` | `src/app/paiement/annule/page.tsx` | ancienne redirection, non routée |
| `src/app/paiement/succes/page 2.tsx` | `src/app/paiement/succes/page.tsx` | ancienne redirection, non routée |
| `src/components/StockMovementForm 2.tsx` | `src/components/StockMovementForm.tsx` | ancien composant, jamais importé |

## Décision du lot 2

Ces fichiers ne sont pas supprimés pendant ce lot. Ils n'ont aucun effet à l'exécution, et leur
suppression ne corrigerait pas un défaut utilisateur. Les conserver évite de perdre un historique
potentiellement utile tant qu'une validation produit explicite n'a pas autorisé leur archivage ou
leur suppression.

## Recommandation ultérieure

Après validation du propriétaire du produit, déplacer leur contenu utile dans l'historique Git puis
supprimer ces copies dans un commit dédié. Cette opération ne doit pas être mélangée à une correction
fonctionnelle.
