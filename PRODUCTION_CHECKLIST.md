# Passage en production — ELSATIA Gestion Pro

> Ce document remplace intégralement la version précédente (datée du 12-13 juillet 2026), devenue obsolète : elle décrivait une « sortie de mode prototype » (accès `anon` étendu sur les tables métier, script `supabase/production/sortie_mode_prototype.sql`) qui **n'existe plus dans le schéma actuel**. Vérifié directement sur `elsatia-preview` le 07-08-2026 : 0 table publique avec RLS désactivé, seules 4 tables ont un grant `anon` — `catalogue_options_abonnement`, `catalogue_services_mise_en_service`, `modeles_roles_predefinis`, `plans_abonnement` — toutes en `SELECT` seul, sur des catalogues publics de tarification, sans aucune donnée métier. Le script `sortie_mode_prototype.sql` et les références aux migrations « 30-37 »/« 43-44 » de l'ancienne version sont sans objet aujourd'hui (199 migrations appliquées, architecture RLS complètement différente) ; ils ne doivent plus être suivis.
>
> Ce document distingue explicitement ce qui est **validé sur Preview** de ce qui reste **à faire avant une vraie ouverture Production**. Une case « validée sur Preview » ne signifie jamais « prêt en Production ».

## A. Déjà validé sur Preview (`elsatia-preview`, réf. `pgvvpqyjziyapbbkydmc`)

Ces éléments ont été vérifiés en conditions réelles ou par inspection directe sur l'environnement Preview. Ils constituent une base technique saine, mais **doivent être revérifiés une fois l'environnement Production réellement provisionné** — rien n'est transposé automatiquement d'un projet Supabase/Vercel à un autre.

| Sujet | Statut | Référence |
| --- | --- | --- |
| TypeScript (`npm run typecheck`) | `VALIDÉ SUR PREVIEW` — 0 erreur | Audit du 07-08-2026 |
| Lint (`npm run lint`) | `VALIDÉ SUR PREVIEW` — 0 erreur, 3 warnings mineurs non bloquants (`<img>` non optimisé) | Audit du 07-08-2026 |
| Tests Vitest | `VALIDÉ SUR PREVIEW` — 238/238 | Lot B3-B5, `REGISTRE_CENTRAL.md` |
| Tests pgTAP | `VALIDÉ SUR PREVIEW` — 241/241 (local, schéma identique à Preview) | Lot B3-B5 |
| Build (`npm run build`) | `VALIDÉ SUR PREVIEW` — réussi sans erreur | Audit du 07-08-2026 |
| `npm audit --audit-level=high` | `VALIDÉ SUR PREVIEW` — 0 vulnérabilité (correctif `js-yaml` intégré) | Lot B3-B5 |
| Authentification (inscription, confirmation, connexion, déconnexion) | `VALIDÉ SUR PREVIEW` — phases 0 à 4 en conditions réelles | `REGISTRE_CENTRAL.md`, recette Auth |
| Authentification — mot de passe oublié | `VALIDÉ SUR PREVIEW` — phase 5 partiellement testée ; quota d'envoi d'e-mails Supabase atteint pendant la recette (voir section Email ci-dessous) | `REGISTRE_CENTRAL.md` |
| Changement de mot de passe (utilisateur connecté) | `VALIDÉ SUR PREVIEW` — accès ajouté dans Mon espace, mécanisme existant réutilisé, 5 tests unitaires | Lot B3-B5 |
| Isolation multi-entreprises — lecture (A↔B) | `VALIDÉ SUR PREVIEW` — sans anomalie | `REGISTRE_CENTRAL.md`, recette isolation |
| Isolation multi-entreprises — écriture (INSERT/UPDATE/DELETE/Server Actions/RPC) | `VALIDÉ SUR PREVIEW` — sans anomalie, hors Storage et relances (couverts séparément) | `REGISTRE_CENTRAL.md`, recette isolation |
| Correctifs RLS / clés étrangères composites (chantiers, factures, devis.client_id, relances_impayes) | `VALIDÉ SUR PREVIEW` — migrations `20260806000196` à `199` appliquées et vérifiées vivantes | `REGISTRE_CENTRAL.md` |
| Isolation Storage — HTTP réel A↔B (upload/download/URL signée/routes/manipulation de chemin) | `VALIDÉ SUR PREVIEW` — sessions authentiques, sans fuite | `REGISTRE_CENTRAL.md`, recette Storage |
| Rebranding ELSATIA | `VALIDÉ SUR PREVIEW` — aucune occurrence active de l'ancienne marque dans le code exécuté | Audit du 07-08-2026 |
| Documents commerciaux (devis, factures, PDF, numérotation, TVA) | `VALIDÉ SUR PREVIEW` — recettes fonctionnelles R7A-C | `REGISTRE_CENTRAL.md` |
| PWA — aspects techniques (manifest, service worker, icônes, notifications push VAPID) | `VALIDÉ SUR PREVIEW` — icônes ajoutées lot B3-B5 ; installation réelle sur appareil non testée | Audit du 07-08-2026, lot B3-B5 |
| Sécurité RLS générale | `VALIDÉ SUR PREVIEW` — 0 table publique avec RLS désactivé, 229 fonctions `SECURITY DEFINER` toutes avec `search_path` explicite, 0 grant `anon` sur donnée métier | Audit du 07-08-2026 |

## B. Prérequis Production encore absents

Aucun de ces points n'est traité par ce document. Tous restent à faire, dans un ordre à déterminer séparément (voir section C).

| Sujet | Statut |
| --- | --- |
| Structure juridique (SIRET, adresse professionnelle, entité pouvant encaisser) | `BLOQUÉ PAR STRUCTURE JURIDIQUE` |
| Mentions légales finalisées | `BLOQUÉ PAR STRUCTURE JURIDIQUE` — placeholders `[À COMPLÉTER]` présents |
| CGV / CGU / politique de confidentialité / politique cookies finalisées | `BLOQUÉ PAR STRUCTURE JURIDIQUE` — dates et champs provisoires non remplis, relecture juridique recommandée avant publication réelle |
| Projet Supabase Production (distinct de `elsatia-preview`) | `ENVIRONNEMENT PRODUCTION À PROVISIONNER` |
| Projet Vercel Production (distinct de `elsatia-preview`) | `ENVIRONNEMENT PRODUCTION À PROVISIONNER` |
| Domaine `elsatia.fr` configuré et pointé | `À FAIRE AVANT PRODUCTION` |
| Variables d'environnement Production (aucune valeur Preview réutilisée) | `À FAIRE AVANT PRODUCTION` |
| Migrations appliquées sur la base Production | `À VALIDER EN PRODUCTION` une fois le projet créé |
| Configuration Auth Production (Site URL, redirections, templates email) | `À FAIRE AVANT PRODUCTION` |
| URLs de redirection Stripe/Powens/notifications push déclarées sur le domaine final | `À FAIRE AVANT PRODUCTION` |
| Storage Production (buckets, policies — à recréer, pas à copier depuis Preview) | `À FAIRE AVANT PRODUCTION` |
| Fournisseur email transactionnel | `FOURNISSEUR EMAIL TRANSACTIONNEL À CHOISIR` (voir détail ci-dessous) |
| Stripe en mode live | `STRIPE LIVE NON CONFIGURÉ` (voir détail ci-dessous) |
| Sentry branché sur l'environnement Production | `À VALIDER EN PRODUCTION` — le code n'active Sentry que si `NODE_ENV=production` et un DSN Production est fourni |
| Sauvegardes Supabase testées et restaurables | `À FAIRE AVANT PRODUCTION` |
| Monitoring/alerting Production | `À FAIRE AVANT PRODUCTION` |
| Vérification des tâches planifiées (crons) en Production | `À VALIDER EN PRODUCTION` |
| Tests de fumée (smoke tests) sur l'environnement Production réel | `À VALIDER EN PRODUCTION` |

### Email transactionnel — détail

- Le code applicatif n'envoie aucun email serveur : `src/lib/email.ts` ne construit que des liens `mailto:` côté client, ouverts par l'utilisateur.
- Les seuls emails automatiques existants (confirmation d'inscription, mot de passe oublié) passent par le service natif de Supabase Auth, **insuffisant pour la commercialisation réelle** : son quota d'envoi a déjà été atteint pendant la recette Auth sur Preview (`REGISTRE_CENTRAL.md`), ce qui aurait bloqué un vrai client cherchant à réinitialiser son mot de passe.
- Devis, factures et relances ne sont donc pas envoyés automatiquement côté serveur à ce jour.
- Aucun fournisseur n'est choisi dans ce document.

```
FOURNISSEUR EMAIL TRANSACTIONNEL À CHOISIR
```

### Stripe / paiement — détail

- Le code Stripe est présent et mature (Checkout, portail client, abonnement, Stripe Connect, webhooks avec vérification de signature HMAC et déduplication en base).
- Aucune configuration live n'est réalisée : toutes les variables `STRIPE_*` sont vides.
- La mise en mode live dépend de deux prérequis qui ne sont pas encore réunis : la structure juridique (section B) et un environnement Production distinct où déclarer les vraies clés et les vrais webhooks.
- Aucune activation live ne doit avoir lieu avant ces prérequis.

```
STRIPE LIVE NON CONFIGURÉ
```

### Environnement Production — état actuel

```
ENVIRONNEMENT PRODUCTION À PROVISIONNER
```

Aucun projet Supabase ni Vercel de Production n'existe à ce jour ; `elsatia-preview` reste l'unique environnement. Rien dans ce document n'autorise à en créer un — cela fera l'objet d'un lot séparé, explicitement autorisé.

## C. Séquence de provisionnement proposée (non exécutée)

Ordre proposé pour le futur lot de provisionnement, à valider et autoriser séparément avant toute exécution :

1. Structure juridique disponible (SIRET, adresse, entité pouvant encaisser).
2. Création du projet Supabase Production.
3. Création du projet Vercel Production.
4. Configuration du domaine `elsatia.fr` (DNS, certificat, redirection depuis `elsatia.com`).
5. Saisie des variables d'environnement Production (aucune valeur Preview réutilisée).
6. Application des migrations sur la base Production.
7. Configuration Auth Production (Site URL, redirections, templates email).
8. Configuration Storage Production (buckets et policies recréés).
9. Mise en place du fournisseur email transactionnel.
10. Configuration Stripe en mode live.
11. Branchement du monitoring (Sentry Production, alerting).
12. Données initiales strictement nécessaires (pas de données de recette/démonstration).
13. Tests de fumée (smoke tests) en conditions Production réelles.
14. Validation finale avant ouverture à de vrais clients.

Cette séquence est une proposition de structure, pas une autorisation d'exécution. Chaque étape nécessitera sa propre autorisation explicite le moment venu.

## Retour arrière d'urgence

En l'absence d'environnement Production à ce jour, cette section ne s'applique pas encore. Elle sera réécrite avec la procédure réelle une fois l'environnement Production provisionné (restauration depuis une sauvegarde testée, procédure de rollback documentée).
