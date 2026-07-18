# Project brief

## Product thesis

People who are Deaf or hard of hearing should be able to complete ordinary phone-only tasks without surrendering control or depending on audio. Call Assist converts a user-approved goal into a supervised phone conversation with live captions and clear approval gates.

## First-release scope

The hackathon MVP focuses on low-risk calls to direct, allowlisted, consenting test destinations. Dynamic IVR or DTMF navigation is deliberately deferred.

The default interaction is supervised autonomy:

1. The user provides a destination, goal, allowed facts, and boundaries.
2. GPT-5.6 creates a reviewable call plan and success criteria.
3. The realtime agent identifies itself as an AI accessibility assistant and requests consent to continue with live transcription.
4. The user follows large two-speaker captions and can type corrections or messages for the agent to say.
5. Appointments, purchases, cancellations, sensitive disclosures, and other commitments require explicit approval.
6. GPT-5.6 returns a structured outcome, reference numbers, unresolved questions, and next actions.

## Build-event constraints

- Category: Apps for Your Life
- Submission deadline: July 21, 2026 at 5:00 PM Pacific Time
- Codex and GPT-5.6 must both be used meaningfully
- The final submission needs a working project, repository, README, public YouTube demo under three minutes, testing access, and the `/feedback` Codex session ID where most core functionality was built

## Safety baseline

- User-initiated and allowlisted calls only
- No emergency calls, telemarketing, bulk outreach, payments, or high-stakes healthcare/financial transactions
- Accurate caller ID and an opening AI/accessibility disclosure
- Affirmative consent before live transcription continues
- No audio recording; transcript retention is ephemeral by default
- Prominent user-controlled hang-up and approval controls

