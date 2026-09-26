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
    "apps/studio/**",
    // Archive documentaire non exécutable et explicitement non reproductible.
    "docs/archive/naming-studio-recovery/**",
    // Sonde de qualification PE-06 : réplique volontairement verbatim la logique
    // de détection de tracé de src/components/SignatureEmploye.tsx pour pouvoir
    // la rejouer hors Next (cf. scripts/qualification/README_PE06.md). La
    // renommer pour satisfaire react-hooks/immutability lui ferait perdre la
    // propriété qui fait sa valeur de preuve : être le même code.
    "scripts/qualification/pe06_signature_canvas_probe.jsx",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
