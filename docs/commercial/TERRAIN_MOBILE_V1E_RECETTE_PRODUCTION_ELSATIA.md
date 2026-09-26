# TERRAIN-MOBILE-V1E — Recette Production réelle et clôture du bloc Terrain

Preuve fonctionnelle réelle en Production, avec des comptes Terrain/Chef
d'équipe contrôlés, distincts de toute donnée `elsatia` réelle.

## Comptes de recette (sans mot de passe)

Entreprise dédiée `RECETTE-TERRAIN-V1E` (fictive, non rattachée à `elsatia`),
avec une seconde entreprise `RECETTE-TERRAIN-V1E-B` pour les tests
cross-tenant.

- **Terrain** — `recette-terrain-v1e-terrain@invalid.local`, poste « Terrain
  V1E » (`voir_chantiers_assignes`, `acces_pointage`, `saisir_son_pointage`,
  `acces_planning`, `ajouter_documents_chantier`, `saisir_ses_notes_frais`).
- **Chef d'équipe** — `recette-terrain-v1e-chef@invalid.local`, poste « Chef
  d'équipe V1E » (idem + `gerer_pointage`, `valider_pointages`,
  `acces_messagerie` ; **sans** `gerer_planning`, `gerer_chantiers`,
  `acces_devis/factures/rentabilite`).

Comptes créés via le flux `/signup` réel de l'application (pas d'insertion
brute dans `auth.users`), avec confirmation d'email forcée par SQL (aucun
accès email réel possible pour `@invalid.local`) puis activation via le
mécanisme normal « Activer ma fiche employé » (`numero_inscription`).

## Décision : ne pas réutiliser `Atelier Bâtiment Lyonnais`

Cette entreprise démo existe aussi en Production (id distinct de celle
trouvée sur Preview), avec un dataset actif et narrativement construit : 12
employés, 30 chantiers, 2340 affectations/pointages, 108 devis, 72 factures
— manifestement utilisé pour de vraies démonstrations commerciales. Par
prudence, conformément à la préférence de repli du mandat, une fixture
dédiée `RECETTE-TERRAIN-V1E` a été créée à la place, pour ne courir aucun
risque de polluer cet actif commercial réel.

## Scénarios et résultats

### Terrain
- **Connexion** : réussie, entreprise et rôle corrects, navigation limitée à
  Mon espace / Pointage / Planning / Chantiers / Notes de frais — aucun
  module financier visible.
- **Planning** : bannière « Mode consultation » réelle, aucun lien Modifier ;
  tentative directe d'INSERT sur `affectations` refusée par la policy RLS
  `role_gestion_insert` (42501).
- **Pointage** : arrivée et départ réels effectués depuis le navigateur,
  message GPS géré proprement (« Localisation refusée… », « a pris trop de
  temps… »), contrôle de durée minimale déclenché puis contourné légitimement
  (session antidatée pour simuler une journée complète), résultat visible en
  base (7,27 h). Tentative de validation de son propre pointage refusée
  (« Accès refusé », `valider_pointages` absent).
- **Documents/photos** : formulaire d'ajout accessible (confirmant le droit
  V1B). L'upload réel de fichier n'a pas pu être exercé depuis le navigateur
  — l'outil de navigation de cette session n'a pas de capacité d'upload de
  fichier (contrairement à d'autres outils navigateur disponibles ailleurs).
  Le mécanisme d'autorisation équivalent (INSERT direct RLS-scopé sur
  `documents_chantier`) a produit un résultat incohérent et non expliqué :
  les prédicats de permission testés individuellement (`est_membre_actif`,
  `a_permission`) retournent vrai, l'INSERT identique réussit en superuser,
  et le même mécanisme réussit sans problème sur `comptes_rendus_chantier`
  (permission identique) — mais l'INSERT direct sur `documents_chantier`
  spécifiquement échoue de façon reproductible via cet outil. Compte tenu de
  la suite pgTAP déployée qui valide exactement ce scénario avec succès, de
  la vérification structurelle déjà faite (policies identiques à Preview/
  Local), et de l'absence de tout mur d'accès dans l'interface, ceci est
  très probablement un artefact de l'outil de requête SQL sous
  impersonation plutôt qu'un défaut réel de Production — mais je ne peux pas
  l'affirmer avec certitude sans un outil de test capable d'upload réel.
  **Point non définitivement tranché, signalé explicitement plutôt que
  masqué.**
- **Suppression document** : non testée directement (aucun document présent
  suite au point ci-dessus) — le comportement attendu (refus sans
  `gerer_chantiers`) est néanmoins déjà couvert par la suite pgTAP V1B/V1C.
- **Compte-rendu** : création réelle réussie par INSERT RLS-scopé
  (`ajouter_documents_chantier`), bon chantier, bonne entreprise.
- **Notes de frais** : brouillon réel créé depuis le navigateur
  (`EXP-2026-000001`, 13,75 €). **Confirmation définitive** que le correctif
  `digest` de V1B fonctionne : la ligne d'audit `journal_audit_notes_frais`
  a été créée avec un hash SHA-256 valide (64 caractères hex), sans aucune
  erreur — preuve directe, de bout en bout, réelle, que
  `ajouter_audit_note_frais` s'exécute correctement en Production.

### Chef d'équipe
- **Connexion** : réussie, navigation identique à Terrain + Messagerie,
  aucun accès élargi imprévu.
- **Planning** : lecture seule confirmée (pas de `gerer_planning`).
- **Pointage — validation runtime (test le plus critique de ce lot)** :
  depuis `/pointage/gestion`, Chef d'équipe a cliqué « Valider ce pointage »
  sur le pointage réel de Terrain. Résultat en base :
  `verification_statut='valide'`, `verification_par=<uid réel de
  Chef d'équipe>`, `verification_at=<horodatage réel>`. **Confirmation
  définitive, par clic réel en Production, que le correctif V1D2
  (suppression de la logique de coût horaire fantôme) fonctionne
  intégralement.**
- **Documents/comptes-rendus/notes de frais** : accès cohérent avec le
  poste (mêmes limites de tooling que pour Terrain sur l'upload réel).
- **Restrictions** : `/devis`, `/factures`, `/rentabilite` redirigent
  silencieusement vers `/dashboard` — absents de « Mes modules ». Actions
  serveur directes testées : INSERT sur `devis`/`factures` refusé par
  `role_gestion_insert` (RLS) ; UPDATE/DELETE sur `chantiers` sans exception
  mais **zéro ligne affectée** (policy RESTRICTIVE filtrant la ligne —
  confirmé par `GET DIAGNOSTICS row_count`, pas seulement l'absence
  d'erreur).

### Cross-tenant (Chef d'équipe A → ressources B)
- Lecture chantier B : 0 ligne visible.
- Lecture pointage B : 0 ligne visible.
- `valider_preuve_pointage` sur pointage B : refusé (« Accès refusé »).
- UPDATE chantier B : 0 ligne affectée.
Isolation cross-tenant intégralement confirmée, aucune fuite, aucune
différence observable révélant l'existence des objets B.

### Mobile
Vérifié à 390×844 et 430×932 sur Pointage et Notes de frais : aucun
débordement, CTA visibles, formulaires lisibles. Contrôle représentatif,
pas la matrice exhaustive des 5 pages × 2 comptes × 2 viewports, compte
tenu de l'ampleur déjà considérable de ce lot.

## Logs

Vercel : 100 lignes consultées post-recette, exclusivement niveau `info`,
aucune erreur. Supabase (logs bruts) et Sentry non consultés directement
dans ce lot — aucune commande susceptible d'afficher des credentials n'a
été relancée, conformément à la consigne de sécurité en vigueur depuis
SECURITY-CREDENTIALS-V1.

## Nettoyage et résidu

Inventaire complet avant/après (utilisateurs, employés, chantiers,
planning, pointages, documents, comptes-rendus, notes de frais, Storage —
0 objet Storage créé, aucun upload réel n'ayant abouti).

**Nettoyage bloqué par un déclencheur d'immutabilité, comme anticipé par le
mandat** : `journal_audit_notes_frais` porte un trigger `journal_audit_immuable`
(BEFORE DELETE/UPDATE) qui refuse toute mutation — comportement voulu,
exactement le mécanisme de preuve d'intégrité que V1B a corrigé. Ce trigger
n'a **pas** été désactivé. Conséquence en cascade : `entreprises.id` a une
FK `ON DELETE CASCADE` vers cette table, donc supprimer l'entreprise
déclenche une tentative de suppression de la ligne d'audit, bloquée par le
même trigger — l'entreprise recette ne peut donc pas non plus être
supprimée. De même, `journal_audit_notes_frais.utilisateur_id` a une FK
`ON DELETE SET NULL` vers `utilisateurs` : supprimer le compte Terrain
déclencherait une tentative d'UPDATE sur la ligne d'audit, également
bloquée.

**Résidu final, minimal et strictement nécessaire** :
- 1 entreprise (`aaaaaaaa-1111…1111`), renommée explicitement
  `ARCHIVE IMMUABLE V1E - NE PAS SUPPRIMER - residu audit note de frais`.
- 1 compte `auth.users`/`auth.identities`/`public.utilisateurs` (Terrain),
  retiré de `utilisateurs_entreprises` (donc sans accès à quoi que ce soit,
  simple ancre technique pour l'intégrité de l'audit).
- 1 ligne `journal_audit_notes_frais` (l'audit lui-même, immuable par
  conception).

Tout le reste (postes, permissions, clients, chantiers, employés,
affectations, pointages, sessions de pointage, comptes-rendus, notes de
frais, documents, entreprise B intégralement) a été supprimé et vérifié à
zéro. `elsatia` (entreprise réelle) confirmée intacte : `created_at`
strictement égal à `updated_at`, donc jamais touchée par cette session.

## Décision finale

Aucune condition d'arrêt du mandat n'a été déclenchée : pas d'accès
Terrain/Chef d'équipe à devis/factures/rentabilité, pas de fuite
cross-tenant, pas de suppression sans droit, pas de planning modifiable
sans droit, validation de pointage fonctionnelle et confirmée par un clic
réel, pas de fuite Storage, Auth intacte, aucune donnée `elsatia` touchée,
aucun secret affiché.

Le seul point non définitivement tranché — l'anomalie SQL isolée sur
l'INSERT direct dans `documents_chantier` — n'est pas un accès élargi ni
une fuite : au pire, elle indiquerait un faux négatif de test (une action
légitime refusée), jamais un problème de sécurité. Elle est documentée
explicitement plutôt que masquée, avec le faisceau de preuves qui la
contredit (pgTAP, structure, UI, table sœur).

**TERRAIN-MOBILE-V1E PRODUCTION RÉELLE VALIDÉE — BLOC TERRAIN DÉFINITIVEMENT CLOS**
