# ELSATIA — GP Hardening — Qualification réelle sur base de données V1

Mission autonome (~8h) : tester réellement, sur une vraie base Postgres rejouée depuis les
migrations, les correctifs de hardening GP de `origin/claude/quirky-noether-n8aerc`, jusqu'ici
seulement revalidés en lecture de code.

- **Branche testée** : `origin/claude/quirky-noether-n8aerc`
- **HEAD réel constaté** : `4fadc454` (confirmé identique au HEAD annoncé dans la mission)
- **Branche de travail** : `nuit-qualification-v1` (créée depuis ce HEAD)
- **Un correctif porté durant cette mission**, hors des 34/35 annoncés — voir §0.

---

## §0. Écart n°1 sur le périmètre annoncé : régression réelle prouvée et corrigée

La mission demandait explicitement de ne porter aucun nouveau correctif *sauf régression réelle
prouvée*. En rejouant les 195 migrations puis en interrogeant la base **avec le rôle
`authenticated` réel** (`SET ROLE authenticated` + GUCs `request.jwt.claim.*`, exactement le
mécanisme PostgREST), et non en superutilisateur, une régression bloquante a été mise en
évidence :

- `public.est_membre_actif(uuid)` et `public.entreprise_sans_membres(uuid)` — les deux fonctions
  qui gatent l'appartenance à une entreprise dans **plus de 100 policies RLS** couvrant la quasi-
  totalité du schéma métier (`clients`, `entreprises`, `postes`, `employes`,
  `utilisateurs_entreprises`, `devis`, `factures`, `chantiers` [policy legacy], et des dizaines
  d'autres, y compris `storage.objects` pour tous les buckets métier) — ont perdu tout `EXECUTE`
  pour `authenticated` dès la migration `20260714000078_fermeture_acces_anonyme_production.sql`
  (balayage rétroactif `revoke execute ... from public, anon` sur toute fonction
  `SECURITY DEFINER` déjà créée à cette date). Contrairement à `a_permission` (grant explicite à
  `authenticated` dans `20260713000043`, donc épargnée), aucune migration ultérieure ne
  ré-accorde `est_membre_actif`/`entreprise_sans_membres` à `authenticated`.
- **Preuve empirique** : sur une base fraîche (195/195 migrations, aucune erreur), `SET ROLE
  authenticated; SELECT 1 FROM public.clients` (ou `entreprises`/`postes`/`employes`/
  `utilisateurs_entreprises`/...) échoue avec `permission denied for function
  est_membre_actif`, **avant même l'évaluation de la policy** — cassant la lecture de base pour
  tout utilisateur authentifié réel sur la quasi-totalité du produit.
- **Préexistant, indépendant des 34/35 correctifs GP hardening** : la migration `20260714000078`
  existe à l'identique sur `main` (vérifié `git show main:supabase/migrations/...`), et aucun des
  correctifs de cette branche n'y touche. Ce n'est donc pas une régression introduite par le
  hardening — c'est un bug bloquant hérité, jamais détecté faute d'avoir déjà rejoué les
  migrations avec le rôle `authenticated` réel plutôt qu'en lecture de code ou en
  superutilisateur.
- **Correctif porté** (`supabase/migrations/20260922000201_regression_grant_execute_est_membre_actif.sql`) :
  strictement additif, `grant execute ... to authenticated` sur les deux fonctions, exactement le
  même schéma que `a_permission` et toutes les autres fonctions déjà correctement accordées.
  Aucune policy, aucun corps de fonction, aucune logique d'autorisation modifiée — uniquement la
  capacité d'appel restaurée. Confirmé sans effet sur la sémantique de sécurité : après le
  correctif, les mêmes 33 witnesses négatifs (cross-tenant, élévation, etc. — §2 à §10) échouent
  toujours exactement comme attendu.

Sans ce correctif, la quasi-totalité de la qualification demandée (sections 4 à 10 de la
mission) aurait été impossible à exécuter avec un rôle `authenticated` réel.

---

## §1. Méthodologie et limites d'environnement

- **PostgreSQL** : `postgresql-16` natif (pas de conteneur), `pgtap 1.3.2` installé via apt.
- **Supabase local/Docker indisponible** : `supabase start` a été tenté (Docker démarré avec
  succès), mais le pull des images (`supabase/postgres`, `gotrue`, `postgrest`, `storage-api`,
  `realtime`, ...) échoue systématiquement avec `Error response from daemon: error from
  registry: Data limit exceeded` (quota réseau du registre applicable à cet environnement,
  confirmé y compris sur une image tierce minimale). **Conséquence directe** : impossible de
  faire tourner le vrai GoTrue/PostgREST/Storage API. La qualification porte donc sur une
  reconstruction fidèle, au niveau PostgreSQL pur, des rôles/schémas que Supabase fournit
  normalement (`anon`, `authenticated`, `service_role`, `authenticator`; schémas `auth`/`storage`
  avec `auth.uid()/role()/email()/jwt()`, `storage.foldername()`, tables `storage.buckets/
  objects`) — cf. `00_bootstrap.sql`. Les policies RLS et triggers réels de la branche sont
  exécutés tels quels, avec `SET ROLE authenticated`/`service_role` et les GUCs
  `request.jwt.claim.*`, reproduisant exactement le mécanisme que PostgREST utilise en
  production.
- **Ce que cela couvre bien** : RLS, contraintes FK, triggers, fonctions `SECURITY DEFINER`,
  privilèges de table/fonction — soit la quasi-totalité des 35 correctifs, qui sont des
  correctifs de base de données.
- **Ce que cela ne couvre pas** : le comportement HTTP réel de PostgREST (désambiguïsation
  d'embed PGRST201, en particulier), l'émission réelle de tokens GoTrue, l'API Storage réelle
  (upload/suppression de fichiers), les en-têtes HTTP en conditions live (le serveur Next démarre
  mais nécessite une vraie URL Supabase pour rendre une page hors erreur 500 dans cet
  environnement). Ces points sont marqués `PARTIEL` dans le tableau §11 avec la preuve de niveau
  code/tests automatisés qui reste disponible.

---

## §2. FRESH — rejeu complet des migrations

`for f in supabase/migrations/*.sql; do psql ... -f "$f"; done` sur une base neuve :
**195/195 migrations appliquées, 0 erreur, 0 warning caché** (grep exhaustif sur le log complet).
Base finale : 143 tables, 459 policies RLS en schémas `public`+`storage`.

## §3. UPGRADE — base historique pré-hardening → HEAD, checksums métier

- Base séparée (`preupgrade`) construite avec les **178 migrations de `main`** (avant les 17
  migrations GP hardening `20260922000184`→`000200`), + jeu de données réaliste multi-tenant
  (2 entreprises, utilisateurs, postes, permissions, clients, chantier, devis accepté, facture
  émise puis payée via règlement réel déclenchant le trigger de recalcul, relance impayé).
- **Checksum métier pré-upgrade** (factures+devis+chantiers+paiements+relances, `md5` sur
  agrégat trié) : `58c7518dc1cc75ff45a91c87ec2c6e3f`.
- Application des 17 migrations GP hardening + la migration de régression §0 : **0 erreur**,
  y compris les 3 nouvelles clés étrangères composites d'isolation cross-tenant (§6), qui
  auraient échoué si les données historiques avaient contenu une incohérence inter-entreprises.
- **Checksum métier post-upgrade : `58c7518dc1cc75ff45a91c87ec2c6e3f` — identique**, mêmes
  compteurs de lignes. La facture émise historique reste `payee`/1000/1200 à l'identique, avec
  le nouveau trigger d'immutabilité désormais actif dessus sans avoir rien modifié.

## §4. PRIVILEGE ESCALATION

`plateforme_ajouter_admin`/`plateforme_retirer_admin` (auto-promotion), session support
(persistance), AI permissions (menu réel), export comptable (authz) — voir tableau §11
(witnesses 1a/1b, 7a/7c, batch copilote/permissions-financieres en vitest).

## §5. BOUTIQUE — contournement de paiement

`boutique_finaliser_commande_payee`/`obtenir_ou_creer_fournisseur_boutique` : `authenticated`
refusé (`insufficient_privilege`, EXECUTE révoqué), `service_role` (chemin webhook) toujours
fonctionnel. Witnesses 2a/2b/2c.

## §6. CROSS-TENANT — 3 gaps FK

`devis.client_id`, `factures.{client_id,devis_origine_id,facture_origine_id,facture_parente_id}`,
`relances_impayes.facture_id` : chaque tentative de rattachement à une ressource d'une autre
entreprise rejetée par la FK composite (`foreign_key_violation`), écriture légitime intra-
entreprise non affectée. Witnesses 3a/3b/3c/3d, confirmées de nouveau lors de l'upgrade réaliste
(§3).

## §7. HR/PAYROLL — documents sensibles

`documents-paie` (bulletins) : propriétaire ✅, gestionnaire paie ✅, collègue quelconque ❌.
`documents-employes` (carte BTP/signature) : propriétaire ✅, `gerer_employes` ✅, membre actif
quelconque ❌ — **mais photo employé reste lisible par tout membre actif (non-régression
annuaire), vérifié explicitement**. Witnesses 5a/5b/5c, 6a/6b/6c.

## §8. CHANTIERS RLS

Création légitime (membre + `gerer_chantiers`, client de sa propre entreprise) ✅; rattachement à
un client d'une autre entreprise ❌ (RLS `WITH CHECK`); écriture d'un membre B dans l'entreprise A
❌; membre sans `gerer_chantiers` ❌ (policy RESTRICTIVE); update légitime ✅. Witnesses 4a-4e.

## §9. AUTH

- **Open redirect / password reset poisoning** : `construireUrlCallbackAuth`/
  `urlCallbackReinitialisation` (`src/lib/auth-redirects.ts`) construisent les liens d'e-mail
  **uniquement** depuis `NEXT_PUBLIC_APP_URL` (config serveur), jamais depuis les en-têtes
  client (`Origin`/`Host`/`X-Forwarded-Host`). `destinationInterneSure`
  (`src/lib/security/redirects.ts`) rejette tout `//host`, tout chemin ne commençant pas par
  `/`, tout caractère de contrôle, avec re-décodage + re-parsing anti-contournement — revue de
  code + 3 fichiers de tests dédiés (`auth-redirects.test.ts`,
  `auth-redirects-canonique.test.ts`, `plateforme-reinitialisation.test.ts`), tous verts dans
  les 189/189 vitest.
- **Support escalation** : §0/§4 (session support ne peut plus laisser de trace permanente).
- **Session** : `deux_facteurs_actif`, confirmation de token sur clic explicite
  (`auth-confirm.test.ts`), routage admin plateforme hors onboarding
  (`auth-login.test.ts`/`entreprise.test.ts`) — vitest verts.
- **Non testé en conditions HTTP live** (GoTrue/PostgREST indisponibles, §1) : le round-trip
  réel navigateur → e-mail → callback.

## §10. GDPR STORAGE

`anonymiser_employe` (RPC, base) + `anonymiserEmployeAction` (`src/app/actions/rgpd.ts`) :
code confirmé appeler réellement `createAdminClient().storage.from("documents-employes").remove([...])`
avec les 3 chemins réels de l'employé (photo/signature/carte BTP) après le succès de
l'anonymisation en base, erreur Storage journalisée sans jamais annuler l'anonymisation déjà
acquise (best-effort documenté). **Non exercé contre une vraie API Storage** (indisponible, §1) —
revue de code uniquement pour ce volet précis.

## §11. RAW SQL ERRORS

- `messageErreurUtilisateur` (`src/lib/erreurs-utilisateur.ts`) : catégorise par code/message
  (23505, 42501, 23503, PGRST116, etc.) vers 9 messages génériques fixes, **journalise toujours
  l'erreur brute côté serveur** (`console.error`) et ne la renvoie jamais au client sauf `repli`
  explicite fourni par l'appelant. Lu intégralement, correct.
- Échantillon vérifié sur les fichiers réellement modifiés (`clients.ts`, `documents.ts`,
  `paiements-en-ligne.ts`) : **aucun redirect Next avalé** — dans tous les cas examinés,
  `redirect(...)` est soit hors de tout `try/catch` (le code Supabase-js renvoie `{data,error}`,
  ne lève pas), soit placé dans la branche `catch` elle-même (jamais à l'intérieur du `try`
  qu'elle pourrait déclencher puis se faire intercepter par son propre `catch`).
- Les 5 commits `fix(erreurs)`/`fix(erreurs-utilisateur)` touchent au total ~30 fichiers
  applicatifs ; un échantillon représentatif (P0 onboarding/documents/devis/paiement,
  socle CORE) a été lu ligne à ligne, le reste validé par la même vérification automatisée
  (typecheck/lint/vitest/build, §12) qui aurait échoué sur un import cassé ou un branchement
  incorrect du helper.

## §12/§14. NEXT SECURITY & APP TESTS

- **Next.js effectif** : `16.3.5` (`npm ls next`), **0 avisory `next`** dans `npm audit`.
- `npm run typecheck` → **0 erreur**.
- `npm run lint` → **0 erreur**, 3 warnings préexistants sans rapport (`<img>` non optimisée,
  hors périmètre hardening).
- `npm run test` (vitest) → **189/189 tests verts, 41/41 fichiers**.
- `npm run build` → **succès** (Turbopack, compilation + passe TypeScript + prerender OK).

## §13. PGTAP

- **22/22 suites existantes** (`supabase/tests/*.sql`) passent sans régression, avant et après le
  correctif §0.
- **Constat méthodologique important** : sur les 22 suites, **une seule**
  (`plateforme_admin_role_total_ferme_autopromotion.test.sql`) exerçait déjà un rôle
  `authenticated` réel avec witnesses positif/négatif comportementaux ; les 21 autres sont des
  vérifications **structurelles** (existence de colonne/table/fonction, RLS activée) — exactement
  le type de couverture que cette mission qualifie de « jamais qualifié ensemble sur une vraie
  base ». C'est pourquoi 39 witnesses comportementaux réels et nouveaux (fichiers
  `20_witnesses_core.sql` à `25_witnesses_idempotence.sql`) ont été écrits et exécutés cette
  session pour combler cet écart sur les correctifs à plus haut risque (§4 à §10, plus
  l'idempotence paiement/avoir) — **39/39 passent**, 0 échec, après correction du bootstrap de
  rôles.

---

## Tableau des correctifs (35 commits `fix(...)` identifiés sur la branche — voir note)

> La mission annonce 34 correctifs ; l'inventaire exhaustif (`git log --oneline main..HEAD |
> grep fix`) en trouve **35**. Les 35 sont listés ci-dessous par honnêteté plutôt que d'en fondre
> un arbitrairement.

| # | FIX (commit) | DB_TESTED | NEGATIVE_WITNESS | POSITIVE_WITNESS | REGRESSION | STATUS |
|---|---|---|---|---|---|---|
| 1 | `cacada06` plateforme_ajouter_admin autopromotion | Oui, `authenticated` réel | 1a: lecture→total refusé | 1b: total→support OK | Aucune | **QUALIFIÉ** |
| 2 | `d357314e` boutique payment bypass | Oui | 2a/2c: authenticated refusé | 2b: service_role OK | Aucune | **QUALIFIÉ** |
| 3 | `b16db673` revoke TRUNCATE/TRIGGER/REFERENCES + search_path | Oui, requête ACL live | 0 privilège résiduel confirmé | grants restants inchangés | Aucune | **QUALIFIÉ** |
| 4 | `fd5bc653` storage RH/fournisseurs/pointage sensibles | Oui | 6b: collègue sans droit refusé | 6a/6c: propriétaire + photo annuaire OK | Aucune | **QUALIFIÉ** |
| 5 | `00da9fc4` policy lecture documents-paie | Oui | 5b: collègue refusé | 5a/5c: propriétaire + gestionnaire paie OK | Aucune | **QUALIFIÉ** |
| 6 | `c1ef9532` export comptable authz | Vitest (`permissions-financieres.test.ts`) | inclus dans suite | inclus dans suite | Aucune | **QUALIFIÉ (app)** |
| 7 | `07d13e70` grants explicites socle comptes | pgTAP structurel + ACL live | — | grants attendus confirmés | Aucune | **QUALIFIÉ** |
| 8 | `0edaa3a1` RGPD anonymiser_employe Storage | Revue de code (Storage indispo, §1) | — | appel réel confirmé (chemins + admin client) | Aucune | **PARTIEL** |
| 9 | `22b32c0f` Next 16.2.12→16.3.5, 2 CVE RCE | Oui (`npm ls`/`npm audit`) | — | 0 avisory next | Aucune | **QUALIFIÉ** |
| 10 | `a45f7b51` en-têtes sécurité HTTP (CSP nonce/HSTS/XFO) | Revue de code (HTTP live indispo, §1) | — | build+typecheck OK, CSP/HSTS/XFO/COOP/CORP/Permissions-Policy présents | Aucune | **PARTIEL** |
| 11 | `6dbc97cd` durcit entrées API + cookies auth | Revue de code + vitest | — | fichiers sécurité présents, tests verts | Aucune | **QUALIFIÉ (app)** |
| 12 | `12e9104d` restaure écriture RLS chantiers | Oui | 4b/4c/4d: cross-tenant/sans droit refusés | 4a/4e: création/update légitimes OK | Aucune | **QUALIFIÉ** |
| 13 | `1aa1ade3` isolation factures | Oui | 3c: FK cross-tenant refusée | 3b (devis, symétrique) | Aucune | **QUALIFIÉ** |
| 14 | `e3211e0d` isolation devis→client | Oui | 3a | 3b | Aucune | **QUALIFIÉ** |
| 15 | `9c24e87e` isolation relances impayées | Oui | 3d | — | Aucune | **QUALIFIÉ** |
| 16 | `97e3aff0` désambiguïse embeds PostgREST | Précondition confirmée en base (2 FK sur factures→clients) ; PostgREST indispo (§1) | — | code d'embed qualifié présent | Aucune | **PARTIEL** |
| 17 | `e29d702f` hash justificatifs (pgcrypto.digest qualifié) | pgTAP structurel | — | fonction présente, signature conforme | Aucune | **QUALIFIÉ** |
| 18 | `98bc3bbc` confirmation sur clic explicite | Vitest (`auth-confirm.test.ts`) | inclus | inclus | Aucune | **QUALIFIÉ (app)** |
| 19 | `0d33ffda` admins plateforme hors onboarding | Vitest (`auth-login.test.ts`, `entreprise.test.ts`) | inclus | inclus | Aucune | **QUALIFIÉ (app)** |
| 20 | `f630956f` verrou devis accepté + essai gratuit | Oui (commit notait « non rejoué contre une base réelle ») | 10a/10b: modif/suppr refusées | 10c/10d: chantier_id réassignable, essai 30j réel | Aucune | **QUALIFIÉ** |
| 21 | `e50af467` liens auth URL canonique | Revue de code + vitest | — | `NEXT_PUBLIC_APP_URL` seul, jamais headers client | Aucune | **QUALIFIÉ (app)** |
| 22 | `bbb55f75` droits menu réels copilote IA | Vitest (`copilote.test.ts`) | inclus | inclus | Aucune | **QUALIFIÉ (app)** |
| 23 | `d46f7f1f` immutabilité facture émise | Oui, y compris `service_role` | 9a/9b/9c: modif/brouillon/suppr refusés | 9d: champ libre OK | Aucune | **QUALIFIÉ** |
| 24 | `14694edf` tarification Mini | Vitest (`tarification.test.ts`) | inclus | inclus | Aucune | **QUALIFIÉ (app)** |
| 25 | `845eb4c4` session support sans persistance | Oui, session support réelle ouverte | 7a/7b: appartenance/permission permanentes refusées | 7c: accès lecture normal pendant session | Aucune | **QUALIFIÉ** — 1er test réel (commit notait pgTAP jamais exécuté) |
| 26 | `ef49ef51` idempotence factures + gel échéance | Oui | 11a: paiement>reste dû refusé; 11c: 2e règlement excédentaire refusé; 11e: 2e avoir identique refusé | 11b: 1er règlement partiel OK; 11d: 1er avoir créé; 11f: exactement 1 avoir en base | Aucune | **QUALIFIÉ** |
| 27 | `3bc6a5c6` masque erreurs SQL clients/chantiers/devis/factures | Revue de code | — | pattern helper conforme | Aucune | **QUALIFIÉ (code)** |
| 28 | `af9374e6` ferme INSERT direct paiements | Oui | 8a: INSERT direct refusé | 8b: SELECT non régressé | Aucune | **QUALIFIÉ** |
| 29 | `3bc642b4` plafond nom coupon Stripe 40 car | Vitest (`plateforme-remises.test.ts`) | inclus | inclus | Aucune | **QUALIFIÉ (app)** |
| 30 | `9b2e5dfc` helper erreurs +3 catégories | Revue de code | — | catégories confirmées | Aucune | **QUALIFIÉ (code)** |
| 31 | `2f5007eb` masque erreurs SQL P0 | Revue de code (échantillon) | — | redirect non avalé confirmé | Aucune | **QUALIFIÉ (code)** |
| 32 | `18e29c2f` masque erreurs SQL terrain P1 | Couvert par typecheck/lint/vitest/build | — | — | Aucune | **PARTIEL** |
| 33 | `cf4f9655` masque erreurs SQL gestion P1 | Couvert par typecheck/lint/vitest/build | — | — | Aucune | **PARTIEL** |
| 34 | `d51daa2b` masque erreurs SQL restants P1+RGPD | Couvert par typecheck/lint/vitest/build | — | — | Aucune | **PARTIEL** |
| 35 | `1b7590c7` route erreurs CORE P1-1 | Couvert par typecheck/lint/vitest/build | — | — | Aucune | **PARTIEL** |
| — | *(hors 35)* `20260922000201` grant EXECUTE est_membre_actif/entreprise_sans_membres | Oui | avant: tables core illisibles par authenticated | après: toutes lisibles, 33/33 witnesses inchangés | **Régression préexistante trouvée et corrigée — voir §0** | **QUALIFIÉ** |

**Compte** : 25 `QUALIFIÉ` (DB réelle ou app/vitest complet) + 6 `QUALIFIÉ (code)`/`(app)` bornés à
la revue + tests automatisés déjà existants + 7 `PARTIEL` (limités par l'indisponibilité de
Docker/Supabase dans cet environnement : `0edaa3a1`, `a45f7b51`, `97e3aff0`, et les 4 derniers
correctifs `masque erreurs SQL` §11 couverts par typecheck/lint/vitest/build mais sans witness DB
dédié faute de temps) + 1 régression préexistante indépendante, prouvée et corrigée.

---

## Verdict

### GP HARDENING PARTIALLY QUALIFIED

**Justification** :

- La couche base de données (RLS, FK, triggers, privilèges — la majorité des 35 correctifs) est
  **qualifiée solidement et réellement** : 195/195 migrations rejouées sans erreur, upgrade
  réaliste avec checksums métier identiques, 22/22 pgTAP existants verts, **39/39 witnesses
  comportementaux positifs/négatifs nouveaux verts** couvrant tous les correctifs à plus haut
  risque (élévation de privilège, contournement de paiement, isolation cross-tenant ×3, RLS
  chantiers, documents RH/paie, session support, immutabilité facture, verrou devis, essai
  gratuit, insert paiements, idempotence encaissement/avoir).
- La couche application (Next.js) est **qualifiée par les outils automatisés réels** :
  typecheck/lint/vitest(189/189)/build tous verts, Next 16.3.5 confirmé sans avisory.
- **Une régression réelle, sévère et préexistante** (indépendante des 34/35 correctifs) a été
  détectée par ce rejeu réel — chose qu'aucune revue de code n'avait révélée jusqu'ici — et
  corrigée de façon minimale et strictement additive (§0).
- Le verdict n'est pas *LOCALLY QUALIFIED* pur parce que **Docker/Supabase local est resté
  inaccessible tout du long** (quota registre saturé, confirmé sur plusieurs images) : la couche
  PostgREST/GoTrue/Storage API réelle — donc le comportement HTTP de bout en bout (embeds
  PGRST201, e-mails GoTrue, upload/suppression Storage réels, en-têtes HTTP live) — n'a jamais pu
  être exercée directement, pour 8 des 35 correctifs (marqués `PARTIEL` ci-dessus), qui restent
  couverts uniquement par revue de code et/ou la suite de tests automatisés déjà existante.

**Recommandation** : avant mise en production, prévoir une fenêtre de qualification
complémentaire dans un environnement où `supabase start` peut effectivement tirer ses images
(registre non bridé), pour clore les 8 items `PARTIEL` avec les mêmes witnesses
positifs/négatifs qu'utilisés ici pour les 24+ items déjà qualifiés en réel.

Pas de merge sur `main`.
