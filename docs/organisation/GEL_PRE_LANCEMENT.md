# Gel fonctionnel pré-lancement — ELSATIA Gestion Pro

Date de l'audit : **13 août 2026**

Branche de référence : **`release/commercialisation-v1`**

Commit de code audité : **`5cc69c8a6019c686a4eb24c7d126c2251b6ea86e`**

Production : **https://app.elsatia.fr**

Le commit de baseline documentaire est le commit qui ajoute le présent document et l'entrée P13B au registre central. Son hash exact doit être repris dans le rapport P13B et constitue le commit recommandé pour le futur tag `prelaunch-freeze-2026-08`.

## État

Les lots P1 à P13 sont présents dans l'historique de la branche commerciale. Le commit audité est identique sur la branche locale `release/commercialisation-v1`, sa référence distante `gh/release/commercialisation-v1` et la branche de travail P13.

QA réalisée sur le commit audité :

- 289 tests Vitest réussis ;
- TypeScript sans erreur ;
- ESLint sans erreur, avec 3 avertissements préexistants sur l'emploi de `<img>` ;
- build Next.js de production réussi ;
- 194 migrations valides ;
- aucun secret reconnu dans les 806 fichiers suivis ;
- `npm audit` : 0 vulnérabilité.

Aucune anomalie critique ou bloquante n'a été identifiée. Aucune donnée Production, configuration distante, fonctionnalité ou dépendance n'a été modifiée pendant P13B.

## Fonctionnalités commercialisables

Le catalogue actif expose les modules suivants :

- tableau de bord, profil, messagerie et paramètres ;
- clients, prestations, devis, factures et documents commerciaux ;
- chantiers, espace personnel, planning et pointage ;
- employés, congés et notes de frais ;
- fournisseurs, commandes, factures fournisseurs et charges récurrentes ;
- stock, inventaires, borne de stock et dépôt ;
- flotte et outillage ;
- rentabilité, trésorerie et exports comptables ;
- abonnement et administration des accès.

Les PDF devis/factures sont générés côté serveur. Les envois applicatifs utilisent Brevo. Le partage externe emploie un jeton non séquentiel dont seul le hash SHA-256 est stocké. Les routes propriétaires restent authentifiées et isolées par entreprise.

## Fonctionnalités gelées ou désactivées

Les valeurs Production confirmées restent :

```text
FEATURE_AI_ENABLED=false
FEATURE_BOUTIQUE_ENABLED=false
FEATURE_CRONS_ENABLED=false
```

Powens n'est pas configuré. Les modules suivants restent masqués ou non commercialisés :

- BETA : facturation avancée, ouvrages, interventions, sous-traitants, grands déplacements, paie et CRM ;
- désactivés : appels d'offres, boutique, banque et connecteurs ;
- Assistant IA, Boutique, Stripe Connect et automatisations cron.

Ils ne doivent pas être activés sans réouverture explicite d'un lot, définition du périmètre, recette et validation.

## Infrastructure validée

- **Vercel** : projet `elsatia-production`, déploiement Production `READY`, domaine `app.elsatia.fr`, fonctions en région `fra1`.
- **Supabase** : projet `exhvuzegsefmoguxoiak`, état sain, région `eu-west-3` (Paris).
- **Auth** : fournisseur email actif, confirmations email obligatoires ; parcours de confirmation P5 conservé.
- **Brevo** : variables Production présentes pour Auth et emails applicatifs.
- **Sentry** : configuration Production présente ; `sendDefaultPii: false` est défini côté client, serveur et edge.
- **Stripe** : configuration Test et huit variables de prix présentes ; aucune bascule Live/KYC autorisée ou réalisée. Les valeurs sensibles Vercel restent volontairement masquées lors d'un audit local.
- **Storage** : onze buckets métier privés ; seul `entreprise-assets` est public pour les logos, avec écriture restreinte aux membres autorisés.

Attention opérationnelle : le worktree `liria-codex` reste localement lié aux projets Preview pour Vercel et Supabase. Toute commande distante future doit donc indiquer explicitement `elsatia-production` ou `exhvuzegsefmoguxoiak`, après vérification du répertoire courant. Aucun `supabase config push` ne doit être exécuté sans la procédure de comparaison décrite dans le registre central.

## Données Production et démonstration

La Production contient exactement :

- l'entreprise réelle `elsatia`, référence `ENT-001`, sans donnée métier avant lancement ;
- l'entreprise de démonstration `Atelier Bâtiment Lyonnais`, référence `DEMO-18M`.

La démo conserve notamment 30 clients, 30 chantiers, 108 devis, 72 factures, 12 employés, 8 fournisseurs, 2 340 pointages et 30 articles de stock. Un seul compte Auth dédié à la démo est présent. Aucun compte temporaire de recette ni doublon d'adresse email n'a été détecté.

Les scripts suivants sont conservés avec leurs garde-fous :

- `supabase/production/creer_entreprise_demo_18_mois.sql` ;
- `supabase/production/reset_entreprise_demo_18_mois.sql`.

Le reset et le seed ne doivent pas être lancés pendant le gel. Voir `docs/organisation/DEMO_COMMERCIALE.md`.

## Juridique et RGPD

La forme de lancement retenue est l'**entreprise individuelle (EI)**, non encore immatriculée (mise à jour 2026-09-01 ; le **régime micro-entrepreneur n'est pas confirmé** — ne pas confondre forme EI et régime micro). Les documents juridiques actifs sont structurellement compatibles avec une entreprise individuelle, mais les champs réels restent à compléter après immatriculation.

Restent interdits avant obtention des informations officielles :

- inventer ou publier un SIREN, SIRET, RCS, numéro de TVA ou une adresse légale ;
- activer Stripe Live ou commencer le KYC ;
- décider arbitrairement du régime de TVA ou activer Automatic Tax.

L'export RGPD `/api/rgpd/export` et la fonction `exporter_donnees_entreprise` sont présents. Les permissions SQL révoquent l'accès `public` et `anon` et réservent l'exécution aux utilisateurs authentifiés autorisés. Aucun export réel n'a été déclenché pendant P13B.

Documents de référence :

- `docs/organisation/PREPARATION_JURIDIQUE.md` ;
- `docs/organisation/REGISTRE_TRAITEMENTS_RGPD.md` ;
- `docs/organisation/STRIPE_LIVE_CHECKLIST.md` ;
- `docs/organisation/CREATION_EI_CHECKLIST.md`.

## Résidus acceptés

Les anciennes chaînes `liria` encore présentes dans le code actif sont exclusivement des clés de stockage local lues pour assurer une migration de compatibilité, ainsi qu'un commentaire sur les anciens QR physiques préfixés `LGP`. Elles ne sont pas rendues à l'utilisateur et ne constituent pas une identité active.

La mention `localhost` du composant PWA autorise uniquement le service worker en développement local. Aucune clé `sk_live_`/`pk_live_`, référence Supabase Preview, chaîne `RECETTE` ou ancienne marque visible n'a été trouvée dans le runtime Production.

## Règle de gel

À partir de cette baseline :

**aucune nouvelle fonctionnalité ni aucun refactor non critique ne doit être engagé avant l'immatriculation.**

Seules sont autorisées, après ouverture explicite d'un lot :

- la correction d'un bug bloquant ;
- une correction de sécurité ;
- une correction réglementaire ;
- une correction empêchant une démonstration ou le lancement.

Les styles, dépendances, abstractions, dossiers et composants ne doivent pas être remaniés à titre cosmétique pendant le gel.

## Reste avant lancement

1. Immatriculer l'entreprise individuelle (EI) et obtenir les identifiants officiels.
2. Confirmer le nom commercial, l'adresse, le régime fiscal (micro ou réel), le régime de TVA et les coordonnées professionnelles.
3. Compléter les documents juridiques et faire réaliser la relecture juridique prévue.
4. Ouvrir ou confirmer le compte bancaire dédié et l'IBAN de règlement.
5. Après SIRET seulement, ouvrir un lot Stripe Live séparé : KYC, produits/prix Live recréés, webhook Live, décision Automatic Tax et test réel contrôlé.
6. Autoriser séparément la création et le push du tag `prelaunch-freeze-2026-08` sur le commit de baseline documentaire P13B.
