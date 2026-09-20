# ELSATIA STUDIO — FINALISATION REPORT V2 (reprise après décisions Julien)

Reprise du 2026-09-20 depuis `2518b9d0`, décisions Q-001 → Q-011 appliquées sans redemande. **Aucune action Production, aucune Preview distante, aucun projet Supabase distant créé ou modifié, aucun push, aucun déploiement, aucun Stripe.** Gestion Pro et les autres applications n'ont pas été modifiées. Les lots A→H n'ont pas été réécrits ; les migrations qualifiées n'ont pas été renommées.

## Verdict

**ELSATIA STUDIO n'est PAS encore « COMMERCIAL READY CANDIDATE ».** Tout ce qui pouvait être construit et prouvé localement sans vous l'est. Ce qui reste exige un élément externe : fichiers réels, iPhone réel, projet Supabase distant autorisé, textes légaux relus, décision de licence HEVC. Ce sont des blocages nouveaux et précis (section 14), pas des décisions déjà prises que je rouvrirais.

## 1. Nouveau HEAD

Train `integration/studio-commercial-ready-v1`, code final qualifié @ **`6d9d6f51`** ; le commit suivant ne fait qu'ajouter ce rapport et la mise à jour du ledger (`git log -1`). 9 commits de code depuis `2518b9d0` : 79 fichiers, +3 406 / −65. Non poussé.

| Commit | Contenu |
|---|---|
| `bc31b0d9` | Lot M backend : domaine, SQL, mixage worker |
| `18b4173a` | Lot M application : import audio, panneau musique |
| `41f074fc` | Invitation par e-mail, suppression de compte, pages légales, filtre d'inscription |
| `c31382fc` | Projet Supabase dédié préparé (config, gabarits, ledger découplé, runbook, contrat catalogue) |
| `3fad3c3a`, `79c0ade7`, `416a2ced`, `d813b095`, `6d9d6f51` | E2E, HEIC (message), encart mobile, recette sources réelles, acceptation avec musique, pgTAP dédié |
| `d148ec1d` | fusion `--no-ff` dans le train |

Branches de lot locales : `feat/studio-m-music-v1`, `feat/studio-q8-invitations-rgpd-v1`, `feat/studio-q4-dedicated-supabase-v1`.

## 2. Capacités : 23 / 28 = 82,1 % (fin de nuit 1 : 20 / 28 = 71,4 %)

Calcul ligne par ligne dans le ledger maître. Changements : R05 invitations 0,5 → 1 · R16 musique 0 → 1 · R20 watermark 0,5 → 1 · R23 légal 0 → 0,5 · R24 RGPD 0 → 0,5 = +3. **Ce pourcentage mesure la matrice de capacités, pas la disponibilité commerciale** : les lignes encore incomplètes (légal, export RGPD, mobile/WebKit, confirmation e-mail distante, purge planifiée, miniatures, profil 720p, deux scénarios d'acceptation sans médias réels) sont exactement les blocages de la section 14.

## 3. Lot M — musique (Q-009)

Import MP3/M4A/WAV (inspection par signature, jamais publié, exclu des clips) ; `presentation.music` strict (volume 0–1, fondus 0–10 s) ; sélecteur, volume, fondus, retrait ; le worker coupe ou boucle la piste à la durée du montage, applique les fondus et mixe avec l'audio des clips (`amix` + `alimiter`). Un fichier manquant est refusé avec un message clair, jamais rendu en silence.

Preuves : pgTAP **37** ; Vitest domaine/éditeur ; worker (sans musique, piste plus courte, plus longue, remplacement, suppression, sorties 60 s et 90 s, **AAC vérifié par ffprobe**, énergie audio mesurée sur les fenêtres décodées) ; E2E « Lot M » PASS ; **acceptation 1080×1920 avec musique : Strasbourg 60 s (piste de 120 s coupée) et Croatie 90 s (piste de 25 s bouclée) PASS**, 1 800 / 2 700 images (±1), H.264/AAC 30 fps, énergie audible au début, au milieu et avant la fin. Sources synthétiques (sinus) : cela prouve le mixage, pas le goût musical. Droits : import sous responsabilité de l'utilisateur, à écrire dans les CGU (texte à valider).

## 4. RGPD technique — suppression de compte (Q-008)

Jamais de `DELETE` nu sur `auth.users`. Orchestration serveur : confirmation forte (adresse exacte + mot de passe revérifié auprès d'Auth + case) → `studio_deletion_prepare` → purge des objets Storage listés par une file idempotente → `studio_deletion_finish` (références résiduelles = 0 exigé) → suppression Auth admin → déconnexion. Chaque étape est reprenable après une panne. Espaces mono-propriétaire : purgés (projets, médias, exports, partages, Brand Kit, invitations, fichiers). Espaces partagés : le compte les quitte, les contributions restent rattachées au propriétaire sans lien avec le compte. **Propriétaire d'un espace avec d'autres membres : suppression refusée** avec explication (retirer les membres ou archiver). Audit sans identité (empreinte et compteurs). Un aperçu du plan est affiché avant confirmation.

Preuves : pgTAP **44** (tenant croisé, idempotence, refus, audit) ; E2E : mauvaise adresse et mauvais mot de passe refusés sans rien supprimer, suppression réelle → **stockage vide, utilisateur Auth supprimé, connexion impossible, espace voisin intact** ; refus pour propriétaire d'espace partagé. **Non couvert** : export des données (R24 reste à 0,5) ; durées de conservation légales = LEGAL REVIEW REQUIRED.

## 5. Invitation par e-mail

Lien à secret haché (SHA-256, jamais stocké en clair), 7 jours, usage unique, **réservé à l'adresse invitée**, révocable, pas d'oracle (jeton inconnu ou mal formé = même page), `noindex`/`no-referrer`. Sans fournisseur d'e-mail, le lien s'affiche une seule fois à copier. pgTAP **36** ; E2E réel via Mailpit : invitation reçue, tiers connecté refusé, invité accepté avec le bon rôle, réutilisation refusée, révocation effective. **Envoi de production (Resend ou autre) : non prouvé** (choix de fournisseur à faire).

## 6. Textes légaux et inscription (Q-002, Q-007)

Pages `/legal/mentions|confidentialite|cgu|cgv`, pied de page, case de consentement obligatoire (version du texte enregistrée avec le compte). **Tous les textes sont des squelettes marqués LEGAL REVIEW REQUIRED** ; aucun texte juridique inventé ; `noindex` tant que `STUDIO_LEGAL_PUBLISHED≠1`. Filtre d'inscription `STUDIO_SIGNUP_MODE=open|allowlist|closed` (liste d'adresses/domaines, invitation toujours admise) : **testé en unitaire (5 cas), pas en E2E** (le mode fermé n'a pas été joué sur un serveur dédié). Aucune ouverture publique.

## 7. Q-010 / Q-004 — ledger et projet Supabase dédié

**Décision** (détail dans `ELSATIA_STUDIO_SUPABASE_DEDICATED_RUNBOOK.md`) : Studio a son propre projet, donc son propre ledger, indépendant de Gestion Pro. Les migrations Studio ne dépendent que de `auth.users` et `storage` : aucun renommage nécessaire, le tri lexical `2026091x` < `20260920000308` n'a plus d'objet. `apps/studio/supabase/` contient config, gabarits d'e-mail de marque et 15 **liens symboliques** vers les migrations (aucune copie, aucune dérive) ; `scripts/studio-supabase-check.mjs` contrôle l'intégrité.

Preuves : **Fresh** (`local-test.mjs setup --studio-only`, projet vide) : 15 migrations au ledger = 15 fichiers, **15/15 fichiers pgTAP verts**. **Upgrade** (base au niveau Lot H, 260) : chaîne A→H PASS, puis les **7 migrations post-H** montées sur données H, retour arrière inverse, réapplication : **PASS**, ledger 267, timelines/snapshots identiques ; **pgTAP 15 fichiers / 637 assertions, 0 échec** sur la base upgradée. Un test (`studio_workspace_foundation`) supposait la table Gestion Pro ; rendu tolérant à son absence (58/58 dans les deux modes). Aucun projet distant créé : checklist de bootstrap au runbook.

## 7 bis. Studio × catalogue ELSATIA

Contrat écrit (`ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md`) : la plateforme **émet** un jeton d'habilitation signé (audience `studio`, 5 min, JWKS, `jti` anti-rejeu, fail-closed) ; Studio le **vérifie** ; aucune FK, vue ni lecture de la base plateforme, aucune clé service plateforme dans Studio. Côté Studio : interface d'habilitation et deux implémentations (`allowlist`, `closed`) prêtes ; l'implémentation par jeton attend l'émetteur, à construire dans le train plateforme (autre application, **non touchée**). Ne bloque pas Studio en pilote fermé.

## 8. HEIC / HEVC (Q-006)

Mesuré : `sharp` ne décode que `.avif` ; aucun décodeur HEVC embarqué ; aucun fichier iPhone réel. **HEIC** : refusé avant envoi avec un conseil actionnable (test unitaire) ; le champ d'import n'annonce pas HEIC, ce qui fait convertir en JPEG par Safari iOS (à confirmer sur iPhone). **HEVC** : refusé à l'import (H.264 seulement). Statut : **partiel / non qualifié**. Levée : fichiers réels + décision de licence H.265. Détail : `ELSATIA_STUDIO_HEIC_HEVC_STRATEGY.md`.

## 9. Mobile (Q-005) et watermark (Q-003)

Mobile : l'édition est pensée ordinateur ; un encart l'annonce sous 700 px ; consultation, export, téléchargement et partage restent disponibles. **Non prouvé sur WebKit ni iPhone.** Watermark : configurable par espace côté serveur, défaut aucun, non falsifiable ; il est incrusté dans le fichier rendu, donc un espace configuré le porte aussi sur ses liens publics ; pas de dérivée filigranée par lien (post-V1).

## 10. Durcissement partage / exports / Brand Kit

Revue du code existant : liens hachés, expiration obligatoire (1–30 j), 5 liens actifs max par export, seul un export final partageable, révocation, résolution publique côté serveur uniquement, filigrane décidé par le serveur, Brand Kit validé (emoji refusé) : **aucun nouveau défaut trouvé**. La suppression de compte purge partages et Brand Kit. Restent ouverts (hérités) : sandbox de décodage, observabilité avec alertes.

## 11. Tests

| Gate | Statut |
|---|---|
| TypeScript app + worker | PASS |
| ESLint app + worker | PASS |
| Vitest app | **PASS 311/311** (19 fichiers ; était 297) |
| Vitest worker | **PASS 28** ; 4 tests d'analyse **BLOCKED** (module Python `cv2` absent, aucun téléchargement) |
| pgTAP Fresh dédié / upgradé | **15 fichiers, 637 assertions, 0 échec** sur les deux |
| Chaîne A→H + upgrade/rollback/reapply post-H (7 migrations) | **PASS** |
| Contrôle d'intégrité du projet dédié | PASS (15 liées) |
| Build production | PASS |

## 12. E2E

Suite complète (41 cas, Chrome installé, aperçus 540×960, worker + Redis réels) : **40/41 au premier passage** ; l'échec était le test d'inscription de `foundation.spec.ts`, devenu périmé par la case de consentement obligatoire (changement voulu) ; test corrigé, **3/3 au second passage**. Nouveaux cas : 4 (`account.spec.ts`) + Lot M. Le gate `e2e-gate.mjs` attend désormais 41 cas (12 pour l'éditeur) ; **le gate lui-même n'a pas été rejoué de bout en bout**, les passages ci-dessus sont des exécutions Playwright directes. Non exécutés : « Lot H ON » (analyse, `cv2` absent), WebKit/iPhone, mode d'inscription fermé.

## 13. Rendu sur sources réelles

**NOT RUN.** Aucun fichier réel n'est disponible dans cet environnement. La recette est **prête** : `tests/acceptance-real.spec.ts` + `ELSATIA_STUDIO_REAL_SOURCE_ACCEPTANCE.md` (dossier `ELSATIA_STUDIO_REAL_MEDIA_DIR` : ≥ 10 photos haute résolution dont EXIF ≠ 1, ≥ 3 vidéos H.264 portrait/paysage avec audio, une piste, un logo). Elle importe tout, génère 60 s puis 90 s en 9:16, ajoute la musique, rend en 1080 et vérifie par ffprobe (conteneur, codecs, 1080×1920, 30 fps, images = durée × 30 ±1, durée ±0,1 s) et décode trois images (non noires, distinctes) plus l'énergie audio ; les échecs d'import sont **consignés comme résultat**. Le contrôle visuel (orientation EXIF, lisibilité du logo et du texte, lecture sur iPhone) reste humain. **Tant qu'elle n'a pas tourné, « COMMERCIAL READY CANDIDATE » est conditionnel à cette recette.**

## 14. Derniers blocages (tous externes)

1. **Fichiers réels** (photos, vidéos H.264, musique, logo) → rejouer la recette de la section 13.
2. **Autorisation explicite de créer STUDIO PREVIEW** (projet Supabase dédié) : bootstrap prêt (runbook), rien n'est fait à distance ; preuves distantes (Auth, confirmation e-mail, SMTP, buckets, restauration DB + objets, purge planifiée) impossibles sans.
3. **Textes légaux relus** (mentions, confidentialité avec durées de conservation, CGU dont droits musique, CGV si offre) → passer `STUDIO_LEGAL_PUBLISHED=1`.
4. **Fournisseur d'e-mail transactionnel** (Resend prévu, non testé) et domaine d'envoi.
5. **iPhone réel / WebKit** : rendu mobile, lecture du MP4, conversion HEIC par Safari.
6. **HEIC/HEVC** : fichiers réels et décision de licence H.265.
7. **Export des données personnelles (RGPD)** : périmètre à confirmer (la suppression est faite, l'export non).
8. **Émetteur de jeton d'habilitation** dans le train plateforme (contrat écrit) ; interrupteur `allowlist` d'ici là.
9. Non bloquant mais ouvert : observabilité avec alertes, sandbox de décodage, mesures de performance sur machine non saturée, dérivée stockée des miniatures.

## 15. Sécurité

Aucun P0. Ajouts qualifiés : invitations à secret haché et adresse liée, suppression de compte sans `DELETE` nu et idempotente, pages de lien `noindex`/`no-referrer`, consentement versionné, filtre d'inscription. La clé service qui était partagée avec Gestion Pro (Q-004) disparaît en cible dédiée : sa portée devient Studio seul.

## 16. Preview readiness

**Preview fermée : PRÊTE À PRÉPARER, non exécutée.** Prérequis côté dépôt remplis (projet dédié, 15 migrations prouvées Fresh et Upgrade, config Auth durcie, runbook, checklists). Manque : votre autorisation de création (point 2), fournisseur d'e-mail (point 4), worker hors Vercel, allow-list d'inscription. Ordre : LOCAL QUALIFIED (atteint) → PREVIEW FERMÉE → RECETTE → PILOTE → COMMERCIALISATION (Q-007).

## 17. Prochaine action recommandée

Déposer un dossier de médias réels (section 13) et me laisser rejouer la recette ; autoriser la création de STUDIO PREVIEW ; faire relire les textes légaux. Ensuite : rapport V3 avec la recette réelle, les preuves distantes et le verdict final.
