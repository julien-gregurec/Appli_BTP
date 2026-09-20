# ELSATIA STUDIO — OVERNIGHT FINALISATION REPORT

Nuit du 2026-09-20 (Julien indisponible). Mode autonome. **Aucune action Production, Preview, DNS, Stripe, Supabase distant, ni push.** Détail vivant : `ELSATIA_STUDIO_FINALISATION_MASTER_LEDGER.md` ; lots : `ELSATIA_STUDIO_NIGHT_LOTS_REPORT.md` ; checklists : `ELSATIA_STUDIO_PREVIEW_PRODUCTION_CHECKLISTS.md`.

## Verdict

**ELSATIA STUDIO n'est PAS « COMMERCIAL READY CANDIDATE ».** Le produit est passé de 44,6 % à **71,4 %** de la matrice de capacités, et tout ce qui pouvait avancer sans vous a avancé. Ce qui reste est soit à décider par vous (billing, textes légaux, clé service/projet Supabase, ouverture, mobile), soit non construit (musique importée, suppression de compte/RGPD technique, invitation par e-mail), soit à prouver dans un environnement qui n'existait pas cette nuit (Auth distant, iPhone réel, restauration, charge).

## 1. Base de départ / 2. HEAD initial

Branche distante `feat/elsatia-studio-v1` @ `214d47fd4d8474aa292b5cea121f80cae9c7dff7` (identique au HEAD connu). Aucune branche locale ni worktree Studio n'existait ; créés : worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/studio-commercial-ready-v1`, train `integration/studio-commercial-ready-v1`.

## 3. État initial

Lots A→H fonctionnels et qualifiés localement par leurs propres rapports ; I (Brand Kit), J (exports), K (durcissement), L (E2E finaux) absents ou partiels ; matrice de 28 capacités : 12,5/28 = 44,6 %. Quatre audits de code indépendants (éditeur, rendu/export, sécurité, produit/UX) : aucun P0, 25 défauts P1–P3 listés au ledger.

## 4. Lots A→H vérifiés

Rejoués cette nuit sur pile Supabase jetable : installation **Fresh** (264 migrations) + 12 fichiers pgTAP **520 assertions, 0 échec** ; chaîne historique A→H (257 → 258 → 259 → 260, retours arrière et réapplications, données identiques) **PASS** ; **upgrade des 4 migrations post-H sur base H peuplée, retour arrière inverse et réapplication : PASS** ; pgTAP rejoué sur la base upgradée : 520/520.

## 5. Défauts trouvés / 6. corrigés

Trouvés par audit : 25 (0 P0). **Corrigés** : admission de rendu illimitée, interrupteur absent, quota bloqué par des réservations abandonnées, crash de l'éditeur sur Suppr, perte des dernières éditions à la navigation, conflit d'autosave sans issue, timeout de rendu irrattrapable, texte non dessinable qui faisait échouer le rendu, URL signée sans renouvellement, pas de reset de mot de passe, texte forgeable via `?error=`, écrans/textes périmés, pas de miniatures, média utilisé supprimable sans avertissement, heartbeat trop fragile, un seul `ffprobe` de sortie à 10 s. Non-défaut vérifié : rotation EXIF des photos (FFmpeg 6.0 redresse). **Trouvés par les tests de cette nuit** : (a) les e-mails de récupération des gabarits Auth partagés pointent vers `/auth/confirm?type=recovery`, que la route ne traitait pas → flux de reset impasse (corrigé) ; (b) une action déclenchée avant l'hydratation React est perdue (constaté sous charge) → tous les E2E attendent l'hydratation, `loading.tsx` racine retiré ; (c) `email_sent = 2` par heure dans la config Auth locale affamait les tests de récupération ; (d) le SQL de retour arrière S1 refusait à tort avec des jobs actifs.

## 7. Nouvelles fonctions terminées

Brand Kit (entreprise, signature, téléphone, site, logo → préremplit le style) ; profil d'export 720p ; registre d'usage + carte « Utilisation » ; liens de partage révocables + page publique `/s/[token]` ; filigrane serveur (mécanisme) ; réinitialisation du mot de passe ; miniatures d'images ; confirmation avant retrait d'un média utilisé ; plafonds d'admission et interrupteur `STUDIO_ENABLED` ; journal d'erreurs sans PII ; panneau de rendu en français avec résolution, interrogation adaptative et renouvellement d'URL.

## 8. Branches / 9. Commits / 10. Migrations

Branches locales (aucun push) : `feat/studio-s1-admission-quota-v1`, `…-s2-editor-p1-v1`, `…-s3-auth-ux-v1`, `…-s4-render-j1-profiles-v1`, `…-i-brand-kit-v1`, `…-j2-share-watermark-v1`, `…-s5-thumbnails-usedmedia-v1`, fusionnées `--no-ff` dans `integration/studio-commercial-ready-v1`. 101 fichiers, +4 045 / −203 lignes depuis `214d47fd`. Migrations (4, toutes additives, timestamps `20260920…`, aucun n° GP) : `010000` admission, `030000` profils d'export + usage, `050000` Brand Kit, `070000` partage + filigrane. Risque de convergence **M-1** (tri par rapport aux migrations GP `20260920000308+`) : Q-010.

## 11. Tests

| Gate | Statut |
|---|---|
| TypeScript app + worker | PASS |
| ESLint app + worker | PASS |
| Vitest app | **PASS 297/297** (18 fichiers ; était 251) |
| Vitest worker | 22 PASS ; 4 tests d'analyse **BLOCKED** (module OpenCV `cv2` absent, aucun téléchargement fait) |
| pgTAP Fresh / upgradé | **PASS 520/520 (12 fichiers) sur les deux** |
| Chaîne A→H + upgrade/rollback/reapply post-H | **PASS** |
| Build production | PASS |
| Test de rendu réel du filigrane | PASS (pixels décodés) |

## 12. E2E

Suite complète (36 cas, Chrome installé, aperçus 540×960, worker + Redis réels) : **34/36 en un seul passage** ; les 2 échecs étaient (1) une attente de test restée sur le libellé anglais `rendering`, (2) le flux de récupération — dont le vrai défaut de route ci-dessus. Après correctifs : **annulation de rendu PASS, récupération + liens invalides PASS** (individuellement, pas rejoués dans un second passage complet). Scénarios ajoutés cette nuit : suppression au clavier/édition à la sortie, Brand Kit, partage/révocation/refus tiers, récupération de mot de passe. Non exécutés : analyse « Lot H ON » (OpenCV absent), WebKit/iPhone.

**Acceptation pleine taille (1080×1920, hors gate)** : **PASS ×2**. Strasbourg (10 photos + 3 vidéos, Chantier Pro, 9:16, 60 s) et Croatie (20 + 5, Voyage, 9:16, 90 s) : MP4 H.264/AAC 1080×1920, 30 fps, 1 800 / 2 700 images (±1), durée ±0,1 s, images décodées (début/milieu/fin) non noires, vérifié par ffprobe/ffmpeg. **Limites** : sources synthétiques minuscules, ni musique ni logo, ni dates EXIF ; ce n'est donc pas la recette complète du plan de test, seulement sa partie « format et durée à taille réelle ».

## 13. Sécurité

Aucun P0. Ajouts qualifiés : liens de partage (hash seul, table fermée, résolution service-only, `noindex`/`no-referrer`), filigrane non falsifiable, notices à liste fermée, journal sans PII, plafonds d'admission. Ouverts : clé service complète partagée (Q-004), politique Auth distante, sandbox de décodage, suppression de compte, verrou avant contrôle de rôle (P3). L'URL signée d'un lien public contient des UUID opaques d'espace/projet (aucun nom, e-mail ni identifiant de compte).

## 14. Render / 15. Export

Rendu réel bout en bout, désormais avec délai proportionnel, sonde de sortie tolérante, texte validé, heartbeat robuste. Exports : `preview` (interne), `standard` (1080), `hd720` ; MP4 H.264/AAC 30 fps ; nom de fichier sûr ; lien de partage révocable ; watermark par drapeau serveur. **Absents** : musique, profils autres, partage de rendu « aperçu ».

## 16. UX / 17. Performance

UX : reset de mot de passe, membres lisibles, 404 correct, états de chargement (dashboard/paramètres), erreurs françaises, miniatures. Performance : **aucune mesure fiable** — la machine était saturée (charge 20–25) par d'autres voies GP ; les temps mesurés ne valent pas engagement.

## 18. Train final HEAD

`integration/studio-commercial-ready-v1` — voir `git log -1` (le dernier commit porte ce rapport).

## 19. Lots restants

Musique importée (spec au ledger), suppression de compte / export RGPD technique, invitation par e-mail, sandbox de décodage, planification de la purge en Production, observabilité avec alertes, E2E WebKit/iPhone, dates EXIF du scénario Croatie, dérivée stockée des miniatures, couleurs/réseaux de marque (post-V1).

## 20. Questions pour Julien — demain matin

Q-001 billing · Q-002 textes légaux/rétention · Q-003 watermark · Q-004 clé service/projet Supabase · Q-005 mobile · Q-006 HEIC/HEVC · Q-007 ouverture · Q-008 suppression de compte · Q-009 musique/droits · Q-010 convergence des migrations · Q-011 miniatures. Contexte, options, recommandations et blocages précis : ledger maître. **Aucune question n'a bloqué le travail.**

## 21. Commercial readiness

**20 / 28 = 71,4 %** (initial 12,5/28 = 44,6 %), calculé ligne par ligne dans le ledger (QUALIFIED = 1, partiel = 0,5, absent = 0). Ce pourcentage mesure la matrice de capacités, **pas** la disponibilité commerciale : les lignes à 0 sont légal, RGPD, musique.

## 22. Prochaine action recommandée

1. Répondre à Q-004 (projet Supabase dédié) et Q-002/Q-008 : ce sont les trois blocages d'une Preview.
2. Me laisser lancer le lot **M (musique)** et le **RGPD technique** (aucune décision produit supplémentaire hors Q-009).
3. Préparer une Preview synthétique selon la checklist (Auth, buckets, worker hors Vercel, purge planifiée), puis rejouer les deux scénarios sur vraie infrastructure.
