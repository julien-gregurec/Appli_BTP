# ELSATIA — Audit de cohérence de l'identité légale et de la commercialisation — V1

_Date de l'audit : 28/09/2026 — Dépôt audité : `julien-gregurec/Appli_BTP` (application ELSATIA Gestion Pro, ex-« Liria Gestion Pro »)_

## Verdict

# ELSATIA LEGAL IDENTITY ACTIONS REQUIRED

Le dépôt est désormais aligné sur l'identité officielle : exploitant, RCS, site elsatia.fr, date de commencement d'activité, marque ELSATIA dans l'interface et dans le pack juridique. Un contrôle automatisé bloque les régressions.
Il reste des actions **que seul l'exploitant ou un juriste peut trancher** (§12). Tant qu'elles ne sont pas faites, l'identité ne peut pas être déclarée « consistent ». Elles sont à traiter avant l'ouverture des ventes du 01/10/2026 : adresse publiée, régime de TVA, boîte contact, paramétrage Stripe, logos, boutique.

---

## 1. Référence officielle utilisée

| Champ | Valeur | Source dans le code |
|---|---|---|
| Exploitant | Julien GREGUREC, entrepreneur individuel (EI) | `src/lib/identite-legale.ts` |
| RCS | 850 559 873 R.C.S. Strasbourg | idem |
| Date d'immatriculation | 28/09/2026 | idem |
| Commencement d'activité | 01/10/2026 | idem (`DEBUT_COMMERCIALISATION` = 2026-10-01 00:00 Europe/Paris) |
| Site déclaré | elsatia.fr | idem |
| Activité | Edition, exploitation et commercialisation d'un logiciel en ligne (SaaS) de gestion d'entreprise et prestations de services numériques associées | idem |

Aucune donnée personnelle superflue n'a été ajoutée : pas de date de naissance ni d'adresse personnelle. L'adresse publiée reste un champ `LEGAL_REVIEW_REQUIRED`.
Le **SIRET** (SIREN + NIC) n'est pas connu : il n'a pas été inventé. Le RCS suffit comme identifiant dans les mentions légales ; on pourra ajouter le SIRET plus tard.

## 2. Méthode

- Recherche exhaustive `liria` (casse ignorée), placeholders (`[À COMPLÉTER]`, `[JJ/MM/AAAA]`, `[contact@…]`, `votre-domaine.fr`), RCS/SIREN/SIRET et domaines, sur les 709 fichiers suivis.
- Relecture des 9 documents de `docs/juridique/`, des pages publiques (`/`, `/tarifs`, `/login`, `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies`), des intégrations Stripe (Billing, Connect, boutique), des gabarits d'e-mail et des gabarits d'impression.
- Aucun appel Stripe réel. Aucune donnée utilisateur (base Supabase) n'a été lue ni analysée.

## 3. Site elsatia.fr (pages publiques de l'application)

| Élément | Avant | Après | Statut |
|---|---|---|---|
| Pied de page (`PiedLegal`) | « © Liria Gestion Pro » | « © ELSATIA Gestion Pro — Julien GREGUREC, entrepreneur individuel (EI) — 850 559 873 R.C.S. Strasbourg » + liens légaux | ✅ Corrigé |
| Mentions légales | Placeholders (nom entre crochets, adresse, SIRET, e-mail), URL vercel.app | Éditeur, EI, RCS, activité, elsatia.fr, directeur de publication, hébergeurs, contact | ✅ Corrigé ; adresse = `LEGAL_REVIEW_REQUIRED` |
| Contact | `[contact@liria… — À COMPLÉTER]` ou `contact@liria-gestion-pro.fr` | `contact@elsatia.fr` (surchargeable via `NEXT_PUBLIC_CONTACT_EMAIL`) | ⚠️ Boîte à confirmer (§12) |
| Copyright / marque | Liria Gestion Pro | ELSATIA Gestion Pro | ✅ |
| CGV / CGU / Confidentialité / Cookies | « Liria Gestion Pro », « [Julien GREGUREC] », dates `[JJ/MM/AAAA]` | ELSATIA Gestion Pro, identité et RCS complets, date de mise à jour 28/09/2026 | ✅ ; relecture juridique toujours requise |
| Titres de pages et métadonnées | « … — Liria Gestion Pro » | « … — ELSATIA Gestion Pro » | ✅ |

Rendu public : les notes internes `<!-- LEGAL_REVIEW_REQUIRED … -->` sont retirées avant publication. Les champs `[LEGAL_REVIEW_REQUIRED: …]` s'affichent « _en cours de mise à jour_ » (`src/lib/documents-legaux.ts`).

> Le site vitrine elsatia.fr proprement dit (hors application) **n'est pas dans ce dépôt** : il est à auditer séparément avec la même référence (§8).

## 4. Applications

| Application | Dans ce dépôt ? | Constat |
|---|---|---|
| **GP — Gestion Pro** | ✅ | Identité affichée renommée ELSATIA (menu, écran de connexion, PWA, assistant IA, aide/FAQ, invitations, paiement, abonnement, boutique, exports XLSX, RGPD). |
| Tools | ❌ | Non audité : dépôt absent de la session. À auditer avec `src/lib/identite-legale.ts` comme référence. |
| Colors | ❌ | Idem |
| Réserves | ❌ | Idem |
| Studio | ❌ | Idem |

## 5. Factures

### 5.1 Factures ELSATIA SaaS (ELSATIA → entreprises clientes)

- **Émises par Stripe Billing** (abonnement, options IA, dépassements stockage/appareils), puis recopiées dans `factures_abonnement` par le webhook `/api/stripe/abonnement/webhook`. L'application ne génère pas elle-même de PDF de facture ELSATIA.
- **L'identité vendeur de ces factures dépend entièrement du paramétrage du compte Stripe** (§6) : le code ne la contrôle pas.
- **Garde ajoutée** : `creerSessionAbonnementStripe` refuse de créer une session de paiement avant le 01/10/2026 00:00 (heure de Paris). Même règle pour `creerSessionCheckoutBoutique`. Stripe n'émet donc aucune facture, y compris la facture à 0 € d'ouverture d'essai, avant le commencement d'activité. Le test associé vérifie qu'aucun appel réseau Stripe n'a lieu.
- ⚠️ **Boutique matériel** (imprimantes, plastifieuses, étiquettes) : le paiement se fait en Checkout `mode=payment`, **sans `invoice_creation`**. Aucune facture n'est donc émise pour ces ventes B2B. → `LEGAL_REVIEW_REQUIRED` (§12).

### 5.2 Factures créées par les clients dans Gestion Pro

- Ce sont **les documents de l'entreprise cliente**, sous sa propre identité (nom, SIRET, adresse, logo). ELSATIA n'en est pas l'émetteur.
- **Correction** : en l'absence de logo client, les devis, factures et DOE imprimés affichaient **le logo « Liria Gestion Pro »** à la place du logo de l'émetteur. Le document laissait donc croire que le logiciel l'émettait. Désormais, aucun logo ne s'affiche si l'entreprise n'en a pas (`DocumentImprimable.tsx`, `imprimer/doe/[id]`).
- Les paiements en ligne de ces factures passent par **Stripe Connect** (compte Stripe du client). ELSATIA n'y apparaît pas comme vendeur. Rien à changer.
- Le relevé de variables de paie indique « Généré par ELSATIA Gestion Pro ». C'est une mention d'outil, pas une identité d'émetteur : conforme.

## 6. Stripe — champs d'identité vendeur attendus (checklist opérateur)

Aucun appel Stripe n'a été fait. À vérifier dans le **Dashboard Stripe du compte plateforme ELSATIA** (Billing + boutique), avant le 01/10/2026 :

- [ ] **Paramètres › Informations sur l'entreprise** : type = entrepreneur individuel ; nom légal = Julien GREGUREC ; SIREN/numéro d'immatriculation = 850 559 873 ; site web = https://elsatia.fr ; description d'activité conforme à l'activité déclarée.
- [ ] **Paramètres › Public details** : nom public = ELSATIA ; e-mail et URL de support (elsatia.fr) ; URL des CGV et de la politique de confidentialité = https://app.elsatia.fr/cgv et https://app.elsatia.fr/confidentialite (ou leurs équivalents sur elsatia.fr).
- [ ] **Libellé de relevé bancaire (statement descriptor)** : `ELSATIA` (5 à 22 caractères) — aucun libellé « LIRIA ».
- [ ] **Branding** : logo et couleurs ELSATIA (le logo actuel est encore Liria, voir §10).
- [ ] **Billing › Factures** : préfixe de numérotation propre à ELSATIA ; pied de facture avec « Julien GREGUREC, EI — 850 559 873 R.C.S. Strasbourg » et, si la franchise en base est confirmée, « TVA non applicable, art. 293 B du CGI » (`LEGAL_REVIEW_REQUIRED`).
- [ ] **Adresse de l'entreprise** affichée sur les factures : adresse professionnelle ou de domiciliation retenue (`LEGAL_REVIEW_REQUIRED`), cohérente avec les mentions légales.
- [ ] **Stripe Tax / `STRIPE_AUTOMATIC_TAX_ENABLED`** : cohérent avec le régime de TVA retenu.
- [ ] **Customer portal** : liens CGV/confidentialité et identité affichés = ELSATIA.
- [ ] **Produits et prix Stripe** (`STRIPE_PRICE_*`) : noms de produits sans « Liria ».
- [ ] **Premier encaissement** au plus tôt le 01/10/2026 ; aucun abonnement de test en mode live avant cette date.
- [ ] **Stripe Connect** (factures des clients) : nom de la plateforme affiché lors de l'onboarding OAuth = ELSATIA.

## 7. E-mails

| Élément | Constat |
|---|---|
| E-mails transactionnels applicatifs | **Aucun fournisseur actif** (pas de Resend, SMTP ni SendGrid). Les e-mails devis/factures/commandes sont des liens `mailto:` envoyés **depuis la messagerie du client**, signés au nom de son entreprise. Aucune identité ELSATIA dedans : correct. |
| E-mails d'authentification Supabase | Gabarits par défaut, SMTP non configuré dans le dépôt. → Opérateur : nom d'expéditeur « ELSATIA », domaine d'envoi elsatia.fr, `site_url` = https://app.elsatia.fr (console Supabase, hors dépôt). |
| Contact public | `contact@elsatia.fr` : pages Tarifs/Abonnement, pack juridique, `VAPID_SUBJECT` d'exemple. |
| Notifications push | Titre par défaut « ELSATIA Gestion Pro ». |
| Liens légaux | Pied de page présent sur `/`, `/tarifs` et `/login`, avec des liens vers les 5 pages légales. |

## 8. Domaines

| Domaine | Usage attendu | Dans ce dépôt |
|---|---|---|
| elsatia.fr | Site déclaré / vitrine | Cité dans les mentions légales, les CGV et `identite-legale.ts` |
| app.elsatia.fr | Gestion Pro | Valeur d'exemple de `NEXT_PUBLIC_APP_URL`. Aucune URL codée en dur : toutes les URL absolues (Stripe, invitations) viennent de `NEXT_PUBLIC_APP_URL`. |
| tools / colors / reserves / studio.elsatia.fr | Autres applications | Déclarés dans `DOMAINES_ELSATIA` ; applications hors dépôt |
| liria-concept-gestion-btp.vercel.app | Ancienne URL de production | Retirée du pack juridique. Reste citée dans `RELAIS_CHATGPT.md` (historique). |
| liria-gestion-pro.fr, liria.fr | Anciens domaines de contact | Retirés du code |

Opérateur : vérifier dans Vercel que `NEXT_PUBLIC_APP_URL=https://app.elsatia.fr` en production, que app.elsatia.fr est rattaché au projet et que l'URL vercel.app redirige. Mettre à jour en même temps les URL de redirection Supabase et les URL de retour Stripe.

## 9. Date de commercialisation

- Référence : `DEBUT_COMMERCIALISATION` = 01/10/2026 00:00 Europe/Paris.
- Aucune session Stripe payante (abonnement ou boutique) n'est possible avant cette date, garde testée.
- Les documents juridiques portent la date de **mise à jour** 28/09/2026, date de rédaction et non de vente. Les CGV précisent que les souscriptions payantes s'ouvrent le 1er octobre 2026.
- Fixtures et tests (juillet 2026, etc.) : dates clairement fictives, non modifiées.
- Scripts `supabase/production/creer_entreprise_demo_18_mois.sql` : données de démonstration d'un **client fictif** (SIRET `99999999999999`) et non des factures ELSATIA. Non concernés.

## 10. Ancienne marque « Liria » — classification

Après correction, il reste 366 occurrences dans 76 fichiers, **toutes classées** :

| Emplacement | Classe | Décision |
|---|---|---|
| Textes affichés dans `src/` (menu, titres, FAQ, assistant IA, paiement, boutique, PWA, aide…) | SHOULD_RENAME | ✅ **Renommés** en ELSATIA / ELSATIA Gestion Pro |
| Pack `docs/juridique/*` | SHOULD_RENAME | ✅ **Renommé** |
| Classes CSS `liria-navy/gold…`, variables `--liria-*` | DO_NOT_TOUCH | Identifiants techniques invisibles ; les renommer toucherait tout le design |
| Clés localStorage (`liria-dashboard-*`, `liria-appareil-id`, `liria:gps:*`, `liria-presence-*`), événement `liria:ouvrir-assistant` | DO_NOT_TOUCH | Les renommer effacerait les préférences et appareils des utilisateurs |
| Variables d'environnement `LIRIA_BUILD_*`, `LIRIA_APP_VERSION`… (`next.config.ts`, `version.ts`) | DO_NOT_TOUCH | Configuration de déploiement |
| Nom de paquet `liria-gestion-pro` (`package.json`), cache SW `liria-v3`, schéma d'export `liria-gestion-pro/expense-export/v1` | DO_NOT_TOUCH | Identifiants techniques et format d'archive déjà produit |
| Préfixes QR `LGP-*` | DO_NOT_TOUCH | Étiquettes déjà imprimées et collées |
| **Assets binaires** : logo `liria-gestion-pro-logo-v5.png` (affiche « Liria Gestion Pro »), icônes PWA, guide PDF, vidéos et sous-titres `.vtt` (synchronisés avec la voix off « Liria ») | SHOULD_RENAME | ⚠️ **À régénérer** : nouveaux visuels et vidéos ELSATIA. Les sous-titres ne peuvent pas être modifiés seuls sans décalage avec l'audio. |
| Scripts de génération (`scripts/guide/*`, `scripts/video/*`, `create-liria-videos.py`…), `output/` | SHOULD_RENAME | À renommer au moment de la régénération des assets |
| Migrations `supabase/migrations/*` (commentaires, libellés de permissions) | LEGACY_HISTORY / DO_NOT_TOUCH | Migrations immuables |
| Fiche fournisseur auto-créée **« Liria (boutique) »** (migrations 175/176) | SHOULD_RENAME | ⚠️ Nom visible dans les données des clients. Il faut une nouvelle migration qui renomme les lignes et la fonction de recherche par nom. Pas faite ici : cela dépend de la décision sur la boutique (§12). |
| `supabase/production/supprimer_entreprises_test.sql` (tenant « LIRIA CONCEPT ») | USER_CONTENT | Nom d'une entreprise cliente réelle en base : ne pas toucher |
| Fixtures de tests (`"Liria Concept"`, `"Liria"`) | USER_CONTENT (fictif) | Non modifiées |
| `RELAIS_*.md`, `PROMPT_*.md`, `SUIVI_BESOINS_METIER.md`, `PRODUCTION_CHECKLIST.md`, `docs/*.md` hors juridique | LEGACY_HISTORY | Historique de conception, non publié |

Note données personnelles : `RELAIS_CHATGPT.md` et `RELAIS_CLAUDE.md` contiennent des coordonnées (adresse, téléphone, e-mail Gmail) de l'ancienne structure. Elles n'ont pas été propagées. Si le dépôt doit être partagé, les retirer de ces fichiers est recommandé (décision de l'exploitant).

## 11. Corrections effectuées (sûres et factuelles)

1. `src/lib/identite-legale.ts` : source unique de l'identité (exploitant, EI, RCS, dates, site, activité, domaines, contact) et règle de commercialisation.
2. Pack juridique : mentions légales, CGV, CGU, confidentialité, cookies, DPA, registre des traitements, registre des sous-traitants, README. Identité complétée, placeholders remplacés ou convertis en `LEGAL_REVIEW_REQUIRED`. OpenAI, Sentry et Powens ajoutés au registre interne des sous-traitants, avec leurs garanties à vérifier.
3. Rendu public des documents : les notes internes sont masquées, les champs non tranchés s'affichent « en cours de mise à jour ».
4. Pied de page légal avec identité et RCS.
5. Marque ELSATIA dans tous les textes affichés de l'application.
6. Contact : `contact@elsatia.fr` centralisé (`EMAIL_CONTACT`) ; ancien domaine supprimé.
7. Garde de date de commercialisation sur Stripe Billing et la boutique.
8. Documents des clients : plus de logo du logiciel par défaut.
9. Export RGPD renommé `export-donnees-elsatia-*.json`.
10. `.env.local.example` : `NEXT_PUBLIC_APP_URL=https://app.elsatia.fr`, `NEXT_PUBLIC_CONTACT_EMAIL`, `VAPID_SUBJECT`.

## 12. Actions requises (non tranchées — LEGAL_REVIEW_REQUIRED)

| # | Sujet | Pourquoi | Qui |
|---|---|---|---|
| 1 | **Adresse de l'établissement** dans les mentions légales et sur les factures Stripe | Obligation LCEN et mention de facture. Adresse personnelle à ne publier que sur décision, sinon domiciliation. | Exploitant |
| 2 | **Régime de TVA** | Les CGV et les mentions indiquent la franchise « 293 B », mais `/tarifs` et `/abonnement` affichent des prix « HT » et la boutique applique un `taux_tva`. Incohérence à trancher, puis aligner l'interface, les CGV et Stripe. | Exploitant + comptable |
| 3 | **Boîte `contact@elsatia.fr`** | Adresse retenue par convention sur le domaine déclaré. Il faut la créer ou la confirmer, sinon définir `NEXT_PUBLIC_CONTACT_EMAIL` et mettre à jour le pack juridique. | Exploitant |
| 4 | **Boutique matériel** | La vente de biens physiques ne figure pas clairement dans l'activité déclarée (SaaS + services numériques). Aucune facture n'est émise (Checkout sans `invoice_creation`). Fiche fournisseur « Liria (boutique) » à renommer. | Juriste + exploitant |
| 5 | **Paramétrage Stripe** (§6) | Identité vendeur des factures SaaS | Exploitant |
| 6 | **Logos, icônes, guide PDF, vidéos** | Ils affichent ou prononcent « Liria Gestion Pro » | Exploitant / design |
| 7 | **Sous-traitants** OpenAI, Sentry, Powens | Présents dans le code, absents de la politique de confidentialité publique. Localisation et garanties à vérifier avant publication. | Juriste |
| 8 | **Région Supabase** | Mentionnée « à confirmer » | Exploitant |
| 9 | **Dépôt de la marque ELSATIA** | Ne pas parler de marque déposée sans vérification | Exploitant |
| 10 | **Relecture avocat** du pack complet | Brouillons, pas de conseil juridique | Juriste |
| 11 | **Apps Tools, Colors, Réserves, Studio, et site vitrine** | Hors de ce dépôt | Audit séparé |
| 12 | **E-mails Supabase Auth** (expéditeur, SMTP, `site_url`) | Configuration console | Exploitant |

## 13. Vérification automatisée

`src/lib/identite-legale.test.ts` s'exécute avec `npm test`, `npm run verify` et `npm run verify:legal`. Il contrôle :

- l'identité officielle (exploitant, RCS = SIREN, dates, domaines `*.elsatia.fr`, contact sur elsatia.fr) ;
- l'**absence de l'ancienne identité** (« Liria », « LIRIA », « Liria Concept ») dans `src/`, `public/sw.js`, `.env.local.example` et `docs/juridique/`. Les identifiants techniques DO_NOT_TOUCH (préfixe `liria-`, `liria:`, `LIRIA_`) sont exclus.
- l'**absence d'anciens domaines** (`liria-gestion-pro.fr`, `*.vercel.app` historique, `@liria`, `liria.fr`) ;
- l'**absence de placeholders légaux** (`[À COMPLÉTER]`, `[JJ/MM/AAAA]`, `[Julien GREGUREC]`, `[contact@…]`, `[lien DPA]`, `votre-domaine.fr`). Seuls les marqueurs explicites `LEGAL_REVIEW_REQUIRED` restent tolérés.
- l'**absence de RCS autre que l'officiel** et de SIRET fictif (`12345678900012`, `99999999999999`) ;
- les **mentions critiques** : dans les mentions légales (éditeur, EI, RCS, site, directeur de publication, hébergement, contact), dans les CGV (identité, RCS, date d'ouverture des ventes), dans les CGU, la politique de confidentialité, le DPA et le registre (exploitant + RCS), et dans le pied de page (RCS) ;
- l'absence de note interne ou de placeholder brut dans les documents publiés ;
- l'absence de logo du logiciel par défaut sur les documents des clients ;
- la **date de commercialisation** : fermée le 30/09/2026 à 23:59:59 à Paris, ouverte le 01/10/2026 à 00:00 ; aucune session Stripe (abonnement ou boutique) avant, sans appel réseau.

Il ne lit ni la base de données ni les données des clients. Les migrations et scripts SQL de production sont exclus.

Contrôle de non-régression effectué : l'injection volontaire de « Liria Gestion Pro 123 456 789 R.C.S. Paris [À COMPLÉTER] » dans `cgu.md` fait échouer 4 tests.

Résultats au moment de l'audit : `typecheck` OK, `lint` OK (0 erreur, 3 avertissements préexistants), `vitest` 113/113, `verify:secrets` OK, `next build` OK.
