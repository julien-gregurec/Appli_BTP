# ELSATIA — TRAIN V3 · COHABITATION DES GÉNÉRATIONS TARIFAIRES

**Complément au lot :** `ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-V1`
**Date :** 2026-09-08
**Environnement :** Stripe **Test** uniquement. Aucun appel Live, aucun déploiement.

---

## 1. Verdict

Les quatre interdits demandés sont désormais tenus par des tests, et l'un d'eux
par un **garde-fou d'exécution** et non seulement par une assertion : un Price de
génération fermée présenté à un nouveau checkout fait échouer la session avant
tout appel réseau.

La vérification stricte est active en CI, dans un pas dédié, **sans
`continue-on-error` ni condition d'échappement**.

Les cinq coupons Stripe Test sont audités et classés. **Aucun n'a été modifié,
désactivé ni supprimé.**

La ligne 1 corrompue de `.env.local` est réparée localement. Elle n'était **pas**
redondante : elle portait un second secret de webhook, différent de celui actif.
Rien n'a été perdu ni écrasé — détail au § 5.

**Aucune branche `Train V3` n'existe dans le dépôt.** Le travail est livré sur
`feat/stripe-test-canonical-prices-p0-v1`, prêt à être repris par le train.

---

## 2. La séparation, telle qu'elle est maintenant tenue

| Notion | Définition tenue par le code | Source |
|---|---|---|
| **Price connu** | Peut encore appartenir à un contrat historique. Le classifieur ne le déclare pas `inconnu`, donc l'abonnement reste réconciliable. | `allowlistPrixBase()` ∪ `STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES` |
| **Price vendable** | Peut être proposé à un nouveau client. | `prixStripePour()`, filtré par `verifierPrixVendable()` |

Les deux ensembles se recouvrent partiellement et **ne coïncident pas** : c'est
le point. Les confondre casse soit les contrats en cours (si l'on n'admet que la
génération courante), soit le catalogue (si l'on rend vendable tout ce qui est
connu).

Un ajout par rapport au lot précédent : `verifierPrixVendable()` est appelé dans
`creerSessionAbonnementStripe()`. Une variable de vente repointée par erreur sur
un ancien Price ne facture plus un tarif retiré — elle lève
`PrixGenerationHistoriqueNonVendable`. Échouer vaut mieux que facturer faux.

---

## 3. Les quatre interdits, et leurs tests

`src/lib/stripe-generations-cohabitation.test.ts` — **12 tests**.

### Interdit n°1 — un ancien abonnement ne devient jamais `classification_non_fiable`

- un abonnement portant un forfait `TARIFS-V2` **et** un item de capacité V4
  reste `fiable`, sans anomalie, `inconnus` vide ;
- l'annuel d'une génération intermédiaire (`CANONICAL-V3`) est reconnu ;
- **test de contre-épreuve** : en vidant `STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES`,
  la régression réapparaît (`inconnus` = 1). Sans lui, les trois tests ci-dessus
  passeraient même si la protection était retirée ;
- un Price réellement étranger reste `inconnu` : l'allowlist ne devient pas une
  passoire.

### Interdit n°2 — un Price historique n'est jamais proposé à un nouveau checkout

- `verifierPrixVendable()` rejette V2 et V3, laisse passer V4 ;
- **le checkout lui-même échoue** quand une variable courante pointe un ancien
  Price, et avant tout appel réseau ;
- connaître un ancien Price ne le rend pas vendable : il est dans
  `allowlistPrixBase` et absent de ce que rend `prixStripePour`.

### Interdit n°3 — un nouveau client ne reçoit jamais un ancien tarif

- pour chaque offre × périodicité, le Price rendu n'est jamais historique et
  passe le garde ;
- cas contradictoire : un Price à la fois déclaré historique **et** désigné par
  une variable courante est **refusé**. Le garde tranche en faveur du refus, il
  ne cherche pas à deviner.

### Interdit n°4 — un client existant n'est jamais migré automatiquement

- le réconciliateur ne mute que `classification.capacite` ; l'item de forfait
  n'est ni un item de capacité, ni un item « autre » : rien ne peut le swapper ;
- reconnaître un ancien forfait n'aligne pas son prix sur la génération
  courante — le Price observé reste celui du contrat.

**Total : 849 tests (94 fichiers), contre 837 avant ce complément.** `tsc` propre.

---

## 4. CI — vérification stricte activée

`.github/workflows/ci.yml` :

- `STRIPE_PRICES_VERIFY_STRICT: "1"` au niveau du job ;
- `STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}` ;
- pas dédié **Tarifs Stripe Test alignés sur le contrat canonique (strict)**,
  placé avant `npm run verify`, **sans `continue-on-error`, sans `if:`**.

Trois modes d'échec vérifiés localement :

| Situation | Attendu | Mesuré |
|---|---|---|
| Strict, aucun accès Stripe | échec | `exit 1` — « Mode strict → échec » |
| Clé Live fournie | échec immédiat, aucun appel réseau | `exit 1` — « Ce contrôle ne s'exécute que contre Stripe Test » |
| Non strict, aucun accès | skip toléré | `exit 0` |
| Strict, carte versionnée + clé Test | succès | `exit 0` — 27/27 |

**Ce qui rendait le mode strict intenable** : il exigeait 27 variables
`STRIPE_PRICE_*` dans l'environnement, soit 27 secrets GitHub. Or **un `price_id`
n'est pas un secret** : il n'ouvre aucune action sans la clé. Ils sont donc
versionnés dans **`config/stripe-prices.test.json`**, que le garde-fou consulte
en second recours après l'environnement. La CI n'a plus besoin que d'**un seul
secret**, la mapping devient relisible et diffable en revue, et une clé Live fait
échouer le contrôle avant qu'il ne lise cette carte.

> **⚠ Action requise de ta part.** Tant que le secret `STRIPE_TEST_SECRET_KEY`
> n'est pas créé dans les *Settings → Secrets and variables → Actions* du dépôt,
> **la CI sera rouge**. C'est le comportement demandé — « ne jamais contourner ce
> contrôle » — mais il faut le savoir avant d'ouvrir une PR. Y mettre une clé
> Stripe **Test** en lecture ; le script refuse une clé Live.

---

## 5. `.env.local` — ligne 1

Traitée localement, après sauvegarde, sans qu'aucune valeur soit affichée ni
recopiée ici.

**Ce qu'elle contenait réellement** : trois affectations concaténées sans retour
à la ligne, le nom de la première (`STRIPE_SECRET_KEY`) ayant disparu. Un parseur
`.env` n'en tirait rien d'exploitable ; les valeurs actives venaient déjà des
lignes autonomes situées plus bas.

**Ce qui a empêché une simple suppression** : la comparaison par empreinte, nom
par nom, a montré que la ligne n'était **pas** redondante.
`STRIPE_WEBHOOK_ABONNEMENT_SECRET` y figurait avec une valeur **différente** de
celle définie plus bas. Supprimer la ligne aurait détruit un secret sans que
personne ne sache lequel des deux est le bon.

**Geste retenu** : la ligne est restructurée en trois affectations correctement
nommées et **commentées**, valeurs conservées à l'octet près. Le comportement à
l'exécution est strictement inchangé — les valeurs actives restent celles des
lignes autonomes, comme c'était déjà le cas.

Contrôles, par noms et empreintes seulement :

| Contrôle | Résultat |
|---|---|
| Sauvegarde préalable | ✅ hors dépôt, mode `600` |
| Variables actives avant / après | **41 / 41** |
| Noms identiques | ✅ |
| Valeurs identiques (empreintes SHA-256) | ✅ **aucune différence** |
| Plus aucune ligne sans nom de variable | ✅ |
| `.env.local` suivi par Git | **non** — ignoré par `.gitignore:40`, absent de l'index |
| L'application relit le fichier | ✅ `verify:stripe-prices --strict` → 27/27 |

> **⚠ À arbitrer.** Les deux `STRIPE_WEBHOOK_ABONNEMENT_SECRET` diffèrent, donc
> l'un des deux est périmé. À vérifier dans Stripe Test → *Développeurs →
> Webhooks* avant de supprimer la ligne commentée. Je ne l'ai pas tranché : ce
> n'est pas déductible du dépôt.

---

## 6. Coupons Stripe Test — audit et classement

Lecture seule, `livemode=false` revérifié. **Aucun coupon modifié, désactivé ou
supprimé. Aucun coupon Live touché.**

**Le fait dominant : les cinq coupons sont à `times_redeemed = 0`.** Aucun n'est
rattaché à un abonnement, aucun client ne porte de remise, aucun code promo actif
n'y renvoie. **Aucun ne relève donc de la catégorie « historique encore
utilisé ».**

| Coupon | Remise | Durée | Utilisations | Classement | Motif |
|---|---|---|---:|---|---|
| `qGgY0GwF` — *Recette Pro -50 € pendant 3 mois* | 50 € fixe | 3 mois | 0 | **inutilisé** · *compatible V4* | Montant fixe, `applies_to` = tous produits : rien ne le lie à une génération. Mécaniquement valide sur un Price V4. |
| `Ysdg39ge` — *Recette Mini -10 % permanent* | 10 % | forever | 0 | **inutilisé** · *compatible V4* | Un pourcentage est indifférent à la grille. `forever` sur un outil de recette est cependant à revoir. |
| `elsatia_tarifs_v2_test_limitee_3mois` | 5 % | 3 mois | 0 | **inutilisé** · **à désactiver après validation** | `metadata.grille = TARIFS-V2` : rattaché nommément à une génération fermée. |
| `elsatia_tarifs_v2_test_fixe_10eur` | 10 € fixe | once | 0 | **inutilisé** · **à désactiver après validation** | Idem. |
| `elsatia_tarifs_v2_test_10pct` | 10 % | once | 0 | **inutilisé** · **à désactiver après validation** | Idem. |

**Aucun coupon n'est classé « incompatible V4 » au sens mécanique.** Aucun n'est
restreint à un produit ou à un Price : tous s'appliqueraient sans erreur à un
Price V4. L'incompatibilité des trois `tarifs_v2` est **déclarative** — leur nom
et leur métadonnée annoncent une génération fermée — et c'est suffisant pour les
retirer : un coupon nommé d'après une grille abandonnée qui remise un tarif V4
produit des remises et des factures illisibles.

**Recommandation, à valider par toi avant tout geste** : désactiver les trois
`elsatia_tarifs_v2_*`. Ils n'ont jamais servi, donc aucun contrat n'en dépend.
Les deux coupons de recette peuvent rester, en corrigeant `forever` sur
`Ysdg39ge`. **Rien n'a été fait.**

**Codes promotionnels** : `PROMOV1PRO50` et `PROMOV1MINI10`, tous deux
**inactifs**, `times_redeemed = 0`, dont un expiré. Inertes en l'état. Le
rattachement au coupon sous-jacent n'était pas résolvable depuis l'endpoint de
liste de la version d'API en vigueur : à confirmer avant toute réactivation.

---

## 7. Fichiers

| Fichier | Nature |
|---|---|
| `.github/workflows/ci.yml` | mode strict + secret Test + pas dédié bloquant |
| `config/stripe-prices.test.json` | **nouveau** — carte versionnée des 27 Price Test + 10 Price de générations fermées. Aucun montant, aucun secret, aucun identifiant Live |
| `scripts/verify-stripe-prices.mjs` | résolution par carte versionnée en second recours ; refus immédiat d'une clé Live |
| `src/lib/stripe-abonnement.ts` | `PrixGenerationHistoriqueNonVendable`, `verifierPrixVendable()`, garde appelé par le checkout, environnement injectable |
| `src/lib/stripe-generations-cohabitation.test.ts` | **nouveau** — 12 tests, les 4 interdits |
| `docs/audits/…-COHABITATION-REPORT.md` | ce rapport |

`.env.local` est modifié **localement uniquement** et reste hors de Git.

---

## 8. Stripe Live et Production : intacts

- Une seule clé utilisée, `sk_test_`. Aucune clé Live lue ni chargée.
- `balance.livemode = false` revérifié avant l'audit des coupons.
- **Aucune mutation Stripe dans ce complément** : ni Price, ni produit, ni
  coupon, ni code promo, ni abonnement. Tout est en lecture.
- Aucune migration SQL, aucun déploiement, aucune fusion.
- Le garde-fou refuse désormais explicitement de s'exécuter avec une clé Live.

---

## 9. Réserves

1. **La CI sera rouge tant que `STRIPE_TEST_SECRET_KEY` n'est pas créé.** C'est
   voulu, mais c'est un préalable à la prochaine PR.
2. **Le second `STRIPE_WEBHOOK_ABONNEMENT_SECRET` n'est pas arbitré** (§ 5).
3. **Les trois coupons `tarifs_v2` restent actifs** : ta validation est requise.
4. **Le rattachement des deux codes promo à leur coupon reste inconnu.**
5. **La Production n'est toujours pas traitée.** Le geste Live devra rejouer la
   déclaration des générations précédentes **avant** tout repointage, sans quoi
   les contrats Live deviendront inclassables. C'est le piège de ce lot.
6. `config/stripe-prices.test.json` devra être régénéré à chaque nouvelle
   génération tarifaire ; le garde-fou échoue si sa `generation` diverge du
   catalogue, ce qui rend l'oubli visible.

---

## 10. Traçabilité

| | |
|---|---|
| **Branche** | `feat/stripe-test-canonical-prices-p0-v1` |
| **Base du complément** | `a882250a1af57b5d77fc7b6b52b936c830e6e245` |
| **Base du lot initial** | `ab6f9bda7977bf4ea6984970000595cc9a36a99c` |
| **Train V3** | aucune branche existante dans le dépôt |

**Non fusionné. Non déployé.**
