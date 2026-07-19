#!/usr/bin/env python3
"""Render the Call Assist Build Week demo from captured product states.

The renderer deliberately uses the real public demo UI, local macOS narration,
and an isolated MoviePy/FFmpeg environment. It does not place a phone call or
upload anything.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

import imageio_ffmpeg

os.environ.setdefault("IMAGEIO_FFMPEG_EXE", imageio_ffmpeg.get_ffmpeg_exe())

from moviepy import AudioFileClip, ImageClip, concatenate_videoclips
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
CAPTURES = ROOT / "captures"
AUDIO = ROOT / "audio"
GENERATED = ROOT / "generated"
OUTPUT = ROOT / "output"

WIDTH = 1920
HEIGHT = 1080
FPS = 24
VOICE = "Samantha"
VOICE_RATE = 170
TAIL_SECONDS = 0.35

NAVY = "#121D35"
BLUE = "#2864D7"
GREEN = "#34785D"
CREAM = "#F5F2E9"
WHITE = "#FFFFFF"
MUTED = "#667085"
GOLD = "#D69A2D"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

CAPTION_STYLE_VERSION = "transparent-shadow-v2"
CAPTION_STROKE_WIDTH = 4
CAPTION_SHADOW_OFFSET = (4, 5)
CAPTION_SHADOW_BLUR = 3

# Captions move with the demonstrated UI state so the action being explained
# remains visible. Coordinates target the final 1920x1080 frame.
CAPTION_LAYOUTS: Dict[str, Dict[str, object]] = {
    "title-card.png": {
        "box": (220, 928, 1700, 1060),
        "align": "center",
        "max_width": 1420,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "00-setup.png": {
        "box": (90, 880, 900, 1055),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "01-low-risk-confirmed.png": {
        "box": (90, 850, 900, 1045),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "02-plan-phase-1.png": {
        "box": (90, 850, 900, 1045),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "03-plan-phase-2.png": {
        "box": (90, 850, 900, 1045),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "04-plan-phase-3.png": {
        "box": (90, 850, 900, 1045),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "05-plan-phase-4.png": {
        "box": (90, 850, 900, 1045),
        "align": "left",
        "max_width": 780,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
    "06-plan-review.png": {
        "box": (1060, 76, 1815, 176),
        "align": "right",
        "max_width": 720,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 34,
    },
    "18-approval-gate.png": {
        "box": (70, 82, 650, 190),
        "align": "left",
        "max_width": 550,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 34,
    },
    "20-outcome.png": {
        "box": (70, 88, 675, 202),
        "align": "left",
        "max_width": 575,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 34,
    },
    "21-transcript-review.png": {
        "box": (1535, 370, 1870, 750),
        "align": "right",
        "max_width": 305,
        "max_lines": 5,
        "font_size": 36,
        "min_font_size": 30,
    },
    "end-card.png": {
        "box": (220, 930, 1700, 1060),
        "align": "center",
        "max_width": 1420,
        "max_lines": 2,
        "font_size": 42,
        "min_font_size": 36,
    },
}

BOTTOM_CALL_LAYOUT: Dict[str, object] = {
    "box": (190, 958, 1730, 1065),
    "align": "center",
    "max_width": 1480,
    "max_lines": 2,
    "font_size": 42,
    "min_font_size": 34,
}

for call_capture in (
    "07-call-connecting.png",
    "08-call-disclosure.png",
    "09-call-consent.png",
    "10-call-goal.png",
    "11-call-availability.png",
    "12-call-paused.png",
    "13-correction-typed.png",
    "14-correction-sent.png",
    "15-call-resumed.png",
    "19-approved.png",
):
    CAPTION_LAYOUTS[call_capture] = BOTTOM_CALL_LAYOUT


SCENES: List[Dict[str, object]] = [
    {
        "id": "01-title",
        "narration": (
            "For many Deaf and hard-of-hearing people, a simple phone-only task can become a barrier. "
            "Call Assist makes the conversation readable and controllable."
        ),
        "visuals": ["title-card.png"],
    },
    {
        "id": "02-product",
        "narration": (
            "It is a supervised, text-first calling copilot. The user sets the destination, goal, facts "
            "that may be shared, and hard boundaries. The assistant handles the conversation, but the user "
            "keeps final control."
        ),
        "visuals": ["00-setup.png"],
    },
    {
        "id": "03-setup",
        "narration": (
            "Here, Maya wants to reserve a quiet library room. She approves only the minimum facts the "
            "assistant needs and forbids fees, payments, or new personal details. She confirms that this is "
            "a user-initiated, low-risk call."
        ),
        "visuals": ["01-low-risk-confirmed.png"],
    },
    {
        "id": "04-planning",
        "narration": (
            "For reliable public judging, this site deliberately simulates the GPT-5.6 planning stages and "
            "uses the same structured contract without external credentials. In configured mode, the OpenAI "
            "Responses API uses GPT-5.6 Sol to turn approved facts and boundaries into a reviewable plan."
        ),
        "speech": (
            "For reliable public judging, this site deliberately simulates the G P T five point six planning "
            "stages and uses the same structured contract without external credentials. In configured mode, "
            "the OpenAI Responses A P I uses G P T five point six Sol to turn approved facts and boundaries "
            "into a reviewable plan."
        ),
        "visuals": [
            "02-plan-phase-1.png",
            "03-plan-phase-2.png",
            "04-plan-phase-3.png",
            "05-plan-phase-4.png",
            "06-plan-review.png",
        ],
        "fixed_visual_seconds": [1.5, 1.5, 1.5, 1.5],
        "badge": "PUBLIC DEMO · DETERMINISTIC AND CREDENTIAL-FREE",
    },
    {
        "id": "05-review",
        "narration": (
            "Nothing happens before review. Maya can check the objective, conversation path, success criteria, "
            "and every approval gate. The opening identifies Call Assist as an AI accessibility assistant and "
            "asks affirmative consent before live transcription and temporary text review."
        ),
        "visuals": ["06-plan-review.png"],
    },
    {
        "id": "06-simulation",
        "narration": (
            "What you are about to see is a judge-safe simulation; it does not place a phone call. The Twilio "
            "and OpenAI Realtime path is implemented and has been tested with a consented, allowlisted destination."
        ),
        "visuals": ["06-plan-review.png", "07-call-connecting.png"],
        "badge": "JUDGE-SAFE SIMULATION · NO PHONE CALL PLACED",
    },
    {
        "id": "07-conversation",
        "narration": (
            "Rather than pressure the person answering with a checklist, Call Assist explains that it is helping "
            "someone use live captions, asks one warm consent question, and then uses the plan to make reasonable "
            "low-risk choices while keeping the exchange natural."
        ),
        "visuals": [
            "08-call-disclosure.png",
            "09-call-consent.png",
            "10-call-goal.png",
            "11-call-availability.png",
        ],
        "badge": "JUDGE-SAFE SIMULATED CALL",
    },
    {
        "id": "08-controls",
        "narration": (
            "Maya can pause without speaking, type what Call Assist should say, correct a detail, resume, or end "
            "the call. Large two-speaker captions clearly separate the business from the assistant, so she can "
            "follow the conversation at a glance."
        ),
        "visuals": [
            "12-call-paused.png",
            "13-correction-typed.png",
            "14-correction-sent.png",
            "15-call-resumed.png",
        ],
        "badge": "USER CONTROL · PAUSE · CORRECT · RESUME · END",
    },
    {
        "id": "09-approval",
        "narration": (
            "When the library offers the room, Call Assist stops. Nothing is committed until Maya chooses. "
            "Payments, emergencies, marketing, and high-stakes medical or financial calls are blocked entirely; "
            "this first release stays deliberately low risk."
        ),
        "visuals": ["18-approval-gate.png", "19-approved.png"],
        "badge": "EXPLICIT APPROVAL REQUIRED",
    },
    {
        "id": "10-outcome",
        "narration": (
            "After the call, Maya gets confirmed details, the reference number, next actions, and the full "
            "conversation for review. In configured mode, GPT-5.6 structures this outcome. No audio is recorded; "
            "the text remains only in this browser tab and can be cleared explicitly."
        ),
        "speech": (
            "After the call, Maya gets confirmed details, the reference number, next actions, and the full "
            "conversation for review. In configured mode, G P T five point six structures this outcome. No audio "
            "is recorded; the text remains only in this browser tab and can be cleared explicitly."
        ),
        "visuals": ["20-outcome.png", "21-transcript-review.png"],
    },
    {
        "id": "11-close",
        "narration": (
            "Codex helped me implement and test the accessible React interface, safety guardrails, GPT-5.6 "
            "integration, and the Twilio-to-OpenAI Realtime bridge. Call Assist makes phone calls readable."
        ),
        "speech": (
            "Codex helped me implement and test the accessible React interface, safety guardrails, G P T five "
            "point six integration, and the Twilio to OpenAI Realtime bridge. Call Assist makes phone calls readable."
        ),
        "visuals": ["end-card.png"],
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def cover_1080(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    scale = max(WIDTH / image.width, HEIGHT / image.height)
    resized = image.resize(
        (math.ceil(image.width * scale), math.ceil(image.height * scale)),
        Image.Resampling.LANCZOS,
    )
    left = max(0, (resized.width - WIDTH) // 2)
    top = max(0, (resized.height - HEIGHT) // 2)
    return resized.crop((left, top, left + WIDTH, top + HEIGHT))


def centered_text(
    draw: ImageDraw.ImageDraw,
    box: Tuple[int, int, int, int],
    text: str,
    text_font: ImageFont.FreeTypeFont,
    fill: str,
    spacing: int = 10,
) -> None:
    bounds = draw.multiline_textbbox((0, 0), text, font=text_font, spacing=spacing, align="center")
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    x = box[0] + (box[2] - box[0] - text_width) / 2
    y = box[1] + (box[3] - box[1] - text_height) / 2 - bounds[1]
    draw.multiline_text((x, y), text, font=text_font, fill=fill, spacing=spacing, align="center")


def make_title_card(path: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), CREAM)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((120, 105, 250, 235), radius=28, fill=NAVY)
    centered_text(draw, (120, 105, 250, 235), "CA", font(46, True), WHITE)
    draw.line((290, 172, 1720, 172), fill="#D7D2C7", width=3)
    draw.rounded_rectangle((1450, 105, 1795, 165), radius=30, fill="#E7F4ED")
    centered_text(draw, (1450, 105, 1795, 165), "APPS FOR YOUR LIFE", font(23, True), GREEN)
    centered_text(draw, (170, 290, 1750, 580), "Call Assist", font(126, True), NAVY)
    centered_text(draw, (300, 565, 1620, 690), "Calls you can read and control", font(52), BLUE)
    draw.rounded_rectangle((360, 745, 1560, 895), radius=34, fill="#FFFFFF", outline="#DAD5CA", width=3)
    centered_text(
        draw,
        (400, 770, 1520, 870),
        "A supervised calling copilot for\nDeaf and hard-of-hearing people",
        font(34, True),
        NAVY,
        spacing=13,
    )
    image.save(path)


def make_end_card(path: Path) -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), NAVY)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((840, 105, 1080, 345), radius=52, fill=BLUE)
    centered_text(draw, (840, 105, 1080, 345), "CA", font(76, True), WHITE)
    centered_text(draw, (220, 365, 1700, 555), "Calls you can read and control", font(72, True), WHITE)
    centered_text(draw, (260, 555, 1660, 675), "Built with Codex", font(42, True), "#8DB4FF")
    draw.rounded_rectangle((335, 650, 1585, 750), radius=34, fill="#1F2C49")
    centered_text(
        draw,
        (355, 665, 1565, 735),
        "GPT-5.6 Sol   ·   OpenAI Realtime   ·   Twilio",
        font(31, True),
        WHITE,
    )
    centered_text(
        draw,
        (250, 765, 1670, 890),
        "call-assist-accessible-calls.bearhuddleston.chatgpt.site\n"
        "github.com/BearHuddleston/call-assist",
        font(27),
        "#D7E3FF",
        spacing=16,
    )
    image.save(path)


def split_captions(text: str, max_words: int = 12) -> List[str]:
    chunks: List[str] = []
    for sentence in re.split(r"(?<=[.!?;])\s+", text.strip()):
        words = sentence.split()
        if not words:
            continue
        group_count = max(1, math.ceil(len(words) / max_words))
        group_size = math.ceil(len(words) / group_count)
        for index in range(0, len(words), group_size):
            chunks.append(" ".join(words[index : index + group_size]))
    return chunks


def caption_schedule(text: str, duration: float) -> List[Tuple[float, float, str]]:
    chunks = split_captions(text)
    weights = [max(1, len(chunk.split())) for chunk in chunks]
    total_weight = sum(weights)
    schedule: List[Tuple[float, float, str]] = []
    cursor = 0.0
    for index, (chunk, weight) in enumerate(zip(chunks, weights)):
        end = duration if index == len(chunks) - 1 else cursor + duration * weight / total_weight
        schedule.append((cursor, end, chunk))
        cursor = end
    return schedule


def visual_schedule(scene: Dict[str, object], duration: float) -> List[Tuple[float, float, str]]:
    visuals = list(scene["visuals"])
    fixed = list(scene.get("fixed_visual_seconds", []))
    schedule: List[Tuple[float, float, str]] = []
    if fixed:
        cursor = 0.0
        for visual, seconds in zip(visuals[:-1], fixed):
            end = min(duration, cursor + float(seconds))
            schedule.append((cursor, end, str(visual)))
            cursor = end
        schedule.append((cursor, duration, str(visuals[-1])))
        return schedule
    seconds_each = duration / len(visuals)
    for index, visual in enumerate(visuals):
        start = index * seconds_each
        end = duration if index == len(visuals) - 1 else (index + 1) * seconds_each
        schedule.append((start, end, str(visual)))
    return schedule


def active_at(schedule: Sequence[Tuple[float, float, str]], moment: float) -> str:
    for start, end, value in schedule:
        if start <= moment < end or math.isclose(moment, end):
            return value
    return schedule[-1][2]


def wrapped_caption(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    max_lines: int,
    start_size: int,
    min_size: int,
) -> Tuple[str, ImageFont.FreeTypeFont]:
    size = start_size
    fallback_text = text
    fallback_font = font(min_size, True)
    while size >= min_size:
        candidate_font = font(size, True)
        words = text.split()
        lines: List[str] = []
        current: List[str] = []
        for word in words:
            test = " ".join(current + [word])
            width = draw.textbbox((0, 0), test, font=candidate_font)[2]
            if current and width > max_width:
                lines.append(" ".join(current))
                current = [word]
            else:
                current.append(word)
        if current:
            lines.append(" ".join(current))
        fallback_text = "\n".join(lines)
        fallback_font = candidate_font
        if len(lines) <= max_lines:
            return "\n".join(lines), candidate_font
        size -= 2
    return fallback_text, fallback_font


def caption_layout(base_name: str) -> Dict[str, object]:
    return CAPTION_LAYOUTS.get(base_name, BOTTOM_CALL_LAYOUT)


def draw_caption(
    overlay: Image.Image,
    caption: str,
    layout: Dict[str, object],
) -> Image.Image:
    draw = ImageDraw.Draw(overlay)
    box = tuple(layout["box"])
    align = str(layout["align"])
    spacing = 8
    caption_text, caption_font = wrapped_caption(
        draw,
        caption,
        max_width=int(layout["max_width"]),
        max_lines=int(layout["max_lines"]),
        start_size=int(layout["font_size"]),
        min_size=int(layout["min_font_size"]),
    )
    bounds = draw.multiline_textbbox(
        (0, 0),
        caption_text,
        font=caption_font,
        spacing=spacing,
        align=align,
        stroke_width=CAPTION_STROKE_WIDTH,
    )
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    if align == "left":
        x = box[0] - bounds[0]
    elif align == "right":
        x = box[2] - text_width - bounds[0]
    else:
        x = box[0] + (box[2] - box[0] - text_width) / 2 - bounds[0]
    y = box[1] + (box[3] - box[1] - text_height) / 2 - bounds[1]

    shadow_layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    shadow_draw.multiline_text(
        (x + CAPTION_SHADOW_OFFSET[0], y + CAPTION_SHADOW_OFFSET[1]),
        caption_text,
        font=caption_font,
        fill=(0, 0, 0, 175),
        spacing=spacing,
        align=align,
        stroke_width=CAPTION_STROKE_WIDTH + 2,
        stroke_fill=(0, 0, 0, 175),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(CAPTION_SHADOW_BLUR))
    overlay = Image.alpha_composite(overlay, shadow_layer)
    draw = ImageDraw.Draw(overlay)
    draw.multiline_text(
        (x, y),
        caption_text,
        font=caption_font,
        fill=WHITE,
        spacing=spacing,
        align=align,
        stroke_width=CAPTION_STROKE_WIDTH,
        stroke_fill=(9, 17, 32, 255),
    )
    return overlay


def flatten_frame(base_name: str, caption: str, badge: str | None) -> Path:
    base_path = GENERATED / base_name if base_name.endswith("-card.png") else CAPTURES / base_name
    source_version = base_path.stat().st_mtime_ns
    layout = caption_layout(base_name)
    cache_key = hashlib.sha1(
        f"{CAPTION_STYLE_VERSION}|{base_name}|{source_version}|{caption}|{badge}|{layout}".encode("utf-8")
    ).hexdigest()[:14]
    output_path = GENERATED / f"frame-{cache_key}.png"
    if output_path.exists():
        return output_path

    image = cover_1080(Image.open(base_path))
    rgba = image.convert("RGBA")
    overlay = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if badge:
        badge_font = font(23, True)
        bounds = draw.textbbox((0, 0), badge, font=badge_font)
        badge_width = bounds[2] - bounds[0] + 54
        left = (WIDTH - badge_width) // 2
        draw.rounded_rectangle((left, 18, left + badge_width, 70), radius=26, fill=(18, 29, 53, 230))
        centered_text(draw, (left, 18, left + badge_width, 70), badge, badge_font, WHITE)

    overlay = draw_caption(overlay, caption, layout)
    composed = Image.alpha_composite(rgba, overlay).convert("RGB")
    composed.save(output_path, quality=95)
    return output_path


def srt_timestamp(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def generate_audio(scene: Dict[str, object]) -> Path:
    scene_id = str(scene["id"])
    audio_path = AUDIO / f"{scene_id}.aiff"
    text_path = AUDIO / f"{scene_id}.txt"
    speech = str(scene.get("speech", scene["narration"]))
    text_path.write_text(speech + "\n", encoding="utf-8")
    subprocess.run(
        ["/usr/bin/say", "-v", VOICE, "-r", str(VOICE_RATE), "-f", str(text_path), "-o", str(audio_path)],
        check=True,
    )
    return audio_path


def prepare_cards() -> None:
    make_title_card(GENERATED / "title-card.png")
    make_end_card(GENERATED / "end-card.png")


def render() -> None:
    for directory in (AUDIO, GENERATED, OUTPUT):
        directory.mkdir(parents=True, exist_ok=True)
    prepare_cards()

    narration_lines: List[str] = []
    srt_entries: List[str] = []
    scene_clips = []
    global_cursor = 0.0
    caption_index = 1

    for scene in SCENES:
        scene_id = str(scene["id"])
        narration = str(scene["narration"])
        narration_lines.append(f"{scene_id}\n{narration}\n")
        audio_path = generate_audio(scene)
        audio_clip = AudioFileClip(str(audio_path))
        duration = float(audio_clip.duration) + TAIL_SECONDS
        captions = caption_schedule(narration, duration)
        visuals = visual_schedule(scene, duration)
        boundaries = sorted(
            {0.0, duration}
            | {value for start, end, _ in captions for value in (start, end)}
            | {value for start, end, _ in visuals for value in (start, end)}
        )
        still_clips = []
        badge = scene.get("badge")
        for start, end in zip(boundaries, boundaries[1:]):
            if end - start < 0.01:
                continue
            midpoint = (start + end) / 2
            visual = active_at(visuals, midpoint)
            caption = active_at(captions, midpoint)
            frame_path = flatten_frame(visual, caption, str(badge) if badge else None)
            still_clips.append(ImageClip(str(frame_path)).with_duration(end - start))

        scene_video = concatenate_videoclips(still_clips, method="compose").with_audio(audio_clip)
        scene_clips.append(scene_video)

        for start, end, caption in captions:
            srt_entries.append(
                f"{caption_index}\n{srt_timestamp(global_cursor + start)} --> "
                f"{srt_timestamp(global_cursor + end)}\n{caption}\n"
            )
            caption_index += 1
        global_cursor += duration
        print(f"{scene_id}: {duration:.2f}s")

    if global_cursor > 179.0:
        raise RuntimeError(f"Video would be {global_cursor:.2f}s, exceeding the three-minute limit.")

    (ROOT / "narration.txt").write_text("\n".join(narration_lines), encoding="utf-8")
    (OUTPUT / "call-assist-demo.srt").write_text("\n".join(srt_entries), encoding="utf-8")

    final = concatenate_videoclips(scene_clips, method="compose")
    output_path = OUTPUT / "call-assist-build-week-demo.mp4"
    final.write_videofile(
        str(output_path),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        audio_bitrate="192k",
        preset="medium",
        threads=4,
        ffmpeg_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
        logger="bar",
    )
    print(f"Final duration: {global_cursor:.2f}s")
    print(f"Output: {output_path}")
    final.close()
    for clip in scene_clips:
        clip.close()


if __name__ == "__main__":
    render()
