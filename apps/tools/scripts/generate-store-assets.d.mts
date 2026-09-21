/* Types du generateur des visuels de fiche Store (JS pur cote build). */
export declare const STORE_DIR: string;
export declare const PLAY_ICON: { file: string; size: number; scale: number };
export declare const FEATURE_GRAPHIC: { file: string; width: number; height: number };
export declare const WORDS: { word: string; x: number; y: number; em: number; tracking: number; half: number; color: number[]; alpha: number }[];
export declare function buildStrokeLayers(): { segment: number[][]; half: number; color: number[]; alpha: number; box: number[] }[];
export declare function rasterizeFeatureGraphic(samples?: number): Buffer;
