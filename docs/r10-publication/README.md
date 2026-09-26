# ELSATIA Tools — dossier de publication R10

Ce dossier prépare les trois distributions sans effectuer de déploiement ni écrire dans Stripe, App Store Connect, Google Play Console, Supabase distant ou Vercel. Les textes restent à relire juridiquement et commercialement avant saisie dans les consoles.

## Identité technique

| Élément | Valeur |
|---|---|
| Nom public | ELSATIA Tools |
| Bundle/package | `fr.elsatia.tools` |
| Version initiale | `1.0.0` |
| Build initial | iOS `1` / Android `1` |
| URL Web | `https://tools.elsatia.fr` |
| Confidentialité | `https://elsatia.fr/confidentialite` |
| CGU | `https://elsatia.fr/cgu` |
| Assistance | `https://elsatia.fr/contact` |
| Suppression compte | `https://tools.elsatia.fr/suppression-compte` |
| Catégorie recommandée | Utilitaires (principale), Productivité (secondaire Apple) |

Android cible API 36, conforme à l’exigence Google Play applicable aux nouvelles soumissions à compter du 31 août 2026. iOS cible iPhone et iPad. Les seules capacités natives déclarées sont Internet, partage de fichiers explicitement exportés et ouverture du format `.elsatiatools`; aucune permission sensible n’est demandée.

## Catalogue Free / Pro

| Offre | SKU canonique | Stripe | Apple | Google Play |
|---|---|---|---|---|
| Free | aucune fiche achetable | aucune | aucune | aucune |
| Pro mensuel | `tools_pro_monthly` | variable `STRIPE_TOOLS_PRICE_MONTHLY` | `fr.elsatia.tools.pro.monthly` | `tools_pro_monthly` |
| Pro annuel | `tools_pro_annual` | variable `STRIPE_TOOLS_PRICE_ANNUAL` | `fr.elsatia.tools.pro.annual` | `tools_pro_annual` |

Les identifiants sont proposés mais non créés. Aucun prix n’est fixé dans le code. La fiche Store doit reprendre le prix localisé du fournisseur, les conditions de renouvellement, la restauration et la gestion d’abonnement.

## Visuels à produire

Captures recommandées, dans cet ordre : accueil/catalogue Free, calcul réel, résultat + plan, mode chantier, projet Pro et synchronisation multi-appareil, exports PDF/SVG. Ne jamais montrer de résultat fictif, de faux achat ou de donnée réelle.

- App Store iPhone : 1 à 10 captures. Préparer la série principale 6,9 pouces en `1320 × 2868` portrait (ou une autre dimension 6,9 pouces acceptée par Apple : `1260 × 2736` ou `1290 × 2796`).
- App Store iPad : l’app cible iPad ; préparer la taille exacte demandée par App Store Connect pour le grand écran au moment de la soumission. Vérifier la table Apple courante avant export.
- Google Play : icône `512 × 512` PNG, visuel principal `1024 × 500`, au moins deux captures téléphone sans transparence ; préparer également une série tablette si la distribution tablette est conservée.
- Web/PWA : icônes PNG `192 × 192` et `512 × 512`, icône maskable `512 × 512`, Open Graph `1200 × 630` à produire avant déploiement.

Sources officielles à recontrôler lors de la soumission : [captures Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [règles de revue Apple](https://developer.apple.com/app-store/review/guidelines/), [API cible Google Play](https://developer.android.com/google/play/requirements/target-sdk), [sécurité des données Google Play](https://support.google.com/googleplay/android-developer/answer/10787469), [suppression de compte Google Play](https://support.google.com/googleplay/android-developer/answer/13327111).

## Éléments restant externes

- accès développeur, contrats, fiscalité, banque et identité légale Apple/Google/Stripe ;
- politique de confidentialité et CGU finales, responsable de traitement, délais de conservation et procédure support ;
- URL de suppression effectivement publiée avant saisie dans Play Console ;
- produits, offres de base, prix, localisations et captures de revue ;
- déclarations App Privacy et Data Safety fondées sur le comportement final et les SDK réellement embarqués ;
- comptes de revue et de test temporaires, jamais enregistrés dans Git.
