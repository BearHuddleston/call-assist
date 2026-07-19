# Architecture

## Product loop

1. The browser submits an allowlisted destination, goal, shareable facts, and boundaries to `POST /api/plan`.
2. The server validates the request and blocks unsupported topics before any model or phone action.
3. GPT-5.6 Sol returns a strict `CallPlan` through the Responses API. Without credentials, the same contract is filled by the deterministic demo adapter.
4. The user reviews the disclosure, conversation path, success criteria, approval gates, and stop conditions.
5. The default call UI runs against a scripted transport. The implemented live service can create a Twilio outbound call and bridge its bidirectional Media Stream to an OpenAI Realtime session once credentials and a public HTTPS endpoint are configured.
6. The browser polls cursor-based live events and projects them into the same large caption, approval, and control surfaces used by the scripted path.
7. After hang-up, `POST /api/outcome` converts the temporary transcript into a strict `CallOutcome`. The browser keeps a review copy in the current tab until the user clears it, refreshes or closes the tab, or starts another call.

## Stable contracts

The shared Zod schemas in `lib/contracts.ts` define:

- `CallRequest`: destination, goal, facts, boundaries, and low-risk confirmation
- `CallPlan`: opening disclosure, success criteria, conversation path, approval gates, and stop conditions
- `TranscriptTurn`: agent, business, user, or system caption
- `CallOutcome`: status, confirmed details, unresolved items, next actions, and optional reference number

The deterministic demo and the credential-backed OpenAI routes return the same contracts so the UI does not branch on provider behavior.

## Live telephony boundary

`server/index.ts` is a separate Fastify process because it holds long-lived WebSocket connections. It authenticates private web-app requests with `CALL_ASSIST_SERVICE_TOKEN`, validates Twilio webhook signatures, and keeps provider credentials and payloads outside the browser. The Next server proxies only normalized application events and commands.

Implemented browser events:

- `call.state`: connecting, ringing, live, paused, ending, ended
- `caption.final`: speaker-labeled temporary text
- `approval.requested`: commitment text and a stable approval ID
- `approval.resolved`: approve or decline decision
- `call.error`: recoverable or terminal error with a user-safe message

Implemented browser commands:

- `guidance.say`
- `guidance.correct`
- `call.pause`
- `call.resume`
- `approval.resolve`
- `call.end`

After outcome creation, the browser requests `DELETE /api/live/:callId/transcript` so the telephony process removes caption events and Realtime references from its temporary call record. The browser review copy is separate and remains until the user clears it or leaves.

Provider-specific audio frames, credentials, call SIDs, and Realtime event payloads stay on the server.

The live UI adapter remains deliberately gated from the default scripted demo. It calls `POST /api/live/start`, polls cursor-based events, and sends supervision actions to `POST /api/live/:callId/commands` only after the operator chooses an allowlisted live destination and starts the reviewed plan.

## Voice model decision — July 18, 2026

OpenAI announced GPT‑Live on July 8, 2026. GPT‑Live‑1 and GPT‑Live‑1 mini are currently documented for ChatGPT Voice; OpenAI says API access is coming soon, but as of July 18 it has not published a GPT‑Live API model ID, endpoint contract, pricing, or rate limits.

SayAhead will keep the documented `gpt-realtime-2.1` API for the July 21 Build Week demo. That integration is already tested with the Twilio Media Streams bridge, captions, interruption handling, tools, and supervisor approvals. Changing models this close to the deadline would add undocumented availability and transport risk without improving the judge-visible core workflow.

The browser-facing call contracts remain provider-neutral. Treat Realtime session construction inside the telephony service as the adapter seam, and evaluate GPT‑Live only after OpenAI publishes its API contract. Before migrating, re-test telephone audio, latency, interruptions, captions, consent, transcript handling, tool approvals, pricing, and rate limits.

Sources: [Introducing GPT‑Live](https://openai.com/index/introducing-gpt-live/), [GPT‑Live‑1 API notification](https://openai.com/form/gpt-live-1-in-the-api/), and [`gpt-realtime-2.1` API documentation](https://developers.openai.com/api/docs/models/gpt-realtime-2.1).

## Realtime session policy

- Model: `gpt-realtime-2.1`
- Server-to-server WebSocket transport for phone media
- Medium reasoning effort so the assistant can synthesize answers and choose a low-pressure next step before speaking
- The opening disclosure and consent question come before the assistant discusses the request. The Realtime transport processes that opening exchange so it can receive the answer; the conversation does not move to the request unless the person clearly consents.
- At most two substantive clarification questions after consent, with tentative synthesis preferred over open-ended interviewing
- Structured approvals limited to explicit user gates for no-payment reservations, appointments, registrations, and cancellations
- Runtime rejection for prices, payments, purchases, deposits, subscriptions, sensitive disclosures, and actions without a matching user gate
- Immediate stop on declined consent, unsupported risk, or a user hang-up
- SayAhead does not enable provider recording or persist audio; Realtime history audio storage is disabled

## Service lifecycle

Call state, final captions, and pending approvals are held in process memory. Completed records are removed after five minutes; abandoned active records expire after thirty minutes. That is enough for the supervised Build Week demo, but not for a horizontally scaled production service.

A production version needs a shared ephemeral event store, idempotent webhook handling, explicit concurrency limits, privacy-reviewed operational logging, and a stable privacy-preserving Realtime safety identifier when the transport supports forwarding it.

## Privacy

The current build keeps the review copy in browser memory during the call and outcome review. It sends the transcript once to the outcome endpoint, with OpenAI storage disabled when the model path is used.

After the outcome is created, the browser asks the telephony service to delete caption events and Realtime references from its temporary call record. If that request fails, the completed record expires after five minutes. The browser copy disappears when the user clears it, refreshes or closes the tab, or starts another call. Production logging must exclude transcript text and provider audio frames.
