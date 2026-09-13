import { openSync, type Font } from "fontkit";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  safeAreas,
  type TextOverlay,
  type TimelinePresentation,
} from "../../../packages/studio-domain/src/presentation.ts";
import type { AspectRatio } from "../../../packages/studio-domain/src/projects.ts";
const cache = new Map<string, Font>();
export function fontFile(family: "sans" | "serif", weight: 400 | 700) {
  return fileURLToPath(
    new URL(
      `../fonts/Noto${family === "sans" ? "Sans" : "Serif"}-${weight === 700 ? "Bold" : "Regular"}.ttf`,
      import.meta.url,
    ),
  );
}
function font(path: string): Font {
  let f = cache.get(path);
  if (!f) {
    const loaded = openSync(path);
    if (!("layout" in loaded)) throw new Error("FONT_INVALID");
    f = loaded;
    cache.set(path, f);
  }
  return f;
}
export function layoutText(
  o: TextOverlay,
  p: TimelinePresentation,
  ratio: AspectRatio,
  width: number,
  height: number,
) {
  const style = p.typography[o.font_role],
    path = fontFile(style.family, o.weight),
    f = font(path),
    safe = safeAreas[ratio];
  const padding = Math.ceil(Math.min(width, height) * 0.02),
    x = Math.ceil(width * safe.x) + padding,
    maxWidth = Math.floor(width * (1 - 2 * safe.x)) - 2 * padding;
  const top = Math.ceil(height * safe.top),
    bottom = Math.floor(height * (1 - safe.bottom)),
    zoneHeight = Math.floor((bottom - top) / 3) - 2 * padding;
  const measure = (s: string, size: number) =>
    (f.layout(s).positions.reduce((n, p) => n + p.xAdvance, 0) / f.unitsPerEm) *
    size;
  const requested = Math.round(
      Math.min(width, height) * p.typography[o.size_role].size,
    ),
    minimum = Math.ceil(requested * 0.7);
  const wrap = (text: string, size: number) => {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
        if (measure(line ? `${line} ${word}` : word, size) <= maxWidth) {
          line = line ? `${line} ${word}` : word;
          continue;
        }
        if (line) {
          lines.push(line);
          line = "";
        }
        for (const char of word) {
          if (line && measure(line + char, size) > maxWidth) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  };
  let size = requested,
    lines = wrap(o.text, size);
  while (
    size > minimum &&
    (lines.length > o.max_lines || lines.length * size * 1.5 > zoneHeight)
  ) {
    size--;
    lines = wrap(o.text, size);
  }
  const maxLines = Math.max(
    1,
    Math.min(o.max_lines, Math.floor(zoneHeight / (size * 1.5))),
  );
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines.at(-1)!;
    while (last && measure(last + "…", size) > maxWidth)
      last = Array.from(last).slice(0, -1).join("");
    lines[lines.length - 1] = last + "…";
  }
  const lineHeight = Math.ceil(size * 1.5),
    textHeight = lines.length * lineHeight,
    y =
      o.position === "top"
        ? top + padding
        : o.position === "bottom"
          ? bottom - padding - textHeight
          : Math.round((top + bottom - textHeight) / 2);
  return {
    font: path,
    size,
    lineHeight,
    x,
    y,
    maxWidth,
    textHeight,
    padding,
    lines: lines.map((text) => ({
      text,
      width: Math.ceil(measure(text, size)),
    })),
    hasMissingGlyphs: Array.from(o.text).some(
      (c) => !/[\s]/u.test(c) && !f.hasGlyphForCodePoint(c.codePointAt(0)!),
    ),
  };
}
/** User content is only read from private UTF-8 text files, never interpolated in expressions. */
export async function textFilters(
  overlays: TextOverlay[],
  p: TimelinePresentation,
  ratio: AspectRatio,
  width: number,
  height: number,
  dir: string,
  prefix: string,
) {
  const filters: string[] = [],
    quote = (s: string) =>
      s
        .replaceAll("\\", "\\\\")
        .replaceAll(":", "\\:")
        .replaceAll("'", "'\\''");
  for (const [i, o] of overlays.entries()) {
    const box = layoutText(o, p, ratio, width, height);
    if (box.hasMissingGlyphs) throw new Error("FONT_GLYPH_MISSING");
    const start = o.start_ms / 1000,
      end = o.end_ms / 1000,
      enable = `gte(t,${start})*lt(t,${end})`;
    if (o.background === "dark")
      filters.push(
        `drawbox=x=${box.x - box.padding}:y=${box.y - box.padding}:w=${box.maxWidth + 2 * box.padding}:h=${box.textHeight + 2 * box.padding}:color=black@0.55:t=fill:enable='${enable}'`,
      );
    for (const [j, line] of box.lines.entries()) {
      const file = join(dir, `${prefix}-${i}-${j}.txt`);
      await writeFile(file, line.text, "utf8");
      const x =
          box.x +
          (o.alignment === "center"
            ? Math.floor((box.maxWidth - line.width) / 2)
            : o.alignment === "right"
              ? box.maxWidth - line.width
              : 0),
        alpha =
          o.animation === "fade"
            ? `min(1,max(0,(t-${start})/0.2))*min(1,max(0,(${end}-t)/0.2))`
            : "1";
      filters.push(
        `drawtext=fontfile='${quote(box.font)}':textfile='${quote(file)}':expansion=none:fontsize=${box.size}:fontcolor=${o.color}:x=${x}:y=${box.y + j * box.lineHeight}:fix_bounds=1:alpha='${alpha}':enable='${enable}'`,
      );
    }
  }
  return filters;
}
