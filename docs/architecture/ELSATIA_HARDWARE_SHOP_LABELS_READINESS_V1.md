# ELSATIA — Boutique matériel, registre de compatibilité & ELSATIA Labels — Readiness V1

**Audit + architecture + roadmap. Docs uniquement.**
Aucune commande fournisseur, aucun échantillon, aucune dépense, aucun compte marchand, aucun
objet Stripe, aucune migration, aucun déploiement, aucune modification Production. Aucun prix
figé (montants = paramètres à renseigner avec des données fournisseur réelles).

Base : `docs/elsatia-production-migration-cutover-preflight-v1` @ `25e377b` (descendant de
`6df3ebd`).

> **Verdict d'entrée** : rien dans ce lot n'est un pré-requis à la commercialisation de Gestion
> Pro. La Boutique matérielle existe déjà à l'état de socle (§1) ; ELSATIA Labels reste à
> construire mais est **strictement post-lancement**. Les intégrations proposées sont **additives**.

---

## 1. État existant (briques réutilisables)

| Brique | Existe | Où | Réutilisable Labels | Réutilisable Boutique | Dette |
|---|:--:|---|:--:|:--:|---|
| Génération **QR** | ✅ | `src/app/api/identification/[id]/qr/route.ts` (`qrcode` → SVG) | ✅ (rendu QR) | ✅ (QR produit/install) | pas de génération **code-barres 1D** (Code128/EAN) — lib absente |
| **Scan caméra** 1D+2D | ✅ | `src/components/StockMovementForm.tsx`, `StockKioskForm.tsx` (`@zxing/browser` `BrowserMultiFormatReader`) | ✅ | ✅ | usage limité aux formulaires stock ; pas de hook/composant scan générique réutilisable |
| Table **`codes_identification`** (IDs stables) | ✅ | `20260713000068` ; préfixe `ELS-` (`20260802000195`) ; `src/lib/qr-identification.ts` | ✅ (cible QR) | — | `type_ressource ∈ {article, chantier, vehicule, outil, employe}` — pas `emplacement`, `lot`, `machine`, `colis`, `document`, `porte`, `menuiserie` |
| **Scanner universel** (classification QR → mouvement stock) | ✅ | `20260717000097` `enregistrer_mouvement_stock_borne_v4` | partiel | — | couplé au domaine stock/borne |
| `articles_stock.code_barres` + index unique | ✅ | `20260710000034` | ✅ | ✅ | — |
| **Borne / kiosque** compte partagé | ✅ | `StockKioskForm`, `employes.code_stock_hash`, `mouvements_stock.saisi_via_borne` | ✅ (poste d'impression dédié) | — | — |
| **ELSATIA Boutique** — catalogue + commandes | ✅ | `boutique_produits`, `boutique_commandes`, `boutique_lignes_commande` (`20260724000144/145/146`), lien trésorerie (`…175/176`), renommage ELSATIA (`…194`) | — | ✅ (socle) | catalogue = 4 catégories seulement (`imprimante_code_barres`, `plastifieuse`, `consommable_plastification`, `etiquette_aimantee`) ; pas de `marque/modele/ean/fournisseur/prix_achat/marge/poids/dimensions/garantie` ; pas de `compatible_apps[]`/`compatible_modules[]`/`certified_compatibility_status` ; **policy prototype `anon` encore présente** + grants `anon` — dette sécurité à fermer avant vente réelle |
| **Checkout one-off** matériel | ✅ | `boutique_commandes.stripe_checkout_id/url/payment_intent_id`, `statut ∈ {brouillon, en_attente_paiement, payee, annulee, expiree}` | — | ✅ | distinct de l'abonnement SaaS — **bien** ; TVA fixe 0,20 (pas de gestion multi-taux ni export) |
| Snapshot prix ligne de commande | ✅ | `boutique_lignes_commande.{sku,nom,prix_unitaire_ht}_snapshot` | — | ✅ | — |
| Permissions `acces_boutique` / `gerer_boutique` | ✅ | `20260724000144` | — | ✅ | — |
| **Pipeline rendu PDF / SVG / impression** | ✅ | `apps/tools/src/lib/exports/{pdf,svg,print,share}.ts` (`jspdf`, `window.print()`, Web Share API `shareBlob`) | ✅ (modèle de rendu Labels) | — | spécifique aux schémas géométriques Tools ; à généraliser |
| `nuanciers` (teintes) | ✅ | `20260710000034` | ✅ (étiquette seau Colors) | — | — |
| Substrat multi-app + IDs stables | ✅ | `applications_elsatia`, `docs/architecture/ELSATIA_INTEGRATION_CORE_MARKET_READINESS_V1.md` | ✅ (cible QR inter-app) | ✅ (compat apps) | Integration Core non implémenté (post-launch, additif) |
| Storage (12 buckets Prod) | ✅ | `documents-*`, `entreprise-assets` (public) | ✅ (rendus PNG/PDF) | ✅ (médias produit) | — |
| **ELSATIA Labels** | ❌ | — | — | — | **application inexistante** : aucune table `labels_*`, aucun modèle de template, aucun `PrinterAdapter`, aucun langage ZPL/TSPL/ESC-POS |

**Conclusion §1** : Boutique = socle fonctionnel présent, à enrichir (champs matériel, compat,
serials, packs) et à sécuriser (retrait des policies prototype). Scan/QR = briques matures
réutilisables. Rendu imprimable = pattern existant (Tools). Labels = à créer intégralement,
post-lancement.

---

## 2. Hardware Compatibility Registry — contrat cible

Registre **distinct** du catalogue de vente : base curée des matériels **évalués par ELSATIA**,
qu'ils soient vendus ou non. Une entrée catalogue Boutique référence une entrée registre.

`materiels_compatibles` (contrat conceptuel — **aucune table créée**) :

| Champ | Type / valeurs | Note |
|---|---|---|
| `id` | uuid | — |
| `marque`, `modele` | text | — |
| `type` | enum taxonomie §6 | — |
| `reference_constructeur` | text | SKU fabricant |
| `reference_elsatia` | text | code interne `ELS-HW-…` |
| `statut_certification` | enum §5 (`a_evaluer`/`teste`/`compatible`/`recommande`/`incompatible`/`obsolete`) | wording public dérivé (§5) |
| `teste_par_elsatia` | boolean | |
| `date_test` | date | |
| `os_supportes` | text[] | `windows`, `macos`, `ios`, `ipados`, `android`, `chromeos`, `linux` |
| `connexion` | text[] | `usb_hid`, `usb_serial`, `bluetooth_le`, `bluetooth_spp`, `wifi`, `ethernet`, `nfc` |
| `pilotes` | jsonb | par OS : lien, version, mode d'install |
| `sdk_api` | jsonb | présence, type (`web`, `native`, `raw_socket`), doc |
| `dimensions_mm` | jsonb | L × l × h |
| `alimentation` | text | secteur / batterie (mAh) / USB-PD |
| `formats_supportes` | text[] | pour imprimantes : largeurs mm, DPI ; pour scanners : symbologies |
| `consommables_compatibles` | uuid[] | → `consommables_compatibles` (§7) |
| `apps_elsatia_compatibles` | text[] | `gestion_pro`, `colors`, `tools`, `labels`, `market`, `plans` |
| `modules_gp_compatibles` | text[] | `stock`, `chantier`, `materiel`, `maintenance`, `scan_ocr`, `safety`, `forms` |
| `procedure_installation` | text / ref | lien fiche §19 |
| `notice` | jsonb | langue, PDF, URL |
| `garantie` | jsonb | durée, périmètre, canal (§23) |
| `sav` | jsonb | modèle opératoire (§23) |
| `fournisseur` | text / uuid | → shortlist §25 (pas de contact) |
| `lien_fournisseur` | text | |
| `moq` | integer | quantité minimale de commande |
| `delai_jours` | integer | |
| `statut_produit` | enum | `actif`, `bientot`, `fin_de_serie`, `retire` |
| `notes_internes` | text | jamais exposé |
| `created_at`, `updated_at` | timestamptz | |

RLS cible : lecture `authenticated` (catalogue plateforme, non tenant) ; écriture
`est_plateforme_admin()` + AAL2 ; jamais de policy `anon`.

---

## 3. Statuts de compatibilité

| Statut interne | Signification | Wording public autorisé |
|---|---|---|
| `a_evaluer` | identifié, non testé | *(aucun — invisible en Boutique)* |
| `teste` | testé, résultats partiels / réserves | « Testé par ELSATIA » |
| `compatible` | fonctionne, sans réserve bloquante | « Compatible ELSATIA » |
| `recommande` | compatible + retour d'usage terrain positif | **« Compatible et sélectionné par ELSATIA »** |
| `incompatible` | échec de test documenté | *(invisible ; note interne)* |
| `obsolete` | remplacé / fin de série | « Génération précédente » |

**Règles de wording** :
- `Compatible et sélectionné par ELSATIA` **uniquement** après test réel documenté (`date_test`
  + `teste_par_elsatia = true` + `statut ≥ recommande`).
- **Ne jamais** employer « Certifié ELSATIA » : risque de confusion avec une certification
  réglementaire (CE, etc.). Employer « sélectionné », « testé », « compatible ».
- Toute mention publique doit être traçable à une entrée registre et à un compte-rendu de test
  (§26).

---

## 4. Types de matériel — taxonomie V1 / V2 / futur

| Type | Palier | Note |
|---|:--:|---|
| Scanette USB (HID) | **V1** | priorité — HID générique, zéro pilote |
| Scanette Bluetooth (HID/SPP) | **V1** | appairage + HID |
| Lecteur QR dédié | V1 | souvent = scanette 2D |
| Imprimante thermique compacte (étiquettes) | **V1** | bureau, USB/Wi-Fi |
| Imprimante étiquettes bureau | V1 | — |
| Imprimante mobile chantier | **V1** | Bluetooth, batterie, étiquettes résistantes |
| Scanner documents bureau (recto/verso, A4) | **V1** | pour module Scan/OCR |
| Imprimante étiquettes industrielle | V2 | volume dépôt |
| Scanner portable | V2 | — |
| Tablette renforcée | V2 | + support §ci-dessous |
| Support / dock tablette | V2 | accessoire |
| Balise Bluetooth (BLE beacon) | V2 | localisation matériel |
| RFID (lecteur + tags) | **futur** | hors V1/V2 |
| Étiquettes / consommables | transverse | traité §7 |

---

## 5. Consommables — contrat

Un matériel (imprimante) → liste de consommables compatibles.

`consommables_compatibles` (conceptuel) :

| Champ | Note |
|---|---|
| `id`, `nom`, `type` (`rouleau_thermique`, `ruban_transfert`, `papier_thermique`, `etiquette_exterieur`, `etiquette_cable`, `etiquette_anti_arrachement`, `qr_protege`, `pochette_plastification`) | |
| `dimensions_mm` (largeur × longueur ou L×l unitaire) | |
| `matiere` (papier, polypro, polyester, vinyle) | |
| `adhesif` (permanent, repositionnable, renforcé, cryo) | |
| `resistance_eau`, `resistance_uv` (booléens + niveau) | |
| `plage_temperature_c` (min/max) | |
| `quantite_par_rouleau` / `par_boite` | |
| `imprimantes_compatibles` (uuid[] → registre §2) | |
| `couleur` | |
| `cout_achat`, `prix_vente`, `marge` | **valeurs non fixées** (§35) |
| `stock`, `seuil_alerte`, `fournisseur`, `moq`, `delai_jours` | |

Lien Boutique : une ligne `boutique_produits` de catégorie consommable référence
`consommable_id` ; l'UI produit affiche « Compatible avec : [imprimantes] » et inversement.

---

## 6. ELSATIA Labels — positionnement

**Application autonome** (comme Colors / Tools / Market / Plans), sur le substrat multi-app
(`applications_elsatia.code = 'labels'`), **pas un module Gestion Pro**. Domaine : générer,
gérer et imprimer des étiquettes (QR / code-barres / texte) pour tout objet identifiable de
l'écosystème.

Cas d'usage : stock, matériel, machines, véhicules, colis, documents, portes, vitrages,
menuiseries, lots, emplacements — chaque étiquette porte un QR vers une ressource stable (fiche
technique, chantier, notice, maintenance). Utilisable seule (import CSV) ou branchée à Gestion
Pro / Colors / Market.

**Ne pas développer dans ce lot.**

---

## 7. Labels — objets métier générateurs d'étiquette

| Objet | Source | ID stable | Cible QR par défaut |
|---|---|---|---|
| Article stock | `articles_stock` | `codes_identification` (`article`) | fiche article |
| Matériel / outil | `outils` | `codes_identification` (`outil`) | fiche matériel + maintenance |
| Véhicule | `vehicules` | `codes_identification` (`vehicule`) | fiche véhicule |
| Chantier | `chantiers` | `codes_identification` (`chantier`) | fiche chantier |
| Employé (badge) | `employes` | `codes_identification` (`employe`) | *(usage restreint, opt-in RGPD)* |
| Emplacement / rayonnage | *(à créer)* `emplacements` | **nouveau `type_ressource` `emplacement`** | vue emplacement |
| Lot / réception | `receptions_lot` | **nouveau `type_ressource` `lot`** | traçabilité lot |
| Machine | *(matériel spécifique)* | `type_ressource` `machine` (nouveau) | maintenance |
| Colis / préparation | *(Market)* | `type_ressource` `colis` (nouveau) | listing / retrait |
| Document | `documents_chantier`, `pieces_jointes_*` | `type_ressource` `document` (nouveau) | visionneuse doc |
| Seau (Colors) | `colors_seaux` | à cadrer avec Colors | fiche seau (§29) |
| Produit Boutique | `boutique_produits` | `sku` | fiche produit |

**Principe** : chaque QR encode un identifiant **stable et opaque** (préfixe `ELS-`), résolu
côté serveur ; jamais d'URL avec données personnelles ni d'identifiant technique exposé. Réutiliser
`codes_identification` + `src/lib/qr-identification.ts` en **étendant l'enum `type_ressource`**.

---

## 8. Label Template Core — format de modèle

`labels_templates` (conceptuel) :

| Champ | Note |
|---|---|
| `template_id`, `nom`, `entreprise_id` (null = modèle ELSATIA) | |
| `largeur_mm`, `hauteur_mm`, `orientation` (`portrait`/`paysage`) | |
| `dpi` (`203`, `300` ; `600` futur) | |
| `marges_mm` (haut/bas/gauche/droite) | |
| `elements` jsonb[] : `{ type: 'texte'|'qr'|'barcode'|'logo'|'image'|'ligne'|'rectangle', x_mm, y_mm, w_mm, h_mm, variable?, format?, options }` | positionnement absolu en mm |
| `variables` jsonb : nom → source (`objet.champ`), valeur par défaut, format | |
| `imprimantes_compatibles` uuid[] → registre §2 | |
| `apercu_url` (PNG rendu) | |
| `version`, `created_at`, `updated_at` | |

Formats de base fournis : 57×32, 40×30, 100×50, 62×29 (Brother DK-like), 101×54 mm, à 203 et
300 dpi. Rendu de référence = **SVG en mm** (source de vérité) → export PDF / PNG / langage
imprimante (§14).

---

## 9. Barcode / QR — formats supportés

| Symbologie | Palier | Cas d'usage recommandé |
|---|:--:|---|
| **QR Code** | V0 | usage principal — lien vers ressource, capacité data, tolérance salissure |
| **Code 128** | V1 | code-barres 1D interne (référence article, lot) — dense, alphanumérique |
| **EAN-13** | V1 | produits du commerce (consommables revendus avec EAN fabricant) |
| **DataMatrix** | V2 | très petites étiquettes (composants, câbles) |
| Code 39 | futur | compat legacy uniquement si un scan client l'impose |

V1 minimal = **QR + Code 128 + EAN-13**. Génération QR : `qrcode` (déjà présent).
Code 128 / EAN-13 : lib à ajouter au moment de Labels V1 (`bwip-js` ou `jsbarcode` — décision
différée, hors de ce lot).

---

## 10. Impression Web / native — contraintes réelles

| Surface | Mécanisme réaliste sans SDK propriétaire | Limite |
|---|---|---|
| **Web (navigateur)** | `window.print()` sur un HTML/SVG calibré en mm + CSS `@page { size }` → boîte de dialogue système ; l'utilisateur choisit son imprimante | pas de contrôle du média/vitesse ; marges pilote ; calibrage manuel |
| **Web + PDF** | générer un PDF exact (mm, DPI) → impression PDF système ou spouleur | idem ; fiable pour imprimantes bureau |
| **Desktop / natif (futur)** | accès potentiel au driver OS / port USB via app native (Capacitor + plugin, Electron) | dépend de l'OS et des permissions |
| **Mobile — Android** | Android Print Framework (PDF) ; impression Bluetooth via SDK constructeur ou profil générique | SDK par marque pour ZPL/TSPL direct |
| **Mobile — iOS/iPadOS** | AirPrint (PDF) ; Bluetooth via SDK constructeur (MFi) | AirPrint = pas de langage étiquette natif ; MFi contraignant |
| **App stores** | app Labels native (Capacitor, comme Tools) — impression système + plugins Bluetooth par marque | soumission stores + entitlements |

**Faisable sans SDK propriétaire (V1)** : rendu SVG/PDF calibré + impression système
(navigateur / AirPrint / Android Print). Les langages étiquette bruts (ZPL/TSPL) et le
Bluetooth direct = V2/V3 avec adapters (§13).

---

## 11. Driver / SDK abstraction — `PrinterAdapter` (conceptuel, non implémenté)

Interface unique, implémentations enfichables :

```
PrinterAdapter
  .capabilities() -> { languages, maxWidthMm, dpi[], transport[] }
  .render(templateInstance) -> Payload            // ZPL | TSPL | ESC/POS | PDF | RASTER
  .print(payload, target)   -> PrintResult        // via transport
```

| Implémentation | Transport | Palier |
|---|---|---|
| `browser_system_print` | dialogue navigateur (HTML/SVG) | **V1** |
| `system_pdf` | PDF → spouleur OS / AirPrint / Android Print | **V1** |
| `generic_zpl` | ZPL brut → USB/raw socket 9100 / Bluetooth SPP | V2 |
| `generic_tspl` | TSPL brut | V2 |
| `generic_escpos` | ESC/POS (imprimantes tickets/mobiles) | V2 |
| `zebra` / `brother` / `dymo` | SDK / profils spécifiques marque | V3 |

**Objectif** : Labels ne doit jamais dépendre d'une seule marque. Le cœur produit un **modèle
neutre** ; l'adapter traduit.

---

## 12. Langages d'impression — standards à prévoir

| Langage | Rôle | V1 ? |
|---|---|---|
| **PDF** | export universel, impression bureau/mobile | **oui** |
| **SVG** | source de vérité du rendu (mm), aperçu, base des autres exports | **oui** |
| **Raster (PNG)** | fallback universel (toute imprimante), aperçu | **oui** |
| **ZPL** | Zebra & compatibles, étiquettes industrielles/mobiles | V2 |
| **TSPL** | TSC / génériques low-cost | V2 |
| **EPL** | Zebra legacy | futur (si un modèle retenu l'impose) |
| **ESC/POS** | imprimantes mobiles / tickets | V2 |

**Minimum V1 : SVG (source) → PDF + PNG.** Aucun langage propriétaire avant les adapters V2.

---

## 13. Scan / lecture — stratégie

| Mode | Mécanisme | Priorité |
|---|---|---|
| **QR / barcode via caméra** | `@zxing/browser` (déjà en place dans GP stock) — extraire en hook réutilisable `useScanner()` | **V1** — priorité |
| **Scanette clavier HID (USB/Bluetooth)** | la scanette « tape » le code + Entrée → champ input focalisé ; support **HID générique** sans SDK | **V1** — priorité |
| **Scanner USB (image)** | Web n'accède pas au TWAIN/SANE ; passe par le logiciel constructeur → fichier → import ; app native plus tard | V2 |
| **SDK propriétaire scanette/scanner** | uniquement si un besoin terrain le justifie (mode batch, RFID) | futur |

**Règle : HID générique d'abord** (marche partout, zéro intégration), SDK propriétaire seulement
sur besoin prouvé.

---

## 14. ELSATIA Boutique — modèle produit cible

Extension de `boutique_produits` (conceptuel — **aucune migration**) :

| Champ ajouté | Note |
|---|---|
| `type` (`materiel`, `consommable`, `pack`, `service`) | remplace/étend `categorie` |
| `materiel_id` uuid → registre §2 (si `type='materiel'`) | source de vérité compat |
| `consommable_id` uuid → §5 (si `type='consommable'`) | |
| `marque`, `modele`, `ean` | |
| `fournisseur_id`, `prix_achat_ht`, `frais_annexes`, `marge_cible` | **valeurs non fixées** |
| `poids_g`, `dimensions_colis_mm` | logistique / livraison |
| `garantie` jsonb, `serial_tracking` boolean | §17, §23 |
| `compatible_apps[]`, `compatible_modules[]` | dérivés du registre ; affichés en Boutique |
| `certified_compatibility_status` (enum §3) | pilote le wording public |
| `documentation` jsonb (notices, guides), `media` jsonb[] | |
| `livraison` jsonb (délai, transporteur, zones) | |
Champs existants conservés : `sku`, `nom`, `description`, `prix_ht`, `taux_tva`, `image_url`,
`stock_disponible`, `seuil_alerte_stock`, `actif`.

**Dette sécurité à traiter avant vente réelle** : retirer `boutique_produits_prototype`
(`to anon using(true)`) et les grants `anon` sur `boutique_produits` / `boutique_commandes`.

---

## 15. Numéros de série

`materiels_vendus` (conceptuel) — une ligne par unité livrée avec `serial_tracking = true` :

| Champ | Note |
|---|---|
| `id`, `commande_ligne_id` → `boutique_lignes_commande` | |
| `produit_id`, `materiel_id` (registre) | |
| `serial_constructeur` | scanné / saisi à l'expédition |
| `serial_elsatia` | code interne `ELS-SN-…` (phase OEM) |
| `entreprise_cliente_id` | |
| `date_vente`, `date_livraison` | |
| `garantie_debut`, `garantie_fin`, `garantie_perimetre` | |
| `active_le`, `active_via` (QR install §20) | |
| `historique_sav` jsonb[] : date, motif, action, statut | |
| `statut` (`vendu`, `livre`, `active`, `sav`, `remplace`, `retourne`) | |

Essentiel pour la **phase OEM** (§21) : traçabilité, garantie, rappel, pièces détachées.

---

## 16. Packs métier (contenu — aucun prix)

| Pack | Contenu matériel | Dépendances logicielles | Installation | Support |
|---|---|---|---|---|
| **Pack Stock** | scanette (USB ou BT) + imprimante étiquettes bureau + rouleaux | module **Stock** + **Labels** (ou Labels seul) | semi-auto (QR install §20) | standard |
| **Pack Chantier** | imprimante mobile Bluetooth + étiquettes résistantes (extérieur/UV) | module **Chantier** (+ Labels) | guidé mobile | standard |
| **Pack Matériel** | jeu d'étiquettes QR pré-imprimées + scanette | module **Matériel** + **Maintenance** | manuel (pose QR) + guide | standard |
| **Pack Documents** | scanner documents recto/verso A4 | module **Scan/OCR** | pilote constructeur + guide | standard |
| **Pack Dépôt** | 2–4 scanettes + imprimante étiquettes pro + rouleaux | module **Stock** (multi-postes) + **Labels** | assisté (à distance ou sur site) | prioritaire |

Chaque pack = 1 ligne `boutique_produits` `type='pack'` + une nomenclature
`pack_composition (pack_id, produit_id, quantite)`. Les modules/capacités éventuellement inclus
restent gérés par leur moteur (entitlements R3), **jamais** dupliqués dans la Boutique.

---

## 17. Installation / provisioning

Parcours cible :

```
achat Boutique → livraison → déballage
  → scan du QR d'installation sur l'emballage (§20)
  → page /install/<reference> : détection OS, app conseillée, pilote, guide, modèle d'étiquette
  → connexion compte ELSATIA (ou création)
  → l'app/module « adopte » le matériel : test d'impression / test de scan
  → matériel passé au statut `actif` (lié à l'entreprise + éventuellement au serial §15)
```

Trois niveaux :
- **Manuel** (V1) : guide pas-à-pas, l'utilisateur installe le pilote et calibre.
- **Semi-automatique** (V2) : détection du matériel connecté (HID / navigateur), pré-remplissage,
  test guidé.
- **Provisioning** (futur / OEM) : matériel pré-appairé, profil poussé, zéro configuration.

---

## 18. QR d'installation

QR imprimé sur l'emballage → `https://elsatia.fr/install/<reference>` (**route non créée**).
Doit : détecter l'OS, proposer l'app (web / Play / App Store), le pilote, le guide, le modèle
d'étiquette adapté, un test matériel (impression mire + scan de vérification).
`<reference>` = `reference_elsatia` du registre (ou `sku` produit) — opaque, sans donnée client.

---

## 19. OEM / marque blanche — checklist fournisseur (phase 2, aucun contact)

CE accepté · MOQ · coût d'outillage (tooling) · logo sur produit · packaging personnalisé ·
notice FR · firmware / logo à l'écran · numéro de série (format, unicité) · QR sur produit /
boîte · délais série · garantie (durée, périmètre) · pièces détachées (disponibilité, durée) ·
fin de vie / obsolescence programmée · politique de changement de composant (révision sans
préavis ?) · conformité (§22) · traçabilité lot / n° série · échantillons pré-série · seuil de
requalification si changement matériel.

---

## 20. Conformité UE — checklist documentaire (sans avis juridique)

| Élément | À obtenir de | Palier |
|---|---|---|
| Marquage **CE** + déclaration UE de conformité | fournisseur | avant vente |
| **RoHS** (substances dangereuses) | fournisseur | avant vente |
| **REACH** (SVHC) | fournisseur | avant vente |
| **DEEE / WEEE** (déchets électroniques) : n° producteur, éco-organisme, éco-participation | ELSATIA en tant que metteur sur le marché / distributeur | **à vérifier juriste** |
| **RED** (2014/53/UE) pour tout radio : Bluetooth, Wi-Fi | fournisseur | avant vente radio |
| Sécurité électrique (LVD / EN 62368-1) | fournisseur | avant vente |
| Batterie (UN 38.3 transport, futur règlement batteries UE) | fournisseur | si batterie |
| **CEM / EMC** (2014/30/UE) | fournisseur | avant vente |
| Notice en **français** + marquage / étiquetage conformes | fournisseur (exigence contractuelle) | avant vente |
| Coordonnées **importateur / responsable UE** sur le produit ou l'emballage | ELSATIA si import hors UE | **à vérifier juriste** |
| Obligations du **distributeur** (vérif. CE, notice, conservation preuves, coopération autorités) | ELSATIA | **à vérifier juriste** |

Classement : la plupart = *à vérifier fournisseur* ; DEEE, responsable UE, obligations
distributeur, éco-participation = *à vérifier juriste* avant Phase 1.

---

## 21. Garantie / SAV — modèle opératoire

| Modèle | Expérience client | Coût ELSATIA | Responsabilité | Logistique |
|---|---|---|---|---|
| **A. Client → ELSATIA → fournisseur** | meilleure (interlocuteur unique) | élevé (support N1, port, prêt) | ELSATIA porte la relation | ELSATIA gère les retours |
| **B. Client → fournisseur direct** | moins bonne (renvoi vers un tiers) | faible | fournisseur | fournisseur |
| **C. Hybride** : ELSATIA qualifie (N1) puis oriente / prend en charge selon le cas | correcte | moyen | partagée | mixte |

**Recommandation V1 = C (hybride)** : ELSATIA fait le premier niveau (diagnostic à distance,
échange de consommable, remplacement si panne évidente sous garantie), et bascule vers le
fournisseur pour les réparations. Passe à **A** en Phase 2/OEM quand le volume le justifie.

---

## 22. Stock / immobilisation — Phase 1

| Option | Marge | Délai client | MOQ | SAV | Branding | Cash immobilisé |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **A. Stock ELSATIA** | +++ | court | subit le MOQ | maîtrisé | fort | **élevé** |
| **B. Dropshipping fournisseur** | + | dépend fournisseur | nul | fournisseur | faible | **nul** |
| **C. Hybride** (stock des best-sellers + consommables, dropship du reste) | ++ | mixte | ciblé | mixte | moyen | maîtrisé |

**Recommandation Phase 1 = B ou C-léger** : démarrer en **dropshipping** (ou stock minimal des
seuls consommables à forte rotation), valider la demande réelle, puis internaliser le stock des
références qui se vendent (Phase 2). Éviter d'immobiliser du cash sur un catalogue non validé.

---

## 23. Critères de shortlist fournisseurs (aucune recherche web dans ce lot)

France / UE · catalogue stable · disponibilité / stock réel · certifications fournies (CE, RoHS,
REACH, RED) · dropshipping possible · API ou flux catalogue / stock · OEM envisageable · MOQ
faible · garantie claire · délais courts · support **francophone** · facturation **B2B** (SIRET,
TVA intracom) · ancienneté / solidité · politique de retour · pièces détachées · engagement de
non-rupture / préavis fin de série.

---

## 24. Protocole de test ELSATIA

### Scanette
USB (plug HID) · Bluetooth (appairage, reconnexion) · lecture **QR** · **Code 128** · **EAN-13**
· latence (ms scan→saisie) · portée BT (m) · autonomie (h / nb scans) · robustesse (chute,
poussière) · comportement hors couverture (buffer) · comportement navigateur (focus champ).

### Imprimante
Installation (web / Windows / macOS / iOS / Android) · qualité du **QR imprimé** (scan réussi à
X cm, après pliage / eau si étiquette annoncée résistante) · vitesse (étiquettes/min) ·
consommables (mise en place, calibrage, détection fin de rouleau) · reconnexion après veille ·
comportement **offline** / file d'attente · coût réel par étiquette.

### Scanner documents
OCR (qualité texte) · recto/verso automatique · A4 / petits formats · résolution effective ·
pilote (web impossible → logiciel constructeur) · macOS / Windows · vitesse (pages/min) ·
chargeur automatique (bourrages).

Chaque test → compte-rendu daté, versionné, lié à l'entrée registre ; **c'est la preuve** qui
autorise le wording « sélectionné par ELSATIA ».

---

## 25. Matrice matériel ↔ apps

| Matériel | GP | Colors | Tools | Labels | Modules GP | Web | Android | iOS |
|---|:--:|:--:|:--:|:--:|---|:--:|:--:|:--:|
| Scanette USB HID | ✅ | ✅ | — | ✅ | Stock, Matériel, Chantier | ✅ | ✅ | ⚠️ (accessoire clavier BT) |
| Scanette Bluetooth HID | ✅ | ✅ | — | ✅ | Stock, Matériel | ✅ | ✅ | ✅ (HID) |
| Imprimante étiquettes bureau | ✅ | ✅ | — | ✅ | Stock, Labels | ✅ (PDF/print) | ✅ (Android Print) | ✅ (AirPrint) |
| Imprimante mobile chantier | ✅ | — | — | ✅ | Chantier, Matériel | ⚠️ | ✅ (SDK/BT) | ⚠️ (MFi) |
| Scanner documents bureau | ✅ | — | — | — | Scan/OCR | ⚠️ (via logiciel) | — | — |
| Tablette renforcée | ✅ | ✅ | ✅ | ✅ | tous terrain | ✅ | ✅ | ✅ |
| Balise BLE (V2) | ✅ | — | — | — | Matériel | ⚠️ | ✅ | ✅ |

Légende : ✅ pris en charge · ⚠️ partiel / dépend du modèle · — non pertinent.
Objectif : cette matrice est **affichée dans la fiche produit Boutique**, dérivée du registre §2.

---

## 26. Intégrations Labels ↔ écosystème

### Labels ↔ Gestion Pro
- `article stock → Labels → modèle → impression → QR → retour fiche article` (impression à
  l'entrée en stock, **optionnelle et opt-in**).
- `matériel GP → Labels → QR → Maintenance` (QR sur l'équipement → historique / échéances).
- `chantier → Labels → QR chantier` (panneau, classeur, doc).
- Point d'entrée : bouton « Étiqueter » sur les fiches, appelant Labels avec le `type_ressource`
  + `ressource_id` ; `codes_identification` garantit l'ID stable.

### Labels ↔ Colors
- `seau colors → QR → teinte / quantité / emplacement / fiche seau`. **Non obligatoire** :
  proposé, jamais imposé dans le flux Colors.

### Labels ↔ Market (futur)
- `produit Market → étiquette préparation / retrait → QR listing`. Optionnel, post-Market.

### Labels ↔ Integration Core
- Les identifiants de ressource et la résolution QR passent par les IDs stables ELSATIA
  (`ELS-…`) ; un futur événement `label.printed` / `label.template.updated` sur l'Event Core est
  possible, non requis.

---

## 27. Boutique ↔ billing / services

- **Ne pas confondre** abonnement SaaS (Stripe subscription) et achat matériel (Stripe
  **Checkout `mode=payment`**, one-off — déjà en place dans `boutique_commandes`).
- Flux Boutique : commande → `en_attente_paiement` (Checkout) → webhook `checkout.session.completed`
  → `payee` → préparation / expédition → livraison → (option) activation §17.
- À prévoir (non implémenté) : **facture** de vente matériel (numérotation dédiée, distincte des
  factures SaaS), **TVA produit** multi-taux + mentions, **remboursement** (retour, rétractation
  B2B), **frais de port** ligne dédiée, **avoir**.
- **Boutique ↔ services** : une commande peut porter des lignes de types différents —
  `materiel`, `consommable`, `pack`, `installation`, `formation`, `module`, `capacite` — mais
  **chaque type conserve son moteur** : `module`/`capacite` déclenchent les RPC d'entitlement
  (R3 / R2), `installation`/`formation` créent une commande de service, le matériel suit la
  logistique Boutique. Une seule commande, plusieurs moteurs.

---

## 28. Réapprovisionnement consommables

- **Concept** : à partir de l'usage Labels/Stock (nb d'étiquettes imprimées, mouvements), estimer
  la consommation de rouleaux et **suggérer** un réassort quand le stock chute sous un seuil.
- **Impératif : opt-in.** Aucune commande automatique sans consentement explicite et par
  commande. La suggestion ouvre un panier pré-rempli ; l'humain valide.
- Modèles à évaluer **post-launch** : achat ponctuel (défaut) · **abonnement rouleaux** (réassort
  programmé mensuel/trimestriel, résiliable) · réassort déclenché par seuil. Aucun prix ni
  engagement fixé ici.

---

## 29. Marge — modèle de calcul (aucun pourcentage figé)

```
coût_réel_unité =
    prix_achat_HT
  + transport_entrant amorti
  + emballage / kitting
  + provision SAV (taux de retour estimé × coût de traitement)
  + frais de paiement (Stripe)
  + coût de stockage amorti (si stock ELSATIA)
prix_vente_HT = coût_réel_unité × (1 + marge_cible)
marge_cible : à déterminer par catégorie avec des données fournisseur réelles ;
              distincte matériel (faible rotation) vs consommables (récurrent).
TVA : appliquée au prix de vente HT, taux produit (à confirmer, généralement 20 %).
```

Ne pas fixer `marge_cible` sans devis fournisseur, volumes et taux de retour observés.

---

## 30. Multi-plateforme — Labels

Labels respecte la règle ELSATIA : web desktop / tablette / mobile, **PWA installable**, Android
(Play), iOS/iPadOS (App Store). Selon le matériel : Bluetooth (impression mobile), caméra
(scan), **offline** (file d'impression + génération locale), impression système (PDF/AirPrint/
Android Print) partout, adapters langage (ZPL/TSPL) en natif V2+.

---

## 31. Roadmap Labels

| Palier | Contenu | Dépendances |
|---|---|---|
| **V0** | génération **PDF / PNG / SVG** d'étiquettes avec **QR + Code 128 + EAN-13**, données saisies ou importées (CSV) ; aucun matériel requis | lib code-barres à ajouter |
| **V1** | **templates** (`labels_templates`), variables dynamiques, aperçu, **impression système** (navigateur / AirPrint / Android Print) ; branchement Gestion Pro (bouton « Étiqueter ») | `codes_identification` étendu ; app multi-app `labels` |
| **V2** | **`PrinterAdapter`** + langages **ZPL / TSPL / ESC-POS**, impression directe USB/raw/BT, registre matériel §2 exploité | app native (Capacitor) |
| **V3** | mobile / **Bluetooth** direct, impression chantier hors ligne, batch | plugins BT par marque |
| **V4** | **provisioning Boutique** : QR install → adoption matériel → modèle poussé → test automatique | Boutique Phase 1+ , registre §2 |

---

## 32. Roadmap Boutique

| Phase | Contenu |
|---|---|
| **Phase 0** | architecture (ce document) ; critères fournisseurs §23 ; sécurisation du socle existant (retrait policies `anon` §14) ; extension du modèle produit §14 ; registre §2 |
| **Phase 1** | **matériel existant sélectionné et testé** (§24) sous « Compatible et sélectionné par ELSATIA » ; catalogue enrichi (compat, media, garantie) ; checkout one-off (déjà là) + facture matériel ; **dropshipping** ou stock consommables minimal (§22) |
| **Phase 2** | **packs métier** §16 ; réassort consommables opt-in §28 ; internalisation du stock des best-sellers |
| **Phase 3** | **consommables récurrents** (abonnement rouleaux, réassort programmé) |
| **Phase 4** | **OEM / marque blanche ELSATIA** §19 : produits estampillés, serials ELSATIA, provisioning §17 |

---

## 33. MUST avant commercialisation Gestion Pro vs POST

### MUST avant GP
**Aucun.** Rien dans ce lot n'est un pré-requis à la commercialisation de Gestion Pro.

### SHOULD (rapidement, si la Boutique est ouverte au lancement)
- Retirer les policies/grants **`anon`** sur `boutique_produits` / `boutique_commandes` (dette
  sécurité) **si** la Boutique est exposée publiquement au lancement — sinon POST.
- Clarifier la **facture** matérielle et la **TVA produit** avant la première vente réelle.
- Checklist conformité §20 traitée avec le premier fournisseur avant la première vente.

### POST (post-lancement)
- Registre de compatibilité matériel §2.
- Extension du modèle produit §14 (compat, serials, packs).
- ELSATIA Labels dans son intégralité (V0→V4).
- Adapters d'impression, langages ZPL/TSPL, provisioning, OEM.
- Réassort / abonnement consommables.

---

## 34. Risques

- **Confusion « certifié »** : employer par erreur « Certifié ELSATIA » → risque juridique
  (certification réglementaire). Garde-fou : wording contraint §3, revue avant publication.
- **Promesse de compatibilité non testée** : afficher « sélectionné » sans compte-rendu de
  test → litige client. Garde-fou : statut dérivé d'une preuve de test datée §24.
- **Responsabilité produit / conformité** : ELSATIA devient distributeur (voire importateur) →
  obligations DEEE, responsable UE, sécurité. Garde-fou : checklist §20 traitée avec juriste
  avant Phase 1.
- **Cash immobilisé** sur un catalogue non validé. Garde-fou : dropshipping en Phase 1 §22.
- **Dépendance mono-marque** pour l'impression. Garde-fou : `PrinterAdapter` + modèle neutre §11.
- **Dette sécurité Boutique existante** (`anon` policies) exposée si la Boutique est ouverte
  telle quelle. Garde-fou : §14 / §33 SHOULD.
- **SAV sous-dimensionné** en Phase 1. Garde-fou : modèle hybride §21, volume limité au départ.
- **Couplage Labels ↔ Gestion Pro** trop fort. Garde-fou : Labels = app autonome §6, branchement
  optionnel, IDs stables partagés seulement.
- **Consommables : commande automatique non consentie** → perte de confiance. Garde-fou : opt-in
  strict §28.

---

`ELSATIA-HARDWARE-SHOP-LABELS-READINESS-V1 VALIDÉ — BOUTIQUE ET LABELS CADRÉS — AUCUN BLOCKER AVANT GESTION PRO`
