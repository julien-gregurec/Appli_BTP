"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { mouvementStockBorneAction } from "@/app/actions/stock";
import { classifierCodeScanne, libelleTypeQr, type CibleScanQr } from "@/lib/qr-identification";

type OptionDestination = { id: string; label: string; code?: string | null };
const input = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

export function StockKioskForm({ chantiers, vehicules, outils, identifiantExemple = "EMP-0001" }: {
  chantiers: OptionDestination[];
  vehicules: OptionDestination[];
  outils: OptionDestination[];
  identifiantExemple?: string;
}) {
  const [codeArticle, setCodeArticle] = useState("");
  const [codeChantier, setCodeChantier] = useState("");
  const [codeVehicule, setCodeVehicule] = useState("");
  const [codeOutil, setCodeOutil] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [vehiculeId, setVehiculeId] = useState("");
  const [outilId, setOutilId] = useState("");
  const [identifiantEmploye, setIdentifiantEmploye] = useState("");
  const [cible, setCible] = useState<CibleScanQr | null>(null);
  const [detection, setDetection] = useState("");
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

  const affecterCode = useCallback((codeBrut: string, cibleDemandee: CibleScanQr) => {
    const code = codeBrut.trim().toUpperCase();
    const type = classifierCodeScanne(code, cibleDemandee);
    if (type === "employe") setIdentifiantEmploye(code);
    if (type === "article") setCodeArticle(code);
    if (type === "chantier") {
      setCodeChantier(code); setChantierId(chantiers.find((item) => item.code?.toUpperCase() === code)?.id ?? "");
      setCodeVehicule(""); setVehiculeId(""); setCodeOutil(""); setOutilId("");
    }
    if (type === "vehicule") {
      setCodeVehicule(code); setVehiculeId(vehicules.find((item) => item.code?.toUpperCase() === code)?.id ?? "");
      setCodeChantier(""); setChantierId(""); setCodeOutil(""); setOutilId("");
    }
    if (type === "outil") {
      setCodeOutil(code); setOutilId(outils.find((item) => item.code?.toUpperCase() === code)?.id ?? "");
      setCodeChantier(""); setChantierId(""); setCodeVehicule(""); setVehiculeId("");
    }
    setDetection(`${libelleTypeQr(type)} reconnu : la bonne case a été remplie automatiquement.`);
  }, [chantiers, outils, vehicules]);

  useEffect(() => {
    if (!cible) return;
    const cibleActive = cible;
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
            affecterCode(code, cibleActive);
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
  }, [affecterCode, cible, fermer]);

  return (
    <>
      <form action={mouvementStockBorneAction} className="space-y-5 rounded-xl border bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 sm:p-6">
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#c9a24a]/50 bg-[#c9a24a]/10 p-4">
          <div><h2 className="font-semibold">Scan intelligent</h2><p className="text-sm text-neutral-600 dark:text-neutral-300">Un seul scanner reconnaît automatiquement salarié, article, chantier, véhicule ou outil.</p></div>
          <button type="button" onClick={() => setCible("auto")} className="rounded-lg bg-[#c9a24a] px-4 py-3 font-semibold text-[#0d1b2a]">Scanner un code</button>
        </section>
        {detection && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-950/30 dark:text-green-200">✓ {detection}</p>}
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
            <select name="type" className={input} defaultValue="sortie"><option value="sortie">Sortie vers une destination</option><option value="entree">Retour / entrée au dépôt</option></select>
            <input name="quantite" type="number" min="0.01" step="0.01" required placeholder="Quantité" className={input} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">3. Destination</legend>
          <p className="text-sm text-neutral-500">Pour une sortie, choisissez une destination ou scannez son QR : chantier, camionnette ou matériel. Une nouvelle détection remplace automatiquement la précédente.</p>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border p-3 dark:border-neutral-800">
              <strong className="text-sm">Chantier</strong>
              <select name="chantier_id" value={chantierId} onChange={(event) => { setChantierId(event.target.value); setCodeChantier(""); if(event.target.value){setVehiculeId("");setCodeVehicule("");setOutilId("");setCodeOutil("");} }} className={input}><option value="">Aucun chantier</option>{chantiers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <input name="code_chantier" value={codeChantier} onChange={(event) => setCodeChantier(event.target.value.toUpperCase())} autoComplete="off" placeholder="QR chantier" className={input} />
            </div>
            <div className="space-y-2 rounded-lg border p-3 dark:border-neutral-800">
              <strong className="text-sm">Véhicule / camionnette</strong>
              <select name="vehicule_id" value={vehiculeId} onChange={(event) => { setVehiculeId(event.target.value); setCodeVehicule(""); if(event.target.value){setChantierId("");setCodeChantier("");setOutilId("");setCodeOutil("");} }} className={input}><option value="">Aucun véhicule</option>{vehicules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <input name="code_vehicule" value={codeVehicule} onChange={(event) => setCodeVehicule(event.target.value.toUpperCase())} autoComplete="off" placeholder="QR véhicule" className={input} />
            </div>
            <div className="space-y-2 rounded-lg border p-3 dark:border-neutral-800">
              <strong className="text-sm">Outil / matériel</strong>
              <select name="outil_id" value={outilId} onChange={(event) => { setOutilId(event.target.value); setCodeOutil(""); if(event.target.value){setChantierId("");setCodeChantier("");setVehiculeId("");setCodeVehicule("");} }} className={input}><option value="">Aucun matériel</option>{outils.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              <input name="code_outil" value={codeOutil} onChange={(event) => setCodeOutil(event.target.value.toUpperCase())} autoComplete="off" placeholder="QR outil" className={input} />
            </div>
          </div>
          <button type="button" onClick={() => setCible("auto")} className="rounded-lg border px-4 py-3 font-medium">Scanner la destination</button>
          <input name="motif" placeholder="Motif ou commentaire facultatif" className={input} />
        </fieldset>
        <button className="w-full rounded-lg bg-[#0d1b2a] px-4 py-4 text-base font-semibold text-white">Valider le mouvement</button>
      </form>

      {cible && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-3">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-neutral-950 text-white">
          <div className="flex items-center justify-between p-4"><div><h3 className="font-semibold">{cible === "auto" ? "Scanner un QR ou code-barres" : `Scanner ${libelleTypeQr(cible)}`}</h3><p className="text-xs text-neutral-400">Le type de ressource est reconnu grâce au préfixe sécurisé du QR Liria.</p></div><button type="button" onClick={fermer} className="rounded border border-white/30 px-3 py-2">Fermer</button></div>
          <div className="relative aspect-[4/3] bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{!erreurCamera && <div className="pointer-events-none absolute inset-[18%_8%] rounded-xl border-2 border-[#c9a24a] shadow-[0_0_0_999px_rgba(0,0,0,.3)]" />}{!cameraPrete && !erreurCamera && <div className="absolute inset-0 flex items-center justify-center bg-black/40">Ouverture de la caméra…</div>}{erreurCamera && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-red-200">{erreurCamera}</div>}</div>
        </div>
      </div>}
    </>
  );
}
