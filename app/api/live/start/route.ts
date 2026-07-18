import { StartCallSchema } from "@/lib/contracts";
import { screenCallRequest } from "@/lib/safety";
import { fetchTelephony, relayTelephony } from "@/lib/telephony";

export async function POST(request: Request) {
  const parsed = StartCallSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid live call request." }, { status: 400 });
  }

  const safety = screenCallRequest(parsed.data.request, process.env.CALL_ASSIST_ALLOWLIST);
  if (!safety.allowed) {
    return Response.json({ error: safety.reasons.join(" ") }, { status: 400 });
  }

  try {
    return relayTelephony(await fetchTelephony("/internal/calls", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    }));
  } catch {
    return Response.json({ error: "The live calling service is unavailable." }, { status: 503 });
  }
}
