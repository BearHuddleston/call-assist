# Call Assist Build Week demo

Target: a narrated, captioned, judge-safe product walkthrough under three minutes.

## Story arc

1. Establish the phone-access barrier for Deaf and hard-of-hearing people.
2. Show the supervised setup: destination, goal, approved facts, boundaries, and low-risk confirmation.
3. Preserve the visible four-phase GPT-5.6 planning simulation and explain the configured Responses API path.
4. Review the disclosure, conversation path, success criteria, and approval gate.
5. Label the call clearly as a judge-safe simulation and note that the live Twilio/OpenAI Realtime path is separately implemented and tested.
6. Show large two-speaker captions, pause, typed correction, resume, and explicit approval.
7. Show the structured outcome, confirmation number, privacy explanation, and retained transcript.
8. Close with the Codex, GPT-5.6 Sol, OpenAI Realtime, and Twilio stack plus the public URLs.

## Production choices

- Product screenshots were captured manually from the public deployment at a 1080p-class viewport. The local capture files are intentionally ignored by Git.
- Narration is generated with OpenAI `gpt-audio-1.5` and the built-in `marin` voice; no microphone or room audio is captured. The opening provides both spoken and visual AI-voice disclosure.
- The renderer compares the returned audio transcript with the approved scene script and fails rather than rendering captions against changed wording.
- Burned-in narration captions plus a matching `.srt` file.
- Every simulated-call frame remains visibly labeled.
- No phone call is placed and nothing is uploaded by the render process. Publication is a separate, deliberate step.

## Editable rendering source

The repository keeps the storyboard, narration text, subtitle file, and renderer as editable source. It does **not** contain a capture generator, the local screenshots/audio, or a locked Python dependency environment, so this is not a self-contained or bit-for-bit reproducible video build.

To create a local render with the current script, provide:

- An `OPENAI_API_KEY` in the shell environment or repository `.env.local`, billed API access, and network access for narration generation
- macOS with the Arial fonts currently referenced by `render_video.py`
- Python with MoviePy, Pillow, NumPy, and `imageio-ffmpeg` installed in an isolated environment; dependency versions are not pinned in this repository
- A `captures/` directory containing manually captured product frames with the exact names below. Capture automation is not included.

```text
00-setup.png
01-low-risk-confirmed.png
02-plan-phase-1.png
03-plan-phase-2.png
04-plan-phase-3.png
05-plan-phase-4.png
06-plan-review.png
07-call-connecting.png
08-call-disclosure.png
09-call-consent.png
10-call-goal.png
11-call-availability.png
12-call-paused.png
13-correction-typed.png
14-correction-sent.png
15-call-resumed.png
18-approval-gate.png
19-approved.png
20-outcome.png
21-transcript-review.png
```

From `submission/call-assist-demo/`, run:

```bash
python render_video.py
```

The script generates the title and end cards, narration audio, burned-in caption frames, `.srt` file, and final video locally. Intermediate media and the `.mp4` are ignored by Git; output files are written to `output/`. Because captures and dependency versions are external inputs, a new render can differ from the verified review cut below.

## Verified review cut

- Runtime: **2:51.85**
- Video: **1920×1080**, H.264 High, 24 fps, progressive `yuv420p`
- Audio: OpenAI `gpt-audio-1.5` with the built-in `marin` voice, encoded as AAC stereo at approximately 192 kb/s; integrated loudness **−15.9 LUFS**, true peak **−1.4 dBFS**
- Accessibility: spoken and visual AI-narration disclosure, burned-in narration captions, and 46 matching cues in `output/call-assist-demo.srt` ending at `00:02:51,850`
- Technical QA: full video/audio decode completed without warnings or errors
- SHA-256: `81770ccb28670730fdf92cda44fb9a8582d03636a255b8016219c1876949ddd7`
- Publication state: uploaded to YouTube as **Unlisted**; anyone with the URL can watch
- Video URL: https://youtu.be/nhh0-V-DEPc
