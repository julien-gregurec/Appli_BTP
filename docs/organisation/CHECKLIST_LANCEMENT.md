# Checklist de lancement commercial — ELSATIA Gestion Pro

Document unique de suivi avant ouverture à de vrais clients. Chaque section correspond à un chantier obligatoire. Ne pas lancer tant qu'une case du chantier 8 (bascule de lancement) n'est pas explicitement cochée après validation des chantiers 1 à 7.

Dernière mise à jour : 2026-08-07, après clôture de la recette d'isolation multi-entreprises (lecture, écriture, Storage HTTP réel), l'audit final pré-commercialisation en lecture seule, et le lot technique B3-B5 (changement de mot de passe, icônes PWA, correctif `js-yaml`). Voir `docs/organisation/REGISTRE_CENTRAL.md` pour le détail de chaque recette.

Statuts utilisés dans ce document : `VALIDÉ SUR PREVIEW` (vérifié sur `elsatia-preview`, à revalider une fois l'environnement Production provisionné) · `À FAIRE AVANT PRODUCTION` · `À VALIDER EN PRODUCTION` (dépend d'un environnement Production qui n'existe pas encore) · `BLOQUÉ PAR STRUCTURE JURIDIQUE` · `NON APPLICABLE`. Une case cochée signifie toujours « validé sur Preview », jamais « Production prête ».

## État déjà validé (ne pas revalider sans raison)

- [x] Preview `elsatia-preview` déployée et opérationnelle (commit `4e188ec9c69c54d66860e2cfe7bfddcd4b052dde` au moment de la recette R1-R7C).
- [x] Recette fonctionnelle Devis (R7A, R7B, R7C) validée en conditions réelles sur la Preview.
- [x] Recettes Prestations (R4), Fournisseurs (R5) et Clients (R6) validées.
- [x] 232 tests Vitest passent (`npm run test`).
- [x] TypeScript sans erreur (`npm run typecheck`).
- [x] Lint sans erreur (`npm run lint` — 0 erreur, 3 avertissements préexistants `<img>` sans rapport).
- [x] 189 migrations Supabase cohérentes, dernière `20260802000195_migration_prefixe_qr_lgp_vers_els.sql` au 2026-08-05 (vérifié par comptage direct, checklist Preview mise à jour en conséquence). **Mise à jour 2026-08-07 : 199 migrations désormais appliquées** (correctifs d'isolation `196` à `199`, `local=remote` reconfirmé) — voir `REGISTRE_CENTRAL.md`.
- [x] Pages juridiques déjà présentes dans l'application (route `/mentions-legales` construite avec succès).
- [x] Aucun secret détecté dans Git (état rapporté avant ce chantier ; non revérifié ligne par ligne dans cette session).

## Chantier technique du 2026-08-05 (traité dans cette session)

- [x] Vulnérabilité `fast-uri` (haute, host confusion) corrigée : 3.1.4 → 3.1.5.
- [x] Vulnérabilité `brace-expansion` (haute, DoS) corrigée au passage : 1.1.16 → 1.1.18.
- [x] `npm audit` : 0 vulnérabilité restante (high/critical/moderate/low).
- [x] Build, typecheck, lint et tests entièrement rejoués après correction — tous au vert.
- [x] Scripts de recette (`scripts/seed-elsatia-preview-year.mjs` et son test) intégrés à Git avec leur propre suite de tests (37/37, `node --test`).
- [x] `docs/exploitation/PREVIEW_ELSATIA_CHECKLIST.md` corrigée (188 → 189 migrations, nom du dernier fichier).
- [x] Commits poussés vers le dépôt distant, branche synchronisée jusqu'à `ff63e6d` inclus (sécurité, scripts de recette, checklist, dépôt de marque).

## 1. Sécurité des dépendances

- [x] `fast-uri` corrigé.
- [x] Vérification récurrente ajoutée à la CI : `npm audit --audit-level=high` sur les pull requests, les poussées `main` / `release/commercialisation-v1`, en lancement manuel et chaque lundi.

## 2. Recette fonctionnelle complète

- [x] Devis (création, calculs, PDF, brouillon).
- [x] `VALIDÉ SUR PREVIEW` — Authentification (inscription, confirmation, connexion, déconnexion, mot de passe oublié) en conditions réelles sur la Preview. Phases 0 à 4 validées ; phase 5 (mot de passe oublié) partiellement testée, quota d'envoi d'e-mails Supabase atteint pendant la recette — voir section 7. Voir `REGISTRE_CENTRAL.md`, ligne « Recette Auth ».
- [x] `VALIDÉ SUR PREVIEW` — Séparation stricte entre entreprises (isolation multi-tenant), lecture et écriture, sur les modules principaux. Recette close le 07-08-2026, sans anomalie résiduelle. Voir `REGISTRE_CENTRAL.md`, lignes « Recette Isolation Multi-Entreprises » et correctifs associés (RLS chantiers, factures, `devis.client_id`, `relances_impayes`).
- [x] `VALIDÉ SUR PREVIEW` — Fichiers privés (Storage) : upload autorisé, téléchargement direct refusé si privé, URL signée fonctionnelle. Testé en HTTP réel avec sessions authentiques A↔B, aucune fuite croisée. Voir `REGISTRE_CENTRAL.md`, ligne « Recette Storage — validation fonctionnelle HTTP réelle A↔B ».
- [ ] Factures : création, transformation depuis un devis accepté, statuts, PDF.
- [ ] Abonnement Stripe en mode test : Checkout, portail client, webhooks, échec de paiement.
- [ ] Parcours mobile et PWA : installation, mode hors ligne, mise à jour du service worker. Aspects techniques (manifest, icônes, service worker) validés le 07-08-2026 (lot B3-B5) ; installation réelle sur appareil non testée.

### Chantier technique du 2026-08-07 (lot B3-B5, hors périmètre Production)

- [x] Accès utilisateur au changement de mot de passe ajouté (Mon espace → Compte et sécurité), réutilisant le mécanisme existant, 5 tests unitaires.
- [x] Icônes PWA créées (192/512, variantes maskable) à partir de la marque ELSATIA existante, manifeste mis à jour, 1 test unitaire.
- [x] Vulnérabilité npm haute `js-yaml` corrigée (`npm audit --audit-level=high` → 0 vulnérabilité).
- [x] Build, typecheck, lint, 238 tests Vitest et 241 tests pgTAP rejoués après correction — tous au vert. Voir `REGISTRE_CENTRAL.md`, ligne « Lot technique pré-commercialisation B3-B5 ».

## 3. Identité juridique de l'entreprise

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — bloquant racine dont dépendent les sections 4 et 6.

- [ ] Statut juridique de la société qui encaissera l'abonnement (aucune structure n'existe à ce jour).
- [ ] Adresse professionnelle.
- [ ] SIRET.
- [ ] E-mail professionnel (`@elsatia.fr` ou équivalent).

### 3bis. Marque ELSATIA — point bloquant avant commercialisation (mis à jour 2026-08-05)

Recherche du 2026-08-05 sur `data.inpi.fr` (bases Marques France/UE/International, mise à jour au 31/07/2026) : aucune marque « ELSATIA » trouvée à cette date. Explication confirmée depuis par le récapitulatif de dépôt : le dépôt (01-08-2026) est postérieur à la dernière mise à jour de la base publique (31-07-2026), simple décalage de publication, pas une absence réelle de dépôt.

**Dépôt confirmé** (récapitulatif INPI reçu) :

- [x] Démarche bien « déposée » (récapitulatif signé et daté, redevances payées) — pas un brouillon.
- [x] Numéro national de dépôt : `5284384`, date de dépôt : `01-08-2026`, type : marque française verbale.
- [x] Classes retenues : `9` (logiciels enregistrés), `35` (gestion/organisation/administration des affaires, gestion informatisée de fichiers), `42` (développement, édition, maintenance, hébergement de logiciels, SaaS).
- [x] Accusé de réception / récapitulatif obtenu et conservé par l'utilisateur.
- [x] Déposant : personne physique, au nom de l'entité « Elsatia » **en cours de formation** (société pas encore créée) — cohérent avec le chantier 3 ci-dessus (aucune structure légale existante à ce jour). Le dépôt de marque n'attend donc pas la création de la société, mais celle-ci reste nécessaire pour les autres points du chantier 3 (SIRET, adresse professionnelle, encaissement).

Domaines `.fr` et `.com` déjà acquis (déclaré, non vérifié techniquement).

**Reste à faire avant d'éviter tout risque** :

- [ ] Faire réaliser une recherche de similitudes phonétiques et visuelles (pré-diagnostic INPI ou conseil en propriété industrielle) — la simple recherche par nom exact ne suffit pas, et le dépôt reste opposable pendant sa période d'examen/publication.
- [ ] Surveiller la publication du dépôt au BOPI et l'absence d'opposition dans les délais légaux avant de considérer la marque définitivement acquise.

## 4. Documents légaux définitifs

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — les documents `docs/juridique/*.md` existent avec un contenu substantiel (non modifiés par ce lot documentaire) mais contiennent des placeholders (`[À COMPLÉTER]`, dates `[JJ/MM/AAAA]`) qui dépendent des informations de la section 3.

- [ ] Remplacer les champs provisoires des CGV.
- [ ] Remplacer les champs provisoires des CGU.
- [ ] Remplacer les champs provisoires des mentions légales.
- [ ] Remplacer les champs provisoires des documents RGPD.
- [ ] Faire relire l'ensemble par une personne compétente (juriste ou équivalent) avant publication — recommandé avant toute publication réelle, indépendamment de l'avancement technique.

## 5. Environnement de production distinct

```
ENVIRONNEMENT PRODUCTION À PROVISIONNER
```

Aucun projet Supabase ni Vercel de Production n'existe à ce jour ; `elsatia-preview` reste l'unique environnement. Voir `PRODUCTION_CHECKLIST.md` pour la checklist détaillée et la séquence de provisionnement proposée (non exécutée).

- [ ] Projet Vercel de production, séparé de `elsatia-preview`.
- [ ] Projet Supabase de production, séparé du projet Preview.
- [ ] Stratégie de sauvegarde testée et restaurable (pas seulement activée).
- [ ] Domaine `elsatia.fr` configuré et pointé.
- [ ] Configuration Auth de production (Site URL, redirections, templates) sur le domaine définitif.
- [ ] Variables d'environnement de production saisies et vérifiées (aucune valeur de test/Preview réutilisée).

## 6. Stripe réel

```
STRIPE LIVE NON CONFIGURÉ
```

`BLOQUÉ PAR STRUCTURE JURIDIQUE` — le code Stripe est présent et mature (Checkout, portail client, abonnement, Connect, webhooks avec vérification de signature et déduplication en base), mais la mise en mode live dépend de la structure juridique (section 3) et d'un environnement Production (section 5). Aucune activation live avant ces deux prérequis.

- [ ] Compte Stripe validé (KYC terminé).
- [ ] Tarifs réels configurés (Mini/Pro/Business/Entreprise, mensuel/annuel).
- [ ] TVA configurée correctement.
- [ ] Portail client activé.
- [ ] Webhooks de production configurés et testés.
- [ ] Règles de gestion des impayés définies et implémentées.

## 7. Exploitation courante

- [ ] `FOURNISSEUR EMAIL TRANSACTIONNEL À CHOISIR` — E-mails professionnels opérationnels (envoi transactionnel, réception support). Le code n'envoie aujourd'hui aucun email serveur (`src/lib/email.ts` ne construit que des liens `mailto:` côté client) ; les emails d'authentification dépendent uniquement du service natif Supabase Auth, dont le quota d'envoi a déjà été atteint pendant la recette sur Preview. Devis, factures et relances ne sont pas envoyés automatiquement côté serveur à ce jour. Aucun fournisseur choisi dans ce lot.
- [ ] `À VALIDER EN PRODUCTION` — Tâches automatiques (crons) activées et surveillées en production. Code présent (`/api/cron/abonnements`), non vérifiable sans environnement Production réel.
- [ ] `À VALIDER EN PRODUCTION` — Surveillance des erreurs (Sentry) branchée sur l'environnement de production. Sentry est intégré côté code (client/serveur/edge, configuration RGPD-consciente) mais ne s'active que si `NODE_ENV=production` et qu'un DSN Production est fourni.

## 8. Bascule de lancement (jour J uniquement)

Ne cocher qu'au moment réel du lancement, pas avant. Mise à jour 2026-08-07 : le « mode prototype » historique (accès `anon` étendu aux tables métier, script `sortie_mode_prototype.sql`) n'existe plus dans le schéma actuel — voir `PRODUCTION_CHECKLIST.md`. Les deux premiers points ci-dessous sont donc `NON APPLICABLE` tels que formulés à l'origine ; reformulés pour refléter l'état réel :

- [ ] `NON APPLICABLE` (mode prototype déjà inexistant sur Preview — à revérifier explicitement une fois la base Production créée, pour confirmer qu'aucun mécanisme équivalent n'y a été réintroduit par erreur).
- [ ] Vérifier qu'aucun grant `anon` inattendu n'existe sur une table métier de la base Production (seuls des catalogues publics en lecture seule sont légitimes — voir la liste exacte dans `PRODUCTION_CHECKLIST.md`).
- [ ] Supprimer les comptes et données de démonstration de l'environnement de production.

## 9. Dette documentaire

- [x] Scripts de recette non suivis réglés (versionnés dans Git avec tests).
- [x] `PREVIEW_ELSATIA_CHECKLIST.md` mise à jour (nombre de migrations).
- [x] Revue de `docs/organisation/REGISTRE_CENTRAL.md` : date de consolidation et tableau « État des autres sujets » actualisés (recette Preview R1-R7C, checklist de lancement, dépôt de marque). Le tableau des lots 1-7 (rebranding) reste inchangé — vérifié encore exact (lot 6 toujours non fusionné sur `lot6/nettoyage-final-elsatia`, lot 7 toujours non commencé).
- [x] 2026-08-07 — `PRODUCTION_CHECKLIST.md` entièrement réécrit (l'ancienne version décrivait un mode prototype obsolète) et ce document mis en cohérence avec l'état réel du dépôt (recette d'isolation close, lot technique B3-B5 intégré). Voir `REGISTRE_CENTRAL.md`.

## Condition d'arrêt

Ne pas cocher une case sans preuve vérifiée (capture, log de commande, rapport de recette). En cas de doute sur l'état réel d'un point, le laisser décoché plutôt que de le déclarer acquis par optimisme.
