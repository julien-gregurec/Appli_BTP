# TERRAIN-MOBILE-V1 — Checklist

Référence : `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md`. Audit — aucune
ligne de code fonctionnel modifiée.

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
| Documents (ajout) | **Impossible** (`gerer_chantiers` requis) | **Impossible** | — | — | **NO-GO (P0)** |
| Photos | **Impossible**, même cause | **Impossible** | — | — | **NO-GO (P0)** |
| Notes de frais (formulaire) | OK une fois le droit accordé | non testé | OK | — | GO (formulaire) |
| Notes de frais (création) | **Erreur 500 systématique** | non testé | — | — | **NO-GO (P0)** |
| Comptes-rendus (lecture) | OK | OK | OK | — | **GO** |
| Comptes-rendus (création) | **Impossible**, même cause que documents | **Impossible** | — | — | **NO-GO (P1)** |
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

## P0 (bloquants, diagnostiqués précisément)

- [x] **Documents/Photos chantier** : formulaire d'ajout absent pour Terrain et
      Chef d'équipe. Cause : règle générique du middleware
      (`GESTION_PERMISSION_PAR_CHEMIN["/chantiers"] = "gerer_chantiers"`)
      combinée à la RLS de `documents_chantier`, qui exigent toutes deux
      `gerer_chantiers` — jamais accordé à un poste terrain par défaut.
- [x] **Notes de frais** : création impossible, erreur 500 avant même le
      brouillon. Cause : `ajouter_audit_note_frais` (migration
      `20260713000060_archivage_notes_frais_integrite_stockage.sql`) appelle
      `digest()` sans qualifier le schéma, alors que sa fonction
      `security definer` verrouille `search_path=public` et que `pgcrypto`
      est installé dans `extensions`. Bug de migration, probable sur
      Preview/Production.

## P1

- [x] **Comptes-rendus chantier** : création bloquée par la même règle
      générique `/chantiers` → `gerer_chantiers`, alors que le code métier
      lui-même (RLS + server action) n'impose aucune restriction — la
      consigne du lot indique explicitement qu'un chef d'équipe devrait
      pouvoir en créer sans droits financiers.

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
- [ ] Justificatif photo/PDF sur note de frais, frais cross-tenant, frais pour
      un autre salarié, chaîne de validation frais — bloqués par le P0 notes
      de frais.
- [ ] Suppression depuis mobile.
- [ ] IA mobile (non accordée au profil terrain testé).
- [ ] Sélecteurs avec 30+ options.
- [ ] Installation PWA physique sur device réel.
- [ ] Performance sous throttling réseau réel.

## Hors périmètre respecté

- [x] Aucun correctif fonctionnel appliqué.
- [x] Aucune migration, aucune Production, aucune donnée réelle.
- [x] Toutes les données créées sont fictives, en Local, nommées « Audit ».

## Livrables

- [x] `docs/commercial/TERRAIN_MOBILE_V1_AUDIT_ELSATIA.md`.
- [x] `docs/commercial/TERRAIN_MOBILE_V1_CHECKLIST.md` (ce fichier).
- [ ] Commit dédié `docs(commercial): auditer experience terrain mobile ELSATIA`.
