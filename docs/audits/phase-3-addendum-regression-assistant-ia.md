# Addendum phase 3 — Régression pièces jointes de l'assistant IA

**Date** : 31 juillet 2026
**Branche** : `release/commercialisation-v1`
**Statut** : régression confirmée et corrigée, tests ajoutés, validation exécutée dans cet environnement (Docker/Playwright disponibles ici — voir limite en fin de document).

## Régression détectée

Signalée par une analyse en lecture seule menée dans le worktree Claude
(`/Users/juliengregurec/Projects/liria-claude`), comparant `main` et
`release/commercialisation-v1` sur la route `POST /api/assistant/chat`.

## Cause exacte

Le durcissement générique appliqué à cette route (`lireJsonBorne`, fonction
`verifierTailleRequete`) plafonnait le corps HTTP entier à 64 Ko
(`TAILLE_MAX_REQUETE = 64 * 1024`), avant même le parsing JSON. Or la pièce
jointe (photo, PDF) est envoyée inline en base64 dans le même corps JSON que
l'historique de conversation — jamais par upload séparé ni URL signée. Le
plafond dédié aux pièces jointes (`TAILLE_MAX_PIECE_JOINTE_BASE64 = 8 000 000`
caractères, ≈ 6 Mo décodés) restait inchangé dans le code mais devenait
inatteignable : tout fichier réel dépassait 64 Ko une fois encodé, bien avant
d'atteindre ce second contrôle.

## Comportement avant correction (démontré empiriquement)

Le fichier `route.ts` original a été temporairement restauré (`git show
HEAD:...`, hors commit, purement local) pour exécuter les nouveaux tests
ajoutés ci-dessous contre le code non corrigé, puis le correctif a été
restauré. Résultat observé :

| Cas | Attendu | Obtenu avant correction |
|---|---|---|
| Message texte seul | 200 | 200 |
| JPEG 500 Ko | 200 | **413** |
| PDF 1 Mo | 200 | **413** |
| Pièce jointe > 6 Mo | 400 (message dédié) | 413 (mauvais mécanisme) |
| Texte abusif 70 000 caractères | 400 | 413 (mauvais mécanisme) |

Après restauration du correctif, les 8 tests de
`src/app/api/assistant/chat/route.test.ts` passent, avec les codes attendus
ci-dessus.

## Correction appliquée

Nouveau module `src/lib/ai/validation.ts`, dédié à cette route, avec des
constantes séparées (au lieu de réutiliser le plafond générique 64 Ko) :

- `NOMBRE_MAX_MESSAGES = 30` (inchangé)
- `TAILLE_MAX_TEXTE_MESSAGE = 4 000` caractères par message (nouveau — protège
  contre un texte abusif sans dépendre du plafond global du corps)
- `TAILLE_MAX_PIECE_JOINTE_BASE64 = 8 000 000` caractères (inchangé, filtre
  rapide avant décodage)
- `TAILLE_MAX_PIECE_JOINTE_OCTETS = 6 000 000` octets (nouveau — vérification
  précise de la taille réellement décodée, via `Buffer.byteLength`)
- `TAILLE_MAX_CORPS_ASSISTANT = 30 × 4 000 + 8 000 000 + 20 000` ≈ 8,14 Mo
  (nouveau — plafond du corps HTTP entier spécifique à cette route,
  remplace `TAILLE_MAX_REQUETE` générique pour cette route uniquement)

Fonction `validerRequeteAssistant()` : validation métier après parsing —
nombre de messages, longueur du texte par message, une seule pièce jointe
autorisée et uniquement sur le dernier message (une pièce jointe sur un
message antérieur est explicitement refusée), type MIME, longueur base64,
**validité du base64** (`estBase64Valide`, vérifiée par aller-retour
décodage/réencodage plutôt que par expression régulière — une regex à
groupe répété a provoqué un `RangeError: Maximum call stack size exceeded`
sur une chaîne de plusieurs mégaoctets pendant les tests, détail documenté
dans le code), taille décodée réelle.

`route.ts` : `lireJsonBorne` utilise désormais `TAILLE_MAX_CORPS_ASSISTANT`
(spécifique) au lieu du plafond générique de 64 Ko. Le plafond générique
`TAILLE_MAX_REQUETE` des autres routes JSON n'a pas été modifié.

## Limites confirmées après correction

- **Limite texte** : 4 000 caractères par message, 30 messages maximum par
  conversation.
- **Limite fichier brut (décodé)** : 6 000 000 octets (~5,72 Mio, cohérent
  avec le message déjà affiché à l'utilisateur : « 6 Mo maximum »).
- **Limite du corps HTTP total de la route** : ≈ 8,14 Mo (spécifique à
  `/api/assistant/chat`, ne s'applique à aucune autre route).
- **Types MIME acceptés** : `image/jpeg`, `image/png`, `image/gif`,
  `image/webp`, `application/pdf` (`MIME_ANALYSABLES_IA`, inchangé).

## Protections conservées (non affaiblies)

Rate limiting utilisateur/entreprise sur cette route (`src/lib/security/rate-limit.ts`,
inchangé), limite de nombre de messages, validation MIME, quotas IA quotidiens
(`verifierPlafondIA`), contrôle des permissions (`aAccesIA`), neutralisation des
erreurs internes (`erreurPublique`, inchangé). Un corps HTTP réellement démesuré
(testé à 9 Mo de contenu arbitraire) continue de recevoir un 413 avant tout
traitement.

## Tests ajoutés

- `src/lib/ai/validation.test.ts` — 20 tests unitaires purs (aucune dépendance
  réseau) : message normal, 50 Ko/500 Ko/1 Mo/6 Mo/>6 Mo, MIME interdit,
  historique >30 messages, texte abusif, base64 invalide, pièce jointe hors
  dernier message, cohérence des constantes.
- `src/app/api/assistant/chat/route.test.ts` — 8 tests d'intégration appelant
  le vrai gestionnaire `POST` avec de vraies `Request`/`ReadableStream`
  (Supabase et le fournisseur IA sont mockés ; **aucun appel réseau réel,
  aucun appel OpenAI réel**). Démontre la régression sur le code d'origine
  (voir tableau ci-dessus) puis sa correction.
- `tests/e2e/security.spec.ts` — test existant « assistant refuse un payload
  trop volumineux » corrigé (attend désormais 400, pas 413 — changement de
  mécanisme légitime, toujours refusé). Cinq tests ajoutés : corps brut
  démesuré (413 conservé), pièce jointe JPEG 500 Ko acceptée, pièce jointe
  > 6 Mo refusée avec message explicite, type MIME interdit refusé. Rate
  limiting (test existant « référentiel véhicule retourne 429 ») non modifié.

## Résultats des validations exécutées

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` | Réussi, 0 erreur |
| `npm run lint` | Réussi, 0 erreur (3 avertissements `<img>` préexistants, hors périmètre) |
| `npm run test` (Vitest) | 36 fichiers, 156 tests, tous réussis |
| `npm run build` | Réussi |
| `npm audit --omit=dev` | 0 vulnérabilité |
| `git diff --check` | Propre |
| Playwright (navigateur, `npm run test:e2e`) | **Non exécuté dans ce lot** — voir limite ci-dessous |

## Limite de cet addendum

Docker et les navigateurs Playwright sont disponibles dans cet environnement
d'exécution, mais `npx supabase start` a échoué : le port PostgreSQL local
(54322) est déjà occupé par un projet Supabase nommé `liria-phase2-recette`,
manifestement une instance déjà active. Conformément à la consigne de ne pas
interférer avec le travail de Codex, cette instance n'a pas été arrêtée et
aucune tentative de reconfiguration de port n'a été faite. Les tests
Playwright ajoutés dans `tests/e2e/security.spec.ts` sont donc **écrits et
prêts, mais non exécutés dans ce lot**. La preuve de correction repose ici sur
les tests d'intégration Vitest (`route.test.ts`), qui appellent le vrai
gestionnaire de route avec de vraies requêtes HTTP et démontrent empiriquement
le comportement avant/après — mais ne remplacent pas une exécution navigateur
complète avec authentification réelle. À exécuter dès que l'instance
`liria-phase2-recette` sera libérée ou qu'un port dédié sera disponible.

## Formulation correcte pour le manuel utilisateur

*« Vous pouvez joindre une photo ou un PDF (jusqu'à 6 Mo) à votre demande. »*
— cette formulation reste valable après correction, sur `main` comme sur
`release/commercialisation-v1`.
