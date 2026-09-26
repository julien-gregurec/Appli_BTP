import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { validateFile, writable } from "../src/lib/media-contract";
import { inspectMedia } from "../src/lib/media-inspection";
const limits = { image_bytes: 52428800, video_bytes: 1073741824 };
describe("admission fichiers", () => {
  for (const [name, mime] of [
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["photo.png", "image/png"],
    ["photo.webp", "image/webp"],
    ["video.mp4", "video/mp4"],
    ["video.mov", "video/quicktime"],
  ])
    it(name, () =>
      expect(() => validateFile(name, mime, 1, limits)).not.toThrow(),
    );
  for (const [name, mime, size] of [
    ["fake.png", "image/jpeg", 100],
    ["x.svg", "image/svg+xml", 100],
    ["x.heic", "image/heic", 100],
    ["x.webm", "video/webm", 100],
    ["empty.jpg", "image/jpeg", 0],
    ["../x.jpg", "image/jpeg", 100],
    ["x.jpg", "image/jpeg", 52428801],
    ["x.mp4", "video/mp4", 1073741825],
    ["x.jpg", "image/jpeg", NaN],
  ] as const)
    it(`refus ${name} ${size}`, () =>
      expect(() => validateFile(name, mime, size, limits)).toThrow());
  it("roles", () => {
    for (const r of ["owner", "admin", "editor"])
      expect(writable(r)).toBe(true);
    expect(writable("viewer")).toBe(false);
  });
});
describe("inspection des octets réels", () => {
  for (const format of ["jpeg", "png", "webp"] as const)
    it(format, async () => {
      const b = await sharp({
        create: { width: 80, height: 60, channels: 3, background: "#278854" },
      })
        .toFormat(format)
        .toBuffer();
      const meta = await inspectMedia(
        "image/" + format,
        b.length,
        async (a, z) => b.subarray(a, z + 1),
      );
      expect(meta).toMatchObject({
        width: 80,
        height: 60,
        orientation: "landscape",
      });
      expect(meta).not.toHaveProperty("gps");
    });
  it("faux MIME", async () => {
    const b = Buffer.from("<html>not jpg</html>");
    await expect(
      inspectMedia("image/jpeg", b.length, async (a, z) =>
        b.subarray(a, z + 1),
      ),
    ).rejects.toThrow("Signature");
  });
  it("PNG tronqué", async () => {
    const b = (
      await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#123456" },
      })
        .png()
        .toBuffer()
    ).subarray(0, 40);
    await expect(
      inspectMedia("image/png", b.length, async (a, z) => b.subarray(a, z + 1)),
    ).rejects.toThrow();
  });
  it("vidéo sans piste", async () => {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(24);
    b.write("ftypisom", 4);
    await expect(
      inspectMedia("video/mp4", b.length, async (a, z) => b.subarray(a, z + 1)),
    ).rejects.toThrow();
  });
});

it("réutilise le préfixe pour les petites images et respecte l’orientation EXIF", async () => {
  const buffer = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#abcdef" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  let calls = 0;
  const value = await inspectMedia(
    "image/jpeg",
    buffer.length,
    async (a, b) => {
      calls++;
      return buffer.subarray(a, b + 1);
    },
  );
  expect(calls).toBe(1);
  expect(value).toMatchObject({
    width: 80,
    height: 120,
    orientation: "portrait",
    exif_orientation: 6,
  });
});
