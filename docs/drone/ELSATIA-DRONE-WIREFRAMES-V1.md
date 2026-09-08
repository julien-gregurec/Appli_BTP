# ELSATIA Drone / Scan — Wireframes fonctionnels V1

> 2026-09-08. **Schémas fonctionnels originaux**, en texte. Ils décrivent *ce qui doit être
> visible et décidable*, pas une apparence.
>
> Aucune interface tierce n'est reprise. Aucune charte n'est proposée : **Drone héritera de la
> cible ELSATIA-UI-V2**, pas de l'interface actuelle — c'est déjà écrit dans le noyau. Ces
> schémas sont donc volontairement neutres.

---

## Principes de conception

1. **Ce qui est incertain est visible.** Une mesure indicative se voit sans cliquer.
2. **Ce qui est interdit est expliqué**, jamais grisé sans mot.
3. **L'état de la file n'est jamais caché.** Une icône verte qui ment est un défaut.
4. **Aucun écran n'exige une mission.** Chaque parcours doit tenir sans elle.
5. **L'original est atteignable en un geste** depuis n'importe quelle vue annotée.

---

## W1 — Liste des projets

```
┌──────────────────────────────────────────────────────────────────────┐
│  Projets                                       [ + Nouveau projet ]  │
├──────────────────────────────────────────────────────────────────────┤
│  Recherche…            Statut ▾   Type ▾   Chantier ▾   Période ▾    │
├──────────────────────────────────────────────────────────────────────┤
│  ● Toiture — 14 rue des Lilas          Médias importés     12 photos │
│    Chantier GP : Réfection Lilas          il y a 2 h    ⚠ 3 en file  │
│  ────────────────────────────────────────────────────────────────────│
│  ● Façade nord — Résidence Aubier      À vérifier          86 photos │
│    Aucun chantier lié                     hier                       │
│  ────────────────────────────────────────────────────────────────────│
│  ● Suivi mensuel — Halle Est           Terminé            210 photos │
│    Chantier GP : Halle Est               03/09         Rapport v2    │
├──────────────────────────────────────────────────────────────────────┤
│  ⇅  4 éléments en attente d'envoi · dernier essai il y a 3 min       │
│     1 en échec — [ Voir ]                                            │
└──────────────────────────────────────────────────────────────────────┘
```

- « Aucun chantier lié » s'affiche **en toutes lettres** : le mode autonome est un état
  normal, pas un défaut à masquer.
- La barre du bas est **permanente**. Elle porte le nombre exact, l'heure du dernier essai et
  les échecs. Jamais un simple point vert.

---

## W2 — Projet, vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Projets     Toiture — 14 rue des Lilas          [ Rapport ▾ ]     │
├──────────────────────────────────────────────────────────────────────┤
│  Médias importés · Toiture · créé le 06/09 par M. Renaud             │
│  Chantier : Réfection Lilas (Gestion Pro)      [ Délier ]            │
│  Client   : — non renseigné —                  [ Lier ]              │
├──────────────────────────────────────────────────────────────────────┤
│ [Médias 12] [Annotations 4] [Mesures 2] [Mission] [Rapports 1] [Journal]│
├──────────────────────────────────────────────────────────────────────┤
│  Mission : aucune.                                                   │
│  Les photos ont été importées après le vol. Vous pouvez décrire      │
│  la mission a posteriori, ou ne rien renseigner.                     │
│                                        [ Décrire la mission ]        │
├──────────────────────────────────────────────────────────────────────┤
│  À vérifier                                                          │
│  • 2 photos sans position GPS                          [ Voir ]      │
│  • 1 mesure indicative utilisée dans un métré          [ Voir ]      │
└──────────────────────────────────────────────────────────────────────┘
```

- « Mission : aucune » est présenté **comme un cas normal**, avec sa raison. C'est la
  traduction d'écran de la règle `draft → media_imported`.
- Le bloc « À vérifier » ne bloque rien : il **rend visible** ce qui affaiblirait un rapport.

---

## W3 — Import

```
┌──────────────────────────────────────────────────────────────────────┐
│  Importer des médias — Toiture, 14 rue des Lilas                     │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │   Déposez vos fichiers, ou choisissez une source :             │  │
│  │   [ Cet appareil ]  [ Dossier ]  [ Carte mémoire ]  [ Photos ] │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  48 fichiers · 1,2 Go                                                │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  31 / 48                              │
│                                                                      │
│  ✓ 29 importés    ⧗ 1 en cours    ⊘ 2 ignorés    ⚠ 1 à vérifier      │
│                                                                      │
│  ⊘ DJI_0184.JPG — déjà présent dans ce projet (contenu identique)    │
│  ⊘ DJI_0185.JPG — déjà présent dans ce projet (contenu identique)    │
│  ⚠ IMG_2210.HEIC — aucune position GPS. Importé quand même.          │
│                                                                      │
│  ℹ Envoi par morceaux. Vous pouvez quitter : l'import reprendra.     │
│                                            [ Wi-Fi seulement ✓ ]     │
└──────────────────────────────────────────────────────────────────────┘
```

- Un doublon est **ignoré et dit**, jamais supprimé en silence.
- L'absence de GPS est un **avertissement**, jamais un blocage, et **jamais** comblée par la
  position du chantier.
- « Wi-Fi seulement » est coché par défaut : le forfait mobile du couvreur n'est pas à nous.

---

## W4 — Média, inspection et annotation

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Médias        DJI_0192.JPG        4 / 48        [ Original ] [+]  │
├───────────────────────────────────────────┬──────────────────────────┤
│                                           │  Calques                 │
│                                           │  ☑ Annotations (3)       │
│              [ image ]                    │  ☐ Mesures (1)           │
│                                           │  ☐ Floutage (2 visages)  │
│           ○ ── ── ── ○                    │ ─────────────────────────│
│              1,84 m                       │  Annotation sélectionnée │
│           ~ indicatif                     │  Type   Fissure ▾        │
│                                           │  Gravité  Moyenne ▾      │
│                                           │  M. Renaud — 06/09 14:12 │
├───────────────────────────────────────────┤ ─────────────────────────│
│  06/09/2026 14:12 · 48.85, 2.35 (EXIF)    │ [ Proposer une réserve ] │
│  Hauteur 42 m au-dessus du décollage      │ [ Mesurer ]              │
└───────────────────────────────────────────┴──────────────────────────┘
```

- Le bouton **[ Original ]** est permanent : on revient à l'image intacte en un geste.
- **« ~ indicatif »** est écrit **sur la mesure**, pas dans une infobulle.
- L'altitude porte **son référentiel** — « au-dessus du décollage » — parce que la confondre
  avec la hauteur sur la toiture fausse tout GSD.
- « Proposer une réserve » : le verbe dit que Réserves tranche.

---

## W5 — Mesurer : le refus expliqué

```
┌──────────────────────────────────────────────────────────────────────┐
│  Mesurer sur cette image                                             │
├──────────────────────────────────────────────────────────────────────┤
│  Échelle de l'image : inconnue                                       │
│                                                                      │
│  Vous pouvez tracer et obtenir un ordre de grandeur indicatif.       │
│  Pour produire une quantité utilisable dans un devis, l'image doit   │
│  être mise à l'échelle.                                              │
│                                                                      │
│  [ Saisir une distance connue ]   [ Utiliser un marqueur ]           │
│  [ Renseigner la hauteur de vol ] [ Importer un modèle calé ]        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Produire une quantité              ✗ indisponible             │  │
│  │  Motif : aucune mise à l'échelle. Choisissez une méthode.      │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**L'écran le plus important du produit.** Il matérialise l'interdit : sans mise à l'échelle,
pas de quantité. Le bouton n'est pas grisé sans mot — le motif et le geste manquant sont
écrits.

---

## W6 — Préparation de vol

```
┌──────────────────────────────────────────────────────────────────────┐
│  Préparer la mission — Façade nord, Résidence Aubier                 │
│  Complétude 12/18 · 4 points bloquants restants                      │
├──────────────────────────────────────────────────────────────────────┤
│  Télépilote                                                          │
│  ☑ Désigné : M. Renaud                                               │
│  ☒ Attestation — nature : [ A2 ▾ ]  échéance : [ __/__/____ ]   ⛔   │
│    ℹ Les brevets par déclaration sur l'honneur ne sont plus valides  │
│      depuis le 1ᵉʳ janvier 2026.                                     │
│                                                                      │
│  Exploitant                                                          │
│  ☑ N° exploitant UAS déclaré                                         │
│  ☒ Assurance déclarée, en cours de validité                     ⛔   │
│                                                                      │
│  Aéronef                                                             │
│  ☑ DJI Mini 3 · n° de série déclaré                                  │
│  ☑ N° d'enregistrement apposé                                        │
│  ℹ < 800 g : signalement électronique non requis. L'enregistrement   │
│    d'exploitant reste obligatoire (caméra embarquée).                │
│                                                                      │
│  Zone                                                                │
│  ☒ Zone consultée sur la carte officielle                       ⛔   │
│    → ELSATIA n'affiche pas les zones de restriction.                 │
│      [ Ouvrir le portail officiel ↗ ]                                │
│  ☒ Espace public en agglomération — catégorie applicable ?      ⛔   │
│    [ Ouverte A1 ] [ A2 ] [ A3 ] [ Spécifique STS-01 ] [ STS-02 ]     │
│    [ Spécifique — autorisation ] [ Sans vol ]                        │
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ELSATIA n'autorise aucun vol et ne vérifie aucune             │  │
│  │  qualification. La décision de décoller appartient au          │  │
│  │  responsable de la mission.                                    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                          [ Marquer la mission comme prête ]  ⛔      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Aucun scénario S-1/S-2/S-3** dans la liste : ils n'existent plus depuis le 1ᵉʳ 01 2026.
- **« Sans vol »** est une option de premier rang : 14 des 22 types de missions n'exigent
  aucun drone.
- Le cartouche de non-responsabilité est **permanent**, pas une case à cocher qu'on oublie.
- ELSATIA **renvoie** vers le portail officiel des zones au lieu d'afficher un cache périmé.

---

## W7 — Rapport

```
┌──────────────────────────────────────────────────────────────────────┐
│  Rapport d'inspection — Façade nord            Version 2 · Brouillon │
├──────────────────────────────────────────────────────────────────────┤
│  Pièces incluses (figées à la validation)                            │
│  ☑ 14 photos     ☑ 4 annotations     ☑ 2 mesures                     │
│                                                                      │
│  ⚠ 1 mesure de niveau « indicatif » est incluse.                     │
│    Elle apparaîtra avec sa mention dans le document.                 │
│                                                                      │
│  ⚠ 2 photos comportent des personnes identifiables.                  │
│    [ Appliquer un floutage sur les copies diffusées ]                │
│                                                                      │
│  Destinataires — figés à la diffusion                                │
│  • Maître d'ouvrage — SCI Aubier                                     │
│  • Maître d'œuvre — Cabinet Vallin                                   │
│                                                                      │
│  [ Valider la version 2 ]      [ Diffuser ]  (après validation)      │
├──────────────────────────────────────────────────────────────────────┤
│  Version 1 — validée le 04/09 · empreinte 3f9a…c21 · 2 consultations │
└──────────────────────────────────────────────────────────────────────┘
```

- Un brouillon **ne peut pas** être diffusé, et le mot « brouillon » est dans l'en-tête.
- Les deux avertissements — mesure indicative, personnes identifiables — apparaissent **avant**
  la diffusion, pas après.
- L'empreinte et le journal de consultation des versions antérieures restent visibles :
  c'est ce qui rend le document opposable.

---

## W8 — File de synchronisation

```
┌──────────────────────────────────────────────────────────────────────┐
│  Envois en attente                                        [ Fermer ] │
├──────────────────────────────────────────────────────────────────────┤
│  Hors ligne depuis 41 min · prochaine tentative dans 4 min           │
├──────────────────────────────────────────────────────────────────────┤
│  ⧗ 12 photos — Toiture Lilas                              1,4 Go     │
│  ⧗ 3 annotations — Façade Aubier                                     │
│  ⧗ 1 mesure — Façade Aubier                                          │
│  ⚠ 1 photo — Halle Est · 5 échecs · en attente d'intervention        │
│     Motif : le projet a été archivé.        [ Voir ] [ Réessayer ]   │
├──────────────────────────────────────────────────────────────────────┤
│  ℹ Rien n'est perdu. Un envoi rejoué ne crée jamais de doublon.      │
└──────────────────────────────────────────────────────────────────────┘
```

- **« en attente d'intervention »**, jamais « échec » sec, et **jamais** de suppression : c'est
  la lettre morte, visible et rejouable.
- Le motif d'échec est écrit en français, pas un code.
- La dernière ligne est la promesse d'idempotence, tenue par la clé, pas par l'espoir.

---

## Ce que ces schémas n'ouvrent pas

Aucune charte, aucune couleur, aucune typographie, aucun composant. Aucun développement
d'interface ne doit commencer avant **ELSATIA-UI-V2**. Ces schémas servent à valider **les
décisions fonctionnelles**, et à rien d'autre.
