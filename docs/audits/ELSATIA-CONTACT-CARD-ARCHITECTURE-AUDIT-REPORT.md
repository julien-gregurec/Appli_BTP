# ELSATIA Contact / Card — Rapport d'audit d'architecture V1

Lot : `ELSATIA-CONTACT-CARD-RECIPROCAL-EXCHANGE-GP-BRIDGE-V1`
Date : 2026-09-08
Révision : **R2** — verdict accepté par Julien, décisions D1 à D10 arbitrées et intégrées.
Nature : **audit en lecture seule + conception**. Aucune migration créée, aucune fusion,
aucun déploiement, aucune écriture en Production.

---

## 0. Verdict

> ### GO ARCHITECTURE SOUS CONDITIONS

L'écosystème ELSATIA contient déjà **la quasi-totalité des briques techniques** dont
Contact / Card a besoin : lien public révocable par jeton haché, file de notifications avec
push, journal d'audit, limitation de débit anti-abus, socle multi-applications, contrats
client canoniques avec normalisation / détection de doublon / enveloppe de synchronisation
idempotente, et une implémentation hors-ligne réelle de référence (Réserves V5).

Le produit est donc **constructible sans inventer de socle**. Ce qui bloque n'est pas la
conception, ce sont cinq réalités mesurées sur le code — dont **quatre sont désormais
tranchées** par les décisions D1 à D10 :

| # | Condition | État après arbitrage |
|---|---|---|
| C1 | Aucune migration ne peut entrer aujourd'hui | **Toujours ouverte.** Le ledger est en cours de réconciliation (P0). Toute évolution SQL reste en `.sql.proposed`. Seule condition qui subsiste. |
| C2 | L'OCR n'existe **pas** dans le produit | **Tranchée (D1, D2, D3).** L'OCR entre au périmètre cible, facultatif et désactivable par entreprise, annoncé à l'utilisateur, confirmé **champ par champ**, et sans aucun pouvoir de création. Reste à écrire : tout. |
| C3 | Trois destinations de classement n'ont **pas** de modèle cible | **Tranchée (D5, D6).** Un vivier de candidats, un registre de partenaires et un registre de contacts professionnels généraux sont à créer côté Gestion Pro. |
| C4 | Un tiers ne peut pas être fournisseur **et** sous-traitant | **Tranchée (D4).** `type_tiers` est remplacé par un modèle de rôles multiples. Coût mesuré : **6 usages dans 4 fichiers**, tous des filtres `.eq()` — voir §4.3. |
| C5 | `contacts_clients` est en retard sur le contrat canonique | **Tranchée (D7).** `prenom` et `telephone_mobile` sont ajoutés à la proposition SQL. |

Aucune de ces conditions n'invalide l'architecture. C1 seule détermine encore le calendrier ;
les quatre autres déterminent désormais **le contenu du lot de réalisation** (§14).

---

## 1. Audit Git

| Élément | Valeur |
|---|---|
| Dépôt | `/Users/juliengregurec/Projects/elsatia-main` |
| Base canonique auditée | `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` |
| **SHA de base complet** | `1fc1331842cdf5980b374169994587813bdee7b6` |
| Branche du lot | `audit/elsatia-contact-card-architecture-v1` |
| Worktree dédié | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/contact-card-architecture-v1` |
| Migrations présentes à la base | 272 fichiers, numéro fonctionnel maximum **274** |
| Applications du monorepo | racine = Gestion Pro ; `apps/colors`, `apps/reserves`, `apps/tools` |
| Paquets partagés | `packages/client-contracts`, `packages/application-access`, `packages/email` |

Le worktree est créé sur le disque externe `/Volumes/ELSATIA-DEV`, conformément à la règle
disque du poste. **Aucun stash, aucune branche, aucun commit, aucun worktree existant n'a
été supprimé ni modifié.** Aucun des 60 worktrees ouverts par les autres conversations n'a
été touché.

### Pourquoi le train et non `main`

`main` est à `a083c37` et n'est pas la référence fonctionnelle : le train v2 porte les
272 migrations réconciliées, les contrats client canoniques et Réserves V5. Auditer `main`
aurait conduit à déclarer « manquantes » des briques qui existent.

---

## 2. Référence fonctionnelle — captures izi.Card

**Quatre captures du produit izi.Card ont été transmises avec la mission.** Elles servent
d'inspiration **strictement fonctionnelle**, sur trois points et trois seulement :

1. le principe d'une **carte physique NFC** qu'on approche d'un téléphone ;
2. l'**ouverture sans installation d'application** ;
3. la **simplicité du parcours** — un geste, une page, une action.

### Ce qui n'est pas repris, et ne doit jamais l'être

Ni le nom, ni la marque, ni le logo, ni les textes, ni les visuels, ni les couleurs, ni la
structure commerciale, ni les garanties, ni les témoignages, ni la présentation graphique.
**Aucun tarif, aucune offre, aucun argument commercial d'izi.Card n'est repris.**

ELSATIA Contact / Card porte son identité propre et répond à un besoin qu'izi.Card ne traite
pas : le **rangement dans le bon registre métier** d'un contact reçu — client, prospect,
fournisseur, sous-traitant, partenaire, candidat ou contact général — avec détection de
doublon et confirmation humaine. C'est là que se situe la valeur du produit ELSATIA, et
c'est de la conception propre, pas de l'inspiration.

Les trois points d'inspiration retenus relèvent par ailleurs du fonctionnement générique
d'une carte NFC : une puce qui n'expose qu'une URL publique révocable est le seul montage
sûr, indépendamment de tout produit tiers.

---

## 3. Modèles existants réutilisés

### 3.1 Lien public révocable — **réutilisation intégrale**

C'est la brique la plus importante, et elle est déjà écrite et éprouvée.

`supabase/migrations/20260812000200_documents_commerciaux_p9.sql` :

```sql
create table public.acces_externes_documents (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type_document text not null check (type_document in ('devis','facture')),
  document_id uuid not null,
  token_hash text not null unique,
  cree_le timestamptz not null default now(),
  cree_par uuid references public.utilisateurs(id) on delete set null,
  expire_le timestamptz,
  revoque_le timestamptz
);
```

et sa résolution, **accordée à `anon`**, qui est exactement ce qu'il faut pour une page
publique sans compte :

```sql
create or replace function public.document_commercial_par_token(p_token_hash text)
returns table (type_document text, document_id uuid, entreprise_id uuid)
language sql security definer stable set search_path = public as $$
  select a.type_document, a.document_id, a.entreprise_id
  from public.acces_externes_documents a
  where a.token_hash = p_token_hash
    and a.revoque_le is null
    and (a.expire_le is null or a.expire_le > now())
  limit 1;
$$;
revoke all on function public.document_commercial_par_token(text) from public;
grant execute on function public.document_commercial_par_token(text) to anon, authenticated;
```

Côté applicatif, `src/lib/documents-partage.ts` porte déjà les trois gestes :
`randomBytes(32).toString("base64url")` pour un jeton non prédictible, `sha256` pour
l'empreinte — **le jeton en clair n'est jamais stocké** — et une révocation qui ferme tous
les jetons actifs avant d'en émettre un nouveau.

`src/app/document/[token]/page.tsx` montre le patron de page publique : résolution par le
client **anonyme**, puis lecture des données par le client **admin** une fois — et seulement
une fois — l'identité de la ressource établie. La page porte `robots: { index: false }`.

> **Conséquence directe pour Contact / Card.** Le couple puce NFC / QR code ne contient
> qu'une URL de la forme `https://<domaine>/c/<token>`. Le jeton est aléatoire sur 256 bits,
> seule son empreinte va en base, il est révocable et expirable. **Aucun secret, aucune
> donnée personnelle n'est écrit dans la puce.** Le §13 de la mission est satisfait par
> réemploi, pas par invention.

`reserves_invitations` (migration 270) fournit la version enrichie du même patron —
`expire_at`, `consomme_at`, `revoque_at`, `created_by`, plus une contrainte
`check (consomme_at is null or revoque_at is null)` — et c'est ce modèle-là, plus complet,
qui doit servir de gabarit à la table des cartes.

### 3.2 Notifications — réutilisation, avec un défaut à ne pas recopier

`notifications_utilisateurs` (migration 081) est générique et convient :

```sql
create table if not exists public.notifications_utilisateurs(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  type text not null, titre text not null, message text, lien text,
  niveau text not null default 'information' check(niveau in ('information','attention','critique')),
  ressource_type text, ressource_id uuid,
  lue_at timestamptz, created_at timestamptz not null default now()
);
```

La chaîne complète existe : `push_abonnements`, `preferences_notifications_push` (modèle
opt-out), `src/lib/push.ts`, un webhook temps réel et un cron de secours
(`src/app/api/cron/notifications-push/route.ts`). Le champ `lue_at` couvre l'exigence
« notification non lue visible à la prochaine connexion ».

**Le défaut à connaître.** L'index censé garantir l'unicité ne la garantit pas :

```sql
create unique index if not exists notifications_evenement_unique
  on public.notifications_utilisateurs(utilisateur_id,type,ressource_id,created_at)
  where ressource_id is not null;
```

`created_at` fait partie de la clé. Deux insertions successives à des horodatages
différents passent toutes les deux. **L'exigence « la notification n'est créée qu'une seule
fois » (§16) n'est donc pas tenue par cet index.**

Le bon patron existe ailleurs, et il est récent — `reserves_notifications_envois`
(migration 270) : `cle_idempotence text not null unique`. C'est celui-là qu'il faut
reprendre. Contact / Card doit construire sa clé d'idempotence à partir de
`(carte_recue_id, type_evenement, destinataire)` et **jamais** de l'horodatage.

### 3.3 Contrats client canoniques — le cœur de l'intégration

`packages/client-contracts` (v1.0.0) est déjà écrit, testé, et fournit — sans qu'il faille
en écrire une ligne — presque tout le §8 « détection des doublons » de la mission :

* normalisation : `normalizeEmail`, `normalizePhoneNumber`, `normalizePostalCode`,
  `normalizeVatNumber`, `normalizeSearchText`, `tokenizeSearchTerm`, `buildSearchDocument` ;
* validation légale : `isValidSiret`, `isValidSiren`, `isValidVatNumber`,
  `isValidActivityCode`, `isPlausibleEmail`, `isPlausiblePhoneNumber`, et le contrôle croisé
  « le SIRET commence-t-il par le SIREN déclaré » ;
* recherche : `buildClientSearchPlan` sur 14 champs, dont `email`, `phone`, `siret`,
  `vatNumber`, `postalCode`, `city` — exactement les critères listés au §8 ;
* synchronisation idempotente : `buildIdempotencyKey`, `ClientSyncEnvelope`,
  `detectClientSyncConflict` avec le conflit `duplicate_identity`.

Et surtout, une décision d'architecture déjà prise et déjà codée, qui règle à elle seule le
problème « une carte scannée ne doit pas créer un client » :

```ts
export const CLIENT_SYNC_SCOPES = ["client:read", "client:propose", "client:write"] as const;
export const CLIENT_AUTHORITATIVE_APPLICATION: ClientSourceApplication = "gestion_pro";
export const CLIENT_SYNC_RESOLUTIONS = ["manual", "authority_wins", "rejected"] as const;
```

Le commentaire du paquet est explicite : une application tierce ne peut porter que
`client:read` et `client:propose`, « sa demande devient une proposition qu'un humain valide
dans Gestion Pro », et cette règle « est **vérifiée par le validateur** d'enveloppe, pas
seulement documentée ». La résolution par défaut est `manual`.

> **Contact / Card doit être un émetteur `client:propose`, jamais `client:write`.** C'est le
> mécanisme, déjà existant, qui interdit structurellement la création automatique de fiche
> depuis un OCR.

### 3.4 Socle multi-applications

`applications_elsatia`, `roles_applications_elsatia`, `acces_applications_entreprises`,
`habilitations_applications_utilisateurs`, `historique_acces_applications` et la fonction
`a_acces_application(entreprise, code)` (migration 234) forment le point de branchement
standard. Trois applications l'ont déjà emprunté : Colors (234), Tools (236), Réserves (268).

Contact / Card s'y branche à l'identique : une ligne `applications_elsatia` de code
`contact`, ses rôles, et rien d'autre. Aucun droit n'est accordé par la migration elle-même.

### 3.5 Anti-abus et audit

* `rate_limits_applicatifs` (clé, `identifiant_hash` sha256, fenêtre, compteur) et
  `journal_abus_securite` (migration 193) : le formulaire réciproque public s'y branche
  directement. Le §13 « limitation du nombre de soumissions » ne demande aucun code neuf.
* `journal_activite` (`action`, `ressource`, `ressource_id`, `metadata jsonb`) : journal
  générique par entreprise.
* `historique_acces_applications` : audit append-only des droits.

### 3.6 Hors ligne — implémentation de référence disponible

`apps/reserves/src/lib/offline/` (`base-locale.ts`, `identite-locale.ts`, `contrat.ts`,
`reseau.ts`, `synchronisation.ts`) plus `apps/reserves/public/sw-reserves.js` constituent
une implémentation hors-ligne **réelle et mesurée** : IndexedDB cloisonné par identité,
file de synchronisation idempotente, service worker. C'est le gabarit du §12.

### 3.7 Dépendances déjà présentes

`qrcode` ^1.5.4 (génération, déjà utilisé par `src/app/api/identification/[id]/qr/route.ts`)
et `@zxing/browser` ^0.2.1 (lecture). **Le §15-3 « partage par QR code » et la lecture d'un
QR reçu ne demandent aucune dépendance nouvelle.**

---

## 4. Modèles existants — et leurs limites réelles

### 4.1 `clients` — convient, sans modification

```
type    ∈ particulier | professionnel | collectivite | syndic | promoteur
statut  ∈ prospect | actif | inactif
```

plus `societe`, `raison_sociale`, `siret`, `email`, `telephone`, `adresse_facturation`,
`code_postal`, `ville`, et depuis la migration 274 `numero_tva`, `forme_juridique`,
`adresse_complement`, `pays`.

**« Prospect » n'est pas une entité : c'est `clients.statut = 'prospect'`**, qui est déjà la
valeur par défaut. La ligne « Prospect » du tableau de la mission se résout donc sans
aucun modèle neuf.

Correspondance de dénomination déjà tranchée par la migration 274, à ne pas rejouer :
`tradeName → clients.societe`, `legalName → clients.raison_sociale`. **Ne pas créer de
`nom_commercial`.**

### 4.2 `contacts_clients` — insuffisante pour une carte de visite

```sql
create table public.contacts_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null, fonction text, telephone text, email text,
  principal boolean not null default false,
  created_at timestamptz not null default now()
);
```

À comparer au contrat canonique `ClientContact`, qui porte `civility`, `firstName`,
`lastName`, `jobTitle`, `email`, `phone`, **`mobile`**, `roles[]` (`primary`/`billing`/`site`),
`status` (`active`/`inactive`), `notes`.

Manquent donc en base : **prénom, mobile, notes, statut, rôles**. Or une carte de visite
porte typiquement « Prénom NOM », un fixe **et** un mobile. Verser un contact scanné dans
`contacts_clients` aujourd'hui, c'est perdre le prénom (aggloméré dans `nom`) et perdre le
mobile.

La table n'a pas de colonne `entreprise_id` : le cloisonnement passe par `clients` — les
politiques RLS remontent systématiquement au client
(`exists(select 1 from clients c where c.id = contacts_clients.client_id and a_permission(c.entreprise_id, …))`).
Un modèle Contact / Card devra faire de même ou porter son propre `entreprise_id`.

### 4.3 `fournisseurs` — et l'exclusivité fournisseur / sous-traitant

```sql
alter table public.fournisseurs
  add column if not exists type_tiers text not null default 'fournisseur', …;
alter table public.fournisseurs add constraint fournisseurs_type_tiers_check
  check(type_tiers in ('fournisseur','sous_traitant'));
```

Deux faits mesurés :

1. **Un tiers est fournisseur OU sous-traitant, jamais les deux.** La mission demande
   explicitement d'étudier « fournisseur et sous-traitant ». La base l'interdit aujourd'hui.
   → **décision D4 : le cumul de rôles est retenu.**

   Coût mesuré du changement, et il est petit : `type_tiers` n'est lu qu'à **6 endroits,
   dans 4 fichiers**, et les 6 sont des filtres `.eq("type_tiers", …)` :
   `fournisseurs/page.tsx:18`, `sous-traitants/page.tsx:18`,
   `sous-traitants/[id]/page.tsx:20`, `actions/sous-traitants.ts:21,59,70`.
   Côté SQL, deux migrations seulement le mentionnent (111 et 194).

   Un modèle de rôles multiples est donc **tractable**, à condition de conserver
   `type_tiers` en lecture pendant la transition plutôt que de le supprimer d'un bloc —
   voir §6.4.
2. **Un fournisseur n'a pas de table de contacts.** Il porte un unique champ texte
   `contact_nom`. Il n'existe aucun équivalent de `contacts_clients` côté fournisseur. Une
   carte de visite d'un commercial fournisseur n'a donc, aujourd'hui, **aucun endroit
   normalisé où atterrir** autre que d'écraser `contact_nom`.

### 4.4 `sous_traitants_chantiers` — ce n'est pas un registre de tiers

```sql
create table if not exists public.sous_traitants_chantiers(
  id uuid primary key …,
  entreprise_id uuid not null …,
  fournisseur_id uuid not null,
  chantier_id uuid not null,
  mission text not null …,
  …
);
```

C'est une **affectation** : un fournisseur, un chantier, une mission, un montant. Il n'existe
pas de « registre sous-traitants » indépendant. Le tableau de la mission dit « registre
sous-traitants existant **ou** fournisseur avec rôle spécialisé » : c'est la seconde branche
qui est vraie, et la première n'existe pas.

> **Classer une carte en « sous-traitant » = créer/rattacher un `fournisseurs` avec
> `type_tiers = 'sous_traitant'`. Le lien chantier n'est créé que plus tard, par un humain,
> quand une mission existe.** Contact / Card ne doit jamais écrire dans
> `sous_traitants_chantiers` : il n'y a pas de chantier au moment du scan.

### 4.5 `employes` — et l'absence totale de vivier

`employes` est adossé à la paie : `dossiers_paie_salaries`, `profils_paie_employes`,
`bulletins_paie`, `temps_travail_paie`, `journal_audit_paie`. Une recherche sur
`candidat|vivier|recrutement` dans les 272 migrations ne renvoie **aucune définition
métier** — les deux occurrences trouvées sont des commentaires sans rapport (« liste de
candidats » d'un cron de relances, « migration candidate »).

> **Il n'existe aucun modèle de candidat dans ELSATIA.**
> → **décision D5 : un vivier de candidats est à créer, strictement distinct des salariés.**
>
> L'interdiction de la mission — « ne jamais créer automatiquement un salarié, un contrat de
> travail ou une donnée de paie à partir d'une carte de visite » — reste entière et devient
> une propriété du modèle : le vivier n'a **aucune clé étrangère vers `employes`**, aucun
> lien avec `dossiers_paie_salaries` ni `profils_paie_employes`, et le classement
> « futur employé » ne crée **qu'une proposition de candidat**, jamais un candidat confirmé
> et encore moins un salarié. Le passage candidat → salarié reste un geste RH manuel,
> hors de portée de Contact / Card.

### 4.6 `appels_contacts` — le bon endroit pour le contexte de rencontre

```
type ∈ appel | email | sms | courrier | rendez_vous     sens ∈ entrant | sortant
client_id, contact_id, employe_id, objet, compte_rendu, a_rappeler_at, termine
```

Le champ « message ou contexte de la rencontre » du formulaire réciproque, et la date de
rencontre d'une carte scannée, se journalisent ici une fois le contact versé à un client —
`type = 'rendez_vous'`, `sens = 'entrant'`. Aucun modèle neuf.

### 4.7 OCR — deux schémas, zéro code

| Table | Migration | Code applicatif qui l'utilise |
|---|---|---|
| `suggestions_ocr_notes_frais` | 058 | **aucun** |
| `colors_analyses_ocr` | 246 | **aucun** |

Vérifié par recherche des deux noms de table sur l'ensemble des `.ts`/`.tsx` du dépôt hors
`node_modules` : zéro occurrence.

Ces deux schémas restent néanmoins la **bonne forme**, et ils disent la même chose tous les
deux — c'est une convention établie de la maison :

```sql
-- notes de frais
suggestions jsonb, confiances jsonb, incoherences text[],
statut ∈ en_attente|termine|erreur|non_configure, valide_par_utilisateur boolean

-- colors
resultat jsonb, confiance numeric(5,2),
statut ∈ a_confirmer|confirmee|rejetee|erreur, confirme_par uuid, confirme_at timestamptz,
check ((statut='confirmee' and confirme_par is not null and confirme_at is not null) or statut<>'confirmee')
```

Ce `check` final est précisément l'exigence « aucune information OCR ne doit être présentée
comme certaine sans confirmation humaine », **écrite dans la base plutôt que dans le code**.
Contact / Card reprend cette contrainte mot pour mot.

Le seul moteur réellement disponible est `src/lib/ai/provider.ts` :

```ts
/** Complétion à partir d'une image ou d'un document (PDF), sans outils. */
completerAvecFichier(params: { system?; texte; fichier: FichierIA; maxTokens? }):
  Promise<{ texte: string; usage?: UsageIA }>;
```

Un seul fournisseur est implémenté (`providers/openai.ts`), et la porte est **fail-closed** :

```ts
export function iaEstActive(env = process.env): boolean {
  return env.FEATURE_AI_ENABLED?.trim().toLowerCase() === "true";
}
```

Variable absente ⇒ IA indisponible. Le coût est déjà comptabilisé (`UsageIA`, `journal_ia`).

### 4.8 Boutique — existe, mais fermée et vide

`boutique_produits` / `boutique_lignes_commande` / `boutique_commandes` (migrations 144-145),
avec Stripe Checkout. Deux limites mesurées :

```sql
categorie text not null check (categorie in
  ('imprimante_code_barres','plastifieuse','consommable_plastification','etiquette_aimantee'))
```

1. **Aucune catégorie ne peut accueillir une carte NFC** sans modifier ce `check`.
2. **Aucun `insert into public.boutique_produits` n'existe dans les 272 migrations** : le
   catalogue est vide. Le drapeau `FEATURE_BOUTIQUE_ENABLED` gouverne l'ouverture.

Conforme à la mission : rien n'est ouvert, aucun prix, aucun délai, aucune garantie, aucun
stock n'est inventé ici. Seule la **forme** de l'extension future est décrite (§14 du modèle
d'intégration).

### 4.9 Stockage

Sur les 13 buckets déclarés, **un seul est public : `entreprise-assets`**. Tous les autres
(`colors-seaux`, `notes-frais`, `bulletins-paie`, `documents-employes`, `pointage-preuves`…)
sont privés. La photo d'une carte à traiter par OCR va dans un bucket **privé** ; seuls le
logo et la photo de profil affichés sur la page publique peuvent vivre dans
`entreprise-assets`.

---

## 5. Modèles manquants

| Besoin de la mission | Existe ? | Constat |
|---|---|---|
| Carte (physique/numérique) et son jeton public | **non** | Le patron existe (`acces_externes_documents`, `reserves_invitations`), l'entité non. |
| Profil public affichable | **non** | — |
| Boîte de réception des contacts reçus | **non** | — |
| Carte reçue + résultat OCR + confiances | **non** (forme oui) | Deux schémas de référence existent, tous deux inutilisés. |
| Carnet de contacts hors client | **non** | Tout contact est aujourd'hui rattaché à un `clients` (§4.2). |
| Contacts d'un fournisseur | **non** | Un seul champ texte `contact_nom` (§4.3). |
| Registre « partenaire » | **non** | Aucune trace. → **à créer (D6)** |
| Registre « contact professionnel général » | **non** | Aucune trace. → **à créer (D6)** |
| Candidat / vivier | **non** | Aucune trace (§4.5). → **à créer (D5)** |
| Multi-rôle d'un tiers | **non** | Interdit par `fournisseurs_type_tiers_check` (§4.3). → **à lever (D4)** |
| Prénom / mobile sur un contact | **non** | Absents de `contacts_clients` (§4.2). → **à ajouter (D7)** |
| Application `contact` au catalogue | **non** | Le socle d'accueil existe (§3.4). |
| Catégorie Boutique pour une carte NFC | **non** | `check` fermé à 4 valeurs (§4.8). |

---

## 6. Architecture retenue

### 6.1 Une application, pas un module de Gestion Pro

Le §11 impose que Contact / Card reste utile **sans** Gestion Pro. Un module interne à GP ne
peut pas satisfaire cela. La forme retenue est donc `apps/contact`, quatrième application du
monorepo, sur le gabarit exact d'`apps/reserves` (port dédié, `next.config.ts`,
`vercel.json`, `@elsatia/application-access`, `@elsatia/email`).

Le lien avec Gestion Pro est **optionnel, explicite et révocable** : il passe par l'enveloppe
`ClientSyncEnvelope` en portée `client:propose`, jamais par une écriture directe.

### 6.2 Trois patrimoines strictement distincts

Le §10 exige de distinguer la carte de l'entreprise, le profil personnel, le contact reçu
personnellement, et le contact versé au patrimoine commercial. C'est la décision structurante
du modèle :

```
carte                → appartient à l'ENTREPRISE (elle l'émet, la suspend, la révoque)
profil affiché       → appartient au TITULAIRE (il édite ses coordonnées)
contact reçu         → appartient au TITULAIRE tant qu'il n'est pas versé
contact versé        → appartient à l'ENTREPRISE (visible du registre partagé)
```

Un responsable de cartes **ne voit pas** les contacts non versés d'un collaborateur. Il voit
l'existence des cartes, leur état, leur activité agrégée — jamais le carnet personnel. Le
versement est un geste explicite du titulaire, horodaté et journalisé.

### 6.3 Chaîne de traitement d'une carte reçue

```
réception (NFC | QR | photo | PDF | formulaire | saisie | partage ELSATIA)
      │
      ▼  aucune écriture métier
[ carte reçue ]  statut = reçue
      │
      ▼  OCR facultatif, si et seulement si FEATURE_AI_ENABLED
[ analyse ]  suggestions jsonb + confiances jsonb + incohérences
      │
      ▼  ÉCRAN HUMAIN OBLIGATOIRE — corriger, supprimer, compléter, abandonner
[ vérifiée ]
      │
      ▼  recherche de doublon (buildClientSearchPlan + normalisations)
[ doublon possible ] ──► choix humain : rattacher | nouvel interlocuteur | compléter
      │                                | fusionner après validation | garder séparé | attendre
      ▼  classement explicite
[ classée ]  destination principale + rôles secondaires
      │
      ▼  si et seulement si Gestion Pro est lié
[ proposition client:propose ] ──► file idempotente ──► [ synchronisée ]
      │
      ▼
[ notification ]  clé d'idempotence, une seule fois
```

**Aucune flèche automatique ne traverse l'écran humain.** C'est l'invariant du produit.

### 6.4 Rôles multiples de tiers (D4)

`type_tiers` disparaît comme **source de vérité**, sans disparaître comme **colonne**.

Le modèle cible est une table de rôles, `fournisseurs_roles (entreprise_id,
fournisseur_id, role)` avec `role ∈ ('fournisseur','sous_traitant')` et une clé primaire
sur le triplet : un tiers porte autant de lignes que de rôles, donc zéro, un ou deux.

Trois raisons de ne pas supprimer `type_tiers` dans le même geste :

1. les 6 usages applicatifs sont des filtres `.eq()` ; les basculer sur une jointure est un
   changement de requête, pas de logique — mais il doit être **fait et vérifié**, pas
   supposé ;
2. la contrainte `check` protège aujourd'hui contre une valeur aberrante ; la retirer avant
   que la table de rôles soit peuplée ouvrirait une fenêtre où un tiers n'a plus de rôle du
   tout ;
3. la migration de reprise doit **peupler `fournisseurs_roles` depuis `type_tiers`**, ce qui
   exige que la colonne existe encore au moment où elle s'exécute.

La séquence est donc : créer la table de rôles → la peupler → basculer les 6 lectures →
**puis seulement** retirer la contrainte et la colonne, dans un lot ultérieur. Un `type_tiers`
laissé en place et non maintenu deviendrait une seconde source de vérité — c'est le seul
risque réel de cette évolution, et il se traite par une date de retrait, pas par un
commentaire.

> **Ce que ce lot ne fait pas.** Unifier `clients` et `fournisseurs` en un registre unique
> de tiers — qui serait le modèle « juste » pour exprimer « client et partenaire » ou
> « ancien salarié et sous-traitant » — est un **refactor structurel de Gestion Pro**. Il ne
> doit pas être introduit en effet de bord d'un produit de cartes de visite. D4 est honoré
> sur le cas nommé par Julien (fournisseur **et** sous-traitant) ; le cumul inter-registres
> passe par les liens décrits en §6.5, et l'unification reste un lot à part entière.

### 6.5 Registres partenaires et contacts généraux (D6)

Deux registres nouveaux côté Gestion Pro, volontairement **légers** — ils n'émettent aucun
document commercial, ne portent aucune identité légale obligatoire, et n'entrent pas dans la
facturation :

* `partenaires` — organisation partenaire et ses interlocuteurs ;
* `contacts_professionnels` — carnet professionnel de l'entreprise, pour ce qui n'est ni
  client, ni fournisseur, ni partenaire, ni candidat.

Un même interlocuteur peut exister dans plusieurs registres (le partenaire d'aujourd'hui est
le client de demain). Pour ne pas fabriquer de doublons silencieux, une table de liens
`tiers_liens` déclare que deux fiches de registres différents **désignent la même
organisation réelle** — sans les fusionner, sans en élire une principale, et sans préjuger
de l'unification future. C'est la réponse minimale et non destructive au « client et
partenaire » du §6 de la mission.

---

## 7. Correspondance avec Gestion Pro

Le détail, champ par champ, est dans
`ELSATIA-CONTACT-CARD-GP-INTEGRATION-MAPPING-V1.md`. Synthèse des destinations **réelles**,
corrigée par rapport au tableau supposé de la mission :

| Classification | Destination cible après arbitrage | État du modèle |
|---|---|---|
| Prospect | `clients` avec `statut='prospect'` (valeur par défaut) | **existe** |
| Client | `clients` + `contacts_clients` enrichie de `prenom` et `telephone_mobile` | existe, **à compléter (D7)** |
| Fournisseur | `fournisseurs` + rôle `fournisseur` dans `fournisseurs_roles` | existe, **rôles à créer (D4)** ; interlocuteurs à créer (E4) |
| Sous-traitant | `fournisseurs` + rôle `sous_traitant` — **cumulable** avec `fournisseur` | existe, **rôles à créer (D4)** |
| Partenaire | `partenaires` | **à créer (D6)** |
| Candidat / futur employé | `candidats` — **proposition de candidat uniquement** | **à créer (D5)** ; aucun lien vers `employes` |
| Contact général | `contacts_professionnels` | **à créer (D6)** |
| À classer | boîte de réception Contact / Card | existe (produit) |

Deux constats d'audit restent vrais et ne sont pas annulés par les décisions :
`sous_traitants_chantiers` demeure une **affectation** et non un registre — Contact / Card
n'y écrit jamais — et le classement « futur employé » ne produit **jamais** un `employes`,
seulement une proposition dans le vivier.

---

## 8. Détection des doublons

Entièrement bâtie sur `@elsatia/client-contracts`, sans règle réécrite :

| Critère | Fonction | Poids proposé |
|---|---|---|
| SIRET identique | `isValidSiret` + égalité chiffres | quasi-certain |
| E-mail normalisé identique | `normalizeEmail` | fort |
| Téléphone normalisé identique | `normalizePhoneNumber` | fort |
| N° TVA identique | `normalizeVatNumber` | fort |
| Domaine du site identique | dérivé de `website` | moyen |
| Raison sociale + code postal | `normalizeSearchText` + `normalizePostalCode` | moyen |
| Nom + prénom seuls | `tokenizeSearchTerm` | faible — jamais suffisant |

Trois règles non négociables, toutes déjà portées par le contrat :

1. **Aucune fusion automatique.** `CLIENT_SYNC_RESOLUTIONS[0] === "manual"`, et c'est la
   valeur par défaut documentée comme « la seule sûre ».
2. Un doublon détecté produit le conflit `duplicate_identity` et **s'arrête** — il ne
   déclenche pas d'écriture.
3. La provenance de chaque champ est conservée (valeur reçue / valeur corrigée / auteur),
   afin de savoir en permanence ce qui vient de la carte scannée.

---

## 9. Sécurité et RGPD

Traités en détail dans `ELSATIA-CONTACT-CARD-PRIVACY-SECURITY-MODEL-V1.md`. Points fermes :

* jeton `randomBytes(32).toString("base64url")`, stocké **en sha256 seulement** ;
* aucun secret ni donnée personnelle dans la puce NFC ou le QR — **uniquement une URL** ;
* révocation immédiate, expiration, et une ancienne URL révoquée ne renvoie plus rien
  (la fonction de résolution filtre `revoque_le is null` avant tout accès) ;
* la page publique est cloisonnée : le jeton ne résout qu'**une** carte, jamais un chemin
  vers les autres données de l'entreprise ;
* formulaire réciproque : consentement explicite obligatoire, plafonné par
  `rate_limits_applicatifs`, abus tracés dans `journal_abus_securite` ;
* images : validation MIME, taille maximale, bucket **privé**, suppression de l'original
  après confirmation humaine selon la politique retenue (→ question ouverte O2) ;
* OCR sous **double interrupteur** (D1) : `FEATURE_AI_ENABLED` côté plateforme et
  `contact_parametres.ocr_actif` côté entreprise, tous deux *fail-closed*. Une entreprise
  qui refuse que ses images partent chez un tiers coupe l'OCR **sans perdre le produit** ;
* traitement OCR **annoncé avant l'envoi** de la première image, et confirmé **champ par
  champ** (D2) — jamais globalement ;
* isolation multi-tenant par `entreprise_id` + RLS, sur le patron `est_membre_actif` /
  `a_permission` déjà employé partout ;
* `robots: { index: false, follow: false }` sur la page publique, comme
  `src/app/document/[token]/page.tsx`.

---

## 10. Tests exécutés

| Test | Résultat |
|---|---|
| Inventaire des tables des 272 migrations | 213 tables recensées |
| Recherche d'un modèle candidat/vivier/recrutement | **aucun** — 0 définition métier |
| Recherche d'un modèle partenaire | **aucun** |
| Recherche d'un modèle carte/NFC/vCard | **aucun** |
| Exclusivité `fournisseurs.type_tiers` | **confirmée** — `check(type_tiers in ('fournisseur','sous_traitant'))` |
| Coût du retrait de `type_tiers` | **6 usages, 4 fichiers**, tous des filtres `.eq()` ; 2 migrations le mentionnent |
| Table de contacts fournisseur | **inexistante** — un seul champ `contact_nom` |
| Écart `contacts_clients` ↔ `ClientContact` | **confirmé** — prénom, mobile, notes, statut, rôles absents |
| Code applicatif utilisant les tables OCR | **zéro occurrence** sur tout le dépôt |
| Grant `anon` sur la résolution de jeton | **confirmé** (migration 200, ligne 108) |
| Unicité réelle de `notifications_evenement_unique` | **inopérante** — `created_at` dans la clé |
| Patron d'idempotence correct | **trouvé** — `reserves_notifications_envois.cle_idempotence unique` |
| Catalogue Boutique | **vide** — aucun `insert into boutique_produits` |
| `check` de catégorie Boutique | fermé à 4 valeurs, aucune compatible NFC |
| Buckets publics | **1 sur 13** — `entreprise-assets` |
| Dépendances QR | `qrcode` et `@zxing/browser` **présentes** |
| Consommateurs de `@elsatia/client-contracts` | 4 fichiers GP (snapshot, identité légale, resend) |
| Intégrité du worktree et des branches | aucune suppression, aucune modification externe |

### 10.1 Recette du SQL proposé — exécutée en R2

Contrairement à R1, où aucun SQL n'était exécutable, la proposition a été **réellement
appliquée** sur un conteneur Postgres jetable, par-dessus les 272 migrations du train,
via le harnais existant `/Volumes/ELSATIA-DEV/ELSATIA-STACKS/train-v2-dbtest/harness.sh`
(image `supabase/postgres:17.6.1.143`, prélude `storage`, conteneur détruit après recette).

| Test | Attendu | Résultat |
|---|---|---|
| Application des 272 migrations puis de `contact-card-v1.sql.proposed` | s'applique sans erreur | **272 migrations appliquées, proposition appliquée sans erreur** |
| **D8** — deux notifications, même `cle_idempotence`, horodatages différents | la seconde est refusée | refusée — `duplicate key … notifications_cle_idempotence_unique` |
| **D4** — un même tiers porte les deux rôles | accepté, une seule fiche | accepté — `roles du tiers = fournisseur+sous_traitant` |
| **D1** — `ocr_actif = true` sans information affichée ni activateur | refusé | refusé — `contact_parametres_check` |
| **D3** — carte reçue passée en `classee` sans vérification humaine | refusé | refusé — `contact_cartes_recues_check2` |
| Formulaire réciproque sans consentement | refusé | refusé — `contact_cartes_recues_check1` |
| **D5** — clés étrangères de `candidats` vers `employes` ou la paie | **aucune** | **`AUCUNE`** — vérifié sur `information_schema` |
| **D2** — champ OCR décidé sans confirmateur ni date | refusé | refusé — `contact_analyses_ocr_champs_check` |
| **D2** — clôture d'une analyse alors qu'un champ reste `en_attente` | refusé | refusé — `Analyse …: confirmation impossible, des champs restent à vérifier individuellement` |

Les huit invariants sont donc **portés par la base**, pas seulement par l'interface : c'est
la différence entre une règle affirmée et une règle vérifiable. Aucune base réelle — locale,
préproduction ou Production — n'a été touchée.

## 11. Tests non exécutés — et pourquoi

| Test attendu (§16) | Pourquoi non exécuté |
|---|---|
| Les tests fonctionnels du produit | Ils portent sur un produit **qui n'existe pas encore**. Ce lot est un audit d'architecture : il n'a créé ni table, ni route, ni composant produit. **52 tests sont spécifiés** dans la spécification fonctionnelle (§8), dont 12 ajoutés par les décisions D1 à D10, prêts à être écrits au lot de réalisation. |
| Vérification sur une base **réelle** (locale, préproduction, Production) | Le CLI Supabase est bloqué sur ce poste, et la base locale est au ledger 265 : un `db reset` y détruirait le jeu multi-app de test. La recette a donc été faite sur un **conteneur jetable** (§10.1), ce qui vérifie le schéma et les invariants — mais ne dit rien du comportement sur des données réelles ni des performances. |
| Preuve E2E du hors-ligne | Rien n'est construit. Conformément au §12, **aucun fonctionnement hors ligne n'est annoncé** sans preuve. |
| Preuve OCR | Aucun code OCR n'existe. Aucune promesse de taux de reconnaissance n'est faite. |
| Rendu mobile | Les maquettes fournies sont des wireframes statiques isolés, non un produit mesuré. |

---

## 12. Livrables

| Fichier | Objet |
|---|---|
| `docs/audits/ELSATIA-CONTACT-CARD-ARCHITECTURE-AUDIT-REPORT.md` | ce rapport |
| `docs/audits/ELSATIA-CONTACT-CARD-FUNCTIONAL-SPECIFICATION-V1.md` | parcours, écrans, états, tests attendus |
| `docs/audits/ELSATIA-CONTACT-CARD-GP-INTEGRATION-MAPPING-V1.md` | correspondance champ par champ avec Gestion Pro |
| `docs/audits/ELSATIA-CONTACT-CARD-PRIVACY-SECURITY-MODEL-V1.md` | sécurité, RGPD, RLS, rétention |
| `docs/audits/contact-card-wireframes/index.html` | wireframes fonctionnels isolés (fichier autonome, ne touche aucun produit) |
| `docs/migrations-proposees/contact-card-v1.sql.proposed` | **NON INTÉGRÉ — BLOQUÉ PAR LE TRAIN GLOBAL** |

---

## 13. Décisions — arbitrage de Julien

Les dix décisions ont été rendues. Elles sont **fermées** et intégrées à ce rapport, à la
spécification fonctionnelle, à la correspondance Gestion Pro, au modèle de sécurité et au
SQL proposé.

### 13.1 Décisions fermées

| # | Décision rendue | Traduction dans les documents |
|---|---|---|
| **D1** | **OCR au périmètre cible**, facultatif et **désactivable par entreprise** | Double interrupteur : `FEATURE_AI_ENABLED` (plateforme, *fail-closed*) **et** `contact_parametres.ocr_actif` (entreprise, **faux par défaut**). Les deux doivent être vrais. Une entreprise peut couper l'OCR sans couper le produit. |
| **D2** | Traitement OCR **annoncé**, conforme RGPD, **confirmation humaine champ par champ** | La confirmation globale est abandonnée au profit d'une table par champ, `contact_analyses_ocr_champs`. Un champ non confirmé n'est **jamais** repris. Bandeau d'information avant tout envoi d'image, et transfert au tiers IA porté au registre. |
| **D3** | **Aucune création automatique** par l'OCR — client, fournisseur, sous-traitant, partenaire, candidat, salarié | Déjà garanti par la portée `client:propose` ; désormais aussi par contrainte de base : une carte reçue ne quitte l'état « à vérifier » que si `verifiee_par` **et** `verifiee_at` sont renseignés. |
| **D4** | **Rôles multiples** de tiers, notamment fournisseur **et** sous-traitant | `fournisseurs_roles` remplace `type_tiers` comme source de vérité (§6.4). Coût mesuré : 6 usages, 4 fichiers. Retrait de la colonne dans un lot ultérieur, pas dans celui-ci. |
| **D5** | **Vivier de candidats** distinct des salariés ; « futur employé » ne crée qu'une **proposition de candidat** | Table `candidats` **sans aucune clé étrangère vers `employes`**, statut initial `propose`. Le passage au salariat reste un geste RH manuel. |
| **D6** | Registres **partenaires** et **contacts professionnels généraux** | Tables `partenaires` et `contacts_professionnels`, plus `tiers_liens` pour le cumul inter-registres sans fusion (§6.5). |
| **D7** | `prenom` et `telephone_mobile` sur les contacts clients | `alter table public.contacts_clients` dans le SQL proposé, plus `notes` et `statut` pour rejoindre `ClientContact`. |
| **D8** | **Idempotence réelle** des notifications, indépendante de `created_at` | Colonne `cle_idempotence text unique` sur `notifications_utilisateurs` et retrait de l'index trompeur `notifications_evenement_unique`. Corrige une dette **préexistante** que ce lot révèle sans l'avoir introduite. |
| **D9** | **`client:propose` conservée impérativement** | Inchangée, et désormais énoncée comme invariant non négociable : Contact / Card propose, Gestion Pro confirme. Aucune écriture directe, quelle que soit la confiance de l'OCR. |
| **D10** | Produit **utilisable sans Gestion Pro** | Carnet autonome, boîte de réception, recherche, classement, doublons et export : le socle est conçu pour fonctionner seul, le pont Gestion Pro reste optionnel et révocable. |

### 13.2 Décisions encore ouvertes

Quatre points restent à trancher. Aucun ne bloque la conception ; tous bloquent une mise en
service.

| # | Question ouverte | Pourquoi elle doit être tranchée |
|---|---|---|
| **O1** | **Quand le train rouvre-t-il ?** | C'est la seule condition restante du verdict (C1). Tant que le ledger est en réconciliation, rien de ce qui est proposé ici ne peut devenir une migration. |
| **O2** | **Conservation des images de cartes** — délai exact avant suppression de l'original après confirmation | Exigence RGPD ; l'ancienne décision D6 sur ce point n'a pas été rendue. Proposition : suppression à la confirmation, purge de sécurité à 30 jours. |
| **O3** | **Fournisseur d'OCR, coût et contrat** | D1 ouvre l'OCR sans nommer le fournisseur. Le seul implémenté est OpenAI ; les images de cartes partiraient chez un tiers. À porter au registre et à couvrir contractuellement avant d'activer quoi que ce soit. |
| **O4** | **Domaine des cartes publiques** | Un sous-domaine dédié reste recommandé : une page publique atteignable par n'importe qui ne doit pas partager l'origine — donc les cookies — de l'application authentifiée. |

Deux points antérieurement listés comme décisions sont **sortis du périmètre** et ne
demandent aucun arbitrage aujourd'hui : la forme applicative (application autonome
`apps/contact`, imposée par D10) et l'ouverture Boutique des cartes physiques, qui reste
hors périmètre et sans prix, délai, garantie ni stock.

---

## 14. Ce qui peut être promis en V1, et ce qui ne peut pas

**Livrable sans dépendre du train** — le socle autonome ne touche aucune table existante :
partage NFC / QR / lien ; page publique sans application ; vCard téléchargeable ; échange
réciproque par formulaire consenti ; boîte de réception ; saisie manuelle et lecture de QR ;
classement explicite ; détection de doublon ; carnet autonome sans Gestion Pro ; gestion,
suspension et révocation des cartes ; notifications avec état de lecture ; isolation
multi-tenant.

**Au périmètre cible, mais suspendu à la réouverture du train** (C1/O1) : l'OCR facultatif
avec confirmation champ par champ (D1, D2) ; les rôles multiples de tiers (D4) ; le vivier
de candidats (D5) ; les registres partenaires et contacts généraux (D6) ; `prenom` et
`telephone_mobile` sur les contacts clients (D7) ; l'idempotence réelle des notifications
(D8) ; le versement vers Gestion Pro, qui suppose les destinations ci-dessus.

**Ne sera pas promis, quelle que soit la décision** :
la création automatique d'une fiche — client, fournisseur, sous-traitant, partenaire,
candidat ou salarié — interdite par conception (D3, D9) ; un fonctionnement hors ligne tant
qu'aucune preuve E2E n'a été produite ; la vente de cartes physiques, hors périmètre et sans
prix, délai, garantie ni stock.

---

## 15. Traçabilité

| Élément | Valeur |
|---|---|
| Branche | `audit/elsatia-contact-card-architecture-v1` |
| SHA de base complet | `1fc1331842cdf5980b374169994587813bdee7b6` |
| SHA de la révision R1 (audit initial) | `5fb137770f7ae5e24bd0bb19b5a4528612958b54` |
| **SHA du commit des livrables** | `5fb137770f7ae5e24bd0bb19b5a4528612958b54` |
| **SHA final poussé** | tête de la branche après le commit de traçabilité — un document ne peut pas contenir l'empreinte du commit qui l'introduit ; le SHA est donné dans le compte rendu du lot et lisible par `git rev-parse origin/audit/elsatia-contact-card-architecture-v1` |

Aucune fusion, aucun déploiement, aucune migration canonique, aucune modification de
`main`, aucune écriture en Production.
