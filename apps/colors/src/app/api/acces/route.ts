import { NextResponse } from "next/server";
import { AccesApplicationRefuseError } from "@/lib/applications-elsatia";
import { getContexteColors } from "@/lib/contexte";
import { protegerRouteColors } from "@/lib/acces-colors";

export async function GET() {
  const contexte = await getContexteColors();
  try {
    await protegerRouteColors(contexte);
    return NextResponse.json({ application: "colors", autorise: true });
  } catch (error) {
    if (error instanceof AccesApplicationRefuseError) {
      return NextResponse.json({ application: "colors", autorise: false }, { status: 403 });
    }
    throw error;
  }
}
