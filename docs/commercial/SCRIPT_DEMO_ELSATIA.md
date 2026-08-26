# Script de démonstration ELSATIA Gestion Pro (10–15 min)

Document opérationnel pour mener une démo prospect. Le compte utilisé, ses données, sa procédure de réinitialisation et ses garde-fous sont déjà documentés dans [`docs/organisation/DEMO_COMMERCIALE.md`](../organisation/DEMO_COMMERCIALE.md) — ce document-ci n'en reprend que ce qui est nécessaire au déroulé commercial, sans dupliquer les détails techniques.

## Scénario narratif (fil conducteur unique)

Toute démo doit suivre le même fil, quel que soit le prospect :

> Une entreprise reçoit une demande client. Elle crée le client, ouvre le chantier, planifie l'équipe, suit les heures sur le terrain, prépare le devis, l'envoie, le transforme en facture une fois accepté, et suit la rentabilité du chantier — le tout dans un seul outil.

Le compte démo `Atelier Bâtiment Lyonnais` (18 mois d'historique) soutient déjà ce fil sur toutes ses étapes.

## Déroulé minuté

| # | Durée | Écran | Action | Phrase clé | Transition |
|---|---|---|---|---|---|
| 1 | 1 min | Dashboard | Montrer la vue d'ensemble (chantiers en cours, activité récente, encaissements) | « Voici ce que voit un administrateur en se connectant le matin. » | « Partons d'un client concret. » |
| 2 | 2 min | Clients / Chantiers | Ouvrir une fiche client, montrer l'historique lié (devis, chantiers, factures) | « Tout l'historique d'un client est centralisé — plus besoin de chercher dans plusieurs fichiers. » | « Ce client a un chantier en cours, regardons-le. » |
| 3 | 2 min | Planning | Montrer une semaine chargée, plusieurs employés sur plusieurs chantiers | « L'équipe voit son planning en temps réel, y compris sur mobile. » | « Sur le terrain, voici ce que voit un salarié. » |
| 4 | 1 min | Pointage terrain | Montrer les heures validées sur un chantier | « Le pointage se fait depuis le téléphone, directement sur le chantier. » | « Ces heures alimentent ensuite le devis et la facture. » |
| 5 | 2 min | Devis | Ouvrir un devis accepté, montrer les lignes et le calcul TTC | « Le devis se construit en quelques minutes à partir de prestations préenregistrées. » | « Une fois prêt, il part directement au client. » |
| 6 | 1 min | PDF / email | Montrer le PDF généré et le bouton d'envoi (sans déclencher un envoi réel) | « Le PDF est identique à ce que le client va recevoir. » | « Une fois accepté, un clic suffit pour le transformer en facture. » |
| 7 | 1 min | Facture | Montrer la facture issue du devis, son statut de paiement | « Le devis devient facture sans ressaisie. » | « Voyons maintenant ce que ça donne sur la rentabilité. » |
| 8 | 1 min | Notes de frais | Montrer une note de frais avec justificatif | « Les frais de chantier sont saisis directement par l'équipe, avec la pièce jointe. » | « Regardons aussi le stock et le matériel. » |
| 9 | 1 min | Stock / matériel | Montrer un article de stock et un outil affecté | « Le stock et l'outillage sont suivis par chantier, pas seulement en magasin. » | « Tout ça se retrouve dans la rentabilité du chantier. » |
| 10 | 1 min | Rentabilité | Montrer le module rentabilité avec des chiffres déjà significatifs | « Ici, l'entreprise voit en un coup d'œil ce que chaque chantier a réellement rapporté. » | « Voyons maintenant ce qui correspond à votre taille d'équipe. » |
| 11 | 1 min | Abonnement / offre | Montrer `/tarifs` ou `/abonnement`, situer l'offre probable du prospect | « Voici l'offre qui correspond à une équipe comme la vôtre — voir le mapping ci-dessous. » | « Qu'est-ce qui vous parle le plus dans ce que vous venez de voir ? » |
| 12 | Reste du temps | — | Questions du prospect | — | — |

## Ce qu'il ne faut jamais montrer en démo

Ces modules existent dans le code mais ne sont pas commercialisés en V3 (source : `src/lib/feature-catalogue.ts`) :

- **Désactivés** (hors périmètre commercial) : Boutique, Powens (paiements bancaires), Appels d'offres, Connecteurs.
- **Bêta** (retirés du produit tant que non validés en conditions réelles) : facturation avancée, ouvrages, interventions, sous-traitants, grands déplacements, paie, CRM.
- **IA** : activée en Production (`FEATURE_AI_ENABLED=true`, `FEATURE_AI_DEVIS_ENABLED=true` —
  voir `docs/ia/AI_PROD_ACTIVATION_V1.md`/`IA_DEVIS_PROD_ACTIVATION_V1.md`) — peut être
  montrée en démo (assistant + préparation assistée de devis), sans en faire l'argument
  central de vente.

Ne jamais présenter un de ces modules comme disponible aujourd'hui, même s'il est visible dans le code ou en base.

## Mapping offres (pour la clôture de démo)

Grille tarifaire réelle (source : `src/lib/tarification.ts`, prix HT/mois) :

| Offre | Prix HT/mois | Comptes inclus | Administrateurs inclus | Ce qui s'ajoute par rapport au palier précédent |
|---|---|---|---|---|
| **Mini** | 69 € | 3 | 1 | Socle : dashboard, messagerie, clients, chantiers, devis, factures, planning |
| **Pro** | 199 € | 15 | 3 | + Terrain (pointage, employés, congés, notes de frais) et Gestion (achats, prestations, CRM*) |
| **Business** | 399 € | 30 | 6 | + Pilotage (stock, outillage, flotte*, rentabilité, exports, paie*) |
| **Entreprise** | 599 € | 40 salariés + 10 administrateurs | 10 | + Avancé (connecteurs*, sous-traitants*, paiements bancaires*, paie complète*) |

`*` = fonctionnalité incluse dans la permission du palier mais **non commercialisée en V3** (BETA/désactivée — voir section précédente). Ne jamais promettre ces modules comme actifs pour vendre un palier supérieur.

Ne pas modifier ces chiffres ici — en cas de doute, se référer directement à `/tarifs` (source d'affichage unique) plutôt qu'à ce document.

## Après la démo

Enchaîner directement sur l'essai de 30 jours (carte enregistrée, aucun débit pendant l'essai — voir `/abonnement`), puis sur le suivi décrit dans `docs/commercial/PREMIER_CLIENT_CHECKLIST.md`.
