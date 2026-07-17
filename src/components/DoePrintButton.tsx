"use client";

export function DoePrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-md border px-3 py-2 text-sm font-medium print:hidden">Imprimer / enregistrer en PDF</button>;
}
