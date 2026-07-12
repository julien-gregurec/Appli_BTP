# Relais pour ChatGPT — Plateforme BTP « LIRIA CONCEPT »

> Document de passation à jour au **12 juillet 2026**. À lire en entier avant toute modification.
> Il complète (et prime sur) l'ancien relais Claude collé dans la conversation.

---

## 1. Projet & environnement

- **Dépôt local** : `/Users/juliengregurec/Documents/btp-platform`
- **Stack** : Next.js `16.2.10` (App Router, Turbopack par défaut en dev, dossier `src/`), React 19, TypeScript, Tailwind v4, `@supabase/ssr`.
- **Node via nvm** : binaire dans `/Users/juliengregurec/.nvm/versions/node/v24.18.0/bin` — **PAS dans le PATH par défaut**. Avant toute commande npm/npx en shell : `source "$HOME/.nvm/nvm.sh"`.
- **Pas de Docker ni de brew**. Pas de CLI Supabase globale et projet non lié ; le paquet `supabase` existe toutefois en devDependency et `npx supabase` est disponible localement.
- **⚠️ Lire `AGENTS.md`** à la racine : ce Next.js 16 a des ruptures d'API. Consulter `node_modules/next/dist/docs/` avant de coder. Points déjà gérés : `middleware` renommé `proxy` (`src/proxy.ts`), `cookies()` asynchrone, groupe de routes `src/app/(app)/` pour les pages authentifiées.

## 2. Supabase

- **Projet hébergé** : `https://uykukebthgmqtxlmkpnn.supabase.co` (organisation « Application julien »).
- **Clé publique** (format récent `sb_publishable_...`) dans `.env.local` (gitignored). Elle est faite pour être publique (protégée par RLS).
- **Entreprise unique en base** : `ENT-001`, id `cc90ee48-7c9a-4983-a143-0df72ca0c937`, nom **LIRIA CONCEPT**.

### Application des migrations — IMPORTANT
- Les fichiers `supabase/migrations/*.sql` sont appliqués **MANUELLEMENT** : copier/coller dans le **SQL Editor** de Supabase. **Aucun lien CLI**, aucune application automatique.
- Après une migration qui crée des tables : cliquer **« Run and enable RLS »** dans le popup.
- Le **cache de schéma PostgREST peut être en retard** : si l'app dit « Could not find the table … in schema cache », lancer `notify pgrst, 'reload schema';` (déjà ajouté en fin de chaque migration récente) ou redémarrer le projet.
- Relancer une migration déjà passée → erreur « relation already exists » = **inoffensif**, ça veut juste dire qu'elle est déjà appliquée.
- **Piège éditeur SQL** : toujours créer un **nouveau snippet vierge**, coller, vérifier visuellement la fin du fichier, puis exécuter (un onglet réutilisé a déjà mélangé deux requêtes).

## 3. Mode PROTOTYPE sans connexion (TEMPORAIRE — à retirer avant prod)

- `.env.local` contient `DISABLE_EMAIL_LOGIN=true`.
- `src/lib/auth-mode.ts` → `isEmailLoginDisabled()` pilote le mode.
- Quand actif : le `proxy` saute l'auth, `getContexteEntreprise()` appelle la RPC `dev_contexte_entreprise()` (migration 08) qui renvoie la 1ʳᵉ entreprise (LIRIA CONCEPT, ENT-001) comme utilisateur « Prototype », et la RLS est contournée par une policy `prototype acces anonyme` + des grants larges au rôle `anon`.
- **Conséquence** : l'app est utilisable en local **sans login**. Pour tester : lancer le serveur et naviguer, aucune authentification nécessaire. On peut aussi lire/écrire directement via l'API REST avec la clé publique.

## 4. État Git

- Le dépôt repose **presque entièrement sur des fichiers non suivis** depuis le commit initial. **NE PAS** lancer de reset/checkout/clean destructif.
- Repo GitHub distant `github.com/julien-gregurec/Appli_BTP` existe mais **vide** — l'utilisateur n'a **pas** voulu pousser (le garder local / éventuellement passer en privé d'abord). **Ne rien pousser sans demander.**

## 5. Modules fonctionnels (tous testés navigateur)

Menu latéral : Tableau de bord · Clients · Chantiers · Devis · Prestations · Factures · Commandes · Fournisseurs · Dépenses · Charges récurrentes · Planning · Employés · Pointage heures · Rentabilité · Trésorerie · Stock · Flotte automobile · Outillage · Dépôt · Inventaires · Exports comptables · Paramètres. Tous les modules affichés sont actifs.

- **Comptes & Entreprises** : entreprise, postes, permissions_poste, RLS, bootstrap admin, références auto `ENT-001`.
- **Clients & Chantiers** : fiches, contacts, types de chantier (auto-seedés), tâches, transferts, workflow statut chantier (12 statuts), références `CLI-0001` / `CHA-2026-001`. Recherche + filtres. Fiche client enrichie (total facturé/encaissé/reste dû, 5 derniers devis/factures). Fiche chantier enrichie (devis acceptés, facturé, encaissé, heures planifiées, compteur et accès au coffre documentaire). Bouton « Nouveau devis » présélectionne client **et** chantier.
- **Employés** : liste/création/fiche/modif/statut, références `EMP-0001`+, `taux_horaire` (facturé) vs `cout_horaire` (interne), FK `responsable_id` sur chantiers.
- **Planning (refonte)** : modèle **affectation** = chantier + employé + date + heures + tâche (fini début/fin). Récaps « heures par chantier » et « heures par ouvrier ». Table `affectations` (migration 11). L'ancienne table `planning_evenements` est **dormante** (non utilisée), `StatutPlanningSelect.tsx` supprimé.
- **Devis** : éditeur avec lignes dynamiques + calcul HT/TVA/TTC temps réel, statuts, numéro `DEV-2026-001` généré à l'envoi (pas sur brouillon), modification des brouillons (`/devis/[id]/modifier`), duplication, recherche/filtres. Insertion de prestations préenregistrées. **Création d'un client à la volée** depuis l'éditeur (bouton « + Nouveau client »).
- **Prestations préenregistrées** (catalogue) : `/prestations`, création/modif/activation, 5 prestations BTP seedées, insertion dans le devis, enregistrement rapide d'une ligne manuelle vers le catalogue.
- **Factures** : création depuis devis **accepté** (copie des lignes en snapshot figé), `date_echeance` auto depuis le délai de paiement client, statuts, paiements (avec contrôles : refus sur brouillon/annulée/avoir, refus si dépasse le reste dû), suppression de paiement vérifiée, modification des brouillons (`/factures/[id]/modifier`), recherche/filtres, indicateurs facturé/encaissé/reste. Numéro `FAC-2026-001`. **Statuts payée/partiellement payée pilotés automatiquement par les paiements** (triggers).
- **Impression / PDF** : routes `/imprimer/devis/[id]` et `/imprimer/factures/[id]` (layout dédié sans sidebar), composant `DocumentImprimable` (A4, style inline, en-tête entreprise + logo, client, lignes, totaux, mentions légales BTP — pénalités uniquement sur factures), composant `AutoPrint` qui déclenche `window.print()` → « Enregistrer au format PDF ». Boutons « Télécharger PDF » sur les fiches devis/facture.
- **Envoi par email (mailto)** : bouton « Envoyer par email » sur les fiches devis **et** facture → ouvre le client mail par défaut avec destinataire (email du client), objet et corps FR pré-remplis (montant TTC + rappel de joindre le PDF + signature entreprise). Helper `src/lib/email.ts` (`lienMailtoDocument`). Zéro dépendance / clé API. Bouton grisé si le client n'a pas d'email. (Envoi SMTP automatique avec PDF joint = évolution future si besoin, nécessiterait Resend/Nodemailer + clé.)
- **Commandes fournisseurs** (migration 21 appliquée et testée) : `/fournisseurs` (carnet + création + activer/désactiver), `/commandes` (liste), `/commandes/nouveau` (`CommandeEditor` : fournisseur avec **création inline**, chantier optionnel, dates, description, lignes qté×PU HT/TVA, total live), `/commandes/[id]` (détail, transitions SQL guardées, réception cumulative partielle/complète et suppression brouillon/annulée). Création en-tête+lignes atomique par RPC, totaux recalculés en base, liens fournisseur/chantier/commande isolés par entreprise. Nav active.
- **Photos & documents chantier** (migration 22 appliquée et testée) : `/chantiers/[id]/documents`, dépôt privé Supabase limité à 15 Mo, images/PDF/Word/Excel, 8 catégories métier, note, galerie avec aperçu image, téléchargement par URL signée 60 s et suppression confirmée. Métadonnées et objets Storage sont isolés par entreprise ; le mode prototype n’ouvre que le bucket dédié. La fiche chantier affiche le compteur et le lien direct.
- **Flotte automobile** (migration 23 appliquée et testée) : `/flotte`, création et fiche véhicule, immatriculation unique, marque/modèle/type/statut, kilométrage, échéances contrôle technique/assurance/entretien et historique des relevés. Le trigger verrouille le véhicule et interdit tout recul du kilométrage. Nav active.
- **Outillage** (migration 24 appliquée, auditée et testée) : `/outillage`, registre individuel avec référence `OUT-0001`, catégorie, marque/modèle/série, état, prix et vérification. Fiche avec affectation employé/chantier, retour, maintenance, remise en service, hors service et perte. Chaque transition est validée sous verrou et historisée par RPC ; les rôles applicatifs ne peuvent ni modifier ni supprimer directement un outil.
- **Dépôt & Inventaires** (migration 25 appliquée et testée) : `/depot` gère les zones physiques et l’emplacement normalisé des articles ; une zone « Dépôt principal » est seedée. `/inventaires` crée un instantané du stock global ou d’une zone, enregistre tous les comptages puis valide atomiquement les écarts en mouvements d’ajustement. Si le stock change pendant le comptage, la validation est refusée pour éviter une correction erronée.
- **Exports comptables CSV** : `/exports`, période configurable et trois téléchargements privés : journal des ventes, journal des règlements, détail + synthèse TVA par facture/taux. CSV UTF-8 BOM, séparateur `;`, décimales françaises, noms de fichiers explicites, avoirs négatifs et protection contre l’injection de formules. Les brouillons sans numéro sont exclus et chaque requête est filtrée par entreprise.
- **Dépenses fournisseurs & rentabilité réelle** (migration 26 appliquée, auditée et testée) : `/depenses` enregistre les factures d’achat avec fournisseur, chantier, commande optionnelle, catégorie, HT/TVA/TTC, échéance et règlements. Anti-doublon fournisseur+n° pièce, cohérence commande/fournisseur/chantier, surpaiement refusé sous verrou et statut payé automatique. Les dépenses HT non annulées sont déduites chantier par chantier dans `/rentabilite`, en plus du coût de main-d’œuvre.
- **Trésorerie prévisionnelle** : `/tresorerie`, encaissements et décaissements réalisés sur 30 jours, total à recevoir/à payer et projection hebdomadaire sur 13 semaines. Les factures/charges en retard sont ramenées en première semaine, les échéances au-delà de 90 jours sont exclues, et la variation cumulée est affichée en tableau et barres. La page précise qu’il s’agit d’une variation, pas d’un solde bancaire.
- **Charges récurrentes** (migration 27 appliquée et testée) : `/charges`, loyer/assurance/abonnement/location avec fournisseur, catégorie, chantier optionnel, périodicité mensuelle/trimestrielle/annuelle, HT/TVA et prochaine échéance. Les occurrences futures alimentent la trésorerie. La matérialisation atomique crée la dépense fournisseur réelle puis avance l’échéance, sans double comptage.
- **Tableau de bord** : CA facturé/encaissé/reste, devis acceptés/à suivre, chantiers actifs, prochaines affectations et **centre d’alertes opérationnelles consolidé**. Les alertes sont triées critique/à anticiper et couvrent factures, devis, livraisons fournisseurs, seuils de stock, contrôle technique/assurance/entretien flotte et vérifications outillage, avec lien direct vers l’objet à traiter.
- **Pointage heures** : `/pointage`, saisie heures normales/supp/pause/tâche/commentaire par employé+chantier+date, filtre mensuel, totaux, suppression confirmée (migration 18).
- **Rentabilité** : `/rentabilite`, agrège par chantier devis acceptés + factures HT + heures pointées, coût main-d'œuvre via `employes.cout_horaire`, marge estimée + taux. Précise que matériaux/sous-traitance/frais généraux ne sont pas encore déduits.
- **Stock** : `/stock`, articles (référence unique, unité, emplacement, seuil, prix achat HT), entrées/sorties chantier/ajustements, stock màj sous verrou par trigger (sortie > dispo refusée), synthèse valeur d'achat + alertes (migration 19).
- **Paramètres** : `/parametres`, modification identité/adresse/SIRET/assurances/pénalités/textes documents ; alimente les impressions.
- **Sécurité applicative** : les server actions (clients, employés, planning, prestations, chantiers, tâches, devis, factures) vérifient explicitement `entreprise_id` **en plus** de la RLS. Composant `ConfirmSubmitButton` pour les actions sensibles.

## 6. Migrations appliquées sur la base hébergée (27 appliquées)

`01 comptes_entreprises` · `02 trigger_profil` · `03 bootstrap_entreprise` · `04 clients_chantiers` · `05 devis` · `06 factures` · `07 consolidation_financiere` · `08 mode_sans_connexion` · `09 planning` · `10 employes` · `11 affectations` · `12 prestations_catalogue` · `13 modification_devis_atomique` · `14 duplication_devis` · `15 creation_devis_atomique` · `16 delai_paiement_client` · `17 modification_facture_atomique` · `18 pointages` · `19 stock` · `20 synchro_statuts` · `21 commandes_fournisseurs` · `22 documents_chantier` · `23 flotte` · `24 outillage` · `25 depot_inventaires` · `26 depenses_fournisseurs` · `27 charges_recurrentes`.

**Migration 20 appliquée et renforcée après audit** : recalcul paiements sérialisé sous verrou, paiements positifs, transfert ancien/nouveau document, préservation du statut en retard, cascade devis→chantier et facture finale/simple→chantier. Les acomptes, situations et avoirs ne clôturent jamais un chantier. Les liens document/chantier sont contraints à la même entreprise et les helpers `SECURITY DEFINER` internes sont interdits à `anon`/`authenticated`. Backfill confirmé : FAC-2026-001/002/003 sont `payee`, montants payés égaux au TTC ; `CHA-2026-001` est `facture`.

**Migration 21 appliquée et renforcée après audit** : références annuelles, contraintes de dates/TVA/quantités, FK composites d’isolation entreprise, création atomique commande+lignes, transitions SQL atomiques et réception partielle/complète. Test SQL transactionnel multi-TVA réussi (35 € HT, 5,50 € TVA, 40,50 € TTC), sur-réception refusée, réception partielle puis complète. Test navigateur réussi avec création fournisseur inline et commande `CMD-2026-001` à 36 € ; les données de test ont ensuite été supprimées et les compteurs de tables contrôlés à zéro. RPC métier accessibles, helpers internes non exécutables par `anon`.

**Migration 22 appliquée et testée** : table `documents_chantier`, bucket privé `chantier-documents`, limite 15 Mo et formats contrôlés. FK composite chantier/entreprise, RLS membres et policies Storage par premier dossier `entreprise_id`. Test réel réussi : ajout d’une pièce technique temporaire, affichage dans `/chantiers/[id]/documents`, téléchargement HTTP 307 vers une URL signée, puis suppression via l’interface avec compteur revenu à zéro.

**Migration 23 appliquée et testée** : tables `vehicules` et `releves_kilometrage`, FK composite et RLS. Test navigateur : utilitaire temporaire créé à 10 000 km, relevé à 10 150 km, compteur et historique mis à jour ; véhicule et relevé de test supprimés ensuite.

**Migration 24 appliquée, auditée et testée** : tables `outils` et `mouvements_outillage`, références automatiques, FK composites et RLS. RPC atomique pour les transitions d’affectation ; double affectation refusée. Test navigateur complet création → affectation à Julien → retour, puis test direct du verrou avec 4 événements d’historique avant nettoyage. Outil temporaire supprimé, aucun résidu. Audit privilèges confirmé : `anon UPDATE=false`, `anon DELETE=false`, RPC métier exécutable.

**Migration 25 appliquée et testée** : `zones_depot`, `inventaires`, `lignes_inventaire`, rattachement `zone_id` sur stock/outillage et deux RPC atomiques. Test réel : article temporaire initialisé à 10, inventaire `INV-2026-001` compté à 8, un ajustement moins créé et stock final 8 ; seconde validation refusée. Second test : mouvement concurrent pendant le comptage, validation refusée et brouillon préservé. Tous les articles, mouvements et inventaires temporaires ont été supprimés (compteurs 0/0).

**Migration 26 appliquée, auditée et testée** : `depenses_fournisseurs` et `reglements_fournisseurs`, FK composites, cohérence automatique avec la commande, statut de règlement recalculé et plafond TTC sous verrou. Test navigateur : pièce temporaire 100 € HT / 20 € TVA, paiement partiel 50 €, surpaiement 71 € refusé, solde 70 €, statut `payee` et coût chantier HT 100 €. `/rentabilite` est passé de 15 090 € à 14 990 € de marge pendant le test, puis revenu à zéro achat après nettoyage. Dépense et fournisseur temporaires supprimés (0/0). Audit privilèges : modification/suppression directe de l’en-tête interdites à `anon`.

**Migration 27 appliquée et auditée** : `charges_recurrentes`, lien vers `depenses_fournisseurs` et RPC `materialiser_charge_recurrente`. Audit SQL confirmé table/colonne/RPC/grant. Test navigateur : charge mensuelle 50 € HT + 10 € TVA, projection 90 jours à 180 €, matérialisation d’une dépense 60 €, échéance avancée du 12 juillet au 12 août et projection restée 180 € sans doublon. Dépense, charge et fournisseur temporaires supprimés (0/0/0).

**Script de production NON APPLIQUÉ** : `supabase/production/sortie_mode_prototype.sql` est volontairement hors des migrations automatiques. Il supprime toutes les policies `anon`, révoque tables/séquences/fonctions anonymes, verrouille les `SECURITY DEFINER`, réaccorde uniquement les helpers/RPC authentifiés et supprime `dev_contexte_entreprise`. Dry-run complet dans `BEGIN … ROLLBACK` réussi avec assertions : zéro policy anon, zéro lecture table anon, zéro `SECURITY DEFINER` anonyme, helper RLS et RPC métier authentifiés conservés. Rollback vérifié : `/dashboard` fonctionne encore comme Prototype.

**Préparation Auth production vérifiée sans exposer d’identité** : `ENT-001` a 1 membre actif et 1 poste ; profil public, compte Auth, entreprise active, email confirmé, mot de passe et ancienne connexion sont tous présents. Il reste à choisir l’hébergement/URL, sauvegarder puis autoriser explicitement le script manuel de sortie et `DISABLE_EMAIL_LOGIN=false`.

**RPC clés (SECURITY DEFINER)** : `dev_contexte_entreprise`, `creer_entreprise_bootstrap`, `creer_devis_brouillon`, `modifier_devis_brouillon` (approx.), `dupliquer_devis`, `creer_facture_depuis_devis(uuid,text)` (vérifie devis accepté + client + délai → `date_echeance`), `modifier_facture_brouillon`, recalculs totaux/paiements par triggers.

## 7. Rebranding LIRIA CONCEPT

- Entreprise `ENT-001` = **LIRIA CONCEPT**, adresse **9 rue du Maréchal Leclerc, 67860 Rhinau**, slogan **Concevoir • Aménager • Réaliser**, contact `06 50 93 11 87` / `liriaconcept@gmail.com`.
- **Charte** (dossier `~/Desktop/LIRIA CONCEPT/`) : bleu nuit `#0D1B2A`, or `#C9A24A`, anthracite `#1F2328`, blanc `#FFFFFF`. Reprise dans le PDF (en-tête, filet or, bandeau de tableau bleu nuit).
- **Logo** : `public/liria-concept-logo.png`, affiché dans la navigation et les PDF devis/factures.
- **Activité confirmée** (`LIRIA_CONCEPT_Dossier_Pro.pdf`) : agencement intérieur — cloisons amovibles, panneaux décoratifs, portes, vitrages, cabines sanitaires, sols stratifiés, fourniture + pose ; pros & particuliers. Statut envisagé : **Entreprise Individuelle au réel** (pas encore immatriculée). Tarifs : min 50 €/h, objectif 60 €/h.
- **⚠️ SIRET actuellement en base = `12345678900012` = valeur factice de test.** L'EI n'est pas encore créée. **NE PAS** reprendre le SIRET / capital / dénomination de l'ancienne structure `JULIEN GREGUREC MULTISERVICES` (SAS) présente dans les vieux PDF. À compléter avec les vraies infos légales une fois l'EI immatriculée (via `/parametres`).

## 8. Suivi des 5 retours utilisateur (batch du 11/07)

1. **Créer un client directement depuis le formulaire de devis** → **FAIT & testé (11/07)**. Bouton « + Nouveau client » dans `DevisEditor` → mini-formulaire (type, nom/prénom/société, tél, email, CP, ville) → « Créer et sélectionner » crée la fiche et la sélectionne automatiquement. Action JSON dédiée `creerClientRapideAction` (sans redirect) dans `src/app/actions/clients.ts`. Le garde-fou « il faut d'abord créer un client » de `devis/nouveau` a été retiré (on peut démarrer un devis sans aucun client existant).
2. **Refonte Planning (heures)** → **FAIT & testé** (migration 11).
3. **PDF téléchargeable devis/factures** → **FAIT & testé**. Envoi email = reporté (PDF d'abord).
4. **Synchro auto des statuts** → **FAIT, migration 20 appliquée et vérifiée**. FAC-002/003 corrigées en `payee`, cascade chantier active et durcie (voir §6).
5. **Lignes de prestation préenregistrées** → **FAIT** (module Prestations, migration 12).

## 9. Validations (état vert au 12/07/2026, après migrations 20-27)

```bash
source "$HOME/.nvm/nvm.sh"
cd ~/Documents/btp-platform
npm run lint                       # OK
npx tsc --noEmit --incremental false  # OK
npx next build --webpack           # OK (build de prod réussi)
git diff --check                   # OK (aucun conflit whitespace)
```

## 10. Lancer / tester en local

- Démarrer le serveur dev **sans bloquer sur le PATH** :
  ```bash
  cd /Users/juliengregurec/Documents/btp-platform && PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" npm run dev
  ```
  (Le fichier `~/.claude/launch.json` a une entrée `btp-platform-dev` pour l'outil de preview de Claude ; sous ChatGPT, lancer simplement `npm run dev`.)
- Un `next dev` fantôme peut rester bloqué (crash EPIPE) : `pkill -f "next dev"` puis `lsof -ti:3000,3003 | xargs kill -9`, puis relancer.
- **Astuce test des formulaires React contrôlés** : le remplissage champ par champ réinitialise parfois les refs. Fiable = un seul script JS qui utilise le setter natif `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set` + dispatch `input`/`change`, remplit tous les champs d'un coup, puis clique le submit.
- **Test PDF** : naviguer vers `/imprimer/devis/[id]` rend le document A4 ; `window.print()` ne bloque pas le rendu, on peut capturer/valider directement.

## 11. Reprise recommandée (ordre)

1. Retours utilisateur #1→#5 terminés, migrations 20-27 et modules opérationnels/financiers prioritaires livrés.
2. **Passage production préparé mais volontairement non activé** : lire `PRODUCTION_CHECKLIST.md`, choisir l’URL/hébergement et confirmer la bascule. Le script manuel de production coupe définitivement le prototype anonyme.
3. Évolution nécessitant un choix/secret externe : envoi email SMTP réel (Resend) avec PDF joint.
3. Quand l'EI LIRIA est immatriculée : renseigner SIRET / assurances réels dans `/parametres` (retirer le SIRET factice `12345678900012`).
4. Avant prod : **retirer le mode prototype** (migration 08 + `DISABLE_EMAIL_LOGIN`) et réactiver l'auth réelle + RLS stricte.

## 12. Fichiers clés

- `src/components/DevisEditor.tsx` · `src/components/CommandeEditor.tsx` · `src/components/DocumentImprimable.tsx` · `src/components/AutoPrint.tsx` · `src/components/ConfirmSubmitButton.tsx` · `src/components/StatutCommandeSelect.tsx` · `src/components/Sidebar.tsx`
- `src/app/actions/{devis,factures,clients,chantiers,employes,planning,prestations,commandes,documents,flotte,outillage,depot,inventaires,depenses,charges}.ts`
- `src/lib/{devis,factures,commandes,documents,outillage,email,chantier-statuts,entreprise,auth-mode}.ts`
- `src/app/imprimer/{devis,factures}/[id]/page.tsx`
- `src/app/api/exports/comptabilite/route.ts` · `src/lib/csv.ts` · `src/app/(app)/exports/page.tsx`
- `src/app/(app)/tresorerie/page.tsx` · `src/lib/tresorerie.ts`
- `PRODUCTION_CHECKLIST.md` · `supabase/production/sortie_mode_prototype.sql` (**prêt, testé en rollback, non appliqué et hors migrations automatiques**)
- `src/app/(app)/…` : dashboard, clients, chantiers, devis, factures, commandes, fournisseurs, planning, employes, pointage, rentabilite, stock, prestations, parametres
- `supabase/migrations/*` (27 fichiers, tous appliqués ; voir §6)
```
