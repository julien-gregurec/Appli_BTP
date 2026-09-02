# Checklist de publication et validation finale

## Juridique et confidentialité

- [ ] Politique de confidentialité publique, accessible sans connexion, cohérente avec Supabase, Stripe, Apple et Google.
- [ ] CGU publiques et coordonnées d’assistance fonctionnelles.
- [ ] Page Web de suppression publiée et parcours in-app vérifié ; suppression du compte commun et données associées expliquée.
- [ ] Délais de traitement, exceptions légales de conservation et impact des abonnements validés juridiquement.
- [ ] App Privacy Apple et Data Safety Google remplis d’après le binaire final ; aucune déclaration copiée sans audit des SDK.
- [ ] Âge, droits d’auteur, zones de distribution, classification et informations DSA validés par Julien.

## Produits et achats futurs

- [ ] Créer les deux Price Stripe Test et configurer Checkout, Portal et webhook Test.
- [ ] Créer un groupe d’abonnements Apple, les produits mensuel/annuel, localisations, prix, captures de revue, Sandbox et notifications V2.
- [ ] Créer les abonnements Google, une offre de base par période, testeurs de licence, compte de service et RTDN.
- [ ] Vérifier que les IDs correspondent exactement à la matrice R10 ; conserver les secrets uniquement dans les coffres fournisseurs/environnements.
- [ ] Exécuter achat, renouvellement/grâce, annulation, expiration, remboursement, restauration et prévention du double achat pour chaque fournisseur.

## Validation Web

- [ ] Tests, lint, typecheck, build production, audit PWA/offline et liens légaux.
- [ ] Compte Free puis Pro, session expirée, récupération du mot de passe, suppression du compte.
- [ ] Deux entreprises autorisées : bascule, isolation projets/cache/conflits, révocation et retour réseau.
- [ ] Stripe Test E2E et entitlement relu sur Android/iOS.
- [ ] Déploiement uniquement après autorisation explicite.

## Validation Android

- [ ] Incrémenter `versionCode`, générer AAB signé avec clé conservée hors dépôt et tester le bundle Play.
- [ ] API 36, permissions fusionnées minimales, sauvegarde applicative désactivée, deep link récupération et partage de fichier.
- [ ] Téléphone et tablette : installation propre, mise à jour, kill/relaunch, hors ligne, reprise, rotation et retour arrière.
- [ ] Achat Google Play test, acknowledgement serveur, restauration, révocation et entitlement Web/iOS.
- [ ] Captures finales sans données personnelles puis piste interne/fermée uniquement après autorisation.

## Validation iOS/iPadOS

- [ ] Incrémenter le build, archive Release signée et analyse Xcode sans erreur de confidentialité.
- [ ] PrivacyInfo valide, aucune permission sans description, deep link récupération et ouverture `.elsatiatools`.
- [ ] iPhone + iPad : installation propre, mise à jour, kill/relaunch, hors ligne, reprise, rotations et partage.
- [ ] Achat Apple Sandbox, transaction vérifiée avant finish, restauration, révocation/remboursement et entitlement Web/Android.
- [ ] Captures finales, compte de revue et TestFlight uniquement après autorisation.

## Critère de verdict

Le GO R10 local couvre seulement les validations reproductibles dans le dépôt et les builds locaux. R9 commercial reste NO-GO jusqu’aux trois achats réels Test/Sandbox et à leur convergence d’entitlement sur Web, Android et iOS.
