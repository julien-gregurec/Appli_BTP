import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "out/**",
    "build/**",
    "output/**",
    "playwright-report/**",
    "test-results/**",
    // Application autonome : vérifiée par son propre lint via le script racine.
    "apps/tools/**",
    // Archive documentaire non exécutable et explicitement non reproductible.
    "docs/archive/naming-studio-recovery/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
