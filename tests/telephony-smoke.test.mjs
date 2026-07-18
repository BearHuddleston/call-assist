import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import test from "node:test";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Telephony service exited with ${child.exitCode}.`);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Telephony service did not become healthy.");
}

test("telephony service is private and fail-closed without provider credentials", async (t) => {
  const port = await freePort();
  const token = "local-smoke-test-token";
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TELEPHONY_HOST: "127.0.0.1",
      TELEPHONY_PORT: String(port),
      CALL_ASSIST_SERVICE_TOKEN: token,
      OPENAI_API_KEY: "",
      TWILIO_ACCOUNT_SID: "",
      TWILIO_AUTH_TOKEN: "",
      TWILIO_FROM_NUMBER: "",
      TELEPHONY_PUBLIC_BASE_URL: "",
    },
    stdio: "ignore",
  });
  t.after(() => child.kill("SIGTERM"));

  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await waitForHealth(baseUrl, child);
  assert.deepEqual(await health.json(), { ok: true, ready: false });

  const unauthorized = await fetch(`${baseUrl}/internal/calls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${baseUrl}/internal/calls`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(invalid.status, 400);
});
