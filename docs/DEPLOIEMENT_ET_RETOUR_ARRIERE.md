# Déploiement et retour arrière

Ce document décrit la procédure du lot 2. Il ne remplace pas les sauvegardes de production.

## Avant le déploiement

1. Vérifier que le dépôt local est synchronisé avec `gh/main`.
2. Exécuter `npm ci`, puis `npm run verify`.
3. Vérifier la validité des migrations avec `npm run verify:migrations`.
4. Vérifier l'absence de secret suivi par Git avec `npm run verify:secrets`.
5. Relever l'URL et l'identifiant du déploiement Vercel actuellement en production.
6. Contrôler uniquement les noms et les environnements des variables Vercel, sans afficher
   leur contenu.

## Déploiement

Le déploiement de production doit correspondre à un commit Git identifié. Après publication :

1. attendre le statut `Ready` ;
2. ouvrir l'URL de production ;
3. vérifier les routes publiques et protégées ;
4. effectuer les tests fonctionnels sans paiement ni envoi réel ;
5. consulter les erreurs d'exécution Vercel et Sentry ;
6. noter le commit, l'URL, la date et le résultat des contrôles.

## Retour arrière de l'application

Si le nouveau déploiement est défectueux :

```bash
npx vercel rollback <URL_OU_ID_DU_DERNIER_DEPLOIEMENT_STABLE> --yes
```

Puis contrôler l'état :

```bash
npx vercel rollback status
```

Le retour arrière Vercel restaure le code et les variables attachées au déploiement ciblé. Il ne
restaure pas la base Supabase.

## Retour arrière de la base

Ne jamais supprimer une migration déjà appliquée en production et ne jamais lancer de
`supabase db reset` sur la production.

Pour un changement de schéma problématique :

1. bloquer les écritures concernées si nécessaire ;
2. examiner l'état réel de la base et la sauvegarde disponible ;
3. créer une nouvelle migration corrective et idempotente ;
4. la tester sur Supabase local ou sur un projet de test séparé ;
5. l'appliquer en production seulement après validation ;
6. restaurer une sauvegarde uniquement en dernier recours, avec mesure de la perte de données.

Une restauration complète doit être coordonnée avec Supabase et annoncée aux utilisateurs si elle
entraîne une indisponibilité ou une perte d'écritures.

## Critères de déclenchement

Un retour arrière immédiat est justifié notamment par :

- impossibilité de se connecter pour plusieurs rôles ;
- fuite ou mélange de données entre entreprises ;
- erreur généralisée sur les écritures métier ;
- impossibilité de créer ou lire les documents essentiels ;
- défaut de calcul financier avéré ;
- taux d'erreur serveur anormal après le déploiement.

Un défaut visuel mineur sans perte de données doit être corrigé par un nouveau commit ciblé.
