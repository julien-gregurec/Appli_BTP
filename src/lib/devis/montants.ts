/**
 * Montants exacts des documents commerciaux — module PUR.
 *
 * La base fait foi : `recalc_totaux_devis` (20260710000005_devis.sql) et `recalc_totaux_facture`
 * (20260710000006_factures.sql) calculent en `numeric` PostgreSQL, sans jamais arrondir une ligne,
 * puis arrondissent les seuls totaux avec `round(x, 2)` — arrondi « au plus proche, moitié
 * s'éloignant de zéro ». Un aperçu calculé en nombres flottants JavaScript s'en écarte : 2,675
 * vaut 2,67499999… en double et s'arrondit à 2,67 là où PostgreSQL écrit 2,68.
 *
 * Ce module reproduit donc l'arithmétique décimale EXACTE, sur des entiers `bigint` mis à
 * l'échelle. Toutes les divisions du calcul des totaux sont des divisions par 100 : elles tombent
 * juste en décimal, il n'y a jamais de précision à choisir.
 *
 * Ce que l'aperçu affiche doit être, au centime près, ce que la base enregistrera. C'est la
 * condition pour que « l'aperçu est le document » soit vrai.
 *
 * Note : la cible TypeScript du dépôt est antérieure à ES2020, qui interdit les littéraux
 * `10n`. Les constantes passent donc par `BigInt(…)`, et les puissances de 10 par une table.
 */

/** Nombre décimal exact : `n × 10^-e`. */
export type Decimal = { readonly n: bigint; readonly e: number };

const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);

const ZERO: Decimal = { n: B0, e: 0 };

const PUISSANCES_10: bigint[] = [B1];
function puissance10(e: number): bigint {
  while (PUISSANCES_10.length <= e) PUISSANCES_10.push(PUISSANCES_10[PUISSANCES_10.length - 1] * B10);
  return PUISSANCES_10[e];
}

const abs = (x: bigint): bigint => (x < B0 ? -x : x);

const MOTIF_DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

/**
 * Convertit une valeur en décimal exact.
 *
 * Un `number` passe par sa représentation la plus courte (`String(0.1)` = « 0.1 ») : c'est
 * exactement le texte que PostgREST a produit à partir du `numeric` stocké.
 */
export function dec(valeur: number | string | bigint | Decimal): Decimal {
  if (typeof valeur === "object") return valeur;
  if (typeof valeur === "bigint") return { n: valeur, e: 0 };
  if (typeof valeur === "number" && !Number.isFinite(valeur)) {
    throw new RangeError(`Montant non fini : ${valeur}`);
  }
  const texte = String(valeur).trim();
  const m = MOTIF_DECIMAL.exec(texte);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new RangeError(`Montant illisible : « ${texte} »`);
  const [, signe, entier, fraction = "", exposant = "0"] = m;
  let n = BigInt(`${entier || "0"}${fraction}`);
  let e = fraction.length - Number(exposant);
  if (e < 0) {
    n *= puissance10(-e);
    e = 0;
  }
  return reduire({ n: signe === "-" ? -n : n, e });
}

/** Retire les zéros de fin : deux décimaux égaux ont alors la même forme. */
function reduire(d: Decimal): Decimal {
  let { n, e } = d;
  if (n === B0) return ZERO;
  while (e > 0 && n % B10 === B0) {
    n /= B10;
    e -= 1;
  }
  return { n, e };
}

function aligner(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const e = Math.max(a.e, b.e);
  return [a.n * puissance10(e - a.e), b.n * puissance10(e - b.e), e];
}

export function add(a: Decimal, b: Decimal): Decimal {
  const [x, y, e] = aligner(a, b);
  return reduire({ n: x + y, e });
}

export function sub(a: Decimal, b: Decimal): Decimal {
  const [x, y, e] = aligner(a, b);
  return reduire({ n: x - y, e });
}

export function mul(a: Decimal, b: Decimal): Decimal {
  return reduire({ n: a.n * b.n, e: a.e + b.e });
}

/** Division par 100 — la seule division du calcul des totaux, exacte en décimal. */
export function pourcent(a: Decimal): Decimal {
  return reduire({ n: a.n, e: a.e + 2 });
}

export function somme(valeurs: readonly Decimal[]): Decimal {
  return valeurs.reduce(add, ZERO);
}

export function cmp(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = aligner(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const estNul = (a: Decimal): boolean => a.n === B0;
export const estNegatif = (a: Decimal): boolean => a.n < B0;

/**
 * Arrondi de PostgreSQL `round(numeric, echelle)` : au plus proche, la moitié s'éloignant de
 * zéro (2,675 → 2,68 ; −2,675 → −2,68).
 */
export function arrondir(a: Decimal, echelle = 2): Decimal {
  if (a.e <= echelle) return a;
  const facteur = puissance10(a.e - echelle);
  let q = a.n / facteur; // troncature vers zéro
  if (abs(a.n % facteur) * B2 >= facteur) q += a.n < B0 ? -B1 : B1;
  return reduire({ n: q, e: echelle });
}

/**
 * `a / b` arrondi à `echelle` décimales, moitié s'éloignant de zéro — calcul exact sur des
 * entiers, sans passer par un flottant. Sert aux taux (marge, marque) et aux répartitions.
 */
export function diviserArrondi(a: Decimal, b: Decimal, echelle = 2): Decimal {
  if (b.n === B0) throw new RangeError("Division par zéro.");
  const num = a.n * puissance10(b.e + echelle);
  const den = b.n * puissance10(a.e);
  const negatif = (num < B0) !== (den < B0);
  const absNum = abs(num);
  const absDen = abs(den);
  let q = absNum / absDen;
  if ((absNum % absDen) * B2 >= absDen) q += B1;
  return reduire({ n: negatif ? -q : q, e: echelle });
}

/** Plus petit multiple de `pas` supérieur ou égal à `a` (arrondi « au conditionnement »). */
export function multipleSuperieur(a: Decimal, pas: Decimal): Decimal {
  if (pas.n <= B0) throw new RangeError("Le pas d'arrondi doit être strictement positif.");
  const [x, p] = aligner(a, pas);
  let k = x / p;
  if (x % p !== B0 && x > B0) k += B1;
  return mul({ n: k, e: 0 }, pas);
}

/** Multiple de `pas` le plus proche de `a`, la moitié s'éloignant de zéro. */
export function multipleProche(a: Decimal, pas: Decimal): Decimal {
  if (pas.n <= B0) throw new RangeError("Le pas d'arrondi doit être strictement positif.");
  const [x, p] = aligner(a, pas);
  let k = x / p;
  if (abs(x % p) * B2 >= p) k += x < B0 ? -B1 : B1;
  return mul({ n: k, e: 0 }, pas);
}

export function versTexte(a: Decimal, echelle?: number): string {
  const d = echelle === undefined ? a : arrondir(a, echelle);
  const e = echelle === undefined ? d.e : Math.max(d.e, echelle);
  const n = d.n * puissance10(e - d.e);
  const negatif = n < B0;
  const chiffres = abs(n).toString().padStart(e + 1, "0");
  const entier = chiffres.slice(0, chiffres.length - e);
  const fraction = e > 0 ? `.${chiffres.slice(chiffres.length - e)}` : "";
  return `${negatif ? "-" : ""}${entier}${fraction}`;
}

export function versNombre(a: Decimal): number {
  return Number(versTexte(a));
}

// ── Lignes et totaux ─────────────────────────────────────────────────────────

export type LigneMontant = {
  quantite: number;
  prixUnitaireHt: number;
  /** Remise de ligne en pourcentage (colonne `remise_ligne`). */
  remiseLignePct: number;
  tauxTva: number;
};

/** HT exact d'une ligne, NON arrondi : `(quantite × prix) × (1 − remise / 100)`. */
export function montantLigneHtExact(l: LigneMontant): Decimal {
  const brut = mul(dec(l.quantite), dec(l.prixUnitaireHt));
  return sub(brut, pourcent(mul(brut, dec(l.remiseLignePct))));
}

/** HT d'une ligne tel qu'imprimé : arrondi au centime. */
export function montantLigneHt(l: LigneMontant): number {
  return versNombre(arrondir(montantLigneHtExact(l)));
}

export type VentilationTva = {
  tauxTva: number;
  baseHt: number;
  montantTva: number;
};

export type TotauxDocument = {
  /** Somme des lignes avant remise globale, arrondie. */
  sousTotalHt: number;
  /** Montant de la remise globale, tel que `sousTotalHt − remiseGlobaleHt = totalHt`. */
  remiseGlobaleHt: number;
  totalHt: number;
  totalTva: number;
  /** Arrondi de la somme NON arrondie HT + TVA — exactement ce que fait la base. */
  totalTtc: number;
  /** Par taux, les bases et les TVA somment exactement à `totalHt` et `totalTva`. */
  ventilation: VentilationTva[];
};

/**
 * Totaux d'un devis ou d'une facture, identiques à `recalc_totaux_devis` / `recalc_totaux_facture`.
 *
 * Particularité héritée de la base, reproduite et non corrigée ici : le TTC est l'arrondi de la
 * somme NON arrondie, pas la somme des deux arrondis. Il peut donc différer d'un centime de
 * `totalHt + totalTva` (cas rare, voir les tests). C'est la valeur stockée qui fait foi.
 */
export function totauxDocument(lignes: readonly LigneMontant[], remiseGlobalePct = 0): TotauxDocument {
  const facteur = sub(dec(1), pourcent(dec(remiseGlobalePct)));

  const parTaux = new Map<string, { taux: number; ht: Decimal }>();
  let ht = ZERO;
  let tva = ZERO;
  for (const l of lignes) {
    const ligneHt = montantLigneHtExact(l);
    ht = add(ht, ligneHt);
    tva = add(tva, pourcent(mul(ligneHt, dec(l.tauxTva))));
    const cle = versTexte(dec(l.tauxTva));
    const groupe = parTaux.get(cle) ?? { taux: l.tauxTva, ht: ZERO };
    groupe.ht = add(groupe.ht, ligneHt);
    parTaux.set(cle, groupe);
  }

  const htRemise = mul(ht, facteur);
  const tvaRemise = mul(tva, facteur);
  const totalHt = arrondir(htRemise);
  const totalTva = arrondir(tvaRemise);
  const sousTotal = arrondir(ht);

  const groupes = [...parTaux.values()].sort((a, b) => b.taux - a.taux);
  const bases = repartirArrondi(groupes.map((g) => mul(g.ht, facteur)), totalHt);
  const tvas = repartirArrondi(groupes.map((g) => pourcent(mul(mul(g.ht, facteur), dec(g.taux)))), totalTva);

  return {
    sousTotalHt: versNombre(sousTotal),
    remiseGlobaleHt: versNombre(sub(sousTotal, totalHt)),
    totalHt: versNombre(totalHt),
    totalTva: versNombre(totalTva),
    totalTtc: versNombre(arrondir(add(htRemise, tvaRemise))),
    ventilation: groupes.map((g, i) => ({
      tauxTva: g.taux,
      baseHt: versNombre(bases[i]),
      montantTva: versNombre(tvas[i]),
    })),
  };
}

/**
 * Arrondit chaque valeur au centime de sorte que leur somme soit EXACTEMENT `cible`
 * (méthode des plus forts restes).
 *
 * Arrondir chaque taux séparément ferait apparaître des ventilations qui ne retombent pas sur le
 * total imprimé — un écart d'un centime sur une facture est une question qu'on ne veut pas voir
 * posée par un client ou un contrôleur. À reste égal, l'ordre d'entrée départage.
 */
export function repartirArrondi(valeurs: readonly Decimal[], cible: Decimal): Decimal[] {
  const CENTIMES = 2;
  // Chaque valeur = plancher (en centimes, arrondi vers −∞) + reste / diviseur, reste ∈ [0, diviseur[.
  const parts = valeurs.map((v) => {
    if (v.e <= CENTIMES) return { plancher: v.n * puissance10(CENTIMES - v.e), reste: B0, diviseur: B1 };
    const diviseur = puissance10(v.e - CENTIMES);
    let plancher = v.n / diviseur;
    let reste = v.n % diviseur;
    if (reste < B0) {
      plancher -= B1;
      reste += diviseur;
    }
    return { plancher, reste, diviseur };
  });
  const c = arrondir(cible, CENTIMES);
  let ecart = c.n * puissance10(CENTIMES - c.e) - parts.reduce((s, p) => s + p.plancher, B0);

  // Plus fort reste d'abord — comparaison EXACTE des fractions par produit en croix.
  const ordre = parts
    .map((_, i) => i)
    .sort((i, j) => {
      const gauche = parts[j].reste * parts[i].diviseur;
      const droite = parts[i].reste * parts[j].diviseur;
      return gauche > droite ? 1 : gauche < droite ? -1 : i - j;
    });
  const resultat = parts.map((p) => p.plancher);
  for (let k = 0; ecart > B0 && ordre.length > 0; k += 1, ecart -= B1) {
    resultat[ordre[k % ordre.length]] += B1;
  }
  for (let k = 0; ecart < B0 && ordre.length > 0; k += 1, ecart += B1) {
    resultat[ordre[ordre.length - 1 - (k % ordre.length)]] -= B1;
  }
  return resultat.map((centimes) => reduire({ n: centimes, e: CENTIMES }));
}
