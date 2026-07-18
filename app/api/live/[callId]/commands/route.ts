import { z } from "zod";
import { CallCommandSchema } from "@/lib/contracts";
import { fetchTelephony, relayTelephony } from "@/lib/telephony";

const ParamsSchema = z.object({ callId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ callId: string }> }) {
  const params = ParamsSchema.safeParse(await context.params);
  const command = CallCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !command.success) {
    return Response.json({ error: "Invalid call command." }, { status: 400 });
  }

  try {
    return relayTelephony(await fetchTelephony(
      `/internal/calls/${params.data.callId}/commands`,
      { method: "POST", body: JSON.stringify(command.data) },
    ));
  } catch {
    return Response.json({ error: "The live calling service is unavailable." }, { status: 503 });
  }
}
