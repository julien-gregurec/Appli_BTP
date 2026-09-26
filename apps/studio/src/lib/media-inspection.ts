import sharp from "sharp";
export interface Inspection {
  width: number;
  height: number;
  orientation: "portrait" | "landscape" | "square";
  duration_ms?: number;
  codec?: string;
  source: "server-header";
  exif_orientation?: number;
  rotation_degrees?: number;
}
export type ReadRange = (start: number, end: number) => Promise<Buffer>;
function result(
  width: number,
  height: number,
  extra: Partial<Inspection> = {},
): Inspection {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 100_000_000
  )
    throw new Error("Dimensions refusées.");
  return {
    width,
    height,
    orientation:
      width === height ? "square" : width > height ? "landscape" : "portrait",
    source: "server-header",
    ...extra,
  };
}
// Bounded ISO BMFF parser: skip mdat, never download full video; cap all metadata.
function boxes(b: Buffer, start = 0, end = b.length) {
  const entries: { type: string; start: number; end: number }[] = [];
  for (let pos = start; pos + 8 <= end; ) {
    let size = b.readUInt32BE(pos),
      head = 8;
    if (size === 1) {
      if (pos + 16 > end) throw new Error("Conteneur tronqué.");
      size = Number(b.readBigUInt64BE(pos + 8));
      head = 16;
    }
    if (size === 0) size = end - pos;
    if (
      !Number.isSafeInteger(size) ||
      size < head ||
      pos + size > end ||
      entries.length > 10000
    )
      throw new Error("Conteneur invalide.");
    entries.push({
      type: b.toString("ascii", pos + 4, pos + 8),
      start: pos + head,
      end: pos + size,
    });
    pos += size;
  }
  return entries;
}
export async function inspectMedia(
  mime: string,
  size: number,
  read: ReadRange,
): Promise<Inspection> {
  const head = await read(0, Math.min(size - 1, 262143));
  const range: ReadRange = async (start, end) =>
    end < head.length ? head.subarray(start, end + 1) : read(start, end);
  if (mime.startsWith("image/")) {
    const ok =
      mime === "image/jpeg"
        ? head[0] === 255 && head[1] === 216 && head[2] === 255
        : mime === "image/png"
          ? head
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : head.toString("ascii", 0, 4) === "RIFF" &&
            head.toString("ascii", 8, 12) === "WEBP";
    if (!ok)
      throw new Error("Signature du fichier incompatible avec son type.");
    const tail = await range(Math.max(0, size - 12), size - 1);
    if (
      mime === "image/jpeg" &&
      !tail.subarray(-2).equals(Buffer.from([255, 217]))
    )
      throw new Error("JPEG tronqué.");
    if (mime === "image/png" && tail.toString("ascii", 4, 8) !== "IEND")
      throw new Error("PNG tronqué.");
    if (mime === "image/webp" && head.readUInt32LE(4) + 8 !== size)
      throw new Error("WEBP tronqué.");
    const m = await sharp(head, {
      limitInputPixels: 100_000_000,
      animated: false,
    }).metadata();
    if ((m.pages ?? 1) > 1)
      throw new Error("Images animées non prises en charge.");
    const swapped = [5, 6, 7, 8].includes(m.orientation ?? 1);
    return result(
      (swapped ? m.height : m.width) ?? 0,
      (swapped ? m.width : m.height) ?? 0,
      m.orientation ? { exif_orientation: m.orientation } : {},
    );
  }
  if (head.toString("ascii", 4, 8) !== "ftyp")
    throw new Error("Signature vidéo invalide.");
  const brand = head.toString("ascii", 8, 12);
  if (
    mime === "video/quicktime"
      ? brand !== "qt  "
      : !["isom", "iso2", "mp41", "mp42", "avc1", "M4V "].includes(brand)
  )
    throw new Error("Conteneur vidéo incompatible.");
  let pos = 0,
    moov: Buffer | undefined,
    mdat = false,
    count = 0;
  while (pos + 8 <= size) {
    if (++count > 10000) throw new Error("Trop de blocs vidéo.");
    const header = await range(pos, Math.min(pos + 15, size - 1));
    let len = header.readUInt32BE(0),
      offset = 8;
    if (len === 1) {
      len = Number(header.readBigUInt64BE(8));
      offset = 16;
    }
    if (len === 0) len = size - pos;
    if (!Number.isSafeInteger(len) || len < offset || pos + len > size)
      throw new Error("Vidéo tronquée.");
    const type = header.toString("ascii", 4, 8);
    if (type === "mdat") mdat = len > offset;
    if (type === "moov") {
      if (len > 2 * 1024 * 1024)
        throw new Error("Métadonnées vidéo trop volumineuses.");
      moov = await range(pos + offset, pos + len - 1);
    }
    pos += len;
  }
  if (!moov || !mdat || pos !== size) throw new Error("Vidéo incomplète.");
  for (const trak of boxes(moov).filter((x) => x.type === "trak")) {
    const children = boxes(moov, trak.start, trak.end);
    const mdia = children.find((x) => x.type === "mdia");
    if (!mdia) continue;
    const md = boxes(moov, mdia.start, mdia.end);
    const hdlr = md.find((x) => x.type === "hdlr");
    if (
      !hdlr ||
      moov.toString("ascii", hdlr.start + 8, hdlr.start + 12) !== "vide"
    )
      continue;
    const tk = children.find((x) => x.type === "tkhd"),
      mh = md.find((x) => x.type === "mdhd"),
      minf = md.find((x) => x.type === "minf");
    if (!tk || !mh || !minf) throw new Error("Piste vidéo invalide.");
    const stbl = boxes(moov, minf.start, minf.end).find(
      (x) => x.type === "stbl",
    );
    const stsd =
      stbl && boxes(moov, stbl.start, stbl.end).find((x) => x.type === "stsd");
    if (!stsd || stsd.start + 20 > stsd.end)
      throw new Error("Codec vidéo absent.");
    const codec = moov.toString("ascii", stsd.start + 12, stsd.start + 16);
    if (!["avc1", "avc3"].includes(codec))
      throw new Error(
        "Seules les vidéos H.264 sont acceptées. Convertissez cette vidéo.",
      );
    const version = moov[mh.start];
    if (version !== 0 && version !== 1) throw new Error("Durée invalide.");
    const scale = moov.readUInt32BE(mh.start + (version === 1 ? 20 : 12));
    const duration =
      version === 1
        ? Number(moov.readBigUInt64BE(mh.start + 24))
        : moov.readUInt32BE(mh.start + 16);
    const duration_ms = Math.round((duration / scale) * 1000);
    if (
      !Number.isSafeInteger(duration_ms) ||
      duration_ms < 1 ||
      duration_ms > 86400000
    )
      throw new Error("Durée vidéo refusée.");
    const matrix = tk.end - 44;
    const a = moov.readInt32BE(matrix),
      b = moov.readInt32BE(matrix + 4),
      c = moov.readInt32BE(matrix + 12),
      d = moov.readInt32BE(matrix + 16);
    const rotated =
      a === 0 && d === 0 && Math.abs(b) === 65536 && Math.abs(c) === 65536;
    const width = moov.readUInt32BE(tk.end - 8) / 65536,
      height = moov.readUInt32BE(tk.end - 4) / 65536;
    return result(rotated ? height : width, rotated ? width : height, {
      duration_ms,
      codec,
      rotation_degrees: rotated ? (b > 0 ? 90 : 270) : a < 0 && d < 0 ? 180 : 0,
    });
  }
  throw new Error("Aucune piste vidéo prise en charge.");
}
