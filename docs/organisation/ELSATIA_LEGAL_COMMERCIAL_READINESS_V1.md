# ELSATIA — Readiness juridique et commerciale V1

Date : 2026-09-02. **Audit / documentation en lecture seule.** Aucune modification de site, d'app,
de Git, de Stripe, de Vercel, de Supabase ; aucun commit / push / déploiement. Aucun statut
fiscal ou juridique tranché à la place de Julien.

> **Deux états coexistent** et cet audit les distingue systématiquement :
> - **DÉPLOYÉ** = `release/commercialisation-v1` (`fcdd4e7c`) → `app.elsatia.fr` + `elsatia.fr`
>   (dépôt `elsatia-site` `main`).
> - **LIGNÉE CANONIQUE** = `feat/elsatia-canonical-final-r73-v1` (+ corrections `cgv.md` sur
>   `feat/tarification-canonical-alignment-v1` `beb0ac5`), **non déployée**.
> Plusieurs blockers ci-dessous sont **déjà corrigés dans la lignée canonique** mais **encore
> faux en Production** tant que l'intégration + le déploiement ne sont pas faits.

---

## 1. Inventaire des documents juridiques

Application : `elsatia-main/docs/juridique/*.md`, rendus sur `app.elsatia.fr/{mentions-legales,
cgv,cgu,confidentialite,cookies}` via `DocumentLegal.tsx` (substitution `[EMAIL_SUPPORT]` →
`SUPPORT_EMAIL`, `[URL_APPLICATION]` → `NEXT_PUBLIC_APP_URL` ; rend « — » si l'env est absente).
Site vitrine : `elsatia-site/src/content/legal.ts`, rendu sur `elsatia.fr/[slug]` **avec un
bandeau visible « Document de travail — À finaliser avant publication commerciale »**.

| Document | Repo / chemin | Statut | Incohérences / trous | Bloqueur |
|---|---|---|---|---|
| Mentions légales | `elsatia-main/docs/juridique/mentions-legales.md` | **Canonique = OK** (EI + marqueurs INTERNES BLOQUANTS régime/TVA) ; **DÉPLOYÉ = FAUX** (« micro-entreprise », « TVA Non applicable — art. 293 B ») | SIRET `[À COMPLÉTER]` ; Brevo absent de la section Hébergement | **P0** (déployé) |
| Mentions légales (site) | `elsatia-site/src/content/legal.ts` §1 | Bandeau « Document de travail » ; **« entreprise individuelle … (micro-entreprise) »** | SIREN/SIRET « à finaliser » | **P0** |
| CGV | `elsatia-main/docs/juridique/cgv.md` v1.0 21/08/2026 | **Canonique = OK** (offres Mini/Pro/Business/Entreprise, « 2 mois offerts », TVA « [À VALIDER] ») ; **DÉPLOYÉ = FAUX** (« Essentiel, Pro, Premium », « 293 B franchise en base », « remise −20 % ») | **délai de paiement B2B, pénalités de retard, indemnité forfaitaire 40 €, escompte : ABSENTS** ; pas de SLA chiffré | **P0** (déployé) + **P1** (trous B2B) |
| CGV (site) | `elsatia-site/legal.ts` §2-9 | Bandeau brouillon ; « entrepreneur individuel (micro-entreprise) » ; clauses « à finaliser » (paiement, SLA, responsabilité, juridiction) | Indemnité 40 € présente ; réversibilité « précisée contractuellement » (vague vs CGV app art. 10) | **P0** (micro) + **P1** |
| CGU | `elsatia-main/docs/juridique/cgu.md` v1.0 01/08/2026 | Cohérent, complet | — | Non |
| CGU (site) | pas de CGU propre au site (les CGU app couvrent le service) ; footer site pointe `/cgu` → `legal.ts` CGU | Bandeau brouillon | — | **P1** (retirer bandeau) |
| Politique de confidentialité | `elsatia-main/docs/juridique/politique-confidentialite.md` 21/08/2026 | Solide (RGPD art. 13, 2 casquettes, durées, droits, CNIL) | **Sous-traitants §5 = 4 lignes** (Supabase, Vercel, Stripe, Brevo) alors que `rgpd-sous-traitants.md` en liste **6** (+ Sentry, OpenAI) | **P1** (compléter) |
| Politique de confidentialité (site) | `elsatia-site/legal.ts` §confidentialite | Bandeau brouillon ; ne cite que Vercel + Brevo (site vitrine — cohérent avec son périmètre restreint) | « garanties de transfert à finaliser » | **P1** |
| Politique de cookies | `elsatia-main/docs/juridique/politique-cookies.md` 13/08/2026 | Cohérent avec le réel (1 cookie de session Supabase, aucun traceur optionnel, aucun CMP) | `[EMAIL_SUPPORT]` (substitué au rendu) ; ne mentionne pas explicitement Sentry (monitoring, sans cookie) | Non (P2 : préciser Sentry monitoring) |
| Politique de cookies (site) | `elsatia-site/legal.ts` §cookies | Bandeau brouillon ; « aucun cookie optionnel, pas de bandeau » — cohérent | — | **P1** (retirer bandeau) |
| DPA entreprises clientes | `elsatia-main/docs/juridique/dpa-entreprises-clientes.md` 24/08/2026 | Complet (art. 28 : instructions, confidentialité, sécurité art. 32, sous-traitants ultérieurs, notification de violation, restitution/suppression 30 j, audit) | Relecture avocat non faite | **P1** (relecture) |
| Registre des traitements | `elsatia-main/docs/juridique/rgpd-registre-des-traitements.md` 21/08/2026 | Interne, art. 30 conforme, 6 traitements + mesures transversales + procédure violation 72 h | — | Non |
| Registre des sous-traitants | `elsatia-main/docs/juridique/rgpd-sous-traitants.md` 24/08/2026 | 6 sous-traitants avec finalité/données/localisation/transfert/DPA | **DPA de chaque sous-traitant non signés/acceptés** ; **région Sentry « à confirmer »** ; OpenAI = US, pas de résidence UE | **P1** |
| Réversibilité / support / résiliation / défaut de paiement | CGV app art. 3, 5.3, 6, 10 | Couverts (essai→payant, suspension impayé, résiliation à tout moment, export + 30 j) | Support : pas d'engagement de délai ; pas de procédure d'impayé détaillée (relances J+x) | **P1** (préciser support + relances) |
| Propriété des données | CGV art. 10.1 / 11, ML « propriété intellectuelle », CGU art. 6 | Cohérent : données client = propriété du client ; Service/marque = éditeur | — | Non |

Le pack `README.md` note explicitement : **« brouillons solides, à faire relire par un avocat
(~300–500 €) avant mise en ligne »**.

---

## 2. Identité entreprise

| Mention | Valeur | Classe | Source |
|---|---|---|---|
| Nom commercial | **ELSATIA** (distinct de « ELSATIA Gestion Pro », le produit) | **A — confirmé** | décision Julien, README juridique |
| Forme juridique | **Entreprise individuelle (EI)** | **A — confirmé** | README juridique 2026-09-01, ML canonique |
| Exploitant | **Julien GREGUREC** | **A — confirmé** (à revérifier avis SIRENE) | ML |
| Adresse siège | **9 rue du Maréchal Leclerc, 67860 Rhinau, France** | **A/B** — retenue pour l'immatriculation, à revérifier avis SIRENE | ML |
| E-mail support | **support@elsatia.fr** (opérationnel, Production) | **A — confirmé** | README, P14B |
| E-mail réception contact commercial | **commercial@elsatia.fr** (via expéditeur `contact@elsatia.fr`) | **A — confirmé** | lot C1-E |
| « micro-entreprise » (régime) | apparaît encore : ML **déployée**, `legal.ts` (site) ×2 | **⛔ à SUPPRIMER** — régime **non arbitré** | audit |
| Régime fiscal/social (micro *ou* réel) | **NON arbitré** | **C — expert-comptable** | ML canonique (marqueur bloquant), `GO_LIVE_COMMERCIAL_CHECKLIST.md` (🔴 préalable bloquant) |
| Mention de TVA / n° TVA intra | **NON tranché** (dépend du régime) | **C — expert-comptable puis B — INSEE** | ML canonique (marqueur bloquant) |
| SIREN / SIRET | **[À COMPLÉTER]** | **B — en attente INPI/INSEE** | ML, README |
| RCS / greffe / code APE-NAF | non déterminés | **B — en attente immatriculation** | README |
| Directeur de la publication | Julien GREGUREC | **A** | ML |

**Rien n'est tranché dans ce document.** Forme = EI (acquis) ; tout le volet fiscal/TVA/immatriculation
reste ouvert.

---

## 3. TVA — occurrences

| Emplacement | Formulation | Classe |
|---|---|---|
| `mentions-legales.md` **canonique** | marqueur « [À COMPLÉTER AVANT PUBLICATION — INTERNE BLOQUANT : franchise en base (293 B) ou assujettissement] » | **brouillon correct — à confirmer** |
| `mentions-legales.md` **déployée** (`release/commercialisation-v1`) | « **Numéro de TVA intracommunautaire : Non applicable — TVA non applicable, article 293 B du CGI** » | **PUBLIÉ — assertion d'un régime non arbitré → à retirer** |
| `cgv.md` **canonique** (art. 4.2, `beb0ac5`) | « [À VALIDER AVANT PUBLICATION — mention de TVA selon le régime… non encore arbitré] » | **brouillon correct** |
| `cgv.md` **déployée** (art. 4.2) | « **TVA non applicable, article 293 B… l'Éditeur bénéficie de la franchise en base** » | **PUBLIÉ — à retirer** |
| `elsatia-site/legal.ts` (ML §1, CGV §5) | « Numéro de TVA intracommunautaire, si applicable : à finaliser » | **brouillon acceptable** (ne tranche pas) |
| `docs/juridique/dpa-*`, `rgpd-*`, `politique-*` | aucune mention de TVA | — |
| Code (`STRIPE_AUTOMATIC_TAX_ENABLED`) | `false` (aucune TVA calculée au Checkout) | cohérent **si** franchise retenue ; à réactiver sinon |

**Ne pas rétablir la mention « 293 B » tant que le régime n'est pas confirmé.** Deux endroits
déployés l'affirment encore et doivent revenir à un marqueur « à confirmer » (déjà fait dans la
lignée canonique).

---

## 4. CGV B2B — audit de complétude

| Clause | CGV app (canonique) | Constat |
|---|---|---|
| Prix HT | art. 4.2 « en euros hors taxes » | ✅ (canonique ; déployé = « en euros » sans « HT ») |
| Facturation | art. 5.2 « factures émises et mises à disposition automatiquement » | ✅ |
| **Délai de paiement B2B** (L441-10 C. com.) | — | **❌ ABSENT** — obligation légale entre professionnels |
| **Taux des pénalités de retard** | — | **❌ ABSENT** — mention obligatoire (≥ 3× taux légal, ou taux BCE + 10 pts) |
| **Indemnité forfaitaire de recouvrement (40 €)** | — | **❌ ABSENT** de la CGV app (présente uniquement dans `legal.ts` du site) |
| **Escompte** | — | **❌ ABSENT** — mention obligatoire (« pas d'escompte pour paiement anticipé » suffit) |
| Défaut de paiement / suspension | art. 5.3 | ✅ |
| Résiliation | art. 6.2 « à tout moment, effet fin de période, pas de remboursement » | ✅ |
| Reconduction | art. 6.1 « tacite, périodes identiques » | ✅ (loi Chatel non applicable B2B) |
| Résiliation pour manquement | art. 6.3 « mise en demeure 15 j » | ✅ |
| Réversibilité / export | art. 10 « format structuré courant », export à tout moment, 30 j post-contrat puis suppression | ✅ (voir § 5) |
| Conservation des données | art. 10.2 + politique confid. §4 (facturation 10 ans, prospects 3 ans, logs 6-12 mois) | ✅ |
| Responsabilité | art. 12 : faute prouvée, dommages directs, **plafond = 12 derniers mois** | ✅ |
| Disponibilité du service | art. 7.1 « obligation de moyens », pas de % SLA | ⚠️ acceptable au lancement (**P2** : ajouter un objectif indicatif) |
| Force majeure | art. 13 (art. 1218 C. civ.) | ✅ |
| Cession / substitution EI→société | art. 14 | ✅ (utile pour un futur passage en société) |
| Droit applicable / litiges | art. 16 : droit français, amiable puis tribunaux du siège | ✅ |

**Trous P1 (rédaction juridique — ne pas inventer la formulation finale) :** délai de paiement,
pénalités de retard, indemnité 40 €, escompte. À faire rédiger/valider par l'avocat.

---

## 5. Réversibilité

| Surface | Promesse | Réel |
|---|---|---|
| CGV app art. 10 | « exporter … dans un format structuré courant », 30 j post-contrat | — |
| Politique confid. §7 | « fonctions d'export et de suppression depuis votre espace » | — |
| App | `parametres/donnees` : **« Exporter mes données »** → `/api/rgpd/export` ; **« Supprimer mon compte et mes données »** → `demander_suppression_entreprise` ; **« Anonymiser un salarié »** → `anonymiserEmployeAction` | **Fonctions présentes** |
| App (modules) | exports notes de frais = **ZIP** (CSV + originaux + manifeste **SHA-256**) ; devis/factures = **PDF** ; import initial = CSV/Excel | Formats : CSV, PDF, ZIP, SHA-256 |

- **Cohérence globalement OK** : la promesse est adossée à des fonctions réelles.
- **À vérifier (non bloquant P1)** : le contenu exact de `/api/rgpd/export` (couvre-t-il *toutes*
  les entités métier en JSON/CSV, ou un sous-ensemble ?) → aligner le mot « courant » de la CGV
  sur ce que l'export produit réellement.
- Le `README.md` juridique liste encore « [ ] Fonction Exporter/Supprimer » **non cochée** —
  **README obsolète** (la fonction existe) : à corriger.
- **Ne rien promettre de plus** (pas de « portabilité inter-logiciels garantie »).

---

## 6. Sauvegardes

| Niveau | Public (docs) | Réel |
|---|---|---|
| Sauvegarde interne ELSATIA | CGV art. 7.3, confid. §9, registre : « sauvegardes régulières / automatiques » | **DATABASE DR : GO · STORAGE DR : GO · GLOBAL DR : GO** (lots ELSATIA-*-DR) |
| Export client (self-service) | confid. §7 « export depuis votre espace » | `parametres/donnees` + exports par module (§ 5) |
| Backup côté client / cloud tiers (futur « agent backup ») | **non mentionné** | **non livré** |

- Le wording public (« sauvegardes régulières ») est **exact et prudent** : il ne promet ni RPO/RTO
  chiffré, ni un backup client automatisé. ✅
- **À maintenir** : aucun document ne doit affirmer un « backup client automatisé local/cloud »
  tant que la fonction n'existe pas.
- **P2** : quand la maturité DR sera communicable, une phrase « hébergement UE + sauvegardes
  chiffrées quotidiennes » pourra être ajoutée (sans chiffres d'engagement).

---

## 7. Sous-traitants RGPD — liste de travail

| Sous-traitant | Finalité | Données | Transfert hors UE | DPA / doc à vérifier | Mention confid. requise |
|---|---|---|---|---|---|
| **Supabase, Inc.** | BDD, stockage fichiers, Auth | toutes les données du Service | Possible (société US) ; hébergement `eu-west-3` Paris | https://supabase.com/legal/dpa — **à accepter/archiver** | Oui (présent) |
| **Vercel, Inc.** | hébergement + exécution app | données transitant, logs techniques | Oui (société US) ; exécution `fra1` Francfort | https://vercel.com/legal/dpa — CCT / DPF — **à accepter/archiver** | Oui (présent) |
| **Stripe Payments Europe, Ltd.** | paiement / facturation abonnements | coordonnées facturation, données de paiement | Non (Irlande, UE) | https://stripe.com/legal/dpa — **à accepter/archiver** | Oui (présent) |
| **Brevo (Sendinblue SAS)** | e-mails transactionnels (comptes, devis, factures, relances, formulaire contact) | e-mail, nom, contenu des documents envoyés | Non (société française) | https://www.brevo.com/fr/legal/ — **à accepter/archiver** | Oui (présent) |
| **Sentry (Functional Software, Inc.)** | supervision des erreurs applicatives | traces techniques ; `sendDefaultPii:false`, **pas de Session Replay** | Possible (société US) ; **région du projet à confirmer (viser UE)** | https://sentry.io/legal/dpa/ — **à accepter** ; **confirmer région** | **Oui — ABSENT de `politique-confidentialite.md` §5** |
| **OpenAI, L.L.C.** | assistant IA + préparation de devis (API standard) | données métier strictement nécessaires ; **aucun historique de conversation persisté** ; `journal_ia` = métriques seulement | Oui (US, pas de résidence UE configurée) | https://openai.com/policies/data-processing-addendum/ — **à accepter formellement** | **Oui — ABSENT de `politique-confidentialite.md` §5** |

**Non couverts (inactifs)** : Boutique, Powens (connecteur bancaire) — à ré-évaluer avant toute
activation. Aucune conclusion juridique définitive ici.

---

## 8. Cookies / tracking

| Composant | Chargé côté client ELSATIA ? | Cookies / stockage | Consentement requis ? |
|---|---|---|---|
| Supabase Auth | Oui | 1 cookie de session / auth | Non (strictement nécessaire, art. 82) |
| Sentry (`instrumentation-client.ts`) | Oui (Production, si `NEXT_PUBLIC_SENTRY_DSN`) | **aucun cookie** ; pas de Session Replay ; `tracesSampleRate 0.1` | Non (monitoring sécurité, intérêt légitime) — **mais à mentionner** dans les politiques |
| Stripe | **Non** sur les pages ELSATIA (Checkout = **redirection** vers `checkout.stripe.com` ; CSP `frame-src js.stripe.com hooks.stripe.com` pour les frames post-paiement) | cookies posés sur le domaine Stripe uniquement | Hors périmètre ELSATIA (domaine tiers) |
| Analytics / mesure d'audience / publicité | **Non** (aucun script) | — | — |
| Brevo | Non (envoi serveur → serveur) | — | — |

- La politique cookies (**aucun traceur optionnel, aucun bandeau**) est **exacte**.
- **P1/P2** : ajouter une phrase « supervision technique via Sentry, sans cookie ni
  enregistrement d'écran » dans `politique-cookies.md` et `politique-confidentialite.md` §5
  (cohérence avec le registre des sous-traitants).
- **Ne pas** implémenter de CMP tant qu'aucun traceur soumis à consentement n'est ajouté.

---

## 9. Essai 30 jours

| Aspect | Doc / code | Cohérence |
|---|---|---|
| Durée | CGV art. 3 « 30 jours » ; `DUREE_ESSAI_JOURS = 30` ; `trial_period_days = 30` | ✅ alignés |
| Carte requise ? | Checkout : `payment_method_collection: "always"` → **carte collectée à l'inscription** | ⚠️ **non explicité** côté site/CGV (« carte requise, aucun prélèvement pendant 30 j ») |
| Fin d'essai | CGV art. 3 « devient payant, 1er prélèvement automatique sauf résiliation avant terme » | ✅ (point signalé « JURIDIQUE-V2 » dans `TARIFS_V2_APP_PREVIEW.md` — à confirmer avec le parcours d'acceptation) |
| Résiliation pendant l'essai | CGV art. 6.2 « à tout moment » | ✅ |
| Données après essai (si non converti) | CGV art. 10.2 (30 j de récupération puis suppression) | ✅ |
| Ouverture réelle | `ABONNEMENTS_PUBLICS_OUVERTS=false` → aucun essai payant réel possible aujourd'hui | ✅ verrou en place |

**Incohérence P1** : ajouter, sur `/tarifs` et dans la CGV art. 3, la mention explicite
« carte bancaire demandée à l'inscription, aucun débit pendant les 30 jours d'essai ».

---

## 10. Offres dans les documents juridiques

| Doc | 69/199/399 | Essentiel/Premium | annuel ×12 | −20 % | −10 % Entreprise | Verdict |
|---|:--:|:--:|:--:|:--:|:--:|---|
| `cgv.md` **canonique** (`beb0ac5`) | non | non (Mini/Pro/Business/Entreprise/Sur mesure) | non | non | non | ✅ **conforme** |
| `cgv.md` **déployée** | non | **OUI** (art. 4.1) | — | **OUI** (art. 4.3 « −20 % ») | non | ❌ **à déployer la version canonique** |
| `elsatia-site/legal.ts` CGV | non | non (« Mini, Pro, Business et Entreprise ») | non | non | non | ✅ (mais bandeau brouillon + « micro ») |
| autres `docs/juridique/*` | — | — | — | — | — | aucun montant, RAS |

Référence commerciale validée (rappel, **ne pas toucher au code pricing**) : Mini 79/790,
Pro 249/2 490, Business 449/4 490, Entreprise 599/5 990 ; annuel = 10 × mensuel.

---

## 11. SIREN / SIRET / INPI — checklist conditionnelle

**Déclencheur : réception de l'avis de situation SIRENE / de l'immatriculation.** Alors, et
seulement alors :

1. `mentions-legales.md` : SIRET, RCS/greffe si applicable, code APE/NAF, **régime fiscal
   confirmé**, mention de TVA (293 B *ou* assujettissement + n° intra) — retirer les marqueurs
   INTERNES BLOQUANTS.
2. `cgv.md` art. 4.2 : remplacer le marqueur « [À VALIDER] » par la mention de TVA arbitrée.
3. `elsatia-site/src/content/legal.ts` : SIREN/SIRET, mention de TVA, **retirer « micro-entreprise »**,
   retirer le bandeau « Document de travail ».
4. Factures (`src/app/actions/factures.ts` fige les mentions à l'émission) : vérifier que SIRET +
   mention de TVA apparaissent sur les factures d'abonnement et les factures clients BTP.
5. Footer du site vitrine : ajouter SIRET (mentions légales pied de page).
6. Stripe / KYC : renseigner l'entité, l'adresse, le SIRET, le régime de TVA (Stripe Tax).
7. Documents commerciaux (`SCRIPT_DEMO`, `KIT_PROSPECTION`, `GO_LIVE_COMMERCIAL_CHECKLIST`) :
   lever les mentions « en attente d'immatriculation ».
8. `revérifier l'INPI après le 21-10-2026` (fin du délai d'opposition sur la marque — cf.
   `CHECKLIST_LANCEMENT.md` § 3bis).

**Ne rien renseigner avant réception officielle.**

---

## 12. Branche `main` dangereuse (documentation du risque)

Déjà documenté : `docs/organisation/NE_PAS_DEPLOYER_MAIN.md` (lot
ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1).

- `main` diverge de ~692 fichiers / +61 780 lignes ; porte encore « **Liria Gestion Pro V3** »,
  `mailto:contact@liria-gestion-pro.fr`, grille **79/249/449 ×12**.
- Proposition (aucun Git modifié ici) : **(1)** protection de branche GitHub sur `main` (PR
  obligatoire, pas de push direct) ; **(2)** vérifier Vercel → *Production Branch* ≠ `main` ;
  **(3)** `git tag archive/liria-main-2026-07 <sha main>` avant toute promotion ; **(4)**
  promotion contrôlée ultérieure (fast-forward vers le socle canonique, ou renommage +
  archivage).

---

## 13. Go-live checklist juridique-commerciale

### P0 — bloque la commercialisation
- **JL-P0-1** : `app.elsatia.fr/mentions-legales` **déployé** affirme « micro-entreprise » +
  « TVA Non applicable, art. 293 B » — **régime non arbitré publié comme un fait**. → déployer
  la version canonique (marqueurs « à confirmer »).
- **JL-P0-2** : `app.elsatia.fr/cgv` **déployé** : « Essentiel/Premium », « 293 B franchise en
  base », « remise −20 % ». → déployer la version `beb0ac5`.
- **JL-P0-3** : `elsatia.fr` (5 pages légales) affiche le bandeau **« Document de travail — À
  finaliser avant publication commerciale »** + `legal.ts` dit « micro-entreprise ». → corriger
  `elsatia-site` (retrait bandeau + « EI », sans mention de régime).
- **JL-P0-4** : mention légale sans **SIRET** (obligation LCEN) — dépend de l'immatriculation
  INPI/INSEE.
- **JL-P0-5** : grille tarifaire publique cohérente (traité par
  ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1 ; **écart ENV Vercel annuel encore ouvert**, lot
  CODEX).

### P1 — avant les premiers clients payants
- **JL-P1-1** : CGV B2B — ajouter délai de paiement, pénalités de retard, indemnité 40 €,
  escompte (rédaction avocat).
- **JL-P1-2** : **relecture avocat** de tout le pack (dossier `P14_FINALISATION_JURIDIQUE_EI.md`).
- **JL-P1-3** : compléter `politique-confidentialite.md` §5 avec **Sentry** et **OpenAI** ;
  aligner sur `rgpd-sous-traitants.md`.
- **JL-P1-4** : **accepter/archiver les DPA** des 6 sous-traitants ; **confirmer la région
  Sentry** (viser UE).
- **JL-P1-5** : essai — expliciter « carte requise à l'inscription, aucun débit pendant 30 j »
  (site + CGV art. 3).
- **JL-P1-6** : réversibilité — vérifier le périmètre réel de `/api/rgpd/export` et aligner le
  mot « courant » de la CGV.
- **JL-P1-7** : `elsatia-site/legal.ts` confidentialité — « garanties de transfert » à finaliser.
- **JL-P1-8** : procédure d'impayé (calendrier de relances) et engagement de délai de support
  (`SUPPORT_PREMIERS_CLIENTS.md`).
- **JL-P1-9** : protection de branche `main` + vérification Vercel Production Branch.

### P2 — post-lancement
- CMP seulement si un traceur soumis à consentement est ajouté un jour.
- Objectif de disponibilité indicatif dans la CGV/CGU.
- Mention « supervision Sentry sans cookie » dans `politique-cookies.md`.
- README juridique : cocher « Exporter/Supprimer » (fonction livrée) ; MAJ dates.
- SEO juridique (pages légales indexables proprement une fois finalisées).
- Communication DR (« sauvegardes chiffrées quotidiennes, hébergement UE ») quand validé.
- `mentions-legales.md` : ajouter Brevo à la section Hébergement / prestataires.

---

## 14. Actions humaines (Julien)

| # | Action | Interlocuteur | Débloque |
|---|---|---|---|
| H1 | **Arbitrer le régime fiscal/social de l'EI** (micro *ou* réel) | **Expert-comptable** | mention de TVA (ML + CGV + factures), Stripe Tax, JL-P0-1/2 |
| H2 | Finaliser l'**immatriculation INPI/INSEE** → obtenir SIREN/SIRET, RCS/greffe, code APE/NAF | INPI / autoentrepreneur.urssaf.fr | JL-P0-4, checklist § 11 |
| H3 | **Relecture avocat** du pack juridique complet (~300–500 €) + rédaction des clauses B2B manquantes (délai/pénalités/escompte/40 €) | Avocat | JL-P1-1, JL-P1-2 |
| H4 | Vérifier l'identité et l'adresse contre l'**avis de situation SIRENE** à réception | — | publication ML définitive |
| H5 | **Accepter / archiver les DPA** : Supabase, Vercel, Stripe, Brevo, Sentry, **OpenAI** | comptes prestataires | JL-P1-4 |
| H6 | **Choisir la région du projet Sentry** (UE si possible) | Sentry | JL-P1-4 |
| H7 | Ouvrir le **compte bancaire dédié** + IBAN | Banque | Stripe payouts, `RDV_BANCAIRE_PREPARATION.md` |
| H8 | **KYC Stripe** + configuration entité/TVA (Stripe Tax) | Stripe | passage Stripe Live (lot P15) |
| H9 | Décider de la **date de publication** des pages légales (après H1-H3 + retrait des bandeaux) et du **GO commercial unique** | Julien | lancement |
| H10 | **Revérifier l'INPI après le 21-10-2026** (fin d'opposition sur la marque) | INPI | GO commercial public |
| H11 | Valider la **protection de branche `main`** + l'épinglage Vercel Production Branch | Julien / GitHub / Vercel | JL-P1-9 |

---

## 15–18. Synthèse

- **État juridique** : pack quasi complet et cohérent **dans la lignée canonique** (EI, marqueurs
  « à confirmer », CGV corrigée) ; **la Production affiche encore des mentions fausses** (micro,
  293 B, −20 %, Essentiel/Premium) + le site vitrine affiche des brouillons. Aucun trou
  structurel non identifié.
- **Blockers P0** : 5 (dont 3 = « déployer la version canonique / corriger le site », 1 = SIRET
  INPI, 1 = grille ENV Vercel — lot CODEX).
- **Blockers P1** : 9 (clauses B2B, relecture avocat, DPA, Sentry/OpenAI dans la confid., essai
  carte, périmètre export, transferts site, impayé/support, protection `main`).
- **Actions humaines** : 11, dont 3 externes structurantes (expert-comptable, INPI, avocat).
- **Estimation de fermeture** (hors délais externes INPI/avocat/expert-comptable, hors code
  pricing déjà traité) :
  - Corrections documentaires (déployer canonique + corriger `legal.ts` + retrait bandeaux +
    §5 confid. + cookies Sentry) : **≈ 1 j** de travail éditorial/technique.
  - Intégration des clauses B2B rédigées par l'avocat : **≈ 0,5 j**.
  - Injection SIREN/SIRET/TVA à réception (checklist § 11) : **≈ 0,5 j**.
  - **Total interne ≈ 2 jours**, séquencés **après** H1 (régime), H2 (SIRET) et H3 (avocat).

---

`ELSATIA-LEGAL-COMMERCIAL-READINESS-V1 AUDITÉ — BLOCKERS JURIDIQUES ET ACTIONS HUMAINES IDENTIFIÉS`
