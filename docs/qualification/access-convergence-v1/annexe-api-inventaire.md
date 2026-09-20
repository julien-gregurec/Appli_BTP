# Inventaire des réponses d'accès API — tip `fix/colors-shared-auth-access-night-v1` @ d7d59c9e

Chemins relatifs à `scratchpad/night/` (Studio : `scratchpad/studio2/apps/studio/`). [LU] = code lu ; [INFÉRÉ] = déduit, non rejoué. Aucune requête réelle n'a été faite.

## 1. Constats structurants

1. **GP : le proxy répond avant la route.** Tout `/api/*` non listé dans `PUBLIC_PATHS` (`src/lib/supabase/proxy.ts:20`) répond **307 → /login** sans session (`:112-116`) [LU]. Les 401 écrits dans les routes GP ne sont jamais atteints par un anonyme.
2. **GP : les refus métier sont des `redirect()`** levés par `getContexteEntreprise()` (`src/lib/entreprise.ts`), donc **307 HTML** depuis un route handler (confirmé par `node_modules/next/dist/docs/.../redirect.md` : 307 hors Server Action). Cibles : `/login` :125, `/onboarding` :157/:161, `/abonnement-suspendu` :182, `…?motif=essai_expire` :189, `/en-attente` :202.
3. **GP : le proxy redirige aussi les refus de droit** en 307 (`/abonnement/module-non-inclus` :254-256 ; `/dashboard?acces=refuse` :259-263 ; 303 `?lecture=seule` :265-268) pour les préfixes de `src/lib/module-permissions.ts:1-26` (`/api/documents`, `/api/employes`, `/api/exports`, `/api/notes-frais`, `/api/paie/*`) [LU].
4. **Colors : le proxy n'authentifie rien** (`apps/colors/src/proxy.ts:84`, rafraîchit la session). Tout vient de la route : `getContexteColors()` → `redirect()` (`apps/colors/src/lib/contexte.ts:49,55,57`) = 307 HTML.
5. **Réserves et Studio répondent déjà en JSON** (401/403/404/409/503). Studio est le modèle : `MediaError(status)` + `restErrorStatus` (`src/lib/media-service.ts:26-76`, `rest-status.ts`).
6. **Aucun `code` stable** (sauf OCR Colors). Champ message : `error` (GP, Réserves, Studio) vs `erreur` (Colors, export plateforme).
7. `apps/tools` n'a aucune route serveur (`next.config.ts:10`, export statique) ; ses appels visent `/api/tools/monetization/*` **de GP**.

## 2. Tableau

| App | Route | non connecté | sans droit / sans entreprise | suspendu | erreur interne | Verdict |
|---|---|---|---|---|---|---|
| GP | ~20 routes via `getContexteEntreprise()` non rattrapé : `devis/[id]/pieces-jointes/*`, `devis/pieces-jointes/[id]`, `documents/[id]`, `documents/{devis,factures}/[id]/pdf`, `employes/[id]/{carte-btp,photo,signature}`, `exports/comptabilite`, `fiches-techniques/[id]`, `inventaires/[id]/cloture`, `messagerie/pieces-jointes/*`, `mon-espace/carte-btp`, `notes-frais/[id]/justificatif`, `notes-frais/documents/[id]`, `paie/documents/[id]`, `assistant/chat`, `rgpd/export`, `stripe/oauth/callback` | **307 /login (proxy)** | proxy 307 sur préfixes protégés (§1.3) ; sinon route : 403 JSON (`exports/comptabilite`, `inventaires`, `assistant`, self-check employé) ou 404 JSON (RLS) ; **sans entreprise 307 /onboarding, en attente 307 /en-attente** | **307 /abonnement-suspendu** (essai expiré : 307 sauf `rgpd/export`, `acces-socle-essai.ts:188`) | exception non rattrapée = 500 Next générique ; 404/502/503 JSON explicites | 307 HTML (proxy + `redirect()`) |
| GP | `notes-frais/upload`, `notes-frais/exports`, `paie/documents/upload`, `paie/periodes/[id]/export` | 307 (proxy) | idem ; 403 JSON sur droit | **400 JSON « Import/Export impossible »** : `getContexteEntreprise()` dans le `try`, le `NEXT_REDIRECT` est avalé (`notes-frais/upload/route.ts:20,156-158` ; `notes-frais/exports/route.ts:21,45` ; `paie/documents/upload/route.ts:14,50-52` ; `paie/periodes/[id]/export/route.ts:37,85-87`) + `console.error` | 400 | 400 trompeur (jamais 5xx) |
| GP | `notes-frais/exports/[id]`, `identification/[id]/qr`, `referentiels/vehicules` (n'appellent pas `getContexteEntreprise`) | 307 (proxy) | 404 (RLS) | **non bloqué** (aucun contrôle d'abonnement) [LU] | 500 | 307 / incohérence suspension |
| GP | `auth/mfa/unenroll` | 307 (proxy ; son 401 :10 est inatteignable pour un anonyme) | 403 JSON | n/a | 503/400 JSON | OK sauf proxy |
| GP | `plateforme/entreprises/export` | 307 (proxy) | non-admin : **404 texte** (voulu) ; rôle : 403 JSON `erreur` | n/a | 503 JSON ; erreur RPC habilitation → 404 | Acceptable |
| GP | `tools/monetization/{checkout,portal,apple/verify,google/verify}` (Bearer), `catalog` (public) | **307 /login (proxy)** avant le 401 de la route | — | — | 409/503 JSON | **À vérifier : absents de `PUBLIC_PATHS`** (voir §3-G) |
| Colors | `api/acces` | 307 login (`getContexteColors()` hors `try`, `acces/route.ts:7`) | 403 JSON `{autorise:false}` (`:12-14`) ; sans org 307 /acces-refuse | 403 JSON (même corps) | throw → 500 | OK sauf 307 amont |
| Colors | `api/photos`, `api/export/inventaire`, `api/ocr` | 307 (contexte.ts:49) | sans org 307 /acces-refuse ; sans rôle 403 JSON `erreur` | **`AccesApplicationRefuseError` non rattrapée → 500** (`photos:14`, `export/inventaire:35`, `ocr:41`). **Toujours vrai sur ce tip** | RPC KO = `Error` simple → 500 ; export : 500 JSON (`:55`) | 307 + 500 |
| Réserves | `offline/mutations`, `offline/photo` | **401 JSON** (`mutations:66-68`, `photo:30-32`) ; auth injoignable 503 | sans org = « anonyme » → **401** (`identite.ts:50`) ; A sous B : 200 `refus` / 403 `issue:refus` | pas de contrôle TS ; la RPC refuse → 200 `resultats[].issue=refus` [INFÉRÉ, SQL `reserves_role_courant` exige `a_acces_application`] | 200/503 | OK (401/503) ; « anonyme » confondu |
| Réserves | `documents/chantier/[id]/pdf` | **401 JSON** (`:35`) | 404 (anti-énumération, **asserté** `reserves-v6-securite.spec.ts:103-109`) | 404 [INFÉRÉ] | **erreur RPC ignorée → 404** (`:37-41`) ; PDF KO 502 | OK / P2 |
| Réserves | `offline/ping` (204), `cron/notifications` (Bearer, 401/503) | public | — | — | 500 JSON | public légitime |
| Studio | `projects/[[...path]]`, `media/[...path]`, `timelines/[projectId]`, `renders/[projectId]`, `analysis/[projectId]` | **401 JSON** « Connexion requise. » (`media-service.ts:35`) ; POST sans Origin : 403 | 403/404 JSON (`:55,:68-69`), archivé 409 | pas d'abonnement ; kill-switch = **503 JSON + Retry-After** (`proxy.ts:22-27`) | catch-all JSON 500/503 (`analysis`/`renders` : tout inconnu → 503) | **OK** (sans `code`) |

**Publics légitimes (non classés)** : GP `stripe/webhook`, `stripe/abonnement/webhook`, `stripe/boutique/webhook` (signature, 400/503), `cron/abonnements`, `cron/notifications-push` (Bearer, 401/503/404), `webhooks/notifications-push` (secret), `paie/import` (secret), `paiements-bancaires/powens/callback`, `documents/partage/[token]/pdf`, `auth/callback` ; Colors et Réserves `auth/callback` ; Réserves `offline/ping`, `cron/notifications`. Pas de `/api/health`.

## 3. Correctifs candidats

**A. Colors : attraper `AccesApplicationRefuseError` (3 routes) — trivial et sûr.** `photos/route.ts:14`, `export/inventaire/route.ts:35`, `ocr/route.ts:41` (déjà fait dans `acces/route.ts:8-16`) :
```ts
try { await exigerAccesApplication(contexte, "colors"); }
catch (e) { const r = refusDepuisErreurAcces(e); if (r) return reponseRefusApi(r, { champMessage: "erreur" }); throw e; }
```
Régression : faible. Seul appelant UI = `PhotoUploader.tsx:10` (lit `resultat.erreur`, plante aujourd'hui sur corps vide et reste « Envoi… »). **Contrainte** : `apps/colors/src/lib/securite-ecritures.test.ts:110-118` grep littéralement `getContexteColors()` et `exigerAccesApplication(contexte, "colors")` dans chaque route : garder ces chaînes dans la route (ne pas les déplacer dans un helper). E2E existants (`colors-parcours-authentifies.spec.ts:267,396`) ne testent que le chemin autorisé. Test unitaire : sur le helper du package.

**B. Proxy GP : 401 JSON pour `/api/*` — sûr seulement en version conditionnelle.** `src/lib/supabase/proxy.ts:112-116` : si `pathname.startsWith("/api/")` **et** `sec-fetch-mode !== "navigate"` (ou `accept` sans `text/html`) → `Response.json({error, code:"non_authentifie"}, 401, no-store)` ; sinon redirect inchangé. Un 401 aveugle dégraderait les liens `<a href="/api/documents/…/pdf">`, `/api/rgpd/export`, `/api/inventaires/…/cloture` (navigation : l'utilisateur verrait du JSON brut au lieu de la page login). Clients `fetch` (`AssistantIA.tsx:152`, `ExpenseDocumentUploader.tsx:69`, `DevisEditor.tsx:296-334`, `ZoneReponseMessagerie.tsx`, `MfaSecurityPanel.tsx:90`) : aujourd'hui `fetch` suit le 307 puis `.json()` sur du HTML lève « Unexpected token '<' » affiché tel quel (sauf AssistantIA qui a un `.catch`) — le 401 JSON les améliore. Tests : `tests/e2e/security.spec.ts:19-21` accepte 401 ; le SW GP (`public/sw.js:30-70`) ignore les statuts d'API ; décision extractible dans `routage-proxy.ts` (déjà testé).

**C. Colors : 307 amont.** Vient de `getContexteColors()`, pas du proxy. Correctif propre = variante sans redirection (`lireContexteRefus` existe, `contexte.ts:91`) → 401/403 JSON. **Non trivial** (4 routes + test grep ci-dessus).

**D. GP `getContexteEntrepriseApi()` (suspendu → 423, sans entreprise → 403, en attente → 403) — non trivial.** Scinder `getContexteEntreprise` en noyau + adaptateur `redirect` ; les ~25 routes changent. Corrige aussi les 4 routes qui avalent le redirect. **Ne pas** simplement sortir l'appel du `try` (ni `unstable_rethrow`) : `ExpenseDocumentUploader` passerait d'un 400 JSON lisible à un 307 HTML illisible. `entreprise.test.ts` teste les redirections (à conserver pour les pages). Défaut voisin : `entreprise.ts:130-158`, une erreur transitoire sur `utilisateurs` → `profil` nul → `redirect("/onboarding")`.

**E. Réserves `resoudreIdentite` : « anonyme » vs « sans organisation ».** `identite.ts:39,45,50` renvoie `anonyme` pour : pas de session, RPC en erreur 4xx, contexte absent, **utilisateur sans organisation active** → 401 « Authentification requise ». Le client hors-ligne (`lib/offline/synchronisation.ts`) : `401` → issue `reseau` « Session expirée : reconnectez-vous » (`:114-116`, `:150-156`) ; `503` → `reseau` « réessai » ; toute autre réponse sans `resultats` (lot) ou sans `issue` (photo) → `reseau` « Réponse illisible » / « Dépôt interrompu ». Or `etatApresReponse` (`contrat.ts:241-252`) renvoie `en_attente` pour `reseau` tant que `tentatives < TENTATIVES_MAX=5` (`:217`) puis `echec` : **aucune perte de données** (mutation conservée, relançable via `reessayer`). Donc passer « sans organisation » à 403 côté serveur seul est **neutre pour la file** (mêmes 5 essais, message différent), et un ancien client déjà en cache reste compatible. Le gain réel exige 10 lignes côté client (403 avec `code` → `refus` + motif ; 423 → `refus` « abonnement »). Risque : moyen (file terrain, `synchronisation.ts` sans test unitaire). Contraintes : l'anonyme reste 401 JSON (`reserves-v6-securite.spec.ts:505-518`) ; le 403 `issue:"refus"` de `photo/route.ts:54-60` reste définitif ; le SW ignore `/api/` (`sw-reserves.js:129`). **Lot séparé, serveur d'abord.**

**F. Réserves PDF : erreur RPC → 503 au lieu de 404** (`documents/chantier/[id]/pdf/route.ts:37-41` ignore `error`). Trivial et sûr : lire `error` → `503`. Le 404 inter-tenant reste (asserté).

**G. Tools monetization hors `PUBLIC_PATHS`** [LU, à confirmer sur pile locale] : les 7 routes Bearer/webhook (`src/app/api/tools/monetization/**`) ne sont ni dans `PUBLIC_PATHS` (`proxy.ts:20`) ni dans `CHEMINS_SANS_SESSION` (`:101`). Un appel Bearer sans cookie ou un webhook Stripe/Apple/Google sortirait en 307 /login avant la route (et le préflight CORS `OPTIONS`). Correctif = ajouter le préfixe aux deux listes ; **non trivial** (surface publique + absence de rate limit anonyme, `rate-limit.ts:39`) : décision produit et vérification réelle d'abord. Voisin : `documents/{devis,factures}/[id]/pdf` sont gardés au proxy par `acces_chantiers` (`module-permissions.ts:3`), pas `acces_devis`/`acces_factures` [INFÉRÉ : intention à confirmer].

## 4. Helper commun proposé — `packages/application-access/src/refus-api.ts` (sans Next)

```ts
export type CodeRefusApi =
  | "non_authentifie" | "session_expiree"
  | "organisation_requise" | "membre_en_attente" | "application_non_autorisee"
  | "habilitation_requise" | "permission_refusee" | "origine_refusee" | "abonnement_requis"
  | "abonnement_suspendu" | "essai_expire"
  | "conflit_etat" | "trop_de_requetes" | "service_indisponible";

export const STATUT_REFUS_API: Record<CodeRefusApi, number> = {
  non_authentifie: 401, session_expiree: 401,
  organisation_requise: 403, membre_en_attente: 403, application_non_autorisee: 403,
  habilitation_requise: 403, permission_refusee: 403, origine_refusee: 403, abonnement_requis: 403,
  abonnement_suspendu: 423, essai_expire: 423,   // droit acquis mais tenant verrouillé par la facturation
  conflit_etat: 409, trop_de_requetes: 429, service_indisponible: 503,
};

export type RefusApi = { code: CodeRefusApi; message?: string; retryAfterSecondes?: number };
export type OptionsRefusApi = { champMessage?: "error" | "erreur"; enTetes?: HeadersInit };

/** JSON `{ [champMessage]: string, code }`, statut = STATUT_REFUS_API[code], `Cache-Control: private, no-store`, `Retry-After` si 429/503. */
export function reponseRefusApi(refus: RefusApi | CodeRefusApi, options?: OptionsRefusApi): Response;

/** AccesApplicationRefuseError → application_non_autorisee ; AccesApplicationIndisponibleError → service_indisponible ; sinon null (l'appelant relance l'erreur). */
export function refusDepuisErreurAcces(erreur: unknown): RefusApi | null;

/** Nouvelle classe, même message que l'actuel `new Error("Vérification d’accès indisponible")` (index.ts:85,105) : évite de reconnaître une panne au texte. */
export class AccesApplicationIndisponibleError extends Error {}
```
Règle : 401 = pas de session ; 403 = pas de droit ; 423 = droit acquis mais abonnement/essai verrouillé ; 503 = panne (jamais 403 ni 500). Additif ; `index.test.ts:82` reste valide. Tests unitaires purs : table code→statut, en-têtes, mapping d'erreur, champ `erreur`.

**Ordre** : helper + A + F ; B (conditionnel) ; D et C ; E serveur puis client ; G après vérification réelle.
