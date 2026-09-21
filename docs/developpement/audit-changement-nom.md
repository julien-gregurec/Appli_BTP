# Audit du changement de nom — ELSATIA

Date de référence : 1er août 2026

## Cadre vérifié

- Worktree : `/Users/juliengregurec/Projects/liria-codex`.
- Branche : `release/commercialisation-v1`.
- HEAD initial : `b512a971529dd42353815846f990f3d62d316e81`.
- Identité Git : `Julien GREGUREC <julien.gregurec@gmail.com>`.
- État initial : propre, aucun fichier suivi modifié.
- La branche n'est montée dans aucun autre worktree. `main` reste dans
  `/Users/juliengregurec/Documents/btp-platform` et la branche Claude dans
  `/Users/juliengregurec/Projects/liria-claude`.
- Aucun push, merge, rebase, déploiement ou accès à un service externe.

Le fichier d'audit annoncé dans le prompt n'existait pas sur cette branche ; le
présent document constitue donc l'état de référence créé avant toute
modification applicative.

## Méthode et volumétrie

L'inventaire porte uniquement sur les 761 fichiers suivis par Git. Les binaires
ont été exclus du comptage de contenu, mais leurs noms ont été inventoriés.

Deux mesures complémentaires sont nécessaires :

| Mesure | Fichiers | Occurrences | Utilité |
|---|---:|---:|---|
| Variantes textuelles de marque et raison sociale | 111 | 297 | décisions éditoriales |
| Sous-chaîne `liria`, insensible à la casse | 137 | 608 | inclut identifiants techniques à migrer ou justifier |

Le comptage large comprend 68 fichiers `src/`, 22 fichiers `docs/`, 16 scripts,
10 migrations historiques, 3 fichiers publics textuels et de nombreux
identifiants techniques. Il explique l'écart avec l'estimation documentaire de
489 occurrences.

Variantes éditoriales observées, toutes à supprimer des surfaces et données
actives selon la décision du propriétaire :

- `Liria Gestion Pro` : 151 ;
- `LIRIA GESTION PRO` : 4 ;
- `Liria (boutique)` : 3 ;
- `LIRIA CONCEPT` : 30 ;
- `Liria Concept` : 6 ;
- formes courtes `Liria`/`LIRIA` restantes : 103.

## 1. Texte visible utilisateur à remplacer

Les surfaces prioritaires sont :

- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/login/page.tsx`, onboarding,
  offline, tarifs, abonnement et pages de paiement ;
- navigation et chrome : `Sidebar`, `ApercuPoste`, `PiedLegal`, catalogue et
  libellé de boutique ;
- aide/FAQ, invitations, notifications, pages connecteurs/paramètres/plateforme ;
- pages légales rendues par l'application ;
- textes d'impression paie, DOE, exports XLSX et documents imprimables.

Action future : remplacer les mentions commerciales par `ELSATIA`, de préférence
via une configuration de marque unique. Aucun remplacement n'est effectué dans
ce lot d'audit.

## 2. Métadonnées et PWA à remplacer

- `src/app/layout.tsx` : titre, description, applicationName, Apple Web App et
  références d'icônes ;
- `src/app/manifest.ts` : nom, nom court et icônes ;
- `public/sw.js` : nom de cache et notification visible ;
- logos et icônes actifs sous `public/` ;
- métadonnées des guides/PDF générés.

Les noms de cache existants doivent être versionnés plutôt que supprimés sans
transition, afin que les anciennes PWA puissent se mettre à jour.

## 3. Assistant IA à remplacer

- `src/lib/ai/assistant.ts` contient le prompt système principal ;
- `src/lib/ai/copilote.ts` décrit le support et plusieurs outils ;
- `src/components/AssistantIA.tsx` et `FaqAide.tsx` contiennent des textes
  visibles associés.

Le futur changement doit rester strictement lexical : « l'assistant intégré
d'ELSATIA ». Capacités, permissions, quotas et règles métier restent inchangés.

## 4. Modèles de documents et PDF à remplacer

- `src/lib/xlsx.ts`, `DocumentImprimable` et pages d'impression actives ;
- générateurs `scripts/guide/*`, `create-guide-utilisateur-detaille.py` et
  `update-guide-branding.py` ;
- métadonnées, couvertures, en-têtes et alt text ;
- fichiers publics téléchargeables sous `public/guides` et sous-titres vidéo.

Les logos propres aux entreprises clientes restent prioritaires et ne doivent
pas être remplacés par le logo de l'éditeur.

## 5. Tests et fixtures à mettre à jour

Quatre fichiers de test contiennent la chaîne large :

- `src/lib/expenses/export.test.ts` : nom d'entreprise fixture et schéma
  technique d'export, à distinguer ;
- `src/lib/expenses/integrity.test.ts` : identifiant/chemin technique ;
- `src/lib/identifiants.test.ts` : l'ancienne fixture d'entreprise doit être
  remplacée par une fixture ELSATIA cohérente ;
- `src/lib/version.test.ts` : métadonnée produit visible à remplacer.

Ajouter ultérieurement des tests dédiés au layout, manifest, login, prompt IA,
documents et migration de boutique.

## 6. Documentation à mettre à jour

22 fichiers sous `docs/` contiennent la chaîne large. Les documents actifs
produit/juridiques doivent passer à ELSATIA. Les audits et rapports historiques
doivent conserver les formulations nécessaires à la traçabilité et être exclus
explicitement du contrôle automatisé.

Les documents juridiques seront seulement renommés techniquement ; aucune
validation juridique ne sera revendiquée.

## 7. Données nécessitant une nouvelle migration

La migration historique `20260724000175_liaison_boutique_tresorerie.sql` crée
un fournisseur `Liria (boutique)` et une description commerciale associée. Ces
lignes représentent le logiciel/boutique de plateforme, pas la raison sociale
de l'entreprise cliente.

Cette fiche représente le vendeur de matériels de la boutique plateforme. Elle
relève donc de la marque/éditeur et non du nom du logiciel. La formulation
recommandée est **`ELSATIA (boutique)`**, plus juste comptablement que
`ELSATIA Gestion Pro (boutique)`.

Après validation de cette recommandation, une migration **194** devra :

- mettre à jour exactement `fournisseurs.nom = 'Liria (boutique)'` vers
  `ELSATIA (boutique)` ;
- la description générée correspondante, avec un critère exact ;
- mettre à jour les descriptions actives `permissions_disponibles` créées par la
  migration 144 et les notes de dépenses boutique déjà créées par 175/176 ;
- redéfinir `obtenir_ou_creer_fournisseur_boutique` et
  `boutique_finaliser_commande_payee`, car les fonctions historiques 175/176
  continueraient sinon à créer l'ancien libellé et les anciennes notes ;
- inventorier les données actives `LIRIA CONCEPT`/`Liria Concept` et les traiter
  par critère exact selon leur rôle : `ELSATIA` si elles représentent la
  marque/éditeur, `ELSATIA Gestion Pro` si elles représentent le logiciel, ou
  suppression/archivage si l'entité est obsolète ;
- les éventuelles données de démonstration explicitement identifiées comme
  produit, après inventaire SQL local.

La migration devra être idempotente et accompagnée d'un pgTAP avant/après.
Elle devra gérer explicitement le cas où une entreprise possède déjà un
fournisseur `ELSATIA (boutique)` : rattacher les dépenses à la fiche cible puis
supprimer l'ancien doublon, plutôt que provoquer une collision d'unicité.

## 8. Migrations historiques à ne pas modifier

Dix migrations contiennent `liria`. Elles restent immuables, notamment les
migrations 72, 80, 100, 105, 134, 144, 145, 158, 175 et 176. Les chaînes y sont
des commentaires, anciens libellés, clés techniques ou données historiques.

## 9. Identifiants techniques à migrer ou conserver par compatibilité

La nouvelle consigne interdit aussi l'ancienne identité dans les paramètres
actifs. Chaque identifiant doit donc être traité explicitement, sans remplacement
global :

- renommer le package applicatif en `elsatia-gestion-pro` avec son lockfile ;
- renommer les tokens CSS actifs `liria-navy`/`liria-gold` en tokens ELSATIA ;
- migrer les clés localStorage vers `elsatia:*` en lisant une fois les anciennes
  clés puis en les supprimant ;
- émettre un nouveau schéma d'export `elsatia-gestion-pro/expense-export/v2` et
  ne garder l'ancien identifiant qu'en lecture de compatibilité si nécessaire ;
- renommer les marqueurs applicatifs actifs lorsqu'ils ne sont pas persistés ;
- conserver les noms de worktrees, conteneurs et migrations comme historique
  technique non exposé ;
- ne renommer une table, colonne, RPC ou bucket que si une occurrence existe et
  si une migration de compatibilité sûre est définie ; aucun cas ne doit être
  traité automatiquement ;
- maintenir les anciens domaines uniquement comme redirections techniques
  transitoires, jamais comme identité affichée.

Les rares anciens littéraux nécessaires à une lecture/migration de compatibilité
devront être isolés et commentés, puis exclus du contrôle qualité par fichier et
ligne, jamais par une exception globale.

## 10. Noms de fichiers à renommer

26 fichiers suivis contiennent `liria` dans leur nom : 15 actifs sous `public/`,
10 artefacts sous `output/` et un générateur sous `scripts/`.

- Les 15 fichiers publics doivent être renommés seulement lorsque leurs imports,
  URLs, caches PWA et liens de téléchargement sont modifiés atomiquement.
- Les 10 artefacts `output/` sont historiques et ne seront pas renommés dans le
  code ; ils seront régénérés sous de nouveaux noms.
- `scripts/create-liria-videos.py` pourra être renommé uniquement avec toutes ses
  références, après décision sur la régénération vidéo.
- Les migrations ne sont jamais renommées.

## 11. Médias ou vidéos à régénérer ultérieurement

Les vidéos, posters, VTT/SRT, guides PDF et anciennes icônes contiennent encore
l'ancienne identité. Modifier seulement les sous-titres créerait une
incohérence avec l'audio et l'image : le lot média doit être régénéré puis
remplacé de manière coordonnée.

Le logo officiel doit afficher uniquement **`ELSATIA`**. Le visuel fourni avec
la mission est un paysage 1536×1024 présentant un monogramme géométrique noir et
le wordmark `ELSATIA` sur fond gris sombre. Il
est traité comme référence validée, sans génération ni redessin. Avant
intégration, le fichier source doit être accessible dans le worktree et ses
variantes officielles nécessaires (transparent, clair/sombre, carré PWA)
doivent être fournies ou explicitement autorisées ; l'image jointe seule ne doit
pas être extrapolée automatiquement.

## 12. Services externes à modifier manuellement

GitHub, Vercel, Supabase, Stripe, Sentry, OpenAI et messagerie nécessitent une
checklist distincte. Aucun changement externe n'est autorisé dans cette mission.

## 13. `LIRIA CONCEPT` et `Liria Concept` à remplacer

Sept fichiers actifs ou historiques contiennent `LIRIA CONCEPT` ou
`Liria Concept`. La décision du propriétaire est définitive : cette identité
n'existe plus et ne doit être conservée dans aucun code visible, fixture, test,
document juridique/commercial, paramètre ou donnée active.

- Les migrations historiques, dont la migration 105, restent inchangées.
- Les rapports/relais purement historiques peuvent citer l'ancien nom pour la
  traçabilité, avec exclusion explicite du contrôle qualité.
- `PRODUCTION_CHECKLIST.md`, le test de préfixe, la recette 5 ans et
  `supabase/production/supprimer_entreprises_test.sql` sont actifs : ils devront
  être corrigés, et le script de nettoyage devra protéger la nouvelle identité
  exacte plutôt que l'ancienne.
- Les données actives correspondantes devront être inventoriées localement et
  corrigées par une migration nouvelle, jamais par modification de l'historique.

## Décisions restant à valider

1. Valider la recommandation **`ELSATIA (boutique)`** pour le fournisseur
   comptable automatique.
2. Fournir l'orthographe exacte des domaines `.fr` et `.com` avant toute URL ou
   adresse e-mail définitive.
3. Fournir le fichier logo source exploitable et les variantes officielles, ou
   autoriser explicitement leur dérivation à partir du visuel joint.
4. Décider si les anciens guides/vidéos publics restent temporairement accessibles
   pendant leur régénération ou doivent être retirés de la navigation.

Le nom du logiciel dans l'interface, la PWA, les documents, e-mails, abonnements,
l'aide et l'IA sera **`ELSATIA Gestion Pro`**. La marque, le logo, l'éditeur et
l'identité institutionnelle utiliseront **`ELSATIA`**.

Conformément au point d'arrêt demandé, aucune modification applicative ou
migration ne commence avant validation de ces points et du plan d'exécution.
