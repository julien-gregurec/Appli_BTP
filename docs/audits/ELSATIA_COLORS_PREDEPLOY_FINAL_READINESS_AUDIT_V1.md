# ELSATIA-COLORS-PREDEPLOY-FINAL-READINESS-AUDIT-V1

**Objet** — Constituer et vérifier une cible Colors unique, prête à déployer dès
l'ouverture du quota Vercel. **Aucun déploiement n'a été effectué dans ce lot.**

- Date : 2026-09-06
- Branche d'intégration : `integration/colors-predeploy-final-v1`
- Périmètre : `apps/colors` uniquement (+ constat sur le relais Gestion Pro, non modifié)

---

## 1. Topologie et filiation

La filiation des deux branches validées est **strictement linéaire** : aucun merge,
aucun cherry-pick n'a été nécessaire.

```
4d92ddb  (base commune avec main)
   …
05e74d8  Merge PR #1 — feat/elsatia-colors-canonical-integration-v1   ← socle Colors v1.3
2753f04  fix(colors): isolate standalone PostCSS configuration
3f20eaa  fix(colors): add global error boundary for missing multi-app contract
5ea1d03  fix(colors): harden internal redirect validation
260523c  fix(colors): close precommercial security p1 gaps
4de472d  fix(colors): complete auth callback and csp hardening
5b21590  docs(colors): consigner l'état Auth Production après les réglages exploitant
3870e1c  feat(auth): relayer un lien de récupération vers ELSATIA Colors
da74bb4  fix(colors): add safe multiapp password reset flow
07a2af7  docs(colors): converge security and reset lots on one integration branch
         └── integration/colors-precommercial-security-reset-v1
55c5820  fix(colors): enforce precommercial noindex and robots
         └── fix/colors-precommercial-noindex-robots-v1
         └── integration/colors-predeploy-final-v1  (créée ici, fast-forward exact)
```

Vérification : `git merge-base --is-ancestor integration/colors-precommercial-security-reset-v1
fix/colors-precommercial-noindex-robots-v1` → **vrai**. La branche noindex est un
descendant direct de la branche d'intégration sécurité/reset. `integration/colors-predeploy-final-v1`
est donc créée en fast-forward sur `55c5820`, sans réécriture d'historique.

**Contenu du contrat, tout présent, rien de plus** : sécurité, CSP, reset,
relais multi-app, noindex, robots.txt. Les 10 commits de `05e74d8..55c5820` sont
tous des lots Colors. Aucun commit Gestion Pro hors contrat, aucun commit Tools,
aucun commit site vitrine.

### Migrations

**Aucune.** `git diff --name-only 05e74d8..55c5820 -- supabase/migrations supabase/production
supabase/templates` ne renvoie **aucun fichier**. Le déploiement est purement applicatif :
il n'exige ni migration, ni modification Supabase, ni modification Stripe.

### Fichiers hors `apps/colors` (4 fichiers, relais multi-app) — écart documenté

| Fichier | Rôle |
|---|---|
| `src/lib/auth-relais-colors.ts` | Construit le lien de relais vers Colors |
| `src/lib/auth-relais-colors.test.ts` | Couverture du relais |
| `src/app/auth/confirm/page.tsx` | Bouton « Poursuivre sur ELSATIA Colors » |
| `src/app/auth/confirm/page.test.ts` | Couverture de la page |

Ces fichiers appartiennent à l'application **Gestion Pro**, pas à Colors. Ils sont
présents dans la branche parce qu'ils font partie du lot reset multi-app, mais **un
déploiement du projet Vercel `elsatia-colors` ne les embarque pas**. Voir §9, écart E1.
Conformément au contrat, ils n'ont **pas** été modifiés dans ce lot.

---

## 2. Runtime final

| Élément | Valeur |
|---|---|
| Next.js | 16.2.12 (Turbopack) |
| React | 19.2.4 |
| Node (recette) | v24.18.0 |
| Projet Vercel | `julien-gregurec1/elsatia-colors` (`prj_ZEw9IIa0J6Rg5Wfi9POe6P67uAko`) |
| Région | `fra1` |
| Middleware | `src/proxy.ts` (émet la CSP noncée) |

Sortie de build : 25 routes, dont 2 statiques (`/robots.txt`, `/manifest.webmanifest`)
et 23 dynamiques. **Aucune route `sitemap`.**

---

## 3. Routes — recette sur build de production local

| Route | Statut | Destination |
|---|---|---|
| `/` | 307 | `/dashboard` |
| `/login` | 200 | — |
| `/dashboard` | 307 | `/login` (accès réservé) |
| `/mot-de-passe-oublie` | 200 | — |
| `/auth/confirm` | 200 | — (GET inerte) |
| `/nouveau-mot-de-passe` | 307 | `/mot-de-passe-oublie?error=lien-invalide` (sans session de récupération) |
| `/abonnement-requis` | 307 | `/login` |
| `/acces-refuse` | 307 | `/login` |
| `/inventaire` | 307 | `/login` (accès réservé) |
| `/robots.txt` | 200 | — |
| `/page-inexistante` | 404 | page 404 applicative |

**Aucune 404 sur le parcours de réinitialisation.** Redirections cohérentes,
accès réservé effectif sur toutes les routes métier.

---

## 4. Réinitialisation de mot de passe

| Exigence | Constat |
|---|---|
| GET inert sur `/auth/confirm` | ✅ Rien n'est consommé au chargement. Le jeton n'est vérifié qu'à la soumission explicite du formulaire (`apps/colors/src/app/auth/confirm/page.tsx`). Un préchargement par client mail ou scanner ne brûle pas le lien. |
| `token_hash` validé | ✅ `jetonRecuperationSur()` — regex `^[A-Za-z0-9._~-]{16,512}$`, qui exclut chevrons, guillemets et espaces, et refuse tout `type` autre que `recovery`. |
| `verifyOtp` côté Colors | ✅ `confirmerRecuperationAction` exécute `supabase.auth.verifyOtp()` sur l'origine Colors. |
| Session Colors | ✅ Les cookies d'authentification sont propres à l'origine ; la session de récupération naît sur `colors.elsatia.fr`. |
| Destination constante | ✅ `DESTINATION_NOUVEAU_MOT_DE_PASSE = "/nouveau-mot-de-passe"`, constante d'application. L'action n'accepte **aucune** cible venue de la requête. |
| Aucune open redirect | ✅ Voir §9. |
| Aucune fuite d'erreur brute | ✅ Toutes les erreurs Supabase passent par `journaliserEchecTechnique()` (journal serveur) ; l'utilisateur ne voit qu'un code d'un jeu fermé. Vérifié en recette : jeton invalide → « Ce lien de réinitialisation est invalide ou expiré. » sans trace de `AuthApiError` ni `otp_expired`. |
| Aucun retour à `{{ .RedirectTo }}` | ✅ `supabase/templates/reset_password.html` utilise `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`. La variable `{{ .RedirectTo }}` n'apparaît nulle part dans le gabarit. Gabarit **non modifié** par ce lot. |
| Anti-énumération de comptes | ✅ Vérifié en recette réelle : avec un backend Supabase injoignable, la soumission renvoie malgré tout la confirmation neutre « Si un compte ELSATIA correspond à cette adresse… » (POST → 303). Aucune réponse différenciée. |

---

## 5. CSP

CSP relevée sur `/login` du build de production (nonce régénéré à chaque requête,
vérifié sur deux requêtes successives — valeurs distinctes) :

```
default-src 'self';
script-src 'self' 'nonce-<128 bits>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: <origine Supabase>;
font-src 'self';
connect-src 'self' <origine Supabase>;
worker-src 'self';
manifest-src 'self';
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

| Exigence | Constat |
|---|---|
| nonce | ✅ 128 bits, régénéré par requête |
| `strict-dynamic` | ✅ |
| `frame-ancestors 'none'` | ✅ |
| `object-src 'none'` | ✅ |
| `base-uri 'self'` | ✅ |
| `form-action 'self'` | ✅ |
| `connect-src` exact | ✅ `'self'` + origine Supabase seule. Aucune origine `wss:` (pas de Realtime). |
| `img-src` exact | ✅ `'self' data:` + origine Supabase (URL signées Storage). Pas de `blob:`. |

`'unsafe-eval'` n'est ajouté qu'en développement. Les ressources publiques
(`/icons/`, `sw-colors.js`, `favicon.ico`, `manifest.webmanifest`, `robots.txt`)
reçoivent une politique dédiée sans nonce — nécessaire pour que le service worker
démarre sous `strict-dynamic` — mais tout aussi fermée.

**`style-src 'unsafe-inline'` : P1 non bloquant, confirmé.** Huit attributs `style`
React subsistent. Un nonce ne couvre pas les attributs `style`, et `style-src-attr`
n'est pas honoré uniformément. La levée relève du lot interface (ELSATIA-UI-V2),
pas de la sécurité. Elle n'ouvre aucune exécution de script.

---

## 6. En-têtes de sécurité

Relevés sur `/login` et confirmés aussi sur `/_next/static/*` (couverts par
`next.config.ts`, hors proxy) et sur la page 404 :

| En-tête | Valeur |
|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), geolocation=(), microphone=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `X-Robots-Tag` | `noindex, nofollow` |
| `X-Powered-By` | absent (`poweredByHeader: false`) |

`camera=(self)` est nécessaire : la fiche seau expose un `<input type="file"
capture="environment">`.

---

## 7. Indexation

| Exigence | Constat |
|---|---|
| noindex | ✅ Trois mécanismes convergents : `<meta name="robots">` du gabarit racine (`ROBOTS_PRECOMMERCIAL`), en-tête `X-Robots-Tag` sur `/:path*`, et `/robots.txt`. |
| nofollow | ✅ `noindex, nofollow` + `nocache` + `googleBot.noimageindex`. |
| robots `Disallow: /` | ✅ `/robots.txt` → `User-Agent: *` / `Disallow: /` |
| Aucun sitemap | ✅ Aucun fichier `sitemap*` dans `apps/colors`, aucune route sitemap au build, aucun sitemap déclaré dans `robots.txt`. |
| Aucune canonical publique inutile | ✅ Aucune occurrence de `canonical` ni `alternates` dans `apps/colors/src`. `metadataBase` seul est défini, sans émission d'URL canonique. |

L'en-tête `X-Robots-Tag` couvre ce qu'aucune balise ne peut couvrir : routes d'API,
export CSV, fichiers servis tels quels.

---

## 8. Variables d'environnement

Audit de **présence uniquement**. Aucune valeur n'est affichée, aucune variable n'a
été créée, modifiée ni supprimée.

Variables réellement consommées par `apps/colors` :

| Variable | Présente en Production Vercel | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Plan de données ; origine `connect-src`/`img-src` de la CSP |
| `NEXT_PUBLIC_COLORS_URL` | ✅ | Origine publique ; `metadataBase` et `redirectTo` de la réinitialisation |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Client Supabase serveur |
| `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` | ✅ | Renvoi vers le portail d'abonnement |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (Secret) | Opérations serveur privilégiées |
| `ELSATIA_APPLICATION_ENV` | ✅ (Secret) | Cloisonnement d'environnement |

**Valeur attendue de `NEXT_PUBLIC_COLORS_URL` : `https://colors.elsatia.fr`.**
La valeur stockée est chiffrée dans le listing Vercel et n'a pas été extraite —
la récupérer supposait un `vercel env pull`, qui écrit des secrets sur disque.
Elle se vérifie sans risque **après** déploiement par le smoke test 5.4 : si la
variable était absente ou invalide, `/mot-de-passe-oublie` afficherait « La
réinitialisation est momentanément indisponible » au lieu de la confirmation
neutre. Écart E2.

---

## 9. Sécurité — smokes réels sur build de production

### Open redirect — fermé

Testé sur `/auth/callback?next=…` et sur le champ `next` de `/login` :

| Charge | Résultat |
|---|---|
| `https://example.com` | → `/dashboard` |
| `//example.com` | → `/dashboard` |
| `javascript:alert(1)` | → `/dashboard` |
| `/\evil.example` | → `/dashboard` |
| `%2f%2fexample.com` | → `/dashboard` |
| `/%5Cexample.com` | → `/dashboard` |
| `https:/\example.com` | → `/dashboard` |
| `/dashboard` (légitime) | → `/dashboard` |

**Aucune redirection externe.** `cheminInterneSur()` est le validateur unique :
il refuse les formes dangereuses, décode le pourcent-encodage sur 3 passes, prouve
l'origine contre un témoin `.invalid` (RFC 2606), et ne renvoie jamais la chaîne
d'entrée mais sa forme normalisée revérifiée.

### XSS — aucune

| Charge | Résultat |
|---|---|
| `/auth/confirm?token_hash=<script>alert(1)</script>&type=recovery` | Jeton rejeté par la regex de forme ; page « lien invalide » ; 0 occurrence exécutable |
| `/login?error=<script>window.__xss2=1</script>` | Aucune exécution (`window.__xss2` indéfini), 18 scripts — le compte nominal, page hydratée |
| `/login?error=</script><img src=x id=pwned onerror="window.__xss=1">` | Aucun élément injecté (`getElementById('pwned')` → null, `document.images.length` → 0), la chaîne n'atteint jamais le DOM comme balisage |
| `?message=<img src=x onerror=alert(1)>` | Aucun rendu |

Méthode : vérification **dans le navigateur**, pas par `grep`. Une recherche
textuelle sur le HTML brut signale à tort une réflexion, parce que Next.js
sérialise les `searchParams` dans la charge utile RSC (`self.__next_f`) sous forme
pourcent-encodée et échappée. Le test navigateur montre qu'aucune de ces charges
ne produit d'élément ni d'exécution.

Le verrou de fond reste le jeu fermé de messages : `messages-auth.ts` et
`messages-metier.ts` ne rendent que le libellé ELSATIA associé à un **code connu**.
Un code inconnu — donc tout texte fabriqué par un tiers — n'affiche rien. Cela ferme
aussi la composition « lien légitime + message crédible » utilisable en hameçonnage.

### Erreurs Supabase brutes — aucune

Aucune sortie de `AuthApiError`, `otp_expired` ou équivalent dans les pages
d'authentification. Les erreurs techniques ne vont qu'au journal serveur.

### Console navigateur

Aucune erreur, **aucune violation CSP** sur les pages publiques.

---

## 10. Mobile

Débordement horizontal mesuré (`documentElement.scrollWidth > innerWidth`) :

| Page | 375 | 430 | 768 | 1280 |
|---|---|---|---|---|
| `/login` | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| `/mot-de-passe-oublie` | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| `/auth/confirm` | ✅ 0 | ✅ 0 | ✅ 0 | ✅ 0 |
| `/nouveau-mot-de-passe` | (voir ci-dessous) | | | |

**Aucun débordement.** Captures vérifiées à 375 et 768 : la colonne artistique passe
correctement sous le contenu en mobile, le bouton principal reste pleine largeur.

`/nouveau-mot-de-passe` n'est pas atteignable sans session de récupération vivante
(elle redirige, à juste titre, vers `/mot-de-passe-oublie?error=lien-invalide`), et
la recette locale n'a pas de backend Supabase. Sa mise en page a été vérifiée
**structurellement** : elle partage exactement la coquille
`.public-page > .public-art + .public-content > .auth-card` des trois autres pages,
avec deux champs, comme `/login` — dont l'absence de débordement est mesurée aux
quatre largeurs. Écart E3 : à confirmer visuellement au smoke live post-déploiement.

---

## 11. État de la Production actuelle (constat, non modifiée)

Relevé en lecture seule sur `https://colors.elsatia.fr` :

| Élément | Production actuelle | Cible |
|---|---|---|
| CSP | **absente** | complète, noncée |
| `X-Frame-Options` | **absent** | `DENY` |
| `X-Content-Type-Options` | **absent** | `nosniff` |
| `Referrer-Policy` | **absent** | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | **absent** | définie |
| `COOP` / `CORP` | **absents** | `same-origin` |
| `X-Robots-Tag` | **absent** | `noindex, nofollow` |
| `Strict-Transport-Security` | `max-age=63072000` (défaut Vercel) | `+ includeSubDomains; preload` |
| `/robots.txt` | **404** | `Disallow: /` |
| `/mot-de-passe-oublie` | **404** | 200 |
| `/auth/confirm` | **404** | 200 |
| `/login` | 200 | 200 |

Le déploiement est donc **matériel** : il ferme sept en-têtes absents, ouvre
l'indexation-refus, et fait exister un parcours de réinitialisation qui n'existe
pas aujourd'hui.

---

## 12. Qualité

| Contrôle | Résultat |
|---|---|
| Tests Colors (`vitest run`) | ✅ **201 tests / 23 fichiers, 100 % passés** |
| Typecheck (`tsc --noEmit`) | ✅ aucune erreur |
| Lint (`eslint src next.config.ts`) | ✅ aucune erreur, aucun avertissement |
| Build (`next build`) | ✅ compilé en 1,3 s, 25 routes générées |
| Recette navigateur | ✅ sur build de production local |

---

## 13. Écarts documentés

### E1 — Le relais Gestion Pro ne part pas avec ce déploiement *(P1, non bloquant)*

Le gabarit d'e-mail Supabase est unique pour tout le projet et ancré sur `SiteURL`,
qui pointe vers Gestion Pro. Une réinitialisation demandée depuis Colors envoie donc
un lien vers **Gestion Pro**, où le bouton « Poursuivre sur ELSATIA Colors » relaie
le jeton non consommé vers Colors.

Ce bouton vit dans `src/app/auth/confirm/page.tsx`, c'est-à-dire dans le projet
Vercel **Gestion Pro**. Déployer le projet `elsatia-colors` ne l'embarque pas.

**Conséquence réelle, mesurée sur le code** : sans déploiement de Gestion Pro, une
personne qui demande une réinitialisation depuis Colors atterrit sur Gestion Pro et
y change son mot de passe. Le mot de passe étant **commun au compte ELSATIA**, la
réinitialisation **fonctionne** : elle se termine simplement sur Gestion Pro plutôt
que sur Colors. C'est une dégradation d'expérience, pas une régression de sécurité
ni une impasse fonctionnelle.

Le relais exige en outre `NEXT_PUBLIC_COLORS_URL` **sur le projet Gestion Pro**
(sans elle, `lienRelaisColors()` renvoie `null` et le bouton ne s'affiche pas — la
page se comporte alors exactement comme avant).

Conformément au contrat, Gestion Pro n'a **pas** été touché. Le déploiement Gestion
Pro relève d'un lot distinct.

### E2 — Valeur de `NEXT_PUBLIC_COLORS_URL` non extraite *(P2)*

Présence confirmée ; valeur non lue, pour ne pas écrire de secrets sur disque.
Vérifiable sans risque au smoke 5.4 post-déploiement.

### E3 — `/nouveau-mot-de-passe` non vérifiée visuellement *(P2)*

Non atteignable sans session de récupération vivante. Vérifiée structurellement.
À confirmer au smoke 5.5 post-déploiement.

### E4 — `style-src 'unsafe-inline'` *(P1 assumé, non bloquant)*

Confirmé comme non bloquant. Relève du lot ELSATIA-UI-V2.

---

## 14. Verdict

**READY TO DEPLOY.**

- Filiation prouvée, linéaire, sans réécriture.
- Contrat complet, aucun lot parasite.
- Aucune migration, aucune dépendance Supabase ou Stripe.
- Tests, typecheck, lint, build : tous verts.
- Recette navigateur sur build de production : routes, reset, CSP, en-têtes,
  noindex, robots, open redirect, XSS, mobile — tous conformes.
- Variables d'environnement Production : toutes présentes.
- Aucun des écarts E1–E4 n'empêche le déploiement ; E1 dégrade une expérience sans
  casser le parcours, E2 et E3 se lèvent au smoke live, E4 est un P1 assumé.

Le déploiement reste suspendu à la seule ouverture du quota Vercel.
