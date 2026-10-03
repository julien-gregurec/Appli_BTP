# Équipement Claude pour ELSATIA : rapport d'installation

_Mission du 3 octobre 2026, branche `claude/stoic-shannon-9ax0mp` (mise à jour par avance rapide sur `main` `4f71317`, qui contient la PR #5). Aucun code métier, aucune migration et aucune base de données n'ont été modifiés._

## 1. État trouvé avant installation

| Élément | Constat vérifié |
|---|---|
| Règles du dépôt | `AGENTS.md` (Next.js 16 : lire `node_modules/next/dist/docs/`), `CLAUDE.md` (renvoie à `AGENTS.md`) et `RELAIS_CLAUDE.md`. Aucun de ces fichiers n'a été modifié. |
| Branche | `claude/stoic-shannon-9ax0mp`, partie de `main` (`4d92ddb`). L'arbre de travail était propre. |
| Skills dans le dépôt | Au début de la mission : aucun sur `main`, et la PR [julien-gregurec/Appli_BTP#5](https://github.com/julien-gregurec/Appli_BTP/pull/5) était ouverte. **Elle a été fusionnée le 3 octobre à 10 h 50** (`4f71317`), et cette branche l'intègre. Elle ajoute `vercel-react-best-practices`, `web-design-guidelines`, `supabase-postgres-best-practices`, `stripe-best-practices`, `skills-lock.json`, `.claude/skills/README.md`, et 1 ligne dans `CLAUDE.md`. Ces quatre skills sont **déjà installés** : ils ne sont pas réinstallés, mais ils ont été testés et décrits dans le guide PDF. Pour éviter tout conflit, cette branche ne touche ni `CLAUDE.md`, ni `skills-lock.json`, ni `.claude/skills/README.md`. |
| Plugins | Aucun installé. Le marketplace intégré `anthropic-plugin-directory` (= `anthropics/claude-plugins-official`) est disponible. |
| Skills reconnus (session) | Intégrés : `/code-review`, `/security-review`, `/simplify`, `/run`, `/init`, etc. Skills du compte synchronisés : `anthropic-skills:skill-creator`, `pdf`, `docx`, `pptx`, `xlsx`, `deep-research`, etc. |
| Serveurs MCP | Aucun configuré au départ. Le connecteur GitHub de la session fonctionne. |
| Outils machine (cloud) | Node 22, Python 3, `uv`, `ffmpeg`, Playwright 1.56.1 global avec Chromium et headless shell (`/opt/pw-browsers`). Le binaire `docker` est présent, mais **aucun démon n'est joignable**. `yt-dlp` était absent. |

## 2. Contrôle de sécurité avant installation

Chaque source a été clonée à un commit précis, puis lue avant toute copie. Aucun script distant n'a été exécuté.

| Source | Commit | Licence | Scripts / hooks / réseau | Décision |
|---|---|---|---|---|
| `anthropics/claude-plugins-official` | `d182ca456ca0` (catalogue intégré) | Apache-2.0 | `claude-code-setup` et `frontend-design` sont du Markdown seul. `context7` déclare uniquement un MCP HTTP distant. | Installés. Le cache est identique octet pour octet au commit audité. |
| `claude-security` (même marketplace) | `c447c3207a42`, v0.11.0 | Licence propriétaire Anthropic, usage interne | Hooks locaux : bannière, compteurs locaux, question laissée sans réponse. Aucun appel réseau dans les scripts. | Installé. Lancement manuel uniquement. |
| `security-guidance` (même marketplace) | `d182ca456ca0` | Apache-2.0 | Un hook SessionStart crée un venv et installe le SDK par `pip` à chaque nouvelle machine. Un hook Stop envoie les diffs à un LLM. | **Reporté** : il ajoute une installation automatique et un envoi des diffs à chaque tour. |
| `nextlevelbuilder/ui-ux-pro-max-skill` | `09170eec` | MIT | Python, bibliothèque standard uniquement. Aucun réseau. Écrit seulement avec `--persist`. | Installé : uniquement le skill `ui-ux-pro-max`. Les skills `design` et `banner-design` (API Gemini, lecture de `.env`) et `ui-styling` sont exclus, tout comme la configuration `stack/` (`enableAllProjectMcpServers`, `npx @latest`). |
| `coreyhaines31/marketingskills` | `dda3841f` | MIT | Les skills retenus ne contiennent que du Markdown. Les CLI `tools/` (Meta, LinkedIn et Google Ads) ne sont pas copiées. | Installé : sélection de 10 skills. |
| `Jakeschincariol/instagram-agent-skill` | `d03c56bb` | MIT | Python, bibliothèque standard, local. Aucune API Instagram. La publication est interdite par les skills eux-mêmes. | Installé : 5 skills. |
| `remotion-dev/skills` | `0b5db9da` | Aucun fichier LICENSE, licence Remotion du monorepo | Markdown. Les commandes `npx` sont exécutées seulement à la demande. Le skill de documentation interroge Algolia. | Installé : 5 skills. `remotion-maps` (fichiers .ts/.tsx, clés MapTiler/Google) est retiré. |
| `bradautomates/claude-video` | `03ceb42f` | MIT | Python, bibliothèque standard. Les sous-processus reçoivent leurs arguments sous forme de liste (pas de `shell=True`). Gemini, Groq et OpenAI sont optionnels. | Installé : skill `watch` **sans** son hook SessionStart. Le mode local est imposé (voir §4). |
| `supabase/agent-skills` | `c9be0e93` | MIT | Markdown. Le skill suggère le MCP Supabase et `execute_sql`, ce que le skill ELSATIA interdit vers la Production. | Installé : skill `supabase` (complète `supabase-postgres-best-practices` de la PR #5). |
| `usestrix/strix` | `99c07116` | Apache-2.0 | Le script `curl \| bash` ne vérifie aucune somme de contrôle. Exige un démon Docker. Télémétrie PostHog/Scarf active par défaut. Le code est envoyé au LLM configuré. | **Non installé**, en attente (voir §6). Aucun pentest lancé. |

La provenance exacte, les correctifs locaux et l'empreinte SHA-256 de chaque skill copié se trouvent dans `.claude/skills/ELSATIA-SOURCES.lock.json`. Les licences sont dans `.claude/skills/THIRD_PARTY_LICENSES/`.

## 3. Tableau des installations

Les quatre skills de la PR #5 (`vercel-react-best-practices`, `web-design-guidelines`, `supabase-postgres-best-practices`, `stripe-best-practices`) étaient **déjà installés** et n'ont pas été réinstallés. Ils sont testés et décrits dans le guide PDF (section 8).

Statuts :
- ✅ vérifié : reconnu et testé dans cette session ;
- ⚠️ : installé, mais bloqué ;
- ♻️ : élément existant réutilisé.

| Nom exact | Type | Usage ELSATIA | Priorité | Statut vérifié | Version/source | Emplacement | Commande | Déclenchement automatique | Prérequis/coûts | Permissions/données transmises | Résultat du test |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `claude-code-setup` | Plugin (1 skill) | Recommander hooks, skills et MCP pour le dépôt | Haute | ✅ | 1.0.0, official@d182ca4 | `.claude/settings.json` (projet) | `/claude-code-setup:claude-automation-recommender` | Oui : sélection automatique possible, prouvée par l'outil Skill qui l'accepte (correction, voir §9) | Aucun | Lecture du dépôt, rien n'est transmis hors Claude | 3 recommandations pertinentes (hook lint, sous-agent RLS), aucun fichier écrit |
| `context7` | Plugin (MCP HTTP) | Documentation technique à jour (Next 16, Supabase…) | Moyenne | ⚠️ **bloqué par le réseau** | official@d182ca4 → `https://mcp.context7.com/mcp` | `.claude/settings.json` (projet) | Outils MCP `context7` (noms non observables tant que le serveur est injoignable) | Oui, quand il est connecté | Gratuit en anonyme, `CONTEXT7_API_KEY` optionnelle | Les noms de bibliothèques et les questions partent chez Upstash. Ne jamais y mettre de code client ou de secret. | `claude mcp list` : `ERR_PROXY_TUNNEL`. Le proxy refuse `mcp.context7.com` (403). |
| `frontend-design` | Plugin (1 skill) | Direction artistique des interfaces et pages | Moyenne | ✅ | official@d182ca4 | `.claude/settings.json` (projet) | `/frontend-design:frontend-design` | Oui, sur les demandes d'interface | Aucun | Aucune | Direction visuelle « plan de chantier », palette et typographie, sans code |
| `claude-security` | Plugin (skill + agents) | Scan de vulnérabilités du dépôt, propositions de correctifs | Haute | ✅ reconnu, **scan non lancé** | 0.11.0, catalogue `c447c32` | `.claude/settings.json` (projet) | `/claude-security:claude-security` | **Non** (`disable-model-invocation`) | Coût en tokens élevé lors d'un scan complet | Lecture du dépôt dans la session | Présent dans l'inventaire de la session (`claude-security:claude-security`, `claude-security:scan`). Le scan n'a pas été lancé, conformément à la mission. |
| `ui-ux-pro-max` | Skill + script Python | Design system, palettes, typographies, règles UX/accessibilité, stack Next.js | Moyenne | ✅ | upstream@09170eec (chemins corrigés) | `.claude/skills/ui-ux-pro-max/` | `/ui-ux-pro-max` ; `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<requête>" --design-system` | Oui | `python3` | Aucune (local) | Le script génère un design system « Démo fictive ». Le skill répond en mode headless (le script y demande une approbation). |
| `product-marketing` | Skill | Positionnement, cible, fichier `.agents/product-marketing.md` | Haute | ✅ | marketingskills@dda3841f | `.claude/skills/product-marketing/` | `/product-marketing` | Oui | Aucun | Aucune | Liste les informations à fournir, aucun fichier créé |
| `copywriting` | Skill | Textes de pages de vente et d'accueil | Haute | ✅ | idem | `.claude/skills/copywriting/` | `/copywriting` | Oui | Aucun | Aucune | Titre et sous-titre. Le chiffre fictif est signalé « à remplacer ». |
| `copy-editing` | Skill | **Humaniseur unique** et relecture | Haute | ✅ | idem | `.claude/skills/copy-editing/` | `/copy-editing` | Oui | Aucun | Aucune | Texte « IA » réécrit, avec la liste des changements |
| `cro` | Skill | Conversion des pages de vente | Moyenne | ✅ | idem | `.claude/skills/cro/` | `/cro` | Oui | Aucun | Aucune | 3 recommandations |
| `launch` | Skill | Plan de lancement d'une app ou d'un module | Moyenne | ✅ | idem | `.claude/skills/launch/` | `/launch` | Oui | Aucun | Aucune | Plan en 4 étapes. `elsatia-communication` a été chargé automatiquement. |
| `seo-audit` | Skill | SEO du site vitrine | Moyenne | ✅ | idem | `.claude/skills/seo-audit/` | `/seo-audit` | Oui | Aucun (audit d'URL seulement sur demande) | Aucune sans URL | 4 points, dont « app en `noindex` » |
| `ai-seo` | Skill | Visibilité dans les assistants IA | Basse | ✅ | idem | `.claude/skills/ai-seo/` | `/ai-seo` | Oui | Aucun | Aucune | 3 conseils |
| `social` | Skill | LinkedIn, Facebook, Instagram, calendrier multi-réseaux | Haute | ✅ | idem | `.claude/skills/social/` | `/social` | Oui | Aucun | Aucune (la section « Publishing From Your Agent » est neutralisée par `elsatia-communication`) | Post LinkedIn de 51 mots, mention « non publié » |
| `content-strategy` | Skill | Piliers et calendrier éditorial | Moyenne | ✅ | idem | `.claude/skills/content-strategy/` | `/content-strategy` | Oui | Aucun | Aucune | 4 piliers |
| `marketing-psychology` | Skill | Leviers de persuasion éthiques | Basse | ✅ | idem | `.claude/skills/marketing-psychology/` | `/marketing-psychology` | Oui | Aucun | Aucune | 3 leviers |
| `ig-reel` | Skill + scripts Python | Scripts de Reels (accroches, beat sheet) | Haute | ✅ | instagram-agent-skill@d03c56bb (renvoi vers `/copy-editing`) | `.claude/skills/ig-reel/` | `/ig-reel` | Oui | `python3` | Aucune. Lit `~/.claude/instagram/*.md` s'il existe. | Script avec 3 accroches. `hookscore.py` fonctionne, mais son barème est anglais. |
| `ig-caption` | Skill + script | Légendes Instagram | Haute | ✅ | idem | `.claude/skills/ig-caption/` | `/ig-caption` | Oui | `python3` | Aucune | `caption.py` analyse une légende fictive. L'appel à l'action français n'est pas détecté (heuristique anglaise). |
| `ig-carousel` | Skill | Carrousels 1080×1350 | Haute | ✅ | idem | `.claude/skills/ig-carousel/` | `/ig-carousel` | Oui | Chromium (déjà présent) pour produire les fichiers | Aucune | Plan en 5 slides, aucun fichier généré |
| `ig-profile` | Skill | Bio et profil | Moyenne | ✅ | idem | `.claude/skills/ig-profile/` | `/ig-profile` | Oui | Aucun | Aucune (l'utilisateur colle son profil lui-même) | Bio de 3 lignes et champ nom |
| `ig-plan` | Skill | Calendrier Instagram | Moyenne | ✅ | idem | `.claude/skills/ig-plan/` | `/ig-plan` | Oui | Aucun | Écrit `~/.claude/instagram/plan.md` | Semaine fictive. L'écriture est restée hors du dépôt. |
| `remotion-create` | Skill | Créer un projet vidéo (démo, Reel 9:16) | Haute | ✅ | remotion-dev/skills@0b5db9da | `.claude/skills/remotion-create/` | `/remotion-create` | Oui | Node, licence Remotion (voir §5) | `npx create-video@latest` télécharge un paquet npm | Étapes correctes, rien exécuté |
| `remotion-markup` | Skill | Animations, transitions, textes | Haute | ✅ | idem (sans `remotion-maps`) | `.claude/skills/remotion-markup/` | `/remotion-markup` | Oui | idem | Aucune | Fondu sur 20 images (`interpolate`) |
| `remotion-studio` | Skill | Prévisualisation | Moyenne | ✅ | idem | `.claude/skills/remotion-studio/` | `/remotion-studio` | Oui | idem | Aucune | `npx remotion studio [--no-open]` |
| `remotion-render` | Skill | Export MP4 | Haute | ✅ | idem | `.claude/skills/remotion-render/` | `/remotion-render` | Oui | Chromium (headless shell déjà présent) | Aucune | `npx remotion render <id> out/video.mp4` |
| `remotion-captions` | Skill | Sous-titres (SRT, affichage) | Moyenne | ✅ | idem | `.claude/skills/remotion-captions/` | `/remotion-captions` | Oui | La transcription locale exige un GPU | Aucune (la transcription Whisper WebGPU est locale) | Import SRT via `parseSrt` |
| Moteur Remotion (essai) | Dépendances npm hors dépôt | Prouver le rendu réel | — | ✅ **essai réussi** | `remotion` et `@remotion/cli` 4.0.532, React 19.2.4 | Espace de travail temporaire de la session (non versionné) | `npx remotion render src/index.ts DemoReel out/demo-reel.mp4 --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell` | — | 252 paquets npm installés avec `--ignore-scripts` | Aucune | MP4 h264 de 1080×1920, 2 s, texte « Démo fictive — 1 250 € HT » contrôlé visuellement |
| `watch` | Skill + scripts Python | Analyser une vidéo (démo, Reel concurrent public) | Moyenne | ✅ | claude-video@03ceb42f, v0.3.2 | `.claude/skills/watch/` | `/watch <fichier ou URL> "question"` | Oui | `python3`, `ffmpeg` (présent), `yt-dlp` (installé : 2026.8.19 via `uv tool`) | **Mode local imposé** : aucune image ni aucun son envoyé. `yt-dlp` contacte seulement la source d'une URL. | Vidéo fictive de 6 s analysée : 1 image extraite, transcription désactivée |
| `supabase` | Skill | Auth, RLS, Storage, SSR Supabase | Haute | ✅ | supabase/agent-skills@c9be0e93 | `.claude/skills/supabase/` | `/supabase` | Oui | Aucun | Aucune. MCP et `execute_sql` interdits vers la Production par `elsatia-securite`. | 4 points de contrôle RLS, aucun accès base |
| `elsatia-securite` | Skill personnalisé | Audit sécurité en lecture seule : secrets, auth, autorisations, RLS, Storage, entrées, abus | Haute | ✅ | Créé dans ce dépôt | `.claude/skills/elsatia-securite/` | `/elsatia-securite` | Oui | Aucun | Lecture du code | Déclenché automatiquement. Audit de `admin.ts` : propose `import "server-only"`. |
| `elsatia-communication` | Skill personnalisé | Garde-fous marketing et aiguillage | Haute | ✅ | Créé dans ce dépôt | `.claude/skills/elsatia-communication/` | `/elsatia-communication` | Oui (chargé seul lors des tests Reel, LinkedIn, lancement et légende) | Aucun | Aucune | Aiguillage Facebook → `social` + `copy-editing`, mention « non publié » |
| `/code-review` | ♻️ Skill intégré | Revue de diff ou de PR | Haute | ✅ existant | Claude Code 2.1.288 | Intégré | `/code-review [low…max] [--comment]` | Non | Aucun | Aucune | Présent dans l'inventaire. Le plugin `code-review` n'est pas installé : il dépend de `gh`, indisponible ici. |
| `/security-review` | ♻️ Skill intégré | Revue sécurité de la branche | Haute | ✅ existant | idem | Intégré | `/security-review` | Non | Aucun | Aucune | Présent dans l'inventaire |
| `anthropic-skills:skill-creator` | ♻️ Skill du compte | Créer des procédures ELSATIA | Haute | ✅ existant | Synchronisé depuis le compte claude.ai | `~/.claude/skills/synced/…` | `/anthropic-skills:skill-creator` | Oui | Aucun | Aucune | Présent dans l'inventaire. Le plugin `skill-creator` n'est pas installé, pour éviter un doublon. |
| Playwright | ♻️ CLI préinstallé | Captures et tests navigateur sur données fictives | Haute | ✅ existant | `playwright` 1.56.1, Chromium 1194 | Image cloud (`/opt/node22`, `/opt/pw-browsers`) | `NODE_PATH=$(npm root -g) node script.cjs` ou skill `/run` | — | Aucun dans le cloud | Aucune | Page HTML fictive ouverte, titre lu, capture 390×844 produite. Le MCP Playwright (`@playwright/mcp@latest`, version non épinglée) n'est pas installé. |

## 4. Configuration ajoutée

`.claude/settings.json` (nouveau fichier projet, sans permission globale ni secret) :

- `enabledPlugins` : `claude-code-setup`, `context7`, `frontend-design` et `claude-security` (marketplace `anthropic-plugin-directory`).
- `env` : `WATCH_ENGINE=local` et `WATCH_WHISPER_BACKEND=none`. Ces deux variables empêchent `watch` d'envoyer la vidéo à Gemini ou l'audio à Groq/OpenAI, même si une clé était présente un jour.

Correctifs locaux apportés aux skills tiers (tous listés dans `ELSATIA-SOURCES.lock.json`) :
- `ui-ux-pro-max` : les chemins `${CLAUDE_PLUGIN_ROOT}` sont remplacés par `.claude/skills/...`. Les tests, le validateur et 1,2 Mo de catalogues de maintenance sont retirés.
- `ig-*` : les renvois `/ig-human` pointent vers `/copy-editing`, l'unique humaniseur.
- `remotion-markup` : le sous-dossier `remotion-maps/` est retiré (il contenait des fichiers `.ts/.tsx` qui auraient été compilés par `tsc` et ESLint en CI).

## 5. Disponibilité selon l'environnement

| Élément | Cette session | Nouvelle session cloud | Poste local |
|---|---|---|---|
| Skills `.claude/skills/*` | ✅ | ✅ sur cette branche, puis partout après fusion | ✅ après `git pull` |
| Plugins (`enabledPlugins`) | ✅ installés | Déclarés dans le projet. L'installation automatique au démarrage **n'a pas été vérifiée**. À défaut : `claude plugin install <nom> --scope project`. | Le nom du marketplace peut différer (`claude-plugins-official`) : `/plugin install context7@claude-plugins-official`, etc. |
| `context7` | ⚠️ bloqué par le réseau | Bloqué tant que le domaine n'est pas autorisé | Devrait fonctionner (non testé) |
| `watch` | ✅ | `yt-dlp` à réinstaller (`uv tool install yt-dlp==2026.8.19`), car le conteneur est éphémère | `python3`, `ffmpeg`, `yt-dlp` à installer |
| Rendu Remotion | ✅ (essai) | À refaire dans un dossier dédié (§ guide) | Node + Chrome headless (téléchargé par Remotion) |
| Playwright | ✅ préinstallé | ✅ préinstallé dans l'image cloud | `npm i -g playwright@1.56.1 && npx playwright install chromium` |

**Licence Remotion** : gratuite pour un individu, une entreprise de 3 salariés au plus, une association, ou pour une évaluation. Au-delà, une **licence Company payante** est obligatoire avant tout usage commercial. Ce point est à confirmer selon l'effectif d'ELSATIA.

## 6. Connecteurs non configurés et éléments en attente

**Connecteurs non configurés (volontairement)**
- Aucune connexion à Instagram, Facebook, LinkedIn, Meta Ads, Windsor.ai ni à un outil de publication automatique. Les skills rédigent, Julien publie.
- MCP Supabase : non configuré. Aucun accès Production n'a été accordé.
- Context7 : installé, mais **bloqué par la politique réseau** de l'environnement cloud. Pour le débloquer, ouvrir le menu de l'environnement cloud, choisir **Edit**, puis **Network access** → **Custom**, et ajouter `mcp.context7.com` aux domaines autorisés en conservant la liste par défaut ([documentation](https://code.claude.com/docs/en/cloud-environments#network-access)).
- Gemini, Groq, OpenAI (pour `watch`), ElevenLabs (voix off), MapTiler/Google (cartes) : aucune clé demandée ni configurée.

**Recherches sans installation**
- **LinkedIn** : couvert par `social`, qui fournit des modèles de posts LinkedIn. Le dépôt dédié `sergebulaev/linkedin-skills` (MIT) n'est pas installé : il embarque des clients de planification (Publora, Apify) et sert d'entonnoir commercial.
- **Facebook** : aucun skill dédié de source fiable n'a été trouvé. La couverture se limite à `social` (section Facebook, sans modèle). **Manque documenté.**
- `ig-human`, `ig-dm`, `ig-comment`, `ig-reply`, `ig-viral`, `ig-audit` et `ig-story` ne sont pas installés : ils feraient doublon avec l'humaniseur, ou relèvent de l'interaction avec le compte.
- `ad-creative` et `video` (marketingskills) ne sont pas installés : ils renvoient vers les intégrations Ads, des clés API et des `npx` d'outils tiers.

**Recommandations en attente**
- **Strix** (Apache-2.0) : en attente. Prérequis : démon Docker joignable (absent ici), Python 3.12+ et `pipx install strix-agent==<version épinglée>` (plutôt que `curl | bash`, qui ne vérifie aucune somme de contrôle), image `ghcr.io/usestrix/strix-sandbox:1.3.0`, `STRIX_LLM` + `LLM_API_KEY`, `STRIX_TELEMETRY=false`. Cible : **code local et environnement de test uniquement**, jamais la Production, et seulement dans une mission dédiée.
- `security-guidance` (officiel) : à réévaluer. Ses hooks installent un SDK par `pip` et envoient les diffs à un LLM à chaque fin de tour.
- `trailofbits/skills` (`insecure-defaults`, `sharp-edges`) : pertinents pour les secrets et les configurations. La licence **CC-BY-SA-4.0** (partage à l'identique) est à valider avant copie.
- Reportés conformément à la mission : OmniRoute, ClaudeMem, Headroom, Task Observer, Claude Squad, et toute installation massive de catalogue.

## 7. Vérifications effectuées

- Le contenu des plugins installés est identique au commit audité (`diff -r`). Seul le marqueur `.in_use` diffère.
- Une session Claude non interactive (`claude -p`) a été lancée dans le dépôt. L'événement `init` liste les 25 skills du projet et les skills des plugins. `context7` y apparaît avec le statut `failed`.
- 35 essais de déclenchement ont porté sur des données fictives (27 automatiques ou par commande, puis 8 appels explicites). Ils ont tous réussi, sans aucune écriture dans le dépôt. Constat : sur des questions très courtes, Claude répond parfois sans charger le skill. **Utiliser la commande `/nom` pour forcer le skill.**
- Skills de la PR #5 : trois répondent conformément en appel explicite. `web-design-guidelines` se charge, mais il doit télécharger ses règles (URL joignable, code 200) : l'outil WebFetch est à autoriser quand Claude le demande.
- `npm run verify` (nettoyage, typecheck, lint, tests, migrations, secrets, build) : voir le résultat dans la description de la PR.

## 8. Guides PDF

- `docs/claude/ELSATIA_Guide_detaille_skills.pdf` : « ELSATIA — Guide détaillé des skills installés » (84 pages, 63 fiches, sommaire paginé, liens internes).
- `docs/claude/ELSATIA_Aide-memoire_commandes.pdf` : « ELSATIA — Aide-mémoire des commandes » (3 pages).
- Source modifiable des deux : `docs/claude/guide-pdf/skills_data.py`. Régénération : `python3 docs/claude/guide-pdf/build_guide.py` (voir `docs/claude/guide-pdf/README.md`).

## 9. Vérification finale (3 octobre 2026, vers 13 h 15 UTC)

- **PR** : la PR #6 est ouverte, non fusionnée et sans conflit avec `main`. La PR #5 est fusionnée dans `main` (`4f71317`).
- **CI** : `verification` est verte. Les Previews Vercel sont en échec « Deployment rate limited — retry in 24 hours » depuis 11 h 05 UTC (quota du plan gratuit). Cette session n'a pas accès à Vercel et ne peut donc pas relancer une Preview précise ; chaque push redéclenche les tentatives automatiquement.
- **Sélection automatique** : 33 sessions neuves avec des demandes réalistes, sans commande slash.
  - Observée pour 17 skills.
  - Non observée pour 14 skills, dont la configuration permet pourtant la sélection automatique : ils restent classés « automatique possible », jamais « manuel ».
- **Mode manuel** : seul `claude-security:claude-security` est manuel uniquement. Preuve : son en-tête, et le refus de l'outil Skill.
- **Correction** : `claude-code-setup:claude-automation-recommender` avait été classé à tort « manuel uniquement ». La ligne `disable-model-invocation: true` relevée est un exemple situé dans le corps de son SKILL.md (ligne 188), pas dans l'en-tête. L'outil Skill l'accepte.
- **`watch`, transcription audio** : essai sur une vidéo fictive parlée (synthèse vocale locale espeak-ng, sans sous-titres).
  - Avec le réglage du projet, la transcription est désactivée et rien n'est envoyé à l'extérieur.
  - WhisperX n'a pas pu être installé : `download.pytorch.org` et `huggingface.co` sont refusés (403). La transcription locale n'est **pas validée** dans le cloud ; elle reste installable sur un poste local.
- **Context7** : `mcp.context7.com` et `context7.com` sont refusés (403) par la passerelle réseau. Une variante locale (`npx @upstash/context7-mcp`) interrogerait le même domaine. Seule solution permise : autoriser ces domaines dans les réglages réseau de l'environnement. La politique réseau n'a pas été contournée.
