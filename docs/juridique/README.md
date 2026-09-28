# Pack juridique & RGPD — ELSATIA Gestion Pro

Documents rédigés pour un lancement en **micro-entreprise (entrepreneur individuel)**.

> ⚠️ **Statut : brouillons solides, à faire relire par un avocat (~300–500 €) avant mise en ligne.**
> Ils remplacent la rédaction complète (poste « 3–8 k€ ») par une simple relecture. Ils ne constituent pas un conseil juridique.

## Contenu

| Fichier | Rôle | Obligatoire ? |
|---|---|---|
| `mentions-legales.md` | Identité de l'éditeur + hébergeur | ✅ Oui (LCEN) |
| `cgv.md` | Conditions de vente de l'abonnement (B2B) — **inclut la clause de substitution** | ✅ Oui (pour vendre) |
| `cgu.md` | Règles d'utilisation du service | ✅ Recommandé |
| `politique-confidentialite.md` | Information RGPD des personnes | ✅ Oui (RGPD art. 13) |
| `politique-cookies.md` | Cookies & traceurs | ✅ Oui |
| `rgpd-registre-des-traitements.md` | Registre interne (art. 30 RGPD) | ✅ Oui (à conserver) |
| `rgpd-sous-traitants.md` | Registre des sous-traitants (art. 28) | ✅ Oui |
| `dpa-entreprises-clientes.md` | Contrat de sous-traitance à proposer à tes clients | ✅ Oui (tu es sous-traitant de leurs données) |

## Identité officielle d'exploitation (source : `src/lib/identite-legale.ts`)

- Exploitant : **Julien GREGUREC**, entrepreneur individuel (EI)
- RCS : **850 559 873 R.C.S. Strasbourg** — immatriculation du 28/09/2026
- Commencement d'activité : **01/10/2026** (aucune vente ni facture ELSATIA avant cette date)
- Site déclaré : **elsatia.fr** (application : app.elsatia.fr)
- Activité : édition, exploitation et commercialisation d'un logiciel en ligne (SaaS) de gestion d'entreprise et prestations de services numériques associées

Ne jamais ajouter de données personnelles superflues (date de naissance, adresse personnelle…) dans ce pack ni dans le code.

## Reste à décider — LEGAL_REVIEW_REQUIRED

- [ ] **Adresse publiée** de l'établissement (adresse professionnelle ou domiciliation) — mentions légales
- [ ] **Régime de TVA** (franchise en base art. 293 B ou non) — CGV, mentions légales, page Tarifs (« HT »), boutique
- [ ] **Boîte `contact@elsatia.fr`** : confirmer qu'elle existe et est relevée
- [ ] **Région d'hébergement Supabase** — à vérifier qu'elle est en Europe
- [ ] **Sous-traitants** OpenAI, Sentry, Powens à ajouter à la politique de confidentialité après vérification
- [ ] Relecture complète par un avocat avant le 01/10/2026

Les commentaires `<!-- LEGAL_REVIEW_REQUIRED … -->` ne sont pas publiés ; les champs `[LEGAL_REVIEW_REQUIRED: …]` sont affichés « en cours de mise à jour » sur le site. Le test `src/lib/identite-legale.test.ts` contrôle la cohérence.

## Concept clé RGPD à comprendre

Il y a **deux casquettes** :
1. Pour les données **de tes clients-entreprises** (leur inscription, leur facturation, tes prospects) → **tu es responsable de traitement**. C'est la politique de confidentialité.
2. Pour les données que ces entreprises **saisissent dans l'app** (leurs propres clients, salariés, chantiers) → **tu es sous-traitant**, elles sont responsables. C'est le `dpa-entreprises-clientes.md`.

## Prochaines étapes techniques (côté app, je m'en occupe)

- [ ] Pages publiques `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies` + liens en pied de page
- [ ] Fonction « Exporter mes données » et « Supprimer mon compte » (droits RGPD)
- [ ] Bandeau cookies (si un jour on ajoute des traceurs non essentiels)
- [ ] Journalisation des demandes d'exercice de droits

_Dernière mise à jour : 28 septembre 2026._
