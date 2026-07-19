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

- Real screenshots captured from the current public deployment at a 1080p-class viewport.
- Local macOS narration using the Samantha system voice; no microphone or room audio is captured.
- Burned-in narration captions plus a matching `.srt` file.
- Every simulated-call frame remains visibly labeled.
- No phone call is placed and nothing is uploaded by the render process. Publication is a separate, deliberate step.

## Render

The renderer expects an isolated Python environment containing MoviePy, Pillow, NumPy, and `imageio-ffmpeg`:

```bash
python render_video.py
```

Output files are written to `output/`.

## Verified review cut

- Runtime: **2:38.36**
- Video: **1920×1080**, H.264 High, 24 fps, progressive `yuv420p`
- Audio: AAC stereo, approximately 192 kb/s
- Accessibility: burned-in narration captions plus `output/call-assist-demo.srt`
- Technical QA: full video/audio decode completed without warnings or errors
- Publication state: uploaded to YouTube as **Unlisted**; anyone with the URL can watch
- Video URL: https://youtu.be/sNnt9y9wiq8
