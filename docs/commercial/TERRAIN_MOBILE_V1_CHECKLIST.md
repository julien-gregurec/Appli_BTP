# TERRAIN-MOBILE-V1 — Checklist

Référence : `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md` (audit initial)
et `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` (correctifs des
2 P0 + 1 P1, branche `claude/terrain-mobile-v1b-fixes`). Les sections
ci-dessous tracent l'audit d'origine ; voir le document de correctifs pour le
détail de ce qui a été corrigé.

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

- [x] Message d'erreur GPS non traduit (« User denied Geolocation »).
- [x] Lien GPS vers `mlat=0&mlon=0` quand la position n'a pas été capturée.
- [x] Planning mobile montre toute l'équipe, pas seulement « mes
      affectations » — à confirmer si assumé.
- [x] Champ pause replié par défaut sous « Options avancées ».
- [x] Mismatch d'hydratation React sur la page comptes-rendus (détection
      dictée vocale serveur/client).
- [x] Message d'erreur générique à l'échec de clôture de pointage (durée
      minimale non expliquée).
- [x] Lien « Modifier » visible sur une affectation en mode consultation, sans
      action utile pour ce profil.
- [x] **Découverte V1B** : le masquage CSS « mode consultation »
      (`ModuleAccessBoundary`, sélecteur `form[method="post"]`) ne correspond
      jamais aux formulaires de Server Actions Next.js (aucun attribut
      `method` dans le DOM rendu) — tout formulaire de mutation reste visible
      en lecture seule, sur l'ensemble de l'application, pas seulement sous
      `/chantiers`. La barrière réelle (RLS/middleware) n'est pas compromise.
      Non corrigé (hors périmètre V1B), recommandé comme lot séparé. Cf.
      `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md` §4.

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

## Livrables

- [x] `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md`.
- [x] `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md` (ce fichier).
- [x] `docs/commercial/TERRAIN_MOBILE_V1B_CORRECTIONS_ELSATIA.md`.
- [x] Commit `docs(commercial): auditer experience terrain mobile ELSATIA`
      (`fef8e0e`).
- [ ] Commits dédiés TERRAIN-MOBILE-V1B (permissions + fix pgcrypto + docs).
