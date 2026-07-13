import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("codes_identification").select("code,actif").eq("id", id).eq("actif", true).maybeSingle();
  if (!data) return new Response("Code introuvable", { status: 404 });
  const svg = await QRCode.toString(data.code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 420,
    color: { dark: "#0d1b2a", light: "#ffffff" },
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="${data.code}.svg"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
