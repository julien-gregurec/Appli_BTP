# ELSATIA Contact / Card — Correspondance avec Gestion Pro V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
Révision : **R3** — O1 à O4, E4 et E5 arbitrées. R2 = `0fd1e32`.
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
>
> **D9 fige cette règle comme invariant du produit** : elle ne se négocie ni contre un gain
> d'ergonomie, ni contre un taux de confiance OCR élevé, ni pour un lot ultérieur.
> Contact / Card propose ; Gestion Pro confirme.

---

## 2. Table de correspondance des classifications

| Classification | Destination cible | Écriture | État du modèle |
|---|---|---|---|
| **Prospect** | `clients` avec `statut = 'prospect'` | création ou rattachement | **existe** — migration 004 |
| **Client** | `clients` + `interlocuteurs_tiers` (`tiers_type='client'`) | création ou rattachement | `clients` **existe** ; interlocuteurs **à créer (E4)** |
| **Fournisseur** | `fournisseurs` + rôle `fournisseur` + `interlocuteurs_tiers` | création, rattachement, **ou ajout de rôle**, **ou ajout d'interlocuteur** | existe ; **rôles (D4) et interlocuteurs (E4) à créer** |
| **Sous-traitant** | `fournisseurs` + rôle `sous_traitant`, **cumulable** | idem | existe ; **rôles (D4) et interlocuteurs (E4) à créer** |
| **Partenaire** | `partenaires` | création ou rattachement | **à créer (D6)** |
| **Candidat / futur employé** | `candidats`, statut `propose` | **proposition uniquement** | **à créer (D5)** |
| **Contact professionnel général** | `contacts_professionnels` | création ou rattachement | **à créer (D6)** |
| **À classer** | boîte de réception Contact / Card | — | existe (produit) |

Aucune de ces destinations n'est atteignable tant que le train est fermé : les six lignes
marquées « à créer » ou « à ajouter » vivent dans `contact-card-v1.sql.proposed`.

### 2.1 Trois corrections au tableau initial, qui restent vraies après arbitrage

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
Il n'y avait pas de vivier — une recherche `candidat|vivier|recrutement` sur les 272
migrations ne renvoie que deux commentaires sans rapport. **D5 tranche : le vivier est à
créer**, strictement distinct des salariés.

La garantie tient alors à trois propriétés du modèle, pas à une promesse : `candidats` n'a
**aucune clé étrangère vers `employes`**, aucun lien avec `dossiers_paie_salaries` ni
`profils_paie_employes`, et le classement « futur employé » écrit un candidat au statut
`propose` — jamais un candidat confirmé, jamais un salarié. Le recrutement effectif reste un
geste RH manuel, hors de portée de Contact / Card.

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

## 4. Correspondance des champs — destination `interlocuteurs_tiers`

### 4.1 Pourquoi ce n'est plus `contacts_clients`

R2 proposait d'ajouter `prenom` et `telephone_mobile` à `public.contacts_clients`. **Cette
proposition est retirée**, sur la foi de trois faits vérifiés depuis :

1. **Plus aucun rôle applicatif ne peut la lire ni l'écrire.** `20260902000255` révoque
   `SELECT`, `INSERT`, `UPDATE` et `DELETE` pour `authenticated` **et** `service_role`.
   Vérifié en recette : `authenticated` n'a plus **aucun** privilège ; `service_role` ne
   conserve que `REFERENCES`, `TRIGGER` et `TRUNCATE`, dont aucun ne touche une ligne.
2. **Ce n'est pas un gel accidentel.** Cette migration est une *réconciliation ACL* : elle
   retire des ACL « historiques excédentaires observées sur la restauration Production
   210 → 252 » qui étaient **absentes de la référence canonique Fresh**. La table n'a jamais
   été exposée dans le modèle canonique.
3. **Rien ne l'utilise.** Une seule clé étrangère la référence (`appels_contacts.contact_id`)
   et **aucun** code applicatif ne la touche — la seule mention TypeScript du dépôt est le
   commentaire de `@elsatia/client-contracts` qui la déclare « gelée ».

Ajouter des colonnes à cette table n'aurait rendu personne capable de les écrire. Honorer
D7 supposait donc, en plus, de **ré-accorder ses grants** — c'est-à-dire défaire une
réconciliation ACL délibérée. Ce n'est pas un travail de ce lot.

> **L'intention de D7 est intégralement honorée** — prénom et mobile sur les interlocuteurs
> clients — mais sur une table vivante. Et `public.contacts_clients` n'est **ni lue, ni
> écrite, ni modifiée** : les données existantes sont préservées par abstention, ce qui est
> la forme la plus sûre de préservation.

### 4.2 Les deux options, et le critère qui les départage

| | **Option A — dédiée** | **Option B — générique** ✅ |
|---|---|---|
| Forme | dégeler `contacts_clients`, l'étendre, cloner `contacts_fournisseurs` | une table `interlocuteurs_tiers` pour tous les registres |
| Données existantes | modifie la table héritée (colonnes **et** grants) | **n'y touche pas du tout** |
| Gouvernance ACL | **rouvre** la réconciliation fermée au 255 | aucune ACL existante touchée |
| Couverture | clients et fournisseurs | clients, fournisseurs, sous-traitants, partenaires, contacts professionnels |
| Intégrité référentielle | clé étrangère réelle | **référence polymorphe** — compromis assumé |
| Divergence à terme | deux tables jumelles qui dériveront | une seule forme |

Le critère demandé était « celle qui préserve le mieux les données existantes ».
**L'option qui ne touche à rien de l'existant le préserve mieux que celle qui rouvre ses
ACL.** D'où la recommandation de l'option B.

Son seul vrai coût — l'absence de clé étrangère sur `tiers_id` — est borné par un
déclencheur qui vérifie que le tiers visé **existe** et appartient au **même locataire**.
C'est ce qu'une clé étrangère aurait garanti ; à défaut, on le vérifie explicitement plutôt
que d'y renoncer.

L'option A reste écrite, en commentaire, dans `contact-card-v1.sql.proposed` §E4-A.

### 4.3 Champs

| Champ Contact / Card | Colonne `interlocuteurs_tiers` | Remarque |
|---|---|---|
| civilité | `civilite` | facultative |
| prénom | `prenom` | **séparé du nom**, enfin |
| nom | `nom` | — |
| fonction | `fonction` | — |
| e-mail | `email` | `normalizeEmail` avant écriture |
| téléphone (ligne directe) | `telephone` | celui de la **personne** |
| mobile | `telephone_mobile` | celui de la **personne** |
| adresse professionnelle | `adresse`, `code_postal`, `ville`, `pays` | facultative — inutile de répéter celle de l'organisation |
| notes | `notes` | — |
| statut actif/inactif | `statut` | inactiver ≠ supprimer |
| rôles | `roles[]` | `primary`, `billing`, `site`, `commercial`, `technique`, `direction` |
| contact principal | `principal` | **un seul actif par tiers**, index unique partiel |
| source | `source` | `contact_card` quand la fiche vient d'une carte |
| date de réception | `recu_at` | — |
| consentement | `consentement_donne`, `consentement_at` | — |
| entreprise de rattachement | `tiers_type` + `tiers_id` | le registre **et** l'identifiant |
| identifiant de la carte source | `carte_recue_id` | clé étrangère réelle |
| historique | `contact_images_journal` + `journal_activite` | — |

Aucune perte. Chacun des seize points demandés a une colonne.

## 5. Correspondance des champs — destination `fournisseurs`

| Champ Contact / Card | Colonne | Remarque |
|---|---|---|
| entreprise | `nom` | `not null`, `check (btrim(nom) <> '')` |
| prénom + nom du porteur | `interlocuteurs_tiers.prenom` / `.nom` | **plusieurs personnes possibles (E4)** ; `fournisseurs.contact_nom` n'est plus la cible |
| fonction | `interlocuteurs_tiers.fonction` | — |
| e-mail de l'organisation | `fournisseurs.email` | standard |
| e-mail de la personne | `interlocuteurs_tiers.email` | ligne nominative |
| standard téléphonique | `fournisseurs.telephone` | organisation |
| ligne directe | `interlocuteurs_tiers.telephone` | personne |
| mobile | `interlocuteurs_tiers.telephone_mobile` | **personne uniquement (E5)** |
| site Internet | `fournisseurs.site_web` | **à créer (E5)** — n'existait nulle part |
| adresse / CP / ville | `adresse`, `code_postal`, `ville` | — |
| SIRET | `siret` | — |
| n° TVA | `numero_tva` | migration 111 |
| notes | `notes` | — |
| rôle | `fournisseurs_roles.role` | `fournisseur` **et/ou** `sous_traitant` — **cumul autorisé (D4)** ; `type_tiers` reste en lecture pendant la transition |
| spécialité | `specialite` | migration 111 |

`reference` est `not null` avec `unique (entreprise_id, reference)` : elle doit être générée
avant l'insertion, contrairement à `clients` qui a un trigger.

### 5.1 Deux limites structurelles, désormais levées

**Un fournisseur n'avait pas d'interlocuteurs.** Il n'existait aucune table
`contacts_fournisseurs` : recevoir deux cartes de deux commerciaux du même fournisseur
n'avait aucune traduction correcte — soit on écrasait `contact_nom`, soit on créait un
second fournisseur, et les deux sont faux.

> **E4 tranche : `interlocuteurs_tiers` accueille autant de personnes que nécessaire, pour
> un seul tiers.** Deux cartes du même fournisseur produisent **un fournisseur et deux
> interlocuteurs**. Un interlocuteur qui part devient `inactif` : il n'est pas supprimé, le
> tiers n'est pas touché, et la place d'interlocuteur principal se libère pour son
> remplaçant.

`fournisseurs.contact_nom` n'est **pas** supprimée — la retirer serait une perte de données
sur une colonne peut-être peuplée. Elle devient une donnée héritée, que l'application cesse
d'écrire une fois les interlocuteurs en place.

**Fournisseur et sous-traitant s'excluaient.**
`check(type_tiers in ('fournisseur','sous_traitant'))` porte une valeur unique, ce qui
interdisait le cas « fournisseur et sous-traitant » du §6 de la mission. **D4 tranche : le
cumul est retenu**, via `fournisseurs_roles`.

L'ampleur réelle du changement a été mesurée avant de le proposer : `type_tiers` n'est lu
qu'à **6 endroits dans 4 fichiers**, tous des filtres `.eq()`
(`fournisseurs/page.tsx:18`, `sous-traitants/page.tsx:18`,
`sous-traitants/[id]/page.tsx:20`, `actions/sous-traitants.ts:21,59,70`), et n'apparaît que
dans 2 migrations. Le refactor est donc contenu — à condition de **conserver la colonne
pendant la transition** : c'est elle qui alimente la table de rôles à la reprise, et la
supprimer d'abord ouvrirait une fenêtre où un tiers n'a plus aucun rôle.

En attendant, Contact / Card affiche le cumul comme *à venir* plutôt que de le simuler par
deux fiches — deux fiches pour un même SIRET seraient exactement le doublon que le produit
prétend éviter.

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

| # | Évolution | Décision | Sans elle |
|---|---|---|---|
| E1 | Tables propres à Contact / Card (cartes, profils, jetons, réception, analyses **par champ**, carnet, propositions, paramètres) | D1, D2 | pas de produit |
| E2 | `applications_elsatia` : ligne `contact` + rôles + permissions | D10 | pas de branchement multi-app |
| E3 | ~~`contacts_clients` : `prenom`, `telephone_mobile`…~~ **retirée** | D7, révisée | remplacée par E4 : plus aucun rôle applicatif ne peut lire ni écrire cette table (§4.1) |
| E4 | `interlocuteurs_tiers` — interlocuteurs de **tous** les registres | **E4, D7** | un seul contact par tiers, écrasé à chaque carte |
| E5 | `clients.site_web`, `clients.telephone_mobile` (particulier), `fournisseurs.site_web` | **E5** | site et mobile perdus au versement |
| E6 | `fournisseurs_roles` — rôles multiples de tiers | **D4** | fournisseur **et** sous-traitant impossible |
| E7 | `notifications_utilisateurs.cle_idempotence` unique, retrait de l'index trompeur | **D8** | l'exigence « une seule notification » non tenue |
| E8 | `candidats` — vivier sans lien vers la paie | **D5** | classement « candidat » sans destination |
| E9 | `partenaires`, `contacts_professionnels`, `tiers_liens` | **D6** | classements « partenaire » et « contact général » sans destination |
| E10 | Catégorie Boutique pour cartes NFC | hors périmètre | vente impossible |

E5, E6 et E7 sont des **corrections de dettes préexistantes** que Contact / Card révèle
sans les avoir introduites. E7 en particulier — l'index d'unicité des notifications qui
n'unifie rien — concerne **toutes** les notifications de Gestion Pro, pas seulement celles de
ce produit : elle gagnerait à être traitée pour elle-même, dès la réouverture du train, sans
attendre ce lot.

---

## 8. Ordre de construction recommandé

1. **Socle autonome** — cartes, profil, page publique, vCard, révocation. Aucune dépendance
   à Gestion Pro. Testable et utile seul.
2. **Échange réciproque** — formulaire consenti, plafonné, boîte de réception, notifications
   idempotentes.
3. **Carnet et classement** — recherche, doublons via `@elsatia/client-contracts`,
   catégories, carnet complet sans Gestion Pro.
4. **Pont Gestion Pro** — enveloppes `client:propose` vers `clients` et `fournisseurs`,
   les deux seules destinations qui existent aujourd'hui.
5. **Destinations nouvelles**, à la réouverture du train — rôles multiples (D4), vivier
   (D5), partenaires et contacts généraux (D6), `prenom`/`telephone_mobile` (D7),
   idempotence des notifications (D8).
6. **OCR** (D1, D2) — après O3 (fournisseur, coût, contrat) et O2 (rétention des images),
   derrière le double interrupteur.
7. **Le reste** — hors-ligne après preuve E2E, Boutique hors périmètre.

Les étapes 1 à 3 ne touchent **aucune table existante** : elles sont livrables même train
fermé. C'est ce qui rend le produit constructible dès maintenant, sans attendre O1.

Chaque étape est livrable et vérifiable seule. Aucune n'exige la suivante.
