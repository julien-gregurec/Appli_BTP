"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { creerMouvementStockAction } from "@/app/actions/stock";

type Article = {
  id: string;
  reference: string;
  designation: string;
  unite: string;
  quantite_stock: number;
  code_barres: string | null;
  teintes: { id: string; nom: string; code_hex: string | null }[];
};

type Chantier = { id: string; nom: string };

const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function StockMovementForm({ articles, chantiers }: { articles: Article[]; chantiers: Chantier[] }) {
  const [id, setId] = useState(articles[0]?.id ?? "");
  const [scan, setScan] = useState("");
  const [message, setMessage] = useState("");
  const [typeMouvement, setTypeMouvement] = useState("entree");
  const [cameraOuverte, setCameraOuverte] = useState(false);
  const [cameraErreur, setCameraErreur] = useState("");
  const [cameraPrete, setCameraPrete] = useState(false);
  const [lampeDisponible, setLampeDisponible] = useState(false);
  const [lampeActive, setLampeActive] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlesRef = useRef<IScannerControls | null>(null);
  const article = useMemo(() => articles.find((item) => item.id === id), [articles, id]);

  function ouvrirCamera() {
    setCameraErreur("");
    setCameraPrete(false);
    setLampeDisponible(false);
    setLampeActive(false);
    setCameraOuverte(true);
  }

  const selectionnerCode = useCallback((valeur: string, source: "camera" | "saisie") => {
    const code = valeur.trim().toLowerCase();
    const trouve = articles.find((item) => item.code_barres?.toLowerCase() === code || item.reference.toLowerCase() === code);
    if (!trouve) {
      setMessage(`Code ${valeur} inconnu — ajoutez-le sur la fiche article.`);
      return false;
    }
    setId(trouve.id);
    setMessage(`✓ ${trouve.reference} · ${trouve.designation}${source === "camera" ? " sélectionné par la caméra" : ""}`);
    setScan("");
    return true;
  }, [articles]);

  useEffect(() => {
    if (!cameraOuverte) return;
    let annule = false;

    async function demarrer() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("CAMERA_INDISPONIBLE");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (annule || !videoRef.current) return;
        const lecteur = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 700 });
        const controles = await lecteur.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!result) return;
            const code = result.getText();
            controlesRef.current?.stop();
            if (navigator.vibrate) navigator.vibrate(120);
            selectionnerCode(code, "camera");
            setCameraOuverte(false);
          },
        );
        if (annule) {
          controles.stop();
          return;
        }
        controlesRef.current = controles;
        setLampeDisponible(Boolean(controles.switchTorch));
        setCameraPrete(true);
      } catch (error) {
        if (annule) return;
        const nom = error instanceof DOMException ? error.name : "";
        setCameraErreur(
          nom === "NotAllowedError"
            ? "Autorisez l’accès à la caméra dans les réglages du navigateur."
            : nom === "NotFoundError"
              ? "Aucune caméra n’a été détectée sur cet appareil."
              : "Le scanner caméra n’est pas disponible. Utilisez la saisie ou une douchette.",
        );
      }
    }

    demarrer();
    return () => {
      annule = true;
      controlesRef.current?.stop();
      controlesRef.current = null;
    };
  }, [cameraOuverte, selectionnerCode]);

  async function basculerLampe() {
    const prochain = !lampeActive;
    try {
      await controlesRef.current?.switchTorch?.(prochain);
      setLampeActive(prochain);
    } catch {
      setLampeDisponible(false);
    }
  }

  return (
    <>
      <form action={creerMouvementStockAction} className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Entrée / sortie par scan</h2>
            <p className="text-xs text-neutral-500">Caméra du téléphone, douchette ou saisie manuelle.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={ouvrirCamera} className="rounded-md bg-[#c9a24a] px-3 py-2 text-xs font-semibold text-[#0d1b2a]">
              📷 Scanner avec la caméra
            </button>
            <button type="button" onClick={() => scanRef.current?.focus()} className="rounded border px-3 py-2 text-xs">
              Activer la douchette
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            ref={scanRef}
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                selectionnerCode(scan, "saisie");
              }
            }}
            autoComplete="off"
            placeholder="Scanner ou saisir le code-barres puis Entrée"
            className={`${input} min-w-0 flex-1`}
          />
          <button type="button" onClick={() => selectionnerCode(scan, "saisie")} className="rounded border px-3 text-sm">Rechercher</button>
        </div>
        {message && <p role="status" className="text-xs text-neutral-600 dark:text-neutral-300">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <select name="article_id" required value={id} onChange={(event) => setId(event.target.value)} className={input}>
            {articles.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.designation} ({item.quantite_stock} {item.unite})</option>)}
          </select>
          <select name="type" value={typeMouvement} onChange={(event) => setTypeMouvement(event.target.value)} className={input}>
            <option value="entree">Entrée</option><option value="sortie">Sortie chantier</option><option value="ajustement_plus">Ajustement +</option><option value="ajustement_moins">Ajustement -</option>
          </select>
          <select name="teinte_id" className={input}>
            <option value="">Sans teinte</option>{article?.teintes.map((teinte) => <option key={teinte.id} value={teinte.id}>{teinte.nom}</option>)}
          </select>
          <input name="quantite" type="number" min="0.01" step="0.01" required placeholder="Quantité" className={input} />
          <input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={input} />
          <select name="chantier_id" required={typeMouvement === "sortie"} className={input}><option value="">{typeMouvement === "sortie" ? "Chantier obligatoire" : "Sans chantier"}</option>{chantiers.map((chantier) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}</select>
          <input name="motif" placeholder="Motif / bon de livraison" className={`${input} col-span-2`} />
        </div>
        <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm text-white">Enregistrer le mouvement</button>
      </form>

      {cameraOuverte && (
        <div role="dialog" aria-modal="true" aria-label="Scanner un code-barres" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-neutral-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 p-4">
              <div><h3 className="font-semibold">Scanner le code-barres</h3><p className="text-xs text-neutral-400">Placez le code dans le cadre.</p></div>
              <button type="button" onClick={() => setCameraOuverte(false)} className="rounded-md border border-white/30 px-3 py-2 text-sm">Fermer</button>
            </div>
            <div className="relative aspect-[4/3] bg-black">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              {!cameraErreur && <div className="pointer-events-none absolute inset-[22%_10%] rounded-xl border-2 border-[#c9a24a] shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />}
              {!cameraPrete && !cameraErreur && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm">Ouverture de la caméra…</div>}
              {cameraErreur && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-200">{cameraErreur}</div>}
            </div>
            <div className="flex min-h-16 items-center justify-between gap-3 p-4 text-xs text-neutral-300">
              <span>{cameraPrete ? "Scanner actif — la détection est automatique" : "Vous pourrez toujours saisir le code manuellement."}</span>
              {lampeDisponible && <button type="button" onClick={basculerLampe} className="shrink-0 rounded-md border border-white/30 px-3 py-2">{lampeActive ? "Éteindre la lampe" : "Allumer la lampe"}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
