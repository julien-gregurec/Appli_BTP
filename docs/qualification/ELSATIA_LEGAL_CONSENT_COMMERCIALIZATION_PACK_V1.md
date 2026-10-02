# ELSATIA — Legal & Consent Commercialization Pack — V1

| | |
|---|---|
| Lot | `ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1` |
| Date | 02/10/2026 |
| Application | ELSATIA Gestion Pro (GP) |
| Branche de travail | `claude/bold-allen-7mx7xz` |
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc76` (train canonique V8, « LOCALLY QUALIFIED ») |
| Production | **Non touchée.** Aucune migration appliquée hors base locale jetable, aucune variable d'environnement modifiée, aucun appel Stripe / Supabase / Vercel / Brevo, rien publié. |
| Nature | Préparation technique et documentaire. **Ce document n'est pas un avis juridique.** |

## Verdict

# ELSATIA LEGAL CONSENT PACK — TECHNICALLY INTEGRATED, OWNER DECISIONS REQUIRED

- **Intégré et testé localement** : source unique de l'identité vendeur ; preuve d'acceptation
  CGU / CGV / DPA versionnée, horodatée, append-only, cloisonnée par entreprise ; garde serveur
  qui empêche toute création d'entreprise et toute souscription payante sans acceptation de la
  version en vigueur ; ré-acceptation pilotée par version ; page publique `/dpa`.
- **Non décidé (et volontairement non décidé ici)** : régime de TVA, publication de l'adresse,
  durées de conservation, conservation des preuves elles-mêmes, collecte de l'adresse IP,
  validation du texte des CGU/CGV/DPA comme « version 1 » commercialisable.

### Pourquoi la branche a été repositionnée

La branche désignée pointait sur `main` (`4d92ddb`, 29/07/2026), en retard de deux mois et
d'environ 200 migrations sur le développement réel. Le dépôt compte 360 branches ; le train
canonique V8 (`integration/elsatia-canonical-train-v8`, 30/09/2026) est la base de toutes les
sessions récentes. La branche ne portait aucun commit propre : elle a été recréée sur V8 avant
tout travail (`git checkout -B … origin/integration/elsatia-canonical-train-v8`).

---

## 1. Identité vendeur — source unique

**Fichier : `src/lib/identite-vendeur.ts`** (`IDENTITE_VENDEUR`). Chaque champ porte un statut
`PROUVE` (valeur + provenance) ou `DECISION_REQUIRED` (valeur `null`, jamais devinée).
`identite-vendeur.test.ts` vérifie la cohérence avec la ligne légale des e-mails
(`packages/email/src/identite.ts`) et avec le pack `docs/juridique/`.

| Champ | Valeur | Statut | Provenance dans le dépôt / les branches |
|---|---|---|---|
| Exploitant | Julien GREGUREC | PROUVE | `docs/juridique/mentions-legales.md` ; `packages/email/src/identite.ts` ; audit `ELSATIA_LEGAL_IDENTITY_COMMERCIALIZATION_AUDIT_V1` (branche `claude/awesome-franklin-se2s33`) |
| Nom commercial | ELSATIA | PROUVE | mentions légales, CGV, DPA |
| Forme / statut | entrepreneur individuel (EI) | PROUVE | idem |
| SIREN | 850 559 873 | PROUVE | préfixe du SIRET vérifié en Production et du RCS (clé de Luhn valide, testée) |
| RCS | 850 559 873 R.C.S. Strasbourg | PROUVE | `packages/email/src/identite.ts` ; audit identité V1 (immatriculation du 28/09/2026) |
| RNE | — | **DECISION_REQUIRED** | aucune attestation ni numéro RNE cité |
| SIRET | 850 559 873 00011 | PROUVE | `NEXT_PUBLIC_LEGAL_SIRET` « provisionnée et vérifiée conforme » sur `elsatia-production` le 05/09/2026 (`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md` §5.8, `ELSATIA_PRODUCTION_ROLLBACK_V1.md` §10) |
| Domaine site | elsatia.fr | PROUVE | `docs/juridique/README.md` |
| Domaine application | app.elsatia.fr | PROUVE | README ; `NEXT_PUBLIC_APP_URL` vérifiée en Production |
| E-mail de contact | support@elsatia.fr | PROUVE | README (« opérationnelle, configurée en Production ») ; diffusé par `SUPPORT_EMAIL`. ⚠️ La valeur Production est `sensitive` (non relisible) ; l'audit de `awesome-franklin` (non fusionné) utilisait `contact@elsatia.fr` « à confirmer » — **V8 fait foi** |
| Adresse | — | **DECISION_REQUIRED** | une adresse personnelle figure dans `mentions-legales.md` comme « retenue pour l'immatriculation » ; **aucune décision explicite de publication** (vs domiciliation) n'est tracée. Non reprise dans la source |
| Régime de TVA | — | **DECISION_REQUIRED** | `NEXT_PUBLIC_LEGAL_TVA` volontairement vide en Production ; repli « à confirmer » |
| N° TVA intracommunautaire | — | **DECISION_REQUIRED** | dépend du régime |
| Code APE/NAF | — | **DECISION_REQUIRED** | non cité |

Aucune donnée personnelle non nécessaire n'a été ajoutée (ni date de naissance, ni adresse, ni
téléphone). Le test `identite-vendeur.test.ts` interdit l'apparition de l'adresse personnelle
dans la source.

**Modification documentaire factuelle :** `mentions-legales.md` porte désormais la ligne
« Immatriculation : 850 559 873 R.C.S. Strasbourg » (le RCS était absent des mentions publiées
alors qu'il figure dans chaque e-mail). SIRET et TVA restent substitués par variables
d'environnement, sans changement de comportement.

---

## 2. Où l'identité vendeur doit apparaître — constat

| Support | Émetteur technique | Identité présente aujourd'hui | Manque / risque | Classement |
|---|---|---|---|---|
| **Facture d'abonnement** | Stripe Billing (`factures_abonnement` = copie par webhook ; l'application ne génère pas le PDF) | Dépend **entièrement** du paramétrage du compte Stripe plateforme (hors dépôt) | Nom, adresse, SIREN/RCS, mention TVA (régime), pied de facture, préfixe de numérotation : à configurer dans le Dashboard Stripe. `STRIPE_AUTOMATIC_TAX_ENABLED` doit suivre le régime retenu | Décision propriétaire (TVA, adresse) + paramétrage opérateur |
| **Avoir d'abonnement** | Stripe (credit notes) — **aucun code** n'en émet ; uniquement par le Dashboard | Idem facture | Même paramétrage ; aucune procédure documentée d'émission d'avoir | Décision propriétaire + validation comptable |
| **Factures / avoirs des clients** (BTP) | Entreprise cliente (Gestion Pro) | Identité **du client** (pas d'ELSATIA) | Rien à ajouter : ELSATIA n'est pas l'émetteur | — |
| **Boutique matériel** | Stripe Checkout `mode: payment` (`src/lib/stripe-boutique.ts`) | Aucune facture émise (pas d'`invoice_creation`) | Vente de biens hors activité déclarée (SaaS) ; absence de facture | Avocat + comptable (déjà relevé, audit identité V1 §12-4) |
| **CGV** | `docs/juridique/cgv.md` | Exploitant, EI, nom commercial ; TVA par jeton | Ni RCS, ni SIRET, ni adresse, ni moyen de contact dans le texte | Validation avocat (toute modification = nouvelle version à faire accepter) |
| **CGU** | `docs/juridique/cgu.md` | **Aucune identité** de l'Éditeur | À compléter lors de la relecture | Validation avocat |
| **DPA** | `docs/juridique/dpa-entreprises-clientes.md` | Exploitant, EI, nom commercial | Renvoie à `rgpd-sous-traitants.md`, document **interne** non publié | Validation avocat |
| **Mentions légales** | `docs/juridique/mentions-legales.md` | Exploitant, EI, nom commercial, **RCS (ajouté)**, SIRET (env), TVA (env), e-mail (env), adresse | Adresse : décision de publication ; TVA : « à confirmer » | Décision propriétaire |
| **E-mails transactionnels** | Brevo, gabarit commun `@elsatia/email` | « ELSATIA — édité par Julien GREGUREC, EI, 850 559 873 R.C.S. Strasbourg. » dans tous les gabarits (testé) ; jamais d'adresse postale | Conforme à la source | Intégré |
| **E-mails Supabase Auth** | Supabase (console) | Gabarits hors dépôt | Expéditeur / pied à vérifier en console | Opérateur |
| **Pied de page public** | `PiedLegal` | Liens légaux (+ DPA ajouté) | — | Intégré |

Incohérence TVA relevée (non tranchée) : les CGV disent « prix indiqués en euros hors taxes »
et `/tarifs` affiche « HT », alors que le régime n'est pas confirmé. Si la franchise en base
était retenue, l'affichage « HT » et la mention obligatoire seraient à revoir ; si
l'assujettissement l'était, Stripe Tax et le n° de TVA seraient à configurer. **Décision
propriétaire + comptable.**

---

## 3. Acceptation CGU / CGV / DPA — mécanisme de preuve

### 3.1 Ce qui est accepté, et par qui

| Document | Version en vigueur | Portée | Lisible avant acceptation |
|---|---|---|---|
| CGU | `1.0` (`cgu.md`, sha256 `736ff027…`) | **utilisateur** (chaque personne) | `/cgu` |
| CGV | `1.0` (`cgv.md`, sha256 `3c1a468c…`) | **entreprise** (accepté au nom de l'entreprise) | `/cgv` |
| DPA | `2026-08-24` (`dpa-entreprises-clientes.md`, sha256 `7d9c7384…`) | **entreprise** | **`/dpa` (nouvelle page publique)** — le DPA « fait partie intégrante » des CGV (art. 9) mais n'était publié nulle part |

La politique de confidentialité et les mentions légales ne sont **pas** soumises à acceptation :
ce sont des informations (RGPD art. 13, LCEN), pas un contrat.

### 3.2 Modèle de données — migration `20261002000901_acceptations_documents_legaux_v1.sql`

- `platform.documents_legaux_versions` : catalogue **immuable** (code, version, empreinte
  SHA-256 du fichier, portée, date d'effet, `reacceptation_requise`).
- `platform.acceptations_documents_legaux` : journal **append-only** (triggers refusant
  UPDATE / DELETE / TRUNCATE, même pour un superutilisateur) :
  `utilisateur_id`, `entreprise_id`, `document_code`, `document_version`,
  `document_empreinte_sha256`, `contexte` (`creation_entreprise` | `souscription_abonnement` |
  `reacceptation`), `accepte_le` (**horodatage serveur** `clock_timestamp()`, jamais fourni
  par le client).
- Schéma `platform` : aucun grant à `anon` / `authenticated` ; lecture `service_role`
  seulement. Hors du balayage dynamique `entreprise_id` de la purge RGPD (`public.*`) : la
  preuve est **conservée par défaut** (fail-closed), comme `platform.purge_audit`.
- Pas de clé étrangère vers `auth.users` ni `public.entreprises` : supprimer un compte ou
  purger une entreprise n'efface pas la preuve par cascade.

### 3.3 RPC (exécutables par `authenticated` uniquement)

| RPC | Rôle | Contrôles |
|---|---|---|
| `creer_entreprise_avec_acceptation(nom, siret, adresse, cp, ville, documents)` | Remplace l'appel direct à `creer_entreprise_bootstrap` dans `createEntrepriseAction` | Création + preuve **dans la même transaction** ; refus si un document en vigueur manque → **aucune entreprise orpheline** |
| `accepter_documents_legaux(entreprise, contexte, documents)` | Enregistre l'acceptation | Version **et** empreinte = celles en vigueur, sinon refus global ; CGV/DPA : membre actif avec `gerer_parametres` (indépendant de l'état commercial, pour permettre un réabonnement) ; idempotent |
| `documents_legaux_a_accepter(entreprise)` | Ce qui reste à accepter | Refus si l'appelant n'est pas membre actif de l'entreprise (pas de sondage cross-tenant) |
| `acceptations_documents_legaux_entreprise(entreprise)` | Historique des preuves pour l'administrateur | `gerer_parametres` dans **cette** entreprise ; aucune donnée personnelle au-delà de l'identifiant interne |

### 3.4 Données volontairement non collectées

- **Adresse IP, user-agent : non stockés.** La preuve repose sur un compte authentifié, un
  horodatage serveur et l'empreinte du texte exact. L'IP n'apporte pas de justification
  nécessaire et proportionnée identifiée à ce stade (minimisation). **Si un avocat la juge
  utile à la force probante, c'est une décision explicite** (finalité, durée, information
  dans la politique de confidentialité) et une colonne additionnelle.
- Aucune copie du texte en base : l'empreinte SHA-256 + le fichier versionné dans Git suffisent
  à reconstituer le texte exact accepté. **Recommandation** : archiver hors dépôt (PDF horodaté)
  chaque version publiée.

### 3.5 Parcours applicatifs

| Parcours | Avant | Après |
|---|---|---|
| Création d'entreprise (`/onboarding`) | Aucune acceptation | Case **non cochée** + liens CGU/CGV/DPA versionnés ; refus serveur si non cochée ou versions affichées périmées ; RPC atomique |
| Souscription (`/onboarding/besoins`, `/abonnement`) | Aucune acceptation | Même case dans chaque formulaire d'offre ; `demarrerAbonnementAction` enregistre la preuve (`souscription_abonnement`) puis vérifie qu'il ne reste rien à accepter **avant tout appel Stripe** ; fail-closed sur erreur |
| Nouvelle version | — | Migration insérant la version ; si `reacceptation_requise`, toute acceptation antérieure cesse de valoir et la prochaine souscription la redemande ; sinon l'acceptation antérieure reste valable |

Garde de non-régression : `documents-legaux-versions.test.ts` échoue si un fichier accepté est
modifié sans nouvelle version (empreinte) ou sans migration correspondante.

### 3.6 Limites connues (non traitées, à décider)

1. **Entreprises existantes** : aucune preuve rétroactive. Elles seront invitées à accepter à leur
   prochaine souscription. Faut-il exiger une acceptation à la prochaine connexion d'un
   administrateur ? → décision propriétaire.
2. **Salariés rejoignant une entreprise** (code d'adhésion, fiche employé) : aucune acceptation
   des CGU demandée. Un mécanisme existe (portée `utilisateur`) ; l'activer est une décision.
3. **Entreprises créées par la plateforme** (`plateforme_creer_entreprise`) : pas d'acceptation
   en ligne ; le contrat est alors signé hors application — à documenter.
4. **Ré-acceptation pour un abonnement en cours** (sans nouvelle souscription) : la CGV art. 15
   prévoit une notification à 30 jours. Le mécanisme sait dire « à ré-accepter » ; aucun écran
   ni blocage n'est imposé aux abonnés actifs.
5. **Export RGPD** : les preuves d'acceptation ne figurent pas dans l'export de l'entreprise.
6. **Stripe Checkout** `consent_collection[terms_of_service]` non utilisé : la preuve vit dans
   la base ELSATIA, pas chez Stripe. Option à évaluer.
7. Le texte « Version 1.0 » des CGU/CGV est encore un **brouillon à faire relire** (README du
   pack). Les versions enregistrées sont les fichiers actuels ; si l'avocat modifie le texte,
   il faudra une nouvelle version **avant** l'ouverture (`ABONNEMENTS_PUBLICS_OUVERTS` reste
   `false` en Production).

---

## 4. Sous-traitants et destinataires réellement présents dans le code

Constat par lecture du code V8 (aucun accès aux consoles). « Actif » = présent dans le code
**et** documenté comme activé ; l'activation réelle en Production n'est pas relisible ici.

| Prestataire | Rôle | Preuve dans le code | Statut d'activation | Localisation | Registre interne | Politique publique |
|---|---|---|---|---|---|---|
| Supabase | BDD, Auth, Storage | `@supabase/*`, `src/lib/supabase/*` | Actif | `eu-west-3` Paris (confirmé README) | ✅ | ✅ |
| Vercel | Hébergement, fonctions | `vercel.json` (`regions: ["fra1"]`) | Actif | Francfort (fonctions) | ✅ | ✅ |
| Stripe | Abonnements (Billing), Connect (paiement des factures des clients), Boutique | `src/lib/stripe-*.ts`, webhooks | Billing actif en **mode Test** ; Boutique non active | Irlande (Stripe Payments Europe) | ✅ | ✅ |
| Brevo | E-mails transactionnels | `packages/email/src/brevo.ts` (`api.brevo.com`) | Actif (`BREVO_API_KEY`) | France | ✅ | ✅ |
| Sentry | Erreurs applicatives | `sentry.*.config.ts`, `sendDefaultPii: false` | Actif en Production | DSN de repli `…ingest.de.sentry.io` → région **UE (Allemagne)** pour ce projet ; DSN Production non relisible | ✅ « à confirmer » | ✅ « à confirmer » — l'indice DE est à confirmer en console |
| OpenAI | Assistant IA, devis assistés | `src/lib/ai/providers/openai.ts` (`store: false`) | Derrière `FEATURE_AI_ENABLED`, attendu `false` en Production (valeur non relisible, runbook rollback §10) | États-Unis | ✅ | ✅ |
| Powens | Initiation de virements | `src/lib/banking.ts`, callback | **Non actif** (registre) | — | Mentionné « non actif » | Non listé — **correct tant que non activé** |
| OpenStreetMap (tuiles) | Fond de carte des chantiers | `src/lib/carte-tuiles.ts` → `tile.openstreetmap.org` chargé **par le navigateur** | Actif | Serveurs OSMF | ❌ | ❌ — l'IP du visiteur part chez un tiers ; à qualifier (destinataire, politique d'usage des tuiles en usage commercial) |
| Services push des navigateurs | Notifications push | `src/lib/push.ts` (`web-push`, VAPID) | Actif si l'utilisateur l'autorise | Google / Mozilla / Apple selon navigateur | ❌ | ❌ — charge chiffrée de bout en bout ; à qualifier |
| NHTSA vPIC | Référentiel de modèles de véhicules | `src/app/api/referentiels/vehicules/route.ts` | Actif | États-Unis | — | — Seule la **marque** saisie est envoyée, appel serveur, aucune donnée personnelle : pas un sous-traitant |
| Google Play / Apple | Achats in-app de l'application **Tools** | variables `GOOGLE_PLAY_*`, `APPLE_ROOT_CA_BASE64` | Facultatif, Tools | — | ❌ | ❌ — hors périmètre GP, à traiter avec Tools |
| Resend, Redis | Studio (invitations, file de rendu) | `STUDIO_RESEND_API_KEY`, `STUDIO_REDIS_URL` | Studio uniquement | — | ❌ | ❌ — hors périmètre GP, à traiter avec Studio |
| Twilio, Google Document AI | — | **Absents du code V8** | — | — | Retirés | Non déclarés — **correct** |

Aucun fournisseur non utilisé n'a été ajouté aux documents. Les écarts (OSM, push) sont
signalés, pas déclarés : leur qualification juridique (sous-traitant, destinataire, tiers
autonome) relève de l'avocat.

---

## 5. Matrice de conservation — décisions requises

Aucune durée n'est fixée par ce lot. Colonne « Texte publié » : ce que les documents annoncent
**aujourd'hui** ; colonne « Technique » : ce qui est réellement codé (source :
`ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md`, `ELSATIA_OWNER_DECISIONS_FINAL_V1.md`).

| Donnée | Texte publié | Technique (V8) | Décision |
|---|---|---|---|
| Compte utilisateur | « durée du contrat + 30 jours » | `auth.users` / `utilisateurs` hors purge entreprise : **jamais supprimés** | **DECISION_REQUIRED** |
| Données de l'entreprise après résiliation | « 30 jours puis suppression » (CGV 10.2) | Purge écrite et testée, **planificateur désactivé** (`RGPD_PURGE_PLANIFICATEUR_MODE` vide, exige une décision écrite) | **DECISION_REQUIRED** (activation) |
| Contrats acceptés (devis, avenants des clients) | — | Stratégie `conserver_contrat_minimise` retenue, **non active** : durée, point de départ, photos non renseignés (`docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md`) | **DECISION_REQUIRED** (A, B, C du formulaire) |
| Contrat ELSATIA ↔ client : **preuves d'acceptation CGU/CGV/DPA** (nouveau) | — | Conservées indéfiniment (append-only, hors purge) | **DECISION_REQUIRED** : durée et point de départ |
| Factures et avoirs (des clients ; d'abonnement chez Stripe) | « 10 ans (obligation comptable) » | RETAIN sans durée | **DECISION_REQUIRED** (durée exacte ; validation comptable) |
| Journaux (techniques, activité) | « 6 à 12 mois » | `journal_activite` RETAIN sans durée, `utilisateur_id` en clair ; journaux fournisseurs non vérifiés | **DECISION_REQUIRED** |
| Photos de chantier | — | Supprimées à la purge entreprise ; aucune durée pendant le contrat | **DECISION_REQUIRED** |
| GPS de pointage et photos de pointage | — | Supprimés à la purge entreprise ; **conservés** à l'anonymisation d'un salarié (P1-7) | **DECISION_REQUIRED** (preuve horaire vs effacement) |
| Justificatifs (notes de frais, factures fournisseurs) | — | RETAIN, archives immuables | **DECISION_REQUIRED** |
| Documents RH / paie | — | Module paie entier RETAIN ; `journal_audit_paie` immuable | **DECISION_REQUIRED** |
| Sauvegardes | « sauvegardes régulières / automatiques » (CGV 7.3, registre, politique, DPA) | Aucune sauvegarde récurrente prouvée dans le dépôt ; PITR/snapshots Supabase non vérifiés | **DECISION_REQUIRED** + correction des textes |
| Prospects / support | « 3 ans » / « contrat + 1 an » | Aucune table ni mécanisme | **DECISION_REQUIRED** |

---

## 6. Tests

### 6.1 Base de données réelle (PostgreSQL 16 local, harnais `scripts/local-postgres-bootstrap`)

- Rejeu complet : **372 migrations** appliquées proprement (dont `20261002000901`).
- `supabase/tests/acceptations_documents_legaux_v1.test.sql` : **41/41**.

| Exigence de la mission | Assertions |
|---|---|
| Aucune inscription commerciale sans version de CGU/CGV | création refusée sans document, liste vide, DPA manquant, version non en vigueur, empreinte altérée, document inconnu ; **aucune entreprise ni preuve partielle** laissée |
| Preuve enregistrée | document, version, empreinte, contexte, utilisateur, entreprise ; horodatage serveur ; idempotence |
| Nouvelle version → nouvelle acceptation si requis | CGV 1.1 (`reacceptation_requise`) redemandée, CGU 1.1 (non requise) non redemandée ; ancienne version refusée ; historique 1.0 + 1.1 conservé |
| Pas de fuite cross-tenant | A ne peut ni accepter pour B, ni sonder l'état de B, ni lire ses preuves ; A lit exactement ses 4 preuves ; l'acceptation de A ne vaut pas pour B |
| Append-only | UPDATE, DELETE, TRUNCATE refusés (même superutilisateur) ; version publiée non réécrivable |
| Droits | ouvrier sans `gerer_parametres` : n'engage pas l'entreprise, accepte ses CGU ; anon : aucun accès |

- Suite pgTAP complète (164 fichiers) sur la base incluant la migration : seuls échouent
  `platform_stripe_state_attestation_r72` (pgsodium factice du harnais, limite documentée),
  `elsatia_tools_cloud_sync_entitlement_closure_v1` et 7 suites `studio_*` (« Inscription
  fermée ») — **échecs identiques sur une base V8 de référence sans cette migration** (§6.3).

### 6.2 Application

| Contrôle | Résultat |
|---|---|
| `vitest run` (GP) | **2628 réussis**, 0 échec (207 fichiers) |
| Nouveaux tests | `identite-vendeur.test.ts`, `documents-legaux-versions.test.ts`, `acceptation-documents-legaux.test.ts` ; `DocumentLegal.test.ts` étendu (DPA servi, RCS seul numéro en dur) |
| `tsc --noEmit` | OK |
| `eslint` | 0 erreur (15 avertissements préexistants, aucun dans les fichiers du lot) |
| `verify:migrations` | 372 migrations valides |
| `verify:train-expectations` | OK après `sync:train-expectations` (372 / `20261002000901`) |
| `verify:secrets` | aucun secret |
| `next build` (GP) | OK (exit 0) ; route `/dpa` générée |

### 6.3 Base de référence (preuve que les échecs pgTAP sont préexistants)

Une base V8 **sans** la migration de ce lot (`baseline_v8`, 371 migrations, worktree
`integration/elsatia-canonical-train-v8` @ `53b4bc76`) a été reconstruite avec le même harnais,
puis les 9 suites en échec y ont été rejouées : **mêmes 9 échecs, mêmes compteurs** (8/16 pour
`cloud_sync`, 14 échecs pour l'attestation, 0 test exécuté pour les 7 suites Studio, erreur
« Inscription fermée »). Aucune régression imputable à ce lot.

---

## 7. Synthèse

### 7.1 Intégré techniquement

- `src/lib/identite-vendeur.ts` : source unique, statuts `PROUVE` / `DECISION_REQUIRED`, tests de cohérence (e-mails, pack juridique, SIREN/SIRET/RCS, Luhn, absence d'adresse).
- Migration `20261002000901` : catalogue de versions + journal append-only + 4 RPC.
- Garde serveur création d'entreprise (atomique) et souscription (avant Stripe), fail-closed.
- Composant `AcceptationConditions` (jamais pré-coché, `required`, versions figées dans le formulaire).
- Page publique `/dpa` (proxy, pied de page, navigation légale).
- RCS dans les mentions légales.
- Attendus du train synchronisés.

### 7.2 Information légale prouvée

Julien GREGUREC · EI · nom commercial ELSATIA · SIREN 850 559 873 · 850 559 873 R.C.S.
Strasbourg · SIRET 850 559 873 00011 · elsatia.fr / app.elsatia.fr · support@elsatia.fr ·
Supabase `eu-west-3` · Vercel `fra1`.

### 7.3 Décision propriétaire nécessaire

1. **Régime de TVA** (et n° de TVA, Stripe Tax, affichage HT, mention de facture).
2. **Adresse publiée** : adresse personnelle ou domiciliation (mentions légales, factures Stripe).
3. **Durées de conservation** : toute la matrice §5, y compris les **preuves d'acceptation**.
4. **Version commercialisable** des CGU/CGV/DPA (après relecture) et date d'effet.
5. Exiger ou non l'acceptation des CGU par les **salariés** et à la **connexion** des entreprises existantes.
6. Paramétrage du **compte Stripe** (identité, adresse, pied de facture, procédure d'avoir).
7. Confirmation de la région **Sentry** en console ; code APE ; attestation RNE.
8. Boutique matériel : activité déclarée et facturation.

### 7.4 Validation avocat recommandée

1. Relecture complète CGU / CGV / DPA (identité de l'Éditeur dans les CGU, RCS/SIRET/adresse dans les CGV, renvoi du DPA à un registre interne non publié).
2. Force probante du mécanisme d'acceptation (case + compte authentifié + horodatage serveur + empreinte) ; utilité de l'adresse IP.
3. Clause de modification unilatérale (CGU art. 10 « la poursuite de l'utilisation vaut acceptation ») vs ré-acceptation explicite.
4. Qualification d'OpenStreetMap (tuiles) et des services push des navigateurs.
5. Textes sur les sauvegardes et durées annoncées mais non appliquées.
6. Mentions obligatoires des factures d'abonnement (selon le régime de TVA retenu).

---

## 8. Mise en œuvre (quand le propriétaire le décidera — rien n'est fait ici)

1. Appliquer `20261002000901` **avant** de déployer le code : sans la migration, la création
   d'entreprise échoue (RPC absente) — échec fermé, aucune entreprise créée sans preuve.
2. Toute modification future de `cgu.md`, `cgv.md` ou `dpa-entreprises-clientes.md` :
   nouvelle migration (ligne de version), mise à jour de `src/lib/documents-legaux-versions.ts`,
   choix explicite de `reacceptation_requise`.
3. Aucune variable d'environnement nouvelle.

## 9. Fichiers

| Fichier | Nature |
|---|---|
| `src/lib/identite-vendeur.ts` (+ test) | nouveau |
| `src/lib/documents-legaux-versions.ts` (+ test) | nouveau |
| `src/lib/acceptation-documents-legaux.ts` (+ test) | nouveau |
| `src/components/AcceptationConditions.tsx` | nouveau |
| `src/app/dpa/page.tsx` | nouveau |
| `supabase/migrations/20261002000901_acceptations_documents_legaux_v1.sql` | nouveau |
| `supabase/tests/acceptations_documents_legaux_v1.test.sql` | nouveau |
| `src/app/actions/entreprise.ts`, `src/app/actions/abonnement.ts` | garde d'acceptation |
| `src/app/onboarding/page.tsx`, `src/app/onboarding/besoins/page.tsx`, `src/app/(app)/abonnement/page.tsx` | case d'acceptation |
| `src/lib/supabase/proxy.ts`, `src/components/DocumentLegal.tsx`, `src/components/PiedLegal.tsx` | route publique `/dpa` |
| `src/components/DocumentLegal.test.ts` | DPA + RCS |
| `docs/juridique/mentions-legales.md` | ligne RCS |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | attendus du train (script) |
