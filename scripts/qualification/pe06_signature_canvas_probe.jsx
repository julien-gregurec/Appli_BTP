// Réplique fidèle de la logique de détection de tracé de src/components/SignatureEmploye.tsx
import React from "react";
import ReactDOM from "react-dom/client";
// (mêmes handlers React onPointerDown/Move/Up, même ref `vide`, même garde dans enregistrer()).
const { useEffect, useRef, useState } = React;

function Signature() {
  const canvas = useRef(null);
  const dessine = useRef(false);
  const vide = useRef(true);
  const [message, setMessage] = useState(null);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio; c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#0d1b2a";
  }, []);

  const position = (e) => { const r = canvas.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const debut = (e) => { e.preventDefault(); const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    dessine.current = true; vide.current = false; const { x, y } = position(e); ctx.beginPath(); ctx.moveTo(x, y);
    window.__trace = (window.__trace || []).concat("pointerdown"); };
  const trace = (e) => { if (!dessine.current) return; const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    const { x, y } = position(e); ctx.lineTo(x, y); ctx.stroke();
    window.__trace = (window.__trace || []).concat("pointermove"); };
  const fin = () => { dessine.current = false; window.__trace = (window.__trace || []).concat("pointerup"); };

  const enregistrer = () => {
    const dataUrl = vide.current ? null : canvas.current.toDataURL("image/png");
    if (!dataUrl) { setMessage("Dessinez la signature avant d'enregistrer."); return; }
    // Substitut de la Server Action : une vraie requête réseau observable.
    fetch("/__action", { method: "POST", body: dataUrl }).then(() => { setEnvoye(true); setMessage("Signature enregistrée."); });
  };

  return React.createElement("div", null,
    React.createElement("canvas", {
      ref: canvas, onPointerDown: debut, onPointerMove: trace, onPointerUp: fin, onPointerLeave: fin,
      style: { width: "420px", height: "144px", border: "1px dashed #999", background: "#fff", touchAction: "none" },
    }),
    React.createElement("button", { onClick: enregistrer, id: "save" }, "Enregistrer la signature"),
    message && React.createElement("p", { id: "msg" }, message),
    envoye && React.createElement("img", { id: "sig", alt: "Signature de l'employé", src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }),
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Signature));
