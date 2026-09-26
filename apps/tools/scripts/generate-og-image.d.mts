/* Types du generateur d'image Open Graph (JS pur cote build). */
export declare const OG: { file: string; width: number; height: number };
export declare const GLYPHS: Record<string, { width: number; strokes: number[][][] }>;
export declare const WORDS: { word: string; x: number; y: number; em: number; tracking: number; half: number; color: number[]; alpha: number }[];
export declare function wordWidth(word: string, tracking: number): number;
export declare function buildStrokeLayers(): { segment: number[][]; half: number; color: number[]; alpha: number; box: number[] }[];
export declare function rasterizeOgImage(samples?: number): Buffer;
