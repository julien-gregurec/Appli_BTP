# REPRISE — 15 juillet 2026, personnalisation et fournisseurs libres (MIGRATIONS 82–83 À APPLIQUER)

- Le schéma Supabase a été contrôlé directement : `fournisseur_code` et `couleur_secondaire_documents` sont absents, donc les migrations 82 puis 83 ne sont pas passées. Ne pas publier le code avant leur application.
- N’importe quel fournisseur peut être relié depuis `/connecteurs`, qu’il existe déjà ou qu’il soit créé sur place. Le vrai nom est repris, le portail HTTPS est ouvrable depuis la connexion et aucun mot de passe n’est stocké.
- Six styles de documents, menu regroupé par dossiers, aperçu de poste cohérent et widgets d’accueil affichables/masquables sont intégrés.
- Guide complet livré et intégré à `/aide` : `output/pdf/Guide_utilisation_detaille_Liria_Gestion_Pro.pdf`, 55 pages contrôlées visuellement, avec captures et synchronisations.
- Contrôles finaux locaux : ESLint, TypeScript, 23 tests, diff-check et build webpack de 73 routes verts. Publication Git/Vercel à faire seulement après les migrations 82–83.

---

# REPRISE — 15 juillet 2026, connecteurs fournisseurs et budget SaaS (MIGRATION 82 À APPLIQUER)

- Lot local non publié : migration `20260715000082_connecteurs_fournisseurs_sans_batichiffrage.sql` et nouvelle interface fournisseurs.
- BatiChiffrage est retiré de l’application et du schéma cible. Ne pas réintroduire cette option.
- Fournisseurs préparés : Würth, Foussier, SIEHR, Espace Aubade/eBat et Saint-Gobain Vitrage Bâtiment/PROVITRAGE. Numéro client uniquement, jamais de mot de passe.
- Würth/Foussier : catalogue, PunchOut et EDI annoncés officiellement, mais activation réelle conditionnée par les paramètres de leurs équipes e-procurement. SIEHR/Aubade/PROVITRAGE : portail et imports CSV/Excel tant qu’aucune API partenaire n’est fournie.
- Import de tarifs négociés ajouté dans `/parametres/import`, avec mise à jour sans doublon des références fournisseur.
- Budget actuel dans `docs/BUDGET_MISE_EN_SERVICE.md` : 45 $/mois minimum + domaine, 65 $/mois recommandé avec e-mails professionnels, puis OCR/SMS/Stripe à l’usage.
- Vérifications : ESLint, TypeScript, **21/21 tests**, diff-check et build webpack complet de 73 routes verts. La migration 82 est dans le presse-papiers ; l’appliquer avant publication et test authentifié `/connecteurs`.

---

# ÉTAT AUTORITATIF — 14 juillet 2026, audit global, équipes chantier et nouvelles vidéos (Codex)

**Migrations 77, 78 et 79 + nettoyage des entreprises de test confirmés appliqués par Julien. Lot publié sur `main` au commit `544d35a` et déployé par Vercel.**

- Contrôle post-migration : `entreprises`, `employes` et `equipes_chantiers` refusent désormais toute lecture anonyme. La faille prototype est fermée.
- Le script de nettoyage a conservé LIRIA CONCEPT et supprimé les deux entreprises juju avec leurs données liées.
- Les vidéos finales sont disponibles dans `/aide`, en téléchargement public contrôlé, et dans le dossier Bureau `Liria Gestion Pro`.

- Produit : **Liria Gestion Pro**. Le logo logiciel est `public/liria-gestion-pro-logo.png`; le logo de l’entreprise active est séparé dans la navigation et reste utilisé sur ses documents.
- Vidéos entièrement régénérées : guide Full HD **8 min 23** et publicité **59 s**, voix féminine française `fr-FR-DeniseNeural`, musique abaissée, mix normalisé à environ -16 LUFS, sous-titres incrustés + WebVTT, présentatrice adulte et interfaces animées. Fichiers finaux dans `output/video/` et `public/videos/`.
- Pointage : acquisition GPS automatique à l’ouverture, date/heure serveur, bouton bloqué tant que la position n’est pas prête ; aucune action « Me localiser ».
- Équipes permanentes de chantier : migration **77** `20260714000077_equipes_chantiers.sql`, rôles ouvrier/chef d’équipe/chef de chantier/conducteur de travaux, dates et notes. Gestion depuis la fiche chantier ; `Mes travaux`, fiche salarié et carte BTP utilisent ces rattachements.
- Consultation/Gestion renforcées sur les salariés : création, modification, statuts, invitations, accès dépôt, carte et habilitations exigent `gerer_employes`. Le coût et le taux horaire exigent `voir_indicateurs_financiers`.
- Sécurité critique trouvée : les accès anonymes prototype étaient encore actifs dans Supabase. La migration **78** `20260714000078_fermeture_acces_anonyme_production.sql` supprime toutes les policies et permissions `anon` et doit être passée avant de considérer la production sécurisée.
- Encodage : « Compte dépôt » corrigé immédiatement dans les trois anciennes lignes ; migration **79** rend le correctif reproductible.
- Entreprises de test : la base contient LIRIA CONCEPT et deux doublons juju. Le compte test a été détaché, mais la suppression finale est bloquée par la table d’audit protégée. Exécuter `supabase/production/supprimer_entreprises_test.sql` en administrateur Supabase : il conserve LIRIA CONCEPT et supprime seulement les deux juju.
- Audit local : **39/39 routes** ordinateur/mobile sans erreur HTTP ou page. ESLint OK, TypeScript OK, **14/14 tests**, build webpack **63 pages**, `npm audit --omit=dev` = **0 vulnérabilité**, `git diff --check` OK.
- Publication terminée ; ne plus rejouer le script de nettoyage sauf restauration volontaire des entreprises de test.

---

# Relais Claude Code — Liria Gestion Pro

## ÉTAT AUTORITATIF — 14 juillet 2026, identité et vidéos (Codex)

- Produit confirmé : **Liria Gestion Pro**. L’ancien logo statique `Liria Concept` est supprimé et remplacé par `public/liria-gestion-pro-logo.png`; icônes PWA 192/512/Apple Touch régénérées. Les logos importés par les entreprises continuent de primer sur les devis et factures.
- Deux MP4 Full HD livrés sous `output/video/` : tutoriel complet 7 min 30 et publicité 53 s. Voix féminine française, présentatrice blonde adulte, musique originale et sous-titres SRT. Sources reproductibles dans `scripts/create-liria-videos.py`.
- `/aide` intègre le tutoriel avec lecteur, poster, sous-titres WebVTT et téléchargement (`public/videos/`). `/videos` est explicitement public pour partager directement le tutoriel et la publicité.
- Couverture du guide PDF refaite avec le nouveau logo. Le PDF public reste à 24 pages avec 33 signets et ne contient plus `LIRIA CONCEPT` dans le texte extrait. Script : `scripts/update-guide-branding.py`.
- Contrôles terminés : TypeScript OK, ESLint OK, 14/14 tests, build webpack OK, PDF 24 pages/33 signets, MP4 1080p avec pistes audio vérifiées. Reste uniquement la publication Git/Vercel de ce lot.

---

## ÉTAT AUTORITATIF — 14 juillet 2026, lot 76 et données juju (Codex)

- Migration 76 appliquée par Julien. Lot identifiants salariés + compte partagé du dépôt publié sur `main` (`2664259`, puis `7572ff0`) et déployé par Vercel.
- Paramètres entreprise : identifiant interne existant ou préfixe 2–8 caractères + quatre chiffres. La fonction `configurer_identifiants_employes` renumérote proprement les salariés sans changer leurs comptes, invitations ni historiques.
- Le numéro `BTP-…` reste le secret d’activation/invitation. Le nouvel `identifiant_interne` est celui affiché et utilisé sur la borne stock.
- Poste spécial `Compte dépôt` pour entreprises présentes et futures : uniquement Stock/Borne/Dépôt, terminal verrouillé tant que ce compte reste connecté, déconnexion explicite obligatoire avant un autre compte.
- Borne v3 : mot de passe personnel + contrôle des droits entrée/sortie du poste du salarié. Le compte dépôt ne peut jamais faire passer un mouvement en son propre nom sans identification personnelle.
- Seed six mois exécuté avec succès sur la cible exacte `juju`. Le premier essai avait été intégralement annulé par `affectations_lieu_coherent_check` ; les deux rotations de tableaux sont corrigées dans `supabase/production/seed_juju_6_mois.sql`. Les accès de test et les compteurs ont bien été renvoyés.
- Incident d’encodage du collage Supabase : plusieurs accents des données JUJU sont devenus `√©`/`Ã`. Le script ciblé et transactionnel `supabase/production/corriger_encodage_juju.sql` corrige clients, chantiers, devis/factures, planning, stock, fournisseurs, achats, frais, congés et flotte sans toucher aux autres entreprises. Il est dans le presse-papiers mais pas encore confirmé exécuté. Le seed source encode désormais ses valeurs accentuées avec `U&'\....'` pour prévenir le problème.
- Guide complet livré : PDF A4 de 24 pages dans `output/pdf/Guide_utilisation_Liria_Gestion_Pro.pdf`, copie applicative sous `public/guides/`, lien ajouté sur `/aide`. Contrôle des 24 rendus PNG effectué sans coupure ni chevauchement ; 41 458 caractères extractibles et 33 entrées de plan PDF.
- Raccourci direct ajouté au pied du menu principal ordinateur/mobile : « Guide d’utilisation » avec badge PDF. Il est masqué sur le compte dépôt afin de conserver son verrouillage strict sur les fonctions logistiques.
- Fichiers applicatifs concernés : paramètres entreprise, actions entreprise/stock, borne stock, Sidebar/proxy, liste/fiche/carte employés et Mon espace.
- Contrôles actuels : TypeScript, ESLint, 14/14 tests, diff-check et build webpack complet verts. Seul l’avertissement connu `unpdf/import.meta` reste non bloquant.
- Production : le guide public répond HTTP 200 avec `content-type: application/pdf`. Prochaine séquence : test authentifié du compte dépôt et d'un changement de préfixe ; aucun autre déploiement n'est requis pour le lot.

---

## ÉTAT AUTORITATIF — 14 juillet 2026, accès propriétaire et impayés (Codex)

- **Migrations 74 et 75 appliquées par Julien.** Lots `667016b` puis `ddf3ea1` poussés sur `gh/main` et déployés par Vercel.
- Depuis `/plateforme`, un membre plateforme de rôle `total` ou `support` peut entrer dans une entreprise avec droits administrateur après saisie d’un motif obligatoire. Aucune fiche salarié/membership facturable n’est créée.
- L’accès support est une session explicite dans `plateforme_acces_entreprises` : entreprise précédente conservée, entrée/sortie horodatées, motif journalisé, bandeau permanent et bouton « Quitter l’entreprise ». `est_membre_actif` et `a_permission` reconnaissent cette session ; le proxy et le calcul des permissions accordent alors les droits complets.
- Impayés : bouton plateforme « Signaler l’impayé · délai 10 jours », message administrateur, échéance serveur exacte, compteur plateforme et compte à rebours côté entreprise. Seuls les comptes ayant `gerer_utilisateurs` ou `gerer_parametres` voient l’avertissement.
- Suspension réellement automatique : dès que `suspension_prevue_at <= now()`, `est_membre_actif` refuse les accès même sans tâche cron ni visite de la plateforme. Le client est envoyé vers `/abonnement-suspendu`. La prochaine lecture plateforme matérialise également `abonnement_statut='suspendu'`.
- « Règlement reçu » annule le compte à rebours, enregistre la date, remet un compte suspendu à actif et rétablit les accès. La suspension manuelle existante reste disponible.
- Alertes de ce lot = alertes dans l’application. Aucun email automatique n’est envoyé tant que Resend/SMTP n’est pas configuré.
- Contrôles : ESLint OK, TypeScript OK, 14/14 tests, build Next webpack OK, diff-check OK. Production : `/abonnement-suspendu` répond HTTP 200 ; `/plateforme` redirige bien vers `/login` sans session. Test pgTAP structurel ajouté sous `supabase/tests/plateforme_impayes.test.sql` mais non exécuté sans base liée.
- Reste un test fonctionnel authentifié depuis le compte propriétaire : plateforme → entrer entreprise → quitter ; signaler impayé → bandeau admin ; règlement reçu → disparition du bandeau. Éviter de tester la suspension sur une entreprise réelle sans prévenir ses utilisateurs.

---

## ÉTAT AUTORITATIF — 14 juillet 2026, borne dépôt et mobile (Codex)

- Les migrations **57 à 73 sont appliquées** et l’authentification réelle est active en production. Les anciennes sections indiquant `57–71 non appliquées` ou `DISABLE_EMAIL_LOGIN=true` sont historiques et ne doivent plus guider la reprise.
- Lot local terminé et vérifié, **non publié tant que la migration 74 n’est pas appliquée** : `supabase/migrations/20260714000074_acces_stock_personnel.sql`.
- Connexions PC/téléphone : aucun raccourcissement de session n’a été ajouté. Supabase SSR conserve et renouvelle déjà les cookies de session (durée maximale par défaut de la bibliothèque : 400 jours), jusqu’à déconnexion volontaire ou révocation du compte. Le login l’explique désormais clairement.
- Borne dépôt : le compte partagé peut rester connecté, mais chaque mouvement exige `numero_inscription` (`BTP-…`) + mot de passe stock personnel. Les anciens PIN définis par un administrateur sont invalidés par la migration 74.
- Le salarié crée/modifie lui-même ce mot de passe dans `/mon-espace` (8–72 caractères, lettre + chiffre, bcrypt/pgcrypto, jamais stocké en clair). L’administrateur voit seulement l’état actif et peut réinitialiser, jamais définir ni lire le secret.
- La RPC `enregistrer_mouvement_stock_borne_v2` impose une session membre avec droit `utiliser_borne_stock`, limite les essais, renvoie un message générique en cas d’identifiants invalides et attribue le mouvement à l’employé identifié.
- Planning téléphone : vue remplacée par une lecture **jour par jour**, barre de navigation hebdomadaire collante, activités empilées avec employé, chantier/lieu/tâche, heures prévues et heures validées. Le tableau ouvriers × jours reste sur ordinateur.
- Plateforme : le prix affiché utilise désormais les **comptes facturables** (`actif` + `pause`), et non les membres. Formule automatique : base de l’offre recommandée Essentiel/Pro/Premium (49/89/149 €) incluant 3 comptes + 12 € par compte supplémentaire. Deux tests Vitest couvrent la formule.
- QR/code-barres : le registre et les triggers de la migration 68 couvrent déjà employés, véhicules, outils, références stock et chantiers existants/futurs. Le pointage au nom d’autrui reste bloqué par la migration 70.
- Vérifications de ce lot : ESLint OK, TypeScript OK, **14/14 tests**, build Next webpack OK (seul avertissement connu `unpdf/import.meta`). `git diff --check` OK.
- Blocage de publication : ni session CLI Supabase (`SUPABASE_ACCESS_TOKEN` absent), ni contrôle navigateur utilisable dans cette session. Appliquer la migration 74 dans le SQL Editor, puis refaire un test réel `/mon-espace` → création mot de passe → `/stock/borne` → mouvement, avant commit/push.

### Fichiers du lot local

- `supabase/migrations/20260714000074_acces_stock_personnel.sql`
- `src/app/actions/stock.ts`, `src/components/StockKioskForm.tsx`, `/stock/borne`, `/mon-espace`
- fiche admin employé + action de réinitialisation dans `src/app/actions/employes.ts`
- `src/app/(app)/planning/page.tsx`
- `src/app/(app)/plateforme/page.tsx`, `src/lib/plateforme.ts`, `src/lib/plateforme.test.ts`
- `src/app/login/page.tsx`, `supabase/production/sortie_mode_prototype.sql`, test pgTAP borne stock

---

## Reprise Codex — 13 juillet 2026, lot local en attente des migrations 57–71

- État autoritatif : un important lot est terminé localement mais **pas encore appliqué à Supabase ni déployé**. Le CLI n’est pas lié, aucun `SUPABASE_ACCESS_TOKEN` n’est disponible et le navigateur SQL n’est pas pilotable. Exécuter les migrations `20260713000057` à `20260713000071` dans l’ordre avant toute publication.
- `57–61` : archivage des notes de frais (originaux privés, MIME réel, SHA-256, versions, workflow, audit append-only, legal hold, contrôle d’intégrité et export ZIP avec CSV/manifeste/historique). Lire `docs/ARCHIVAGE_JUSTIFICATIFS.md`.
- `62` : congés personnels reliés au planning. `63` : cycle de vie et facturation des comptes par poste, création entreprise plateforme, tarifs et snapshots mensuels. `64` : personnalisation des documents. `65` : pointage/affectations/heures chantiers. `66` : devis sans prix pour intervenants. `67` : réparation/rebut outillage et travaux véhicule.
- `68–69` : registre QR articles/chantiers/véhicules/outils/employés, borne stock mobile par code personnel haché et chantier obligatoire, limitation des essais, puis socle de droits personnels obligatoire pour tous les postes futurs.
- `70` : durcissement pointage au nom propre. Le droit de gestion ne peut plus créer/clôturer pour un autre employé ; il reste limité à la consultation, correction et validation de l’équipe.
- `71` + `/plateforme/facturation` : relevé historique des comptes facturés, détail par salarié/poste/offre et total HT par entreprise. Les comptes fermés en cours de mois restent facturés.
- Routes clés : `/notes-frais/[id]`, `/notes-frais/exports`, `/parametres/notes-frais`, `/conges`, `/mes-travaux`, `/stock/borne`, `/plateforme`.
- Contrôles verts : 12 tests Vitest, TypeScript, lint et build de production. Tests SQL pgTAP préparés sous `supabase/tests/` mais non exécutés faute de base liée.
- `DISABLE_EMAIL_LOGIN=true` reste actif. Ne pas ouvrir les justificatifs personnels dans ce mode et ne pas appliquer `supabase/production/sortie_mode_prototype.sql` sans bascule auth coordonnée.
- Les fichiers doublons non suivis `*page 2.tsx` / `StockMovementForm 2.tsx` sont hors périmètre : ne pas les inclure.

## Reprise Codex — 15 juillet 2026 (migrations 80 et 81 appliquées)

- Migrations `20260715000080_suite_metier_complete.sql` et `20260715000081_securite_terrain_alertes_personnalisation.sql` confirmées appliquées par Julien ; le code associé est déployé en production.
- Lot publié sur `main` jusqu’au commit `10a9da6` ; Vercel a confirmé le déploiement terminé. Routes publiques/privées contrôlées : login 200, dashboard/chantiers/notes-frais protégés par redirection vers la connexion.
- Migration 81 et code associé corrigent l’e-mail iOS (`+`), le mojibake, les calculs automatiques HT/TVA/TTC, les prix achat/revente du stock, le QR salarié + mot de passe de la borne, les horaires par jour et alertes de pointage, les notifications congés/notes de frais, les pièces jointes chantier par audience et la confidentialité de l’accueil ouvrier.
- Congés envoyés immédiatement sans brouillon. Tableau de bord personnalisable par masquage de raccourcis autorisés. « Mes travaux » reste sans aucun prix.
- Complément local : les lignes de devis acceptées deviennent des tâches chantier et les anciens devis acceptés sont rétroactivement synchronisés par la migration 81. Plans autorisés visibles sur la fiche chantier ; justificatifs de notes de frais servis directement après contrôle ; test e-mail sans `+` ajouté.
- Contrôles locaux : TypeScript, lint, **19 tests** et build webpack verts ; avertissement `unpdf/import.meta` historique uniquement.

## Reprise Codex — 13 juillet 2026

- Nom officiel du logiciel : **Liria Gestion Pro**. `LIRIA CONCEPT` reste l’entreprise utilisatrice et son identité documentaire.
- `/parametres/acces` contient un aperçu en lecture seule par poste, avec vues téléphone/ordinateur et simulation fidèle du menu, des niveaux Consulter/Gérer/Personnel/Chiffres, du pointage et du planning. Route : `/parametres/acces/apercu/[id]` ; composant `ApercuPoste` ; navigation partagée dans `src/lib/navigation.ts`.
- Migration 53 appliquée : notes de frais rattachables à un chantier ; accès aux notes d’autrui conditionné par `gerer_notes_frais` + `voir_indicateurs_financiers` dans l’UI, les actions, la RLS et le stockage. Accès anon supprimé pour ce module : les notes sont masquées tant que le prototype sans identité reste actif.
- Migration 54 appliquée : Planning, Pointage, pointage personnel et notes personnelles sont obligatoires pour tous les postes, y compris les futurs ; RPC et UI empêchent leur retrait. Employés : date de sortie uniquement au statut Sorti, ancienneté calculée et affichée dans liste/fiche.
- Migrations hébergées 47 et 48 contrôlées comme appliquées ; migrations 49 à 51 appliquées pour corriger la création d’employé, rendre les notes de frais strictement personnelles et tracer automatiquement l’auteur réel des commandes.
- Pointage, notes de frais et commandes audités : aucun formulaire authentifié ne permet d’agir au nom d’un autre salarié. Les fonctions de gestion d’équipe restent séparées.
- Installation PWA, invitation par numéro BTP, rattachement par code entreprise et création d’entreprise vérifiés. L’authentification réelle reste volontairement désactivée tant que la sortie du prototype n’est pas validée.
- `/employes` possède maintenant une vraie vue mobile en cartes : état de l’accès applicatif, poste, numéro BTP et détail dépliable des droits par salarié. Test réussi à 390 px. Le tableau complet reste sur ordinateur. Commit `b41f747` déployé et contrôlé sur l’adresse publique.
- `/flotte` et `/outillage` ont également une vue mobile en cartes. Flotte affiche l’ouvrier assigné, kilométrage et échéances ; Outillage affiche affectation, état, disponibilité et vérification. Les tableaux restent sur ordinateur.
- `/clients` et `/chantiers` ont maintenant des cartes mobiles avec statut, informations principales et accès pleine largeur à la fiche ; filtres et tableaux ordinateur conservés.
- `/devis` et `/factures` ont maintenant des cartes mobiles : client, statut, dates, montant, chantier ou reste à encaisser, avec accès direct à l’envoi/PDF. Les tableaux ordinateur restent inchangés.
- Dans `/devis/nouveau`, `+ Nouveau chantier` est désormais toujours visible et explique le rattachement obligatoire au client. Après création rapide d’un client, le mini-formulaire chantier s’ouvre automatiquement ; la création ajoute et sélectionne le chantier sans quitter le devis.
- Migration 52 appliquée et vérifiée : permission indépendante `voir_indicateurs_financiers`, chiffres globaux/alertes/devis masqués sans ce droit, deux postes de gestion autorisés actuellement. Le pointage est strictement personnel côté page, action serveur et RLS ; la gestion d’équipe ne permet jamais de pointer pour autrui.
- Le tableau de bord terrain contient le pointage arrivée/départ et le planning personnel. Le mobile possède un menu renforcé et un retour déterministe ; l’accueil devient `Bonjour Prénom` avec un vrai compte.
- `DISABLE_EMAIL_LOGIN=true` reste le dernier verrou : le prototype masque les chiffres mais ne peut pas appliquer une identité différente par ouvrier. La sortie coordonnée du prototype nécessite l’accord explicite de Julien, puis script `supabase/production/sortie_mode_prototype.sql` + variable Vercel à `false` + redéploiement.
- Validations : lint, TypeScript, build webpack et diff-check verts.

## Mise à jour Codex — 12 juillet 2026 (à lire en premier)

- Les migrations hébergées **29 à 37 sont appliquées** (`28` est volontairement hors migrations, sous `supabase/production/`). Les migrations 35 code entreprise et 36 espace propriétaire ne sont plus en attente.
- Migration 36 contrôlée : colonne abonnement, propriétaire, fonctions de liste/modification et grant authentifié = OK. Page `/plateforme` HTTP 200.
- Planning hebdomadaire multi-ouvriers, accès/rôles, email avec CC, logo importable, pointage GPS+photo, stock Excel/PDF+nuanciers+scan, véhicules affectés et factures liées aux véhicules/outils sont livrés.
- La facture fournisseur peut être scannée/importée (PDF/image privée 20 Mo) et reliée à un chantier, un employé et un actif.
- Listes marque/modèle : véhicules via suggestions locales + API officielle vPIC, outillage via suggestions BTP ; saisie libre conservée.
- Lire `SUIVI_BESOINS_METIER.md` pour la matrice complète fait/partiel/externe.
- Validations vertes : lint, TypeScript, build webpack, diff-check.
- Le script de durcissement production a été complété pour les RPC 30–37 et retesté en `BEGIN … ROLLBACK` avec succès ; le prototype est confirmé intact (46 policies anon). Il reste NON APPLIQUÉ.

## Projet

- Dépôt : `/Users/juliengregurec/Documents/btp-platform`
- Next.js `16.2.10`, React 19, Supabase.
- Mode prototype sans connexion actif via `.env.local` (`DISABLE_EMAIL_LOGIN`).
- Base Supabase hébergée : projet `uykukebthgmqtxlmkpnn`.
- Lire `AGENTS.md` et la documentation locale Next.js 16 avant toute modification.

## État Git important

Le dépôt repose encore presque entièrement sur des fichiers non suivis depuis le commit initial. Ne pas lancer de nettoyage, reset ou checkout destructif. Les changements présents appartiennent au projet en cours.

## Modules fonctionnels

- Comptes et entreprises.
- Clients et chantiers, tâches et statuts.
- Employés.
- Planning par affectations : chantier + employé + date + heures + tâche.
- Devis : création, lignes, descriptions, statuts, modification des brouillons, duplication, recherche et filtres.
- Prestations préenregistrées : catalogue, création, modification, activation/désactivation et insertion dans les devis.
- Factures : création depuis devis accepté, statuts, paiements, échéance, recherche et filtres.
- Impression/PDF devis et factures.
- Tableau de bord opérationnel et alertes d’échéance.
- Fiches clients enrichies avec historique financier et documents récents.
- Fiches chantiers enrichies avec devis, factures, encaissements et heures planifiées.
- Paramètres d’entreprise modifiables depuis l’application.
- Recherche et filtres sur clients, chantiers, devis et factures.

## Travail récent détaillé

### Prestations

- Migration `20260710000012_prestations_catalogue.sql`.
- Table `prestations_catalogue`, RLS, accès prototype et cinq prestations BTP seedées.
- Routes `/prestations`, `/prestations/nouveau`, `/prestations/[id]/modifier`.
- Insertion immédiate d’une prestation dans `DevisEditor`.
- Description visible et modifiable dans la ligne du devis.
- Enregistrement rapide d’une ligne manuelle dans le catalogue.

### Devis

- Modification des brouillons via `/devis/[id]/modifier`.
- Migration `13` : modification atomique du devis et de ses lignes.
- Migration `14` : duplication atomique vers un nouveau brouillon.
- Boutons Modifier et Dupliquer sur la fiche.
- Transitions de statut limitées côté UI et serveur.
- Recherche par numéro/client/chantier, filtre de statut et indicateurs.
- Confirmations sur duplication et suppression.

### Factures

- Recherche et filtre par statut.
- Indicateurs total facturé, encaissé et reste dû.
- Date d’échéance modifiable sur la fiche.
- Paiements refusés sur brouillon/annulée/avoir et si le montant dépasse le reste dû.
- Suppression d’un paiement confirmée et vérifiée contre sa facture.
- Transitions de statut limitées ; statuts payés pilotés automatiquement par les paiements.

### Tableau de bord

- Total facturé, encaissé, reste à encaisser, devis acceptés.
- Devis à suivre, chantiers actifs et prochaines affectations.
- Alertes pour factures échues non soldées et devis envoyés expirés.

### Clients

- La fiche client affiche le total facturé, encaissé et le reste dû.
- Les cinq derniers devis et factures sont accessibles depuis la fiche.
- Le bouton « Nouveau devis » présélectionne le client.

### Chantiers

- La fiche chantier affiche devis acceptés, facturé, encaissé et heures planifiées.
- Les documents récents sont accessibles depuis la fiche.
- Le bouton « Nouveau devis » présélectionne maintenant réellement le client et le chantier.
- La liste des chantiers est filtrable par texte et statut.

### Paramètres

- Route `/parametres` active dans le menu.
- Modification de l’identité, adresse, SIRET, assurances, pénalités de retard et textes des documents.
- Les valeurs alimentent les impressions devis/factures existantes.

### Listes

- Clients : recherche par référence, nom ou ville, filtres type/statut.
- Chantiers : recherche par référence, nom, client ou ville, filtre statut.
- Devis et factures : recherches, filtres et indicateurs financiers.

### Sécurité

- Les actions serveur de clients, employés, planning, prestations, chantiers, tâches, devis et factures vérifient explicitement `entreprise_id` en complément de la RLS.
- Composant `ConfirmSubmitButton` pour les actions sensibles.

## Migrations Supabase

Appliquées manuellement sur la base hébergée :

- `20260710000012_prestations_catalogue.sql`
- `20260710000013_modification_devis_atomique.sql`
- `20260710000014_duplication_devis.sql`
- `20260710000015_creation_devis_atomique.sql`
- `20260710000016_delai_paiement_client.sql`
- `20260710000017_modification_facture_atomique.sql`
- `20260710000018_pointages.sql`
- `20260710000019_stock.sql`
- `20260710000020_synchro_statuts.sql`
- `20260710000021_commandes_fournisseurs.sql`
- `20260710000022_documents_chantier.sql`
- `20260710000023_flotte.sql`
- `20260710000024_outillage.sql`
- `20260710000025_depot_inventaires.sql`
- `20260710000026_depenses_fournisseurs.sql`
- `20260710000027_charges_recurrentes.sql`

### État de la création atomique

`20260710000015_creation_devis_atomique.sql` est appliquée. La RPC `creer_devis_brouillon` utilisée par `src/app/actions/devis.ts` est disponible sur la base hébergée.

Attention avec l’éditeur SQL Supabase : un onglet réutilisé a déjà mélangé deux requêtes. Toujours créer un nouveau snippet vierge, coller la migration, vérifier visuellement que la fin du fichier est correcte, puis exécuter.

## Validations effectuées

Après les derniers changements, les commandes suivantes étaient vertes :

```bash
npm run lint
npx tsc --noEmit --incremental false
npx next build --webpack
git diff --check
```

## Reprise recommandée

1. Tester la création réelle d’un devis avec une prestation préenregistrée, puis sa modification et sa duplication.
2. Vérifier visuellement les nouvelles fiches client/chantier et `/parametres`.
3. Prochaine fonctionnalité métier recommandée : édition atomique des factures brouillons ou conditions de paiement/échéance par défaut depuis la fiche client.

## Rebranding LIRIA CONCEPT — 11 juillet 2026

- L’entreprise `ENT-001` a été renommée `LIRIA CONCEPT` dans la base Supabase hébergée.
- Nom commercial confirmé par `LIRIA_CONCEPT_Dossier_Pro.pdf` : LIRIA CONCEPT.
- Positionnement : spécialiste de l’aménagement intérieur, professionnels et particuliers.
- Slogan : `Concevoir • Aménager • Réaliser`.
- Coordonnées reprises du visuel véhicule : `06 50 93 11 87` et `liriaconcept@gmail.com`.
- Charte reprise du dossier de marque : bleu nuit `#0D1B2A`, or `#C9A24A`, anthracite `#1F2328`, blanc `#FFFFFF`.
- Logo intégré dans `public/liria-concept-logo.png` et affiché dans la navigation ainsi que les devis/factures imprimables.
- Métadonnées, pages de connexion et navigation renommées LIRIA CONCEPT.
- Les anciens statuts PDF concernent `JULIEN GREGUREC MULTISERVICES` : leur capital et leur dénomination n’ont volontairement pas été attribués à LIRIA CONCEPT.

### Délais de paiement clients

- La migration `20260710000016_delai_paiement_client.sql` est appliquée sur la base hébergée.
- Chaque client dispose d’un délai de paiement de 0 à 365 jours, 30 jours par défaut.
- La création d’une facture depuis un devis accepté calcule automatiquement `date_echeance` depuis ce délai.
- La fonction vérifie que le devis est accepté, possède un client et que ce client appartient à la même entreprise.
- Test transactionnel réussi sur `DEV-2026-003` : échéance attendue obtenue, puis transaction annulée sans conserver la facture de test.
- Contrôle du schéma réussi : colonne `clients.delai_paiement_jours` et RPC `creer_facture_depuis_devis(uuid,text)` présentes.

### Modification des factures brouillons

- Route active : `/factures/[id]/modifier`, accessible seulement pour une facture au statut brouillon.
- Édition du client, chantier, type, dates d’émission et d’échéance, notes et lignes.
- Insertion de prestations depuis le catalogue et aperçu instantané HT/TVA/TTC.
- Migration `20260710000017_modification_facture_atomique.sql` appliquée sur la base hébergée.
- RPC `modifier_facture_brouillon` : verrouille la facture, refuse les factures émises, valide client/chantier, remplace les lignes et recalcule les totaux dans une transaction unique.
- Test transactionnel réussi : facture temporaire créée, remplacée par une ligne de 200 € HT / 240 € TTC, total contrôlé, puis transaction annulée.
- Le détail d’une facture vérifie maintenant explicitement `entreprise_id` et affiche le bouton Modifier uniquement en brouillon.

### Pointage des heures

- Module `/pointage` actif dans la navigation.
- Migration `20260710000018_pointages.sql` appliquée sur la base hébergée.
- Saisie des heures normales, heures supplémentaires, pause, tâche et commentaire par employé, chantier et date.
- Contrôles base : maximum 24 h, valeurs positives et cohérence entreprise/employé/chantier.
- Filtre mensuel, totaux normaux/supplémentaires, total par employé et détail des saisies.
- Suppression protégée par confirmation et filtrée par `entreprise_id`.
- Test réel réussi : pointage de 7 h créé dans l’application, visible dans les totaux et la liste, puis supprimé sans laisser de donnée de test.

### Rentabilité des chantiers

- Module `/rentabilite` actif dans la navigation.
- Agrège par chantier les devis acceptés, les factures HT et les heures réellement pointées.
- Calcule le coût de main-d’œuvre depuis `employes.cout_horaire`, la marge estimée et le taux de marge.
- Vue synthétique globale et tableau détaillé avec accès direct aux chantiers.
- L’interface indique explicitement que matériaux, sous-traitance, déplacements et frais généraux ne sont pas encore déduits.
- Vérification visuelle réussie sur les données LIRIA : 15 090 € HT facturés affichés pour le chantier existant.

### Stock

- Module `/stock` actif dans la navigation.
- Migration `20260710000019_stock.sql` appliquée sur la base hébergée.
- Catalogue d’articles avec référence unique, unité, emplacement, seuil d’alerte et prix d’achat HT.
- Entrées, sorties chantier et ajustements avec historique des 30 derniers mouvements.
- Le stock disponible est mis à jour sous verrou par un trigger ; une sortie supérieure au disponible est refusée.
- Synthèse du nombre d’articles, alertes de réapprovisionnement et valeur d’achat estimée.
- Test transactionnel réussi : article temporaire, entrée de 10 unités, quantité contrôlée à 10, puis transaction annulée.

### Synchronisation statuts et commandes fournisseurs — 12 juillet 2026

- Migration 20 appliquée après audit de sécurité : factures FAC-2026-001/002/003 payées, chantier CHA-2026-001 facturé.
- Les acomptes, situations et avoirs ne clôturent pas automatiquement un chantier.
- Recalcul paiements sérialisé, liens document/chantier isolés par entreprise et helpers internes retirés aux rôles publics.
- Migration 21 appliquée après réécriture : fournisseurs et commandes strictement isolés par entreprise.
- Création commande+lignes atomique, totaux multi-TVA recalculés en base, transitions et réceptions atomiques.
- Réception partielle et complète disponible depuis la fiche commande.
- Tests SQL et navigateur réussis ; données de test fournisseur/commande supprimées et absence résiduelle vérifiée.
- Le relais de référence le plus récent est désormais `RELAIS_CHATGPT.md` dans le dépôt, synchronisé vers `/Users/juliengregurec/RELAIS_CHATGPT.md`.

### Photos et documents chantier — 12 juillet 2026

- Migration 22 appliquée sur la base hébergée ; bucket privé `chantier-documents` et table `documents_chantier`.
- Route `/chantiers/[id]/documents` : ajout d’images, PDF, Word et Excel (15 Mo maximum), 8 catégories métier et note facultative.
- Galerie avec aperçu des images, libellé de catégorie, taille, téléchargement par URL signée et suppression confirmée.
- Isolation par entreprise dans la table et dans Storage ; le mode prototype est limité à ce bucket.
- La fiche chantier affiche le lien « Photos & documents » et le nombre de pièces.
- Test réel réussi avec une pièce technique temporaire : affichage, lien de téléchargement HTTP 307, suppression via l’interface et compteur revenu à zéro.
- `npm run lint`, TypeScript, build production webpack et `git diff --check` sont verts.
- Prochaine fonctionnalité recommandée : flotte automobile (véhicules, kilométrage, entretiens et échéances).

### Flotte automobile — 12 juillet 2026

- Migration 23 appliquée : `vehicules` et `releves_kilometrage`, isolation entreprise et RLS.
- Module `/flotte` actif dans la navigation : liste, création, fiche véhicule et alertes d’échéance.
- Suivi contrôle technique, assurance, entretien par date/km et historique kilométrique.
- Le kilométrage est mis à jour sous verrou et ne peut pas diminuer.
- Test navigateur réussi : véhicule temporaire à 10 000 km puis relevé à 10 150 km ; données de test supprimées.
- Prochaine fonctionnalité recommandée : outillage.

### Outillage — 12 juillet 2026

- Migration 24 appliquée : registre `outils`, historique `mouvements_outillage`, références automatiques et isolation entreprise.
- Module `/outillage` actif : liste, alertes de vérification, création et fiche individuelle.
- Affectation à un employé et/ou chantier, retour, maintenance, remise en service, mise hors service et perte.
- Transitions atomiques sous verrou ; une double affectation est refusée et chaque mouvement est historisé.
- Test navigateur création → affectation Julien → retour réussi, puis test direct du verrou ; quatre mouvements contrôlés avant suppression de l’outil temporaire.
- Audit des privilèges : les rôles applicatifs ne peuvent ni modifier ni supprimer directement `outils`, mais peuvent appeler la RPC métier.
- Prochaine fonctionnalité recommandée : dépôt et inventaires.

### Dépôt et inventaires — 12 juillet 2026

- Migration 25 appliquée : zones physiques, rattachement des articles/outils, inventaires et lignes de comptage.
- `/depot` gère les zones et le rangement des articles ; zone « Dépôt principal » créée automatiquement.
- `/inventaires` permet un comptage global ou par zone, avec sauvegarde puis validation atomique.
- Les écarts créent automatiquement des mouvements de stock ; une seconde validation est refusée.
- Si le stock change après l’instantané, la validation est bloquée et le brouillon est conservé.
- Test réel 10 unités → 8 comptées → stock ajusté à 8, puis test de concurrence réussi. Données temporaires nettoyées, compteurs à zéro.
- Prochaine fonctionnalité recommandée : centre d’alertes opérationnelles sur le tableau de bord.

### Centre d’alertes opérationnelles — 12 juillet 2026

- Le tableau de bord consolide maintenant les alertes factures, devis, commandes fournisseurs, stock, flotte et outillage.
- Priorités « critique » et « à anticiper », triées par gravité puis échéance.
- Échéances contrôlées : encaissement, validité commerciale, livraison, contrôle technique, assurance, entretien date/km et vérification outillage.
- Chaque alerte mène directement à l’objet concerné ; l’état sans alerte est également prévu.
- Vérification navigateur réussie sur une vraie alerte de vérification Outillage.
- Prochaine fonctionnalité recommandée : exports comptables CSV factures/règlements/TVA.

### Exports comptables CSV — 12 juillet 2026

- Module `/exports` actif dans la navigation, période début/fin configurable.
- Journal des ventes, journal des règlements et détail/synthèse TVA téléchargeables.
- Format Excel français : UTF-8 BOM, séparateur point-virgule et virgule décimale.
- Avoirs négatifs, brouillons sans numéro exclus, synthèse regroupée par facture et taux.
- Protection contre l’injection de formules CSV ; nombres négatifs conservés comme valeurs numériques.
- Tests réels : ventes 4 lignes, règlements 6 lignes, TVA cohérente à 4 160,00 € entre journal et synthèse, en-têtes et noms de fichiers validés.
- Prochaine fonctionnalité recommandée : dépenses/factures fournisseurs reliées aux chantiers et à la rentabilité.

### Dépenses fournisseurs et rentabilité réelle — 12 juillet 2026

- Migration 26 appliquée : factures/dépenses fournisseurs et règlements, avec RLS et isolation entreprise.
- Module `/depenses` actif : fournisseur, chantier, commande, catégorie, HT, TVA, TTC, échéance et paiements.
- Anti-doublon, commande cohérente avec fournisseur/chantier, paiement plafonné sous verrou et statut automatique.
- Les en-têtes sont immuables pour les rôles applicatifs après création ; seuls les flux contrôlés mettent à jour règlement/statut.
- `/rentabilite` déduit désormais les dépenses HT rattachées au chantier en plus de la main-d’œuvre.
- Test réel 120 € TTC : partiel 50 €, surpaiement refusé, solde 70 €, statut payé ; marge chantier réduite de 100 € HT puis restaurée après nettoyage. Compteurs temporaires 0/0.
- Prochaine fonctionnalité recommandée : trésorerie prévisionnelle.

### Trésorerie prévisionnelle — 12 juillet 2026

- Module `/tresorerie` actif dans la navigation.
- Encaissements/décaissements réalisés sur 30 jours, reste total clients/fournisseurs et projection 90 jours.
- Treize semaines avec entrées, sorties, net et variation cumulée, plus graphique en barres.
- Échéances dépassées regroupées dans la première semaine ; flux au-delà de 90 jours ignorés.
- Données réelles vérifiées : 24 960 € encaissés sur 30 jours et aucun reste au moment du test.
- Moteur pur testé : retard 100 € en semaine 1, sortie 40 € en semaine 2, cumul 60 €, hors-fenêtre ignoré.
- Prochaine fonctionnalité recommandée : charges récurrentes et frais généraux.

### Charges récurrentes — 12 juillet 2026

- Migration 27 appliquée : `charges_recurrentes`, lien vers les dépenses et RPC de matérialisation atomique.
- `/charges` gère fournisseur, catégorie, chantier, périodicité, HT/TVA, date de fin et prochaine échéance.
- Les occurrences futures sont incluses dans `/tresorerie` ; la transformation en facture fournisseur avance la date.
- Test réel : 60 € TTC mensuels → 180 € projetés sur 90 jours ; dépense créée, prochaine échéance au mois suivant, projection inchangée donc aucun double comptage.
- Audit SQL table/colonne/RPC/grant réussi ; données temporaires supprimées, compteurs 0/0/0.
- Prochaine étape structurante : préparer le passage en production (auth réelle, retrait du prototype anon, hébergement et secrets).

### Préparation production — 12 juillet 2026

- `PRODUCTION_CHECKLIST.md` créé avec préconditions, ordre de bascule, validations et retour arrière.
- Script manuel `supabase/production/sortie_mode_prototype.sql` créé mais **NON APPLIQUÉ** et volontairement sorti des migrations automatiques.
- Elle supprime les policies/grants anon, verrouille les fonctions SECURITY DEFINER, conserve les RPC authentifiées et retire `dev_contexte_entreprise`.
- Dry-run transactionnel avec rollback réussi : assertions sécurité toutes vertes et prototype encore accessible après annulation.
- Le propriétaire LIRIA est techniquement prêt : membre actif, profil, compte Auth, email confirmé, mot de passe et connexion antérieure vérifiés sans afficher ses données personnelles.
- Blocage volontaire : ne pas appliquer le script manuel de production avant choix de l’hébergement/URL, sauvegarde et confirmation explicite de la coupure du prototype.

### Travail en attente à ne pas oublier

- Une fois le SIRET et la forme juridique définitifs de LIRIA connus, compléter les paramètres légaux sans reprendre automatiquement ceux de l’ancienne SAS.

### Historique de démonstration complet — 12 juillet 2026

- Supabase contient désormais plusieurs mois d'activité fictive mais réaliste, sans suppression des données antérieures.
- Totaux : 8 clients, 9 chantiers, 8 employés, 12 devis, 8 factures, 12 affectations planning, 13 pointages, 10 prestations, 12 articles / 20 mouvements de stock, 3 zones de dépôt, 1 inventaire validé, 7 fournisseurs, 5 commandes, 3 véhicules, 9 outils, 6 dépenses fournisseurs et 3 charges récurrentes.
- Les liens métier sont renseignés : clients/chantiers/documents/paiements, équipes/temps, stock/chantiers, fournisseurs/commandes/dépenses, véhicules et outils/ouvriers.
- Coordonnées fictives sur `example.fr`, marqueur `HISTORIQUE_DEMO_LIRIA_2026`, références `DEMO-*`.
- Script réexécutable sans doublons : `scripts/seed-demo-history.mjs` (double exécution contrôlée avec compteurs identiques).

### Lot terrain, emails et imports — 12 juillet 2026

- Migrations 38/39 appliquées : sessions arrivée/départ GPS+photos et historique atomique des affectations véhicule.
- `/pointage` calcule automatiquement les heures depuis l’arrivée et le départ, pause déduite ; la saisie manuelle reste disponible.
- PDF A4 et envoi email assisté avec CC ajoutés aux commandes fournisseur ; devis/factures conservent le même flux.
- Fiche véhicule enrichie : affectation courante et historique, factures liées avec chantier, résumé des travaux récents de l’ouvrier.
- Matériel hors service explicitement indisponible et toujours bloqué à l’affectation par la RPC.
- Imports XLSX/CSV/PDF ajoutés pour flotte et outillage.
- Photo chantier rapide depuis téléphone, classée avant/pendant/après travaux.
- Lint, TypeScript, build webpack et tests visuels locaux verts.

### Adaptation mobile — 12 juillet 2026

- En-tête compact et menu coulissant sur téléphone ; navigation bureau inchangée.
- Grilles, cartes et formulaires passent en une colonne ; boutons agrandis et modales adaptées à la hauteur disponible.
- Les tableaux défilent dans leur conteneur sans élargir toute la page.
- Tests 390×844 et 360×800 réussis sur dashboard, pointage, devis, stock, flotte et commandes, sans débordement horizontal.

### Permissions Consulter / Gérer — 12 juillet 2026

- Migration 40 appliquée : droits `acces_*` de consultation séparés de 12 nouveaux droits `gerer_*`.
- Postes existants rétrocompatibles : leur gestion a été conservée initialement ; décocher seulement Gérer les rend lecteurs.
- UI des rôles simplifiée avec badges Consulter/Gérer ; Gérer implique automatiquement Consulter côté SQL.
- Mode lecture seule : bandeau explicite, actions de mutation masquées, filtres GET conservés.
- Protection serveur : les POST sont refusés par le proxy si le droit Gérer du module manque.

### Pointage GPS simplifié — 12 juillet 2026

- Migration 41 appliquée : photo facultative en base et RPC compatible GPS seul.
- Nouveau pointage : employé + chantier obligatoire + GPS obligatoire ; date et heure automatiques à l’arrivée et au départ.
- Photos et saisie manuelle retirées de l’interface ; tâche facultative, pause et calcul des heures conservés.
- Historique dédié avec chantier bien visible, arrivée, départ, durée et liens GPS. Anciennes saisies conservées en archives.

### Comptes collaborateurs et carte BTP — 13 juillet 2026

- Parcours collaborateur déjà présent : inscription individuelle, saisie du code entreprise, demande d’adhésion, validation admin et affectation d’un poste avec droits Consulter/Gérer.
- La séparation des comptes nécessite encore l’activation volontaire de l’authentification réelle ; en mode prototype sans connexion, le contexte administrateur reste partagé.
- Migration 42 appliquée : métadonnées de carte BTP sur `employes` et bucket privé `documents-employes` (PDF/PNG/JPEG/WebP, 10 Mo).
- La fiche employé permet d’importer/remplacer, présenter, télécharger et supprimer la carte ; numéro et expiration sont facultatifs.
- La route privée `/api/employes/[id]/carte-btp` contrôle l’entreprise puis génère un lien signé temporaire. Test mobile 360×800 validé.

### Affichage compact des postes — 13 juillet 2026

- `/parametres/acces` affiche les postes sous forme de panneaux repliables, fermés par défaut.
- Chaque résumé indique membres, consultations et gestions ; le détail des permissions se déplie sans perdre l’état des cases.
- Le bouton d’enregistrement reste dans le panneau développé.

### Invitation guidée des collaborateurs — 13 juillet 2026

- `/parametres/acces` permet de copier le code, copier un message d’invitation ou partager via le téléphone.
- Le lien `/signup?code=…` conserve le code dans les métadonnées Auth et le préremplit sur `/onboarding`, même après confirmation d’email.
- L’onboarding met l’adhésion en premier et distingue clairement la création d’entreprise pour le dirigeant.
- Avertissement explicite tant que le mode prototype empêche encore les comptes individuels.

### Scan caméra stock — 13 juillet 2026

- `StockMovementForm` utilise `@zxing/browser` chargé à la demande pour scanner les codes-barres avec la caméra arrière.
- Détection automatique, vibration, sélection article, lampe conditionnelle et messages précis si permission/caméra indisponible.
- Saisie manuelle et douchette conservées en repli. Lint, TypeScript et build webpack verts.
- `npm audit` remonte deux alertes modérées PostCSS transitives à Next 16.2.10 sans correction stable sûre ; ne pas lancer `npm audit fix --force`.

### Cycle de compte collaborateur — 13 juillet 2026

- Callbacks SSR ajoutés : `/auth/callback` pour PKCE et `/auth/confirm` pour les emails `token_hash`, avec redirections internes filtrées.
- Inscription reliée au callback et code entreprise conservé jusqu’à l’onboarding.
- Mot de passe oublié et définition d’un nouveau mot de passe ajoutés ; déconnexion forcée après succès.
- Les modèles email exacts et redirect URLs à configurer dans Supabase sont documentés dans `PRODUCTION_CHECKLIST.md`.

### Renforcement RLS Gérer — 13 juillet 2026

- Audit confirmé : le proxy bloquait les POST, mais les anciennes policies RLS authentifiées restaient trop larges pour un appel direct Supabase.
- Migration 43 **appliquée avec succès dans Supabase** : `a_permission`, policies restrictives d’écriture sur 35 tables, tables enfants, buckets privés et wrappers sécurisés autour des RPC `SECURITY DEFINER` métier.
- Le prototype anon reste compatible. `sortie_mode_prototype.sql` réaccorde désormais `a_permission` à authenticated après durcissement.
- Exécution réelle effectuée dans une transaction SQL Editor, puis présence de `a_permission(uuid,text)` contrôlée. L’auth production reste volontairement désactivée jusqu’aux réglages emails/URLs.

### Modules non autorisés invisibles — 13 juillet 2026

- Sidebar bureau/mobile déjà filtrée ; dashboard désormais filtré serveur et sans requête vers les modules interdits.
- Zone « Mes modules » limitée aux permissions `acces_*`; aucun poste attribué affiche seulement l’attente d’un admin.
- Proxy complété pour documents chantier, exports, référentiel véhicules et impressions devis/factures/commandes.
- Lint, TypeScript et build webpack verts ; prototype conserve tous les modules.

### PWA installable — 13 juillet 2026

- Manifeste `/manifest.webmanifest`, mode standalone, démarrage `/dashboard`, thème LIRIA et icônes LC 192/512/Apple Touch.
- Bouton d’installation dans la Sidebar pour navigateurs compatibles ; guide Safari spécifique iPhone.
- Service worker réseau uniquement, sans cache de données métier privées.
- Build et tests HTTP du manifeste, SW, icônes et métadonnées Apple verts.

### Sous-droits sensibles invisibles — 13 juillet 2026

- Lien `/parametres/acces` masqué sans `gerer_utilisateurs`, même avec consultation des paramètres.
- Boutons Valider/Rejeter des anciennes saisies masqués sans `valider_pointages`; suppression reste sous `gerer_pointage`.
- Lint, TypeScript et build webpack verts.

### Numéro d’inscription et invitation employé — 13 juillet 2026

- Migration 44 appliquée : `employes.numero_inscription`, `poste_id`, `utilisateur_id`, `compte_active_at`, fonctions et triggers de synchronisation.
- Chaque fiche reçoit un numéro personnel aléatoire `BTP-…`; contrôle Supabase : 8 employés, 8 numéros attribués, 8 uniques.
- La fiche employé doit désormais être préparée avec un poste applicatif. Elle affiche `À inviter`/`Compte activé` et permet copier/partager une invitation personnelle.
- `/signup?numero=…` et `/onboarding` conservent le numéro. La RPC `activer_compte_employe` vérifie l’email de la fiche, rattache le compte à l’entreprise et applique directement le poste et ses droits.
- Un changement de poste est répercuté dans les deux sens; `suspendu`/`sorti` désactive l’appartenance. Le numéro peut aussi être saisi après installation de la PWA et le bouton Installer est accessible dès l’inscription.
- Lint, TypeScript, build webpack et écrans HTTP employés verts.

### Pointage personnel et profils terrain — 13 juillet 2026

- Migration 45 appliquée : droit `saisir_son_pointage`, lecture RLS limitée à la fiche liée au compte et arrivée/départ GPS autorisés uniquement pour soi. Les corrections/suppressions restent sous `gerer_pointage`.
- Le proxy et le bandeau lecture seule acceptent ce droit spécialisé sans ouvrir les autres actions de gestion ; l’écran ne propose que la fiche du compte à l’ouvrier.
- Migration 46 appliquée : `ouvrier` = Chantiers, Planning, Pointage personnel ; `Chef d’équipe` = mêmes bases + consultations Stock/Flotte/Outillage et gestion/validation planning-pointages. Aucun accès commercial, financier ou paramètres.
- Les données LIRIA existantes sont préparées : 3 fiches Chef d’équipe et 5 fiches Ouvrier, soit 8/8 avec numéro et poste.

### Droits visibles depuis la liste Employés — 13 juillet 2026

- La liste Employés indique maintenant pour chaque salarié si l’accès est activé ou si l’invitation reste à envoyer, ainsi que le poste applicatif préparé.
- Une colonne Autorisations résume les droits Consulter, Gérer et spéciaux ; son détail dépliable affiche les libellés lisibles avec les badges Voir/Gérer/Spécial.
- Les droits sont visibles même avant l’activation du compte, afin de contrôler le profil avant invitation. Le tableau reste utilisable sur mobile grâce à son défilement horizontal interne.

## Fichiers clés

## Reprise Codex — identité des actions et migrations 47 à 51 — 13 juillet 2026

- Les migrations 47 et 48 sont appliquées et contrôlées dans Supabase. Les anciennes mentions « à passer » sont obsolètes.
- Migration 49 appliquée : la création d’employé ne produit plus l’erreur de droit sur generer_numero_inscription_employe. Le trigger est security definer, le générateur reste privé. Test sous rôle anon réussi puis annulé.
- Migration 50 appliquée : une note de frais est obligatoirement créée pour la fiche employé liée au compte. Le formulaire ne permet plus de choisir un collègue en auth réelle. Les droits saisir_ses_notes_frais et gerer_notes_frais séparent dépôt personnel et traitement comptable. Les justificatifs utilisent le bucket privé notes-frais.
- Migration 51 appliquée : les commandes enregistrent automatiquement le compte auteur et sa fiche employé liée ; aucun auteur alternatif n’est accepté par le formulaire.
- Le pointage personnel était déjà correctement protégé par la migration 45, y compris côté RLS et RPC.
- Le parcours installation/invitation a été audité : PWA sur signup, invitation par numéro personnel ou code entreprise, onboarding avec activation de fiche, rejoindre ou créer une entreprise.
- Important : le mode prototype reste actif. Les comptes individuels ne seront effectifs qu’après la bascule volontaire documentée dans PRODUCTION_CHECKLIST.md.
- Contrôles Supabase et application verts : lint, TypeScript, build webpack, diff-check et vérification structurelle des migrations.

- `src/components/DevisEditor.tsx`
- `src/app/actions/devis.ts`
- `src/app/actions/factures.ts`
- `src/app/actions/prestations.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/devis/[id]/modifier/page.tsx`
- `src/app/(app)/prestations/page.tsx`
- `src/components/ConfirmSubmitButton.tsx`
- `supabase/migrations/20260710000012_prestations_catalogue.sql`
- `supabase/migrations/20260710000013_modification_devis_atomique.sql`
- `supabase/migrations/20260710000014_duplication_devis.sql`
- `supabase/migrations/20260710000015_creation_devis_atomique.sql`

## Relais de pause — 13 juillet 2026

### Dernier état publié

- Production : `https://liria-concept-gestion-btp.vercel.app`
- Dernier commit publié sur `main` : `1beee4b feat: prepare les acces personnels des employes`.
- Migrations **43, 44, 45 et 46 appliquées avec succès** dans Supabase, chacune dans une transaction puis contrôlée.
- 8 fiches employés : 8 numéros d’inscription uniques, 3 profils `Chef d’équipe`, 5 profils `ouvrier`.
- Le parcours fiche préparée → numéro `BTP-…` → invitation → inscription → contrôle email → poste/droits automatiques est codé et déployé.
- Le droit `saisir_son_pointage` limite l’ouvrier à son propre pointage et à ses propres données GPS ; les chefs/admins gardent la vue équipe.
- Derniers contrôles publiés : lint, TypeScript, build webpack et HTTP production verts.

### Travail local commencé, à terminer en premier

Un lot **« Mon espace »** a été commencé après le commit `1beee4b`, mais il n’est **ni committé ni déployé** :

- `src/components/Sidebar.tsx` modifié avec l’entrée `Mon espace`.
- `src/app/(app)/mon-espace/page.tsx` nouveau : fiche personnelle, numéro d’inscription, carte BTP, planning futur, véhicule et outillage assignés.
- `src/app/api/mon-espace/carte-btp/route.ts` nouveau : accès privé à la carte BTP de la seule fiche liée au compte.
- Lint et TypeScript sont verts. Test HTTP prototype : `/mon-espace` = 200 ; route carte = 404 attendu car le compte prototype admin n’est lié à aucune fiche.
- À faire avant publication : relire la page, lancer `npx next build --webpack`, `git diff --check`, mettre à jour les suivis, committer, pousser et contrôler la production.
- Ne pas toucher aux fichiers doublons non suivis suffixés `page 2.tsx` et `StockMovementForm 2.tsx` : ils préexistaient et ont volontairement été laissés hors commits.

### Futures tâches — ordre recommandé

1. **Finir et publier « Mon espace »** (lot local ci-dessus), afin que chaque ouvrier puisse présenter sa propre carte BTP sans accéder au module RH complet.
2. **Test réel multi-comptes** : créer trois comptes de test Admin / Chef d’équipe / Ouvrier, vérifier invitation personnelle, confirmation email, modules invisibles, lecture seule, pointage personnel GPS, carte BTP et suspension d’un salarié.
3. **Sortie contrôlée du mode prototype** : configurer les URLs et modèles email Supabase, vérifier le compte propriétaire, sauvegarder, passer `DISABLE_EMAIL_LOGIN=false`, exécuter `supabase/production/sortie_mode_prototype.sql`, puis tester avant/après. Ne pas couper le prototype sans compte admin fonctionnel.
4. **Droits encore plus fins** : créer un droit dédié `ajouter_photos_chantier` pour qu’un ouvrier puisse déposer des photos sans recevoir `gerer_chantiers`; poursuivre l’audit RLS de lecture pour empêcher aussi les lectures REST directes hors modules autorisés.
5. **Email automatique avec PDF joint** pour devis, factures et commandes, avec destinataire + CC, historique d’envoi et relance. Dépendance : domaine d’envoi et clé Resend/SMTP fournis par Julien.
6. **OCR des factures/catalogues scannés** pour extraire fournisseur, date, montant, TVA et lignes depuis les PDF/images sans texte. Dépendance : choix/fourniture d’un service OCR.
7. **Fusion du module Stock avec l’application GitHub annoncée** : comparer le dépôt source, reprendre les fonctions utiles sans régresser les imports, scans, teintes, mouvements et inventaires. Dépendance : URL GitHub non encore reçue.
8. **Tests métier de synchronisation bout en bout** : devis accepté → chantier/facture, paiements → statuts, dépenses → chantier/ouvrier/véhicule/outil, matériel hors service → indisponible, suspension employé → compte et affectations.
9. **Exports comptables de clôture plus poussés** : inventaire valorisé par exercice, historique des corrections, synthèse véhicules/outillage et pièces justificatives associées.
10. **Notifications d’équipe** après activation des comptes : planning hebdomadaire, changement d’affectation, rappel de pointage ouvert et document/devis à valider, par email puis éventuellement notification PWA/WhatsApp.

### Dépendances externes restantes

- Domaine + clé Resend/SMTP pour l’envoi serveur des PDF.
- Fournisseur OCR si les documents image doivent être lus automatiquement.
- Dépôt GitHub de l’application de stock annoncé par Julien.
- Validation finale de Julien avant la coupure du mode prototype et avant tout envoi réel vers des clients/fournisseurs.

## Reprise — suite métier migration 80 — 15 juillet 2026

- Travail local non publié : migration `20260715000080_suite_metier_complete.sql`, actions `src/app/actions/suite-metier.ts` et cinq écrans métier.
- Écrans : `/facturation-avancee`, `/interventions`, `/crm`, `/ouvrages`, `/connecteurs`.
- La migration ajoute les permissions Consulter/Gérer correspondantes, les tables situations/modèles/métrés/contrats/interventions/BL/CRM/relances/champs personnalisés/remises/connecteurs/tarifs/audit et les RPC atomiques de facturation avancée.
- Navigation, contrôle des chemins, grille mobile et dashboard sont raccordés aux nouveaux droits.
- Contrôles déjà verts : `npm run lint`, `npx tsc --noEmit --incremental false`, `npm test -- --run` (14/14), `npx next build --webpack`.
- Prochaine étape obligatoire : faire appliquer puis contrôler la migration 80 dans Supabase. Ensuite seulement, commit/push/déploiement et tests réels des cinq écrans.
- À poursuivre après cette tranche : génération/édition complète des bons de livraison, lignes multiples dans les modèles et métrés, exports DGD/remises, automatisation des relances, puis connecteurs réels Stripe/SMS/comptabilité/fournisseurs selon les clés et contrats officiels. BatiChiffrage a été retiré dans le lot 82.
- Stripe Connect préparé dans le même lot : compte Express par entreprise, direct charge Checkout, webhook Connect signé/idempotent et synchronisation des paiements. Ne peut pas être activé sans les quatre variables documentées dans `.env.local.example` et la configuration du webhook dans le Dashboard Stripe.
# REPRISE — 15 juillet 2026, personnalisation et fournisseurs libres (MIGRATIONS 82–83 À APPLIQUER)

- Lot local non déployé. Passer `20260715000082_connecteurs_fournisseurs_sans_batichiffrage.sql` puis `20260715000083_modeles_documents_et_personnalisation.sql`.
- Fournisseurs : ajout universel avec compte client, portail HTTPS et mode d’échange, création automatique de la fiche si nécessaire, jamais de mot de passe stocké.
- Documents : six modèles d’impression et réglages avancés (couleurs, police, logo, descriptions, TVA).
- Navigation : dossiers métiers repliables, après filtrage strict des permissions.
- Accueil : widgets affichables/masquables par appareil ; les droits restent prioritaires.
- Guide PDF refait de zéro : 55 pages illustrées et contrôlées, sommaire/signets, tous les modules, 19 procédures détaillées et matrice des synchronisations. Fichiers : `output/pdf/Guide_utilisation_detaille_Liria_Gestion_Pro.pdf`, copie publique existante remplacée, générateur `scripts/create-guide-utilisateur-detaille.py`.
- Validation locale : tsc, lint, 21 tests, diff-check et build 73 routes verts ; avertissement `unpdf` connu uniquement.

---
