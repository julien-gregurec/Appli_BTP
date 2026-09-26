# ⚠️ NE PAS DÉPLOYER NI FUSIONNER LA BRANCHE `main`

**`main` (dépôt `julien-gregurec/Appli_BTP`) est une branche obsolète pré-ELSATIA. Ne pas la
déployer, ne pas la fusionner, ne pas la définir comme « Production Branch » Vercel.**

## État constaté (2026-09, lots ELSATIA-COMMERCIAL-RECONCILIATION-V1 / -TARIFICATION-CANONICAL-ALIGNMENT-V1)

- `merge-base(main, branche de release)` = `4d92ddb` (2026-07-29).
- Divergence : **~692 fichiers, +61 780 / −1 413 lignes**.
- Absents de `main` : rebranding **ELSATIA** (marque, logo, wordmark), application **Colors**
  (`apps/colors/**`) entière, **MFA / AAL2**, réconciliation **ACL**, lots R7.x, tests e2e
  sécurité, Storage DR, etc.
- `main` porte encore : marque **« Liria Gestion Pro V3 »** (`src/app/page.tsx`,
  `src/components/PiedLegal.tsx`), `mailto:contact@liria-gestion-pro.fr` et le logo
  `/liria-gestion-pro-logo-v5.png` (`src/app/tarifs/page.tsx`) ; **grille tarifaire obsolète
  79/249/449 avec annuel × 12**.

Un déploiement ou un merge depuis `main` ferait **régresser marque, prix, sécurité et
périmètre applicatif** en Production.

## Branche de release réelle

La Production `app.elsatia.fr` sert la branche canonique de release (`feat/elsatia-canonical-*`).
Vérifier dans Vercel → Project Settings → Git → **Production Branch** qu'elle **n'est pas**
`main`.

## Marche à suivre

1. **Immédiat** : protection de branche GitHub sur `main` (interdire push direct, exiger PR) ;
   vérifier l'épinglage Vercel.
2. **Avant toute promotion** : `git tag archive/liria-main-2026-07 <sha actuel de main>` pour
   conserver l'historique.
3. **Promotion contrôlée (opération dédiée, autorisation explicite)** : `main` → fast-forward
   ou `reset --hard` vers le commit canonique validé, **ou** renommer la branche canonique en
   `main` et archiver l'ancienne.

Ne rien fusionner sans autorisation explicite.
