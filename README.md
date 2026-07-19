<p align="center">
  <a href="https://call-assist-accessible-calls.bearhuddleston.chatgpt.site/">
    <img src="public/og.png" alt="Call Assist — calls you can read and control" width="100%">
  </a>
</p>

<h1 align="center">Call Assist</h1>

<p align="center">
  <strong>A supervised, text-first calling copilot for Deaf and hard-of-hearing people.</strong><br>
  Plan the call, follow large live captions, guide the assistant without speaking, and approve every commitment.
</p>

<p align="center">
  <a href="https://call-assist-accessible-calls.bearhuddleston.chatgpt.site/"><img src="https://img.shields.io/badge/Try_the_demo-Open-2563EB?style=for-the-badge" alt="Open the Call Assist demo"></a>
  <a href="https://youtu.be/nhh0-V-DEPc"><img src="https://img.shields.io/badge/Watch_the_demo-2%3A52-0F172A?style=for-the-badge" alt="Watch the 2 minute 52 second demo"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-15803D?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  OpenAI Build Week · Apps for Your Life · GPT-5.6 Sol · OpenAI Realtime · Twilio
</p>

Phone-only services still create a hard accessibility barrier. Call Assist lets the user define the goal, approved facts, and hard limits before anything starts. It then creates a reviewable plan, conducts the conversation with large two-speaker captions, and pauses before a supported reservation, appointment, registration, or cancellation.

> **The public demo is judge-safe and credential-free.** It runs a transparent deterministic simulation and places no phone call. A separate private, allowlisted path implements real outbound calling with Twilio and OpenAI Realtime.

## See the supervised flow

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/images/readme/plan-review.jpg"><img src="docs/images/readme/plan-review.jpg" alt="Call Assist plan review showing the objective, disclosure, conversation path, success criteria, and approval gate"></a>
      <br><strong>1. Review before anything happens</strong><br>
      The credential-backed path uses GPT-5.6 Sol to produce a bounded plan; the public demo visibly simulates the same schema.
    </td>
    <td width="50%" valign="top">
      <a href="docs/images/readme/live-correction.jpg"><img src="docs/images/readme/live-correction.jpg" alt="Paused Call Assist conversation with large captions and a typed name correction"></a>
      <br><strong>2. Follow and correct the conversation</strong><br>
      Large captions separate Call Assist from the business. The user can pause, correct a detail, type what to say, resume, or end the call.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="docs/images/readme/approval-gate.jpg"><img src="docs/images/readme/approval-gate.jpg" alt="Call Assist approval gate asking before committing to a no-cost room reservation"></a>
      <br><strong>3. Approve every commitment</strong><br>
      The assistant stops visibly before a supported commitment. Nothing happens until the user approves or declines.
    </td>
    <td width="50%" valign="top">
      <a href="docs/images/readme/outcome.jpg"><img src="docs/images/readme/outcome.jpg" alt="Call Assist outcome showing a confirmed room, reference number, next action, and transcript privacy notice"></a>
      <br><strong>4. Review the result and transcript</strong><br>
      The outcome contract surfaces confirmed details, a reference number, unresolved questions, and next actions; GPT-5.6 fills it when configured. The transcript remains separately reviewable in the current tab.
    </td>
  </tr>
</table>

## Judge quick test

The recommended path takes about 90 seconds:

1. Open the [public demo](https://call-assist-accessible-calls.bearhuddleston.chatgpt.site/); the library-room request is prefilled.
2. Confirm the request is low risk, then choose **Create call plan** and watch the four visible planning phases.
3. Review the disclosure, conversation path, success criteria, and approval gate, then choose **Run safe demo**.
4. Follow the two-speaker captions. Pause Call Assist, enter a correction or typed instruction, and resume.
5. Approve the no-cost reservation only when prompted, then review the structured outcome and transcript. Finish with **Clear from this tab**.

The simulation uses the same plan, event, supervision, approval, and outcome contracts as the credential-backed path without calling a real person.

## Safety and privacy by design

| The user stays in control | Call Assist stays inside the boundary |
| --- | --- |
| Reviews the plan before starting | User-initiated, allowlisted, low-risk calls only |
| Sees an AI/accessibility disclosure and transcription-consent request | No emergency calls, telemarketing, bulk outreach, payments, or high-stakes medical/financial transactions |
| Can pause, correct, type guidance, decline, or hang up | No dynamic IVR/DTMF navigation in this MVP |
| Must approve supported commitments | No commitment outside the reviewed goal and approval gates |
| Can review and explicitly clear the transcript | No audio recording; review text stays in the current browser tab and is not written to durable app storage |

## Built with Codex and GPT-5.6

Call Assist was created during the July 2026 Build Week submission period in Codex with GPT-5.6. Codex helped turn the accessibility goal into a working product: it scaffolded and refined the React interface, defined shared call contracts, implemented safety checks, connected the Fastify/Twilio/OpenAI Realtime path, wrote tests, diagnosed live-call friction, and prepared the public deployment and demo artifacts.

The key product decisions remained human-directed:

- Focus on Deaf and hard-of-hearing people completing ordinary phone-only tasks.
- Prefer synthesis and tentative low-risk inferences over interrogating the person answering.
- Require AI/accessibility disclosure, affirmative transcription consent, and explicit approval before commitments.
- Keep the MVP low risk and supervised; defer dynamic IVR/DTMF.
- Record no audio and keep transcript review ephemeral in the browser.
- Ship a transparent simulation so judges can test the complete experience without credentials or pressure on a real call recipient.

GPT-5.6 Sol is integrated through the OpenAI Responses API in two runtime steps:

1. Turn the reviewed request into a strict, reviewable call plan.
2. Turn the completed conversation into a structured post-call outcome.

Both use Zod-backed schemas. The deterministic demo fills those same contracts and labels its simulated planning phases honestly. See the [planning route](app/api/plan/route.ts), [outcome route](app/api/outcome/route.ts), [shared contracts](lib/contracts.ts), and [agent prompts](lib/prompts.ts).

## Architecture

~~~mermaid
flowchart LR
    U["User<br>captions + controls"] --> W["React web app"]
    W --> P["Responses API<br>GPT-5.6 Sol"]
    W --> S["Private Fastify service"]
    S --> T["Twilio<br>outbound call + Media Stream"]
    T <--> R["OpenAI Realtime<br>gpt-realtime-2.1"]
    S --> W
~~~

| Layer | Role | Technology |
| --- | --- | --- |
| Accessible web app | Setup, plan review, captions, controls, approvals, outcome | React 19, TypeScript, Next-compatible App Router, vinext |
| Planning and outcome | Strict structured reasoning before and after the call | OpenAI Responses API, GPT-5.6 Sol, Zod |
| Realtime voice | Low-latency spoken conversation | OpenAI Realtime API, Agents SDK Twilio transport |
| Telephony | Outbound call and bidirectional media bridge | Fastify, Twilio Voice, Media Streams, WebSockets |
| Public hosting | Credential-free judge-safe simulation | OpenAI Sites, Cloudflare Worker-compatible build |

Provider credentials, raw audio frames, and provider payloads remain server-side. The browser receives only normalized call state, caption, approval, outcome, and error events.

## Run locally

Requirements: Node.js 22.13 or newer.

~~~bash
npm install
cp .env.example .env.local
npm run dev
~~~

Open the printed local URL. Demo mode is enabled by default and requires no API key or telephony credentials.

To use real GPT-5.6 planning and outcomes, set <code>CALL_ASSIST_DEMO_MODE=false</code> and add <code>OPENAI_API_KEY</code> to <code>.env.local</code>. Keys are read only on the server.

<details>
<summary><strong>Run the optional allowlisted live-calling path</strong></summary>

Fill the telephony values in <code>.env.local</code>, including a long random <code>CALL_ASSIST_SERVICE_TOKEN</code>, an HTTPS <code>TELEPHONY_PUBLIC_BASE_URL</code>, and a consented E.164 test number in <code>CALL_ASSIST_ALLOWLIST</code>.

~~~bash
npm run dev
npm run telephony:dev
~~~

Keep <code>TWILIO_VALIDATE_SIGNATURES=true</code> outside a local webhook harness. Do not place a live call until the destination is allowlisted and the operator is ready to supervise it. Read the [live-call runbook](docs/live-call-runbook.md) first.
</details>

## Verify

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:render
~~~

The current suite covers structured contracts, safety screening, prompt behavior, demo timing, live-event projection, provider failure handling, and rendered output.

## Documentation

- [Product brief](docs/project-brief.md)
- [Architecture and voice-model decision](docs/architecture.md)
- [Live-call runbook](docs/live-call-runbook.md)
- [Build Week submission checklist](docs/submission-checklist.md)
- [Demo storyboard and media QA](submission/call-assist-demo/storyboard.md)

## License

Call Assist is available under the [MIT License](LICENSE). Third-party dependencies and services retain their respective licenses and terms.
