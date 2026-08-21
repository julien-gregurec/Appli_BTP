# Préparation juridique — ELSATIA Gestion Pro

Audit de lecture seule réalisé en P12 (13-08-2026) et corrigé en P13 (13-08-2026) suite à la décision de structure : **micro-entreprise au lancement, SASU abandonnée**. Aucune donnée juridique n'a été inventée ni renseignée : ce document liste les emplacements exacts à compléter une fois la micro-entreprise immatriculée, avec leur source et leur caractère bloquant ou non.

## Correction par rapport au constat P12

Le rapport P12 signalait que les documents juridiques supposaient une micro-entreprise alors que la structure prévue était une SASU, et concluait à une réécriture réelle nécessaire. **Ce constat est caduc** : la structure de lancement est désormais officiellement la micro-entreprise, ce qui est exactement ce que les documents décrivent déjà. Un inventaire complet (P13) confirme qu'aucun des 8 documents ne mentionne SASU, société, capital social, président ou actionnaire pour décrire la structure d'ELSATIA elle-même (la seule occurrence de « société » dans `cgv.md` §14.1 est une clause de cession future vers une personne morale à constituer, volontairement conservée — elle protège la possibilité d'évoluer plus tard sans obliger à rien maintenant). Le travail restant est donc un **simple remplissage de champs**, pas une réécriture structurelle.

## Où vivent les documents juridiques

8 documents dans `docs/juridique/` (audit réel du dépôt, pas une supposition) :

| Fichier | Rôle | Page publique |
|---|---|---|
| `mentions-legales.md` | Identité de l'éditeur + hébergeur | `/mentions-legales` |
| `cgv.md` | Conditions générales de vente (B2B) | `/cgv` |
| `cgu.md` | Conditions générales d'utilisation | `/cgu` |
| `politique-confidentialite.md` | Information RGPD (art. 13) | `/confidentialite` |
| `politique-cookies.md` | Cookies et traceurs | `/cookies` |
| `rgpd-registre-des-traitements.md` | Registre interne (art. 30) | Aucune — document interne |
| `rgpd-sous-traitants.md` | Registre des sous-traitants (art. 28) | Aucune — document interne |
| `dpa-entreprises-clientes.md` | Contrat de sous-traitance à proposer aux clients | Aucune — fourni sur demande |

Les 5 documents publics sont servis via `src/components/DocumentLegal.tsx` (rendu statique), avec liens en pied de page (`src/components/PiedLegal.tsx`). `docs/juridique/README.md` marque déjà ces textes comme **« brouillons solides, à faire relire par un avocat (~300–500 €) avant mise en ligne »**, ce qui reste valable.

## Corrections apportées en P13 (contenu réellement inexact, corrigé)

- **`politique-cookies.md`** décrivait un cookie de « préférences d'affichage (thème clair/sombre) » qui n'existe pas dans le code (aucun composant de bascule de thème trouvé, seul `prefers-color-scheme` CSS est utilisé). Ligne retirée : le tableau ne liste plus que le cookie Supabase Auth, seul cookie réellement déposé sur `app.elsatia.fr` (vérifié : `src/lib/supabase/proxy.ts` est le seul point du code qui pose un cookie).
- **`rgpd-sous-traitants.md`** listait un placeholder générique « Resend / prestataire e-mail » alors que le prestataire réel, en production depuis P8/P9, est **Brevo**. Corrigé, avec Sentry ajouté (oublié du tableau alors qu'il est actif) et les lignes spéculatives Twilio/Google OCR retirées (aucune fonctionnalité SMS ou OCR n'existe dans le code).

## Emplacements exacts à compléter après immatriculation (aucune valeur inventée)

Mise à jour P14 (21-08-2026) : les champs non bloquants ont été tranchés par Julien et reportés dans les 8 documents juridiques + `elsatia-site/src/content/legal.ts`. Seuls les champs liés à l'immatriculation elle-même restent en attente.

| Champ | Fichiers concernés | État |
|---|---|---|
| Nom/prénom exploitant | mentions-legales, cgv, politique-confidentialite, rgpd-registre-des-traitements, dpa-entreprises-clientes, legal.ts (site vitrine) | **Décidé (P14)** : Julien GREGUREC — reporté partout. Vérification finale contre l'avis SIRENE prévue avant publication définitive. |
| Nom commercial | mentions-legales, legal.ts | **Décidé (P14)** : ELSATIA, distinct de « ELSATIA Gestion Pro » (nom de l'application) — reporté partout. |
| Adresse du siège | mentions-legales, legal.ts, README.md | **Résolu (P14C, 21-08-2026)** : 9 rue du Maréchal Leclerc, 67860 Rhinau, France — retenue par Julien pour l'immatriculation, reportée partout, vérifiée orthographe/casse identique dans les 5 occurrences. À revérifier contre l'avis SIRENE une fois reçu. |
| SIREN / SIRET | mentions-legales | Oui — attend l'immatriculation |
| RCS (si applicable) | mentions-legales | Oui — dépend du régime exact retenu au dépôt |
| Régime de TVA (actuellement rédigé « non applicable, art. 293 B » — plausible en franchise en base au démarrage, mais **à confirmer**, pas à supposer) | mentions-legales | Oui — dépend du choix fiscal fait au dépôt (voir `CREATION_MICRO_CHECKLIST.md`) |
| Numéro de TVA intracommunautaire (si assujettissement) | mentions-legales | Oui, uniquement si le régime de TVA choisi le requiert |
| Email professionnel (`[EMAIL_SUPPORT]`) | les 5 documents publics + rgpd-registre-des-traitements, dpa-entreprises-clientes | **Résolu (P14)** : `support@elsatia.fr`, confirmée opérationnelle par Julien (boîte secondaire testée en réception). `SUPPORT_EMAIL` configurée en Production, redéployé, vérifié en direct. |
| Téléphone | — | **Décidé (P14)** : pas de numéro public pour l'instant, contact par formulaires/e-mails uniquement. |
| Domaine final | mentions-legales | Non bloquant si `app.elsatia.fr` reste l'adresse de lancement |
| Hébergeur | mentions-legales | Déjà renseigné (Vercel + Supabase) ; adresse Vercel corrigée en P14 (`440 N Barranca Avenue #4133, Covina, CA 91723`, vérifiée sur `vercel.com/legal/terms` et `vercel.com/legal/privacy-policy` — l'ancienne adresse `340 S Lemon Ave, Walnut` était obsolète). |
| Médiateur de la consommation | Non requis, service B2B exclu du droit de la consommation | Non bloquant |
| Responsable de publication | mentions-legales | Décidé (Julien GREGUREC) |
| Responsable de traitement / contact RGPD | politique-confidentialite, rgpd-registre-des-traitements | Décidé (Julien GREGUREC) |
| Dates « Dernière mise à jour » | les 8 fichiers | Non bloquant — à dater à la publication finale |
| Région d'hébergement Supabase | mentions-legales, politique-confidentialite, dpa-entreprises-clientes | **Résolu (P14)** : `eu-west-3` (Paris, France), confirmé via `supabase projects list` sur le projet Production — mention « à confirmer » levée. |
| Prestataire e-mail listé comme « Resend » / SMS / OCR spéculatifs | politique-confidentialite, dpa-entreprises-clientes | **Corrigé (P14)** : incohérence trouvée — la correction P13 (Brevo, retrait SMS/OCR) n'avait été appliquée qu'à `rgpd-sous-traitants.md`, pas aux deux autres documents qui répétaient l'information. Harmonisé. |

## Positionnement B2B et droit de rétractation (vérifié, RAS)

`cgv.md` déclare déjà explicitement : *« Le Service est réservé aux professionnels ; les dispositions du droit de la consommation (dont le droit de rétractation) ne s'appliquent pas. »* Ce positionnement correspond au produit réel (le signup impose la création d'une entreprise). Aucune incohérence trouvée — à ne pas modifier sans décision explicite d'ouvrir le service aux particuliers.

## Export et suppression RGPD — question P12 résolue

P12 avait relevé une incertitude : `politique-confidentialite.md` promet une fonction d'export des données personnelles, non localisée à l'époque. **Audit approfondi P13 : la fonction existe et fonctionne.**

- **Export** : page `/parametres/donnees`, bouton vers `GET /api/rgpd/export`, qui appelle la fonction Postgres `exporter_donnees_entreprise` (`supabase/migrations/20260719000114_rgpd_export_suppression.sql`) et renvoie un fichier JSON téléchargeable (clients, chantiers, devis, factures, salariés, stock, pointages…). Accès restreint aux utilisateurs authentifiés autorisés, vérifié dans la fonction SQL elle-même (`security definer`, permissions révoquées pour `public`/`anon`).
- **Suppression** : `demanderSuppressionAction` déclenche un délai de 30 jours avant purge effective supervisée (jamais immédiate), conformément à `cgv.md` art. 10. `anonymiserEmployeAction` anonymise les champs personnels d'un salarié tout en préservant explicitement les données à conservation légale obligatoire (pointages, paie, comptabilité) — le code lui-même porte un commentaire à ce sujet. Aucune suppression ne contourne la conservation comptable de ~10 ans.

La promesse de `politique-confidentialite.md` est donc exacte. Aucune construction supplémentaire n'était nécessaire.

## Autres emplacements vérifiés (RAS)

- **PDF devis/factures** (`src/components/DocumentImprimable.tsx`) : le SIRET affiché est celui de l'entreprise cliente d'ELSATIA, pas celui de l'éditeur — comportement normal du produit.
- **TVA côté code** : rien n'est codé en dur. `STRIPE_AUTOMATIC_TAX_ENABLED` (actuellement `false`) est piloté par variable d'environnement, pas par une valeur figée dans le code — le système peut donc supporter aussi bien une franchise en base qu'un assujettissement futur sans modification de code, seulement un changement de configuration Stripe et de texte dans les documents juridiques.
- **Distinction marque / entrepreneur** : déjà correctement séparée dans le code. `src/lib/brand.ts` ne définit que `MARQUE = "ELSATIA"` et `NOM_APPLICATION = "ELSATIA Gestion Pro"` (identité commerciale) ; l'identité légale de l'exploitant n'existe que dans les documents juridiques statiques, jamais mélangée dans le code.
- **Cookies** : un seul cookie réellement déposé (session Supabase Auth), strictement nécessaire. Pas de bannière de consentement requise. Stripe Checkout/Portail s'exécute sur le domaine de Stripe (aucun `@stripe/stripe-js` chargé côté client dans ce dépôt), donc aucun cookie Stripe sur `app.elsatia.fr` lui-même.

## Documents créés en P13

- `docs/organisation/REGISTRE_TRAITEMENTS_RGPD.md` — vue opérationnelle tabulaire, distincte du registre juridique détaillé.
- `docs/organisation/STRIPE_LIVE_CHECKLIST.md` — bascule Test → Live, 14 étapes.
- `docs/organisation/CREATION_MICRO_CHECKLIST.md` — checklist administrative d'immatriculation.

## Action après réception du SIRET

1. Fournir les informations bloquantes du tableau ci-dessus (adresse, SIREN/SIRET, RCS si applicable, régime de TVA réel).
2. Reporter ces valeurs dans les 8 documents juridiques — remplissage de champs, pas de réécriture structurelle.
3. Faire relire l'ensemble par un avocat (déjà budgété dans `docs/juridique/README.md`).
4. Dater chaque document et publier.
5. Démarrer `STRIPE_LIVE_CHECKLIST.md`.
