# Checklist de lancement commercial — ELSATIA Gestion Pro

Document unique de suivi avant ouverture à de vrais clients. Chaque section correspond à un chantier obligatoire. Ne pas lancer tant qu'une case du chantier 8 (bascule de lancement) n'est pas explicitement cochée après validation des chantiers 1 à 7.

Dernière mise à jour : 2026-08-05, après validation de R7C (recette Devis) et clôture du chantier technique ci-dessous.

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
- [ ] Pousser les deux commits locaux (`fix(security): corriger fast-uri et brace-expansion`, `chore(recette): versionner le script de peuplement Preview 5 ans`) vers le dépôt distant — **non fait, en attente d'autorisation explicite**.

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
- [ ] Revue complète de `docs/organisation/REGISTRE_CENTRAL.md` pour vérifier qu'aucune autre section n'est obsolète.

## Condition d'arrêt

Ne pas cocher une case sans preuve vérifiée (capture, log de commande, rapport de recette). En cas de doute sur l'état réel d'un point, le laisser décoché plutôt que de le déclarer acquis par optimisme.
