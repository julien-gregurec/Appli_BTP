/** Explicit local CPU benchmark, not part of routine Vitest. No database or network. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { analyzeLocalFile } from "../src/analysis-provider.ts";
import { command, renderMetrics, type Runtime } from "../src/render.ts";
const require = createRequire(import.meta.url),
  python = process.env.STUDIO_ANALYSIS_PYTHON;
if (!python) throw Error("STUDIO_ANALYSIS_PYTHON required");
const output = process.argv[2];
if (!output) throw Error("Local output directory required");
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), "studio-analysis-benchmark-"));
const runtime: Runtime = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
  signal: AbortSignal.timeout(20 * 60000),
  progress: async () => {},
};
const metrics = [];
try {
  await command(
    python,
    [resolve("analysis/fixtures.py"), directory],
    runtime.signal,
  );
  for (const count of [100, 500]) {
    const start = performance.now(),
      cpu = process.cpuUsage();
    let peakNode = process.memoryUsage().rss;
    renderMetrics.peakChildRssBytes = 0;
    const rows = [];
    const scratch = join(directory, "scratch");
    await mkdir(scratch, { recursive: true });
    for (let i = 0; i < count; i++) {
      const path = join(directory, `media-${String(i).padStart(3, "0")}.jpg`);
      const r = await analyzeLocalFile(path, false, scratch, runtime, python);
      rows.push({ sha256: r.result.sha256, score: r.result.quality_score });
      peakNode = Math.max(peakNode, process.memoryUsage().rss);
      if ((i + 1) % 100 === 0)
        console.log(JSON.stringify({ count, analyzed: i + 1 }));
    }
    const elapsed = performance.now() - start,
      used = process.cpuUsage(cpu);
    metrics.push({
      count,
      elapsed_ms: elapsed,
      mean_ms: elapsed / count,
      node_peak_rss: peakNode,
      child_peak_rss: renderMetrics.peakChildRssBytes,
      node_cpu_ms: (used.user + used.system) / 1000,
      unique_hashes: new Set(rows.map((r) => r.sha256)).size,
    });
    await writeFile(
      join(output, `results-${count}.json`),
      JSON.stringify(rows),
    );
  }
  await writeFile(
    join(output, "metrics.json"),
    JSON.stringify(metrics, null, 2),
  );
  console.log(JSON.stringify(metrics));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  throw e;
} finally {
  await rm(directory, { recursive: true, force: true });
}
