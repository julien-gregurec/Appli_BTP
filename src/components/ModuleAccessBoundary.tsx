"use client";
import { usePathname } from "next/navigation";
import { droitsGestionPour } from "@/lib/module-permissions";
import { featureForPath, type FeatureKey } from "@/lib/feature-catalogue";
import { Lien as Link } from "@/components/Lien";

export function ModuleAccessBoundary({permissions,activeFeatures,children}:{permissions:string[]|null;activeFeatures:FeatureKey[];children:React.ReactNode}) {
  const pathname=usePathname();
  const feature=featureForPath(pathname);
  if(feature&&!activeFeatures.includes(feature))return <main className="flex min-h-[70vh] flex-1 items-center justify-center p-6"><div className="max-w-lg rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-neutral-950"><h1 className="text-xl font-semibold">Fonctionnalité non disponible</h1><p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Cette fonctionnalité n’est pas incluse dans l’espace actuel de votre entreprise.</p><Link href="/dashboard" className="mt-5 inline-flex rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Revenir au tableau de bord</Link></div></main>;
  const droitsMutation=droitsGestionPour(pathname);
  const lectureSeule=permissions!==null&&droitsMutation.length>0&&!droitsMutation.some(droit=>permissions.includes(droit));
  return <div className={`min-w-0 flex-1 overflow-y-auto pt-16 md:pt-0 ${lectureSeule?"lecture-seule":""}`}>
    {lectureSeule&&<div className="sticky top-16 z-30 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900 md:top-0">Mode consultation — vous pouvez consulter ces informations, mais pas les modifier.</div>}
    {children}
  </div>;
}
