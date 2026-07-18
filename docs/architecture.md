# Architecture

## Product loop

1. The browser submits an allowlisted destination, goal, shareable facts, and boundaries to `POST /api/plan`.
2. The server validates the request and blocks unsupported topics before any model or phone action.
3. GPT-5.6 Sol returns a strict `CallPlan` through the Responses API. Without credentials, the same contract is filled by the deterministic demo adapter.
4. The user reviews the disclosure, conversation path, success criteria, approval gates, and stop conditions.
5. The default call UI runs against a scripted transport. The implemented live service can create a Twilio outbound call and bridge its bidirectional Media Stream to an OpenAI Realtime session once credentials and a public HTTPS endpoint are configured.
6. The browser polls cursor-based live events and projects them into the same large caption, approval, and control surfaces used by the scripted path.
7. After hang-up, `POST /api/outcome` converts the temporary transcript into a strict `CallOutcome`, then the browser clears its transcript state.

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

- `call.state`: connecting, ringing, consent, live, paused, ending, ended
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

Provider-specific audio frames, credentials, call SIDs, and Realtime event payloads stay on the server.

The live UI adapter remains deliberately gated from the default scripted demo. It calls `POST /api/live/start`, polls cursor-based events, and sends supervision actions to `POST /api/live/:callId/commands` only after the operator chooses an allowlisted live destination and starts the reviewed plan.

## Realtime session policy

- Model: `gpt-realtime-2.1`
- Server-to-server WebSocket transport for phone media
- Low reasoning effort as the latency baseline
- Opening AI/accessibility disclosure before the goal
- Affirmative consent before live transcription continues
- Tools limited to approval requests and call-state controls
- Immediate stop on declined consent, unsupported risk, or a user hang-up
- No audio persistence

## Service lifecycle

Call state, final captions, and pending approvals are held in process memory. Completed records are removed after five minutes; abandoned active records expire after thirty minutes. This is suitable for the Build Week supervised demo, not a horizontally scaled production deployment. A production version needs a shared ephemeral event store, idempotent webhook handling, explicit concurrency limits, privacy-reviewed operational logging, and a stable privacy-preserving Realtime safety identifier when the transport supports forwarding it.

## Privacy

The current build keeps captions in browser memory only while the call screen is active. The transcript is sent once to the outcome endpoint, with OpenAI storage disabled when the model path is used, and then deleted from browser state. Production logging must exclude transcript text and provider audio frames.
