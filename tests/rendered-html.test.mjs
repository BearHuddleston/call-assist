import assert from "node:assert/strict";
import test from "node:test";

async function requestWorker(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Call Assist setup experience", async () => {
  const response = await requestWorker("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Call Assist — supervised calls you can read<\/title>/i);
  assert.match(html, /Tell us what you need from the call/);
  assert.match(html, /Create call plan/);
  assert.match(html, /No audio recording/);
  assert.match(html, /Captions stay in this tab after the call/);
  assert.match(html, /If you want Call Assist to say you are Deaf or hard of hearing/);
  assert.match(html, /user-initiated, low-risk call/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("live calling reports unavailable when its private service is not ready", async () => {
  const response = await requestWorker("/api/live/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: false, mode: "demo" });
});

test("planning reports whether it will use AI or a deterministic demo", async () => {
  const response = await requestWorker("/api/plan");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const status = await response.json();
  assert.ok(status.mode === "ai" || status.mode === "demo");
});

test("live calling rejects malformed requests before provider access", async () => {
  const response = await requestWorker("/api/live/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid live call request." });
});

test("transcript purge rejects malformed call identifiers before provider access", async () => {
  const response = await requestWorker("/api/live/not-a-call/transcript", {
    method: "DELETE",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid transcript request." });
});
