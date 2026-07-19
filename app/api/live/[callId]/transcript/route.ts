import { z } from "zod";
import { fetchTelephony, relayTelephony } from "@/lib/telephony";

const ParamsSchema = z.object({ callId: z.string().uuid() });

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ callId: string }> },
) {
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return Response.json({ error: "Invalid transcript request." }, { status: 400 });
  }

  try {
    return relayTelephony(await fetchTelephony(
      `/internal/calls/${params.data.callId}/transcript`,
      { method: "DELETE" },
    ));
  } catch {
    return Response.json({ error: "The live calling service is unavailable." }, { status: 503 });
  }
}
