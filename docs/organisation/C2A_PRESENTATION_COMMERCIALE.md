# C2-A — Données de démonstration pour la présentation commerciale

Ce document prépare les captures réelles de la présentation ELSATIA. Il ne
modifie ni le produit, ni les tarifs, ni les données de l'entreprise réelle.

## Environnement retenu

- Entreprise fictive unique : **Atelier Bâtiment Lyonnais**.
- Marqueur technique : `DEMO-18M`.
- Jeu de base : `supabase/production/creer_entreprise_demo_18_mois.sql`.
- Complément C2 : `supabase/demo/c2_presentation_commerciale.sql`.
- Le complément C2 est réservé à une base **locale** ou à un environnement
  Preview explicitement contrôlé. Il ne doit jamais être exécuté sur
  `elsatia-production`.

Le jeu de base fournit 18 mois d'activité : 12 salariés, 30 clients,
30 chantiers, 108 devis, 72 factures et 2 340 pointages. Le complément C2 rend
le scénario plus lisible commercialement et ajoute les données nécessaires aux
captures ciblées, sans créer une seconde entreprise.

## Histoire continue présentée

Le client **Groupe Montchat Immobilier** confie à Atelier Bâtiment Lyonnais la
**Rénovation du siège — Lyon Part-Dieu**. Emma Bernard pilote les travaux avec
Hugo Petit et l'équipe terrain. Le chantier est en cours, son planning est
visible au bureau comme sur smartphone, ses comptes rendus sont centralisés et
les dépenses terrain suivent le même dossier.

Deux autres opérations donnent de la profondeur à la démonstration :

- **Aménagement des parties communes — Villeurbanne**, en cours ;
- **Extension des bureaux — Bron**, acceptée et à venir.

## Équipe fictive

| Personne | Rôle |
|---|---|
| Lucas Morel | Administrateur / dirigeant |
| Emma Bernard | Conductrice de travaux |
| Hugo Petit | Chef de chantier |
| Lea Durand | Cheffe d'équipe |
| Nathan Robert | Salarié terrain |
| Ines Simon | Salariée terrain |
| Louis Laurent | Salarié terrain |
| Chloe Michel | Salariée terrain |
| Arthur Garcia | Comptable |
| Sarah Leroy | Responsable RH |
| Theo Roux | Chef d'équipe |
| Manon Fournier | Salariée terrain |

Les adresses utilisent exclusivement le domaine réservé `example.test`. Les
téléphones, adresses, montants et documents sont fictifs.

## Données C2 complémentaires

- Deux comptes rendus crédibles sur le chantier principal.
- Trois notes de frais fictives : repas, carburant et fournitures.
- Une journée de planning commune à cinq salariés, réutilisée dans les vues
  ordinateur et smartphone.
- Trois clients professionnels et trois chantiers renommés de façon cohérente.

Les noms de justificatifs sont fictifs. Aucun reçu réel ne doit être utilisé.
Si la capture montre l'aperçu du justificatif, C2-B devra déposer un document
graphique fictif clairement marqué « DÉMONSTRATION — AUCUNE VALEUR COMPTABLE ».

## Les 11 images à produire en C2-B

| N° | Fichier recommandé | Vue | Cadrage attendu |
|---:|---|---|---|
| 1 | `01-dashboard-desktop.png` | `/dashboard` | Tableau de bord lisible, 1440 × 1000 |
| 2 | `02-dashboard-mobile.png` | `/dashboard` | Même entreprise, 390 × 844 |
| 3 | `03-rentabilite-desktop.png` | `/rentabilite` | Indicateurs et graphique principal |
| 4 | `04-chantier-principal.png` | fiche « Rénovation du siège — Lyon Part-Dieu » | En-tête, état, équipe et chiffres |
| 5 | `05-compte-rendu-chantier.png` | comptes rendus du chantier principal | Les deux comptes rendus C2 visibles |
| 6 | `06-pointage-mobile.png` | `/pointage` | Vue mobile, données terrain lisibles |
| 7 | `07-note-frais-mobile.png` | `/notes-frais` | Les notes C2 visibles sans donnée réelle |
| 8 | `08-assistant-ia.png` | assistant sur `/dashboard` | Question : « Quels devis sont en attente depuis plus de 7 jours ? » |
| 9 | `09-planning-desktop.png` | `/planning` | Journée C2 et affectations communes |
| 10 | `10-planning-mobile.png` | `/planning` | Exactement la même journée que l'image 9 |
| 11 | `11-acces-permissions.png` | `/parametres/acces` | Rôles et permissions, sans code d'adhésion visible |

Cela représente **10 thèmes visuels et 11 fichiers**, car le planning est
photographié séparément sur ordinateur et smartphone.

## Règles de capture

- Utiliser le même compte et la même entreprise sur les onze images.
- Masquer le code d'adhésion, les identifiants techniques et toute adresse de
  connexion contrôlée par une personne réelle.
- Ne jamais photographier l'entreprise réelle `ENT-001`.
- Ne jamais déclencher un email, un paiement ou une action irréversible.
- Conserver le thème clair et le même niveau de zoom.
- Desktop : 1440 × 1000. Mobile : 390 × 844, densité 3.
- Laisser les graphiques finir leur animation avant la capture.
- Ne pas utiliser une page vide ni une capture pleine hauteur illisible.
- Ajouter « Données de démonstration » dans la présentation lorsque des montants
  ou indicateurs financiers sont visibles.

## Cas particulier de l'IA

L'IA est désactivée sur l'offre actuellement visible en Production. La capture
8 doit donc être réalisée uniquement dans un environnement contrôlé où :

1. `FEATURE_AI_ENABLED=true` est volontairement activé ;
2. l'entreprise affichée reste `DEMO-18M` ;
3. la clé IA reste dans les variables d'environnement et n'apparaît jamais dans
   une capture ou un fichier ;
4. la présentation porte la mention « Option IA — selon offre et activation » ;
5. aucune action proposée par l'assistant n'est validée pendant la capture.

La Production ne doit pas être modifiée pour obtenir cette image.

## Préparation locale reproductible

Depuis un Supabase local déjà migré :

```bash
docker exec -i supabase_db_btp-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/production/creer_entreprise_demo_18_mois.sql

docker exec -i supabase_db_btp-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/demo/c2_presentation_commerciale.sql
```

Avant chaque exécution, vérifier que l'URL utilisée par l'application commence
par `http://127.0.0.1` et qu'aucune variable Production n'est chargée.

## Critères de passage à C2-B

- l'entreprise affichée est Atelier Bâtiment Lyonnais ;
- les trois chantiers nommés ci-dessus existent avec les bons états ;
- les deux comptes rendus C2 sont visibles ;
- les trois notes de frais C2 sont visibles ;
- les cinq affectations C2 apparaissent sur une même journée ;
- les onze cadrages sont accessibles ;
- l'environnement IA contrôlé est identifié, sans activation Production.

C2-B peut alors produire les images, sans modifier les données métier.
