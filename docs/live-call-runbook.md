# Controlled live-call runbook

Use this only for a consented, low-risk test destination. Keep the judge-safe simulation available throughout the demo.

## 1. Configure without committing secrets

Copy `.env.example` to `.env.local` and set:

- `CALL_ASSIST_DEMO_MODE=false`
- `OPENAI_API_KEY`
- `CALL_ASSIST_ALLOWLIST` with the exact E.164 test number
- a long random `CALL_ASSIST_SERVICE_TOKEN`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`
- `TELEPHONY_PUBLIC_BASE_URL` to the HTTPS origin that reaches the Fastify service

Leave `TWILIO_VALIDATE_SIGNATURES=true`. `.env.local` is ignored by Git.

## 2. Expose only the telephony service

Run the web app and telephony process separately:

```bash
npm run dev
npm run telephony:dev
```

Route the public HTTPS/WSS origin to the telephony port, default `8788`. Do not expose the web app’s private service token to the browser or place it in a URL.

Confirm `GET /health` returns `{"ok":true,"ready":true}`. The response intentionally does not identify which secrets are present.

## 3. Place one supervised call

1. Open the web app and confirm the header says **Live service ready**.
2. Choose **Allowlisted live destination…** and enter the consented business name and exact allowlisted number.
3. Create and review the call plan.
4. Start the supervised live call and watch for ringing, disclosure, and consent for live transcription plus temporary post-call text review.
5. Exercise pause/resume or typed guidance once.
6. Approve or decline one reviewed, no-payment reservation, appointment, registration, or cancellation only if the business requests it.
7. End the call, verify the structured outcome and review transcript appear, then test the explicit **Clear from this tab** control.

## 4. Stop conditions

End immediately if the recipient declines transcription, the call reaches an IVR, the conversation becomes high risk, a payment or sensitive identifier is requested, captions become unreliable, or the supervisor loses control connectivity.

## 5. After the test

- Stop the public tunnel and telephony process.
- Confirm no `.env.local` or credentials are staged in Git.
- Record the test result without copying the transcript into logs or documentation.
- Rotate any credential that was exposed outside its intended secret store.

Reference architecture: [OpenAI Realtime and audio](https://developers.openai.com/api/docs/guides/realtime), [Twilio bidirectional Media Streams](https://www.twilio.com/docs/voice/media-streams), and [Twilio request validation](https://www.twilio.com/docs/usage/security).

## Build Week validation record

- July 19, 2026: completed a supervised call to a consented, allowlisted test destination and used the resulting experience to refine transcript review and conversational flow. No destination number or transcript was retained in the repository.
