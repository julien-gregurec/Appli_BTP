# ELSATIA — CANONICAL CLIENT MODEL AND SEARCH AUDIT V1

**Statut** : audit / architecture uniquement. Aucune migration, aucun index, aucun déploiement, aucun accès Supabase distant, aucune dépendance ajoutée.
**Date** : 2026-09-07
**Référence GP auditée** : `integration/gp-postcutover-precommercial-ops-v1` @ `4266ba6ce347ed3a4f379430442b341b67df516e`
**Ledger canonique** : 265 (`20260905000265_essai_30_jours_modules_catalogue_v1.sql`)
**Branches lues en complément (lecture seule, non modifiées)** : `feat/reserves-v3-collaboration-livrables`, `feat/drone-core-contracts-v1`, `audit/cutover-operator-readiness-v1` (worktree courant).

> Note de méthode sur le ledger. Le worktree courant est au ledger **265**. La référence
> `4266ba6` porte **267** : elle ajoute `20260906000266_platform_global_owner_all_apps_v1.sql`
> et `20260906000267_support_reply_notification_recipient_v1.sql`. Vérifié : **aucune des deux
> ne touche `clients`, `contacts_clients`, `chantiers`, `devis` ou `factures`**. Le modèle
> client décrit ici est donc identique sur les deux points de référence.
> Réserves (`268`→`270`) et Drone (aucune migration) se posent **au-dessus** de `267` sans
> collision de numérotation. Le train est intact.

---

## 1. Applications concernées

| Application | Emplacement réel | Locataire (tenant) | Dossier client réel ? |
|---|---|---|---|
| **Gestion Pro** | racine du dépôt (`src/`) | `entreprises.id` | **Oui — seul dossier client de l'écosystème** |
| **Réserves** | `apps/reserves/` (branche `feat/reserves-v3-…`) | `entreprises.id` | Non |
| **Drone** | `packages/drone-core/` (branche `feat/drone-core-contracts-v1`) | `entreprise_id` (contrat TS, non persisté) | Non — 2 champs plats |
| **Tools** | `apps/tools/` | **`auth.users.id`** (+ `organization_id` facultatif) | Non |
| **Colors** | `apps/colors/` + tables `colors_*` | `entreprises.id` | Non |

**Fait structurant n° 1** : il n'existe **qu'un seul** dossier client dans tout l'écosystème, celui de Gestion Pro. Il n'y a donc aucune divergence de modèle client à réconcilier aujourd'hui — il y a un modèle unique, incomplet, et quatre applications qui n'en ont pas.

**Fait structurant n° 2** : Tools est la seule application dont le locataire n'est **pas** `entreprises.id` mais `auth.users.id`. Toute liaison client Tools ↔ GP devra franchir cette frontière ; ce n'est pas un détail d'implémentation, c'est une contrainte de sécurité (cf. §15 et §22 des impacts).

---

## 2. Tables client actuelles — noms exacts

Créées par `supabase/migrations/20260710000004_clients_chantiers.sql` :

| Table | Rôle | État réel |
|---|---|---|
| `public.clients` | dossier client | **vivante** |
| `public.contacts_clients` | contacts secondaires d'un client | **morte** (cf. §2.3) |
| `public.chantiers` | chantier, porte son adresse | vivante |
| `public.types_chantier` | typologie par entreprise | vivante |
| `public.chantier_transferts` | historique de changement de client d'un chantier | vivante |
| `public.taches` | tâches de chantier | vivante |

Tables **tierces** au modèle client, structurellement voisines et à ne pas confondre :

| Table | Créée par | Remarque |
|---|---|---|
| `public.entreprises` | `…0001_comptes_entreprises.sql` | le locataire lui-même, pas un client |
| `public.fournisseurs` | `…0021_commandes_fournisseurs.sql` | fournisseurs **et** sous-traitants (`type_tiers`) |
| `public.appels_contacts` | `…0080_suite_metier_complete.sql` | journal CRM, référence `client_id` + `contact_id` |
| `public.reserves_chantiers` | `…0268_reserves_v1_…` (hors ledger 265) | chantier propre à Réserves |
| `public.reserves_intervenants` | idem | entreprises intervenantes, **pas** des clients |

**Objets qui n'existent pas** et qu'il ne faut pas supposer : `clients_addresses`, `client_adresses`, `adresses`, `billing_address`, `adresses_facturation`, `search_vector`, `clients_recherche`, `avoirs`. Aucun n'est présent dans les 263 migrations.

### 2.1 `public.clients` — colonnes exactes

| Colonne | Type / contrainte | Origine | Écrite par l'appli ? | Lue par l'appli ? |
|---|---|---|---|---|
| `id` | uuid PK | mig 004 | — | oui |
| `entreprise_id` | uuid NOT NULL → `entreprises(id)` ON DELETE CASCADE | mig 004 | oui | oui |
| `reference_interne` | text, `unique(entreprise_id, reference_interne)`, auto `CLI-0001` via trigger `set_client_reference` | mig 004 | trigger | oui |
| `type` | text NOT NULL default `'particulier'`, CHECK `('particulier','professionnel','collectivite','syndic','promoteur')` | mig 004 | oui | oui |
| `nom` | text (nullable) | mig 004 | oui | oui |
| `prenom` | text | mig 004 | oui | oui |
| `societe` | text | mig 004 | oui | oui |
| **`raison_sociale`** | text | mig 004 | **non — jamais** | **non — jamais** |
| `siret` | text, **aucun format contraint** | mig 004 | oui | oui |
| `adresse_facturation` | text | mig 004 | oui | oui |
| `code_postal` | text, **aucun format contraint** | mig 004 | oui | oui |
| `ville` | text | mig 004 | oui | oui |
| **`adresse_chantier_defaut`** | text | mig 004 | **non — aucun chemin d'écriture** | oui (`src/app/actions/chantiers.ts:351`) |
| `telephone` | text, **aucune normalisation** | mig 004 | oui | oui |
| `email` | text, **aucun CHECK de format** | mig 004 | oui | oui |
| `conditions_paiement` | text libre | mig 004 | oui | oui |
| `statut` | text NOT NULL default `'prospect'`, CHECK `('prospect','actif','inactif')` | mig 004 | oui | oui |
| `notes` | text | mig 004 | oui | oui |
| `created_at` / `updated_at` | timestamptz NOT NULL default now() | mig 004 | `updated_at` à la main | oui |
| `delai_paiement_jours` | integer NOT NULL default 30, CHECK `between 0 and 365` | `…0016_delai_paiement_client.sql` | oui | oui |
| **`latitude`** | numeric(10,7) | `…0080_suite_metier_complete.sql` | **non** | **non** |
| **`longitude`** | numeric(10,7) | `…0080` | **non** | **non** |
| `relance_auto_exclue` | boolean NOT NULL default false | `…0230_relances_auto_v1.sql` | oui | oui |

Contraintes additionnelles : `unique (id, entreprise_id)` (`…0096_collaboration_appels_offres_doe.sql:132`) — clé composite indispensable, elle est ce qui permet aux FK composites `devis`/`factures` de garantir l'isolation (cf. §15 sécurité).

**Colonnes mortes confirmées** : `raison_sociale`, `latitude`, `longitude` (aucune lecture ni écriture applicative). **Colonne semi-morte** : `adresse_chantier_defaut` (lue, jamais renseignable).

### 2.2 `public.chantiers` — colonnes d'adresse

| Colonne | Type | Origine |
|---|---|---|
| `client_id` | uuid NOT NULL → `clients(id)` ON DELETE **RESTRICT** | mig 004 |
| `adresse` | text | mig 004 |
| `code_postal` | text | mig 004 |
| `ville` | text | mig 004 |
| `latitude` / `longitude` | numeric(10,7), CHECK de bornes | `…0137_suivi_zone_chantier.sql` |
| `rayon_metres` | numeric(10,2) NOT NULL default 300 | `…0137` |
| `distance_siege_km` | numeric(10,2) | `…0150_frais_route_automatiques.sql` |
| `description`, `devis_source_id` | text, uuid (FK composite `(devis_source_id, entreprise_id)`) | `…0227_workflow_devis_v1_…` |

Pas de `pays`, pas de `complement_adresse`.

### 2.3 `public.contacts_clients` — table morte

Colonnes : `id`, `client_id` → `clients(id)` CASCADE, `nom` NOT NULL, `fonction`, `telephone`, `email`, `principal` boolean, `created_at`. Trigger `contact_principal_unique` garantissant un seul contact principal par client.

**Aucune référence dans le code applicatif** — vérifié sur `src/`, `apps/`, `packages/` : zéro occurrence en `.ts`/`.tsx`. Et surtout, `20260902000255_acl_reconciliation_v1.sql:596-603` :

```sql
REVOKE DELETE ON TABLE public.contacts_clients FROM authenticated;
REVOKE INSERT ON TABLE public.contacts_clients FROM authenticated;
REVOKE SELECT ON TABLE public.contacts_clients FROM authenticated;
REVOKE UPDATE ON TABLE public.contacts_clients FROM authenticated;
```

La table est **inaccessible depuis PostgREST** au ledger 265. Elle conserve ses policies RLS et son trigger, mais aucun rôle API ne peut la lire. C'est une table gelée, pas une table en attente d'UI. La seule référence résiduelle est la FK `appels_contacts.contact_id` (`…0080:155`), qui est donc structurellement nulle en pratique.

---

## 3. Modèle actuel — description honnête

Le modèle client de Gestion Pro est **une table plate unique, sans normalisation d'adresse, sans notion de contact exploitable, et sans snapshot documentaire.**

```
entreprises (tenant)
  └── clients ────────────┬── chantiers (adresse propre, copiée par valeur)
       │                  ├── devis    (client_id seul)
       │                  ├── factures (client_id seul + entreprise_snapshot)
       │                  └── appels_contacts (CRM)
       └── contacts_clients  [GELÉE — grants révoqués]
```

Il n'y a **aucune table d'adresse**. L'adresse vit :
1. dans `clients` (`adresse_facturation`, `code_postal`, `ville`) — une seule adresse ;
2. dans `chantiers` (`adresse`, `code_postal`, `ville`) — copiée depuis le client à la création, puis autonome ;
3. dans `entreprises` — l'adresse de l'émetteur.

Elle n'est **jamais dupliquée dans les documents**, ce qui est précisément le problème (§8).

---

## 4. Particulier / professionnel

### 4.1 Comment le canon distingue aujourd'hui

Uniquement par `clients.type`, une énumération à **cinq** valeurs (`particulier`, `professionnel`, `collectivite`, `syndic`, `promoteur`), exposée en UI par `CLIENT_TYPES` (`src/lib/chantier-statuts.ts:40-46`).

Cette distinction est **purement déclarative** :
- aucune contrainte DB ne dépend de `type` ;
- le formulaire (`src/components/ClientForm.tsx`) affiche **exactement les mêmes champs** quel que soit le type — prénom, nom, société, SIRET sont tous visibles pour un particulier ;
- la logique métier n'utilise `type` que comme filtre de liste (`clients_liste_paginee(p_type)`) et comme libellé.

Le nom affiché (`nomClient`, `chantier-statuts.ts:55-58`) ignore `type` : il prend `societe` si elle est renseignée, sinon `prénom nom`. Un particulier qui a par erreur une société devient un professionnel à l'affichage.

### 4.2 Champs présents / manquants / doublons

**Présents et utilisés** : `type`, `nom`, `prenom`, `societe`, `siret`, `email`, `telephone`, `adresse_facturation`, `code_postal`, `ville`, `statut`, `conditions_paiement`, `delai_paiement_jours`, `notes`, `reference_interne`.

**Doublon structurel non résolu** : `societe` **et** `raison_sociale` cohabitent dans `clients`. `raison_sociale` n'est jamais écrite. Sur `entreprises`, la paire `nom` / `raison_sociale` est en revanche utilisée et distinguée à l'impression (`DocumentImprimable.tsx:130` : la raison sociale ne s'affiche que si elle diffère du nom). Le modèle client a hérité de la colonne sans hériter de la sémantique. **C'est le doublon à trancher : `societe` = nom commercial, `raison_sociale` = dénomination légale.**

**Manquants pour un professionnel** (À AJOUTER) :
`siren`, `numero_tva` (TVA intracommunautaire), `code_ape` / `code_naf`, `rcs`, `forme_juridique`, `capital_social`.

Précédents existants dans le dépôt à réutiliser plutôt qu'à réinventer :
- `entreprises.forme_juridique` (`…add column if not exists forme_juridique text`) ;
- `fournisseurs.numero_tva` (`…0111_sous_traitants.sql:6`).

Aucune colonne `code_ape`, `code_naf`, `siren` ou `rcs` n'existe **nulle part** dans les 263 migrations — vérifié.

**Manquants pour tous** : `pays`, `complement_adresse`, `civilite`, `adresse_facturation_distincte` (booléen), et l'ensemble du bloc facturation autonome (§5).

### 4.3 Dépendances métier et contraintes DB

- `delai_paiement_jours` (CHECK 0–365) alimente l'échéancier et les relances automatiques (`…0230_relances_auto_v1.sql`) ; il s'applique indifféremment aux particuliers.
- `relance_auto_exclue` exclut le client des relances.
- `siret` est **imprimé sur la facture** (`DocumentImprimable.tsx:154`) sans aucune validation de format ni de cohérence avec `type`. Un particulier avec un SIRET saisi par erreur voit ce SIRET sur sa facture.
- `type` **n'est contraint par rien d'autre** : il n'existe aucun CHECK du genre « si `type='professionnel'` alors `societe` NOT NULL ».

---

## 5. Adresse principale — stockage réel

**Embarquée dans `clients`, non normalisée, sur trois colonnes seulement.**

| Concept | Colonne réelle | Existe ? |
|---|---|---|
| adresse (rue) | `clients.adresse_facturation` | oui |
| complément | — | **non** |
| code postal | `clients.code_postal` | oui, `text`, non contraint |
| ville | `clients.ville` | oui |
| pays | — | **non** |

Le nom de la colonne est trompeur : `adresse_facturation` est en réalité **l'unique adresse du client**, utilisée à la fois comme adresse principale et comme adresse de facturation. Le formulaire l'étiquette « Adresse de facturation » ; la fiche client l'étiquette « Adresse » (`src/app/(app)/clients/[id]/page.tsx:69`). La même colonne porte deux sémantiques selon l'écran.

Elle n'est **pas** dupliquée dans les documents : `devis` et `factures` ne portent aucune colonne d'adresse (§8).

`latitude`/`longitude` existent sur `clients` mais ne sont jamais renseignées ; la géolocalisation réellement exploitée est celle de `chantiers` (`…0137`).

---

## 6. Facturation

**Il n'existe aucune adresse de facturation distincte.** Une seule adresse par client, portant le nom de `adresse_facturation`.

Contrat cible à définir (à ajouter, pas présent) :

```
facturation_identique_adresse_principale : boolean NOT NULL DEFAULT true
```

- `true`  → le bloc facturation est dérivé de l'adresse principale, jamais stocké en double ;
- `false` → un bloc facturation autonome est renseigné et fait foi.

Cette logique doit être disponible **pour les deux types**. Un particulier peut légitimement faire adresser sa facture ailleurs (tutelle, assurance, bailleur, syndic pour compte de). Rien dans le modèle actuel ne l'empêche techniquement — parce que rien ne l'exprime.

Contrainte DB recommandée (différée) :
```
CHECK (facturation_identique_adresse_principale
       OR facturation_adresse IS NOT NULL)
```

---

## 7. Chantier

**L'adresse chantier appartient déjà au chantier.** C'est le seul point du contrat cible qui est correct dans le canon actuel.

`chantiers.adresse` / `code_postal` / `ville` sont des colonnes propres au chantier, renseignées à la création (`src/app/actions/chantiers.ts:45`, `:134`) puis **indépendantes du client**. Un client peut avoir N chantiers avec N adresses. Modifier l'adresse d'un chantier ne touche pas la fiche client, et inversement.

Le seul couplage est une **suggestion de saisie**, explicitement documentée dans le code (`chantiers.ts:331-334`) : à la création d'un chantier depuis un devis accepté, l'adresse proposée vient (1) du chantier déjà lié au devis, (2) sinon de `clients.adresse_chantier_defaut`, (3) sinon vide. La valeur est **copiée**, pas référencée. Comportement conforme au contrat.

Deux réserves :
1. `clients.adresse_chantier_defaut` est lue mais **n'a aucun chemin d'écriture** — la branche (2) est donc morte en pratique.
2. La suggestion emprunte `code_postal`/`ville` à `clients` (`chantiers.ts:352-354`) alors que l'adresse vient de `adresse_chantier_defaut` : si les deux divergent, la suggestion est incohérente. Bug latent, sans effet aujourd'hui puisque la colonne est toujours nulle.

`chantier_transferts` trace correctement le changement de client d'un chantier (`ancien_client_id`, `nouveau_client_id`, `utilisateur_id`, `date`).

---

## 8. Snapshots documentaires — POINT CRITIQUE

### 8.1 Ce qui est snapshoté

**Uniquement l'identité de l'entreprise émettrice, et uniquement sur les factures.**

`20260812000200_documents_commerciaux_p9.sql:17-20` ajoute `factures.entreprise_snapshot jsonb`. Rempli une seule fois, au passage `brouillon` → émis (`src/app/actions/factures.ts:101-108`), jamais réécrit. La lecture est correcte (`src/lib/documents-commerciaux.ts:144-146`) : une facture émise conserve à vie l'entreprise telle qu'elle était.

Le commentaire de migration est explicite et le travail a été fait proprement — **pour l'émetteur**.

### 8.2 Ce qui n'est PAS snapshoté

**L'identité et l'adresse du client. Nulle part. Sur aucun document.**

`src/lib/documents-commerciaux.ts:120` :
```
client:clients!factures_client_id_fkey(nom,prenom,societe,email,
        adresse_facturation,code_postal,ville,siret)
```

Le bloc « Facturé à » du PDF (`src/components/DocumentImprimable.tsx:149-155`) est construit **à chaque rendu** depuis la ligne `clients` courante : nom affiché, adresse, code postal, ville, SIRET.

Réponse à la question A/B du brief : **A — relecture dynamique intégrale, pour le client.**

Conséquences vérifiées :

1. **Une facture émise change rétroactivement.** Corriger une faute de frappe dans le nom d'un client, déménager un client, saisir enfin son SIRET → toutes ses factures des années précédentes changent de contenu. `numero`, `date_emission` et les montants sont figés ; le destinataire ne l'est pas.
2. **Le lien de partage externe propage la mutation.** `acces_externes_documents` (mig 200) donne au client un accès par token à sa facture. La page (`src/app/document/[token]/page.tsx`) passe par le même chargeur. Le PDF que le client a reçu et le PDF que le lien lui sert aujourd'hui peuvent différer.
3. **La signature électronique n'attrape pas la mutation.** `signatures_documents.document_sha256` (`…0102_signatures_documents_metier.sql:17`) est calculé sur `serialiserDocumentStable(documentCharge)`, où `documentCharge` = la ligne `devis`/`factures` + ses lignes (`src/app/actions/signatures-documents.ts:19-50`, `:104-105`). **La jointure client n'y entre pas.** On peut donc modifier le destinataire imprimé sur un document signé sans invalider l'empreinte qui atteste ce document. L'empreinte affichée sur le PDF (`DocumentImprimable.tsx:239`) ne couvre pas ce que le PDF montre.
4. **Le devis n'a même pas de snapshot d'entreprise.** `entreprise_snapshot` n'existe que sur `factures`. Un devis accepté (donc contractuel, `…0210_verrou_devis_accepte.sql`) affiche l'entreprise **et** le client courants.
5. **`ON DELETE RESTRICT` protège l'existence, pas le contenu.** `devis.client_id` et `factures.client_id` sont en RESTRICT : on ne peut pas supprimer un client facturé. Mais on peut le réécrire entièrement.

### 8.3 Verdict

C'est le **P0 principal de cet audit**. Une facture est une pièce comptable dont le destinataire est un élément obligatoire (art. 242 nonies A de l'annexe II au CGI ; art. L441-9 du code de commerce). Un système dont le destinataire imprimé est recalculé à chaque affichage ne produit pas de pièce comptable stable. Le travail déjà fait sur `entreprise_snapshot` prouve que le principe est compris et que le patron d'implémentation existe — il n'a simplement pas été appliqué au client.

---

## 9. Risques historiques

| # | Risque | Gravité | Réalité |
|---|---|---|---|
| R1 | Facture émise dont le destinataire change rétroactivement | **P0** | avéré, §8 |
| R2 | Devis accepté dont l'émetteur **et** le destinataire changent | **P0** | avéré (`entreprise_snapshot` absent de `devis`) |
| R3 | Empreinte de signature ne couvrant pas le bloc destinataire | **P0** | avéré, §8.2 (3) |
| R4 | Lien externe servant un document muté après envoi | **P1** | avéré, §8.2 (2) |
| R5 | SIRET imprimé sans validation ni cohérence avec `type` | **P1** | avéré |
| R6 | `document_sha256` inclut `updated_at` du document, qui bouge à chaque `recalc_totaux_*` | **P2** | dérive d'empreinte dans l'autre sens ; hors périmètre client mais à traiter avec R3 |
| R7 | `contacts_clients` gelée : les contacts secondaires sont perdus fonctionnellement | **P1** | avéré, §2.3 |
| R8 | Aucune trace d'historique de la fiche client (pas de table d'audit sur `clients`) | **P1** | vérifié : aucune |

R1–R4 sont des risques **juridiques et probatoires**, pas des bugs d'affichage. Ils doivent être fermés avant commercialisation, ou assumés explicitement par écrit.

---

## 10. Recherche actuelle

### 10.1 Chaîne complète

**Frontend** : `src/app/(app)/clients/page.tsx:55` — un `<input name="q">` unique, placeholder « Référence, nom ou ville », soumis en `GET`, sans debounce ni autocomplétion. Filtres additionnels `type` et `statut`. Pagination serveur à 25.

**RPC** : `public.clients_liste_paginee(p_entreprise_id uuid, p_recherche text, p_type text, p_statut text, p_page integer, p_taille integer)` — `20260719000121_pagination_liste_clients.sql`. `SECURITY DEFINER STABLE`, `search_path = public`, garde d'entrée `a_permission(p_entreprise_id,'acces_clients')`, `revoke … from public, anon` + `grant … to authenticated`. Privilège `service_role` révoqué au ledger 255.

**SQL** : un seul terme, cinq `ILIKE '%terme%'` en `OR` :
```sql
c.reference_interne ilike '%'||v_recherche||'%'
or c.nom      ilike '%'||v_recherche||'%'
or c.prenom   ilike '%'||v_recherche||'%'
or c.societe  ilike '%'||v_recherche||'%'
or c.ville    ilike '%'||v_recherche||'%'
```
Tri fixe `created_at desc`, comptage `count(*) over ()`.

**Index** : `clients_entreprise_created_idx (entreprise_id, created_at desc)`, `clients_entreprise_idx (entreprise_id)`, `clients_id_entreprise_unique (id, entreprise_id)`. **Aucun index n'accélère la recherche** : un `ILIKE '%…%'` non ancré ne peut utiliser un B-tree.

**Trigram** : `pg_trgm` **est installé** — `20260828000247_colors_integrity_v11.sql:4` : `create extension if not exists pg_trgm with schema extensions;`. Aucun index trigram n'existe sur `clients`.

**Full-text** : aucun sur `clients`. Un précédent utilisable existe sur Colors : `colors_seaux_recherche_idx`, GIN sur `to_tsvector('simple', …)` de sept colonnes concaténées (`…0246:131-135`).

**Normalisation** : aucune côté serveur. `ILIKE` gère la casse ASCII ; il ne gère **ni les accents, ni les espaces multiples, ni les tirets, ni les formats de téléphone**. `« Muller »` ne trouve pas `« Müller »`, `« ST DENIS »` ne trouve pas `« Saint-Denis »`.

### 10.2 Critères réellement supportés aujourd'hui

| Critère | Supporté ? |
|---|---|
| référence interne (`CLI-0001`) | ✅ |
| nom | ✅ |
| prénom | ✅ |
| société | ✅ |
| ville | ✅ |
| **email** | ❌ |
| **téléphone** | ❌ |
| **adresse** | ❌ |
| **code postal** | ❌ |
| **SIRET** | ❌ |
| **contacts** | ❌ (table gelée) |
| **multi-termes** | ❌ (`MARTIN STRASBOURG` → 0 résultat) |
| **accents / casse étendue** | ❌ |

Sept des critères de la barre unique demandée sont hors de portée du moteur actuel. Le placeholder de l'input est honnête : il annonce exactement les trois familles qui marchent.

### 10.3 Autres chemins d'accès aux clients — dette de performance

Neuf écrans chargent **la totalité** des clients de l'entreprise, sans pagination ni limite, pour peupler un `<select>` :

| Fichier | Requête |
|---|---|
| `src/app/(app)/devis/nouveau/page.tsx:19-23` | `select id,nom,prenom,societe` — **aucun `.limit()`** |
| `src/app/(app)/devis/[id]/modifier/page.tsx:19` | idem |
| `src/app/(app)/factures/[id]/modifier/page.tsx:15` | idem |
| `src/app/(app)/chantiers/nouveau/page.tsx:22` | idem |
| `src/app/(app)/crm/page.tsx:16` | idem + `neq statut inactif` |
| `src/app/(app)/appels-offres/page.tsx:16` | idem + `eq statut actif` |
| `src/app/(app)/interventions/page.tsx:14` | idem + `eq statut actif` |
| `src/lib/ai/copilote.ts:33` | `limit(300)` — plafond silencieux |
| `src/app/actions/import.ts:189` | **tous** les clients chargés en mémoire pour dédoublonner un import |

À 10 000 clients, chacun de ces écrans devient une liste déroulante de 10 000 `<option>` dans le HTML rendu par le serveur. C'est un P1 de performance **indépendant** de la barre de recherche, et il doit être traité dans le même lot que le sélecteur client (§28-D).

---

## 11. Architecture de recherche universelle — contrat cible

### 11.1 Principe

Une barre unique, un seul appel, une seule RPC, tenant-bornée, index-friendly, sur les champs **réellement existants** après la migration d'enrichissement.

### 11.2 Champs du contrat

| Champ | État aujourd'hui | Dans le contrat de recherche |
|---|---|---|
| nom | existe | oui |
| prénom | existe | oui |
| raison sociale | colonne existe, **morte** | oui — **À RÉHABILITER** |
| nom commercial (`societe`) | existe | oui |
| email | existe | oui — **À AJOUTER au moteur** |
| téléphone | existe | oui — **À AJOUTER au moteur** (sur forme normalisée) |
| adresse | existe (`adresse_facturation`) | oui — **À AJOUTER au moteur** |
| code postal | existe | oui — **À AJOUTER au moteur** |
| ville | existe | oui |
| SIREN | — | **À AJOUTER (colonne)** |
| SIRET | existe | oui — **À AJOUTER au moteur** |
| TVA intracom. | — | **À AJOUTER (colonne)** |
| APE / NAF | — | **À AJOUTER (colonne)** |
| référence client | existe | oui |
| contacts | table gelée | **À AJOUTER (dégel + grants)** — phase 2 |
| adresse de facturation distincte | — | **À AJOUTER (colonnes)** — phase 2 |
| adresse chantier | existe sur `chantiers` | **hors périmètre de la recherche client** — voir §11.4 |

### 11.3 Forme technique

Une colonne générée matérialisant le document de recherche, plus un index GIN. Le patron est déjà éprouvé dans le dépôt (Colors, `…0246:131`) :

```
clients.recherche_document  -- text, GENERATED ALWAYS ... STORED
  = normaliser(reference_interne ‖ nom ‖ prenom ‖ societe ‖ raison_sociale
             ‖ email ‖ telephone_normalise ‖ adresse_facturation
             ‖ code_postal ‖ ville ‖ siren ‖ siret ‖ numero_tva ‖ code_ape)
```

Deux index complémentaires, chacun pour un usage distinct :
- **GIN `gin_trgm_ops`** sur `recherche_document` → sous-chaîne, faute de frappe, fragment de numéro. C'est l'index de la barre unique.
- **GIN `to_tsvector('simple', recherche_document)`** → si l'on veut la logique AND multi-termes native de `websearch_to_tsquery`.

Recommandation : **trigram seul en V1**. Il couvre la sous-chaîne (indispensable pour « cherche `4332` dans un SIRET ») que le FTS ne couvre pas, et le AND multi-termes se fait alors par conjonction de `LIKE` sur la colonne normalisée (§13.3).

Contrainte technique à respecter : une colonne `GENERATED ALWAYS AS … STORED` n'accepte que des expressions **IMMUTABLE**. `unaccent()` est `STABLE` par défaut : il faut soit un wrapper `IMMUTABLE` explicite, soit renoncer à `unaccent` au profit d'une translittération par `translate()` (immutable par nature). **Deuxième option recommandée** — pas d'extension supplémentaire, pas de wrapper piégeux, comportement déterministe. `unaccent` n'est d'ailleurs installée nulle part dans le dépôt aujourd'hui.

### 11.4 Adresse chantier

**Hors du moteur de recherche client.** Une recherche client qui remonte des clients parce que l'un de leurs chantiers est à Strasbourg produit des faux positifs incompréhensibles (le client est à Colmar).

Contrat : une **recherche transverse** distincte, `recherche_globale(p_entreprise_id, p_terme)`, retournant des résultats **typés** (`client` | `chantier` | `devis` | `facture`), chacun avec son propre document de recherche. La barre unique de l'application appelle celle-ci ; la barre de la page `/clients` appelle la recherche client. Deux surfaces, deux contrats, aucun mélange de sémantique.

---

## 12. Normalisation

Fonction unique, `IMMUTABLE`, appliquée **symétriquement** à l'indexation et à la requête. Une asymétrie ici et l'index ne sert plus à rien.

| Dimension | Règle |
|---|---|
| casse | `lower()` |
| accents | translittération explicite `translate('àâäáãåçèéêëìíîïñòóôöõùúûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa')` + `œ→oe`, `æ→ae`. Pas d'`unaccent` (non IMMUTABLE, non installée). |
| espaces | `regexp_replace(…, '\s+', ' ', 'g')` puis `btrim` |
| tirets / ponctuation | `'` `-` `.` `,` `/` → espace (`SAINT-DENIS` ≡ `SAINT DENIS`, `L'HÔPITAL` ≡ `L HOPITAL`) |
| téléphone | colonne dérivée `telephone_normalise` : chiffres seuls, `+33`/`0033` → `0`. `06 12 34 56 78`, `+33 6 12 34 56 78`, `06.12.34.56.78` → `0612345678`. La colonne saisie reste intacte. |
| SIREN / SIRET | chiffres seuls dans le document de recherche ; **validation Luhn à la saisie**, pas au moment de la recherche |
| TVA | majuscules, espaces retirés ; `FR` + clé + SIREN |
| APE / NAF | majuscules, point retiré → `4332A`. Le terme utilisateur `43.32A` est normalisé pareillement, donc il matche. |

**Pas de fuzzy agressif.** Concrètement : `%` de similarité trigram non utilisé comme critère de sélection en V1. Le trigram sert d'**index d'accélération** pour un `LIKE '%…%'` exact sur la forme normalisée, pas de moteur de ressemblance. Un opérateur BTP qui tape `DUPOND` ne doit pas se voir proposer `DUPONT` sans le savoir — sur une facture, la confusion coûte cher. Le tri par `similarity()` reste possible **plus tard**, en second rang, une fois que les correspondances exactes sont épuisées.

---

## 13. Multi-termes

### 13.1 Sémantique retenue

Découpe du terme saisi sur les espaces après normalisation → N tokens. **AND entre les tokens, OR entre les champs** (implicite, puisque tous les champs sont concaténés dans un document unique).

- `MARTIN STRASBOURG` → clients dont le document contient `martin` **et** `strasbourg`
- `DUPONT 67100` → `dupont` **et** `67100`
- `43.32A STRASBOURG` → `4332a` **et** `strasbourg`

### 13.2 Garde-fous

- tokens plafonnés à **6** (au-delà, on ignore le surplus : une requête à 30 tokens est une erreur de collage, pas une intention) ;
- tokens de **1 caractère ignorés** (bruit pur, et sous le seuil trigram de 3 caractères) ;
- tokens de 2 caractères conservés mais **sans bénéfice d'index** — accepté, ils sont rares et toujours accompagnés d'un token plus long dans la pratique ;
- terme vide → comportement de liste, pas de recherche.

### 13.3 Forme SQL

```sql
where c.entreprise_id = p_entreprise_id
  and c.recherche_document like all (v_motifs)   -- v_motifs = array['%martin%','%strasbourg%']
```

`LIKE ALL(array)` sur une colonne couverte par un index GIN `gin_trgm_ops` : le planner utilise l'index pour chaque motif ≥ 3 caractères. C'est la forme la plus simple qui reste indexable, et elle n'introduit aucune dépendance.

---

## 14. Performance — seuils

Aucune mesure sur données réelles n'a été faite : cet audit n'ouvre aucune connexion Supabase. Les seuils ci-dessous sont des **ordres de grandeur d'architecture**, pas des mesures.

| Volume | Recherche | Sélecteurs (`<select>`) | Verdict |
|---|---|---|---|
| 100 | `ILIKE` séquentiel : imperceptible | 100 `<option>` : acceptable | l'existant tient |
| 1 000 | seq scan 1 000 lignes/frappe : perceptible mais tolérable | 1 000 `<option>` : lourd, ~60 ko de HTML | **limite haute de l'existant** |
| 10 000 | seq scan à chaque requête, sur chaque page : inacceptable | 10 000 `<option>` : ~600 ko de HTML par écran, plusieurs secondes | **rupture** |
| 50 000 | inexploitable | inexploitable | — |

**Décision d'architecture :**

- **Le filtrage navigateur n'est jamais retenu pour Gestion Pro.** Il impliquerait de transférer l'annuaire client complet au navigateur — inacceptable pour du RGPD sur données de tiers, et déjà écarté de fait par l'architecture RPC paginée existante.
- **Recherche serveur indexée dès le premier client.** L'index coûte quelques dizaines de ko à 100 clients ; il évite une seconde migration à 5 000.
- Exception assumée : **Tools**, dont les projets sont locaux à l'appareil et peu nombreux, filtre légitimement en mémoire (`ProjectsWorkspace.tsx:35`, avec `toLocaleLowerCase("fr")`). Ce choix reste valide et ne doit pas être aligné sur GP.

**Point de rupture prioritaire** : ce ne sont pas les 5 `ILIKE` de la RPC, ce sont les **neuf `<select>` non bornés** du §10.3. Ils cassent avant la recherche.

---

## 15. Multi-tenant — démonstration

### 15.1 Chaîne de confinement

Trois couches indépendantes, toutes vérifiées dans les migrations :

**(a) RLS permissive** — `…0004:176` :
```sql
create policy "membres accèdent aux clients" on public.clients
  for all using (public.est_membre_actif(entreprise_id))
       with check (public.est_membre_actif(entreprise_id));
```

**(b) RLS restrictive de lecture** — `…0113_lecture_modules_selon_permissions.sql:6-8` :
```sql
create policy lecture_clients_selon_permission on public.clients
  as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_clients'));
```
Une policy RESTRICTIVE doit être satisfaite **même si** une policy permissive plus large existe. C'est la défense en profondeur, et le commentaire de migration le dit explicitement.

**(c) Garde de la RPC** — la RPC est `SECURITY DEFINER` : elle contourne la RLS. Son confinement repose donc entièrement sur sa garde d'entrée. `…0121:25` :
```sql
if not public.a_permission(p_entreprise_id, 'acces_clients') then
  raise exception 'Accès refusé';
end if;
```

### 15.2 Pourquoi `p_entreprise_id` ne peut pas être forgé

`a_permission` (dernière définition : `…0110_pointage_individuel_comptes.sql:59-88`) est `SECURITY DEFINER STABLE`, `search_path = public`, et exige simultanément :
```sql
ue.utilisateur_id = auth.uid()
and ue.entreprise_id = p_entreprise_id
and ue.statut = 'actif'
and public.est_membre_actif(p_entreprise_id)
and <permission accordée par le poste>
```

`auth.uid()` provient du JWT et n'est pas un paramètre. Un appelant qui passe l'UUID d'une entreprise dont il n'est pas membre actif ne satisfait pas `ue.entreprise_id = p_entreprise_id` : `a_permission` renvoie `false`, la RPC lève `Accès refusé`, **avant** toute lecture. Aucune ligne d'un autre locataire n'est lue, donc **aucun nom, email, SIRET ou adresse d'un autre locataire ne peut être révélé** — ni en résultat, ni en total, ni par oracle temporel (le refus est levé avant le `select`).

Le `count(*) over ()` est calculé à l'intérieur de la sous-requête déjà filtrée par `c.entreprise_id = p_entreprise_id` : le total ne fuit pas non plus.

### 15.3 Renforcements structurels

- `unique (id, entreprise_id)` sur `clients` (`…0096:132`) permet les FK **composites** `devis_client_entreprise_fkey` (`…0198`) et `factures_client_entreprise_fkey` (`…0197:44-48`) : la base **interdit** qu'un devis de l'entreprise A référence un client de l'entreprise B. Ce n'est pas une convention applicative, c'est une contrainte.
- `…0255_acl_reconciliation_v1.sql` révoque `SELECT/INSERT/UPDATE/DELETE` sur `public.clients` pour `service_role` (lignes 543-546) : le rôle qui contourne la RLS n'a plus accès direct à la table.

### 15.4 Réserve documentée

`a_permission` commence par `public.est_acces_support_actif(p_entreprise_id) or …`. L'accès support plateforme, borné dans le temps et journalisé (`plateforme_entrer_entreprise`, `…0075`), ouvre légitimement le périmètre. Ce n'est pas une faille — c'est une capacité produit assumée qui doit rester dans le contrat et dans les tests (§29).

### 15.5 Couverture de test existante

`supabase/tests/isolation_multitenant_comportement.test.sql` couvre déjà, en pgTAP, l'isolation de `clients` **au niveau table** : admin A ne voit que A (l. 11-12), ouvrier A sans droit ne voit rien (l. 36), insertion croisée refusée (l. 29, l. 64), admin plateforme ne voit rien par défaut (l. 91).

**Gap** : aucun test ne couvre l'isolation **au niveau de la RPC** `clients_liste_paginee`, qui est justement le chemin `SECURITY DEFINER` où la RLS ne s'applique pas. C'est le test le plus important à écrire (§29).

### 15.6 Verdict multi-tenant

**Le confinement est prouvé par construction pour le modèle actuel, et le patron reste valide pour la recherche universelle**, à une condition non négociable : toute nouvelle RPC de recherche doit reproduire **exactement** la garde `a_permission(p_entreprise_id, 'acces_clients')` en première instruction, avant toute lecture. C'est le seul point où une régression serait à la fois facile à introduire et invisible en test fonctionnel.

---

## 16. Contrat `ElsatiaClientV1`

Contrat **applicatif versionné**, pas un schéma de table. Il décrit ce qu'une application ELSATIA peut recevoir ou publier comme dossier client complet.

```
ElsatiaClientV1
  version                : "client.v1"
  id                     : uuid
  entreprise_id          : uuid              -- tenant, toujours présent
  reference              : string | null     -- reference_interne, ex. "CLI-0001"

  categorie              : "particulier" | "professionnel"      -- NOUVEAU, dérivé
  type_detail            : "particulier" | "professionnel"
                         | "collectivite" | "syndic" | "promoteur"   -- clients.type

  identite:
    civilite             : string | null                        -- À AJOUTER
    nom                  : string | null
    prenom               : string | null
    nom_commercial       : string | null     -- clients.societe
    raison_sociale       : string | null     -- clients.raison_sociale (à réhabiliter)
    nom_affiche          : string            -- calculé, jamais stocké

  coordonnees:
    email                : string | null
    telephone            : string | null     -- forme saisie
    telephone_e164       : string | null     -- dérivé            -- À AJOUTER

  adresse_principale     : ElsatiaAddressV1 | null
  facturation:
    identique_principale : boolean           -- défaut true       -- À AJOUTER
    adresse              : ElsatiaAddressV1 | null                -- À AJOUTER

  informations_pro:                          -- null si categorie = particulier
    siren                : string | null                          -- À AJOUTER
    siret                : string | null
    numero_tva           : string | null                          -- À AJOUTER
    code_ape             : string | null                          -- À AJOUTER
    rcs                  : string | null                          -- À AJOUTER
    forme_juridique      : string | null                          -- À AJOUTER

  commercial:
    statut               : "prospect" | "actif" | "inactif"
    conditions_paiement  : string | null
    delai_paiement_jours : integer           -- 0..365
    relance_auto_exclue  : boolean

  contacts               : ElsatiaContactV1[]   -- vide tant que la table est gelée
  notes                  : string | null
  created_at / updated_at: iso8601
```

**Règles du contrat**
1. `categorie` est **dérivée** de `type_detail` (`particulier` → particulier ; les quatre autres → professionnel). Une seule source de vérité, aucune colonne redondante.
2. `nom_affiche` est **calculé, jamais persisté** — sinon il devient une quatrième source de vérité à resynchroniser.
3. `informations_pro` est `null`, pas un objet vide, pour un particulier. La distinction porte du sens.
4. **Aucun consommateur ne persiste ce contrat.** Il se lit et se jette. Ce qui se persiste chez un tiers, c'est `ElsatiaClientRefV1`.

---

## 17. Contrat `ElsatiaClientRefV1`

C'est le contrat **qui compte** pour l'écosystème. Il doit rester léger : la plupart des applications n'ont besoin que d'un libellé et d'un identifiant.

```
ElsatiaClientRefV1
  version        : "client_ref.v1"
  source_app     : "gestion_pro"          -- l'application qui fait autorité
  entreprise_id  : uuid                   -- tenant, obligatoire
  client_id      : uuid | null            -- null = client non rattaché (mode standalone)
  reference      : string | null          -- "CLI-0042", lisible par un humain
  libelle        : string                 -- nom_affiche figé au moment de la liaison
  sync_status    : "not_linked" | "linked" | "desynchronized"
  synchronized_at: iso8601 | null
```

**Règles**
1. **Aucune clé étrangère inter-applications.** La liaison est faible et vérifiée à l'usage.
2. **Un `ClientRefV1` entièrement nul est valide.** C'est le test d'acceptation du mode standalone : une application dont aucun projet n'est rattaché à un client est pleinement fonctionnelle.
3. `libelle` est un **cache d'affichage figé**, pas une vérité. Il permet d'afficher « Dupont » sans appeler GP. Il ne doit jamais servir à imprimer un document contractuel.
4. Le sens du flux est **toujours** application → GP pour l'enrichissement, et GP → application pour la résolution. Jamais une application tierce ne réécrit un client GP.

Ce contrat n'est pas inventé pour cet audit : il **existe déjà**, sous le nom `ExternalReference`, dans `packages/drone-core/src/common.ts` (branche `feat/drone-core-contracts-v1`), avec `source_app`, `external_reference`, `sync_status`, `synchronized_at`, la constante `EXTERNAL_REFERENCE_NON_LIE` et la fonction pure `appliquerResultatPublication`. **`ElsatiaClientRefV1` doit être la généralisation de ce contrat, pas un concurrent.** Le travail de Drone est le bon point de départ ; il lui manque `entreprise_id` typé côté liaison et `libelle`.

---

## 18. Contrats d'adresse

```
ElsatiaAddressV1
  version     : "address.v1"
  ligne1      : string | null      -- rue                    (existe : adresse_facturation)
  ligne2      : string | null      -- complément             -- À AJOUTER
  code_postal : string | null      -- (existe, non contraint)
  ville       : string | null      -- (existe)
  pays        : string             -- ISO-3166-1 alpha-2, défaut "FR"   -- À AJOUTER
  latitude    : number | null      -- (colonne existe sur clients, morte)
  longitude   : number | null      -- (idem)
```

`ElsatiaBillingAddressV1` et `ElsatiaSiteAddressV1` **ne sont pas des types distincts** — ce sont des **rôles** portés par le contexte :

```
ElsatiaBillingAddressV1 = { identique_principale: boolean,
                            adresse: ElsatiaAddressV1 | null }
   -- invariant : identique_principale = false  ⇒  adresse ≠ null

ElsatiaSiteAddressV1    = ElsatiaAddressV1
   -- appartient au chantier/projet, jamais au client
```

Justification : trois types structurellement identiques multiplieraient les convertisseurs sans rien garantir de plus. Ce qui doit être typé, c'est **le rôle et l'invariant**, pas la forme.

`ElsatiaContactV1` (phase 2, après dégel de `contacts_clients`) :
```
ElsatiaContactV1 : { id, nom, fonction | null, email | null,
                     telephone | null, principal: boolean }
```

---

## 19. Gestion Pro — source de vérité

**GP est et reste la source de vérité du dossier client de l'écosystème.** C'est la seule application qui en possède un, la seule qui émette des documents contractuels au nom du client, et la seule dont le modèle est contraint par le droit commercial.

| Doit devenir canonique (partagé) | Doit rester propre à GP (métier) |
|---|---|
| identité (nom, prénom, raison sociale, nom commercial) | `conditions_paiement`, `delai_paiement_jours` |
| catégorie particulier / professionnel | `relance_auto_exclue` |
| coordonnées (email, téléphone) | `statut` commercial (prospect/actif/inactif) |
| adresse principale | `notes` internes |
| bloc facturation | rattachement `devis` / `factures` / `chantiers` |
| identifiants légaux (SIREN, SIRET, TVA, APE, RCS) | numérotation `reference_interne` (`CLI-xxxx`) |
| `reference_interne` **en lecture** | tarification, remises, encours |

Règle de propriété : **une application tierce ne modifie jamais un client GP.** Elle peut le référencer (`ClientRefV1`), proposer une création (flux entrant validé par un humain dans GP), ou fonctionner sans client. Elle n'écrit pas.

---

## 20. Réserves

**État réel** : Réserves n'a **aucun dossier client**. Vérifié sur `feat/reserves-v3-collaboration-livrables`.

Son modèle est bâti sur `reserves_chantiers` :
```
entreprise_id  uuid NOT NULL → entreprises(id)
nom, reference, adresse, code_postal (CHECK '^[0-9A-Za-z -]{2,12}$'), ville
source         text CHECK ('reserves','gestion_pro')
chantier_gp_id uuid → public.chantiers(id) ON DELETE SET NULL
CHECK ((source = 'gestion_pro') = (chantier_gp_id is not null))
```

Ce que Réserves modélise, ce sont des **intervenants** (`reserves_intervenants` : entreprises du chantier, avec `entreprise_intervenante_id` facultatif vers un vrai tenant) — c'est-à-dire des entreprises exécutantes, **pas** des clients. Ne pas confondre les deux : ce serait la pire erreur de convergence possible.

**Point d'attention** : `chantier_gp_id` est une **vraie clé étrangère** vers `public.chantiers`, pas une référence faible. Le commentaire de migration l'assume explicitement (« confort d'intégrité, pas une dépendance produit »), et c'est jouable ici puisque les deux tables vivent dans le même schéma Postgres. Mais cela contredit la règle « aucune FK inter-applications » que Drone s'est donnée. **Il faut trancher cette règle une fois pour l'écosystème** — sinon Drone et Réserves appliqueront deux doctrines opposées à la même situation.

Position recommandée : **FK autorisée dans le schéma partagé (Réserves, Colors), référence faible obligatoire dès qu'on franchit une frontière de déploiement (Drone, Tools)**. Cette règle est cohérente avec les deux implémentations existantes et n'oblige à en refaire aucune.

**Contrat cible Réserves**
- **standalone** : `reserves_chantiers` inchangé, `chantier_gp_id` nul, aucun client. Fonctionnellement complet. C'est le mode nominal.
- **connecté** : ajout d'un `ElsatiaClientRefV1` **facultatif** sur `reserves_chantiers`, alimenté depuis le chantier GP lié. Sert à afficher « pour le compte de Dupont » sur un PV. Non requis pour émettre une réserve.

**Aucune branche Réserves n'a été modifiée.** Aucune colonne n'est ajoutée dans ce lot.

---

## 21. Drone

**État réel** : `DroneProject` (`packages/drone-core/src/project.ts`) porte deux champs plats :
```
readonly client_name : string | null
readonly address     : string | null
```
commentés « §12 — facultatifs : un projet standalone n'a pas nécessairement de client identifié ».

Plus le contrat `ExternalReference` (§17) qui est déjà exactement le `ClientRefV1` dont l'écosystème a besoin, appliqué au niveau projet.

**Ce qui est demandé de Drone** (rattacher un relevé à un client, à un chantier, envoyer à GP, préparer un devis) est **déjà couvert au niveau contrat** par `GestionProDronePort` (`ports/ecosystem.ts`) : `publishProjectSummary` et `publishSolarLayouts`. Aucune implémentation n'existe, ce qui est conforme au périmètre annoncé de ce lot Drone.

**Minimum client nécessaire côté Drone** :

| Besoin | Réponse |
|---|---|
| rattacher un relevé à un client | `ElsatiaClientRefV1` facultatif — **remplace** `client_name` |
| rattacher un chantier | `chantier_ref` (même forme, `source_app: "gestion_pro"`) |
| envoyer le relevé à GP | `DroneProjectSummaryV1` + `ClientRefV1` en en-tête |
| préparer un devis GP | `client_id` résolu **ou** proposition de création validée par un humain dans GP |

**Écart à corriger (contrat, pas code)** : `client_name: string` est un cache d'affichage sans identité. Il doit devenir le champ `libelle` de `ElsatiaClientRefV1`, ce qui ajoute `client_id` et `sync_status` sans rien retirer. `address: string | null` doit devenir `ElsatiaAddressV1` — c'est une adresse de site, pas une adresse client (§18).

**Drone n'est pas développé dans ce lot.** Aucun fichier de `packages/drone-core` n'a été modifié.

---

## 22. Tools

**Tools n'a pas de dossier client, et il ne doit pas en avoir.**

`public.tools_projects` (`…0236_elsatia_tools_r8_…:251`) :
- locataire = **`user_id uuid NOT NULL DEFAULT auth.uid() → auth.users(id)`** ;
- `organization_id uuid → entreprises(id) ON DELETE SET NULL`, **facultatif** ;
- `site_name text` — chantier en texte libre, plafonné à 100 caractères ;
- aucun `client_id`, aucune identité, aucune adresse.

La recherche projet est **côté navigateur** (`ProjectsWorkspace.tsx:35`), sur `name` + `siteName` + nom de l'outil, avec `toLocaleLowerCase("fr")`. Volumes locaux, choix pertinent, **à conserver tel quel**.

**Décision : ne rien créer.** Deux raisons, dont la seconde est bloquante :
1. le besoin n'existe pas — un calcul de trace ne s'adresse à personne ;
2. **le locataire de Tools est l'utilisateur, pas l'entreprise.** Introduire un client dans `tools_projects` créerait un objet à données personnelles de tiers dont le périmètre de sécurité serait `auth.users`, alors que celui du client GP est `entreprises`. Un utilisateur membre de deux entreprises verrait ses deux annuaires clients fusionner dans le même espace. **C'est une régression RGPD, pas une uniformisation.**

**Seul ajout envisageable, et seulement si un besoin réel émerge** : un `ElsatiaClientRefV1` facultatif sur `tools_projects`, en remplacement (ou en complément) de `site_name`, alimenté **uniquement** quand `organization_id` est non nul, avec la garantie que `ClientRefV1.entreprise_id = tools_projects.organization_id`. Sans ce dernier invariant, ne rien faire.

---

## 23. Colors

**Colors n'a pas de dossier client, et il ne doit pas en avoir.**

`colors_emplacements` porte un `type` incluant la valeur `'chantier'` (`…0246:9`), mais ce n'est qu'un **libellé de rangement** : un emplacement nommé « Chantier Martin » désigne l'endroit où sont les seaux, pas un tiers. `colors_seaux` ne référence aucun client, et il n'y a aucun besoin métier qui l'exigerait — Colors gère un stock interne de peinture.

**Décision : ne rien créer.** Créer une structure client dans Colors pour « uniformiser » ajouterait des données personnelles de tiers dans une application qui n'en traite aucune aujourd'hui — un recul RGPD net, sans contrepartie fonctionnelle.

**Ce que Colors apporte au contrat, en revanche** : son index `colors_seaux_recherche_idx` (GIN sur `to_tsvector('simple', <7 colonnes concaténées>)`, `…0246:131-135`) est **le précédent maison** de la recherche multi-champs indexée. La recherche client doit s'en inspirer, en substituant `gin_trgm_ops` à `to_tsvector` pour gagner la sous-chaîne (§11.3).

---

## 24. Impacts DB (différés — aucune migration dans ce lot)

### 24.1 Objets à créer / modifier

**`public.clients` — colonnes à ajouter**
| Colonne | Type | Motif |
|---|---|---|
| `siren` | text | §4.2, recherche |
| `numero_tva` | text | mention légale obligatoire ; précédent : `fournisseurs.numero_tva` |
| `code_ape` | text | recherche `43.32A` |
| `rcs` | text | mention légale |
| `forme_juridique` | text | précédent : `entreprises.forme_juridique` |
| `civilite` | text | UX |
| `complement_adresse` | text | `ElsatiaAddressV1.ligne2` |
| `pays` | text NOT NULL default `'FR'` | ISO-3166-1 alpha-2 |
| `facturation_identique_adresse_principale` | boolean NOT NULL default true | §6 |
| `facturation_ligne1/ligne2/code_postal/ville/pays` | text | bloc facturation autonome |
| `facturation_raison_sociale` | text | le payeur peut différer du client |
| `telephone_normalise` | text GENERATED STORED | §12 |
| `recherche_document` | text GENERATED STORED | §11.3 |

**`public.clients` — colonne à renommer (rupture, à séquencer)**
`adresse_facturation` → `adresse_ligne1`. Le nom actuel est mensonger et devient dangereux dès qu'un vrai bloc facturation existe. **Procédure obligatoire en trois temps** : (1) ajouter `adresse_ligne1` + backfill + double écriture ; (2) migrer les 9 lecteurs applicatifs ; (3) supprimer `adresse_facturation`. Jamais en une seule migration.

**`public.clients` — colonnes à trancher**
- `raison_sociale` : **réhabiliter** (exposer en UI, écrire, lire, indexer) ;
- `latitude` / `longitude` : réhabiliter **ou** supprimer. Ne pas laisser en l'état ;
- `adresse_chantier_defaut` : exposer en UI **ou** supprimer et retirer la branche morte de `chantiers.ts:351`.

**Snapshots documentaires — le lot P0**
| Table | Colonne | Contenu |
|---|---|---|
| `devis` | `entreprise_snapshot jsonb` | aligner sur `factures` |
| `devis` | `client_snapshot jsonb` | figé à l'émission (`brouillon` → `envoye`) |
| `factures` | `client_snapshot jsonb` | figé à l'émission (`brouillon` → émis) |

Même patron exact que `factures.entreprise_snapshot` : écrit **une seule fois**, jamais réécrit, lu en priorité sur la jointure vivante. Le code de référence existe (`src/app/actions/factures.ts:101-108`) et n'a qu'à être étendu.

Compléter par un **trigger de garde** interdisant la réécriture d'un `*_snapshot` non nul — la discipline applicative seule n'est pas une garantie pour une pièce comptable.

**Contacts** : dégeler `contacts_clients` (re-`GRANT` à `authenticated`) **ou** la supprimer. L'état actuel — table présente, policies présentes, trigger présent, grants révoqués — est le pire des trois.

### 24.2 Index à envisager (aucun créé dans ce lot)

| Index | Justification | Retenu ? |
|---|---|---|
| GIN `gin_trgm_ops` sur `clients.recherche_document` | seul index capable d'accélérer `LIKE '%…%'` multi-champs | **oui — V1** |
| GIN `to_tsvector('simple', recherche_document)` | AND multi-termes natif | non — redondant avec §13.3 |
| B-tree partiel `(entreprise_id, telephone_normalise)` | recherche par numéro exact | si mesure le justifie |
| B-tree `(entreprise_id, siret)` | recherche SIRET exact | **non** — couvert par le trigram, un index de plus à maintenir |
| `clients_entreprise_created_idx` | existe déjà, sert le tri par défaut | conserver |

`pg_trgm` est **déjà installée** dans le schéma `extensions` (`…0247:4`) : aucune extension nouvelle n'est requise. `unaccent` n'est pas installée et **ne doit pas l'être** (§12).

### 24.3 Risques des migrations différées

| Risque | Gravité | Atténuation |
|---|---|---|
| `GENERATED … STORED` non IMMUTABLE → migration qui échoue | haute | translittération `translate()`, jamais `unaccent()` |
| Réécriture complète de `clients` (2 colonnes générées) → `ACCESS EXCLUSIVE` | moyenne | volumes faibles aujourd'hui ; **fenêtre de maintenance** au-delà de ~50 k lignes |
| Backfill des snapshots sur documents historiques | **haute** | **NE PAS backfiller.** Un snapshot rétroactif fabriquerait une donnée qui n'a jamais été celle de l'émission. `snapshot IS NULL` = document antérieur au dispositif, et la lecture retombe sur la jointure vivante. Documenter la date de bascule. |
| Renommage `adresse_facturation` en une passe | **haute** | procédure en trois temps (§24.1) |
| Divergence `societe` / `raison_sociale` après réhabilitation | moyenne | trancher la sémantique **avant** la migration, pas après |
| Collision de ledger avec Réserves (268-270) | moyenne | numéroter **au-dessus** de la plus haute migration de toutes les branches actives, pas au-dessus de `main` |

### 24.4 Ordre post-cutover

```
n+1  colonnes identité pro (siren, numero_tva, code_ape, rcs, forme_juridique, civilite)
n+2  colonnes adresse (complement, pays) + bloc facturation + flag identique
n+3  client_snapshot sur devis + factures, entreprise_snapshot sur devis, trigger de garde   ← P0
n+4  telephone_normalise + recherche_document (colonnes générées)
n+5  index GIN trigram
n+6  RPC clients_recherche_v1 (multi-termes, tenant-bornée)
n+7  décision contacts_clients : dégel ou suppression
n+8  renommage adresse_facturation, phase 1/3
```

`n+3` est **indépendant** de `n+1` et `n+2` : il peut, et devrait, partir en premier. C'est un P0 juridique ; il ne doit pas attendre le confort de recherche.

---

## 25. Impacts UI

| Écran | Impact |
|---|---|
| `src/components/ClientForm.tsx` | refonte complète (§27) : sections, champs conditionnels au type, case facturation |
| `src/app/(app)/clients/page.tsx` | placeholder honnête, résultats montrant **pourquoi** ça matche (ville, email, SIRET) |
| `src/app/(app)/clients/[id]/page.tsx` | bloc facturation distinct ; libellé « Adresse » corrigé |
| `src/app/actions/clients.ts` | 3 actions à étendre (`creerClientAction`, `creerClientRapideAction`, `modifierClientAction`) |
| **9 écrans à `<select>` non borné** (§10.3) | remplacer par un **sélecteur client à recherche serveur** — composant unique, réutilisé partout |
| `src/lib/chantier-statuts.ts` | `nomClient()` doit préférer `raison_sociale` selon la catégorie |
| `src/lib/ai/copilote.ts:33` | `limit(300)` silencieux → recherche à la demande |
| `src/app/actions/import.ts:189` | dédoublonnage en mémoire → résolution serveur |

Le **sélecteur client à recherche serveur** est le livrable UI à plus fort levier : un composant, neuf écrans corrigés, et le point de rupture de performance du §14 fermé.

---

## 26. Impacts documents

### 26.1 Matrice document → adresse par défaut → snapshot

| Document | Table réelle | Adresse par défaut | Snapshot client obligatoire | Snapshot entreprise |
|---|---|---|---|---|
| **Devis** | `devis` | facturation (⇒ principale si `identique = true`) | **OUI — à l'émission** (`brouillon` → `envoye`) | **OUI — absent aujourd'hui** |
| **Devis accepté / avenant** | `devis` (`…0210`, `creer_avenant`) | héritée du devis d'origine | **OUI — hérité, jamais recalculé** | OUI |
| **Facture** (simple, acompte, situation, finale) | `factures` | **facturation** | **OUI — à l'émission** | déjà en place |
| **Avoir** | `factures` avec `type='avoir'` + `facture_origine_id` | facturation **de la facture d'origine** | **OUI — hérité de la facture d'origine, jamais du client courant** | déjà en place |
| **Document chantier** | `documents_chantier` | **chantier** | non (chantier autonome, §7) | selon usage |
| **PV / réserve** | `reserves_*` (hors ledger 265) | **chantier** | non | non |
| **Bon de commande fournisseur** | `commandes_fournisseurs` | adresse fournisseur / livraison | sans objet (pas de client) | selon usage |
| **Intervention / bon de livraison** | `interventions`, `bons_livraison` | **chantier** | non | selon usage |
| **DOE** | `doe_*` | **chantier** | non | selon usage |

### 26.2 Règles

1. **Émission = figement.** L'instant du figement est la transition `brouillon` → non-brouillon, exactement là où `factures.entreprise_snapshot` est déjà écrit et où `trg_devis_numero` / `trg_facture_numero` attribuent le numéro. Un seul instant, trois effets cohérents.
2. **Un avoir hérite de la facture d'origine.** Il rectifie une facture donnée, pas l'état actuel du client. Recalculer son destinataire depuis `clients` serait une faute comptable.
3. **Un brouillon reste vivant.** Il reflète le client courant — c'est le comportement souhaitable, et c'est déjà celui de `entreprise_snapshot`.
4. **Le chantier ne snapshote pas.** Son adresse lui appartient déjà (§7) ; elle est stable par construction.
5. **L'empreinte de signature doit couvrir le bloc destinataire.** `serialiserDocumentStable` doit inclure `client_snapshot`, sinon la signature atteste un document dont la moitié visible n'est pas couverte (§8.2 (3)).

---

## 27. Matrice des applications

| Application | Client complet | Client ref | Adresse principale | Facturation | Chantier | Recherche | Source de vérité |
|---|---|---|---|---|---|---|---|
| **Gestion Pro** | ✅ (à enrichir) | — | ✅ (à normaliser) | ⚠️ confondue avec la principale | ✅ propre au chantier | ⚠️ 5 champs, mono-terme | **GP** |
| **Réserves** | ❌ ni prévu | ⭘ facultatif, phase 2 | ❌ | ❌ | ✅ `reserves_chantiers` (+ FK `chantier_gp_id`) | interne aux réserves | GP si lié, sinon Réserves |
| **Drone** | ❌ ni prévu | ⭘ `ExternalReference` existe, à aligner | ⚠️ `address: string` plat | ❌ | ⚠️ via `ExternalReference` | sans objet | GP si lié, sinon Drone |
| **Tools** | ❌ **et ne doit pas** | ⭘ seulement si `organization_id` non nul | ❌ | ❌ | `site_name` texte libre | navigateur (correct) | — |
| **Colors** | ❌ **et ne doit pas** | ❌ | ❌ | ❌ | `emplacement.type='chantier'` (libellé) | GIN FTS (précédent utile) | — |

✅ existe et vivant · ⚠️ existe mais incomplet ou ambigu · ⭘ à ajouter, facultatif · ❌ absent

### UX cible de la fiche client V1

```
┌─ IDENTITÉ ──────────────────────────────────────────────┐
│ ( ) Particulier          (•) Professionnel               │
│ Civilité  Prénom  Nom                                    │
│ ── si professionnel ──                                   │
│ Raison sociale (dénomination légale)                     │
│ Nom commercial (si différent)                            │
└──────────────────────────────────────────────────────────┘
┌─ COORDONNÉES ───────────────────────────────────────────┐
│ Email          Téléphone                                 │
└──────────────────────────────────────────────────────────┘
┌─ ADRESSE PRINCIPALE ────────────────────────────────────┐
│ Adresse                                                  │
│ Complément                                               │
│ Code postal   Ville          Pays [France]               │
└──────────────────────────────────────────────────────────┘
┌─ FACTURATION ───────────────────────────────────────────┐
│ [✓] Identique à l'adresse principale                     │
│ ── décoché : bloc adresse autonome + raison sociale ──   │
└──────────────────────────────────────────────────────────┘
┌─ INFORMATIONS PROFESSIONNELLES ── (si professionnel) ───┐
│ SIREN   SIRET   TVA intracom.                            │
│ APE/NAF  RCS    Forme juridique                          │
│ [ Rechercher l'entreprise… ]        (§ recherche pub.)   │
└──────────────────────────────────────────────────────────┘
┌─ CONDITIONS COMMERCIALES ───────────────────────────────┐
│ Statut  Conditions de paiement  Délai (jours)            │
│ [ ] Exclure des relances automatiques                    │
└──────────────────────────────────────────────────────────┘
┌─ NOTES INTERNES ────────────────────────────────────────┐
└──────────────────────────────────────────────────────────┘
```

**L'adresse chantier n'apparaît pas dans ce formulaire.** Elle appartient au chantier/projet (§7). C'est la seule règle d'UX de cet audit qui soit non négociable, parce que la violer réintroduirait le couplage que `chantiers.adresse` a déjà correctement évité.

### Changement de type particulier ↔ professionnel

Règle : **aucune suppression silencieuse, jamais.**

| Sens | Comportement |
|---|---|
| particulier → professionnel | `informations_pro` devient visible et vide. `prenom`/`nom` **restent** (le dirigeant reste un contact utile). Aucune perte. Pas de confirmation nécessaire. |
| professionnel → particulier | `raison_sociale`, `siren`, `siret`, `numero_tva`, `code_ape`, `rcs`, `forme_juridique` deviennent **masqués mais conservés en base**. |

**Confirmation obligatoire** dans le second sens si l'une de ces conditions est vraie :
- au moins un champ pro est renseigné → « Ces informations seront masquées mais conservées. »
- **au moins un document émis référence ce client** → « Ce client a N documents émis. Leur contenu ne changera pas. » — vrai **seulement après** la mise en place de `client_snapshot` (§24.1). Avant cela, le message serait un mensonge.

Aucune donnée n'est effacée par un changement de type. Le masquage est une décision d'affichage, réversible. Et la recherche continue d'indexer les champs masqués : un client redevenu particulier reste trouvable par son ancien SIRET, ce qui est le comportement attendu par un comptable.

---

## 28. Recherche entreprise publique (audit uniquement)

Objectif : saisir un nom ou un SIREN, récupérer raison sociale, SIREN, SIRET, RCS, TVA, APE, adresse, forme juridique.

**État actuel** : aucune intégration, aucune dépendance, aucune clé d'API dans le dépôt. Vérifié.

### Sources envisageables

| Source | Nature | Coût | Données | Remarque |
|---|---|---|---|---|
| **API Recherche d'entreprises** (DINUM, `recherche-entreprises.api.gouv.fr`) | API publique d'État | gratuite, sans clé | raison sociale, SIREN, SIRET siège, NAF, adresse, forme juridique, dirigeants | **candidate n° 1** — recherche plein texte, pas de compte |
| **API Sirene** (INSEE) | API officielle | gratuite, **clé requise** | données Sirene complètes | plus riche, mais gestion de clé + quotas |
| **Base Sirene en open data** (fichiers) | téléchargement | gratuite | intégralité | plusieurs Go, imports mensuels — hors proportion |
| **API Annuaire des Entreprises** (RNE/INPI) | API d'État | gratuite, clé | RCS, actes, statuts | pour le RCS, qui manque aux deux premières |
| Agrégateurs commerciaux | tiers payant | payant | + TVA validée, scoring | **exclu** — le brief interdit toute API payante |

**Le numéro de TVA intracommunautaire n'est fourni par aucune de ces sources.** En France il est déductible du SIREN (`FR` + clé sur 2 chiffres + SIREN), et **vérifiable** via VIES (service de la Commission européenne, gratuit, SOAP/REST). Le calcul de la clé est trivial et local ; la vérification VIES est un second temps, facultatif.

### Contraintes non techniques

- **RGPD** : interroger un service tiers avec un nom d'entreprise saisi par l'utilisateur est un transfert de donnée. Sur des personnes morales l'enjeu est faible, mais un entrepreneur individuel est une **personne physique** dont le nom est la dénomination. À mentionner dans la politique de confidentialité.
- **Disponibilité** : la saisie manuelle doit **toujours** rester possible. Une API publique indisponible ne doit jamais bloquer la création d'un client.
- **Autorité** : la donnée récupérée est une **proposition**, pré-remplie et modifiable, jamais un verrou. C'est l'opérateur qui valide.

**Recommandation** : API Recherche d'entreprises (DINUM) en V1 — gratuite, sans clé, sans compte, sans dépendance nouvelle (un simple `fetch` côté serveur), avec repli silencieux sur la saisie manuelle. **Aucune implémentation dans ce lot.**

---

## 29. Ordre de développement recommandé

| Phase | Contenu | Dépend de | Peut démarrer |
|---|---|---|---|
| **A. Contrat canonique** | `ElsatiaClientV1`, `ClientRefV1`, `AddressV1`, `BillingAddressV1`, `SiteAddressV1` en TypeScript, dans un package partagé, avec tests de contrat. Généralisation de `ExternalReference` de `drone-core` (§17). | rien | **immédiatement — aucune migration** |
| **B0. Snapshots documentaires** | `client_snapshot` sur `devis`+`factures`, `entreprise_snapshot` sur `devis`, trigger de garde, extension de `serialiserDocumentStable`. **P0 juridique.** | post-cutover | **en tête de train** |
| **B. Migration GP/core** | colonnes identité pro, adresse, bloc facturation, arbitrage `raison_sociale` / `latitude` / `adresse_chantier_defaut` | post-cutover | après B0 |
| **C. API / search** | `telephone_normalise`, `recherche_document`, index GIN trigram, RPC `clients_recherche_v1` | B | — |
| **D. GP UI** | fiche client V1, **sélecteur client à recherche serveur (9 écrans)**, barre de recherche | C | le sélecteur peut précéder si l'on accepte une recherche non indexée transitoire |
| **E. Réserves adapter** | `ClientRefV1` facultatif sur `reserves_chantiers` | A + B | après stabilisation Réserves |
| **F. Drone adapter** | `client_name` → `ClientRefV1`, `address` → `AddressV1`, port GP | A | contrat seulement — pas d'app Drone |
| **G. Tools / Colors** | **rien**, sauf besoin réel documenté (§22, §23) | — | — |
| **H. Audit global** | recette cross-app, tests cross-tenant sur RPC, contrôle d'immutabilité documentaire | tout | — |

**A démarre maintenant** : c'est du TypeScript pur, sans migration, sans déploiement, et il déverrouille E et F.
**B0 passe avant B** : c'est un risque juridique, pas une amélioration de confort.

---

## 30. Tests à prévoir

### Recherche (pgTAP sur la RPC)
`nom` · `prenom` · `raison_sociale` · `nom_commercial` · `email` · **téléphone dans 5 formats** (`0612345678`, `06 12 34 56 78`, `06.12.34.56.78`, `+33612345678`, `0033612345678` → tous le même client) · `ville` · `code_postal` · `adresse` · `siret` (complet **et** fragment) · `siren` · `code_ape` (`4332A` **et** `43.32A`) · `numero_tva` · `reference_interne`.

### Normalisation
`MULLER` ≡ `muller` ≡ `Müller` · `SAINT-DENIS` ≡ `saint denis` ≡ `Saint‑Denis` · `L'HÔPITAL` ≡ `l hopital` · espaces multiples et espaces de bord · `Œ`/`œ`, `Æ`/`æ`.

### Multi-termes
`MARTIN STRASBOURG` (2 tokens, AND) · `DUPONT 67100` (nom + CP) · `43.32A STRASBOURG` (APE + ville) · terme unique inchangé · 3 tokens · token de 1 caractère ignoré · > 6 tokens tronqué · **terme absent → 0 résultat** (test anti-OR : la régression la plus probable est un AND qui redevient OR).

### Cross-tenant — **priorité absolue**
- entreprise A ne trouve aucun client de B **via la RPC** (le test qui manque aujourd'hui, §15.5) ;
- `p_entreprise_id` forgé vers une entreprise non membre → exception, **zéro ligne lue** ;
- le **total** de pagination ne fuit pas le nombre de clients de B ;
- un membre sans `acces_clients` → exception ;
- un membre `statut <> 'actif'` → exception ;
- aucune fuite de `nom`, `email`, `siret`, `adresse` d'un autre locataire dans **aucun** champ de la réponse ;
- l'accès support plateforme (`est_acces_support_actif`) reste **borné et journalisé** (§15.4).

### Adresses
principale seule (`identique = true`) → devis et facture portent l'adresse principale · facturation distincte (`identique = false`) → la facture porte la facturation, le devis suit le contrat retenu · `identique = false` **sans** adresse de facturation → **refus** (contrainte CHECK) · basculer `false` → `true` conserve l'adresse de facturation en base.

### Chantiers
chantier à l'adresse du client · chantier à une autre adresse · **plusieurs chantiers, plusieurs adresses, un seul client** · modifier l'adresse d'un chantier ne modifie **pas** le client · modifier l'adresse du client ne modifie **aucun** chantier existant · transfert de chantier (`chantier_transferts`) conserve l'adresse du chantier.

### Immuabilité documentaire — le cœur du P0
- facture émise → renommer le client → **le PDF est identique** (nom, adresse, SIRET) ;
- facture émise → déménager le client → **le PDF est identique** ;
- devis envoyé → modifier le client → **le PDF est identique** ;
- **brouillon** → modifier le client → le brouillon **reflète** le changement ;
- avoir → son destinataire est celui de la facture d'origine, pas celui du client courant ;
- document signé → modifier le client → **`document_sha256` doit être invalidé ou couvrir le snapshot** ;
- lien externe (`acces_externes_documents`) → modifier le client → le document servi est **identique** à l'envoyé ;
- documents antérieurs au dispositif (`client_snapshot IS NULL`) → repli sur la jointure vivante, **sans erreur**.

### Changement de type
professionnel → particulier avec champs pro renseignés → **confirmation demandée**, champs **conservés en base** · particulier → professionnel → aucune perte, aucune confirmation · un client redevenu particulier reste **trouvable par son ancien SIRET** · un client ayant des documents émis → message de confirmation exact.

---

## 31. Gaps P0

| # | Gap | Preuve |
|---|---|---|
| **P0-1** | **Aucun snapshot du client sur aucun document.** Une facture ou un devis émis change rétroactivement de destinataire dès que la fiche client change. | `src/lib/documents-commerciaux.ts:120`, `:153-158` ; `src/components/DocumentImprimable.tsx:149-155` |
| **P0-2** | **`devis` n'a aucun `entreprise_snapshot`.** Un devis accepté (contractuel) affiche l'entreprise **et** le client courants. | `…0200_documents_commerciaux_p9.sql:13-20` : la colonne n'est ajoutée qu'à `factures` |
| **P0-3** | **L'empreinte de signature ne couvre pas le bloc destinataire.** Le destinataire imprimé sur un document signé est modifiable sans invalider `document_sha256`. | `src/app/actions/signatures-documents.ts:19-50`, `:104-105` |

Ces trois gaps sont le même défaut vu sous trois angles, et ils se ferment dans **une seule migration + un seul lot applicatif** (phase B0, §29). Ce sont des risques juridiques et probatoires. Ils doivent être fermés avant commercialisation, ou assumés par écrit et par une décision explicite de Julien.

---

## 32. Gaps P1

| # | Gap | Preuve |
|---|---|---|
| P1-1 | Recherche limitée à 5 champs, mono-terme, non indexée. Email, téléphone, adresse, CP, SIRET introuvables. | `…0121_pagination_liste_clients.sql:43-49` |
| P1-2 | **9 écrans chargent tous les clients sans limite** dans un `<select>`. Rupture avant la recherche. | §10.3 |
| P1-3 | `contacts_clients` gelée : grants révoqués, aucun code applicatif. Les contacts secondaires sont fonctionnellement perdus. | `…0255_acl_reconciliation_v1.sql:596-603` |
| P1-4 | Aucune adresse de facturation distincte. Une seule adresse, au nom trompeur. | `…0004:24-26` |
| P1-5 | Aucune identité pro complète : ni SIREN, ni TVA, ni APE, ni RCS, ni forme juridique. | vérifié sur les 263 migrations |
| P1-6 | `societe` / `raison_sociale` en doublon non tranché ; `raison_sociale` morte. | `src/components/ClientForm.tsx`, `src/app/actions/clients.ts` |
| P1-7 | `latitude` / `longitude` mortes sur `clients` ; `adresse_chantier_defaut` lue mais non renseignable. | `…0080:150-151` ; `src/app/actions/chantiers.ts:351` |
| P1-8 | Aucune normalisation : accents, tirets, formats de téléphone non gérés. | §10.1 |
| P1-9 | `siret`, `email`, `code_postal` sans aucune contrainte de format ; le SIRET est imprimé sur facture sans validation. | `…0004:22-26` |
| P1-10 | Aucun test cross-tenant sur `clients_liste_paginee` — le chemin `SECURITY DEFINER` où la RLS ne s'applique pas. | `supabase/tests/isolation_multitenant_comportement.test.sql` |
| P1-11 | Aucune trace d'historique sur `clients` : une modification de fiche est indétectable a posteriori. | aucune table d'audit sur `clients` |
| P1-12 | Doctrine FK inter-applications non tranchée : Réserves utilise une vraie FK vers `chantiers`, Drone s'interdit toute FK. | `…0268:107` vs `packages/drone-core/src/common.ts` |
| P1-13 | Le lien de partage externe sert un document muté après envoi. | `…0200` + `src/app/document/[token]/page.tsx` |

---

## Verdict

Le modèle client de l'écosystème ELSATIA **n'est pas divergent** : il est **unique et incomplet**. Une seule application possède un dossier client (Gestion Pro) ; les quatre autres n'en ont aucun, et pour Tools comme pour Colors c'est le bon choix, qu'il ne faut pas défaire au nom de l'uniformité.

Il n'y a donc rien à réconcilier entre applications — il y a un socle à compléter avant que quiconque s'y branche. Le contrat transverse est définissable **aujourd'hui**, sur des objets réels, sans invention : `ElsatiaClientV1`, `ClientRefV1` (généralisation directe de l'`ExternalReference` déjà écrit dans `drone-core`), `AddressV1` et ses deux rôles. Le patron de snapshot est déjà implémenté et fonctionnel pour l'entreprise émettrice ; il n'a qu'à être appliqué au client. Le patron de recherche indexée existe déjà dans Colors ; `pg_trgm` est déjà installée. Le confinement multi-tenant est prouvé par construction et son patron reste valide pour la recherche universelle.

Trois P0 se dressent devant la commercialisation, et ce sont trois facettes du même défaut : **aucun document ELSATIA ne fige l'identité de son destinataire.** Une facture dont le destinataire se recalcule à chaque affichage n'est pas une pièce comptable stable. Ces trois gaps se ferment ensemble, dans un lot unique, indépendant du reste de la feuille de route — et ce lot doit passer en tête de train.

Le contrat est défini. Le socle est identifié. Rien n'a été migré, déployé ni modifié.

**ELSATIA-CANONICAL-CLIENT-MODEL-AND-SEARCH-AUDIT-V1 VALIDÉ — CONTRAT CLIENT TRANSVERSE ELSATIA DÉFINI**
