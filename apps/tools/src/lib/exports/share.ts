import { getRuntimePlatform } from "../platform";

export type ShareOutcome = "native" | "web-share" | "download";
export function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.rel = "noopener"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function blobToBase64(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }

export async function shareBlob(blob: Blob, fileName: string, title: string, text: string): Promise<ShareOutcome> {
  if (getRuntimePlatform() !== "web") {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const saved = await Filesystem.writeFile({ path: `exports/${fileName}`, data: await blobToBase64(blob), directory: Directory.Cache, recursive: true });
    await Share.share({ title, text, files: [saved.uri], dialogTitle: "Partager le plan ELSATIA Tools" }); return "native";
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) { await navigator.share({ title, text, files: [file] }); return "web-share"; }
  downloadBlob(blob, fileName); return "download";
}
