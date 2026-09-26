/* Types du generateur d'icones PWA (JS pur cote build). */
export declare const AMBER: number[];
export declare const NAVY: number[];
export declare const CREAM: number[];
export declare const E_POLYGON: number[][];
export declare const SVG_SIGNATURES: string[];
export declare const ICONS: { file: string; size: number; scale: number }[];
export declare function distanceToSegment(x: number, y: number, segment: number[][]): number;
export declare function blend(base: number[], color: number[], alpha: number): number[];
export declare function rasterize(size: number, scale: number, samples?: number): Buffer;
export declare function encodePng(pixels: Buffer, width: number, height?: number): Buffer;
