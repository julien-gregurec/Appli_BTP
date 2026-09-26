// Reuse the workspace TypeScript rules, without Next/React browser rules.
import typescript from "../../apps/studio/node_modules/eslint-config-next/dist/typescript.js";
export default [...typescript, { ignores: ["node_modules/**"] }];
