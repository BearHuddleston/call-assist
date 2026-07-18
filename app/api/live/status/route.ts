import { getTelephonyConfig } from "@/lib/telephony";

export async function GET() {
  const config = getTelephonyConfig();
  if (!config) return Response.json({ available: false, mode: "demo" });

  try {
    const response = await fetch(`${config.serviceUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error("The telephony service is unhealthy.");
    const health = await response.json() as { ready?: boolean };
    const available = health.ready === true;
    return Response.json({ available, mode: available ? "live" : "demo" });
  } catch {
    return Response.json({ available: false, mode: "demo" });
  }
}
