import Image from "next/image";

export function IdentificationCodeCard({ id, code, label = "Code QR interne" }: { id: string; code: string; label?: string }) {
  return <section className="rounded-lg border p-4 dark:border-neutral-800">
    <div className="flex flex-col items-center gap-3 sm:flex-row">
      <Image src={`/api/identification/${id}/qr`} alt={`QR ${code}`} width={150} height={150} unoptimized className="rounded-md border bg-white" />
      <div className="min-w-0"><h2 className="font-semibold">{label}</h2><p className="mt-1 text-sm text-neutral-500">À coller sur l’équipement ou le dossier. Le scan ouvre l’identifiant interne sans exposer de donnée sensible.</p><code className="mt-3 block break-all rounded bg-neutral-100 px-2 py-1.5 text-sm dark:bg-neutral-900">{code}</code><a href={`/api/identification/${id}/qr`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-medium text-[#9b7728] hover:underline">Ouvrir pour imprimer</a></div>
    </div>
  </section>;
}
