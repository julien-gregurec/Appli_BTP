export function levenshtein(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[left.length][right.length];
}

export function isTooClose(value: string, blocked: string[]): boolean {
  return blocked.some((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized) return false;
    if (value.toLowerCase().includes(normalized) || normalized.includes(value.toLowerCase())) {
      return true;
    }
    const distance = levenshtein(value, normalized);
    return distance <= (Math.min(value.length, normalized.length) <= 5 ? 1 : 2);
  });
}
