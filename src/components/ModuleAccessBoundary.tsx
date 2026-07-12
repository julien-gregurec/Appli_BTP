"use client";
import { usePathname } from "next/navigation";
import { GESTION_PERMISSION_PAR_CHEMIN } from "@/lib/module-permissions";

export function ModuleAccessBoundary({permissions,children}:{permissions:string[]|null;children:React.ReactNode}) {
  const pathname=usePathname();
  const droitGestion=GESTION_PERMISSION_PAR_CHEMIN.find(([chemin])=>pathname===chemin||pathname.startsWith(`${chemin}/`))?.[1];
  const lectureSeule=permissions!==null&&Boolean(droitGestion)&&!permissions.includes(droitGestion!);
  return <div className={`min-w-0 flex-1 overflow-y-auto pt-16 md:pt-0 ${lectureSeule?"lecture-seule":""}`}>
    {lectureSeule&&<div className="sticky top-16 z-30 border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900 md:top-0">Mode consultation — vous pouvez consulter ces informations, mais pas les modifier.</div>}
    {children}
  </div>;
}
