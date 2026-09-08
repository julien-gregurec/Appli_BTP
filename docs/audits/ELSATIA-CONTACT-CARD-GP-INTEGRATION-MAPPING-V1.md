# ELSATIA Contact / Card — Correspondance avec Gestion Pro V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
Statut : **conception**. Aucune migration, aucun code d'intégration écrit.

Toutes les colonnes citées ont été relevées dans les migrations du train, pas supposées.

---

## 1. Règle d'or de l'intégration

Gestion Pro est la seule autorité sur le dossier client, et ce n'est pas une opinion : c'est
écrit et vérifié dans `packages/client-contracts/src/reference.ts`.

```ts
export const CLIENT_AUTHORITATIVE_APPLICATION: ClientSourceApplication = "gestion_pro";
export const CLIENT_SYNC_SCOPES = ["client:read", "client:propose", "client:write"] as const;
```

Le commentaire du paquet précise que `client:write` « n'est légitime que pour l'application
faisant autorité », qu'une application tierce ne peut porter que `client:read` et
`client:propose`, et que cette règle est « vérifiée par le validateur d'enveloppe, pas
seulement documentée ».

> **Contact / Card émet en `client:propose`. Jamais en `client:write`.**
> Une carte scannée produit une *proposition*, qu'un humain valide. C'est le mécanisme
> existant qui rend structurellement impossible la création automatique de fiche demandée
> comme interdite par la mission.

---

## 2. Table de correspondance des classifications

| Classification | Destination **réelle** | Écriture | Vérifié dans |
|---|---|---|---|
| **Prospect** | `clients` avec `statut = 'prospect'` | création ou rattachement | migration 004 : `statut … default 'prospect' check (statut in ('prospect','actif','inactif'))` |
| **Client** | `clients` (+ `contacts_clients` pour l'interlocuteur) | création ou rattachement | migration 004 |
| **Fournisseur** | `fournisseurs` avec `type_tiers = 'fournisseur'` | création ou rattachement | migrations 021 et 111 |
| **Sous-traitant** | `fournisseurs` avec `type_tiers = 'sous_traitant'` | création ou rattachement | migration 111 |
| **Partenaire** | *aucune* | — | aucune occurrence dans les 272 migrations |
| **Candidat / futur employé** | *aucune* | — | aucune occurrence ; `employes` est adossé à la paie |
| **Contact professionnel général** | *aucune* | — | tout contact est rattaché à un `clients` |
| **À classer** | boîte de réception Contact / Card | — | — |

### 2.1 Trois corrections au tableau supposé de la mission

**« Prospect → fiche prospect ou client avec statut prospect ».**
Il n'y a pas de « fiche prospect » : il y a `clients.statut = 'prospect'`, et c'est déjà la
valeur par défaut. Créer une entité prospect séparée dupliquerait `clients`.

**« Sous-traitant → registre sous-traitants existant ou fournisseur avec rôle spécialisé ».**
Le registre n'existe pas. `sous_traitants_chantiers` est une **affectation** —
`(fournisseur_id, chantier_id, mission, montant_previsionnel_ht, statut)` — pas un registre
de tiers. Seule la seconde branche est vraie.

> Corollaire opérationnel : **Contact / Card n'écrit jamais dans
> `sous_traitants_chantiers`.** Au moment du scan il n'y a pas de chantier, pas de mission et
> pas de montant. L'affectation est un geste ultérieur, dans Gestion Pro, par un humain.

**« Candidat → vivier de candidats ».**
Il n'y a pas de vivier. Une recherche `candidat|vivier|recrutement` sur les 272 migrations ne
renvoie que deux commentaires sans rapport. La destination reste le carnet Contact / Card,
ce qui satisfait par construction l'interdiction de créer un salarié depuis une carte.

---

## 3. Correspondance des champs — destination `clients`

| Champ Contact / Card | Colonne `public.clients` | Contrat canonique | Remarques |
|---|---|---|---|
| prénom | `prenom` | `firstName` | — |
| nom | `nom` | `lastName` | — |
| entreprise (nom d'usage) | `societe` | `tradeName` | correspondance **déjà tranchée** par la migration 274 |
| raison sociale | `raison_sociale` | `legalName` | colonne existante, **inexploitée par le code** à ce jour |
| SIRET | `siret` | `legal.siret` | validé par `isValidSiret` (Luhn) |
| n° TVA | `numero_tva` | `legal.vatNumber` | migration 274 ; `check (numero_tva ~ '^[A-Z]{2}[0-9A-Z]{2,13}$')` |
| forme juridique | `forme_juridique` | `legal.legalForm` | migration 274 |
| e-mail | `email` | `email` | `normalizeEmail` avant écriture |
| téléphone | `telephone` | `phone` | `normalizePhoneNumber` |
| **mobile** | *aucune colonne* | `mobile` | **perte** — `clients` n'a qu'un `telephone` |
| adresse | `adresse_facturation` | `address.line1` | — |
| complément | `adresse_complement` | `address.line2` | migration 274 |
| code postal | `code_postal` | `address.postalCode` | `normalizePostalCode` |
| ville | `ville` | `address.city` | — |
| pays | `pays` | `address.country` | migration 274 ; ISO 3166-1 alpha-2, `NULL` ≠ `'FR'` écrit |
| **site Internet** | *aucune colonne* | `website` | **perte** — `clients` n'a pas de site |
| notes | `notes` | `notes` | — |
| type | `type` | `category` | `particulier`/`professionnel`/`collectivite`/`syndic`/`promoteur` |
| statut | `statut` | `status` | `prospect` par défaut |
| source | *aucune colonne* | — | **à porter par Contact / Card**, pas par `clients` |

`reference_interne` n'est jamais fournie : le trigger `set_client_reference` la génère
(`CLI-0001` via `next_reference`).

### 3.1 Deux pertes de données à assumer ou à corriger

`clients` n'a **ni mobile ni site Internet**, alors qu'une carte de visite porte
généralement les deux et que le contrat canonique les définit (`mobile`, `website`).

Trois options, aucune ne pouvant être appliquée aujourd'hui (train bloqué) :

1. conserver mobile et site **dans Contact / Card**, et ne verser que ce que `clients` sait
   recevoir — c'est ce que fait la V1 proposée, et c'est sans risque ;
2. écrire le mobile dans `telephone` s'il est vide — **non recommandé** : cela fabrique une
   fausse égalité entre deux numéros de nature différente ;
3. ajouter les colonnes (proposition SQL, §7).

---

## 4. Correspondance des champs — destination `contacts_clients`

| Champ Contact / Card | Colonne | Remarque |
|---|---|---|
| prénom + nom | `nom` | **agglomérés** : la colonne `prenom` n'existe pas |
| fonction | `fonction` | — |
| téléphone | `telephone` | — |
| **mobile** | *aucune* | perte |
| e-mail | `email` | — |
| principal | `principal` | booléen, pas un tableau de rôles |
| **notes** | *aucune* | perte |
| **statut** | *aucune* | pas d'archivage d'un interlocuteur remplacé |

Écart mesuré avec `ClientContact` de `@elsatia/client-contracts`, qui définit `civility`,
`firstName`, `lastName`, `jobTitle`, `email`, `phone`, `mobile`, `roles[]`
(`primary`/`billing`/`site`), `status` (`active`/`inactive`), `notes`.

> **La table est en retard sur le contrat.** Verser une carte de visite dans
> `contacts_clients` aujourd'hui perd le prénom séparé et le mobile — soit précisément les
> deux informations qu'une carte de visite porte toujours.

`contacts_clients` n'a pas de colonne `entreprise_id` : son cloisonnement remonte au client
via les politiques RLS (`exists (select 1 from clients c where c.id = contacts_clients.client_id
and a_permission(c.entreprise_id, 'gerer_clients'))`). Tout code de versement doit donc
d'abord résoudre le client, puis écrire — jamais l'inverse.

---

## 5. Correspondance des champs — destination `fournisseurs`

| Champ Contact / Card | Colonne | Remarque |
|---|---|---|
| entreprise | `nom` | `not null`, `check (btrim(nom) <> '')` |
| prénom + nom du porteur | `contact_nom` | **un seul champ texte, une seule personne** |
| fonction | *aucune* | perte |
| e-mail | `email` | — |
| téléphone | `telephone` | — |
| mobile | *aucune* | perte |
| adresse / CP / ville | `adresse`, `code_postal`, `ville` | — |
| SIRET | `siret` | — |
| n° TVA | `numero_tva` | migration 111 |
| notes | `notes` | — |
| rôle | `type_tiers` | `'fournisseur'` **ou** `'sous_traitant'` — jamais les deux |
| spécialité | `specialite` | migration 111 |

`reference` est `not null` avec `unique (entreprise_id, reference)` : elle doit être générée
avant l'insertion, contrairement à `clients` qui a un trigger.

### 5.1 Deux limites structurelles

**Un fournisseur n'a pas d'interlocuteurs.** Il n'existe aucune table
`contacts_fournisseurs`. Recevoir deux cartes de deux commerciaux du même fournisseur n'a
aujourd'hui **aucune traduction correcte** : soit on écrase `contact_nom`, soit on crée un
second fournisseur — les deux sont faux.

> Décision V1 : **ne rien écraser**. Le second interlocuteur reste dans le carnet
> Contact / Card, rattaché logiquement au fournisseur, jusqu'à ce qu'une table
> d'interlocuteurs existe (proposition SQL, §7).

**Fournisseur et sous-traitant s'excluent.**
`check(type_tiers in ('fournisseur','sous_traitant'))` porte une valeur unique. Le cas
« fournisseur et sous-traitant » du §6 de la mission est **interdit par la base**. Contact /
Card doit l'afficher comme indisponible, pas le simuler par deux fiches — deux fiches pour un
même SIRET seraient exactement le doublon que le produit prétend éviter.

---

## 6. Protocole de transfert

### 6.1 Enveloppe

Réutilisation intégrale de `ClientSyncEnvelope` :

```ts
{
  schemaVersion: "elsatia.client.sync-envelope/1",
  contractVersion: "1.0.0",
  idempotencyKey: buildIdempotencyKey({ sourceApp, tenantId, operation, subject, occurredAt }),
  sourceApp, targetApp: "gestion_pro", tenantId,
  actor: { actorId, tenantId, scopes: ["client:propose"] },   // jamais client:write
  occurredAt, externalReference,
  operation: "create" | "update" | "archive" | "unlink",
  payload,
}
```

**Point d'attention.** `CLIENT_SOURCE_APPLICATIONS` vaut aujourd'hui
`["gestion_pro","reserves","drone","tools","colors"]` — **`contact` n'y figure pas**. Le
paquet devra être étendu. Ses propres règles de compatibilité (`version.ts`) prévoient qu'un
lecteur refuse ce qu'il ne connaît pas : un lecteur déployé avant l'ajout rejettera une
enveloppe `sourceApp: "contact"`. L'ordre de déploiement est donc contraint — **le paquet
d'abord, l'émetteur ensuite** — et cela doit figurer au plan de mise en service.

### 6.2 Idempotence

`buildIdempotencyKey` prend `subject` : Contact / Card y met **l'identifiant de la carte
reçue**, jamais un horodatage ni un aléa. Rejouer le même versement ne crée donc rien de
nouveau — c'est l'exigence §7 de la mission, satisfaite par une fonction existante.

### 6.3 Conflits

`detectClientSyncConflict` couvre les six cas : `version_mismatch`, `client_not_found`,
`duplicate_identity`, `tenant_mismatch`, `permission_denied`, `client_archived`.

Résolution par défaut : `"manual"` — « un humain doit trancher dans Gestion Pro. Valeur par
défaut, et la seule sûre. » Contact / Card ne change pas ce défaut.

### 6.4 Traçabilité exigée par le §7 de la mission

À conserver pour chaque transfert : source `elsatia_contact_card` · identifiant de la carte
reçue · utilisateur ayant classé · entreprise locataire · date de réception · date de
confirmation · date de synchronisation · destination · identifiant de l'objet créé ou lié ·
informations initialement reçues · corrections effectuées · résultat de la détection de
doublon · journal d'audit.

`journal_activite` (`action`, `ressource`, `ressource_id`, `metadata jsonb`, `entreprise_id`,
`utilisateur_id`) accueille le journal d'audit sans modification. Le reste appartient aux
tables propres de Contact / Card.

---

## 7. Évolutions SQL nécessaires — toutes bloquées

Aucune de ces évolutions n'est appliquée. Elles sont décrites dans
`docs/migrations-proposees/contact-card-v1.sql.proposed`, marqué
**NON INTÉGRÉ — BLOQUÉ PAR LE TRAIN GLOBAL**.

| # | Évolution | Sans elle |
|---|---|---|
| E1 | Tables propres à Contact / Card (cartes, profils, jetons, réception, analyses, carnet, propositions) | pas de produit |
| E2 | `applications_elsatia` : ligne `contact` + rôles | pas de branchement multi-app |
| E3 | `contacts_clients` : `prenom`, `mobile`, `notes`, `statut` | prénom et mobile perdus au versement |
| E4 | Table d'interlocuteurs fournisseur | un seul contact par fournisseur, écrasé à chaque carte |
| E5 | `clients` : `mobile`, `site_web` | mobile et site perdus au versement |
| E6 | Multi-rôle de tiers (remplacement de `type_tiers`) | fournisseur **et** sous-traitant impossible |
| E7 | Correction de `notifications_evenement_unique` | l'exigence « une seule notification » non tenue |
| E8 | Vivier de candidats | classement « candidat » sans destination |
| E9 | Rôle « partenaire » | classement « partenaire » sans destination |
| E10 | Catégorie Boutique pour cartes NFC | vente impossible |

E3, E5, E6, E7 sont des **corrections de dettes existantes** que Contact / Card révèle mais
n'introduit pas. Elles gagneraient à être traitées pour elles-mêmes, indépendamment de ce
produit.

---

## 8. Ordre de construction recommandé

1. **Socle autonome** — cartes, profil, page publique, vCard, révocation. Aucune dépendance
   à Gestion Pro. Testable et utile seul.
2. **Échange réciproque** — formulaire consenti, plafonné, boîte de réception, notifications
   idempotentes.
3. **Carnet et classement** — recherche, doublons via `@elsatia/client-contracts`,
   catégories, carnet complet sans Gestion Pro.
4. **Pont Gestion Pro** — enveloppes `client:propose` vers `clients` et `fournisseurs`
   uniquement, les seules destinations qui existent.
5. **Le reste** — OCR (D5), hors-ligne (après preuve E2E), partenaire/candidat (D3, D4),
   multi-rôle (D2), Boutique (D8).

Chaque étape est livrable et vérifiable seule. Aucune n'exige la suivante.
