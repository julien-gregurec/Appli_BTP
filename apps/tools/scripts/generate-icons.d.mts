/* Types du generateur d'icones PWA (JS pur cote build). */
export declare const AMBER: number[];
export declare const E_POLYGON: number[][];
export declare const SVG_SIGNATURES: string[];
export declare const ICONS: { file: string; size: number; scale: number }[];
export declare function rasterize(size: number, scale: number, samples?: number): Buffer;
export declare function encodePng(pixels: Buffer, size: number): Buffer;
