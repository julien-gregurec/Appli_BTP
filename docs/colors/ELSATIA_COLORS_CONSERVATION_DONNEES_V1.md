# ELSATIA Colors — conservation des photos et des données de lecture d'étiquette

Fiche de décision. Elle **ne fixe aucune durée** : les durées sont une décision
juridique et contractuelle, pas un réglage produit. Elle dit ce qui est stocké,
ce qui est déjà implémenté, et ce qui reste à arbitrer avant commercialisation.

Rien n'est supprimé automatiquement aujourd'hui, et rien ne le sera tant qu'une
durée n'aura pas été configurée explicitement.

---

## 1. Inventaire — ce qui est réellement stocké

Relevé dans le code, pas supposé.

| Catégorie | Où | Quoi | Pourquoi |
|---|---|---|---|
| **Photo du seau** | bucket privé `colors-seaux`, chemin `<entreprise>/<seau>/<uuid>.<ext>` | l'image **décodée, redressée et réencodée**, sans aucune métadonnée | reconnaître un seau et lire son étiquette sans le déplacer |
| **Rendu transformé** | généré à la volée par Supabase Storage à chaque lien signé (900×900, `contain`) | une réduction de la photo ; **ELSATIA n'en conserve aucune copie** | afficher la fiche sans transférer 10 Mo |
| **Métadonnées de rattachement** | `colors_seaux.photo_principale_path`, `colors_nettoyages_photos`, journal `colors_mouvements` | le chemin courant ; le suivi des suppressions de stockage non abouties ; dans le journal, **le seul nom terminal du fichier** | rattacher une photo à un seau, garantir qu'aucune photo remplacée ne reste orpheline |
| **Résultat de lecture d'étiquette** | `colors_analyses_ocr` | champs proposés, prestataire, statut, auteur de la confirmation — **jamais l'image** | tracer ce qu'une machine a proposé et ce qu'une personne a retenu |

### Ce point est désormais fermé (décision D2)

La photo était stockée **telle quelle** : `/api/photos` téléversait les octets
reçus sans les réécrire, et le fichier conservait donc ses métadonnées EXIF —
date, modèle d'appareil, logiciel, miniature intégrée, et selon le réglage du
téléphone **les coordonnées GPS du lieu de la prise de vue**. Sur un chantier,
c'est l'adresse d'un client.

Depuis la décision D2, l'image est **décodée, redressée selon son orientation
EXIF, puis réencodée** avant tout stockage. Ce n'est pas un retrait de champs :
les pixels sont relus et un fichier neuf est écrit, si bien qu'aucun bloc de
métadonnées de l'original ne peut survivre — y compris ceux qu'une liste de
champs à retirer aurait oubliés.

L'orientation est appliquée **avant** l'effacement : sans cette précaution,
retirer l'EXIF ferait basculer d'un quart de tour toutes les photos prises en
portrait.

Tout échec de nettoyage **refuse le stockage**, sans repli sur l'original. Une
seule route écrit dans le bucket, et les politiques de stockage `bucket_id <>
'colors-seaux'` interdisent au rôle applicatif d'y écrire directement : aucun
téléversement ne contourne le traitement.

Les métadonnées retirées ne sont jamais journalisées — cela déplacerait la fuite
du fichier vers des journaux qui ne sont pas cloisonnés par organisation.

---

## 2. Ce qui est implémenté, sans arbitrage préalable

- **Inventaire structuré** — `src/lib/conservation/politique.ts` décrit les
  quatre catégories : emplacement, contenu, raison d'être. Une purge doit savoir
  ce qu'elle détruirait.
- **Purge configurable, par catégorie** — quatre variables **serveur**
  distinctes (`COLORS_CONSERVATION_PHOTO_JOURS`, `…_RENDU_JOURS`,
  `…_METADONNEES_JOURS`, `…_OCR_JOURS`). Une variable unique obligerait à
  traiter une photo de chantier et une proposition d'OCR de la même façon.
- **Fail-closed dans le sens de la conservation** — sans durée configurée, rien
  n'est désigné ; une durée absente, nulle, négative ou illisible vaut « ne rien
  purger », avec un motif affichable. Une faute de frappe ne doit pas se traduire
  par une destruction irréversible.
- **Aucun effacement automatique** — aucune tâche planifiée, aucun déclencheur.
  Le module calcule, il ne supprime pas.
- **Suppression manuelle tracée** — remplacer une photo depuis la fiche supprime
  l'ancienne du stockage ; si la suppression échoue, elle est inscrite dans
  `colors_nettoyages_photos`, visible sur la fiche, et reprise ensuite. Aucune
  photo orpheline ne disparaît des radars.

Le fail-closed va ici dans le sens de la **conservation**, à l'inverse d'un
contrôle d'accès. C'est délibéré : le risque n'est pas symétrique. Ne pas
supprimer assez longtemps est un manquement à corriger ; supprimer par défaut
les photos de chantier d'un client est une perte irréversible.

---

## 3. Ce qui reste à arbitrer avant commercialisation

| # | Décision | Pourquoi elle ne peut pas être prise par le produit |
|---|---|---|
| C1 | **Durée de conservation des photos** | Dépend de ce qui est annoncé aux clients et de la durée d'exploitation d'un chantier. Une photo de seau peut servir des années après la livraison, pour une retouche. |
| C2 | **Durée de conservation des résultats de lecture d'étiquette** | Ne se pose qu'une fois l'OCR activé, donc une fois un prestataire contractualisé. Voir §4. |
| ~~C3~~ | ~~Sort des métadonnées EXIF~~ | **Tranchée (D2) : retrait total au téléversement.** L'orientation est appliquée aux pixels avant l'effacement, si bien que la seule information visuellement utile est préservée. |
| C4 | **Suppression d'une photo à l'unité depuis l'interface** | Techniquement possible ; c'est le geste métier qui manque — faut-il pouvoir retirer une photo sans en mettre une autre, et qui en a le droit ? |
| C5 | **Sort des données à la fin d'un pilote** | À annoncer **avant** le pilote, pas après. |
| C6 | **Durée de vie des liens signés** | 300 secondes aujourd'hui. Suffisant pour afficher, trop court pour partager — ce qui est probablement le bon réglage, mais n'a pas été arbitré. |

---

## 4. Pourquoi ceci ne bloque pas le pilote

Trois raisons, et elles tiennent ensemble :

1. **L'OCR est fermé.** Aucun prestataire n'est contractualisé ni implémenté :
   `colors_analyses_ocr` restera vide pendant tout le pilote, et aucune image ne
   quittera l'infrastructure ELSATIA. La catégorie la plus sensible est donc
   sans objet.
2. **Rien n'est supprimé.** L'absence de durée configurée ne produit aucune
   destruction. Un pilote ne peut pas perdre de données par ce mécanisme.
3. **Les participants sont informés.** Le document de pilote
   (`ELSATIA_COLORS_PILOTE_V1.md`, condition P3) impose d'annoncer la durée du
   pilote et le sort des données avant l'ouverture des accès.

C'est acceptable pour un pilote borné et annoncé. Ce ne l'est pas pour une
commercialisation : C1, C3 et C5 deviennent alors des obligations, pas des
préférences.
