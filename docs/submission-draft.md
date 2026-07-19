# Build Week submission draft

Use this as working copy for the Devpost form. Review and rephrase the project story in the entrant's own voice before final submission; verify every field in the final preview.

## Project overview

**Project name:** Call Assist

Working-name status: confirm before final submission. Devpost allows up to 60 characters.

**Elevator pitch:** A supervised calling copilot that gives Deaf and hard-of-hearing people live, readable conversations and explicit control over every commitment.

The pitch is 144 characters; Devpost allows up to 200.

**Category:** Apps for Your Life

**Optional thumbnail:** `public/og.png` is available at 1672×941 and 1.92 MB. Devpost recommends a 3:2 image, so crop it before uploading rather than stretching it.

## About the project

### Inspiration

For many Deaf and hard-of-hearing people, an ordinary phone-only task can become an accessibility barrier. A transcript alone is not enough: the user still has to prepare for an unpredictable conversation, decide what may be shared, and intervene without speaking. I wanted to build an accessibility assistant that could plan, reason, and speak while leaving the user visibly in control.

### What it does

Call Assist is a supervised, text-first calling copilot for low-risk calls. The user chooses a destination, states the goal, supplies only the facts the assistant may share, sets hard boundaries, and confirms the request is low risk.

GPT-5.6 Sol turns that request into a structured, reviewable call plan: an opening disclosure, conversation path, success criteria, approval gates, and stop conditions. During the conversation, large two-speaker captions separate the business from the assistant. The user can pause, type something for Call Assist to say, correct a detail, resume, decline a commitment, or end the call. Call Assist identifies itself as an AI accessibility assistant and asks for consent before live transcription and temporary text review. It stops for explicit approval before any supported no-payment reservation, appointment, registration, or cancellation.

After the call, GPT-5.6 can structure the result into confirmed details, a reference number, unresolved questions, and next actions. The complete transcript remains available separately for the user to review. No audio is recorded. The review text stays in the current browser tab and can be cleared explicitly.

The public build defaults to a deterministic, judge-safe simulation that needs no account or credentials. A separate credential-gated live path is implemented for consented, allowlisted destinations using Twilio outbound calling and OpenAI Realtime.

### How I built it

The accessible web experience uses React 19, Next.js 16, TypeScript, and vinext. The planning and outcome routes use the OpenAI Responses API with GPT-5.6 Sol and strict Zod-backed schemas. The deterministic demo fills those same contracts, so the public fallback and credential-backed mode exercise one product flow.

A separate Fastify service owns long-lived telephony connections. It creates a Twilio outbound call and bridges Twilio's bidirectional Media Stream to an OpenAI Realtime session through the OpenAI Agents SDK. The browser only receives normalized call-state, caption, approval, and error events; provider credentials, audio frames, and raw payloads remain on the server.

Server-side screening blocks emergency calls, payments, telemarketing, bulk outreach, and high-stakes medical or financial transactions. Live calling is additionally protected by a service token, destination allowlist, and Twilio signature validation.

### How Codex and GPT-5.6 contributed

I collaborated with Codex throughout the project, from product scoping to implementation and verification. Codex helped translate the accessibility goal into safety boundaries and stable event contracts; scaffold and refine the React interface, API routes, schemas, prompts, Fastify service, and Twilio/OpenAI bridge; add accessibility and transcript-retention behavior; diagnose live-call issues; and build the deterministic demo and automated test coverage. It repeatedly ran type checks, linting, unit tests, production builds, rendered-page checks, and media QA while I reviewed the product behavior and made the final decisions.

The key human decisions were to keep the first release low risk, defer dynamic IVR/DTMF, require an opening disclosure and transcription consent, retain transcripts only in the current tab, stop before commitments, and keep a credential-free public simulation. After live testing showed the conversation felt pressuring, I directed a prompt change: the assistant now synthesizes context, makes tentative low-risk inferences, asks at most two substantive clarification questions, and explains its accessibility role and that the user is following through live captions. It names the user as Deaf or hard of hearing only when the user has explicitly included that identity in the approved facts.

GPT-5.6 is meaningful in two ways: it powered the Codex collaboration used to build the project, and GPT-5.6 Sol is integrated at runtime to produce reviewable call plans and structured post-call outcomes when credentials are configured.

### Challenges

The hardest engineering boundary was connecting two realtime systems without exposing provider credentials or audio payloads to the browser. The hardest product challenge was balancing autonomy with control: the assistant must move the call forward naturally without interrogating the person answering or making an unauthorized commitment. Privacy added another constraint—keeping a useful transcript available after the call while avoiding audio recording and durable transcript storage.

### Accomplishments

Call Assist now presents a coherent end-to-end experience: accessible setup, a visible planning process, plan review, large live captions, typed intervention, pause and correction controls, approval gates, and a structured outcome with transcript review. The credential-backed and deterministic paths share the same schemas. The public demo needs no login, while the live telephony path remains private and allowlisted.

### What I learned

The right model for this problem is supervised autonomy, not full autonomy. Accessibility means more than displaying text; it means designing the assistant's timing, language, consent behavior, and decision boundaries around the person it is helping. I also learned that a deterministic demo is strongest when it is an adapter for the real contracts rather than a separate mock interface.

### What's next

Next steps include carefully scoped IVR/DTMF support, more caption personalization, multilingual calling, a shared ephemeral event store for production scaling, deeper privacy review, and consented pilots with Deaf and hard-of-hearing users. I would also evaluate GPT-Live once a stable public API contract is available.

## Built with

Devpost accepts up to 25 tags. Proposed tags:

- OpenAI
- Codex
- GPT-5.6
- OpenAI Responses API
- OpenAI Realtime API
- OpenAI Agents SDK
- Twilio
- Twilio Media Streams
- React
- Next.js
- TypeScript
- Fastify
- WebSockets
- Zod
- Cloudflare Workers
- Accessibility

## Try it out

- Working project: https://call-assist-accessible-calls.bearhuddleston.chatgpt.site/
- Source repository: https://github.com/BearHuddleston/call-assist
- Demo video: https://youtu.be/nhh0-V-DEPc

## Judge-only testing instructions

No account or credentials are required. Open the public demo and use the prefilled library-room request. Confirm that it is a low-risk call, then select **Create call plan** and watch the four visible planning phases. Review the disclosure, success criteria, conversation path, and approval gate. Select **Run safe demo**. Follow the large Business and Call Assist captions; pause the assistant, type guidance or use **Correct a detail**, then resume. When the assistant stops at the room-reservation gate, approve the no-cost commitment. Review the structured result, reference number, next actions, and retained transcript, then use **Clear from this tab**.

This path is a deterministic simulation and places no phone call; no audio is recorded. The live Twilio/OpenAI Realtime path is private, credential-gated, and allowlisted.

## Remaining user-owned form values

- `/feedback` Codex Session ID: **TODO — obtain from the task where most core functionality was built**
- Final project-name confirmation: **TODO**
- Submitter type: **TODO — Individual, Team of Individuals, or Organization**
- Country of residence: **TODO**
- Solo/team confirmation: **TODO**
- Video visibility: **Public and accessible without authentication.**
- Official Rules and Devpost Terms acceptance: **USER ACTION REQUIRED at final submission**
- Final submission and confirmation screenshot: **TODO**
