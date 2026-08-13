# Préparation juridique — ELSATIA Gestion Pro

Audit de lecture seule réalisé en P12 (13-08-2026). Aucune donnée juridique n'a été inventée ni renseignée : ce document liste les emplacements exacts à compléter une fois la SASU créée, avec leur source et leur caractère bloquant ou non.

## Où vivent les documents juridiques

Un pack complet existe déjà dans `docs/juridique/` (rédigé le 18 juillet 2026, non modifié par P12) :

| Fichier | Rôle |
|---|---|
| `mentions-legales.md` | Identité de l'éditeur + hébergeur |
| `cgv.md` | Conditions générales de vente (B2B) |
| `cgu.md` | Conditions générales d'utilisation |
| `politique-confidentialite.md` | Information RGPD (art. 13) |
| `politique-cookies.md` | Cookies et traceurs |
| `rgpd-registre-des-traitements.md` | Registre interne (art. 30) |
| `rgpd-sous-traitants.md` | Registre des sous-traitants (art. 28) |
| `dpa-entreprises-clientes.md` | Contrat de sous-traitance à proposer aux clients |

Ces fichiers sont déjà servis publiquement via `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite` (composant `src/components/DocumentLegal.tsx`, rendu statique), avec des liens en pied de page (`src/components/PiedLegal.tsx`).

`docs/juridique/README.md` marque déjà ces textes comme **« brouillons solides, à faire relire par un avocat (~300–500 €) avant mise en ligne »** — ce n'est pas nouveau en P12, mais reste valable.

## Constat important : les documents supposent une micro-entreprise, pas une SASU

Les huit fichiers sont rédigés pour un éditeur **« entrepreneur individuel (micro-entreprise) »**, avec par exemple : *« TVA non applicable — article 293 B du Code général des impôts »* dans `mentions-legales.md`, et *« [Julien GREGUREC], entrepreneur individuel »* répété dans `cgv.md`, `politique-confidentialite.md`, `rgpd-registre-des-traitements.md` et `dpa-entreprises-clientes.md`.

Or la structure prévue est une **SASU** (voir mémoire de session), pas une micro-entreprise. Ce n'est donc pas un simple remplissage de champs entre crochets : une fois la SASU immatriculée, ces documents demanderont une **réécriture réelle** sur au moins ces points :
- régime de TVA (une SASU est en général assujettie, contrairement à la franchise en base d'une micro-entreprise) ;
- mention du capital social (n'existe pas en micro-entreprise, obligatoire pour une SASU) ;
- qualité du signataire (« entrepreneur individuel » → « Président » ou représentant légal de la SASU) ;
- numéro RCS et greffe d'immatriculation (une micro-entreprise n'a pas de RCS commercial de la même façon qu'une société).

**Bloquant : non exécutable maintenant.** Cette réécriture ne peut être faite qu'une fois les statuts de la SASU connus (nom exact de la société, capital, RCS, adresse du siège, représentant légal). Le prestataire déjà budgété par le README (relecture avocat) est le bon moment pour la traiter en une seule passe.

## Emplacements exacts à compléter (recherche automatique, aucune valeur inventée)

Recherche de `[À COMPLÉTER]`, `[JJ/MM/AAAA]`, `[EMAIL_SUPPORT]`, `[URL_APPLICATION]` et mentions SIRET/RCS dans `docs/juridique/*.md` :

| Champ | Fichiers concernés | Bloquant |
|---|---|---|
| Nom exact de la structure (actuellement « Julien GREGUREC » par défaut) | mentions-legales, cgv, politique-confidentialite, rgpd-registre-des-traitements, dpa-entreprises-clientes | Oui — attend la SASU |
| Adresse du siège | mentions-legales | Oui — attend la SASU |
| SIRET | mentions-legales | Oui — attend la SASU |
| Régime de TVA (actuellement « non applicable, art. 293 B ») | mentions-legales | Oui — dépend du régime réel de la SASU |
| Capital social (absent des textes actuels) | mentions-legales, cgv | Oui — n'existe qu'après immatriculation |
| RCS / greffe | mentions-legales | Oui — attend la SASU |
| Email de contact pro (`[EMAIL_SUPPORT]`) | mentions-legales, politique-confidentialite, politique-cookies, rgpd-registre-des-traitements, dpa-entreprises-clientes | Non bloquant — peut être choisi dès maintenant (ex. `contact@` sur le domaine final) |
| Domaine final / `[URL_APPLICATION]` | mentions-legales | Non bloquant si `app.elsatia.fr` reste l'adresse de lancement |
| Dates « Dernière mise à jour » (`[JJ/MM/AAAA]`) | les 8 fichiers | Non bloquant — à dater au moment de la publication finale |
| Région d'hébergement Supabase (« à confirmer ») | mentions-legales | Non bloquant — déjà `eu-west-3` (Paris) en Production, il suffit de lever la mention « à confirmer » |

## Autres emplacements vérifiés (aucun placeholder trouvé, RAS)

- **PDF devis/factures** (`src/components/DocumentImprimable.tsx`) : le SIRET affiché est celui de l'entreprise cliente d'ELSATIA (`entreprises.siret`, saisi par chaque client), pas celui de l'éditeur — comportement normal du produit, rien à corriger.
- **Emails transactionnels (Brevo)**, **Stripe** : aucune mention légale de l'éditeur codée en dur trouvée dans `src/lib/brevo.ts` ni dans les routes `src/app/api/stripe/**`.
- **Footer** (`PiedLegal.tsx`) : ne contient que les liens vers les pages légales, aucun texte à compléter.

## Point à vérifier séparément (fonctionnalité, pas juridique pur)

`politique-confidentialite.md` affirme : *« Le Service met également à disposition des fonctions d'export et de suppression de vos données depuis votre espace. »* La suppression existe (`demanderSuppressionAction`, `annulerSuppressionAction`, `anonymiserEmployeAction` dans `src/app/actions/rgpd.ts`, vérifiées et corrigées en P12 pour ne plus exposer d'erreur brute). Une fonction dédiée d'**export** des données personnelles n'a pas été localisée sous ce nom lors de cet audit — à vérifier avant publication finale des textes pour ne pas promettre une fonctionnalité absente, ou à construire si elle manque réellement. Cette vérification est fonctionnelle, pas juridique, et sort du périmètre strict de P12.

## Action après création de la SASU

1. Fournir les informations bloquantes ci-dessus (nom, adresse, SIRET, capital, RCS, régime de TVA).
2. Faire réécrire les passages « entrepreneur individuel / micro-entreprise » en conséquence (pas un simple copier-coller des nouvelles valeurs).
3. Faire relire l'ensemble par un avocat (déjà budgété dans `docs/juridique/README.md`).
4. Dater chaque document et publier.
5. Vérifier l'existence réelle de la fonction d'export de données personnelles avant publication de `politique-confidentialite.md`.
