# TERRAIN-MOBILE-V1 — Checklist

Référence : `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md` (audit initial),
`docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` (correctifs des
2 P0 + 1 P1, branche `claude/terrain-mobile-v1b-fixes`) et
`docs/commercial/TERRAIN_MOBILE_V1C_READONLY_P1P2_ELSATIA.md` (lecture seule
réelle + clôture P1/P2, branche `claude/terrain-mobile-v1c-readonly-p1p2`).
Les sections ci-dessous tracent l'audit d'origine ; voir les documents de
correctifs pour le détail de ce qui a été corrigé.

## Correctifs (TERRAIN-MOBILE-V1C, terminés)

- [x] Masquage CSS « lecture seule » rendu réellement opérant : sélecteur
      universel `form:not([method="get"])`, plus garde explicite au niveau
      composant pour le seul cas structurel qui y échappait (`<details>`
      « Modifier » du planning, gardé par `gerer_planning`).
- [x] Vérifié qu'aucune Server Action terrain n'est contournable en
      l'appelant directement (sans passer par l'UI) : soit un contrôle
      applicatif explicite existe (`chantiers.ts`, RPC pointage), soit RLS
      seule tient la barrière et le tient correctement (`planning.ts`,
      `documents.ts`, `comptesRendus.ts`) — 13 assertions pgTAP dédiées.
- [x] P1 « branches `auth.role()='anon'` vestigiales » (PLANNING-POINTAGE-V1)
      corrigé pour les 4 fonctions de pointage concernées.
- [x] P2 clos : message GPS traduit, lien GPS `mlat=0&mlon=0` corrigé,
      message d'erreur durée minimale explicite, champ pause ouvert par
      défaut, mismatch d'hydratation comptes-rendus corrigé.
- [x] Suite complète verte après `db reset` complet : 531/531 pgTAP,
      360/360 Vitest.
- [x] Validé en Preview réel (migration appliquée isolément + déploiement
      Vercel + recette authentifiée).

## Correctifs (TERRAIN-MOBILE-V1B, terminés)

- [x] P0 documents/photos corrigé : nouveau droit `ajouter_documents_chantier`,
      distinct de `gerer_chantiers`, accordé par défaut aux postes terrain
      usuels. RLS (table + storage) et middleware alignés.
- [x] P0 notes de frais corrigé : `ajouter_audit_note_frais` qualifie
      désormais `extensions.digest(...)`.
- [x] P1 comptes-rendus corrigé (même droit, même mécanisme) — RLS resserrée
      au passage (elle n'imposait auparavant aucune permission).
- [x] Régression évitée en cours de correctif : bouton Supprimer documents
      désormais explicitement gardé par `gerer_chantiers` dans le composant,
      indépendamment du mécanisme CSS « lecture seule » découvert inopérant
      pour les formulaires de Server Actions (non corrigé, hors périmètre —
      voir §4 du document de correctifs).
- [x] 22 assertions pgTAP dédiées, suite complète verte après `db reset`
      complet (518/518).
- [x] Vérifié empiriquement en Local, mobile réel (390×844, 430×932) : ajout
      photo/document, création compte-rendu, création note de frais — les
      trois pour le profil Terrain et/ou Chef d'équipe.

## Matrice fonction × profil × sécurité

| Fonction | Terrain | Chef d'équipe | Mobile (390/430) | Sécurité | Verdict |
|---|---|---|---|---|---|
| Connexion | OK | OK | OK | Session persistante, message clair | **GO** |
| Planning | OK (équipe entière visible) | OK (équipe entière visible) | OK | RLS scopé entreprise | **GO** (P2 scope) |
| Pointage arrivée/départ | OK | OK | OK | Double pointage bloqué (UI+DB), durée min. 0,25h appliquée | **GO** |
| GPS | OK (repli motif fonctionnel) | OK | OK | Confidentialité bien expliquée | **GO** (P2 messages) |
| Chantiers (liste) | OK, aucune donnée financière | OK | OK | — | **GO** |
| Chantier (fiche) | 404 intermittent Local | idem | OK visuellement quand accessible | Accès RLS prouvé correct par SQL direct | **GO sous réserve** |
| Documents (lecture) | OK | OK | OK | — | **GO** |
| Documents (ajout) | OK (`ajouter_documents_chantier`) | OK | OK | RLS table+storage vérifiée, cross-tenant refusé | **GO** *(corrigé V1B)* |
| Photos | OK, même correctif | OK | OK | idem | **GO** *(corrigé V1B)* |
| Notes de frais (formulaire) | OK | non testé | OK | — | **GO** |
| Notes de frais (création) | OK (`extensions.digest`) | non testé | OK | Impersonation + cross-tenant refusés | **GO** *(corrigé V1B)* |
| Comptes-rendus (lecture) | OK | OK | OK | — | **GO** |
| Comptes-rendus (création) | OK, même correctif | OK | OK | RLS resserrée à `gerer_chantiers`/`ajouter_documents_chantier` | **GO** *(corrigé V1B)* |
| Validation pointages (chef) | n/a | Page accessible, boutons non atteints (pointage encore ouvert) | OK | Permission dédiée déjà vérifiée (PLANNING-POINTAGE-V1) | **GO sous réserve** |
| URL directes /devis /factures /rentabilite | Bloquées | non retesté | — | Redirection `?acces=refuse` confirmée | **GO** |
| PWA | OK | OK | OK | Manifest + SW corrects | **GO** |

## Vérifications empiriques réalisées (session authentifiée réelle)

- [x] Connexion/déconnexion réelles pour les deux profils (Local, comptes
      fictifs créés pour ce lot).
- [x] Dashboard terrain : pas de données financières, notifications
      d'affectation du jour claires.
- [x] Planning : distinction claire de deux chantiers le même jour ; durée
      affichée jamais présentée comme un horaire précis.
- [x] Pointage : démarrage avec chantier préselectionné, repli sans GPS
      fonctionnel, session ouverte visible après navigation/reload, double
      pointage impossible depuis l'UI, règle de durée minimale (0,25h-24h)
      appliquée côté serveur.
- [x] Accès direct par URL à `/devis`, `/factures`, `/rentabilite` : bloqué et
      redirigé pour le profil terrain.
- [x] Page « Photos et documents » : accessible en lecture, formulaire d'ajout
      absent pour les deux profils.
- [x] Page comptes-rendus : lecture OK, création bloquée en pratique (erreur
      cliente après redirection `?lecture=seule`).
- [x] Formulaire notes de frais : rempli avec succès, soumission en échec
      systématique (500).
- [x] Page « Gérer et vérifier les pointages » (chef) : accessible, texte de
      confidentialité GPS conforme à l'attendu.
- [x] Responsive réel à 390×844 et 430×932 sur dashboard/planning/pointage/
      chantiers/documents/notes de frais/comptes-rendus.

## P0 (corrigés — TERRAIN-MOBILE-V1B)

- [x] **Documents/Photos chantier — CORRIGÉ.** Cause : règle générique du
      middleware (`GESTION_PERMISSION_PAR_CHEMIN["/chantiers"] = "gerer_chantiers"`)
      combinée à une policy RLS RESTRICTIVE sur `documents_chantier` et sur le
      bucket `chantier-documents`, qui exigeaient toutes deux `gerer_chantiers`
      sans alternative. Nouveau droit `ajouter_documents_chantier`, cf.
      `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` §1.
- [x] **Notes de frais — CORRIGÉ.** Cause : `ajouter_audit_note_frais`
      (migration `20260713000060_archivage_notes_frais_integrite_stockage.sql`)
      appelait `digest()` sans qualifier le schéma, alors que sa fonction
      `security definer` verrouille `search_path=public` et que `pgcrypto`
      est installé dans `extensions`. Qualifié en `extensions.digest(...)`,
      cf. `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` §2.

## P1 (corrigé — TERRAIN-MOBILE-V1B)

- [x] **Comptes-rendus chantier — CORRIGÉ.** Bloqué par la même règle
      générique `/chantiers` → `gerer_chantiers` côté middleware ; la RLS,
      elle, n'imposait à l'inverse aucune permission (tout membre actif) —
      resserrée au passage à `gerer_chantiers`/`ajouter_documents_chantier`
      pour l'écriture, lecture inchangée. Cf.
      `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` §1.

## P2

- [x] Message d'erreur GPS non traduit (« User denied Geolocation ») —
      **CORRIGÉ V1C**.
- [x] Lien GPS vers `mlat=0&mlon=0` quand la position n'a pas été capturée —
      **CORRIGÉ V1C**.
- [ ] Planning mobile montre toute l'équipe, pas seulement « mes
      affectations » — choix de conception produit à trancher explicitement,
      pas un défaut technique, volontairement non modifié en V1C.
- [x] Champ pause replié par défaut sous « Options avancées » — **CORRIGÉ V1C**.
- [x] Mismatch d'hydratation React sur la page comptes-rendus (détection
      dictée vocale serveur/client) — **CORRIGÉ V1C** (`useSyncExternalStore`).
- [x] Message d'erreur générique à l'échec de clôture de pointage (durée
      minimale non expliquée) — **CORRIGÉ V1C**.
- [x] Lien « Modifier » visible sur une affectation en mode consultation, sans
      action utile pour ce profil — **CORRIGÉ V1C**.
- [x] **Masquage CSS « mode consultation » inopérant — CORRIGÉ V1C.**
      Sélecteur `form[method="post"]` → `form:not([method="get"])` (universel,
      site entier) + garde explicite pour le `<details>` « Modifier » du
      planning. Vérifié qu'aucune Server Action terrain n'était contournable
      malgré ce défaut (RLS/contrôle applicatif déjà suffisants partout).
      Cf. `docs/commercial/TERRAIN_MOBILE_V1C_READONLY_P1P2_ELSATIA.md`.
- [x] **P1 PLANNING-POINTAGE-V1 : branches `auth.role()='anon'` vestigiales
      (pointage) — CORRIGÉ V1C** pour les 4 fonctions concernées.

## P3

- [x] Chantier préselectionné arbitrairement (le premier) en cas de double
      affectation le même jour.

## Non vérifié dans ce lot (explicite)

- [ ] Viewport Android 412×915 (risque jugé faible, non re-testé faute de
      temps).
- [ ] Orientation paysage.
- [ ] iOS Safari / Android Chrome réels (moteur Chromium mobile utilisé à la
      place).
- [ ] Réseau lent (throttling) et perte réseau.
- [ ] Validation/rejet d'un pointage par le chef d'équipe (bouton non atteint,
      pointage encore ouvert dans le temps imparti) — logique déjà vérifiée en
      profondeur dans PLANNING-POINTAGE-V1.
- [ ] Justificatif photo/PDF sur note de frais, chaîne complète de validation
      frais (soumission → décision comptable) — P0 sous-jacent corrigé (V1B),
      non re-testé en détail faute de temps, hors périmètre du correctif.
- [ ] Suppression depuis mobile.
- [ ] IA mobile (non accordée au profil terrain testé).
- [ ] Sélecteurs avec 30+ options.
- [ ] Installation PWA physique sur device réel.
- [ ] Performance sous throttling réseau réel.

## Hors périmètre respecté (audit d'origine)

- [x] Aucun correctif fonctionnel appliqué (lot d'audit).
- [x] Aucune migration, aucune Production, aucune donnée réelle.
- [x] Toutes les données créées sont fictives, en Local, nommées « Audit ».

## Hors périmètre respecté (TERRAIN-MOBILE-V1B)

- [x] Aucune refonte de l'interface terrain ni de la navigation mobile.
- [x] Aucun mode offline, aucune notification push.
- [x] Aucun changement fonctionnel sur planning/pointage.
- [x] Aucune touche à PLATFORM-V2 ni à Stripe.
- [x] Aucune Production.

## Hors périmètre respecté (TERRAIN-MOBILE-V1C)

- [x] Aucune nouvelle fonctionnalité métier ajoutée.
- [x] Aucune touche à Stripe, Auth Supabase, Sentry, Brevo, site vitrine,
      tarifs, modules BETA.
- [x] Aucun seed Production.
- [x] Portée du nettoyage anon strictement limitée aux 4 fonctions de
      pointage concernées par le P1 d'origine.

## Livrables

- [x] `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md`.
- [x] `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md` (ce fichier).
- [x] `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md`.
- [x] `docs/commercial/TERRAIN_MOBILE_V1C_READONLY_P1P2_ELSATIA.md`.
- [x] Commit `docs(commercial): auditer experience terrain mobile ELSATIA`
      (`fef8e0e`).
- [x] Commits TERRAIN-MOBILE-V1B (`935d60c`, `fe205dd`, `ad3ab51`, `67e1773`).
- [x] Commits TERRAIN-MOBILE-V1C (`00dd490`, `e141a1a`, `60d0790`).
