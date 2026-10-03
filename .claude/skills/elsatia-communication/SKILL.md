---
name: elsatia-communication
description: Cadre ELSATIA pour toute production marketing ou réseaux sociaux (Instagram, Facebook, LinkedIn, pages de vente, SEO, lancement, vidéos de démonstration, publicités). Utiliser avant ou avec les skills product-marketing, copywriting, copy-editing, cro, launch, seo-audit, ai-seo, social, content-strategy, marketing-psychology, ig-*, remotion-* et watch. Fixe les garde-fous (aucune publication automatique, aucune donnée client réelle, typographie française, un seul outil d'humanisation).
---

# Communication ELSATIA — garde-fous et aiguillage

Ce skill ne rédige rien lui-même : il fixe les règles et oriente vers le bon skill.
Il prime sur les skills tiers en cas de conflit.

## Garde-fous (toujours)

1. **Rédaction seulement, jamais de publication.** Aucun skill installé n'est
   relié à un compte Instagram, Facebook, LinkedIn, Meta Ads ou à un planificateur.
   Ne pas configurer de MCP, d'API, de Composio, de Publora, de Windsor.ai ou de
   publication automatique. Le skill `social` contient une section « Publishing
   From Your Agent » : **ne pas l'appliquer** dans ce cadre. Julien publie lui-même.
2. **Données fictives uniquement.** Captures, démos et vidéos utilisent une
   entreprise de démonstration (jamais LIRIA CONCEPT réelle ni un client réel),
   des noms, montants, adresses et chantiers inventés. Isolation entre entreprises :
   aucune information d'une entreprise cliente dans un contenu public.
3. **Aucun secret, aucune URL d'administration, aucun identifiant** à l'écran.
   Masquer barres d'adresse internes, e-mails et numéros BTP-….
4. **Promesses vérifiables.** Pas de faux témoignages, chiffres inventés, labels
   ou certifications non obtenus. Ne jamais annoncer une signature qualifiée eIDAS
   ni un audit de sécurité certifié. Tarifs : uniquement ceux validés dans `docs/`.
5. **Français soigné.** Conserver les espaces insécables avant `: ; ! ?` et dans
   « », le vouvoiement par défaut en B2B, l'écriture des montants « 1 250 € HT ».

## Un seul outil d'humanisation

Utiliser **`copy-editing`** (avec `copywriting/references/ai-tells.md`). Le skill
`ig-human` n'est pas installé : il supprime les espaces insécables français et
son lexique est anglais. Les skills `ig-*` ont été corrigés localement pour
renvoyer vers `/copy-editing`.

## Aiguillage

| Besoin | Skill |
|---|---|
| Positionnement, cible, fichier de contexte `.agents/product-marketing.md` | `product-marketing` (à lancer en premier) |
| Textes de page, pages de vente | `copywriting`, puis `cro` |
| Relecture, ton naturel | `copy-editing` |
| Lancement d'une app ou d'un module | `launch` |
| SEO classique / visibilité dans les IA | `seo-audit` / `ai-seo` |
| Calendrier éditorial multi-réseaux | `content-strategy`, `social` |
| LinkedIn (posts B2B, carrousels) | `social` (modèles « LinkedIn Post Templates ») |
| Facebook (pages, groupes locaux) | `social` (couverture limitée, pas de modèles dédiés) |
| Leviers de persuasion | `marketing-psychology` |
| Reels, légendes, carrousels, profil, planning Instagram | `ig-reel`, `ig-caption`, `ig-carousel`, `ig-profile`, `ig-plan` |
| Charte visuelle, palettes, typographies | `ui-ux-pro-max`, `frontend-design`, `web-design-guidelines` (PR #5) |
| Vidéo de démo / Reel animé (code React) | `remotion-create`, `remotion-markup`, `remotion-studio`, `remotion-render`, `remotion-captions` |
| Analyse d'une vidéo existante | `watch` (mode local imposé) |

## Vidéo : précautions

- Les skills Remotion sont des **instructions**, pas un moteur. Rendre une vidéo
  exige un projet Remotion séparé (hors application métier, par ex. dans un
  dossier de travail dédié), Node et Chromium. **Licence Remotion** : gratuite
  pour un individu ou une entreprise ≤ 3 salariés ; au-delà, licence « Company »
  payante obligatoire.
- `watch` est forcé en local par `.claude/settings.json`
  (`WATCH_ENGINE=local`, `WATCH_WHISPER_BACKEND=none`) : aucune image ni piste
  audio n'est envoyée à Gemini, Groq ou OpenAI. Ne pas changer ces valeurs sans
  accord. Ne pas utiliser `--cookies-from-browser`. Supprimer le dossier de travail
  `watch-*` après analyse.
- Voix off IA (ElevenLabs), cartes (MapTiler/Google) : non configurés, ne pas
  demander de clé dans cette mission.

## Livrable attendu

Toujours rendre : le texte final, la plateforme et le format, les visuels à
produire, les points à valider par Julien, et la mention « non publié ».
