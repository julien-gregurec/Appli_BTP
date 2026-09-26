import type { ToolId } from "./catalog";
import { CalculationError, arcFromChordRise, circle, distributeAdvanced, distributeByMaximumSpacing, distributeGlazing, estimateGlassWeight, estimatePaint, estimatePanels, insulationResistance, rectangleArea, rectangleDiagonal, rightAngle345, rightTriangle, roundForDisplay, segmentalArch, solveSlope } from "./calculations";

export type InputDefinition = { key: string; label: string; unit?: string; hint?: string; step?: string; inputType?: "number" | "select"; options?: readonly { value: string; label: string }[]; showWhen?: { key: string; values: readonly string[] } };
export type ResultLine = { label: string; value: string; primary?: boolean };
export type SiteInstructions = { steps: string[]; controls: string[]; warnings: string[] };
export type ToolExecution = { results: ResultLine[]; note: string; instructions: SiteInstructions };

export const toolFields: Partial<Record<ToolId, InputDefinition[]>> = {
  "diagonale-rectangle": [{ key: "length", label: "Longueur", unit: "mm" }, { key: "width", label: "Largeur", unit: "mm" }],
  "angle-droit-345": [{ key: "referenceA", label: "Longueur disponible sur le premier côté", unit: "mm", hint: "Correspond au côté 3 du ratio 3:4:5" }],
  pythagore: [{ key: "a", label: "Côté A", unit: "mm" }, { key: "b", label: "Côté B", unit: "mm" }],
  pente: [
    { key: "mode", label: "Ce que je connais", inputType: "select", options: [{ value: "percent-from-run", label: "Longueur horizontale + pente en %" }, { value: "percent-from-rise", label: "Longueur horizontale + dénivelé" }, { value: "run-from-rise", label: "Dénivelé + pente en %" }, { value: "degrees-from-run", label: "Longueur horizontale + angle" }] },
    { key: "run", label: "Longueur horizontale", unit: "mm", showWhen: { key: "mode", values: ["percent-from-run", "percent-from-rise", "degrees-from-run"] } },
    { key: "percent", label: "Pente", unit: "%", step: "0.1", showWhen: { key: "mode", values: ["percent-from-run", "run-from-rise"] } },
    { key: "rise", label: "Dénivelé", unit: "mm", showWhen: { key: "mode", values: ["percent-from-rise", "run-from-rise"] } },
    { key: "degrees", label: "Angle", unit: "°", step: "0.1", showWhen: { key: "mode", values: ["degrees-from-run"] } },
  ],
  "surface-rectangle": [{ key: "length", label: "Longueur", unit: "m", step: "0.01" }, { key: "width", label: "Largeur", unit: "m", step: "0.01" }],
  cercle: [{ key: "diameter", label: "Diamètre", unit: "mm" }],
  "arc-corde-fleche": [{ key: "chord", label: "Longueur de corde / largeur d’ouverture", unit: "mm" }, { key: "rise", label: "Flèche / hauteur du cintre", unit: "mm" }],
  repartition: [{ key: "mode", label: "Valeur à déterminer", inputType: "select", options: [{ value: "known-width", label: "Je connais la largeur des éléments" }, { value: "solve-width", label: "Calculer la largeur des éléments" }] }, { key: "total", label: "Longueur totale", unit: "mm" }, { key: "count", label: "Nombre d’éléments", step: "1" }, { key: "elementWidth", label: "Largeur d’un élément", unit: "mm", showWhen: { key: "mode", values: ["known-width"] } }, { key: "separatorWidth", label: "Largeur minimale des séparateurs", unit: "mm" }, { key: "startGap", label: "Marge gauche", unit: "mm" }, { key: "endGap", label: "Marge droite", unit: "mm" }],
  entraxes: [{ key: "total", label: "Longueur totale", unit: "mm" }, { key: "maxSpacing", label: "Entraxe maximum", unit: "mm" }, { key: "startRetreat", label: "Retrait au départ", unit: "mm" }, { key: "endRetreat", label: "Retrait à la fin", unit: "mm" }],
  "repartition-vitrages": [{ key: "total", label: "Longueur totale", unit: "mm" }, { key: "paneCount", label: "Nombre de vitrages", step: "1" }, { key: "mullionWidth", label: "Largeur des montants intermédiaires", unit: "mm" }, { key: "clearance", label: "Jeu par côté du vitrage", unit: "mm" }, { key: "startFrame", label: "Montant de départ", unit: "mm" }, { key: "endFrame", label: "Montant de fin", unit: "mm" }],
  "poids-vitrage": [{ key: "width", label: "Largeur", unit: "mm" }, { key: "height", label: "Hauteur", unit: "mm" }, { key: "thickness1", label: "Épaisseur verre 1", unit: "mm" }, { key: "thickness2", label: "Épaisseur verre 2 (optionnelle)", unit: "mm" }, { key: "thickness3", label: "Épaisseur verre 3 (optionnelle)", unit: "mm" }],
  "calcul-plaques": [{ key: "area", label: "Surface à couvrir", unit: "m²", step: "0.01" }, { key: "panelWidth", label: "Largeur d’une plaque", unit: "m", step: "0.01" }, { key: "panelHeight", label: "Hauteur d’une plaque", unit: "m", step: "0.01" }, { key: "waste", label: "Marge / chute", unit: "%", step: "0.1" }],
  "quantite-peinture": [{ key: "grossArea", label: "Surface brute", unit: "m²", step: "0.01" }, { key: "openingsArea", label: "Portes, fenêtres et ouvertures", unit: "m²", step: "0.01" }, { key: "yield", label: "Rendement", unit: "m²/L", step: "0.1" }, { key: "coats", label: "Nombre de couches", step: "1" }, { key: "margin", label: "Marge", unit: "%", step: "0.1" }, { key: "potSize", label: "Taille d’un pot (optionnelle)", unit: "L", step: "0.1" }],
  isolation: [
    { key: "mode", label: "Mon besoin", inputType: "select", options: [{ value: "quantitative", label: "Calculer un nombre de panneaux" }, { value: "thermal", label: "Calculer la résistance thermique R" }] },
    { key: "area", label: "Surface à isoler", unit: "m²", step: "0.01", showWhen: { key: "mode", values: ["quantitative"] } }, { key: "panelWidth", label: "Largeur panneau / rouleau", unit: "m", step: "0.01", showWhen: { key: "mode", values: ["quantitative"] } }, { key: "panelHeight", label: "Hauteur panneau / rouleau", unit: "m", step: "0.01", showWhen: { key: "mode", values: ["quantitative"] } }, { key: "waste", label: "Marge", unit: "%", step: "0.1", showWhen: { key: "mode", values: ["quantitative"] } },
    { key: "thickness", label: "Épaisseur", unit: "mm", showWhen: { key: "mode", values: ["thermal"] } }, { key: "lambda", label: "Conductivité λ", unit: "W/(m·K)", step: "0.001", showWhen: { key: "mode", values: ["thermal"] } },
  ],
  fixations: [{ key: "total", label: "Longueur", unit: "mm" }, { key: "maxSpacing", label: "Entraxe maximum", unit: "mm" }, { key: "startRetreat", label: "Retrait départ", unit: "mm" }, { key: "endRetreat", label: "Retrait fin", unit: "mm" }, { key: "includeStart", label: "Fixation au départ", inputType: "select", options: [{ value: "yes", label: "Oui" }, { value: "no", label: "Non" }] }, { key: "includeEnd", label: "Fixation à la fin", inputType: "select", options: [{ value: "yes", label: "Oui" }, { value: "no", label: "Non" }] }],
  arche: [{ key: "width", label: "Largeur de l’ouverture", unit: "mm" }, { key: "rise", label: "Hauteur de l’arrondi", unit: "mm", hint: "Du départ de l’arc jusqu’au sommet" }],
};

export const toolDefaults: Partial<Record<ToolId, Record<string, string>>> = {
  "diagonale-rectangle": { length: "4000", width: "3000" }, "angle-droit-345": { referenceA: "1500" }, pythagore: { a: "3000", b: "4000" },
  pente: { mode: "percent-from-run", run: "4000", percent: "2", rise: "80", degrees: "1.15" }, "surface-rectangle": { length: "4.8", width: "2.5" },
  cercle: { diameter: "1600" }, "arc-corde-fleche": { chord: "1600", rise: "400" },
  repartition: { mode: "known-width", total: "8430", count: "7", elementWidth: "1000", separatorWidth: "0", startGap: "0", endGap: "0" },
  entraxes: { total: "4270", maxSpacing: "600", startRetreat: "0", endRetreat: "0" },
  "repartition-vitrages": { total: "8430", paneCount: "7", mullionWidth: "50", clearance: "5", startFrame: "50", endFrame: "50" },
  "poids-vitrage": { width: "1000", height: "2000", thickness1: "10", thickness2: "0", thickness3: "0" },
  "calcul-plaques": { area: "52", panelWidth: "1.2", panelHeight: "2.5", waste: "10" },
  "quantite-peinture": { grossArea: "80", openingsArea: "8", yield: "10", coats: "2", margin: "10", potSize: "10" },
  isolation: { mode: "thermal", area: "50", panelWidth: "0.6", panelHeight: "1.2", waste: "10", thickness: "140", lambda: "0.032" },
  fixations: { total: "4270", maxSpacing: "600", startRetreat: "0", endRetreat: "0", includeStart: "yes", includeEnd: "yes" },
  arche: { width: "1600", rise: "800" },
};

function n(values: Record<string, string>, key: string) {
  const value = Number(values[key].replace(",", "."));
  if (!Number.isFinite(value)) throw new CalculationError("Renseignez toutes les mesures demandées.");
  return value;
}

function output(results: ResultLine[], note: string, steps: string[], controls: string[] = [], warnings: string[] = []): ToolExecution {
  return { results, note, instructions: { steps, controls, warnings } };
}

export function executeTool(id: ToolId, values: Record<string, string>): ToolExecution {
  if (id === "diagonale-rectangle") {
    const diagonal = rectangleDiagonal(n(values, "length"), n(values, "width"));
    return output([{ label: "Diagonale", value: `${roundForDisplay(diagonal)} mm`, primary: true }, { label: "Soit", value: `${roundForDisplay(diagonal / 1000, 3)} m` }], "Mesurez cette cote entre deux angles opposés. Pour contrôler l’équerrage, les deux diagonales doivent être identiques.", ["Repérez les quatre angles du rectangle.", `Mesurez une première diagonale : la cible est ${roundForDisplay(diagonal)} mm.`, "Mesurez la diagonale opposée.", "Ajustez l’ouvrage jusqu’à obtenir la même mesure des deux côtés."], ["Les deux diagonales doivent être identiques."]);
  }
  if (id === "angle-droit-345") {
    const result = rightAngle345(n(values, "referenceA"));
    return output([{ label: "Premier côté A", value: `${roundForDisplay(result.a)} mm` }, { label: "Second côté B", value: `${roundForDisplay(result.b)} mm` }, { label: "Diagonale C", value: `${roundForDisplay(result.c)} mm`, primary: true }], "Les trois longueurs respectent exactement le ratio 3:4:5.", ["Faites un repère au sommet de l’angle.", `Mesurez ${roundForDisplay(result.a)} mm sur le premier axe.`, `Mesurez ${roundForDisplay(result.b)} mm sur le second axe.`, `Ajustez jusqu’à obtenir ${roundForDisplay(result.c)} mm entre les deux repères.`, "L’angle est alors à 90° dans la précision de votre mesure."], ["Contrôlez la diagonale sans arrondir les mesures intermédiaires."]);
  }
  if (id === "pythagore") {
    const result = rightTriangle({ a: n(values, "a"), b: n(values, "b") });
    return output([{ label: "Hypoténuse C", value: `${roundForDisplay(result.c!)} mm`, primary: true }, { label: "Angle entre A et C", value: `${roundForDisplay(Math.atan(result.b! / result.a!) * 180 / Math.PI, 2)}°` }], "Le résultat est calculé avec la précision complète de √(A² + B²).", ["Tracez le côté A depuis votre point de départ.", "Tracez approximativement le côté B.", `Contrôlez la distance entre les deux extrémités : ${roundForDisplay(result.c!)} mm.`, "Ajustez jusqu’à obtenir cette diagonale."], ["Contrôlez A, B et C avant fixation."]);
  }
  if (id === "pente") {
    const mode = values.mode;
    const result = mode === "percent-from-rise" ? solveSlope({ mode, run: n(values, "run"), rise: n(values, "rise") })
      : mode === "run-from-rise" ? solveSlope({ mode, rise: n(values, "rise"), percent: n(values, "percent") })
      : mode === "degrees-from-run" ? solveSlope({ mode, run: n(values, "run"), degrees: n(values, "degrees") })
      : solveSlope({ mode: "percent-from-run", run: n(values, "run"), percent: n(values, "percent") });
    return output([{ label: "Dénivelé", value: `${roundForDisplay(result.rise)} mm`, primary: true }, { label: "Pente", value: `${roundForDisplay(result.percent, 2)} %` }, { label: "Angle", value: `${roundForDisplay(result.degrees, 2)}°` }, { label: "Longueur horizontale", value: `${roundForDisplay(result.run)} mm` }, { label: "Longueur sur pente", value: `${roundForDisplay(result.slopeLength)} mm` }], "La longueur horizontale et la longueur réellement inclinée sont calculées séparément.", ["Repérez le point haut de l’ouvrage.", `Reportez un dénivelé de ${roundForDisplay(result.rise)} mm sur ${roundForDisplay(result.run)} mm horizontaux.`, "Reliez les deux repères au cordeau ou au laser.", "Contrôlez le sens et la pente avant la pose définitive."], ["Ne confondez pas longueur horizontale et longueur sur pente."]);
  }
  if (id === "surface-rectangle") {
    const area = rectangleArea(n(values, "length"), n(values, "width"));
    return output([{ label: "Surface", value: `${roundForDisplay(area, 2)} m²`, primary: true }, { label: "Avec 10 % de marge", value: `${roundForDisplay(area * 1.1, 2)} m²` }], "La marge est informative. Adaptez-la au matériau, au calepinage et aux chutes réelles.", ["Mesurez la longueur nette.", "Mesurez la largeur ou la hauteur nette.", "Déduisez séparément les ouvertures si nécessaire.", `Retenez ${roundForDisplay(area, 2)} m² avant marge.`]);
  }
  if (id === "cercle") {
    const result = circle({ diameter: n(values, "diameter") });
    return output([{ label: "Rayon", value: `${roundForDisplay(result.radius)} mm`, primary: true }, { label: "Circonférence", value: `${roundForDisplay(result.circumference)} mm` }, { label: "Aire", value: `${roundForDisplay(result.area / 1_000_000, 3)} m²` }], "La circonférence est la longueur développée du pourtour du cercle.", ["Tracez deux axes perpendiculaires.", "Leur intersection donne le centre O.", `Réglez le compas ou la ficelle à ${roundForDisplay(result.radius)} mm.`, "Piquez en O et tracez le cercle sans modifier le réglage."], ["Contrôlez le rayon dans plusieurs directions."]);
  }
  if (id === "arc-corde-fleche") {
    const result = arcFromChordRise(n(values, "chord"), n(values, "rise"));
    return output([{ label: "Rayon", value: `${roundForDisplay(result.radius)} mm`, primary: true }, { label: "Centre depuis la corde", value: `${roundForDisplay(result.centreBelowSpring)} mm` }, { label: "Angle au centre", value: `${roundForDisplay(result.angleDegrees, 2)}°` }, { label: "Longueur d’arc", value: `${roundForDisplay(result.arcLength)} mm` }], "Le rayon est calculé depuis la corde et la flèche avec la précision interne complète.", ["Tracez la corde entre les deux extrémités de l’arc.", "Marquez le milieu exact de la corde.", `Placez le centre O à ${roundForDisplay(Math.abs(result.centreBelowSpring))} mm de la corde sur l’axe médian.`, `Réglez votre compas ou ficelle à ${roundForDisplay(result.radius)} mm.`, "Tracez l’arc entre les deux extrémités."], ["Vérifiez que l’arc passe par les deux extrémités de la corde."]);
  }
  if (id === "repartition") {
    const result = distributeAdvanced({ total: n(values, "total"), count: n(values, "count"), elementWidth: values.mode === "solve-width" ? undefined : n(values, "elementWidth"), separatorWidth: n(values, "separatorWidth"), startGap: n(values, "startGap"), endGap: n(values, "endGap") });
    return output([{ label: "Largeur d’un élément", value: `${roundForDisplay(result.elementWidth, 2)} mm`, primary: values.mode === "solve-width" }, { label: "Espace / séparateur réel", value: `${roundForDisplay(result.gap, 2)} mm`, primary: values.mode !== "solve-width" }, { label: "Pas de répétition", value: `${roundForDisplay(result.pitch, 2)} mm` }, { label: "Total de contrôle", value: `${roundForDisplay(result.controlTotal, 2)} mm` }, { label: "Départs", value: result.positions.map((position) => roundForDisplay(position, 1)).join(" · ") + " mm" }], "Les positions sont mesurées depuis le bord de référence jusqu’au début de chaque élément.", ["Choisissez le bord gauche comme origine.", `Tracez chaque départ selon les positions calculées.`, `Conservez ${roundForDisplay(result.gap, 2)} mm entre deux éléments.`, "Contrôlez le total avant fixation."], ["Le total de contrôle doit correspondre à la longueur disponible."]);
  }
  if (id === "entraxes" || id === "fixations") {
    const result = distributeByMaximumSpacing({ total: n(values, "total"), maxSpacing: n(values, "maxSpacing"), startRetreat: n(values, "startRetreat"), endRetreat: n(values, "endRetreat"), includeStart: id === "fixations" ? values.includeStart === "yes" : true, includeEnd: id === "fixations" ? values.includeEnd === "yes" : true });
    return output([{ label: id === "fixations" ? "Nombre de fixations" : "Nombre d’éléments", value: `${result.elementCount}`, primary: true }, { label: "Nombre d’intervalles", value: `${result.intervals}` }, { label: "Entraxe réel", value: `${roundForDisplay(result.actualSpacing, 2)} mm` }, { label: "Positions", value: result.positions.map((position) => roundForDisplay(position, 1)).join(" · ") + " mm" }], `L’entraxe réel de ${roundForDisplay(result.actualSpacing, 2)} mm ne dépasse pas le maximum demandé.`, ["Prenez l’origine au début de la longueur.", `Reportez les positions calculées avec un entraxe de ${roundForDisplay(result.actualSpacing, 2)} mm.`, "Contrôlez la dernière position avant fixation."], ["L’entraxe réel doit rester inférieur ou égal au maximum."]);
  }
  if (id === "repartition-vitrages") {
    const result = distributeGlazing({ total: n(values, "total"), paneCount: n(values, "paneCount"), mullionWidth: n(values, "mullionWidth"), clearancePerSide: n(values, "clearance"), startFrame: n(values, "startFrame"), endFrame: n(values, "endFrame") });
    return output([{ label: "Largeur théorique d’un vitrage", value: `${roundForDisplay(result.paneWidth, 2)} mm`, primary: true }, { label: "Module avec jeux", value: `${roundForDisplay(result.moduleWidth, 2)} mm` }, { label: "Total montants", value: `${roundForDisplay(result.mullionTotal)} mm` }, { label: "Total jeux", value: `${roundForDisplay(result.clearanceTotal)} mm` }, { label: "Total de contrôle", value: `${roundForDisplay(result.controlTotal, 2)} mm` }, { label: "Départs vitrages", value: result.positions.map((position) => roundForDisplay(position, 1)).join(" · ") + " mm" }], "Largeur théorique avant validation par le fournisseur et prise en compte des tolérances du système.", ["Repérez le montant de départ.", `Conservez ${roundForDisplay(n(values, "clearance"))} mm de jeu de chaque côté des vitrages.`, "Reportez les départs calculés depuis l’origine.", "Contrôlez la somme de tous les composants."], ["Le total de contrôle doit être identique à la longueur totale."]);
  }
  if (id === "poids-vitrage") {
    const result = estimateGlassWeight({ widthMm: n(values, "width"), heightMm: n(values, "height"), thicknessesMm: [n(values, "thickness1"), n(values, "thickness2"), n(values, "thickness3")] });
    return output([{ label: "Poids théorique estimé", value: `${roundForDisplay(result.estimatedWeight, 1)} kg`, primary: true }, { label: "Surface", value: `${roundForDisplay(result.area, 3)} m²` }, { label: "Épaisseur de verre cumulée", value: `${roundForDisplay(result.totalThickness)} mm` }, { label: "Masse surfacique", value: `${roundForDisplay(result.massPerSquareMetre, 1)} kg/m²` }], "Estimation basée sur 2,5 kg/m² par millimètre de verre. Ce résultat n’est pas un poids certifié.", [], [], ["Saisissez chaque épaisseur réelle de verre sans inventer la composition d’un vitrage isolant ou feuilleté."]);
  }
  if (id === "calcul-plaques") {
    const result = estimatePanels({ area: n(values, "area"), panelWidth: n(values, "panelWidth"), panelHeight: n(values, "panelHeight"), wastePercent: n(values, "waste") });
    return output([{ label: "Nombre entier minimum", value: `${result.minimumCount} plaques`, primary: true }, { label: "Surface d’une plaque", value: `${roundForDisplay(result.panelArea, 3)} m²` }, { label: "Besoin théorique", value: `${roundForDisplay(result.theoreticalCount, 2)} plaques` }, { label: "Surface avec marge", value: `${roundForDisplay(result.areaWithWaste, 2)} m²` }], "Estimation quantitative par surface. Le placement réel des plaques et le calepinage ne sont pas calculés.", [], [], ["Adaptez la marge aux découpes, ouvertures et contraintes de pose."]);
  }
  if (id === "quantite-peinture") {
    const result = estimatePaint({ grossArea: n(values, "grossArea"), openingsArea: n(values, "openingsArea"), yieldPerLitre: n(values, "yield"), coats: n(values, "coats"), marginPercent: n(values, "margin") });
    const potSize = n(values, "potSize");
    return output([{ label: "Peinture nécessaire", value: `${roundForDisplay(result.litres, 2)} L`, primary: true }, { label: "Surface nette", value: `${roundForDisplay(result.netArea, 2)} m²` }, { label: "Surface cumulée avec couches", value: `${roundForDisplay(result.cumulativeArea, 2)} m²` }, ...(potSize > 0 ? [{ label: `Pots de ${roundForDisplay(potSize)} L`, value: `${Math.ceil(result.litres / potSize)} pots` }] : [])], "Le rendement doit provenir de la fiche technique de la peinture utilisée.", [], [], ["Le support, la teinte et le mode d’application peuvent modifier la consommation réelle."]);
  }
  if (id === "isolation") {
    if (values.mode === "quantitative") {
      const result = estimatePanels({ area: n(values, "area"), panelWidth: n(values, "panelWidth"), panelHeight: n(values, "panelHeight"), wastePercent: n(values, "waste") });
      return output([{ label: "Nombre entier minimum", value: `${result.minimumCount}`, primary: true }, { label: "Surface d’un panneau / rouleau", value: `${roundForDisplay(result.panelArea, 3)} m²` }, { label: "Surface avec marge", value: `${roundForDisplay(result.areaWithWaste, 2)} m²` }], "Estimation quantitative sans calepinage réel.", [], [], ["Vérifiez le conditionnement et les dimensions du produit choisi."]);
    }
    const result = insulationResistance(n(values, "thickness"), n(values, "lambda"));
    return output([{ label: "Résistance thermique R", value: `${roundForDisplay(result.resistance, 3)} m²·K/W`, primary: true }, { label: "Épaisseur convertie", value: `${roundForDisplay(result.thicknessMetres, 3)} m` }, { label: "Lambda saisi", value: `${values.lambda} W/(m·K)` }], "Calcul physique R = e / λ. Il ne constitue ni un diagnostic ni un conseil réglementaire.", [], [], ["Utilisez la valeur lambda certifiée du matériau dans les conditions prévues."]);
  }
  const result = segmentalArch(n(values, "width"), n(values, "rise"));
  return output([{ label: "Rayon de traçage", value: `${roundForDisplay(result.radius)} mm`, primary: true }, { label: "Centre sous le départ", value: `${roundForDisplay(result.centreBelowSpring)} mm` }, { label: "Longueur de l’arc", value: `${roundForDisplay(result.arcLength)} mm` }, { label: "Angle de l’arc", value: `${roundForDisplay(result.angleDegrees, 2)}°` }], "Géométrie d’un arc de cercle segmentaire. Le centre se place sur l’axe vertical de l’ouverture.", ["Tracez la ligne horizontale de départ de l’arrondi.", "Marquez son milieu et tracez l’axe vertical.", `Depuis la ligne de départ, descendez de ${roundForDisplay(result.centreBelowSpring)} mm sur l’axe pour placer O.`, `Réglez la ficelle ou le compas à ${roundForDisplay(result.radius)} mm.`, "Depuis O, tracez l’arc entre les deux points de départ."], ["L’arc doit rejoindre les deux départs à la même hauteur."]);
}
