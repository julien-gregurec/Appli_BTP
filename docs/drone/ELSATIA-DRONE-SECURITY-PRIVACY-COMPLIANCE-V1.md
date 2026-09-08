# ELSATIA Drone — Sécurité, vie privée et conformité V1

> 2026-09-08. **Vérifications réglementaires effectuées ce jour.**
>
> **Ce document ne remplace ni un avocat, ni un assureur, ni un télépilote qualifié.**
> Il décrit ce que le produit doit prévoir. Toute information réglementaire doit être
> re-vérifiée à la date de l'opération réelle : le cadre a changé au 1ᵉʳ janvier 2026, il
> changera encore.

---

## 1. Sécurité applicative

### 1.1 Ce qui vient du socle, sans redéveloppement

| Brique | Source |
|---|---|
| Compte ELSATIA commun, authentification, tenant | Socle multi-app |
| Rôles par application | `roles_applications_elsatia` |
| Droit d'usage de l'organisation | `acces_applications_entreprises` |
| Habilitation nominative, bornée dans le temps | `habilitations_applications_utilisateurs` |
| Journal d'accès | `historique_acces_applications` |
| Intégrité de rôle AAL2 | migration `…237` |
| Durcissement de la surface d'écriture | migration `…255` |
| CSP | livrée en Réserves V6 |

**`drone` (ou `scan`) devra être enregistré dans `applications_elsatia`** — une ligne de seed
et quelques rôles, dans un train, pas dans ce lot.

### 1.2 Isolation multi-tenant

Le test le plus important du produit. Un média de chantier est une donnée de client final :
une fuite inter-entreprises n'est pas un incident technique, c'est une rupture de contrat.

| Surface | Règle |
|---|---|
| Tables | RLS sur `entreprise_id`, sans exception |
| Stockage | Chemin construit par `buildStoragePath`, **jamais** un nom de fichier client |
| URL signées | Courtes, à usage unique de préférence, jamais devinables |
| Déduplication par empreinte | **À l'intérieur d'un projet uniquement.** Un rapprochement inter-tenant serait une fuite |
| Cache local | Par (utilisateur, entreprise), purgé au changement d'identité |
| Recherche | Filtrée avant l'index, jamais après |

Le prototype applique déjà deux règles fortes : **le type réel d'un fichier est décidé par ses
octets**, et **aucun nom de fichier client n'entre dans un chemin ni dans un appel moteur**.

### 1.3 Accès support ELSATIA

Modèle **strict par défaut**, repris tel quel du lot support inter-applications :
justification obligatoire · **application Drone uniquement** · permissions explicites ·
durée bornée · notification à l'entreprise · bandeau visible pendant la session · audit
intégral. **Verrouillé en Production.**

Un ajout propre à Drone : **l'accès support ne donne pas accès aux médias originaux par
défaut.** Un support qui doit voir un écran n'a pas besoin de la photo de la salle de bain
d'un particulier. Métadonnées et vignettes suffisent dans la quasi-totalité des cas ; l'accès
aux originaux est une escalade distincte, justifiée séparément.

### 1.4 Médias — chaîne probatoire

Patron repris de la GED notes de frais, **patron documentaire de référence du dépôt** :

| Élément | Règle |
|---|---|
| Empreinte | **SHA-256 à l'ingestion**, avant toute transformation |
| Original | **Immuable.** Une annotation est un calque ou un dérivé |
| Rôle du fichier | Original, dérivé, vignette, annoté, export |
| Antivirus | **Statut honnête.** `non_analyse` est une valeur valide. Aucun antivirus réel n'est branché nulle part dans le dépôt : ne pas afficher un bouclier vert |
| Horodatage | Ingestion, non déclaratif |
| Version | Chaîne de remplacement, pas d'écrasement |
| Conservation | Politique par entreprise |
| Gel juridique | Bloque toute purge, **y compris une demande RGPD**, et le dit |

### 1.5 Autres surfaces

Anti-rejeu et idempotence sur toute mutation · limitation de débit · révocation d'un appareil
(purge du cache local au prochain contact) · expiration obligatoire des liens de partage ·
journal de consultation des rapports · export RGPD par personne · minimisation dans les
journaux (IP et user-agent tronqués, patron DOE).

---

## 2. Vie privée

### 2.1 Ce qu'un drone capte, et que personne n'a demandé

Un vol de façade capte les fenêtres voisines, les jardins, les personnes, les véhicules et
leurs plaques. **Le sujet du vol n'est pas le sujet des données.**

| Mesure | Niveau |
|---|---|
| Information des occupants avant le vol | **Point bloquant** de la checklist |
| Floutage des visages et plaques | **Souhaitable en V1**, sur le dérivé, jamais sur l'original |
| `BlurringApplied` | Déjà dans le noyau — le champ existe |
| Rapport contenant des tiers | Marquage explicite avant diffusion |
| Partage externe | Lien borné, expirant, révocable, journalisé |
| Conservation | Un média sans usage n'a pas à survivre indéfiniment |
| Export et effacement | Par personne concernée, avec la réserve du gel juridique |

**Le floutage porte sur le dérivé diffusé, jamais sur l'original.** Flouter l'original
détruirait la preuve ; ne flouter nulle part diffuserait des tiers. C'est exactement ce que
la séparation original / dérivé permet.

### 2.2 Sous-traitants

Tout moteur de reconstruction externe et tout fournisseur d'IA est un **sous-traitant au sens
RGPD**, avec contrat, localisation des données et durée de conservation à documenter. La
décision déjà prise côté Gestion Pro — **stockage des réponses désactivé chez le
fournisseur** — s'applique à Drone sans discussion.

### 2.3 Localisation

Les images de chantier de clients français doivent rester dans l'Union. Cela commande le
choix d'hébergement du traitement, et **exclut par défaut** tout moteur hébergé hors UE tant
qu'aucun cadre n'est établi.

---

## 3. Réglementation drone — cadre daté

> **Sources primaires consultées le 2026-09-08.** Les faits ci-dessous ne sont pas une
> autorisation de vol : ils décrivent ce que le produit doit demander et rappeler.

### 3.1 Catégorie ouverte — cadre européen

| Sous-catégorie | Classe | Masse | Distance aux tiers | Formation |
|---|---|---|---|---|
| **A1** | C0, C1, ou construction privée < 250 g | < 900 g | Survol de personnes non impliquées possible ; **jamais de rassemblement** | Formation en ligne + examen théorique A1/A3 |
| **A2** | C2 | < 4 kg | **30 m**, ramenés à **5 m** avec la fonction basse vitesse | Certificat d'aptitude : A1/A3 + auto-formation pratique déclarée + examen théorique complémentaire |
| **A3** | C3, C4, ou construction privée < 25 kg | < 25 kg | **150 m** des personnes et des zones urbaines | Formation en ligne + examen A1/A3 |

Communs : **hauteur maximale 120 m** au-dessus de la surface · **identification à distance
(Remote ID) exigée** pour les classes C1, C2 et C3, et en catégorie spécifique sous 120 m,
depuis le **1ᵉʳ janvier 2024** · enregistrement de l'exploitant requis, sauf C0 sans capteur.

### 3.2 France — ce qui a changé au 1ᵉʳ janvier 2026

| Fait | Date | Conséquence produit |
|---|---|---|
| **Fin des scénarios nationaux S-1 / S-2 / S-3** | **2026-01-01** | Toute liste déroulante « scénario » doit proposer **STS-01 / STS-02**, jamais S-1/S-2/S-3 |
| **Brevets par déclaration sur l'honneur (BAPD) invalides** | **2026-01-01** | Un télépilote « formé » sans attestation valide ne l'est plus. Le champ doit porter **nature + échéance**, pas un booléen |

**Toute fiche de préparation de vol rédigée avant 2026 est périmée sur ces deux points.**

### 3.3 France — obligations permanentes

| Obligation | Règle | Source |
|---|---|---|
| Enregistrement d'exploitant | **AlphaTango**, obligatoire dès **250 g** ou dès qu'un capteur collecte des données personnelles (caméra, micro) | DGAC |
| Enregistrement de l'aéronef | Portail AlphaTango à partir de **800 g**, ou si équipé d'un signalement électronique | DGAC |
| **Signalement électronique** | Obligatoire au-delà de **800 g** — seuil plafond fixé par la **loi n° 2016-1428 du 24 octobre 2016**, caractéristiques par l'**arrêté du 27 décembre 2019** | Légifrance |
| Signalement lumineux | Requis pour le vol de nuit | DGAC |
| Numéro d'enregistrement | Apposé sur l'appareil | DGAC |
| Âge minimum du télépilote | **14 ans** en France | DGAC |
| Examen A1/A3 | 40 questions, **75 %** de réussite | DGAC |
| Examen A2 | 30 questions + formation pratique | DGAC |
| Hauteur | **120 m** | UE |
| Espace public en agglomération | **Interdit** en catégorie ouverte | DGAC |
| Rassemblement de personnes | **Jamais** | UE / DGAC |
| Vol de nuit | Encadré, dérogations préfectorales `[à confirmer]` | DGAC |

**Le Mini 3 (< 249 g) échappe au seuil de 800 g du signalement électronique, mais pas à
l'enregistrement d'exploitant** dès lors qu'il porte une caméra. C'est le piège le plus
courant du parc réel, et la checklist doit le poser explicitement.

### 3.4 Catégorie spécifique

Déclaration sous **STS-01 / STS-02** sans autorisation préalable, hors dérogations · au-delà,
**autorisation d'exploitation** avec analyse **SORA** déposée via **METEOR** · **manuel
d'exploitation (MANEX)** obligatoire · enregistrement AlphaTango.

**Un chantier en agglomération relève très souvent de la catégorie spécifique.** L'application
doit donc traiter le cas comme la norme du BTP urbain, pas comme l'exception.

### 3.5 Assurance

Le règlement (UE) 2019/947 impose à l'exploitant d'être **informé** des règles applicables en
matière de responsabilité et d'assurance ; le régime lui-même relève du droit national et du
règlement (CE) 785/2004. En France, l'usage professionnel appelle une **responsabilité civile
aéronef** ; une RC professionnelle ordinaire peut ne pas couvrir un dommage causé par un
aéronef.

**`[à confirmer auprès de l'assureur de l'entreprise]`** — et cette mention doit rester
visible dans la checklist. Le produit enregistre une référence d'assurance **déclarée** ; il
ne vérifie rien et ne doit jamais laisser croire le contraire.

### 3.6 Le pire piège : le moteur juridique

**Ne pas construire un moteur de conformité présenté comme infaillible.**

Une application qui affiche « ✅ vol autorisé » transfère sur ELSATIA une responsabilité
qu'ELSATIA ne peut pas porter : les zones changent, les restrictions temporaires sont
publiées ailleurs, la classe C d'un appareil dépend de son étiquette réelle, et un cadre qui a
supprimé trois scénarios nationaux en un jour peut en supprimer d'autres.

Ce que le produit fait : afficher les points, calculer une complétude, **bloquer un état
applicatif**, consigner qui a coché quoi, et renvoyer vers les cartes et portails officiels.
Ce qu'il ne fait pas : autoriser, interdire, attester.

---

## 4. Droits sur les images

| Question | Position |
|---|---|
| Propriété des images | À l'entreprise cliente. ELSATIA est hébergeur et sous-traitant |
| Usage par ELSATIA | **Aucun** par défaut. Aucune image client en démonstration ni en communication sans accord écrit **et** anonymisation |
| Entraînement d'IA | **Interdit** sur les données client sans accord explicite, séparé, révocable |
| Diffusion à un tiers | Par lien borné, journalisé, révocable |
| Restitution en fin de contrat | Export complet, format ouvert, délai défini |
| Suppression en fin de contrat | Après le délai de restitution, hors gel juridique |

---

## 5. Performance et stockage — hypothèses, pas engagements

| Palier | Missions | Photos | Volume brut estimé |
|---|---|---|---|
| 500 entreprises | 10 000 | 1 M | ~20 To |
| 5 000 entreprises | 100 000 | 10 M | ~200 To |
| Charge haute | 100 000+ | plusieurs dizaines de M | plusieurs Po |

Hypothèse retenue : **20 Mo par photo, 100 photos par mission**. Elle est plausible et non
mesurée.

Leviers : original en **stockage froid** après N jours · vignettes et dérivés en chaud ·
quotas par abonnement · purge par rétention · **vidéo découragée** (10 à 50× le coût d'une
photo pour une valeur probatoire moindre) · traitement asynchrone · pagination stricte ·
téléchargement par URL signée, jamais servi par l'application.

**Aucun volume commercial ne doit être annoncé avant chiffrage réel de l'hébergement.**
Le contexte connu — Storage Production actuel : 13 buckets, **0 objet réel** — signifie que
tout le dimensionnement de stockage de l'écosystème est **théorique à ce jour**.

---

## 6. Ce que ce document exige avant toute exploitation réelle

1. **Avis juridique** sur l'AGPL-3.0 d'OpenDroneMap.
2. **Confirmation d'assurance** auprès de l'assureur de l'entreprise pilote.
3. **Re-vérification réglementaire** à la date de la première opération réelle.
4. **Décision de localisation** du traitement, avant tout contrat de moteur externe.
5. **Aucun antivirus fictif** : tant qu'aucun antivirus n'est branché, le statut reste
   `non_analyse` et s'affiche comme tel.

---

## Sources (consultées le 2026-09-08)

- [EASA — Open Category](https://www.easa.europa.eu/en/domains/drones-air-mobility/operating-drone/open-category-low-risk-civil-drones)
- [Règlement d'exécution (UE) 2019/947](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32019R0947)
- [DGAC — Exploitation de drones en catégorie ouverte](https://www.ecologie.gouv.fr/politiques-publiques/exploitation-drones-categorie-ouverte)
- [DGAC — Exploitation de drones en catégorie spécifique](https://www.ecologie.gouv.fr/politiques-publiques/exploitation-drones-categorie-specifique)
- [DGAC — AlphaTango](https://www.ecologie.gouv.fr/politiques-publiques/alphatango)
- [Loi n° 2016-1428 du 24 octobre 2016](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000033293745)
- [Arrêté du 27 décembre 2019 — signalement électronique et lumineux](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000039685188)
