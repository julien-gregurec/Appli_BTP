export type SuggestionOcr = {
  valeurs: Record<string, string | number | null>;
  confiances: Record<string, number>;
  incoherences: string[];
  provider: string;
};

export interface ExpenseOcrProvider {
  readonly disponible: boolean;
  analyser(data: Uint8Array, mime: string): Promise<SuggestionOcr>;
}

class OcrNonConfigure implements ExpenseOcrProvider {
  readonly disponible = false;
  async analyser(): Promise<SuggestionOcr> {
    throw new Error("Aucun prestataire OCR réel n’est configuré");
  }
}

export function expenseOcrProvider(): ExpenseOcrProvider {
  return new OcrNonConfigure();
}
