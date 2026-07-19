# Prompt Codex — Export & suppression des données (droits RGPD)

Tu travailles sur `btp-platform` (Liria Gestion Pro, Next.js 16 + Supabase), branche `main`, remote `gh`. Domaine : **data / comptes** — c'est le tien. Reste dedans, respecte les garde-fous en bas.

## Mission

Implémenter les deux droits RGPD promis dans nos documents juridiques (`docs/juridique/`) :
1. **Export des données** (droit d'accès + portabilité, art. 15 & 20)
2. **Suppression / effacement** (droit à l'effacement, art. 17)

Ces fonctions sont **explicitement annoncées aux clients** dans :
- `docs/juridique/politique-confidentialite.md` §7 : « Le Service met à disposition des fonctions d'export et de suppression de vos données depuis votre espace. »
- `docs/juridique/cgv.md` art. 10 (Réversibilité) : export à tout moment en format structuré ; en fin de contrat, 30 jours pour récupérer puis suppression, **sauf obligations légales de conservation**.
- `docs/juridique/dpa-entreprises-clientes.md` §5.8 : suppression **ou** restitution au choix du responsable au terme du contrat.

## Contexte technique à réutiliser

- Isolation par `entreprise_id`, helpers `est_membre_actif(entreprise_id)` et `a_permission(entreprise_id, clé)` (voir `RELAIS_CODEX_ABONNEMENT.md` §1 pour les patterns).
- `createAdminClient()` (service role) pour les opérations qui doivent traverser RLS (suppression auth, nettoyage storage).
- Buckets storage cloisonnés par `entreprise_id` (1er dossier du chemin) : `chantier-documents`, `documents-employes`, `notes-frais`, `factures-fournisseurs`, `bulletins-paie`, `pointage-preuves`, `fiches-techniques`, `entreprise-assets`, `notes-frais-exports`.
- Migrations appliquées **à la main** par Julien (SQL Editor). Prochain numéro libre : vérifier `ls supabase/migrations` (dernier connu `...113`).

## Deux niveaux à distinguer (important)

| Niveau | Qui le déclenche | Effet |
|---|---|---|
| **A. Un salarié / une personne** | Admin de l'entreprise | Anonymiser la fiche employé (nom → « Ancien salarié », suppression contact, photo, signature) **en conservant** ce qui est légalement obligatoire (pointages/paie pour les obligations sociales) |
| **B. Toute l'entreprise (compte client)** | Admin/gérant de l'entreprise | Export complet puis suppression du compte et des données, **sauf conservation légale** (comptabilité/factures ~10 ans) |

## Livrables

### 1. Export (`export des données`)
- Fonction serveur `exporterDonneesEntreprise(entreprise_id)` réservée à un droit admin (`gerer_parametres` ou équivalent) : rassemble **toutes** les tables portant `entreprise_id` (clients, chantiers, devis, factures, employés, stock, planning, pointages, notes de frais, etc.) + le profil du demandeur.
- Format **structuré** : un ZIP contenant du JSON (une entrée par table) et/ou des CSV. Inclure un `manifeste.json` (date, périmètre, version).
- Optionnel utile : inclure la **liste** des fichiers du storage (chemins) ou les fichiers eux-mêmes si faisable.
- UI : page « Mes données » dans Paramètres → bouton **« Exporter mes données »** → téléchargement.
- Journaliser la demande dans `journal_activite`.

### 2. Suppression (`droit à l'effacement`)
⚠️ Le plus délicat — **ne jamais faire un simple DELETE brutal**. Respecter la conservation légale.

- **Niveau A (personne)** : RPC `anonymiser_employe(entreprise_id, employe_id)` (droit `gerer_employes`) : remplace nom/prénom/email/téléphone par des valeurs neutres, supprime photo + signature (storage), garde les enregistrements comptables/paie/pointage requis. Journalise.
- **Niveau B (entreprise)** : parcours en **2 temps**, conforme aux CGV art. 10 :
  1. **Demande de suppression** → statut « suppression demandée » + date ; l'entreprise garde 30 jours pour exporter (réutiliser le mécanisme d'échéance).
  2. **Purge effective** (après le délai, ou immédiate si l'admin confirme) : suppression des données via cascade (`on delete cascade`) **+ nettoyage des fichiers storage** sous `entreprise_id/` dans tous les buckets **+** suppression/anonymisation des comptes `auth.users` liés (via service role). **Exception** : les données comptables/factures sont **anonymisées et conservées** le temps légal (≈10 ans), pas supprimées — ou exportées puis supprimées selon la décision produit (voir ci-dessous).
- UI : dans Paramètres, section RGPD → bouton **« Supprimer mon compte et mes données »** avec double confirmation (saisir le nom de l'entreprise) + rappel des conséquences et de la conservation comptable.
- Journaliser chaque étape.

### 3. Point de contact
- Le formulaire/section renvoie aussi vers l'e-mail de contact (aujourd'hui laissé vide dans les docs — à brancher quand Julien aura son `contact@`).

## Décisions à faire confirmer par Julien
1. **Conservation comptable** : à la suppression d'une entreprise, on **anonymise + conserve** les factures 10 ans (recommandé, conforme), ou on **exporte puis supprime tout** (plus risqué juridiquement) ?
2. **Délai** : 30 jours (comme les CGV) avant purge, ou purge immédiate sur confirmation forte ?
3. **Périmètre de l'auto-service** : l'admin d'entreprise peut-il tout supprimer seul, ou la suppression totale passe-t-elle par une validation de la plateforme (toi/support) ?

## Garde-fous (impératifs)
- **Avant push** : `git fetch gh`, vérifier `HEAD == gh/main`. Une autre IA (média/perf) pousse en parallèle — ne pas écraser.
- **Migrations** : numéro libre après le dernier (`...113` connu → `20260719000114_...` ou suivant). SQL prêt à coller pour Julien.
- **Accents/SQL** : `LC_ALL=en_US.UTF-8 pbcopy` pour tout SQL donné à coller.
- **Ne pas toucher** au flux Stripe Connect ni au mode prototype.
- **Ne jamais** exposer de service-role côté client ; les suppressions auth/storage passent par des server actions / RPC contrôlées.
- Suppression = irréversible : double confirmation obligatoire, et respect strict de la conservation légale.
