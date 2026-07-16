# Paiements bancaires, salaires et remboursements

## Principe de sécurité

Liria Gestion Pro prépare les virements mais ne contourne jamais la banque. Le circuit est volontairement séparé en cinq étapes :

1. réception d’une facture fournisseur, d’une note de frais validée ou d’un bulletin de paie ;
2. présence d’un RIB actif et vérifié ;
3. création d’un lot de virements ;
4. validation du lot par une personne autorisée ;
5. authentification forte sur l’interface bancaire Powens avant exécution.

La réception d’un bulletin ne déclenche donc jamais seule un salaire. Elle crée une proposition contrôlable. Cette validation humaine protège l’entreprise contre un mauvais montant, un changement frauduleux d’IBAN, un doublon ou un bulletin remplacé.

## Flux couverts

- Factures fournisseurs : le reste exact à payer devient sélectionnable. Après confirmation bancaire définitive, un règlement fournisseur est créé et le statut de la facture se recalcule.
- Salaires : le PDF original est conservé dans le bucket privé `bulletins-paie`. Après contrôle du net à payer et du RIB, le salaire peut être ajouté à un lot.
- Notes de frais : seules les notes validées sont proposées. Après exécution bancaire, elles passent à `remboursee`.
- Lots mixtes : l’application peut regrouper plusieurs catégories, tout en conservant le lien avec chaque source comptable.

## Coffre IBAN

- chiffrement AES-256-GCM côté serveur avant insertion en base ;
- clé uniquement dans les variables secrètes Vercel ;
- IBAN complet jamais renvoyé à l’interface ;
- seuls les quatre derniers caractères sont affichés ;
- empreinte SHA-256 pour détecter les doublons ;
- remplacement d’un RIB par création d’une nouvelle version active ;
- validation obligatoire avant utilisation dans un lot ;
- journal append-only des changements et validations.

La variable `BANK_DATA_ENCRYPTION_KEY` doit être sauvegardée dans un coffre-fort de secrets. Sa perte rend les IBAN illisibles. Son changement exige une procédure de rotation et de rechiffrement.

## Intégration Powens Pay

Variables nécessaires :

```text
BANK_DATA_ENCRYPTION_KEY=
POWENS_API_BASE_URL=https://votre-domaine.biapi.pro/2.0
POWENS_WEBVIEW_BASE_URL=https://votre-domaine.biapi.pro/2.0/auth/webview/payment
POWENS_CLIENT_ID=
POWENS_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=https://votre-domaine.fr
SUPABASE_SERVICE_ROLE_KEY=
```

La plateforme obtient un jeton serveur `payments:admin`, crée le lot, obtient un jeton limité à `payments:validate`, puis redirige l’utilisateur vers la Webview bancaire. Le retour signé est contrôlé et le statut est relu directement auprès de Powens avant toute mise à jour comptable.

Powens doit activer le produit Pay et enregistrer cette URL de retour :

```text
https://votre-domaine.fr/api/paiements-bancaires/powens/callback
```

Documentation officielle utilisée :

- https://docs.powens.com/documentation/integration-guides/pay/initiating-a-bulk-payment-with-the-webview

L’architecture `src/lib/banking.ts` permet d’ajouter ensuite un adaptateur Qonto ou Swan sans modifier le modèle comptable.

## Réception serveur-à-serveur des bulletins

L’expert-comptable ou une automatisation autorisée peut déposer un bulletin par requête `multipart/form-data` :

```text
POST /api/paie/import
Authorization: Bearer <PAYROLL_IMPORT_SECRET>
```

Champs :

- `entreprise_reference`
- `employe_reference`
- `periode` au format `AAAA-MM`
- `montant_net_a_payer`
- `date_paiement_prevue`, facultatif
- `reference_expert_comptable`, facultatif
- `bulletin`, PDF de 20 Mo maximum

`PAYROLL_IMPORT_SECRET` doit contenir au moins 32 caractères, être échangé par un canal sécurisé et ne jamais être communiqué par e-mail. Pour une commercialisation multi-cabinets, remplacer ce secret plateforme par des identifiants distincts par cabinet ou par une connexion OAuth officielle.

## Permissions

- `acces_paiements_bancaires`
- `gerer_coordonnees_bancaires`
- `gerer_paie`
- `preparer_virements`
- `valider_virements`
- `executer_virements`

Un accès support plateforme est explicitement exclu du module, même lorsqu’un accès support temporaire à l’entreprise existe.

## Mise en service

1. Appliquer `20260716000089_paiements_bancaires_paie.sql`.
2. Générer `BANK_DATA_ENCRYPTION_KEY` avec `openssl rand -base64 32` et la sauvegarder dans le gestionnaire de secrets.
3. Souscrire un contrat Powens Pay et renseigner les quatre variables Powens dans Vercel.
4. Générer un secret d’import d’au moins 32 caractères si l’intégration expert-comptable est utilisée.
5. Redéployer l’application.
6. Tester uniquement dans l’environnement de test Powens avec des données bancaires de test.
7. Tester les rôles préparateur, valideur et exécutant.
8. Vérifier les retours `done`, `accepted`, `partial` et `rejected`.
9. Faire valider la procédure par la banque, l’expert-comptable et le responsable juridique avant la production.

## Limites à ne pas masquer

- Aucun virement réel ne fonctionne sans contrat et clés Powens valides.
- Le code ne prétend pas remplacer un logiciel de paie : le montant provient du bulletin validé de l’expert-comptable.
- Une réponse bancaire `accepted` reste « en cours » ; seul `done` marque automatiquement les sources comme payées.
- Les salaires ne sont jamais envoyés sans validation bancaire forte.
- La conformité finale dépend du contrat bancaire, de la délégation de pouvoirs et des procédures internes de l’entreprise.
