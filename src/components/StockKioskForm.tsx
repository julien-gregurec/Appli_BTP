"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { mouvementStockBorneAction } from "@/app/actions/stock";

type Chantier = { id: string; nom: string };
type CibleScan = "employe" | "article" | "chantier";
const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

export function StockKioskForm({ chantiers, identifiantExemple = "EMP-0001" }: { chantiers: Chantier[]; identifiantExemple?: string }) {
  const [codeArticle, setCodeArticle] = useState("");
  const [codeChantier, setCodeChantier] = useState("");
  const [identifiantEmploye, setIdentifiantEmploye] = useState("");
  const [cible, setCible] = useState<CibleScan | null>(null);
  const [cameraPrete, setCameraPrete] = useState(false);
  const [erreurCamera, setErreurCamera] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlesRef = useRef<IScannerControls | null>(null);

  const fermer = useCallback(() => {
    controlesRef.current?.stop();
    controlesRef.current = null;
    setCible(null);
    setCameraPrete(false);
  }, []);

  useEffect(() => {
    if (!cible) return;
    let annule = false;
    async function demarrer() {
      try {
        setErreurCamera("");
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("secure_context");
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (annule || !videoRef.current) return;
        const lecteur = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 800 });
        const controles = await lecteur.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current,
          (result) => {
            if (!result) return;
            const code = result.getText().trim().toUpperCase();
            if (cible === "article") setCodeArticle(code); else if(cible === "employe") setIdentifiantEmploye(code); else setCodeChantier(code);
            navigator.vibrate?.(100);
            fermer();
          },
        );
        if (annule) return controles.stop();
        controlesRef.current = controles;
        setCameraPrete(true);
      } catch (error) {
        if (annule) return;
        const nom = error instanceof DOMException ? error.name : "";
        setErreurCamera(
          nom === "NotAllowedError"
            ? "La caméra est bloquée. Autorisez-la dans les réglages du navigateur."
            : nom === "NotFoundError"
              ? "Aucune caméra n’a été détectée."
              : "La caméra nécessite l’application en HTTPS. Vous pouvez toujours utiliser une douchette ou saisir le code.",
        );
      }
    }
    demarrer();
    return () => {
      annule = true;
      controlesRef.current?.stop();
      controlesRef.current = null;
    };
  }, [cible, fermer]);

  return (
    <>
      <form action={mouvementStockBorneAction} className="space-y-5 rounded-xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 sm:p-6">
        <div className="rounded-lg bg-[#0d1b2a] p-4 text-white">
          <h2 className="text-lg font-semibold">Identification personnelle</h2>
          <p className="mt-1 text-sm text-white/70">Le mouvement sera enregistré uniquement à votre nom. Utilisez l’identifiant indiqué dans « Mon espace » et votre mot de passe stock personnel.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex gap-2"><input name="identifiant_employe" value={identifiantEmploye} onChange={event=>setIdentifiantEmploye(event.target.value.toUpperCase())} required autoComplete="off" autoCapitalize="characters" placeholder={`Identifiant salarié (${identifiantExemple})`} className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white px-3 py-3 text-base uppercase text-neutral-950" /><button type="button" onClick={()=>setCible("employe")} className="rounded-lg border border-[#c9a24a] bg-[#c9a24a] px-3 text-sm font-semibold text-[#0d1b2a]">QR salarié</button></div>
            <input name="mot_de_passe_stock" type="password" minLength={8} maxLength={72} required autoComplete="off" placeholder="Mot de passe stock" className="w-full rounded-lg border border-white/30 bg-white px-3 py-3 text-base text-neutral-950" />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="font-semibold">1. Article</legend>
          <div className="flex gap-2">
            <input name="code_article" value={codeArticle} onChange={(event) => setCodeArticle(event.target.value.toUpperCase())} required autoComplete="off" placeholder="QR, code-barres ou référence article" className={input} />
            <button type="button" onClick={() => setCible("article")} className="shrink-0 rounded-lg bg-[#c9a24a] px-4 font-semibold text-[#0d1b2a]">Scanner</button>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">2. Mouvement</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="type" className={input} defaultValue="sortie"><option value="sortie">Sortie vers chantier</option><option value="entree">Retour / entrée au dépôt</option></select>
            <input name="quantite" type="number" min="0.01" step="0.01" required placeholder="Quantité" className={input} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">3. Chantier</legend>
          <p className="text-sm text-neutral-500">Obligatoire pour une sortie. Choisissez le chantier ou scannez son QR code.</p>
          <select name="chantier_id" className={input} defaultValue=""><option value="">Choisir un chantier</option>{chantiers.map((chantier) => <option key={chantier.id} value={chantier.id}>{chantier.nom}</option>)}</select>
          <div className="flex gap-2">
            <input name="code_chantier" value={codeChantier} onChange={(event) => setCodeChantier(event.target.value.toUpperCase())} autoComplete="off" placeholder="Ou scanner le QR du chantier" className={input} />
            <button type="button" onClick={() => setCible("chantier")} className="shrink-0 rounded-lg border px-4 font-medium">Scanner</button>
          </div>
          <input name="motif" placeholder="Motif ou commentaire facultatif" className={input} />
        </fieldset>
        <button className="w-full rounded-lg bg-[#0d1b2a] px-4 py-4 text-base font-semibold text-white">Valider le mouvement</button>
      </form>

      {cible && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-3">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-neutral-950 text-white">
          <div className="flex items-center justify-between p-4"><div><h3 className="font-semibold">Scanner {cible === "article" ? "l’article" : cible === "employe" ? "le QR du salarié" : "le chantier"}</h3><p className="text-xs text-neutral-400">QR code et codes-barres sont reconnus.</p></div><button type="button" onClick={fermer} className="rounded border border-white/30 px-3 py-2">Fermer</button></div>
          <div className="relative aspect-[4/3] bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{!erreurCamera && <div className="pointer-events-none absolute inset-[18%_8%] rounded-xl border-2 border-[#c9a24a] shadow-[0_0_0_999px_rgba(0,0,0,.3)]" />}{!cameraPrete && !erreurCamera && <div className="absolute inset-0 flex items-center justify-center bg-black/40">Ouverture de la caméra…</div>}{erreurCamera && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-200">{erreurCamera}</div>}</div>
        </div>
      </div>}
    </>
  );
}
