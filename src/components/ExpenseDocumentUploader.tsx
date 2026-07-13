"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TYPES_JUSTIFICATIF } from "@/lib/notes-frais";

type Apercu = { fichier: File; url: string | null; flou: boolean | null };

async function analyserFlou(fichier: File): Promise<boolean | null> {
  if (!fichier.type.startsWith("image/") || ["image/heic", "image/heif"].includes(fichier.type)) return null;
  try {
    const bitmap = await createImageBitmap(fichier);
    const largeur = Math.min(320, bitmap.width);
    const hauteur = Math.max(1, Math.round(bitmap.height * largeur / bitmap.width));
    const canvas = document.createElement("canvas");
    canvas.width = largeur; canvas.height = hauteur;
    const contexte = canvas.getContext("2d", { willReadFrequently: true });
    if (!contexte) return null;
    contexte.drawImage(bitmap, 0, 0, largeur, hauteur);
    const pixels = contexte.getImageData(0, 0, largeur, hauteur).data;
    let somme = 0; let sommeCarres = 0; let n = 0;
    for (let y = 1; y < hauteur - 1; y += 2) {
      for (let x = 1; x < largeur - 1; x += 2) {
        const gris = (index: number) => (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        const i = (y * largeur + x) * 4;
        const gradient = Math.abs(gris(i) - gris(i - 4)) + Math.abs(gris(i) - gris(i - largeur * 4));
        somme += gradient; sommeCarres += gradient * gradient; n += 1;
      }
    }
    const variance = n ? sommeCarres / n - (somme / n) ** 2 : 0;
    return variance < 45;
  } catch {
    return null;
  }
}

export function ExpenseDocumentUploader({ noteId, disabled = false }: { noteId: string; disabled?: boolean }) {
  const router = useRouter();
  const [apercus, setApercus] = useState<Apercu[]>([]);
  const [type, setType] = useState("facture");
  const [entier, setEntier] = useState(false);
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const alerteCarte = type === "recu_carte_bancaire";
  const total = useMemo(() => apercus.reduce((s, a) => s + a.fichier.size, 0), [apercus]);

  useEffect(() => () => apercus.forEach((a) => a.url && URL.revokeObjectURL(a.url)), [apercus]);

  async function selection(fichiers: FileList | null) {
    if (!fichiers) return;
    apercus.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    const liste = await Promise.all(Array.from(fichiers).slice(0, 20).map(async (fichier) => ({
      fichier,
      url: fichier.type.startsWith("image/") && !["image/heic", "image/heif"].includes(fichier.type) ? URL.createObjectURL(fichier) : null,
      flou: await analyserFlou(fichier),
    })));
    setApercus(liste);
    setEntier(false);
    setMessage(liste.some((a) => a.flou) ? "Une image semble floue. Reprenez-la si le texte n’est pas parfaitement lisible." : "");
  }

  async function envoyer() {
    if (!apercus.length || !entier) return;
    setEnvoi(true); setMessage("");
    const form = new FormData();
    form.set("note_id", noteId); form.set("type_document", type); form.set("document_entier", "1");
    apercus.forEach((a) => form.append("fichiers", a.fichier));
    try {
      const response = await fetch("/api/notes-frais/upload", { method: "POST", body: form });
      const resultat = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(resultat.error ?? "Import impossible");
      setMessage(resultat.message ?? "Document ajouté");
      setApercus([]); setEntier(false); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import impossible");
    } finally { setEnvoi(false); }
  }

  if (disabled) return <p className="rounded-md border bg-neutral-50 p-3 text-sm text-neutral-600">Document verrouillé : aucun fichier ne peut être remplacé. Une nouvelle version administrative devra être ajoutée et auditée.</p>;
  return <section className="space-y-4 rounded-lg border p-4">
    <div><h2 className="font-semibold">Ajouter un justificatif</h2><p className="text-xs text-neutral-500">L’original est conservé sans filtre ni recompression. Vous pouvez ajouter jusqu’à 20 pages.</p></div>
    <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900">
      {TYPES_JUSTIFICATIF.map((item) => <option key={item.cle} value={item.cle}>{item.libelle}</option>)}
    </select>
    {alerteCarte && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Un reçu de carte bancaire prouve le paiement, mais ne décrit pas suffisamment la dépense. Ajoutez également la facture ou le ticket de caisse.</p>}
    {type === "facture_electronique_originale" && <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">Importez le fichier électronique original reçu par e-mail, pas une capture d’écran ni une version recompressée.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-md bg-[#0d1b2a] px-4 py-3 text-center text-sm font-semibold text-white">📷 Photographier un justificatif<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="sr-only" onChange={(e) => selection(e.target.files)} /></label>
      <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-md border px-4 py-3 text-center text-sm font-semibold">Importer PDF ou images<input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={(e) => selection(e.target.files)} /></label>
    </div>
    {apercus.length > 0 && <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{apercus.map((a, index) => <article key={`${a.fichier.name}-${index}`} className={`overflow-hidden rounded-md border ${a.flou ? "border-red-400" : ""}`}>
        {a.url ? <>{/* URL blob locale : aucune optimisation ni transmission au serveur. */}<img /* eslint-disable-line @next/next/no-img-element */ src={a.url} alt={`Aperçu page ${index + 1}`} className="aspect-[3/4] w-full object-contain bg-neutral-100" /></> : <div className="flex aspect-[3/4] items-center justify-center bg-neutral-100 p-2 text-center text-xs">{a.fichier.type === "application/pdf" ? "PDF" : "HEIC original"}<br />Page {index + 1}</div>}
        <div className="p-2 text-[10px]"><p className="truncate">{a.fichier.name}</p><p className="text-neutral-500">{(a.fichier.size / 1024 / 1024).toFixed(2)} Mo{a.flou ? " · flou possible" : ""}</p></div>
      </article>)}</div>
      <p className="text-xs text-neutral-500">{apercus.length} page(s) · {(total / 1024 / 1024).toFixed(2)} Mo. Vérifiez les couleurs, les bords et la lisibilité avant l’envoi.</p>
      <label className="flex items-start gap-2 rounded-md bg-neutral-50 p-3 text-sm"><input type="checkbox" checked={entier} onChange={(e) => setEntier(e.target.checked)} className="mt-1" /><span>Je confirme que le document est visible en entier, non coupé et lisible. J’ai repris la photo si nécessaire.</span></label>
      <div className="flex gap-2"><button type="button" onClick={() => setApercus([])} className="rounded-md border px-4 py-2 text-sm">Reprendre / remplacer</button><button type="button" onClick={envoyer} disabled={!entier || envoi} className="rounded-md bg-[#c9a24a] px-4 py-2 text-sm font-semibold text-[#0d1b2a] disabled:opacity-50">{envoi ? "Vérification et envoi…" : "Valider le justificatif"}</button></div>
    </div>}
    {message && <p role="status" className="rounded-md bg-neutral-50 p-3 text-sm">{message}</p>}
  </section>;
}
