/**
 * Algèbre linéaire minimale utilisée par le redressement de perspective (§11) et les
 * ajustements de courbe (§22, §24, §25).
 *
 * Volontairement local et minuscule : aucune dépendance mathématique n'est ajoutée au bundle
 * pour huit inconnues.
 */

/**
 * Résout `matrix · x = rhs` par élimination de Gauss avec pivot partiel.
 * Lève si le système est singulier — jamais de solution approchée silencieuse.
 */
export function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] {
  const size = rhs.length;
  if (matrix.length !== size) throw new Error("Système linéaire mal dimensionné.");
  const augmented = matrix.map((row, index) => {
    if (row.length !== size) throw new Error("Système linéaire mal dimensionné.");
    return [...row, rhs[index]];
  });
  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
    }
    if (!Number.isFinite(augmented[pivotRow][column]) || Math.abs(augmented[pivotRow][column]) < 1e-12) {
      throw new Error("Système linéaire singulier : les points fournis sont dégénérés.");
    }
    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    const pivot = augmented[column][column];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column] / pivot;
      if (factor === 0) continue;
      for (let k = column; k <= size; k++) augmented[row][k] -= factor * augmented[column][k];
    }
  }
  return augmented.map((row, index) => row[size] / row[index]);
}

/** Valeurs et vecteurs propres d'une matrice symétrique 2×2 `[[a, b], [b, c]]`. */
export function symmetricEigen2x2(a: number, b: number, c: number): {
  values: [number, number];
  vectors: [{ x: number; y: number }, { x: number; y: number }];
} {
  const trace = a + c;
  const discriminant = Math.sqrt(Math.max(0, (a - c) * (a - c) + 4 * b * b));
  const first = (trace + discriminant) / 2;
  const second = (trace - discriminant) / 2;
  const vectorFor = (value: number) => {
    if (Math.abs(b) > 1e-12) {
      const length = Math.hypot(b, value - a);
      return { x: b / length, y: (value - a) / length };
    }
    return Math.abs(value - a) <= Math.abs(value - c) ? { x: 1, y: 0 } : { x: 0, y: 1 };
  };
  return { values: [first, second], vectors: [vectorFor(first), vectorFor(second)] };
}
