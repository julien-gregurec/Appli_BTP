# Checklist MANUELLE avant publication

Les exigences Store évoluent. Revalider cette checklist dans les documentations officielles Apple et Google immédiatement avant toute soumission.

## Apple — actions manuelles

- [ ] Disposer d’un Apple ID professionnel et adhérer à l’Apple Developer Program.
- [ ] Accepter les contrats en vigueur et renseigner les informations légales, fiscales et bancaires éventuellement requises.
- [ ] Vérifier/réserver l’App ID `fr.elsatia.tools`.
- [ ] Créer l’application ELSATIA Tools dans App Store Connect.
- [ ] Configurer l’équipe, le signing, les certificats et profils réels dans Xcode.
- [ ] Vérifier la privacy policy publique, les conditions et l’URL support.
- [ ] Compléter App Privacy en fonction des données réellement collectées à cette date.
- [ ] Revalider `PrivacyInfo.xcprivacy` et toutes les permissions/plugins.
- [ ] Préparer description, mots-clés, catégorie, classification d’âge, copyright et captures iPhone/iPad.
- [ ] Valider icône et launch screen sur les appareils supportés.
- [ ] Tester offline, restauration des préférences, navigation, clavier, rotations et liens externes sur appareils réels.
- [ ] Activer Universal Links seulement après publication du fichier AASA signé/logiquement exact.
- [ ] Produire une archive avec un numéro de build inédit.
- [ ] Distribuer via TestFlight et traiter les retours.
- [ ] Effectuer la validation finale puis soumettre manuellement.

## Google — actions manuelles

- [ ] Créer/vérifier le compte Google Play Console et payer les frais applicables.
- [ ] Terminer la vérification développeur et les informations légales requises.
- [ ] Créer l’application ELSATIA Tools avec l’applicationId `fr.elsatia.tools`.
- [ ] Créer et sécuriser la clé de signature ; conserver les secrets hors Git.
- [ ] Choisir/configurer Play App Signing et sauvegarder les certificats.
- [ ] Vérifier la privacy policy publique, les conditions et l’URL support.
- [ ] Compléter Data Safety selon les données et SDK réellement présents.
- [ ] Préparer fiche Store, catégorie, classification, icône, feature graphic et captures téléphone/tablette.
- [ ] Revalider target SDK et exigences Play en vigueur.
- [ ] Tester offline, stockage, bouton retour, clavier, rotations et liens externes sur appareils réels.
- [ ] Activer App Links seulement après publication d’`assetlinks.json` avec l’empreinte réelle.
- [ ] Incrémenter `versionCode`, produire et signer l’AAB.
- [ ] Respecter les tests internes/fermés éventuellement imposés au compte.
- [ ] Traiter le rapport pré-lancement, effectuer la validation finale puis publier manuellement.

## Avant une future monétisation

- [ ] Revalider les règles Apple IAP et Google Play Billing en vigueur.
- [ ] Concevoir produits, prix, essais et politique de remboursement sans les coder dans les composants.
- [ ] Mettre en place vérification des transactions, expiration, révocation et restauration.
- [ ] Définir la liaison facultative au compte ELSATIA et la fusion sûre des droits multi-source.
- [ ] Ajouter « Restaurer mes achats » sur iOS avant toute vente concernée.
