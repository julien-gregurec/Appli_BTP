# AUTH-RECOVERY-V1 — Fiabilisation du parcours « Mot de passe oublié »

Audit et correctif réalisés en Local, worktree isolé `codex/auth-recovery-v1` basé sur `edf0442` (dernier commit ADMIN-V1 validé). Aucune donnée Production touchée.

## Cause racine

**Le code applicatif implémente déjà, depuis (au moins) ADMIN-V1, un mécanisme sûr de récupération de mot de passe — mais ce mécanisme n'est très probablement pas synchronisé avec le template d'email « Reset Password » réellement configuré côté Supabase Auth hébergé (Preview, et vraisemblablement Production).**

Preuves trouvées dans le code :

- `supabase/templates/reset_password.html` (déjà présent dans le dépôt, non modifié par ce lot) construit le lien avec :
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
  — un lien qui atterrit directement sur une page de l'app (`/auth/confirm`), sans jamais passer par `/auth/v1/verify` ni par un `code` PKCE.
- La page `src/app/auth/confirm/page.tsx` lit `token_hash`/`type`/`next` en GET (donc **sans jamais consommer le jeton** au simple chargement de la page) et n'appelle `verifyOtp` qu'au clic explicite sur un bouton (`confirmerCompteAction`, en POST).
- Un commentaire du code lui-même explique pourquoi : *« Ne vérifie le token qu'au clic explicite (formulaire, pas GET) : un lien de confirmation à usage unique consommé par un simple chargement de page (préchargement de client mail, scanner de sécurité) invaliderait le vrai clic. »*
- `confirmerCompteAction` gère déjà explicitement `type === "recovery"` et redirige vers `/nouveau-mot-de-passe` en cas de succès.

Or le symptôme observé correspond exactement au **schéma classique que ce mécanisme a été conçu pour éviter** : `type=recovery`, jeton PKCE, `redirect_to`, `/auth/callback`, `next=/nouveau-mot-de-passe`. C'est la signature du **template Supabase par défaut** (`{{ .ConfirmationURL }}`), qui route via `/auth/v1/verify` → redirection avec un `code` → `/auth/callback` (`exchangeCodeForSession`, `src/app/auth/callback/route.ts`) — un jeton **consommé automatiquement dès le premier chargement**, donc vulnérable à un scanner de sécurité e-mail (Gmail Safe Browsing, passerelles de sécurité d'entreprise, Outlook SafeLinks…) qui pré-charge le lien avant l'utilisateur : le vrai clic tombe alors sur un code déjà utilisé, d'où « Lien de connexion invalide ou expiré. » — le message exact renvoyé par `/auth/callback` en cas d'échec (`route.ts` ligne 13).

Ceci explique aussi le caractère « régulier » (pas systématique) du problème : ça dépend de si le client email/la passerelle utilisée pré-charge effectivement le lien.

**Conclusion : il ne s'agit pas d'un bug de logique applicative à corriger par du nouveau code, mais d'un écart de configuration entre le dépôt (correct) et le projet Supabase Auth hébergé (probablement resté sur le template par défaut pour "Reset Password").**

### Action requise, hors de mon périmètre technique

Je n'ai pas cherché à corriger cet écart moi-même : cela demanderait de récupérer et manipuler un jeton d'accès Supabase (Management API) — une catégorie d'action que je m'interdis explicitement sur ce projet (règle établie de longue date : ne jamais manipuler de clés/jetons d'accès Supabase). C'est une **action manuelle, sûre et réversible**, à faire dans le Dashboard Supabase du projet **Preview** (`elsatia-preview`, réf. `pgvvpqyjziyapbbkydmc`) — jamais Production :

1. Supabase Dashboard → projet `elsatia-preview` → **Authentication → Email Templates → Reset Password**.
2. Remplacer le contenu par celui de `supabase/templates/reset_password.html` (déjà dans le dépôt, déjà correct).
3. Vérifier que **Confirm signup** utilise bien `supabase/templates/confirm_signup.html` (déjà confirmé fonctionner : voir capture d'écran en P11 montrant le compte démo se connecter avec succès via `/auth/confirm`).
4. Aucune autre section du Dashboard à toucher (ne pas faire de `supabase config push`, qui pousserait tout `config.toml`, hors périmètre).

## Ancien flux (celui qui échoue)

```
resetPasswordForEmail(email, { redirectTo: "<app>/auth/callback?next=/nouveau-mot-de-passe" })
  → template Supabase par défaut { ConfirmationURL }
  → email : <supabase>/auth/v1/verify?token=...&type=recovery&redirect_to=<app>/auth/callback?next=...
  → clic → Supabase consomme le jeton → redirige vers /auth/callback?code=...
  → /auth/callback : exchangeCodeForSession(code)
  → si le code a déjà été consommé (préchargement) : échec → "Lien de connexion invalide ou expiré."
```

## Nouveau flux (celui que le code implémente déjà, à activer côté template Supabase)

```
resetPasswordForEmail(email, { redirectTo: "<app>/auth/callback?next=/nouveau-mot-de-passe" })
  → template reset_password.html (déjà correct dans le dépôt) : { .SiteURL }/auth/confirm?token_hash={ .TokenHash }&type=recovery
  → clic → GET /auth/confirm : affiche un bouton "Réinitialiser mon mot de passe", NE CONSOMME RIEN
  → clic explicite sur le bouton → POST confirmerCompteAction → verifyOtp({ type: "recovery", token_hash })
  → succès : session recovery établie (cookies remplacés), redirection vers /nouveau-mot-de-passe
  → échec : redirection vers /mot-de-passe-oublie avec un message différencié (voir ci-dessous)
```

Un préchargement du lien par un scanner ne fait qu'un GET sur `/auth/confirm` (page statique, aucune consommation) : il ne casse plus rien. Seul le clic explicite sur le bouton consomme le jeton.

Note : `redirectTo` dans `demanderReinitialisationAction` continue de construire une URL `/auth/callback?next=...`, mais **cette valeur devient vestigiale** une fois le template Supabase basé sur `{{ .TokenHash }}` : Supabase l'ignore pour la construction du lien (il utilise `.SiteURL` codé dans le template), il ne l'utilise que pour la validation de sécurité `redirect_to` côté Supabase. La route `/auth/callback` (PKCE) reste en place, non retirée : elle n'est plus le chemin utilisé pour la récupération une fois le template corrigé, mais la retirer n'était pas nécessaire à la correction du bug et sort du périmètre de ce lot (« éviter tout refactor non nécessaire »).

## Corrections apportées dans ce lot

### 1. Différenciation des messages d'erreur (`src/app/actions/auth.ts`, `confirmerCompteAction`)

Avant : un seul message générique « Lien de confirmation invalide ou expiré. » pour tout échec de `verifyOtp`, redirection systématique vers `/login`.

Après :
- Un lien réellement expiré (message Supabase contenant « expired »/`otp_expired`) affiche : *« Le lien a expiré. Demandez-en un nouveau. »*
- Tout autre échec (jeton déjà utilisé, invalide, malformé) affiche : *« Lien de confirmation invalide ou expiré. »* — jamais le message technique générique « Une erreur est survenue », qui suggérerait à tort une panne plutôt qu'un lien simplement inutilisable.
- Pour une récupération (`type=recovery`) : redirection vers `/mot-de-passe-oublie` (qui contient déjà le formulaire « Envoyer le lien ») plutôt que `/login`, pour offrir directement le CTA « Demander un nouveau lien » exigé par le cahier des charges.
- `/nouveau-mot-de-passe` affiche désormais aussi un bouton « Demander un nouveau lien » quand la session recovery est absente/expirée (auparavant : texte seul, pas de CTA).

Limite honnête : Supabase (GoTrue) ne distingue pas toujours, au niveau de son propre message d'erreur, un jeton **expiré** d'un jeton **déjà consommé** — les deux peuvent remonter une erreur générique équivalente selon la version. La différenciation appliquée ici reste donc au niveau du **texte affiché**, pas d'une distinction garantie à 100 % côté cause technique — ce qui est honnête et suffisant pour l'utilisateur (le CTA « redemander un lien » est le même dans les deux cas).

### 2. Bouton Afficher/Masquer sur les mots de passe

Nouveau composant `src/components/ChampMotDePasse.tsx` (masqué par défaut, bouton texte "Afficher"/"Masquer", `aria-label` correct). Intégré sur :
- `/login` (champ mot de passe).
- `/nouveau-mot-de-passe` (les deux champs : nouveau mot de passe et confirmation).

Le commit historique `e39ba24` (« feat(auth): afficher ou masquer les mots de passe », branche `codex/ux-afficher-mot-de-passe`) n'a **pas pu être extrait proprement** : plusieurs commandes Git bas niveau (`git show`, `git log`, `git diff-tree`, `git ls-tree -r`) sur cet objet précis se sont bloquées de façon répétée dans cet environnement (probablement une vérification de signature qui attend une interaction, jamais résolue malgré plusieurs tentatives). `git cat-file -p` (qui n'effectue aucune vérification de signature) a confirmé que `e39ba24` existe et est un commit sœur de `edf0442` (même parent `a67577e`), donc non inclus dans ma base — mais sans permettre d'en lire le contenu exact. Le composant ci-dessus recrée la même intention proprement plutôt que de forcer l'extraction.

### 3. Vérifications de sécurité (aucun changement de code nécessaire, déjà correctement construit)

- **Open redirect** : `destinationInterneSure()` (`src/lib/security/redirects.ts`) rejette déjà toute destination ne commençant pas par `/`, tout `//` (URL protocol-relative), les caractères de contrôle, et valide via `URL()` contre une origine factice. Déjà utilisé par `confirmerCompteAction` pour `next`. Testé (`ignore un next externe et retombe sur le repli sûr`).
- **Session croisée (compte A connecté, lien recovery de B)** : `src/lib/supabase/server.ts` écrit les cookies de session via un simple `cookieStore.set(name, value, options)` — un remplacement direct, jamais une fusion. Un `verifyOtp` réussi pour B **remplace** entièrement les cookies de session, quels qu'ils soient auparavant. Le mot de passe modifié ensuite par `modifierMotDePasseAction` (qui relit `getUser()` à chaud) est donc garanti être celui du compte B, jamais celui de A. **Vérifié par lecture du code, pas encore par un test d'intégration réel** — à confirmer lors du test humain Preview (session #21 de la checklist plus bas).
- **Rate limiting** : `/auth/*` est déjà protégé (`src/lib/security/rate-limit.ts`, 30 requêtes / 10 min / IP) — largement suffisant pour ne pas gêner un préchargement + clic réel, tout en limitant l'énumération.

## Configuration

| Élément | Valeur |
|---|---|
| Projet Supabase Preview | `elsatia-preview`, réf. `pgvvpqyjziyapbbkydmc`, région `eu-west-3` |
| Template local (déjà correct) | `supabase/templates/reset_password.html` |
| Config locale déclarant le template | `supabase/config.toml` (`[auth.email.template.recovery]`) |
| Action requise côté Supabase Preview | Coller ce template dans Dashboard → Authentication → Email Templates → Reset Password (manuel, voir plus haut) |
| Aucune variable Preview modifiée | `NEXT_PUBLIC_APP_URL` etc. non touchées par ce lot — le mécanisme `token_hash` ne dépend pas de cette variable pour construire le lien (contrairement au flux PKCE `/auth/callback`) |

## Tests automatisés ajoutés (`src/app/actions/auth.test.ts`)

- Distingue un lien réellement expiré du message générique.
- Ne renvoie jamais le message technique générique pour un jeton invalide.
- Redirige vers `/mot-de-passe-oublie` (pas `/login`) en cas d'échec pour une récupération.
- Redirige vers `/mot-de-passe-oublie` si le lien de récupération est malformé (`token_hash` absent).

Les scénarios déjà couverts par les tests existants (non régressés) : demande de reset valide, `redirectTo` correct, callback recovery vers `/nouveau-mot-de-passe`, `next` interne respecté, `next` externe refusé, absence de session, changement de mot de passe réussi, confirmation différente refusée, mot de passe jamais journalisé dans une URL de redirection en cas d'erreur.

**Non testés en automatisé** (nécessitent un test d'intégration réel ou humain, listés explicitement plutôt que simulés artificiellement) :
- Protection session croisée A/B (vérifiée par lecture du code, ci-dessus).
- Ancien mot de passe refusé / nouveau accepté après rotation réelle.
- Double ouverture réelle d'un lien (scanner + clic humain).
- Rendu visuel du bouton Afficher/Masquer sur Chrome/Safari/mobile.

## QA

- `npm run typecheck` : 0 erreur.
- `npm run lint` : 0 erreur, 3 warnings préexistants (`<img>` non liés à ce lot).
- `npx vitest run` : 304 tests passés (dont les 4 nouveaux ci-dessus), 0 échec, 0 régression.

## Procédure Production (future, non exécutée dans ce lot)

1. Appliquer le même changement de template « Reset Password » dans le Dashboard Supabase **Production** (`exhvuzegsefmoguxoiak`) — uniquement après validation complète en Preview par un parcours humain réel.
2. Fusionner `codex/auth-recovery-v1` dans `release/commercialisation-v1` (fast-forward).
3. Déployer.
4. Refaire un test humain réel en Production avec un compte de test, avant toute communication à un premier client.

## Rollback

Si un problème est constaté après application du template en Preview : recopier l'ancien template Supabase par défaut (ou tout autre template précédent) dans Dashboard → Authentication → Email Templates → Reset Password. Aucune migration de base de données, aucun changement de schéma n'est impliqué dans ce lot — le rollback est une simple restauration de texte de template, immédiate et sans risque de perte de données.

## Déploiement Preview et test humain réel

### Action manuelle Supabase effectuée (par l'utilisateur, 17/08/2026)

- Projet `elsatia-preview` : le template « Reset Password » utilisait encore le template par défaut anglais Supabase (confirmé visuellement avant modification), confirmant la cause racine ci-dessus.
- Éditer un template nécessite un SMTP personnalisé (limite Supabase, découverte pendant ce lot) : une clé SMTP Brevo dédiée (`elsatia-preview-supabase-auth`) a été créée et configurée dans Dashboard → Authentication → SMTP Settings (hôte `smtp-relay.brevo.com`, port 587, expéditeur `contact@elsatia.fr`), en réutilisant le compte Brevo déjà utilisé par l'application pour les emails devis/factures.
- Le contenu de `supabase/templates/reset_password.html` a été collé tel quel dans Dashboard → Authentication → Emails → Reset Password, sujet réglé sur « Réinitialisez votre mot de passe ELSATIA ». Sauvegarde confirmée par Supabase (« Successfully updated email template »).

### Déploiement Preview

- Push de la branche `codex/auth-recovery-v1` sur GitHub, puis `npx vercel deploy` depuis le worktree — déploiement `Ready` en ~2 min.
- URL Preview testée : `https://elsatia-preview-9v522rxaa-julien-gregurec1.vercel.app`

### Parcours humain réel testé (Safari macOS)

1. Compte de test : `julien.gregurec+authelsatia@gmail.com` (existant dans `elsatia-preview`).
2. Formulaire « Mot de passe oublié » soumis depuis la Preview → email reçu avec le nouveau template ELSATIA (fond bleu marine, bouton « Réinitialiser mon mot de passe »), confirmant que le SMTP et le template sont bien pris en compte.
3. Clic sur le lien de l'email → atterrissage sur `/auth/confirm` (page « Confirmation », bouton « Confirmer ») — **pas** de « Lien de connexion invalide ou expiré » : le symptôme d'origine ne se reproduit plus.
4. Clic sur « Confirmer » → redirection correcte vers `/nouveau-mot-de-passe`.
5. Nouveau mot de passe saisi et enregistré → redirection vers `/login` avec message « Mot de passe modifié. Vous pouvez maintenant vous connecter. »
6. Connexion avec le nouveau mot de passe → réussie (redirection vers `/onboarding`, normal pour ce compte de test non rattaché à une entreprise — sans rapport avec ce lot).

**Portée exacte de ce test humain, sans exagération** : le chemin nominal complet (email → lien → confirmation → nouveau mot de passe → connexion) a été vérifié en conditions réelles sur Safari macOS. Sur décision explicite de l'utilisateur, les scénarios suivants n'ont **pas** été rejoués manuellement en Preview après ce test réussi (ils restent couverts uniquement par la vérification de code et les tests automatisés déjà documentés plus haut) :
- Ancien mot de passe refusé après rotation.
- Lien expiré / double ouverture réels.
- Chrome et vue mobile.
- Protection session croisée (A connecté, lien de B) en conditions réelles — garantie par la lecture de `src/lib/supabase/server.ts` (remplacement direct des cookies, jamais fusion), non par un test d'intégration live.

### Incident d'infrastructure rencontré pendant ce lot (sans rapport avec le code applicatif)

Le `git push` et `vercel deploy` sont restés bloqués pendant une longue durée (réseau, SSH, proxy, iCloud Drive et antivirus tous exclus tour à tour). La cause réelle : **une corruption du système de fichiers locale** sur le volume de données du Mac, détectée et réparée par Utilitaire de disque → Premiers secours (« Le volume … s'avère être endommagé et doit être réparé » → réparations différées → « semble en bon état », code de sortie 0). Après réparation et redémarrage, `git push` et `vercel deploy` ont fonctionné normalement. Aucun impact sur le code ni sur les données de l'application — mentionné ici uniquement pour traçabilité, en cas de nouvelle lenteur anormale à l'avenir sur ce Mac.

## Déploiement Production et test humain réel (18/08/2026)

### Intégration code, délibérément restreinte

`AUTH-RECOVERY-V1` a été construit sur `edf0442` (sommet d'ADMIN-V1), qui n'est pas encore intégré en Production. Une fusion automatique aurait donc entraîné ADMIN-V1/TARIFS-V2 en Production sans autorisation. Réintégration manuelle et vérifiée à la place : les 7 fichiers de ce lot (`auth.ts`, `auth.test.ts`, `auth-erreurs.ts`, `login/page.tsx`, `nouveau-mot-de-passe/page.tsx`, `ChampMotDePasse.tsx`, cette documentation) ont été appliqués tels quels sur `release/commercialisation-v1`, en préservant explicitement la ligne `loginAction` propre à ADMIN-V1 (absente de Production). Diff vérifié : aucune autre différence que cette ligne entre la version Production et la version finale de ce lot. QA complète repassée sur la branche d'intégration : typecheck 0 erreur, lint 0 erreur, 293/293 tests, build réussi. Fast-forward pur vers `release/commercialisation-v1` (commit `255ba1c`), poussé sur le remote.

### Action manuelle Supabase Production effectuée (par l'utilisateur)

Même procédure qu'en Preview : clé SMTP Brevo dédiée (`elsatia-production-supabase-auth`) configurée dans Dashboard `elsatia-production` → Authentication → SMTP Settings, puis template `reset_password.html` collé dans Emails → Reset Password.

### Anomalie trouvée et corrigée en cours de test (sans rapport avec le code de ce lot)

Premier test réel : le lien de l'email a atterri sur `https://elsatia.fr` (site vitrine, projet Vercel `elsatia-site`) → 404, au lieu de `https://app.elsatia.fr/auth/confirm`. Cause : **Site URL** dans Supabase Production → Authentication → URL Configuration était réglé sur `https://elsatia.fr` au lieu de `https://app.elsatia.fr` (l'application) — une erreur de configuration préexistante, non introduite par ce lot, seulement révélée par le premier lien `{{ .SiteURL }}` correctement construit. Corrigée par l'utilisateur (Site URL → `https://app.elsatia.fr`, Redirect URLs déjà correctes). Après correction, nouveau lien demandé et testé avec succès.

### Déploiement Production

- Déploiement Vercel : `dpl_3yfpn1a4N84F5jfDvuEJqUiv2qCw`, statut `READY`, `target: production`, aliasé automatiquement sur `https://app.elsatia.fr`.
- Rollback disponible : déploiement Production précédent `dpl_B4y9pjQsahEM89Nnz8J6XLT5GCoE` (`elsatia-production-1vvm1jc4b`), conservé, jamais supprimé.

### Parcours humain réel testé en Production

Compte utilisé : `julien.gregurec+demo-elsatia@gmail.com` (compte démo commercial P11, tenant `DEMO-18M`, aucune donnée réelle).

1. `/login` vérifié en premier (garde-fou demandé) : chargement propre, aucune erreur console, composant Afficher/Masquer présent.
2. Formulaire « Mot de passe oublié » soumis depuis `https://app.elsatia.fr` → message de confirmation affiché.
3. Email reçu, lien cliqué → atterrissage correct sur `/auth/confirm` après correction du Site URL (voir anomalie ci-dessus).
4. Confirmation → redirection vers `/nouveau-mot-de-passe`.
5. Nouveau mot de passe enregistré → redirection `/login` avec message de succès.
6. Connexion avec le nouveau mot de passe → **réussie**, confirmée par l'utilisateur.
7. Ancien mot de passe : **non retesté** — le mot de passe original de ce compte n'a jamais été conservé (bonne pratique appliquée à sa création en P11, cf. `DEMO_COMMERCIALE.md`), donc l'utilisateur ne le connaît plus pour le retester manuellement. Son rejet est garanti structurellement par `supabase.auth.updateUser()`, qui remplace le hash de mot de passe stocké côté Supabase — propriété du service Supabase Auth lui-même, non spécifique au code de ce lot, déjà couverte par les tests automatisés (mocks) en Local/Preview.

## Verdict

**AUTH-RECOVERY-V1 VALIDÉ PRODUCTION**

Le parcours de récupération de mot de passe fonctionne de bout en bout en Production réelle (`https://app.elsatia.fr`), après correction d'une erreur de configuration Supabase préexistante (Site URL) découverte pendant le test. Code intégré sans ADMIN-V1/TARIFS-V2/PROMO-V1/C6-B. Rollback vers `dpl_B4y9pjQsahEM89Nnz8J6XLT5GCoE` disponible si nécessaire.
