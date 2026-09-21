# ELSATIA Studio — Lot C : qualification finale C-ter

Qualification locale du 12 septembre 2026. **Verdict : GO. Lot C clôturé. Aucun Lot D commencé.**

## Périmètre et référence

Branche `feat/elsatia-studio-v1`, HEAD initial `56f63f61f7b313a03b2329bd7ce51a95ff915945`. Les correctifs C-bis non committés ont été inspectés et conservés. Aucun changement métier n'a été introduit pour compenser Docker. Aucun Lot D, aucune migration, aucune modification RLS, aucune opération Production/Supabase distant/CI distante.

L'autorisation C-ter porte explicitement sur l'arrêt temporaire de quatre Analytics locaux et leur restauration. Les autres services actifs ont été préservés. Le serveur Next sur 3100 appartient à une autre recette : il n'a pas été arrêté. Aucun processus orphelin appartenant à Studio n'était présent au départ ; aucun processus parasite n'a été tué.

## A. Produit

Les correctifs C-bis conservent les vrais refus HTTP 401/403/404/409, distinguent les erreurs réseau/5xx, et maintiennent les conflits de révision SQL `40001` en 409. La frontière de validation des fichiers conserve le HTTP 400 pour fichier vide/invalide. Les contrôles de session et permissions restent actifs ; aucun retry métier ajouté.

Le code produit n'a pas été modifié en C-ter. La requalification vérifie les corrections C-bis, sans abaisser les assertions ou modifier le transport d'upload. Le cache de permissions reste limité à une requête serveur. Le rôle du scénario Chantier est vérifié contre `studio_my_role` et son workspace exact.

## B. Tests et outillage

- Gate local : instance Supabase neuve, environnement sauvegardé, readiness fonctionnelle, stabilité, build, SQL, E2E, stabilité finale, logs privés, verdict JSON et nettoyage de la seule instance créée.
- C-ter complète le readiness : création/login utilisateur dédié, refresh, requête authentifiée, logout/login ; lecture workspace et projet par une vraie session ; upload PNG signé, comparaison des octets via preview signée, suppression et contrôle d'absence de la fixture Storage.
- Stabilité : **100 cycles** Auth/REST, plus contrôle du bucket privé tous les dix cycles ; 210 requêtes lorsqu'une série réussit. Aucun retry de ces requêtes ; limite globale de deux minutes et timeout HTTP de huit secondes inchangés.
- Seuls les contrôles de démarrage disposent d'attentes bornées. Un véritable refus ou une identité/un rôle incohérent ne sont pas retentés.
- Chaque E2E est exécuté seul, puis deux suites complètes sur deux instances neuves. Aucun changement de code entre les deux suites complètes.
- `workers: 1`, `retries: 0` inchangés. Utilisateurs, workspaces et projets uniques ; contextes navigateur indépendants, fixtures locales nettoyées.
- Profil TUS 64 Mio explicitement sélectionné, conformément à l'autorisation de smoke C-ter. Les assertions restent : transfert direct, panne injectée, pause/reprise à offset non nul, progression, confirmation réelle et plafonds mémoire/payload. Aucun nouveau test 1 Gio revendiqué ; le profil 1 024 Mio demeure la valeur par défaut.

Commandes de recette :

```sh
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome STUDIO_E2E_LARGE_MIB=64 npm run studio:e2e:gate -- --individual
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome STUDIO_E2E_LARGE_MIB=64 npm run studio:e2e:gate
```

Ces commandes ne pilotent pas les Analytics d'autres projets. Leur arrêt a été exécuté séparément, uniquement pour cette qualification et sous autorisation explicite.

## C. Infrastructure locale et cause racine

Docker Desktop : 10 CPU, 8 321 515 520 octets de RAM (7,75 Gio). Les traces C-bis montraient des délais Auth 504, une forte pression mémoire et un Storage non prêt malgré un processus en écoute. La photographie C-ter confirme une mémoire disponible faible et un swap VM presque plein avant arrêt.

| Analytics local                                               | État initial | CPU instantané |            Mémoire instantanée |
| ------------------------------------------------------------- | ------------ | -------------: | -----------------------------: |
| `supabase_analytics_btp-platform`                             | running      |         1,72 % |                      506,4 Mio |
| `supabase_analytics_elsatia-reserves-v4-dbtest`               | running      |         1,49 % |                        524 Mio |
| `supabase_analytics_elsatia-capacity-r2-dbtest`               | restarting   |            0 % | 0 octet au moment de la mesure |
| `supabase_analytics_elsatia-gp-contracts-snapshot-int-dbtest` | running      |         1,47 % |                      498,3 Mio |

Le quatrième service en boucle de redémarrage n'était donc pas sain avant intervention. Aucun volume, conteneur ou configuration Analytics supprimé. Les identifiants et montages ont été conservés avant arrêt pour contrôle après restauration.

| Mesure VM Docker          |                  Avant | Après arrêt des quatre Analytics |
| ------------------------- | ---------------------: | -------------------------------: |
| Mémoire disponible        | 824 892 Kio (0,79 Gio) |         2 437 916 Kio (2,33 Gio) |
| CPU cumulé des conteneurs |               125,63 % |                          19,11 % |
| Load 1 minute             |                   2,19 |                             1,59 |
| Swap libre / total        |     80 / 1 048 572 Kio |              100 / 1 048 572 Kio |

100 % de CPU cumulé correspond à un cœur ; les relevés sont des photographies successives, pas un benchmark. Le swap reste occupé après arrêt : on ne prétend pas l'avoir vidé. Le gain utile est la mémoire disponible et l'absence de nouvelle pression bloquante pendant la qualification.

macOS avant : pages libres 4 563 × 16 Kio ; swap utilisé 1 722,94 Mio ; load 3,38 / 7,97 / 13,64. Les photographies `vm_stat` complètes sont conservées ; les pages libres macOS ne sont pas assimilées à la métrique Linux `MemAvailable`.

La pile Studio ne démarre que PostgreSQL, Kong, Auth, REST, Storage et le service mail local nécessaire au harnais existant. Analytics, Realtime, Studio Supabase, pg-meta, Edge, vector et pooler sont exclus comme auparavant. Aucun health check CLI désactivé. Les limites globales Docker Desktop n'ont pas été changées.

## Preuves et résultats

Dossier privé de campagne : `/tmp/elsatia-studio-cter/` : état Git, inventaire conteneurs/ports/processus, stats avant/après, snapshots VM/macOS, identifiants/montages Analytics, journaux et prélèvements périodiques `resources-during.jsonl`.

### Qualification individuelle

Dossier : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-IqeOU3/`.

- **10/10 E2E verts**, exécutés séparément ; zéro skipped et zéro flaky.
- Readiness complet : 22 requêtes, zéro erreur ; maximum 80 ms.
- Stabilité avant : 100/100 cycles, 210 requêtes, zéro erreur ; p50 5 ms, p95 18 ms, max 34 ms.
- Stabilité après : 100/100 cycles, 210 requêtes, zéro erreur ; p50 5 ms, p95 26 ms, max 47 ms.
- Scénario Chantier : 86 réponses `studio_my_role` HTTP 200 / `owner`, aucun HTTP 5xx ni erreur réseau dans sa trace. Les assertions d'identité, workspace, paramètres, couverture, ordre et restauration passent.
- SQL : 48 fichiers, **1 072 assertions vertes**.
- Unitaires : 9 fichiers, **166 assertions vertes**.

### Suites complètes et ressources

Dossier : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-LDNgu9/`.

| Contrôle                     | Run 1                                          | Run 2                                          |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| E2E                          | **10/10**, 44,34 s                             | **10/10**, 44,21 s                             |
| Skipped / unexpected / flaky | 0 / 0 / 0                                      | 0 / 0 / 0                                      |
| Stabilité avant              | 100 cycles, 210 requêtes, 0 erreur ; max 64 ms | 100 cycles, 210 requêtes, 0 erreur ; max 74 ms |
| Stabilité après              | 100 cycles, 210 requêtes, 0 erreur ; max 71 ms | 100 cycles, 210 requêtes, 0 erreur ; max 54 ms |
| SQL                          | 1 072/1 072                                    | 1 072/1 072                                    |
| Build production local       | PASS                                           | PASS                                           |
| Installation                 | 255 migrations sur instance neuve              | 255 migrations sur une autre instance neuve    |

`verdict.json` du gate : GO, deux résultats complets. Aucune modification de code entre les runs. Les traces instrumentées des deux suites contiennent **5 016 appels observés, zéro 5xx et zéro erreur réseau** ; celles des tests individuels 2 544 appels, également sans 5xx/erreur réseau. Les refus attendus 400/401/403/404 ne sont pas masqués.

Le smoke TUS transfère réellement 67 108 864 octets par run. Run 1 : 12 PATCH, un défaut réseau injecté, reprise jusqu'à l'offset 62 914 560, payload maximal vers Next 106 octets. Run 2 : 13 PATCH, même défaut injecté et même offset, même payload. La croissance du heap navigateur reste inférieure à 4 Mio ; aucune hausse du RSS Next mesurée pendant ces transferts. Ces retries TUS font partie du scénario fonctionnel existant ; aucun retry de test Playwright ou retry métier compensatoire n'a été ajouté.

Relevés périodiques pendant les fenêtres E2E (2 échantillons au run 1, 3 au run 2) :

| Mesure                        | Run 1                   | Run 2                   |
| ----------------------------- | ----------------------- | ----------------------- |
| Mémoire disponible VM         | 1 249 680–1 319 748 Kio | 1 148 492–1 302 852 Kio |
| CPU cumulé                    | 68,37–319,85 %          | 58,22–209,09 %          |
| Load 1 minute                 | 1,26–1,43               | 1,66–3,20               |
| Pression mémoire `full avg10` | 0,00 %                  | 0,00 %                  |
| Swap libre                    | 84–144 Kio              | 152–156 Kio             |

Les prélèvements ne sont pas des maxima continus : ils documentent une marge mémoire supérieure à 1 Gio et l'absence de blocage mémoire soutenu dans les fenêtres mesurées. La limite de 10 CPU n'est pas saturée par les pics observés. Les journaux et contrôles de stabilité confirment l'absence des erreurs non injectées qui bloquaient C-bis.

Lots revalidés : A (sans entreprise, idempotence, sessions, workspaces, rôles et RLS), B (JPG/PNG/MP4/MOV, TUS, preview privée, suppression, A/B), C (création, édition, couverture, ordre/date, duplication partagée, archive/restauration, suppression, viewer et cross-workspace).

Lint applicatif et scripts, typecheck, unitaires et `git diff --check` : verts. Aucune régression des autres applications introduite : leurs sources et les dix fichiers préexistants sont inchangés ; leurs suites intégrales n'ont pas été relancées dans cette intervention ciblée Studio.

## Restauration, Git et limites

Les trois instances jetables ont été détruites par le gate après sauvegarde des preuves. Le `.env.local` antérieur est restauré ; les dix modifications préexistantes hors lot sont conservées octet pour octet. Les Analytics sont redémarrés sur leurs conteneurs d'origine ; identifiants et montages identiques, aucune donnée supprimée. Vérification finale :

- `supabase_analytics_btp-platform` : running / healthy, comme au départ.
- `supabase_analytics_elsatia-reserves-v4-dbtest` : running / healthy, comme au départ.
- `supabase_analytics_elsatia-gp-contracts-snapshot-int-dbtest` : running / healthy, comme au départ.
- `supabase_analytics_elsatia-capacity-r2-dbtest` : restarting / unhealthy, retour à son état initial instable. Cette anomalie préexistante d'une autre recette n'est pas présentée comme corrigée et n'a pas entraîné de modification de sa configuration.

Preuve : `/tmp/elsatia-studio-cter/analytics-restored.json`, comparée à `analytics-before.json`.

Seuls les correctifs génériques C-bis/C-ter et leur documentation sont destinés aux commits. Les arrêts/redémarrages propres à cette machine et le moniteur temporaire ne sont pas intégrés au dépôt. La branche autorisée reste `feat/elsatia-studio-v1`, remote `gh`, sans merge ni déploiement.

Les journaux bruts et fichiers privés de fixture restent hors Git. Aucun secret réel n'est ajouté aux scripts ou au rapport. Le swap et les anciennes piles restent des contraintes de cette machine partagée : pour une prochaine qualification, réserver une capacité équivalente ou arrêter temporairement les services non nécessaires avec autorisation. Ne pas augmenter globalement les ressources Docker ni arrêter d'autres projets automatiquement.

## Commits et publication autorisée

- `8517371f0826c2784e01b83d66d0da305a950c93` — `fix(studio): preserve REST failures and validation statuses`.
- `b722d6dfecb4b6c07ba785b4dc85b84a39598856` — `test(studio): harden local runtime readiness and e2e gate`.
- La documentation historique C-bis et ce rapport font l'objet d'un commit documentaire séparé.

La synchronisation finale est contrôlée par `git rev-parse HEAD` et `git ls-remote gh refs/heads/feat/elsatia-studio-v1` après le push autorisé. La preuve locale, incluant les hashes finaux, est conservée dans `/tmp/elsatia-studio-cter/git-final.json`. Aucun merge, force push, déploiement ou pilotage de CI distante.

Le Lot C est clôturé ; le Lot D peut faire l'objet d'une nouvelle instruction, mais aucun travail de ce lot n'a été engagé.
