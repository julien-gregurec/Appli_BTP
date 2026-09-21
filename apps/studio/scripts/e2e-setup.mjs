import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync(process.execPath, ["scripts/runtime-check.mjs", "web"], {
    stdio: "inherit",
    timeout: 140000,
  });
}
