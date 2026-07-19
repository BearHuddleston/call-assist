# Build Week submission draft

Use this as working copy for the Devpost form. Review and rephrase the project story in the entrant's own voice before final submission; verify every field in the final preview.

## Project overview

**Project name:** Call Assist

**Elevator pitch:** Phone calls you can read, guide, and control—a supervised calling assistant for Deaf and hard-of-hearing people.

The pitch is under Devpost's 200-character limit.

**Category:** Apps for Your Life

**Optional thumbnail:** `public/og.png` is available at 1672×941 and 1.92 MB. Devpost recommends a 3:2 image, so crop it before uploading rather than stretching it.

## About the project

### Inspiration

An ordinary errand can stop at the words “please call us.” For a Deaf or hard-of-hearing person, a transcript solves only part of the problem. The call is still unpredictable, private details may come up, and interrupting without speaking is awkward.

I built Call Assist to handle the speaking while keeping the user in charge of what is said, shared, and agreed to.

### What it does

Call Assist is a supervised, text-first assistant for low-risk phone calls. Before the call, the user enters the destination, goal, approved facts, and rules Call Assist must follow. They also confirm that the request is a low-risk call the product supports.

When OpenAI credentials are configured, GPT-5.6 Sol turns that request into a plan the user can review: the opening disclosure, conversation path, success criteria, approval points, and conditions for stopping. During a live call, large two-speaker captions separate the person answering from Call Assist. The user can pause, type something for the assistant to say, correct a detail, resume, decline a commitment, or end the call.

Call Assist identifies itself as an AI accessibility assistant and asks permission to continue with live transcription and keep a temporary review transcript before discussing the request. It describes the user as Deaf or hard of hearing only when the user has explicitly approved sharing that fact. It also stops before any supported reservation, appointment, registration, or cancellation that does not involve payment. The assistant may do the talking, but it does not get a blank check.

Afterward, GPT-5.6 can turn the conversation into confirmed details, a reference number, unresolved questions, and next steps. The user's review copy remains available in the current browser tab and can be cleared. Call Assist does not record or store audio.

The public version is a transparent, deterministic simulation that requires no account or credentials and places no phone call. The private live path uses Twilio and OpenAI Realtime for consented, allowlisted destinations.

### How I built it

The web app uses React 19, Next.js 16, TypeScript, and vinext. The planning and outcome routes use the OpenAI Responses API with GPT-5.6 Sol. Both return strict, Zod-validated data. The deterministic demo fills those same contracts, so it exercises the real interface instead of maintaining a separate mock product.

A Fastify service handles the long-lived telephony connection. It starts the outbound call with Twilio, then bridges Twilio's bidirectional Media Stream to OpenAI Realtime through the OpenAI Agents SDK. The browser receives normalized captions, call states, approval requests, and errors. Provider credentials, raw audio, and vendor payloads stay on the server.

Server-side checks reject emergencies, payments, telemarketing, bulk outreach, and high-stakes medical or financial transactions. A private service token, destination allowlist, and Twilio signature validation protect the live-calling path.

### How Codex and GPT-5.6 contributed

I used Codex from product scoping through verification. It helped me define safety boundaries and stable event contracts, then implement the React UI, API routes, schemas, prompts, Fastify service, and Twilio/OpenAI bridge. Codex also added tests and transcript-retention behavior, diagnosed live-call bugs, and ran type checks, linting, unit tests, production builds, rendered-page checks, and media QA. I reviewed the behavior and made the final product decisions.

I decided to keep the first release low risk, defer dynamic IVR/DTMF, require disclosure and transcription consent, process the temporary transcript once for the outcome, keep the user's review copy in the current tab, and stop before commitments. A live test exposed another problem: the assistant asked too many questions and made the recipient feel pressured. A phone assistant should reduce pressure, not turn the call into a pop quiz. I changed the prompt so it now synthesizes context, makes tentative low-risk inferences, and asks no more than two substantive clarification questions. It mentions that the user is Deaf or hard of hearing only when that identity appears in the approved facts.

GPT-5.6 did two distinct jobs: it powered my Codex build collaboration, and GPT-5.6 Sol runs inside the app to create reviewable call plans and structured post-call outcomes when credentials are configured.

### Challenges

Connecting Twilio and OpenAI Realtime without exposing credentials or raw audio to the browser was the main engineering problem. That led to a separate telephony service and a smaller, provider-neutral event contract for the interface.

The harder product problem was finding the right balance between initiative and control. An assistant that never asks is reckless; one that asks about everything is exhausting. Live testing pushed the design toward tentative inference, fewer questions, visible correction controls, and explicit approval points.

Privacy created one more constraint: the transcript needed to remain useful after the call without becoming a permanent record. Call Assist records no audio. It processes the temporary transcript once to create the outcome, deletes the calling service's caption copy after the outcome or when it expires, and keeps the user's review copy in the current tab until it is cleared, the tab is refreshed or closed, or another call begins.

### Accomplishments

Call Assist now has a complete supervised flow: accessible setup, visible planning, plan review, large captions, typed intervention, pause and correction controls, approval points, and a structured outcome with transcript review.

The private path connects Twilio telephony to OpenAI Realtime. The public demo gives judges the same plan, captions, controls, approvals, and outcome flow without exposing credentials or calling a real person. Judges need no login.

### What I learned

Supervised autonomy is a better fit for this problem than full autonomy. A transcript is useful, but it is not a steering wheel. The user also needs control over timing, language, consent, privacy, and commitments.

I learned something similar from the demo: a deterministic simulation works best when it follows the real plan and outcome formats instead of merely imitating the interface. Judges can test the whole interaction without placing a call, while the implementation still shows how the private live path works.

### What's next

The next step is consented testing with Deaf and hard-of-hearing users. Their feedback should guide caption personalization, conversational pacing, and which low-risk scenarios are worth supporting next.

On the engineering side, I would add carefully scoped IVR/DTMF support, multilingual calling, a shared ephemeral event store for production scaling, and a deeper privacy review. I would also evaluate GPT-Live when a stable public API contract is available.

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

No account or credentials are required.

1. Open the public demo; the library-room request is already filled in.
2. Confirm that it is a low-risk call, then select **Create call plan** and watch the four planning phases.
3. Review the disclosure, conversation path, confirmation goals, and approval point. Select **Start simulated call**.
4. Follow the Call Assist and Person answering captions. Pause the assistant, type guidance or choose **Correct a detail**, then resume.
5. Approve the no-cost room reservation when prompted. Review the result, reference number, next step, and transcript, then choose **Clear from this tab**.

This path is a deterministic simulation and places no phone call. Call Assist does not record or store audio. The live Twilio/OpenAI Realtime path is private, credential-gated, and allowlisted.

## Submission form status

- `/feedback` Codex Session ID: **Entered in Devpost**
- Final project-name confirmation: **Call Assist**
- Submitter type: **Individual**
- Country of residence: **United States**
- Solo/team confirmation: **Solo submission**
- Video visibility: **Public and accessible without authentication.**
- Official Rules and Devpost Terms acceptance: **USER ACTION REQUIRED at final submission**
- Final submission and confirmation screenshot: **TODO**
