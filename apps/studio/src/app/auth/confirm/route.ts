import { NextResponse, type NextRequest } from "next/server";
import { createStudioClient } from "../../../lib/supabase";
import { studioOrigin } from "../../../lib/config";
import { notices } from "../../../lib/notices";
const types = ["email", "signup", "recovery"] as const;
/** Email links of the shared Auth templates: `?token_hash=…&type=email|signup|recovery`. */
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = types.find((t) => t === request.nextUrl.searchParams.get("type"));
  if (token_hash && type) {
    const client = await createStudioClient();
    const { error } = await client.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(
        new URL(
          type === "recovery" ? "/reset-password" : "/dashboard",
          studioOrigin(),
        ),
      );
  }
  return NextResponse.redirect(
    new URL(
      `/login?error=${encodeURIComponent(notices.invalidLink)}`,
      studioOrigin(),
    ),
  );
}
