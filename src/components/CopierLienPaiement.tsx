"use client";
import { useState } from "react";

export function CopierLienPaiement({url}:{url:string}){const[copie,setCopie]=useState(false);async function copier(){await navigator.clipboard.writeText(url);setCopie(true);window.setTimeout(()=>setCopie(false),2000);}return <div className="rounded-md border border-blue-200 bg-white p-3"><p className="mb-2 break-all font-mono text-xs text-neutral-600">{url}</p><div className="flex flex-wrap gap-2"><button type="button" onClick={copier} className="rounded-md bg-[#0d1b2a] px-3 py-2 text-xs font-semibold text-white">{copie?"Lien copié":"Copier le lien pour le client"}</button><a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-2 text-xs font-semibold">Tester dans un nouvel onglet</a></div></div>}
