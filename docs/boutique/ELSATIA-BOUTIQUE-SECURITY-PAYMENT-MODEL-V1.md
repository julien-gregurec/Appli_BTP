# ELSATIA — Boutique : modèle de paiement, de facturation et de sécurité (V1)

| | |
|---|---|
| Nature | Conception documentaire. **Aucun appel Stripe n'a été effectué**, ni Test ni Live. Aucun produit, Price, coupon ou webhook n'a été créé ou modifié. |
| Base | `1fc1331` |
| Amont | `ELSATIA-BOUTIQUE-ARCHITECTURE-AUDIT-REPORT.md` |

---

# Partie A — Paiement et facturation

## A.1 Comparaison des modes de paiement

| Mode | Objet Stripe | Existe aujourd'hui | Ce qu'il impose |
|---|---|---|---|
| **Ponctuel** | Checkout `mode: payment` | **oui**, Boutique | Rien de récurrent. Mode le plus simple, déjà en place. |
| **Abonnement** | Checkout `mode: subscription` + Price | **oui**, côté abonnement GP | Renouvellement, résiliation, proratisation, facture par période. |
| **Mixte** (physique + abonnement dans un même panier) | — | **non** | Stripe ne mélange pas proprement un bien livrable et un abonnement dans une seule session sans effets de bord sur la période. |
| **Physique + abonnement logiciel** | deux flux | **non** | Cf. A.2. |
| **Acompte** | paiement partiel puis solde | **non** | Deux paiements, une seule vente, une seule facture ou deux ? Décision comptable, pas technique. |
| **Paiement total** | Checkout `payment` | **oui** | Défaut recommandé pour la V1. |
| **Remboursement partiel** | `refund` partiel | **non** | Doit être borné par le montant déjà encaissé, cf. A.4. |
| **Avoir** | hors Stripe | **non** | Document comptable, indépendant du remboursement effectif. |
| **Coupon** | `coupon` / `promotion_code` | **non** (bloqué par `price_data` inline) | Cf. §1.10 du modèle de catalogue. |
| **Remise commerciale** | côté ELSATIA | **non** | Doit rester une décision ELSATIA tracée, pas un objet Stripe. |
| **Gratuité exceptionnelle** | montant nul | **non** | Une commande à 0 € ne doit **pas** court-circuiter le parcours : elle produit facture, suivi et garantie comme les autres. |

## A.2 Le cas décisif : carte physique + abonnement logiciel

Trois options avaient été posées. **D-Q9 tranche : option C.**

| Option | Fonctionnement | Risque |
|---|---|---|
| **A — Deux paiements séparés** | La carte s'achète (ponctuel). L'abonnement se souscrit à part, s'il est voulu. | Deux parcours à traverser. |
| **B — Un seul panier mixte** | Une session Stripe contenant bien + abonnement. | Fragile : la date de début de période dépend du paiement, la livraison du bien n'y est pas liée, un remboursement du bien ne doit pas résilier l'abonnement — et inversement. |
| **C — Achat du bien, puis proposition d'abonnement à l'activation** | La carte s'achète seule. L'abonnement est proposé au moment de l'activation, quand l'utilité est démontrée. | Aucun. |

**DÉCIDÉ : option C (D-Q9).** La carte achetée fonctionne sans abonnement — socle permanent. Les
options A (deux paiements imposés) et B (panier mixte) sont écartées. Vendre le bien et le service
dans une même transaction brouillerait exactement la frontière qu'il faut tenir nette pour les
CGV : un bien est livré et peut être retourné, un service est fourni et se résilie.

**Contrainte de code qui en découle :** aucun mécanisme de facturation ne doit pouvoir désactiver
le socle d'une carte achetée. Un impayé d'abonnement avancé ne touche pas la résolution de l'URL
publique. Ce doit être une propriété du code, pas une consigne d'exploitation.

## A.3 Facturation — indépendance des documents

Trois documents distincts, jamais confondus :

| Document | Émis quand | Modifiable |
|---|---|---|
| **Facture de vente** | au paiement | **jamais** |
| **Avoir** | à la décision de remboursement ou de geste commercial | jamais |
| **Remboursement** | mouvement d'argent réel (Stripe) | — |

Un avoir **peut** exister sans remboursement (geste commercial reporté). Un remboursement
**ne doit jamais** exister sans avoir : sinon l'argent sort sans pièce comptable.

## A.4 Les huit protections exigées

| # | Risque | État aujourd'hui | Protection à retenir |
|---|---|---|---|
| 1 | **Paiement en double** | **partiellement couvert** — clé d'idempotence `boutique-checkout-<commandeId>` sur la création de session | Conserver. Y ajouter : une commande déjà `payee` refuse toute nouvelle session. |
| 2 | **Commande sans paiement** | **couvert** — `payee` n'est atteint que par la RPC appelée depuis le webhook signé, non exécutable par `anon` | Conserver. Interdire toute transition `→ payee` depuis une action d'interface. |
| 3 | **Webhook rejoué** | **couvert deux fois** — `stripe_webhook_events` a `event.id` en clé primaire (`23505` ⇒ `duplicate: true`), et la RPC teste `v_deja_payee` avant d'écrire | Conserver tel quel. C'est le point le plus solide de l'existant. |
| 4 | **Remboursement répété** | **non couvert** (aucun remboursement) | Idempotence par référence de remboursement + **plafond cumulé** : la somme des remboursements ne peut jamais dépasser le montant encaissé. Contrôle en base, pas seulement applicatif. |
| 5 | **Montant modifié côté navigateur** | **couvert** — le serveur ne reçoit que `{produitId, quantite}` et relit prix, TVA, stock et `actif` en base | Conserver **et étendre** : frais de port, remises et TVA doivent suivre la même règle. Rien de monétaire ne vient du client. |
| 6 | **Confusion Test / Live** | **NON COUVERT** — `livemode` est journalisé puis **jamais vérifié** | Rejeter tout événement dont `livemode` ne correspond pas à l'environnement. Cf. §A.5. |
| 7 | **Mauvais taux de TVA** | **non couvert** — un taux par produit, défaut 0,20, sans pays | Résolution du taux au moment du devis (catégorie fiscale × pays × qualité de l'acheteur), puis **figement dans la commande**. |
| 8 | **Double facturation d'un abonnement** | hors périmètre Boutique | Découle de la recommandation C (§A.2) : la Boutique ne crée jamais d'abonnement. |

## A.5 Le défaut n° 6 en détail

`src/app/api/stripe/boutique/webhook/route.ts` enregistre :

```ts
await admin.from("stripe_webhook_events").insert({
  id: evenement.id, event_type: evenement.type,
  livemode: evenement.livemode, facture_id: null,
});
```

`livemode` est **stocké**, puis l'événement est traité sans que cette valeur soit jamais comparée
à l'environnement courant. Un événement Test reçu par un déploiement Live — ou l'inverse —
marque une commande `payee`, décrémente le stock et écrit une dépense en trésorerie.

Ce n'est pas un risque théorique : le dépôt comporte des lots Stripe Test actifs et des endpoints
de préversion. La correction est petite (comparer `livemode` à l'environnement, refuser sinon) et
elle est consignée en **lot P0** — non appliquée ici, cette conversation étant documentaire.

---

# Partie B — Sécurité

## B.1 Ce qui est déjà tenu, et qu'il ne faut pas défaire

| Exigence | État | Preuve |
|---|---|---|
| **Contrôle des prix côté serveur** | tenu | `passerCommandeAction` relit tout en base ; commentaire explicite dans le code. |
| **Vérification des webhooks** | tenu | `verifierSignatureStripe` + secret dédié `STRIPE_WEBHOOK_BOUTIQUE_SECRET`. |
| **Idempotence** | tenu | Clé Stripe côté session, `event.id` unique côté journal, `v_deja_payee` côté RPC. |
| **Isolation multi-tenant** | tenu **pour le modèle actuel** | RLS sur `est_membre_actif` / `a_permission` ; accès `anon` explicitement révoqué (migration 146). |
| **Modification du panier** | tenu | Le panier client ne transmet que des identifiants et des quantités. |

## B.2 Ce qui n'est pas tenu

| Exigence | État | À concevoir |
|---|---|---|
| **Journal append-only** | absent | Journal des commandes, prix, remises, remboursements : aucune mise à jour, aucune suppression. Aujourd'hui `modifierProduitBoutiqueAction` écrase sans trace. |
| **Permissions** | partiel | 2 permissions (`acces_boutique`, `gerer_boutique`), héritées des droits d'achat. Il en faut pour préparer, expédier, rembourser, émettre un avoir. |
| **Données personnelles** | partiel | Adresses en texte libre ; aucun client Boutique distinct ; aucune durée de conservation définie. |
| **Images personnalisées** | absent | Cf. §B.3 — le risque le plus sous-estimé du lot. |
| **Antivirus** | absent | À brancher si disponible sur l'infrastructure ; **sinon l'écrire comme non couvert**, pas le supposer. |
| **Limitation de taille / formats** | absent | Aujourd'hui `image_url` est un texte libre rendu en `<img src>`, sans aucun contrôle. |
| **Expiration / suppression** | absent | Aucune durée de vie sur les médias ni sur les paniers. |
| **Export RGPD** | partiel | `parametres/donnees` existe côté Gestion Pro ; un client Boutique non abonné n'y a pas accès. |
| **Prévention de la fraude** | absent | Cf. §B.4. |
| **Isolation multi-tenant, modèle cible** | à refaire | Toute la RLS repose sur `entreprise_id not null`. Un client Boutique particulier n'entre pas dans ce modèle : les politiques sont à réécrire, pas à étendre. |

## B.3 Les fichiers fournis par le client — le vrai point dur

Un client qui fait imprimer son logo **téléverse un fichier**. C'est la seule surface de la
Boutique où un tiers dépose un contenu arbitraire. Elle n'existe pas aujourd'hui, donc rien ne la
protège.

Règles de conception :

1. **liste blanche de formats**, refus par défaut — jamais une liste noire ;
2. **le type réel est vérifié par le contenu**, pas par l'extension ni par l'en-tête déclaré ;
3. **plafond de taille appliqué côté serveur**, jamais seulement côté navigateur ;
4. **plafond de dimensions** en pixels, pour éviter l'épuisement mémoire au traitement ;
5. **jamais servi depuis l'origine de l'application** : un fichier client est servi depuis un
   emplacement dédié, avec un type de contenu forcé et le téléchargement imposé ;
6. **bucket séparé** de celui des médias catalogue : ce sont des données client, pas du contenu
   ELSATIA. Elles ont une durée de conservation, un export et un effacement propres ;
7. **conservation bornée et écrite** : le fichier sert à fabriquer, l'aperçu validé sert de
   preuve. Le second se conserve avec la commande ; le premier n'a pas à vivre indéfiniment ;
8. **antivirus si disponible** — et si l'infrastructure n'en offre pas, cela doit être **écrit
   comme un risque accepté**, avec la décision et son auteur. Supposer une protection qu'on n'a
   pas est pire que ne pas en avoir.

## B.4 Prévention de la fraude — proportionnée

La V1 n'a pas besoin d'un dispositif élaboré. Elle a besoin de quatre garde-fous simples :

| Garde-fou | Motif |
|---|---|
| Limitation du nombre de commandes et de tentatives de paiement par compte et par période | Évite le test de cartes volées via la Boutique. |
| Limitation des tentatives de **code d'activation**, avec verrouillage temporaire | Le code d'activation est la cible naturelle : cf. `…-NFC-CARD-COMMERCE-V1.md` §4. |
| Contrôle humain obligatoire (`a_verifier`) avant toute fabrication irréversible | Un visuel personnalisé fabriqué à tort est une perte sèche. |
| Alerte sur toute survente détectée | Aujourd'hui la survente est **absorbée en silence** par `greatest(0, …)`. |

## B.5 RGPD — ce que la Boutique ajoute

La Boutique introduit trois catégories de données que Gestion Pro n'a pas :

1. **des adresses de livraison de personnes physiques** — y compris de salariés d'un client, dans
   le cas d'un lot d'équipe expédié nominativement ;
2. **des fichiers fournis par le client** (logos, visuels), potentiellement porteurs de droits de
   tiers ;
3. **un historique d'achat**, qui est une donnée de comportement.

Quatre conséquences :

- **la durée de conservation n'est pas uniforme** : une facture se conserve au titre des
  obligations comptables, un fichier de personnalisation n'a aucune raison de vivre aussi
  longtemps. Les deux ne peuvent pas partager la même règle ;
- **l'effacement ne peut pas être total** : une facture émise ne s'efface pas sur demande. Il faut
  savoir répondre « voici ce qui est effacé, voici ce qui est conservé et pourquoi » — sans quoi
  la réponse au client sera soit fausse, soit refusée ;
- **l'export doit être accessible à un client non abonné** : l'écran existant est réservé aux
  entreprises Gestion Pro ;
- **le sous-traitant de fabrication** reçoit des données (noms, éventuellement adresses, visuels).
  Cela suppose un cadre contractuel — porté en checklist juridique, cf. `…-LEGAL-COMPLIANCE-CHECKLIST-V1.md`.

## B.6 Lot P0 — quatre conditions bloquantes avant toute ouverture (D-P0)

Consignées, **non appliquées** ici. **Tant qu'elles ne sont pas toutes fermées, la Boutique reste
masquée et son catalogue vide.**

| # | Condition | Où | Effort |
|---|---|---|---:|
| **P0-1** | Rendre `boutiqueEstActive()` **fail-closed** et documenter `FEATURE_BOUTIQUE_ENABLED` dans `.env.example` | `src/lib/preview-features.ts` | ~0,5 j |
| **P0-2** | **Refuser** tout événement dont `livemode` ne correspond pas à l'environnement | `…/stripe/boutique/webhook/route.ts` | ~0,5 j |
| **P0-3** | **Aucune commande payable sans facture de vente ELSATIA** | lot Factures | cf. ci-dessous |
| **P0-4** | Boutique masquée et catalogue vide tant que P0-1 à P0-3 ne sont pas fermées | — | **tenu aujourd'hui** |

**P0-1 et P0-2** ne dépendent d'aucun arbitrage commercial et restent immédiatement réalisables
(~1 jour à eux deux).

**P0-3 change le séquencement du projet.** La facturation était le lot 8, en aval des commandes
et de la logistique ; en faire une condition d'ouverture supprime tout palier intermédiaire où la
Boutique serait ouverte mais pas encore facturante. C'est aussi le seul des quatre points qui
dépende d'une validation extérieure à ELSATIA — les mentions obligatoires, la numérotation et la
durée de conservation relèvent du juriste.
