# Budget de mise en service — Liria Gestion Pro

Estimation vérifiée le 15 juillet 2026. Conversion indicative au taux BCE du 14 juillet 2026 : 1 € = 1,1405 $. Les montants réellement prélevés dépendent du taux de change, de la TVA et des dépassements de consommation.

## Configuration minimale pour commencer à facturer

| Service | Formule | Coût fixe |
| --- | --- | ---: |
| Vercel | Pro, un compte pouvant déployer, avec 20 $ de crédit d’usage | 20 $ / mois |
| Supabase | Pro, premier projet, 100 Go de fichiers et sauvegardes quotidiennes sur 7 jours | 25 $ / mois |
| Resend | Gratuit jusqu’à 3 000 e-mails par mois, limite de 100 par jour | 0 $ / mois |
| Domaine `.fr` | OVHcloud, renouvellement affiché à 7,79 € HT/an | 0,65 € HT / mois environ |
| Stripe | Aucun abonnement fixe avec la tarification standard | 0 € fixe |
| Supervision | Journaux Vercel/Supabase et plan gratuit d’un outil d’erreurs | 0 € au lancement |

**Minimum fixe : 45 $ par mois, soit environ 39,46 € HT, + environ 7,79 € HT par an pour le domaine.**

Cette formule convient à un pilote ou aux premiers clients, avec un volume d’e-mails faible et sans OCR, SMS, archivage qualifié ni restauration à la seconde.

## Configuration commerciale recommandée

| Service | Formule | Coût |
| --- | --- | ---: |
| Vercel Pro | Hébergement de production | 20 $ / mois |
| Supabase Pro | Base, authentification, stockage privé, sauvegardes 7 jours | 25 $ / mois |
| Resend Pro | 50 000 e-mails, sans limite journalière | 20 $ / mois |
| Google Document AI | OCR facture ou dépense | 0,10 $ par document de 1 à 10 pages |
| Twilio SMS France | Expéditeur alphanumérique | 0,0798 $ par segment envoyé |
| Stripe | Carte standard de l’EEE | 1,5 % + 0,25 € par paiement |
| Domaine `.fr` | Renouvellement | 7,79 € HT / an |

**Fixe recommandé : 65 $ par mois, soit environ 56,99 € HT, + le domaine.**

Exemple mensuel avec 100 justificatifs OCR et 500 SMS :

- infrastructure et e-mails : 65 $ ;
- OCR : 10 $ ;
- SMS : 39,90 $ ;
- total technique : **114,90 $ par mois**, soit environ **100,75 € HT**, hors TVA, frais de change et commissions Stripe.

Exemple Stripe : le règlement d’une facture de 1 000 € avec une carte standard de l’EEE coûte **15,25 €**.

## Options à ne payer que lorsque l’activité le justifie

| Option | Coût connu |
| --- | ---: |
| Restauration Supabase à un instant précis, conservation 7 jours | +100 $ / mois |
| Domaine Supabase personnalisé | +10 $ / mois |
| Deuxième personne autorisée à déployer sur Vercel | +20 $ / mois |
| Dépassement Resend Pro | 0,90 $ / 1 000 e-mails |
| Stockage Supabase au-delà de 100 Go | 0,0213 $ / Go |

L’analyse antivirus commerciale, l’horodatage qualifié, le système d’archivage électronique à valeur probante et les connecteurs comptables doivent faire l’objet de devis. Ils ne sont pas indispensables tant que l’application reste en stockage documentaire simple et indique de conserver les originaux papier.

## Fournisseurs

- **Würth** publie des solutions catalogue, FAB-DIS, PunchOut OCI/cXML et EDI. L’activation dépend d’un accord avec son équipe e-procurement.
- **Foussier** publie PunchOut OCI/cXML et EDI. L’activation dépend de ses paramètres techniques.
- **SIEHR**, **Espace Aubade/eBat** et **PROVITRAGE** publient des comptes professionnels et portails, mais pas de tarif public pour une API Liria. L’import CSV/Excel reste disponible en attendant un accord partenaire.
- **BatiChiffrage est retiré** : aucun abonnement BatiChiffrage n’entre dans le budget.

## Coûts non inclus

- temps de développement, support et maintenance ;
- assurance responsabilité civile professionnelle/cyber ;
- conseil juridique, RGPD et expert-comptable ;
- audit de sécurité indépendant ;
- frais commerciaux et assistance téléphonique ;
- contrat spécifique demandé par un fournisseur ou un logiciel comptable.

## Sources officielles

- Vercel Pro : https://vercel.com/docs/plans/pro-plan
- Supabase : https://supabase.com/pricing
- Resend : https://resend.com/pricing
- Stripe France : https://stripe.com/en-fr/pricing
- Google Document AI : https://cloud.google.com/document-ai/pricing
- Twilio SMS France : https://www.twilio.com/fr-fr/sms/pricing/fr
- Domaine `.fr` OVHcloud : https://www.ovhcloud.com/fr/domains/tld/fr/
- Taux de change BCE : https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.fr.html
