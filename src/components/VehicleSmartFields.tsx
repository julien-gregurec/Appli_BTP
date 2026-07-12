"use client";
import { useEffect, useMemo, useState } from "react";

const MARQUES = ["Citroën", "Dacia", "Fiat", "Ford", "Iveco", "MAN", "Mercedes-Benz", "Nissan", "Opel", "Peugeot", "Renault", "Toyota", "Volkswagen"];
const MODELES: Record<string, string[]> = {
  Renault: ["Kangoo", "Master", "Trafic"], Peugeot: ["Boxer", "Expert", "Partner"],
  Citroën: ["Berlingo", "Jumper", "Jumpy"], Ford: ["Ranger", "Transit", "Transit Connect", "Transit Custom"],
  Fiat: ["Doblò", "Ducato", "Scudo"], "Mercedes-Benz": ["Citan", "Sprinter", "Vito"],
  Volkswagen: ["Amarok", "Caddy", "Crafter", "Transporter"], Toyota: ["Hilux", "Proace", "Proace City"],
};

export function VehicleSmartFields({ className }: { className: string }) {
  const [marque, setMarque] = useState("");
  const [modelesDistants, setModelesDistants] = useState<string[]>([]);
  const modeles = useMemo(() => [...new Set([...(MODELES[marque] ?? []), ...modelesDistants])], [marque, modelesDistants]);

  useEffect(() => {
    if (marque.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/referentiels/vehicules?marque=${encodeURIComponent(marque)}`, { signal: controller.signal })
      .then((response) => response.json()).then((data: { modeles?: string[] }) => setModelesDistants(data.modeles ?? [])).catch(() => {}), 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [marque]);

  return <>
    <label className="space-y-1 text-sm"><span className="font-medium">Marque</span><input name="marque" required list="vehicule-marques" value={marque} onChange={(event) => { setMarque(event.target.value); setModelesDistants([]); }} autoComplete="off" className={className}/><datalist id="vehicule-marques">{MARQUES.map((item) => <option key={item} value={item}/>)}</datalist><small className="text-neutral-500">Suggestions + saisie libre</small></label>
    <label className="space-y-1 text-sm"><span className="font-medium">Modèle</span><input name="modele" required list="vehicule-modeles" autoComplete="off" className={className}/><datalist id="vehicule-modeles">{modeles.map((item) => <option key={item} value={item}/>)}</datalist><small className="text-neutral-500">Liste adaptée à la marque, sans blocage</small></label>
  </>;
}
