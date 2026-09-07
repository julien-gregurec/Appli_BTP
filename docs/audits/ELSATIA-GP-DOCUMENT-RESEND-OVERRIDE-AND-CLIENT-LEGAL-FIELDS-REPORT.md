# ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-AND-CLIENT-LEGAL-FIELDS-REPORT

---

## 1. Verdict global

| Partie | Verdict |
|---|---|
| **1 — Surcharge d'adresse au renvoi** | **VALIDÉ** — livré, testé, sans migration |
| **2 — Champs clients légaux** | **BLOQUÉE PAR LEDGER** — audit fait, décisions prises, SQL préparé hors du train canonique |

Le lot ne contient **aucune migration** et **ne modifie aucun fichier de
`supabase/migrations/`**. Le ledger reste à 266 fichiers, dernier numéro
`20260908000272`, exactement comme au commit de base.

### Pourquoi la partie 1 n'est pas bloquée

La journalisation exigée n'a besoin d'**aucune table nouvelle** :
`public.journal_activite` existe depuis `20260715000080`, porte un
`metadata jsonb` libre, est cloisonnée par `entreprise_id` (RLS
`est_membre_actif`) et est **en ajout seul** pour les utilisateurs (`grant
select, insert` ; `update` et `delete` révoqués). C'est précisément ce qu'exige
une piste d'audit. Ces deux propriétés sont vérifiées par assertion pgTAP, pas
supposées (§7).

### Pourquoi la partie 2 est bloquée

`ELSATIA-ECOSYSTEM-MIGRATION-LEDGER-RECONCILIATION-P0-V1` travaille sur le
ledger. Recherche effectuée avant toute décision : `git fetch origin`, puis
balayage des références locales et distantes et du système de fichiers —
**aucune branche, aucun commit et aucun rapport de réconciliation du ledger
n'existe à ce jour**. Le ledger n'est donc pas réconcilié.

Le dépôt a déjà payé le prix de l'attribution parallèle : deux lots ont
revendiqué `000266` en même temps, et l'insertion rétrograde a été refusée par
Supabase (`LegacyMigrationMissingRemoteError`, documenté dans
`ELSATIA_GP_POSTCUTOVER_MIGRATION_TRAIN_RECONCILIATION_V1`). Le numéro
**n'est donc pas attribué ici**, même si `273` paraît libre au moment de
l'écriture.

---

## 2. Branche et SHA

| | |
|---|---|
| Branche | `feat/gp-client-document-snapshot-p0-v1` (poursuite de la lignée Snapshot) |
| SHA de base | `dfb6f35c9b14acbda2f17e1de3fee9fdf62c181a` |
| SHA final poussé | `__SHA_FINAL__` |
| Fusionnée | **non** |
| Déployée | **non** |
| Migration créée | **aucune** |
| Ledger avant / après | **identique** — 266 fichiers, dernier `20260908000272` |

---

## 3. Partie 1 — Surcharge d'adresse au renvoi : **VALIDÉ**

### 3.1 Règle implémentée

| Règle demandée | Où elle est tenue |
|---|---|
| L'identité historique reste immuable | Aucune écriture sur `client_snapshot` — les gardes base du lot précédent restent seules maîtresses |
| Le PDF utilise toujours le snapshot | Le PDF est produit depuis `/imprimer/partage/[token]`, qui ne reçoit aucun paramètre d'adresse : la surcharge ne peut pas l'atteindre |
| L'adresse figée reste visible | Affichée dans la boîte d'envoi, y compris pendant la saisie d'une autre adresse |
| Envoi par défaut à l'adresse figée | `resoudreDestinataireEnvoi` sans surcharge → adresse du document |
| Surcharge explicite par un utilisateur autorisé | Champ replié par défaut, ouvert par un geste délibéré ; `peutSurchargerDestinataire()` |
| L'interface signale l'écart | `mentionEcartAdresse()`, encart ambre, dès que l'adresse saisie diverge |
| La surcharge ne modifie jamais le snapshot | Prouvé par test : les seules écritures sont `journal_activite` et la traçabilité d'envoi |
| La surcharge est journalisée | `construireEntreeJournalSurcharge()` → `public.journal_activite` |

### 3.2 Le point le plus important : l'adresse courante du client n'est pas une option

La consigne « ne jamais remplacer silencieusement l'adresse figée par l'adresse
actuelle du client » n'est pas traitée par une garde, mais par la **signature**
de la fonction de décision :

```ts
resoudreDestinataireEnvoi({ adresseFigee, surcharge, peutSurcharger })
```

L'adresse courante de `public.clients` n'est **pas un paramètre**. Elle n'est
pas lue, donc elle ne peut pas être choisie — ni par erreur, ni par une
évolution ultérieure distraite. La seule alternative possible à l'adresse figée
est une adresse **saisie par un humain autorisé**, qui en porte la
responsabilité et laisse une trace. Un test verrouille explicitement cette
propriété de conception.

### 3.3 Journalisation

Écrite dans `public.journal_activite`, action
`envoi_document_adresse_surchargee`.

| Exigence | Champ |
|---|---|
| Document | `ressource` + `ressource_id` + `metadata.document` (type, id, numéro) |
| Tenant | `entreprise_id` |
| Utilisateur | `utilisateur_id` |
| Ancienne adresse figée | `metadata.adresse_figee` |
| Adresse réellement utilisée | `metadata.adresse_utilisee` |
| Date | `created_at` (défaut `now()`) |
| Motif | `metadata.motif` (saisie libre facultative) |
| Type d'envoi | `metadata.type_envoi` — `envoi_initial` / `renvoi` |
| Résultat de l'envoi | `metadata.resultat` + `metadata.erreur` |

Trois décisions de conception :

1. **Le journal est écrit après la tentative, quelle qu'en soit l'issue.** Un
   envoi refusé par Brevo laisse la même trace qu'un envoi réussi. Ne journaliser
   que les succès rendrait la piste d'audit trompeuse : la tentative a bien eu
   lieu, et l'adresse a bien été divulguée au fournisseur d'envoi.
2. **Chaque tentative ajoute une entrée**, jamais ne met à jour la précédente.
   `journal_activite` est en ajout seul ; un historique, pas un état.
3. **L'écriture d'audit ne peut pas faire échouer l'envoi.** Elle est
   enveloppée : un journal indisponible ne transforme pas un envoi réussi en
   erreur affichée à l'utilisateur. Le compromis est assumé et testé.

Une ressaisie de l'adresse du document à l'identique (casse et espaces ignorés)
**n'est pas** une surcharge : ni avertissement, ni entrée de journal. Un journal
d'audit noyé sous des non-évènements ne se lit plus.

### 3.4 Permissions

| Geste | Exigence |
|---|---|
| Envoyer un devis / une facture | `gerer_devis` / `gerer_factures` — contrôle **préexistant**, inchangé |
| Choisir une autre adresse | **en plus**, `gerer_clients` |

`gerer_clients` est une clé **existante** (`20260710000001`). Une clé dédiée
(« surcharger_destinataire_document ») supposerait un `INSERT` dans
`public.permissions_disponibles`, donc une migration — impossible sous gel du
ledger. Le choix est défendable sur le fond (envoyer contre ce que le document
atteste est une décision sur la relation client, pas une simple expédition) et
**réversible** : c'est un point à trancher, inscrit en P1 (§9).

Le contrôle est appliqué **côté serveur** (`envoyerDevisEmailAction`,
`envoyerFactureEmailAction`). L'interface masque le champ à l'utilisateur non
autorisé, mais ce masquage n'est pas la sécurité : une requête forgée qui
enverrait `surchargeDestinataire` est refusée par l'action serveur, et le test 4
porte sur cette couche-là.

### 3.5 Impact snapshot et PDF : nul, et prouvé

| | |
|---|---|
| `devis.client_snapshot` / `factures.client_snapshot` | **jamais écrits** — vérifié par mock traçant : les seules tables écrites sont `devis`/`factures` (colonnes `email_envoye_le`, `email_envoye_a`) et `journal_activite` |
| `public.clients` | **jamais écrite** — assertion explicite |
| PDF joint | produit depuis `/imprimer/partage/[token]`, appelé sans paramètre d'adresse |
| Corps de l'e-mail | porte toujours `client.nom_affiche` issu du snapshot ; seule l'adresse d'acheminement change |
| `email_envoye_a` | enregistre l'adresse **réellement utilisée** — traçabilité d'envoi, pas identité du document |

---

## 4. Partie 2 — Champs clients légaux : **BLOQUÉE PAR LEDGER**

### 4.1 Audit : ce qui existe déjà, sous d'autres noms

Recherche menée sur l'ensemble du schéma avant toute proposition.

| Champ demandé | Existe ailleurs ? | Décision |
|---|---|---|
| `numero_tva` | **Oui** — `public.fournisseurs.numero_tva` (`20260718000111`) | **Ajouter** sur `clients`, en reprenant ce nom (entité différente, pas une duplication) |
| `forme_juridique` | **Oui** — `public.entreprises.forme_juridique` (`20260716000089`) | **Ajouter** sur `clients`, même nom |
| `nom_commercial` | **Oui, sous un autre nom** — `public.clients.societe` | **NE PAS AJOUTER** — voir §4.2 |
| `adresse_complement` | Non | **Ajouter** |
| `pays` | Non | **Ajouter** |

### 4.2 `nom_commercial` : duplication évitée, et un champ mort réactivé

`public.clients` porte **déjà deux** colonnes de dénomination :

| Colonne | État réel |
|---|---|
| `societe` | Peuplée, saisie au formulaire, sert de nom d'affichage (`nomClient()`) |
| `raison_sociale` | **Existe depuis `20260710000004` et n'est ni lue ni écrite nulle part** — vérifié : toutes les occurrences de `raison_sociale` dans `src/` portent sur `entreprises`, jamais sur `clients` |

Le contrat validé `@elsatia/client-contracts` distingue précisément ces deux
notions : `legalName` (dénomination légale) et `tradeName` (nom commercial /
enseigne). La correspondance retenue :

```
tradeName  ->  public.clients.societe          (existante, utilisée)
legalName  ->  public.clients.raison_sociale   (existante, inexploitée)
```

Ajouter `nom_commercial` créerait une **troisième** source pour le même nom.
Il n'y a donc rien à ajouter pour la dénomination : il y a à **activer**
`raison_sociale` dans le formulaire et l'affichage — travail applicatif, sans
migration, décrit en §9 (P1-2).

### 4.3 Ce qui est prêt

`docs/migrations-proposees/client-legal-fields-v1.sql.proposed`

Extension `.sql.proposed`, hors de `supabase/migrations/` : invisible pour
`supabase db reset` **et** pour `scripts/verify-migrations.mjs` (qui ne lit que
`supabase/migrations` et n'accepte que `*.sql`). Aucune application accidentelle
possible. Le **préfixe 14 chiffres est volontairement non attribué**.

Contenu : les 4 colonnes, leurs commentaires, deux contraintes de **forme**
(`not valid`, donc non rétroactives), et la démonstration qu'aucun changement
n'est requis côté snapshot, RLS ou multi-tenant.

### 4.4 Sur l'obligation du numéro de TVA — nuance demandée, nuance faite

Le rapport du lot précédent affirmait que le numéro de TVA intracommunautaire
est « obligatoire en B2B ». **C'est trop large, et c'est corrigé ici.**

En France, le numéro de TVA intracommunautaire doit figurer sur la facture
notamment pour les livraisons intracommunautaires (celui du vendeur **et** de
l'acquéreur), et il est requis dès lors que l'opération relève de la TVA
intracommunautaire ou de l'autoliquidation. En revanche :

- une facture à un **particulier** n'a pas à le porter ;
- un assujetti en **franchise en base** n'a pas de TVA à facturer et porte la
  mention correspondante ;
- une facture franco-française de faible montant relève de règles allégées.

Le champ est donc **facultatif par nature**, et sa présence dépend de la
situation de l'opération — pas d'un état binaire du client. C'est pourquoi la
proposition ne pose **aucune contrainte `not null`**, ni aucune règle
conditionnelle sur `clients.type` : la base vérifie la **forme**, jamais
l'obligation.

Ce paragraphe est une lecture de règles fiscales générales, pas un avis
fiscal ; les cas limites relèvent du comptable de l'entreprise.

### 4.5 Particulier / professionnel

`@elsatia/client-contracts` tranche déjà : `legal` vaut **`null`** pour un
particulier, et non un objet vide — « ce client n'a pas d'identité légale »
n'est pas « son SIRET n'est pas encore saisi ». Le formulaire devra masquer le
bloc légal pour `type = 'particulier'` plutôt que l'afficher vide.

Cette règle appartient au contrat et **ne doit pas être réimplémentée** dans
Gestion Pro : elle arrivera avec l'intégration du paquet.

### 4.6 Validation, normalisation, recherche : à ne PAS écrire ici

`@elsatia/client-contracts` expose déjà, validés et testés :
`normalizeVatNumber`, `isValidVatNumber`, `computeFrenchVatKey`,
`buildFrenchVatNumber`, `isValidSiren`, `isValidSiret`, `sirenFromSiret`,
`normalizeCountryCode`, `DEFAULT_COUNTRY_CODE`, ainsi que
`CLIENT_SEARCH_FIELDS` / `buildClientSearchPlan` pour la recherche.

Écrire une validation TVA dans Gestion Pro maintenant créerait exactement le
doublon que la consigne interdit. **Rien de tel n'a été écrit.** La validation
et la normalisation arrivent avec l'intégration du paquet, pas avant.

### 4.7 Backfill

**Aucun, et c'est le choix honnête.** Ces champs n'ont jamais été saisis ; il
n'existe aucune source pour les reconstituer. Les documents déjà émis conservent
— correctement — un snapshot où ils valent `null`. Écrire après coup un numéro de
TVA sur un document historique fabriquerait une mention qui n'a jamais figuré
sur le document remis au client.

---

## 5. Vérification demandée : « le snapshot sait déjà recevoir ces champs à null »

**Affirmation confirmée — par lecture du code ET par exécution.**

`public.construire_client_snapshot` (`20260908000272`) construit le snapshot
depuis `to_jsonb(client)` filtré par une liste blanche qui contient déjà les
cinq noms. Une colonne absente donne `v_client -> 'pays'` = SQL `NULL`, que
`jsonb_build_object` matérialise en clé présente valant `null`.

Sortie réelle, obtenue sur la pile de test (colonnes absentes) :

```json
{
  "societe": "ACME SARL",
  "siret": "11111111111111",
  "nom_affiche": "ACME SARL",
  "pays": null,
  "numero_tva": null,
  "nom_commercial": null,
  "forme_juridique": null,
  "adresse_complement": null,
  "…": "…"
}
```

La distinction compte : la clé est **présente et nulle**, pas absente. Le code
de lecture n'a donc jamais à distinguer « champ inconnu » de « champ vide ».

Trois assertions pgTAP permanentes le verrouillent (22-24), dont une qui
constate que les colonnes **n'existent pas encore** — elle échouera
délibérément le jour où la migration sera appliquée, forçant le lot suivant à
mettre le test à jour en conscience plutôt qu'à le laisser mentir.

---

## 6. Dépendance `@elsatia/client-contracts`

| | |
|---|---|
| Branche | `feat/client-contracts-canonical-v1` — `e7f837b` (poussée) |
| Base | `996be15`, ancêtre commun avec la lignée Snapshot |
| Intégrée à cette lignée ? | **Non** — `e7f837b` n'est pas un ancêtre de ce lot |
| Types concurrents créés ici ? | **Non** |
| Contrats copiés dans l'application ? | **Non** |

### Ce qui a été fait pour ne pas créer de concurrence

- **Aucun** type client, adresse, contact ou snapshot n'a été redéfini.
- **Aucune** validation TVA / SIREN / SIRET / pays n'a été écrite.
- Le seul garde-fou de format ajouté est un contrôle d'adresse e-mail
  volontairement minimal (`adresseRemisePlausible`), qui refuse ce qui ne peut
  manifestement pas être remis. Il est **explicitement marqué dans le code**
  comme point de substitution de `isPlausibleEmail` du paquet. C'est la seule
  dette de duplication du lot, et elle est de trois lignes.

### Point d'intégration préparé

Quand la lignée Contracts rejoindra Gestion Pro :

1. `packages/client-contracts/` arrive par fusion (le dépôt n'a pas de
   `workspaces` npm ; le précédent en place est l'alias TypeScript) ;
2. ajouter `"@elsatia/client-contracts": ["./packages/client-contracts/src/index.ts"]`
   aux `paths` de `tsconfig.json`, sur le modèle exact de
   `@elsatia/application-access` déjà présent ;
3. remplacer `adresseRemisePlausible` par `isPlausibleEmail` ;
4. brancher `normalizeVatNumber` / `isValidVatNumber` sur le formulaire client
   au moment où la migration des champs légaux est appliquée ;
5. aligner `nomClient()` sur `computeClientDisplayName` — le contrat relève que
   l'implémentation actuelle prend la société **quelle que soit la catégorie**,
   si bien qu'un particulier chez qui une société a été saisie par erreur
   s'affiche en professionnel.

L'ordre importe : **2 avant 3**, et **la migration ledger avant 4**.

---

## 7. Tests

### 7.1 Les dix scénarios exigés pour le renvoi

| # | Scénario | Preuve | Résultat |
|---|---|---|---|
| 1 | Renvoi à l'adresse figée | unitaire + intégration (aucune entrée de journal) | ✅ |
| 2 | Surcharge explicite | unitaire + intégration (Brevo reçoit la nouvelle adresse) | ✅ |
| 3 | Annulation | unitaire (champ vidé → retour à l'adresse du document) | ✅ |
| 4 | Utilisateur non autorisé | unitaire + intégration (refus serveur, aucun envoi, aucune écriture) | ✅ |
| 5 | Journalisation | intégration (contenu complet de l'entrée vérifié) | ✅ |
| 6 | PDF inchangé | intégration (`genererPdfDepuisUrl` appelé sur l'URL du snapshot, sans paramètre d'adresse) | ✅ |
| 7 | Snapshot inchangé | intégration (aucune écriture de `client_snapshot`) | ✅ |
| 8 | Adresse non écrite dans `public.clients` | intégration (table jamais touchée) | ✅ |
| 9 | Erreur d'envoi | intégration (échec journalisé avec sa cause) | ✅ |
| 10 | Nouvelle tentative | intégration (deuxième entrée distincte, `envoi_initial` puis `renvoi`) | ✅ |

### 7.2 Exécutions

| Commande | Résultat |
|---|---|
| `npx vitest run src/lib/document-resend-override.test.ts` | **19/19** |
| `npx vitest run src/lib/documents-envoi.test.ts` | **20/20** (11 préexistants + 9 ajoutés) |
| `supabase test db` (pile isolée, fresh install) | **57 fichiers, 1250 assertions — PASS** |
| dont `client_document_snapshot_v1.test.sql` | **26/26** (21 du lot précédent + 5 nouvelles) |
| `npm run verify:migrations` | 266 migrations valides — **inchangé** |
| `npm run typecheck` (GP + `apps/tools`) | **0 erreur** |
| `npm run lint` (GP + `apps/tools`) | code de sortie **0**, 0 erreur |
| `npx eslint` sur les 8 fichiers touchés | **0 problème** |
| `npx vitest run` (suite complète) | 103 fichiers, **1038/1040** — les 2 échecs sont un dépassement de délai préexistant, attribué par mesure ci-dessous |

#### Les deux tests en dépassement de délai — attribués, pas écartés

`src/lib/stripe-discount-legacy-surface.test.ts` et `src/lib/xlsx.test.ts`
sortent par `Test timed out in 5000ms`. Le premier parcourt récursivement tout
`src/` en lisant chaque fichier ; sur `/Volumes/ELSATIA-DEV` (volume externe),
ce parcours dépasse à lui seul le plafond de 5 s par test de Vitest.

L'attribution a été **mesurée**, en rejouant le même test sur le canon
`4266ba6` — qui ne contient aucune ligne de ce lot :

| Exécution | Résultat |
|---|---|
| Ce lot, test isolé | échec, `tests 13,15 s` |
| **Canon `4266ba6` (aucune modification), test isolé** | **même échec**, `tests 6,79 s` |

Le canon échoue donc de la même manière : **la cause est le volume, pas ce lot.**

Surtout, il s'agit d'un **dépassement de délai, jamais d'une assertion en
échec**. La règle que ce test protège — aucun appel applicatif aux RPC de remise
héritées — a été évaluée directement, hors Vitest :

```
$ grep -rlE "plateforme_(appliquer|retirer)_remise" src/ | grep -v stripe-discount-legacy-surface.test.ts
(aucun résultat)
```

**Zéro violation**, y compris dans les fichiers ajoutés par ce lot. La règle est
respectée ; seul son véhicule de test dépasse le délai.

Aucun test n'a été allongé en délai, désactivé ni assoupli pour masquer ce
point. Correctif proposé pour un lot séparé (déjà signalé par le lot précédent,
toujours ouvert) : relever `testTimeout` dans `vitest.config.ts`, ou sortir les
worktrees du volume externe.

### 7.3 Un test existant modifié — dit explicitement

`documents-envoi.test.ts` : le test « échoue si le client n'a pas d'adresse
e-mail » attendait le message `"Ce client n'a pas d'adresse e-mail renseignée"`.
Depuis le lot Snapshot, l'adresse utilisée est celle **figée sur le document**,
pas celle de la fiche client : le message était devenu inexact. Il devient
`"Ce document ne porte aucune adresse e-mail de destinataire."`

Le test a été **renommé et son message mis à jour** — scénario identique, refus
identique, assertion « aucun e-mail envoyé » conservée. Aucun test n'a été
supprimé, désactivé ni affaibli.

### 7.4 Ce qui n'a PAS été exécuté

- **Playwright** (`npm run test:e2e`) : **NON EXÉCUTÉ** — nécessite un serveur et
  un jeu de comptes ; hors périmètre.
- **Envoi Brevo réel** : **NON EXÉCUTÉ**, délibérément. Aucun e-mail n'a été émis
  vers une adresse réelle ; `envoyerEmailBrevo` est simulé. Le chemin réseau
  reste donc à couvrir par la recette humaine.
- **Application de la migration des champs légaux** : **NON EXÉCUTÉE** — bloquée
  par le ledger, c'est l'objet de ce blocage.
- **Recette visuelle de la boîte d'envoi** : **NON EXÉCUTÉE** — relève de la
  recette humaine (§10).

---

## 8. Fichiers

**Ajoutés (4)**

| Fichier | Rôle |
|---|---|
| `src/lib/document-resend-override.ts` | Règle de décision et construction de l'entrée d'audit (module pur) |
| `src/lib/document-resend-override.test.ts` | 19 tests de la règle |
| `src/lib/permissions-envoi.ts` | Autorisation de la surcharge |
| `docs/migrations-proposees/client-legal-fields-v1.sql.proposed` | SQL préparé, hors train canonique |

**Modifiés (6)**

| Fichier | Modification |
|---|---|
| `src/lib/documents-envoi.ts` | Résolution du destinataire, journalisation de l'écart (succès et échec) |
| `src/lib/documents-envoi.test.ts` | 9 tests d'intégration ajoutés ; 1 message d'erreur mis à jour (§7.3) |
| `src/app/actions/devis.ts` | Paramètre de surcharge + contrôle de permission serveur |
| `src/app/actions/factures.ts` | Idem |
| `src/components/EmailDocumentButton.tsx` | Adresse du document visible, surcharge repliée, avertissement d'écart |
| `src/app/(app)/devis/[id]/page.tsx`, `factures/[id]/page.tsx` | Transmission de l'adresse figée et du droit de surcharge |
| `supabase/tests/client_document_snapshot_v1.test.sql` | 5 assertions ajoutées (21 → 26) |

**Aucun fichier de `supabase/migrations/` n'a été créé, modifié ou renommé.**

---

## 9. P0 / P1 / P2 restants

### P0

**Aucun P0 ouvert** dans le périmètre de ce lot.

### P1

1. **Débloquer la partie 2.** Dès publication du rapport ledger : reprendre le
   numéro attribué, renommer le `.sql.proposed`, rejouer `verify:migrations` +
   `db reset` sur pile isolée, ajuster les assertions pgTAP 23-24.
2. **Activer `clients.raison_sociale`** (formulaire, affichage, snapshot) — la
   colonne existe et dort depuis l'origine. Sans migration.
3. **Trancher la permission de surcharge** : `gerer_clients` (retenu ici, sans
   migration) ou clé dédiée `surcharger_destinataire_document` (plus explicite,
   exige une migration).
4. **Intégrer `@elsatia/client-contracts`** selon §6, et remplacer le garde-fou
   e-mail minimal.

### P2

5. **Exposer le journal des surcharges dans l'interface** — les entrées sont
   écrites et lisibles sous `gerer_parametres`, mais aucun écran ne les présente
   aujourd'hui.
6. **Aligner `nomClient()` sur `computeClientDisplayName`** — défaut relevé par
   le contrat : un particulier chez qui une société a été saisie par erreur
   s'affiche en professionnel.
7. **`entreprise_snapshot` sur `devis`** — report du lot précédent, toujours
   ouvert.

---

## 10. Recette humaine (10 minutes)

1. Ouvrir une facture **émise**, cliquer « Envoyer par email ».
   → L'encart doit afficher **« Adresse du document : … »** avec l'adresse figée.
2. Envoyer sans rien changer → l'e-mail part à cette adresse ; **aucune** entrée
   dans le journal d'activité.
3. Rouvrir, cliquer « Envoyer à une autre adresse », saisir une adresse
   différente → un **encart ambre** doit apparaître, rappelant que le document
   n'est pas modifié.
4. Cliquer « Revenir à l'adresse du document » → l'encart disparaît, l'adresse du
   document redevient la destination.
5. Saisir à nouveau une autre adresse, un motif, envoyer.
6. Vérifier le PDF reçu : identité imprimée **inchangée** (snapshot).
7. Rouvrir la fiche client : son adresse e-mail doit être **inchangée**.
8. Rouvrir la facture : la mention d'identité figée doit être **inchangée**.
9. Contrôler le journal :
   ```sql
   select created_at, description, metadata
   from public.journal_activite
   where action = 'envoi_document_adresse_surchargee'
   order by created_at desc limit 5;
   ```
10. Avec un compte dont le poste n'a **pas** `gerer_clients` : le champ de
    surcharge ne doit pas apparaître, et l'envoi normal doit rester possible.

---

## 11. État Git final

_(complété ci-dessous)_
