type TelephonyConfig = {
  serviceUrl: string;
  token: string;
};

export function getTelephonyConfig(): TelephonyConfig | null {
  const serviceUrl = process.env.TELEPHONY_SERVICE_URL?.trim().replace(/\/$/, "");
  const token = process.env.CALL_ASSIST_SERVICE_TOKEN?.trim();
  return serviceUrl && token ? { serviceUrl, token } : null;
}

export async function fetchTelephony(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const config = getTelephonyConfig();
  if (!config) throw new Error("The live calling service is not configured.");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config.token}`);
  if (init.body) headers.set("Content-Type", "application/json");

  return fetch(`${config.serviceUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export async function relayTelephony(response: Response): Promise<Response> {
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
  });
}
