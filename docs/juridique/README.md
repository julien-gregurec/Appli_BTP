# Pack juridique & RGPD — Liria Gestion Pro

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

## À COMPLÉTER avant publication (seul toi peux le fournir)

- [ ] **Nom exact** de l'entrepreneur individuel (par défaut : Julien GREGUREC)
- [ ] **Adresse** de la micro-entreprise
- [ ] **SIRET** (obtenu à l'immatriculation sur autoentrepreneur.urssaf.fr)
- [ ] **E-mail de contact pro** (recommandé : `contact@` sur ton domaine plutôt que le Gmail)
- [ ] **Domaine final** (le `.fr` prévu, sinon on garde l'URL Vercel)
- [ ] **Région d'hébergement Supabase** — à vérifier qu'elle est en Europe (voir politique de confidentialité §Transferts)

## Concept clé RGPD à comprendre

Il y a **deux casquettes** :
1. Pour les données **de tes clients-entreprises** (leur inscription, leur facturation, tes prospects) → **tu es responsable de traitement**. C'est la politique de confidentialité.
2. Pour les données que ces entreprises **saisissent dans l'app** (leurs propres clients, salariés, chantiers) → **tu es sous-traitant**, elles sont responsables. C'est le `dpa-entreprises-clientes.md`.

## Prochaines étapes techniques (côté app, je m'en occupe)

- [ ] Pages publiques `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies` + liens en pied de page
- [ ] Fonction « Exporter mes données » et « Supprimer mon compte » (droits RGPD)
- [ ] Bandeau cookies (si un jour on ajoute des traceurs non essentiels)
- [ ] Journalisation des demandes d'exercice de droits

_Dernière mise à jour : 18 juillet 2026._
