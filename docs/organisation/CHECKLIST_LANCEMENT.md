# Checklist de lancement commercial — ELSATIA Gestion Pro

Document unique de suivi avant ouverture à de vrais clients. Chaque section correspond à un chantier obligatoire. Ne pas lancer tant qu'une case du chantier 8 (bascule de lancement) n'est pas explicitement cochée après validation des chantiers 1 à 7.

Dernière mise à jour : 2026-08-05, après validation de R7C (recette Devis), clôture du chantier technique ci-dessous, confirmation du dépôt de la marque ELSATIA n° 5284384 (section 3bis), et nettoyage des documents de suivi (statut des commits, `REGISTRE_CENTRAL.md`).

## État déjà validé (ne pas revalider sans raison)

- [x] Preview `elsatia-preview` déployée et opérationnelle (commit `4e188ec9c69c54d66860e2cfe7bfddcd4b052dde` au moment de la recette R1-R7C).
- [x] Recette fonctionnelle Devis (R7A, R7B, R7C) validée en conditions réelles sur la Preview.
- [x] Recettes Prestations (R4), Fournisseurs (R5) et Clients (R6) validées.
- [x] 232 tests Vitest passent (`npm run test`).
- [x] TypeScript sans erreur (`npm run typecheck`).
- [x] Lint sans erreur (`npm run lint` — 0 erreur, 3 avertissements préexistants `<img>` sans rapport).
- [x] 189 migrations Supabase cohérentes, dernière `20260802000195_migration_prefixe_qr_lgp_vers_els.sql` (vérifié par comptage direct, checklist Preview mise à jour en conséquence).
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
- [ ] Mettre en place une vérification récurrente (`npm audit` en CI, ou Dependabot/Renovate) pour éviter la réapparition de vulnérabilités hautes non détectées.

## 2. Recette fonctionnelle complète

- [x] Devis (création, calculs, PDF, brouillon).
- [ ] Authentification (inscription, confirmation, connexion, déconnexion, mot de passe oublié) en conditions réelles sur la Preview.
- [ ] Séparation stricte entre entreprises (isolation multi-tenant) sur les modules principaux.
- [ ] Fichiers privés (Storage) : upload autorisé, téléchargement direct refusé si privé, URL signée fonctionnelle.
- [ ] Factures : création, transformation depuis un devis accepté, statuts, PDF.
- [ ] Abonnement Stripe en mode test : Checkout, portail client, webhooks, échec de paiement.
- [ ] Parcours mobile et PWA : installation, mode hors ligne, mise à jour du service worker.

## 3. Identité juridique de l'entreprise

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

- [ ] Remplacer les champs provisoires des CGV.
- [ ] Remplacer les champs provisoires des CGU.
- [ ] Remplacer les champs provisoires des mentions légales.
- [ ] Remplacer les champs provisoires des documents RGPD.
- [ ] Faire relire l'ensemble par une personne compétente (juriste ou équivalent) avant publication.

## 5. Environnement de production distinct

- [ ] Projet Vercel de production, séparé de `elsatia-preview`.
- [ ] Projet Supabase de production, séparé du projet Preview.
- [ ] Stratégie de sauvegarde testée et restaurable (pas seulement activée).
- [ ] Domaine `elsatia.fr` configuré et pointé.
- [ ] Configuration Auth de production (Site URL, redirections, templates) sur le domaine définitif.
- [ ] Variables d'environnement de production saisies et vérifiées (aucune valeur de test/Preview réutilisée).

## 6. Stripe réel

- [ ] Compte Stripe validé (KYC terminé).
- [ ] Tarifs réels configurés (Mini/Pro/Business/Entreprise, mensuel/annuel).
- [ ] TVA configurée correctement.
- [ ] Portail client activé.
- [ ] Webhooks de production configurés et testés.
- [ ] Règles de gestion des impayés définies et implémentées.

## 7. Exploitation courante

- [ ] E-mails professionnels opérationnels (envoi transactionnel, réception support).
- [ ] Tâches automatiques (crons) activées et surveillées en production.
- [ ] Surveillance des erreurs (Sentry ou équivalent) branchée sur l'environnement de production.

## 8. Bascule de lancement (jour J uniquement)

Ne cocher qu'au moment réel du lancement, pas avant :

- [ ] Désactiver définitivement le mode prototype.
- [ ] Supprimer les accès anonymes.
- [ ] Supprimer les comptes et données de démonstration de l'environnement de production.

## 9. Dette documentaire

- [x] Scripts de recette non suivis réglés (versionnés dans Git avec tests).
- [x] `PREVIEW_ELSATIA_CHECKLIST.md` mise à jour (nombre de migrations).
- [x] Revue de `docs/organisation/REGISTRE_CENTRAL.md` : date de consolidation et tableau « État des autres sujets » actualisés (recette Preview R1-R7C, checklist de lancement, dépôt de marque). Le tableau des lots 1-7 (rebranding) reste inchangé — vérifié encore exact (lot 6 toujours non fusionné sur `lot6/nettoyage-final-elsatia`, lot 7 toujours non commencé).

## Condition d'arrêt

Ne pas cocher une case sans preuve vérifiée (capture, log de commande, rapport de recette). En cas de doute sur l'état réel d'un point, le laisser décoché plutôt que de le déclarer acquis par optimisme.
