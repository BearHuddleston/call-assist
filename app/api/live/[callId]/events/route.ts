import { z } from "zod";
import { fetchTelephony, relayTelephony } from "@/lib/telephony";

const ParamsSchema = z.object({ callId: z.string().uuid() });
const QuerySchema = z.object({ after: z.coerce.number().int().min(0).default(0) });

export async function GET(request: Request, context: { params: Promise<{ callId: string }> }) {
  const params = ParamsSchema.safeParse(await context.params);
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({ after: url.searchParams.get("after") ?? 0 });
  if (!params.success || !query.success) {
    return Response.json({ error: "Invalid event request." }, { status: 400 });
  }

  try {
    return relayTelephony(await fetchTelephony(
      `/internal/calls/${params.data.callId}/events?after=${query.data.after}`,
    ));
  } catch {
    return Response.json({ error: "The live calling service is unavailable." }, { status: 503 });
  }
}
