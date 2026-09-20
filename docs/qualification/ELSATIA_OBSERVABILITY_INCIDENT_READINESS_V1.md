# ELSATIA — Qualification observabilité & readiness incident (v1)

_Revue du 20 septembre 2026. Branche `ops/observability-incident-readiness-v1`, base : `main`
(aucun train GP/DR/security/convergence/Preview distinct n'existe dans ce dépôt au moment de la
revue — un seul `main` et la branche de travail en cours — `BASE_FALLBACK_NON_CANONICAL` documenté
et assumé)._

_Périmètre : observabilité et readiness opérationnelle uniquement. Aucune fonctionnalité métier
n'a été ajoutée. Les correctifs appliqués sont limités aux bugs explicitement dans le périmètre
de la mission (webhook Stripe : ordre marquage/traitement) ou strictement additifs et sans risque
comportemental (journalisation, corrélation, healthcheck, distinction de codes d'erreur déjà
renvoyés)._

Note de méthode : le fichier `AGENTS.md` du dépôt renvoie vers
`node_modules/next/dist/docs/` pour des « changements cassants » de Next.js. Ce chemin n'existe
pas dans ce checkout (`node_modules` a dû être réinstallé via `npm ci`, aucun répertoire `docs`
n'existe sous `next/dist`). Cette revue ne s'appuie donc que sur le code réellement présent dans
le dépôt (y compris de vraies différences constatées, ex. `src/lib/supabase/proxy.ts` qui joue le
rôle d'un `middleware.ts` sous ce nom dans cette base), jamais sur ce renvoi.

Verdict global : **PILOT INCIDENT READY** (voir section Verdict en fin de document).

---

## INVENTORY

Cartographie des signaux existants **avant** cette revue (état constaté, pas after-fix) :

| Composant | Signal existant avant revue | Persisté ? | Corrélable ? | Exploitable ? |
|---|---|---|---|---|
| Logs serveur (routes API, actions, libs) | **Aucun** — zéro `console.*` dans tout `src/` et `supabase/` | Non | Non | Non |
| Sentry (serveur/edge/client) | `Sentry.init` configuré (`sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`), mais seul appel manuel : `global-error.tsx` (rendu React racine) + hook automatique `onRequestError` (exceptions non interceptées uniquement) | Oui (Sentry) | Non (aucun tag requestId/entrepriseId) | Partiellement — ne voit que ce qui n'est pas déjà attrapé par un `try/catch` renvoyant un JSON |
| Audit métier (`journal_audit_paie`, `ajouterAudit`/RGPD notes de frais, journal IA) | Existant, en base | Oui | Par entité métier, pas par requête | Oui pour la conformité, pas pour l'incident technique |
| Webhooks Stripe (facture, boutique, abonnement) | Tables `stripe_webhook_events` / `abonnement_evenements` (dédup uniquement) | Oui (dédup seule) | Par `id` d'évènement Stripe | Non — aucune colonne de statut de traitement avant cette revue |
| Jobs/cron (`/api/cron/abonnements`, `/api/cron/notifications-push`) | Résultat renvoyé uniquement dans le corps JSON HTTP | Non | Non | Non — invisible dès que personne n'inspecte la réponse |
| Auth (`auth.getUser()`, ~10 sites) | Erreur systématiquement ignorée | Non | Non | Non — service indisponible et session expirée indiscernables |
| Storage (`.storage.from(...)`, 60+ sites) | Erreur générique → 503 pour la plupart des téléchargements | Non | Non | Non — 404 métier et panne réelle indiscernables |
| RPC (accès, permissions) | 3 RPC identifiées à échec silencieux (`est_plateforme_admin`, `contexte_acces_proxy`, `est_compte_depot_courant`) | Non | Non | Non |
| Frontend (erreurs React/Next) | Un seul boundary : `global-error.tsx` (racine `<html>`) | Sentry uniquement | Non | Partiel — toute la coquille disparaît pour une erreur de page |
| Email | Aucun fournisseur transactionnel (voir section EMAIL) ; seul flux réel = `resetPasswordForEmail` (Supabase Auth) | Non | Non | Non |
| Healthcheck | **Aucun endpoint** | — | — | — |
| Sécurité (RLS, isolation, chiffrement IBAN) | Couverte par `docs/AUDIT_SECURITE.md` (hors périmètre de cette revue, déjà auditée et jugée conforme le 18 juillet 2026) | — | — | — |

Conclusion de l'inventaire : avant cette revue, **l'application n'émettait aucun signal
d'exploitation en dehors de Sentry (best-effort) et des réponses JSON HTTP éphémères**. Un
incident (webhook silencieusement perdu, cron mort, auth dégradée) n'était visible qu'en
interrogeant manuellement chaque table ou en relisant le code — exactement le risque que la
mission demande de qualifier.

---

## STRUCTURED LOGGING

### Ajouts

- `src/lib/observability/logger.ts` : journal structuré minimal.
  - Niveaux : `info` / `warn` / `error` / `critical` (section Alerting).
  - Taxonomie (`CategorieLog`) : `security`, `billing`, `document`, `data`, `auth`, `storage`,
    `email`, `worker`, `platform`.
  - Chaque ligne est un JSON unique sur `console.info`/`warn`/`error` (capté nativement par les
    logs Vercel, sans dépendance supplémentaire) avec `timestamp`, `niveau`, `categorie`,
    `message`, et le contexte fourni (`requestId`, `userId` pseudonymisé, `entrepriseId`, `route`,
    `operation`, `statusCode`, `durationMs`, ...).
  - `error`/`critical` sont systématiquement relayés vers Sentry (`captureException` /
    `captureMessage`) avec les mêmes tags (`categorie`, `niveau`, `requestId`, `entrepriseId`,
    `route`), pour corréler un évènement Sentry avec la ligne de log correspondante.
  - **Rédaction automatique** avant toute écriture : les clés de contexte connues comme sensibles
    (`password`, `token`, `secret`, `authorization`, `cookie`, `iban`, `api_key`, `client_secret`,
    `stripe_secret`, `dsn`, ...) sont remplacées par `[redacted]`, et les motifs texte à risque
    (JWT, IBAN, clé Stripe `sk_`/`rk_`/`whsec_`) sont masqués même s'ils apparaissent dans un
    message libre plutôt que dans une clé nommée. Testé (`logger.test.ts`, section TESTS).
  - `userId` est pseudonymisé (hash stable non cryptographique, suffisant pour corréler deux
    lignes sans exposer l'UUID en clair) avant journalisation.
- `src/lib/observability/request-id.ts` : corrélation minimale et volontairement non invasive.
  Pas de `middleware.ts` global (la base n'en a pas et il aurait fallu le faire courir sur *toutes*
  les routes, refonte disproportionnée pour cette mission) — un identifiant est engendré (ou
  repris de `x-request-id`/`x-vercel-id` s'il existe déjà) explicitement dans les points d'entrée
  qui le justifient le plus : les 3 webhooks Stripe, les 2 crons, le healthcheck.

### Où c'est branché

Webhooks Stripe (3/3), crons (2/2), `/api/healthz`, `auth.getUser()` (proxy + `getContexteEntreprise`),
RPC d'accès (`est_plateforme_admin`, `contexte_acces_proxy`), téléchargements Storage à risque
(documents, photo employé, justificatif note de frais), envoi du seul e-mail transactionnel réel
(réinitialisation de mot de passe), boundaries d'erreur frontend.

### Ce qui n'a délibérément pas été touché

Les ~410 fichiers `src/` ne comportaient aucun `console.*` à « convertir » — il n'y avait rien à
migrer, uniquement à ajouter aux points de plus forte valeur listés ci-dessus. Convertir
systématiquement les ~20 `catch` restants (uploads, actions plateforme, exports paie, etc.) au
logger est un chantier mécanique à faible risque, volontairement laissé en `OPEN RISKS` plutôt
que fait en masse cette nuit, pour ne pas produire un diff de nuit incontrôlable sur des dizaines
de fichiers non testés unitairement au préalable.

### Sécurité des logs

Voir section SECURITY.

---

## HEALTHCHECKS

Aucun endpoint n'existait. Ajouté : **`GET /api/healthz`** (`src/app/api/healthz/route.ts`),
public dans `src/lib/supabase/proxy.ts` (chemin ajouté à `PUBLIC_PATHS` et
`CHEMINS_SANS_SESSION` pour éviter un aller-retour de session inutile à chaque ping de moniteur).

Composants vérifiés, chacun UP / DEGRADED / DOWN (jamais un simple `200 OK` binaire) :

| Composant | Méthode de vérification | DOWN si | DEGRADED si |
|---|---|---|---|
| `db` | `select` `head` sur `entreprises` (aucune ligne renvoyée, juste la connectivité + RLS service-role) | Erreur ou délai > 4 s | — |
| `storage` | `storage.listBuckets()` | Erreur ou délai > 4 s | — |
| `auth` | `auth.admin.listUsers({page:1, perPage:1})` (API admin, vérifie le service Auth lui-même, pas juste une session) | Erreur ou délai > 4 s | — |
| `stripe` | Config uniquement (`stripeEstConfigure()`, pas d'appel réseau pour ne pas consommer de quota) | — | Variables absentes |
| `email` | Dépend entièrement de `auth` (aucun fournisseur dédié, cf. section EMAIL) | hérite de `auth` | si `auth` non `up` |
| `push` | Config uniquement (clés VAPID) | — | Clés absentes |
| `jobs` | Lit `job_runs` (36 h glissantes) : les 2 jobs attendus (`cron:abonnements`, `cron:notifications-push`) ont-ils tourné, et sans `echec` | Aucune exécution récente ou dernière en échec | — |

Agrégation : `db` et `auth` sont critiques → `down` global si l'un des deux l'est ; sinon
`degraded` si un seul composant n'est pas `up` ; `up` seulement si tout est vert. Code HTTP :
`200` (up/degraded), `503` (down) — pour qu'un moniteur externe basique (qui ne lit que le
statut HTTP) déclenche déjà une alerte correcte sans même parser le JSON.

Anti-fuite : la réponse publique ne contient que l'état par composant (`up`/`degraded`/`down`),
jamais un message d'erreur. Le détail (message d'erreur exact, durée) n'est renvoyé que si
l'appelant présente `Authorization: Bearer $HEALTHCHECK_SECRET` (variable à définir en
Preview/Production, même modèle que `CRON_SECRET`) — sinon la variable est absente et `autorise`
reste `false`, donc **aucun détail interne n'est exposé tant que le secret n'est pas configuré**.

Toute transition vers un état non-`up` est elle-même journalisée (`logErreur("platform", ...)`),
donc visible dans Sentry sans dépendre d'un moniteur externe qui interrogerait l'URL.

---

## WEBHOOKS

Trois endpoints, tous vérifiés indépendamment (signature Stripe HMAC-SHA256 avec tolérance
d'horodatage 300 s, `timingSafeEqual` — `src/lib/stripe.ts`) :

| Endpoint | Secret | Table de dédup | État avant revue | État après revue |
|---|---|---|---|---|
| `src/app/api/stripe/webhook/route.ts` (factures + Connect `account.updated`) | `STRIPE_WEBHOOK_SECRET` | `stripe_webhook_events` | **Bug confirmé** (voir ci-dessous) | Corrigé |
| `src/app/api/stripe/boutique/webhook/route.ts` | `STRIPE_WEBHOOK_BOUTIQUE_SECRET` | `stripe_webhook_events` (partagée) | **Bug confirmé** (même défaut) | Corrigé |
| `src/app/api/stripe/abonnement/webhook/route.ts` | `STRIPE_WEBHOOK_ABONNEMENT_SECRET` | `abonnement_evenements` | Déjà correct | Renforcé (log) |

### Le bug historique nommé par la mission

**Confirmé, exactement comme suspecté** : dans les deux premiers endpoints, la ligne de
déduplication était insérée en base (marquage « reçu ») **avant** l'exécution du traitement
métier, sans `try/catch`. Un échec (appel Supabase en erreur, exception réseau) pendant le
traitement remontait comme exception non gérée → 500 → Stripe retente → mais la nouvelle
tentative rencontre la contrainte d'unicité sur l'`id` d'évènement, reçoit `23505`, et répond
`{received:true, duplicate:true}` **sans jamais rejouer le traitement**. Le paiement enregistré
ou la facture marquée payée restaient donc silencieusement absents pour toujours, malgré un
Stripe Dashboard indiquant l'évènement comme « livré avec succès ».

Le troisième endpoint (`abonnement`) avait déjà le bon patron : traitement dans un `try`, et en
cas d'échec, **suppression** de la ligne de dédup dans le `catch` avant de renvoyer 500 — ce qui
permet à Stripe de rejouer l'évènement en entier au prochain essai.

### Correctif appliqué

Les deux endpoints en défaut (`stripe/webhook`, `stripe/boutique/webhook`) reprennent
exactement le patron de `abonnement/webhook` : traitement métier encapsulé dans un `try`, et en
cas d'exception, suppression de la ligne `stripe_webhook_events` fraîchement insérée + log
structuré (`categorie: "billing"`, niveau `error`, avec `requestId`/`operation`/identifiant
métier) + réponse 500. Un nouvel essai Stripe peut donc de nouveau s'insérer et retraiter
l'évènement en entier. Ce choix (suppression, pas une colonne de statut à part) reprend
volontairement la convention déjà éprouvée dans cette base plutôt que d'introduire un second
mécanisme — l'audit de l'échec lui-même vit désormais dans Sentry/les logs plutôt que dans la
ligne supprimée.

### Autres scénarios audités

- **Doublon** : couvert par la contrainte d'unicité sur l'`id` Stripe (`23505`) dans les 3
  endpoints → réponse `{received:true, duplicate:true}`, comportement correct et inchangé.
- **Ordre inversé** (ex. `customer.subscription.updated` après `.deleted`) : **non couvert** —
  aucune vérification de version/séquence sur `data.object`, dernier écrit gagne. Risque réel
  mais rare (Stripe garantit un ordre de livraison "best effort", pas garanti à 100 %) —
  documenté en `OPEN RISKS`, correction hors périmètre observabilité (nécessiterait de stocker et
  comparer un numéro de version métier, donc une évolution de schéma/logique de synchronisation).
- **Timeout / crash après journalisation** : c'est exactement le bug corrigé ci-dessus.
- **Évènement inconnu** (aucun des `if` ne correspond) : ne déclenchait aucune erreur ni aucun
  log avant revue (retour 200 silencieux). Désormais journalisé (`logInfo`) dans les deux
  endpoits facture/boutique, pour distinguer « rien à faire » de « on a oublié un cas ».
- **Signature invalide** : 400 dans les 3 endpoints (inchangé), désormais aussi journalisé
  (`logWarn`, catégorie `security`) — un pic de signatures invalides peut signaler une
  tentative d'usurpation du endpoint webhook.
- **Stripe Connect** : géré uniquement par l'endpoint facture (`account.updated`, vérification
  `entreprise.stripe_account_id === evenement.account`). L'endpoint abonnement **rejette**
  explicitement les évènements Connect (`account` présent → 400). L'endpoint boutique ne
  vérifie pas `account` du tout — écart mineur, sans évènement Connect métier attendu sur ce
  flux ; noté en `OPEN RISKS`.

---

## JOBS

Deux crons Vercel seulement (`vercel.json`), chacun regroupant plusieurs sous-tâches (limite du
plan Vercel Hobby sur le nombre de crons, commentaire explicite dans le code) :

| Job | Fréquence | Idempotent | Timeout | Retry | Observé (avant → après) | Alertable |
|---|---|---:|---:|---:|---|---:|
| `cron:abonnements` → réconciliation Stripe par entreprise | `15 3 * * *` | Oui (clés d'idempotence Stripe stables pour ce sous-job) | Aucun `maxDuration` défini | Non (boucle `try/catch` par entreprise, continue) | JSON éphémère → **`job_runs` + logs + 200/207/500 selon échecs** | Oui (statut HTTP + ligne `job_runs`) |
| même route → conversion essais Option IA expirés | idem | **Non** — clé d'idempotence Stripe inclut `Date.now()` (`stripe-abonnement.ts:331`) → un rejeu avant que `option_ia_statut` ne bascule peut ajouter deux fois la ligne Stripe | idem | par élément, continue | idem (agrégé dans le même run) | idem |
| même route → synchronisation périodes de paie ouvertes | idem | Dépend de la RPC appelée (non auditée en profondeur) | idem | par élément | idem | idem |
| même route → alertes pointage manquant/à valider | idem | Oui (garde SQL `not exists ... = current_date`) | idem | n/a | idem | idem |
| `cron:notifications-push` (filet de secours, fenêtre 25 h) | `45 3 * * *` | Oui (`push_envoyee_at` vérifié puis toujours posé en `finally`) | Aucun `maxDuration`, boucle séquentielle jusqu'à 200 lignes | Non (échec réel marqué comme traité quand même, pour éviter une boucle infinie) | idem | idem |

### Correctifs appliqués (observabilité uniquement, aucune logique métier changée)

- **Migration `job_runs`** (`supabase/migrations/20260920000184_observabilite_job_runs.sql`) :
  table dédiée au rôle de service (aucun accès `anon`/`authenticated`, RLS activée sans policy —
  même modèle que `stripe_webhook_events`). Une ligne par exécution : `job_name`, `request_id`,
  `started_at`/`finished_at`, `statut` (`en_cours`/`succes`/`echec_partiel`/`echec`), `duree_ms`,
  `resume` (JSON), `erreur`.
- `src/lib/observability/job-run.ts` : `demarrerJobRun` / `terminerJobRun`, branché dans les deux
  routes cron. Permet de répondre à « ce job tourne-t-il encore ? » sans dépendre du corps HTTP
  (interrogé par `/api/healthz`, composant `jobs`, fenêtre glissante de 36 h).
- **Les deux routes cron renvoyaient toujours `200`, même quand *tous* les éléments du lot
  échouaient** — un moniteur de cron qui ne regarde que le statut HTTP (y compris le monitoring
  natif de Vercel Cron) ne pouvait donc jamais détecter un échec total. Corrigé : `cron:abonnements`
  calcule désormais un taux d'échec global et répond `200` (succès), `207` (échec partiel) ou `500`
  (échec total) ; `cron:notifications-push` répond `500` si la requête initiale échoue.
- **Push** (`src/lib/push.ts`) : un échec d'envoi réel (ni 404 ni 410, donc pas un abonnement mort)
  était avalé silencieusement par le `try/finally` qui marque toujours la notification comme
  traitée (comportement **conservé** — le changer créerait un risque de boucle de retentative
  infinie, hors périmètre de cette mission). Désormais journalisé (`logWarn`, catégorie `worker`)
  avant d'être marqué traité : la notification reste invisible au destinataire, mais plus à
  l'équipe d'exploitation.

### Risques encore ouverts (non corrigés — hors périmètre observabilité, documentés)

- **Aucun verrou/avisory lock nulle part** dans la base (`supabase/migrations`, aucune occurrence
  de `advisory_lock` ni `for update skip locked`). Si un même cron est déclenché deux fois en
  parallèle (rejeu manuel + planification, ou double appel), la conversion Option IA peut créer
  une double facturation Stripe réelle (clé d'idempotence non stable, voir tableau ci-dessus).
  **C'est un bug de correction métier**, pas un manque d'observabilité : il n'a pas été corrigé
  ici (la mission exclut toute nouvelle fonctionnalité métier et ce n'est pas le bug webhook
  explicitement nommé), mais il est signalé en tête des `OPEN RISKS` car son impact financier est
  réel.
- Aucun `maxDuration` défini sur les deux routes cron malgré plusieurs sous-tâches séquentielles.

---

## EMAIL

Constat confirmé par la revue : **il n'existe aucun fournisseur transactionnel intégré** (aucune
dépendance Resend/SendGrid/Nodemailer/SES dans `package.json`, aucun appel réseau vers un tel
service dans `src/`). Le bouton « e-mail » (`src/components/EmailDocumentButton.tsx`) ouvre un
lien `mailto:` dans le client de messagerie de l'utilisateur — l'application n'envoie rien
elle-même, il n'y a donc rien à instrumenter côté fournisseur pour ce flux. `connexions_email`
et `emails_chantier` ne stockent que de la configuration/archivage manuel, pas des envois.

Le **seul** envoi d'e-mail réellement déclenché par l'application est délégué à Supabase Auth :
`resetPasswordForEmail` (réinitialisation de mot de passe, `src/app/actions/auth.ts`). Avant
revue, seule l'absence/présence d'une erreur synchrone était utilisée pour un message
utilisateur — rien n'était journalisé côté serveur, donc rien ne remontait à Sentry (l'appel
utilise `redirect()`, jamais une exception).

Correctif : distinction explicite journalisée dans `demanderReinitialisationAction`
(`src/app/actions/auth.ts`) —

- `error` présent → `logErreur("email", "EMAIL_NOT_SENT — échec resetPasswordForEmail", ...)` :
  panne du fournisseur, quota, configuration SMTP Supabase absente.
- pas d'erreur → `logInfo("email", "EMAIL_ACCEPTED_BY_PROVIDER — resetPasswordForEmail", ...)` :
  Supabase a accepté la demande d'envoi — **ne prouve pas** la remise réelle en boîte de
  réception (pas de webhook de délivrabilité configuré côté Supabase dans ce projet).

Aucune table de suivi des envois n'existe (et n'a pas été créée : sans fournisseur dédié, une
table `email_log` n'aurait qu'une seule ligne de flux à tracer — les logs structurés suffisent
pour ce périmètre). À réévaluer si un fournisseur transactionnel dédié est introduit plus tard
(devis/factures par e-mail direct) : cette instrumentation devra être reproduite systématiquement
à ce moment-là (voir `OPEN RISKS`).

---

## AUTH

`auth.getUser()` est appelé à ~10 endroits, et **partout** le champ `error` était ignoré avant
cette revue : Auth indisponible, JWT expiré, refresh token invalide/révoqué, utilisateur
supprimé finissaient tous dans le même `if (!user) redirect("/login")`, strictement
indiscernables. Aucune MFA implémentée (aucune occurrence de `mfa`/`totp`/`aal2`), donc rien à
distinguer sur ce point précis.

Correctif appliqué aux deux points de passage les plus centraux (couvrent l'essentiel du
trafic authentifié) :

- `src/lib/supabase/proxy.ts` (équivalent du middleware, exécuté sur chaque requête protégée) ;
- `src/lib/entreprise.ts` → `getContexteEntreprise()` (appelée par la quasi-totalité des pages
  de l'espace applicatif).

`src/lib/observability/auth-log.ts` classe l'erreur : les codes attendus en usage normal
(`session_not_found`, `refresh_token_not_found`, `refresh_token_already_used`, `bad_jwt`,
`session_expired`, `user_not_found`) donnent un `logWarn` (catégorie `auth` — rien d'anormal,
juste une session à renouveler) ; tout le reste (erreur réseau, service Auth indisponible, code
non reconnu) donne un `logErreur` relayé vers Sentry. **Le comportement utilisateur (redirection
vers `/login`) est strictement inchangé** — seule la visibilité change.

Même traitement pour la RPC `contexte_acces_proxy` (appelée à chaque requête protégée dans le
proxy) et `est_plateforme_admin` (`src/lib/plateforme.ts`) : leur échec continue de refuser
l'accès par défaut (comportement le plus prudent, inchangé), mais est désormais journalisé en
catégorie `security` — un pic soudain de ces refus peut désormais signaler une panne DB plutôt
qu'une simple absence de droits, ce qui était totalement invisible avant.

`est_compte_depot_courant` (utilisée dans `stock/borne/page.tsx`, à l'intérieur d'un
`Promise.all` avec 5 autres requêtes) n'a **pas** été instrumentée par cohérence de risque : la
modifier isolément dans un bloc de déstructuration partagé aurait un rapport
risque/valeur moins favorable que les deux points ci-dessus, qui couvrent l'essentiel du trafic.
Noté en `OPEN RISKS`.

---

## STORAGE

60+ sites d'appel `.storage.from(...)`. Le point faible identifié : plusieurs routes de
téléchargement (`documents/[id]`, `employes/[id]/photo`, `notes-frais/[id]/justificatif`)
renvoyaient un **503 générique** pour *toute* erreur Storage après confirmation que la ligne
DB existe bien — un objet réellement absent (déjà supprimé, chemin invalide) était donc
indiscernable d'une vraie panne réseau/service.

Correctif : `src/lib/observability/storage-error.ts` (`reponseErreurStorage`) inspecte
`error.status`/`error.statusCode` renvoyés par le SDK Storage (`StorageApiError`) pour distinguer
un 404 réel (`status === 404` ou `statusCode` en `not_found`/`nosuchkey`/`object_not_found`) —
renvoyé tel quel avec un message « introuvable » et un `logWarn` — d'une vraie panne, renvoyée en
503 avec un `logErreur` (catégorie `storage`, relayé Sentry). Appliqué aux 3 routes identifiées
ci-dessus ; les autres sites d'upload (avec nettoyage d'objet orphelin en cas d'échec d'insertion
DB, déjà correctement implémenté dans `src/app/actions/documents.ts` et équivalents) n'avaient pas
ce défaut et n'ont pas été touchés.

**Non corrigé, documenté en `OPEN RISKS`** : `supprimerDocumentChantierAction` supprime l'objet
Storage *avant* la ligne DB ; si la suppression DB échoue ensuite, la ligne survit en pointant
vers un objet déjà supprimé (orphelin en sens inverse). C'est un bug de robustesse applicative,
pas un manque d'observabilité pure — corriger l'ordre change un comportement métier (transaction
implicite), hors périmètre strict de cette mission, mais à traiter rapidement vu son impact
(document visible en base mais introuvable en téléchargement, désormais au moins correctement
renvoyé en 404 grâce au correctif ci-dessus plutôt qu'en 503 trompeur).

---

## INCIDENT SIMULATION

Contrainte d'environnement : **Docker n'est pas disponible dans ce sandbox distant**
(`docker ps` → `dial unix /var/run/docker.sock: connect: no such file or directory`), donc
`supabase db reset` / pgTAP / une vraie extinction de conteneur DB local sont **impossibles ici**
→ `BLOCKED_ENVIRONMENT` pour la partie infrastructure vivante de cette section, conformément à la
règle d'autonomie (documenté, on continue le reste). Ce qui suit est donc une simulation
**analytique**, page de code à l'appui, des 7 scénarios demandés — à rejouer réellement sur
Preview avant tout verdict de mise en production (voir Verdict).

1. **DB down** — `admin.from(...).select(...)` échoue partout où c'est appelé. `/api/healthz`
   détecte l'échec du composant `db` en < 4 s (timeout `avecDelai`) → `down` global → 503, avec
   log `logErreur("platform", ...)`. Les pages qui dépendent de `getContexteEntreprise()`
   échoueraient sur la requête `utilisateurs`/`contexte_abonnement_courant` avec une exception
   non interceptée → remonte au boundary `error.tsx` le plus proche (nouveau, cf. section
   frontend) au lieu de faire disparaître toute la coquille comme avant revue.
2. **Storage down** — `/api/healthz` détecte via `storage.listBuckets()`. Les 3 routes de
   téléchargement corrigées renvoient 503 + log `error` (pas un 404 trompeur). Les routes non
   corrigées (upload avec nettoyage d'objet orphelin) échoueraient sur l'appel `storage.remove`
   sans changement de ce comportement (hors périmètre).
3. **Email down** (Auth/SMTP Supabase) — `demanderReinitialisationAction` journalise
   `EMAIL_NOT_SENT` avec le message d'erreur Supabase, relayé Sentry (niveau `error`).
   `/api/healthz` reflète `email: degraded/down` en miroir de `auth`.
4. **Stripe timeout** — Le webhook concerné (facture ou boutique) lèverait une exception dans le
   bloc `try` (ex. écriture DB échouée suite à un état incohérent) : la ligne de dédup est
   supprimée, `logErreur("billing", ...)` avec `operation`/`requestId`, 500 renvoyé → Stripe
   retente automatiquement selon sa politique de retry exponentiel. C'est exactement le
   comportement corrigé par cette revue (avant : silencieusement perdu au 2ᵉ essai).
5. **RPC erreur** — `est_plateforme_admin`/`contexte_acces_proxy` : accès refusé par défaut
   (fail-safe, inchangé) + `logErreur("security", ...)`. Un pic de ces lignes dans Sentry pendant
   un DB down serait immédiatement visible et distinguable d'une attaque (rôle : `contexte`
   contiendra `route` variées vs ciblées pour une attaque).
6. **Worker/job crash** — Une exception non rattrapée dans une des 4 sous-tâches de
   `cron:abonnements` ferait échouer toute la route (pas de `try` englobant au niveau route,
   uniquement par sous-tâche) : `job_runs` resterait en `en_cours` (jamais clôturé) → `/api/healthz`
   détecterait l'absence d'exécution *terminée* récente au prochain passage (36 h). Amélioration
   possible : envelopper l'ensemble de la route dans un `try/finally` pour toujours clôturer
   `job_runs` même en cas de crash total — noté en `OPEN RISKS` (actuellement seul un crash *par
   sous-tâche* est proprement comptabilisé, pas un crash de la route elle-même avant la première
   sous-tâche).
7. **Job dupliqué (double déclenchement concurrent)** — Aucun verrou. Les sous-tâches
   idempotentes par construction (garde SQL `not exists`, `push_envoyee_at`) résistent ; la
   conversion Option IA ne résiste pas (clé d'idempotence non stable) → risque de double
   facturation réel, déjà signalé en `OPEN RISKS`/section JOBS.

---

## ALERTING

### Niveaux (implémentés dans `logger.ts`)

- `INFO` — évènement normal à valeur d'audit (ex. évènement Stripe reçu sans action requise).
- `WARN` — anomalie attendue/récupérable sans action humaine immédiate (session expirée,
  signature webhook invalide isolée, échec push isolé, objet Storage introuvable).
- `ERROR` — échec ayant un impact réel nécessitant investigation (échec de traitement webhook,
  Auth/RPC en panne, Storage en panne, email non envoyé, job en échec).
- `CRITICAL` — non encore déclenché automatiquement dans le code (réservé, voir contrat
  ci-dessous) : à lever manuellement/par une règle Sentry pour les cas qui menacent
  l'intégrité des données ou des paiements à l'échelle de plusieurs entreprises.

### Taxonomie (implémentée)

`security`, `billing`, `document`, `data`, `auth`, `storage`, `email`, `worker`, `platform`.

### Contrat d'alerte (aucun fournisseur d'alertes n'est connecté — ce contrat définit ce qui
devrait déclencher une alerte le jour où Sentry Alerts / un webhook Slack / PagerDuty est
branché sur le projet Sentry existant) :

| Gravité | Déclencheur | Détection actuelle |
|---|---|---|
| CRITICAL | Paiement Stripe traité de façon incohérente (facture marquée payée sans paiement enregistré, ou l'inverse) | Pas de règle auto — à créer sur les évènements `categorie:billing` + mots-clés d'incohérence ; actuellement visible via les logs `error` de webhook |
| CRITICAL | Fuite d'isolation entre entreprises (une requête renvoie des données d'une autre `entreprise_id`) | Non instrumenté ici (hors périmètre — couvert par `docs/AUDIT_SECURITE.md`, RLS) |
| CRITICAL | Migrations incohérentes entre environnements | `npm run verify:migrations` (CI), pas d'alerte runtime |
| CRITICAL | Service DB inaccessible | `/api/healthz` (`db: down`) — nécessite un moniteur externe actif sur l'URL |
| ERROR | Job cron en échec (total ou partiel) plusieurs fois de suite | `job_runs.statut`, code HTTP 207/500 du cron, `/api/healthz` (`jobs`) |
| ERROR | Webhook Stripe non traité (marque supprimée, 500 renvoyé) | `logErreur("billing", ...)` → Sentry |
| ERROR | Échec Storage réel (pas un 404 métier) | `logErreur("storage", ...)` → Sentry |
| ERROR | Auth/RPC d'accès en panne (pas juste une session expirée) | `logErreur("auth"/"security", ...)` → Sentry |
| WARN | Quota proche (Stripe, Storage, VAPID non configuré) | Partiel (`stripeEstConfigure`, `pushEstConfigure` exposés par `/api/healthz`) — pas de seuil quota consommé |
| WARN | Retry réussi après échec transitoire | Non distingué explicitement d'un succès direct (amélioration possible : logguer une tentative précédente) |
| WARN | Service dégradé (un composant non critique down) | `/api/healthz` (`degraded`) |

Ce tableau est la spécification à câbler sur des règles Sentry (par tag `categorie`/`niveau`) le
jour de la mise en service — voir `OPEN RISKS` pour ce qui reste à connecter.

---

## RUNBOOKS

Format : symptôme → vérification → commande → log → action → rollback → escalade. Les procédures
de déploiement/retour arrière détaillées existent déjà dans `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md`
— les runbooks ci-dessous s'y rattachent sans les dupliquer.

### Stripe (webhook facture/boutique/abonnement)

- **Symptôme** : facture ou commande boutique restée non soldée malgré un paiement Stripe réussi.
- **Vérification** : Stripe Dashboard → Developers → Webhooks → l'endpoint concerné → l'évènement
  → statut de livraison et nombre de tentatives.
- **Commande** : `select * from stripe_webhook_events where id = '<evt_id>'` (absence de ligne =
  le dernier essai a échoué et a été rejoué correctement grâce au correctif de cette revue ; la
  présence de la ligne sans effet métier visible = examiner `abonnement_evenements.statut_resultant`
  ou les tables `paiements`/`factures` directement).
- **Log** : Sentry, filtrer `categorie:billing` + `niveau:error`, fenêtre autour de l'horodatage
  Stripe.
- **Action** : si l'évènement a échoué et Stripe a cessé de retenter (au-delà de sa fenêtre de
  retry), rejouer manuellement l'évènement depuis le Dashboard Stripe (« Resend » sur
  l'évènement) — le correctif de cette revue garantit qu'un rejeu retraite désormais entièrement
  la logique métier.
- **Rollback** : aucun rollback de code nécessaire pour un incident ponctuel ; si le bug est
  causé par un déploiement récent, suivre `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md`.
- **Escalade** : si le montant ou le nombre de factures concernées est significatif, remonter
  avant toute correction manuelle en base (ne jamais corriger `factures`/`paiements` à la main
  sans double validation).

### Base de données (DB down / dégradée)

- **Symptôme** : `/api/healthz` renvoie `db: down` ou 503 global ; pages en erreur générale.
- **Vérification** : Supabase Dashboard → Database → statut ; `curl /api/healthz` avec le secret
  pour le détail exact de l'erreur.
- **Commande** : aucune action destructrice locale (`supabase db reset --linked` interdit en
  production, cf. `docs/CONTROLES_LOCAUX.md`).
- **Log** : Sentry `categorie:platform` + `niveau:error`, message « Healthcheck en état dégradé ».
- **Action** : vérifier le statut Supabase (page de statut officielle), attendre le rétablissement
  ou contacter le support Supabase si prolongé.
- **Rollback** : si un déploiement récent a introduit une migration cassante, voir « Retour
  arrière de la base » dans `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` (jamais de suppression de
  migration déjà appliquée en production).
- **Escalade** : indisponibilité DB généralisée → prévenir les utilisateurs (bannière), suivre les
  critères de retour arrière déjà définis dans ce même document.

### Storage

- **Symptôme** : téléchargements en échec (`/api/healthz` → `storage: down`, ou 503 sur une route
  de document/photo/justificatif corrigée par cette revue).
- **Vérification** : Supabase Dashboard → Storage → statut des buckets concernés
  (`chantier-documents`, `documents-employes`, `notes-frais`, `bulletins-paie`,
  `factures-fournisseurs`, `entreprise-assets`).
- **Log** : Sentry `categorie:storage`, niveau `error` (panne réelle) vs `warn` (404 métier —
  pas un incident).
- **Action** : si un seul bucket est affecté, vérifier ses policies RLS n'ont pas changé (voir
  `docs/AUDIT_SECURITE.md`) avant de suspecter une panne Supabase globale.
- **Rollback** : `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md`.
- **Escalade** : bucket `bulletins-paie`/`factures-fournisseurs` affecté = impact paie/paiement,
  escalade immédiate.

### Auth

- **Symptôme** : connexions impossibles en masse, ou `/api/healthz` → `auth: down`.
- **Vérification** : Sentry `categorie:auth`, niveau `error` (distinct des `warn` de session
  expirée normale grâce au correctif de cette revue) ; Supabase Dashboard → Authentication →
  statut.
- **Log** : `src/lib/observability/auth-log.ts` classe déjà l'anomalie.
- **Action** : si `DISABLE_EMAIL_LOGIN` a été involontairement activé en production, le repasser
  à `false` immédiatement (rappel de `docs/AUDIT_SECURITE.md` : ce mode ouvre l'accès `anon`).
- **Rollback** : `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md`.
- **Escalade** : toute suspicion de fuite via le mode prototype (`anon`) → traiter comme un
  incident de sécurité, pas seulement de disponibilité.

### Email

- **Symptôme** : utilisateurs signalant ne pas recevoir l'e-mail de réinitialisation.
- **Vérification** : Sentry `categorie:email` — `EMAIL_NOT_SENT` (échec Supabase, ex. SMTP non
  configuré) vs `EMAIL_ACCEPTED_BY_PROVIDER` (accepté, donc probablement en spam ou filtré côté
  destinataire — hors du contrôle de l'application).
- **Action** : si `EMAIL_NOT_SENT` en volume, vérifier la configuration SMTP du projet Supabase
  (Dashboard → Authentication → Email templates/SMTP).
- **Escalade** : aucun fournisseur transactionnel dédié à ce jour — un incident structurel sur
  l'e-mail Supabase impacte directement la récupération de compte ; envisager un fournisseur
  dédié si ce point devient critique commercialement (cf. `OPEN RISKS`).

### Migration

- Voir intégralement `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` (section « Retour arrière de la
  base ») et `docs/CONTROLES_LOCAUX.md` — non dupliqué ici. Rappel clé : jamais de
  `supabase db reset --linked` ni d'URL de production pour les tests locaux ; toujours une
  migration corrective idempotente, jamais une suppression de migration déjà appliquée.

### Déploiement

- Voir intégralement `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` — non dupliqué ici. Complément
  apporté par cette revue : après déploiement, vérifier aussi `GET /api/healthz` (avec le secret)
  en plus des contrôles déjà listés (routes publiques/protégées, Sentry).

---

## SECURITY

- Le nouveau logger redige systématiquement (clés nommées + motifs texte JWT/IBAN/clé Stripe)
  avant toute écriture, y compris dans un message libre — validé par 4 tests unitaires
  (`src/lib/observability/logger.test.ts`, voir TESTS). Aucun mot de passe, cookie ou secret n'est
  jamais passé en clair dans les points d'instrumentation ajoutés par cette revue (vérifié
  manuellement site par site en plus des tests génériques de redaction).
- `npm run verify:secrets` (scanner existant du dépôt, motifs clé privée/Stripe/OpenAI/GitHub/JWT)
  passe sur l'intégralité des fichiers suivis **après** ajout de tous les fichiers de cette revue
  (691 fichiers contrôlés, aucun secret détecté).
- Limite assumée : `verify:secrets` scanne les fichiers **suivis par Git**, pas les logs runtime
  produits en production. Le logger structuré est la seule ligne de défense côté runtime — voir
  `OPEN RISKS` pour l'idée d'un test de non-régression sur les nouveaux appels de log ajoutés à
  l'avenir (linter interne ou revue de code ciblée).
- Le healthcheck ne renvoie jamais de détail sans le secret `HEALTHCHECK_SECRET` (absent par
  défaut → aucun détail exposé tant qu'il n'est pas explicitement configuré).
- Pas de nouvelle surface d'attaque introduite : tous les nouveaux endpoints/chemins ajoutés
  (`/api/healthz`) sont en lecture seule et ne renvoient aucune donnée métier.

---

## TESTS

Exécutés dans cet environnement (`npm ci` requis au préalable — `node_modules` absent au départ) :

- `npx tsc --noEmit -p .` → **0 erreur** (dépôt entier, avant et après chaque lot de changement).
- `npx eslint .` → **0 erreur** (3 avertissements préexistants sans rapport, `no-img-element`).
- `npx vitest run` → **108 tests, 29 fichiers, tous passés**, dont les 4 nouveaux tests de
  redaction du logger (`src/lib/observability/logger.test.ts`).
- `npm run verify:migrations` → 179 migrations valides (noms/horodatages uniques), y compris la
  nouvelle `20260920000184_observabilite_job_runs.sql`.
- `npm run verify:secrets` → 691 fichiers suivis contrôlés, aucun secret détecté.
- `npm run build` (Next.js) → build de production complet réussi, `/api/healthz` bien enregistrée
  comme route dynamique, aucune erreur.

**Non exécuté ici — `BLOCKED_ENVIRONMENT`** : `npm run db:start` / `db:reset` / `test:db` (pgTAP)
nécessitent Docker, absent de ce sandbox distant (`docker ps` échoue : socket introuvable). La
migration ajoutée (`job_runs`) est un `create table` additif isolé, sans dépendance sur les
fonctions/triggers existants — risque de régression pgTAP jugé faible, mais **à exécuter
réellement sur Preview/CI avant fusion**, conformément à la procédure de
`docs/CONTROLES_LOCAUX.md` (Fresh + Upgrade + pgTAP).

---

## OPEN RISKS

Par ordre de priorité opérationnelle :

1. **Double facturation Option IA possible** (`stripe-abonnement.ts:331`, clé d'idempotence
   Stripe incluant `Date.now()`) en cas de double déclenchement concurrent du cron
   `cron:abonnements` — impact financier réel, correction hors périmètre observabilité (c'est un
   bug métier/idempotence, pas un manque de visibilité). Le composant `jobs` de `/api/healthz` et
   `job_runs` permettent au moins de détecter *que* le cron a tourné deux fois, pas d'empêcher le
   doublon.
2. **Aucun verrou/avisory lock** sur les deux crons : un déclenchement concurrent (rejeu manuel +
   planification) n'est empêché nulle part.
3. **Ordre inversé des évènements Stripe non géré** (pas de comparaison de version sur
   `data.object`) — risque faible mais réel de régression d'état sur des évènements très
   rapprochés.
4. **`supprimerDocumentChantierAction`** supprime l'objet Storage avant la ligne DB (ordre
   inverse du reste du code, qui nettoie l'objet *après* un échec d'insertion) — orphelin DB
   possible en sens inverse si la suppression DB échoue après coup.
5. **Un crash de route cron avant la première sous-tâche** (donc en dehors de tout `try` par
   sous-tâche) laisserait la ligne `job_runs` en `en_cours` indéfiniment plutôt que `echec` —
   `/api/healthz` finirait par le détecter via l'absence d'exécution *terminée* récente (36 h),
   mais avec un délai, pas immédiatement.
6. Les ~20 `catch` restants dans les actions/API non touchés par cette revue (uploads divers,
   exports paie, actions plateforme) ne journalisent toujours rien — conversion mécanique
   possible, volontairement non faite en masse cette nuit (risque de diff incontrôlé).
7. Aucun fournisseur d'alertes connecté (Sentry Alerts / Slack / PagerDuty) : le contrat
   d'alerte (section ALERTING) est écrit mais rien ne se déclenche automatiquement aujourd'hui en
   dehors de la capture Sentry elle-même (dont les règles de notification ne sont pas dans ce
   dépôt).
8. `HEALTHCHECK_SECRET` et un moniteur externe (UptimeRobot, Better Uptime, Vercel Monitors, ...)
   pointant vers `/api/healthz` restent à configurer sur Preview/Production — sans cela, le
   endpoint existe mais personne ne le surveille activement.
9. pgTAP non rejoué dans cet environnement (Docker indisponible) pour la nouvelle migration —
   à exécuter avant fusion.
10. Pas de MFA implémentée — hors périmètre de cette mission (pas un manque d'observabilité), mais
    signalé car cité explicitement dans le brief d'origine (section AUTH de la mission).

---

## Verdict

**PILOT INCIDENT READY.**

Justification : les incidents nommés explicitement par la mission (webhook Stripe
marqué-avant-traité, absence totale de logs/corrélation, absence de healthcheck, échecs
silencieux Auth/Storage/RPC/cron) sont désormais **détectables et compréhensibles** sans fouille
manuelle de la plateforme — via Sentry (tags `categorie`/`niveau`/`requestId`), `job_runs`, et
`/api/healthz`. Un incident du type « ça casse chez un client demain matin » laisserait
maintenant une trace exploitable dans au moins un de ces trois canaux, pour chacun des domaines
audités (webhooks, jobs, auth, storage, email, RPC, frontend).

Pas de verdict `PRODUCTION OPS CANDIDATE` : cela exigerait (a) une preuve distante — CI/Preview
réelle, y compris pgTAP (bloqué ici par l'absence de Docker), (b) un moniteur externe et un
fournisseur d'alertes réellement branchés sur `/api/healthz` et sur les tags Sentry définis ici
(rien de tout cela n'existe encore, uniquement le contrat), et (c) la correction des deux bugs
métier identifiés en cours de revue (double facturation Option IA, ordre de suppression Storage)
qui, bien que hors périmètre strict de cette mission, resteraient des incidents silencieux au
sens propre du terme tant qu'ils ne sont pas traités.
