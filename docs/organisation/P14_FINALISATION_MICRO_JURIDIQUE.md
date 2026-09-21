# P14 — Finalisation juridique de la micro-entreprise ELSATIA

Lot exécuté le 21-08-2026. Objectif : avancer sur tout ce qui ne dépend pas
de l'immatriculation, sans rien inventer sur ce qui en dépend.

## Décisions reçues de Julien (21-08-2026)

| # | Champ | Décision |
|---|---|---|
| 1 | Nom/prénom exploitant | Julien GREGUREC — à revérifier contre l'avis SIRENE avant publication définitive |
| 2 | Nom commercial | ELSATIA (distinct de « ELSATIA Gestion Pro », nom de l'application) |
| 3 | Adresse du siège | **En attente** — choix entre domicile personnel / domiciliation commerciale / autre adresse encore à trancher, avant le dépôt |
| 4 | Email professionnel | `support@elsatia.fr` — préparé dans les documents, **non publié comme fonctionnel** tant que la boîte n'est pas confirmée opérationnelle |
| 5 | Téléphone | Aucun numéro public pour l'instant — contact par formulaires/e-mails uniquement |
| 6 | Activité déclarée | « Édition et exploitation de logiciels en mode SaaS et prestations de services numériques associées » — validée comme base de travail, **pas une formulation administrative définitive** |

## Placeholders restants (bloqués par l'immatriculation, non inventés)

- Adresse du siège (en attente de décision Julien, indépendamment du SIRET)
- SIREN / SIRET
- RCS (si applicable selon le régime retenu)
- Régime de TVA définitif (rédaction actuelle « non applicable, art. 293 B » = hypothèse plausible de franchise en base, **non confirmée**)
- Numéro de TVA intracommunautaire (si assujettissement)
- Code APE/NAF (attribué automatiquement au dépôt)
- Dates « Dernière mise à jour » des 8 documents (datées à la publication finale, pas aujourd'hui)

## Micro-entreprise

Aucune mention SASU trouvée dans les 8 documents (confirmé en P13, reconfirmé
aujourd'hui) — rien à retirer sur ce point.

## Activité

Formulation validée par Julien comme base de travail dans
`CREATION_MICRO_CHECKLIST.md`. Non présentée comme définitive : le code
APE/NAF attribué par le Guichet unique pourra différer légèrement.

## TVA

Aucune règle codée en dur (confirmé : `STRIPE_AUTOMATIC_TAX_ENABLED` piloté
par variable d'environnement, actuellement `false`). La mention actuelle
« non applicable, article 293 B » dans `mentions-legales.md` reste une
hypothèse de franchise en base à confirmer après immatriculation — non
modifiée dans ce lot, aucune décision fiscale prise à la place de Julien.

## Mentions légales, CGV, CGU, confidentialité, cookies

Mis à jour dans `docs/juridique/` :
- Nom exploitant et nom commercial reportés (5 documents).
- Adresse Vercel corrigée : `440 N Barranca Avenue #4133, Covina, CA 91723`
  (l'ancienne adresse `340 S Lemon Ave #4133, Walnut, CA 91789` était
  obsolète — vérifié directement sur `vercel.com/legal/terms` et
  `vercel.com/legal/privacy-policy`, deux sources officielles concordantes).
- Région d'hébergement Supabase confirmée `eu-west-3` (Paris, France) via
  `supabase projects list` (commande sans risque, aucune clé affichée) —
  mention « à confirmer » levée dans `mentions-legales.md`,
  `politique-confidentialite.md` et `dpa-entreprises-clientes.md`.
- **Incohérence trouvée et corrigée** : la correction P13 (prestataire
  e-mail réel = Brevo, pas « Resend » ; retrait des lignes spéculatives
  SMS/OCR) n'avait été appliquée qu'à `rgpd-sous-traitants.md`. Les mêmes
  informations obsolètes subsistaient dans `politique-confidentialite.md`
  (tableau des sous-traitants) et `dpa-entreprises-clientes.md`
  (§8, sous-traitants ultérieurs autorisés). Harmonisé.
- Pages non indexées / non publiées comme définitives : aucun placeholder
  bloquant n'a été levé, donc aucune décision d'indexation n'est prise dans
  ce lot (voir « Non fait » plus bas).

## PDF

RAS (déjà vérifié P13, reconfirmé) : le SIRET affiché dans
`DocumentImprimable.tsx` est celui de l'entreprise cliente d'ELSATIA, jamais
celui de l'éditeur. Aucun mélange d'identité.

## Emails

RAS : expéditeur piloté par `EMAIL_FROM_NAME`/`EMAIL_FROM_ADDRESS` (déjà
configurées en Production), aucun bloc juridique lourd codé en dur dans le
code d'envoi (`src/lib/brevo.ts`).

## RGPD

Registre `REGISTRE_TRAITEMENTS_RGPD.md` déjà cohérent (P13), non modifié.
Le registre juridique détaillé (`rgpd-sous-traitants.md`) reste correct tel
quel — c'est lui qui avait servi de référence pour la correction Brevo,
propagée aujourd'hui aux deux autres documents qui la répétaient.

## Site vitrine (`elsatia.fr`)

**Découverte de ce lot, hors périmètre des audits P12/P13** : le site
vitrine dispose de son propre contenu juridique
(`elsatia-site/src/content/legal.ts`), structurellement différent des
fichiers Markdown de l'application (format TypeScript typé, pas de
`react-markdown`) et jamais audité jusqu'ici.

Constat : son adresse Vercel était déjà correcte (contrairement à celle de
l'application), et il mentionnait déjà Brevo (pas de « Resend »). Seule
l'identité de l'exploitant restait générique (« à finaliser avant
publication commerciale » partout, y compris pour le nom). Harmonisé avec
les mêmes décisions que l'application : nom exploitant et nom commercial
reportés dans les sections « Éditeur du site », « Identité du prestataire »
(CGV) et « Responsable du traitement » (confidentialité) ; tout ce qui reste
bloqué par l'immatriculation (adresse, SIRET, TVA) reste explicitement
« à finaliser avant publication commerciale ».

**P14B (21-08-2026) — publié.** `support@elsatia.fr` ajoutée (email non
inclus dans la première passe P14, ajoutée une fois confirmée opérationnelle
par Julien). Diff revérifié propre avant merge (un seul fichier,
`src/content/legal.ts`, uniquement les champs autorisés). Fast-forward de
`docs/p14-identite-legale` dans `main`, poussé sur
`julien-gregurec/elsatia-site`. QA verte (typecheck, lint, build — les 5
pages juridiques confirmées dans la sortie de build en tant que routes SSG).
Redéployé sur `elsatia-site` (Production, `READY`, région `fra1`, domaine
`https://elsatia.fr` inchangé). Vérifié en direct sur les 5 pages
(`/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies`) :
identité et email corrects, adresse/SIRET/TVA toujours explicitement « à
finaliser », `noindex, nofollow, nocache` inchangé (aucune indexation
activée), aucune erreur console, logs Vercel propres.

Le site vitrine et l'application sont désormais alignés sur la même
identité juridique. Plus rien de juridique à faire côté produit tant que
l'adresse du siège et le SIRET ne sont pas connus.

Ne modifie aucun DNS — non touché dans ce lot.

## Application

Vérifié : les informations légales apparaissent uniquement via
`DocumentLegal.tsx` (pages `/mentions-legales`, `/cgv`, `/cgu`,
`/confidentialite`, `/cookies`, lisant directement `docs/juridique/*.md`) et
`PiedLegal.tsx` (liens de pied de page). Aucun mélange avec l'identité des
entreprises clientes.

**Correction en cours de lot** : `docs/juridique/*.md` sont des fichiers de
contenu lus par `fs.readFileSync` à la requête, mais depuis l'instantané du
**dernier build déployé** — pas en direct depuis GitHub. Un redéploiement
était donc nécessaire pour que les corrections de ce lot (identité, adresse
Vercel, région, Brevo) et la variable `SUPPORT_EMAIL` prennent effet, malgré
l'absence de changement de code applicatif. Redéployé (`elsatia-production`,
`READY`, région `fra1` confirmée) et vérifié en direct sur `/mentions-legales`
et `/confidentialite` : identité correcte, `support@elsatia.fr` actif,
`SIRET`/adresse toujours correctement en attente.

## Relecture avocat — dossier de synthèse

Les 8 documents (`docs/juridique/*.md`) sont prêts pour relecture
professionnelle une fois les champs bloquants connus — **aucun n'est
présenté comme validé juridiquement**.

**Points à confirmer avec l'avocat :**
1. Formulation exacte de l'activité déclarée, une fois le code APE/NAF reçu.
2. Régime de TVA réel retenu au dépôt (la mention actuelle « article 293 B »
   est une hypothèse de travail, pas une décision fiscale validée).
3. RCS ou registre national unique (INPI) selon le régime exact.
4. Positionnement B2B strict et exclusion du droit de rétractation (déjà
   rédigé dans `cgv.md`, à faire valider formellement).
5. Clause de cession future vers une personne morale à constituer
   (`cgv.md` §14.1) — confirmer qu'elle reste pertinente et bien rédigée.
6. Cohérence entre les CGV/CGU/confidentialité de l'application (détaillées)
   et celles du site vitrine (volontairement plus courtes) — vérifier que
   cette différence de niveau de détail n'est pas elle-même un risque
   juridique (silence sur un point que l'application couvre).

**Zones sensibles identifiées :**
- Export et suppression RGPD : fonctionnels et vérifiés en code (P13), mais
  jamais validés par un juriste quant à leur conformité procédurale exacte
  (délais, formalisme).
- Sous-traitants hors UE (Vercel, Sentry, Supabase société US bien
  qu'hébergement UE) : mécanismes CCT/DPF mentionnés mais jamais vérifiés
  contractuellement (DPA signés/acceptés ou non — voir la case à cocher déjà
  présente dans `rgpd-sous-traitants.md`).
- Région Sentry : toujours « à confirmer », non vérifiable par Claude sans
  accès au projet Sentry.

**Questions à poser à l'avocat :**
- Le format « entrepreneur individuel exerçant sous le nom commercial
  ELSATIA » est-il suffisant partout, ou faut-il une mention plus formelle
  à certains endroits (facturation, CGV) ?
- Le silence du site vitrine sur des points détaillés dans l'application
  (ex. délai de conservation précis, modalités d'exercice des droits) est-il
  acceptable, ou faut-il un renvoi explicite vers les documents de
  l'application ?

## Ce qui n'a pas été fait dans ce lot (volontairement)

- Aucune adresse, SIREN, SIRET, RCS ou numéro de TVA inventé ou renseigné.
- Aucune indexation des pages juridiques activée (aucun placeholder bloquant
  n'a été levé).
- Aucune donnée administrative fictive créée nulle part.

## Action manuelle requise

**Email professionnel — résolu.** Julien a confirmé `support@elsatia.fr`
opérationnelle et déjà testée en réception (boîte secondaire Google
Workspace). `SUPPORT_EMAIL=support@elsatia.fr` ajoutée dans Vercel
`elsatia-production` (scope Production uniquement), Production redéployée,
vérifié en direct sur `/mentions-legales` et `/confidentialite`. Aucune
autre adresse ni configuration Google Workspace modifiée.

**Adresse du siège** : à trancher entre domicile personnel, domiciliation
commerciale ou autre adresse avant le dépôt — décision qui vous appartient
entièrement, seul point non technique encore ouvert avant l'immatriculation.

## QA

Aucun code applicatif modifié (uniquement documentation et contenu
juridique statique) — pas de QA lourde relancée, conformément à la
consigne. `docs/juridique/*.md` et `elsatia-site/src/content/legal.ts` sont
du contenu texte pur, sans logique associée à tester.

## Documentation

- `PREPARATION_JURIDIQUE.md` mis à jour (tableau des champs, état P14).
- `CREATION_MICRO_CHECKLIST.md` mis à jour (activité validée).
- `REGISTRE_CENTRAL.md` à mettre à jour (voir commit).
- Ce document créé.
