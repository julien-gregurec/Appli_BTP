/* Types du generateur build-time (JS pur cote build, `allowJs` etant desactive cote application). */
export interface PrecachePlan {
  offlineUrl: string;
  critical: string[];
  optional: string[];
}

export interface GeneratedServiceWorker extends PrecachePlan {
  version: string;
  code: string;
  assets: Map<string, string>;
  bytes: number;
}

export declare const FORBIDDEN_URL_PATTERNS: RegExp[];
export declare function collectBuildAssets(options?: { appDir?: string; mode?: "server" | "export" }): Map<string, string>;
export declare function referencedAssets(html: string): string[];
export declare function planPrecache(assets: Map<string, string>, options?: { readHtml?: (file: string) => string }): PrecachePlan;
export declare function computeVersion(assets: Map<string, string>, precachedUrls: string[], sourceText: string): string;
export declare function renderServiceWorker(sourceText: string, values: Record<string, unknown>): string;
export declare function generateServiceWorker(options?: { appDir?: string; mode?: "server" | "export" }): GeneratedServiceWorker;
