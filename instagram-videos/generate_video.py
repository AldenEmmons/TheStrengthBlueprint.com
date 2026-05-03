import os
import sys
import time
import base64
import argparse
import requests
import subprocess
from datetime import date
from dotenv import load_dotenv
from verses import VERSES

load_dotenv()

API_KEY = os.getenv("LTX_API_KEY")
OUTPUT_DIR = "output"


def pick_verse():
    day_index = date.today().timetuple().tm_yday % len(VERSES)
    return VERSES[day_index]


def image_to_data_uri(image_path: str) -> str:
    ext = os.path.splitext(image_path)[1].lower().lstrip(".")
    mime = "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}"
    with open(image_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{encoded}"


def generate_video(prompt: str, output_path: str, image_path: str = None) -> bool:
    print(f"Generating video...\n  Prompt: {prompt[:80]}...\n")
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }

    if image_path:
        print("Encoding image...")
        image_uri = image_to_data_uri(image_path)
        endpoint = "https://api.ltx.video/v1/image-to-video"
        payload = {
            "image_uri": image_uri,
            "prompt": prompt,
            "model": "ltx-2-3-pro",
            "duration": 6,
            "resolution": "1080x1920",
        }
    else:
        endpoint = "https://api.ltx.video/v1/text-to-video"
        payload = {
            "prompt": prompt,
            "model": "ltx-2-3-pro",
            "duration": 6,
            "resolution": "1080x1920",
        }

    response = requests.post(endpoint, headers=headers, json=payload, timeout=300)
    if response.status_code != 200:
        print(f"Error {response.status_code}: {response.text}")
        return False
    with open(output_path, "wb") as f:
        f.write(response.content)
    print(f"Raw video saved: {output_path}")
    return True


def add_text_overlay(input_path: str, output_path: str, text: str, reference: str = None):
    print("Adding text overlay...")
    ffmpeg_bin = "/opt/homebrew/bin/ffmpeg"
    if not os.path.exists(ffmpeg_bin):
        ffmpeg_bin = "ffmpeg"

    if subprocess.run([ffmpeg_bin, "-version"], capture_output=True).returncode != 0:
        print("WARNING: ffmpeg not found. Skipping text overlay.")
        os.rename(input_path, output_path)
        return

    escaped_text = text.replace("'", "\u2019").replace(":", "\\:")

    if reference:
        escaped_ref = reference.replace("'", "\u2019").replace(":", "\\:")
        vf = (
            f"drawtext=text='{escaped_text}'"
            f":fontsize=60:fontcolor=white:x=(w-text_w)/2:y=h*0.72"
            f":shadowcolor=black:shadowx=2:shadowy=2:font='Helvetica-Bold',"
            f"drawtext=text='\u2014 {escaped_ref}'"
            f":fontsize=36:fontcolor=white@0.85:x=(w-text_w)/2:y=h*0.72+80"
            f":shadowcolor=black:shadowx=1:shadowy=1:font='Helvetica'"
        )
    else:
        # Long quote — wrap into multiple lines using newline
        words = text.split()
        lines = []
        current = []
        for word in words:
            current.append(word)
            if len(" ".join(current)) > 28:
                lines.append(" ".join(current[:-1]))
                current = [word]
        lines.append(" ".join(current))

        vf_parts = []
        for i, line in enumerate(lines):
            escaped_line = line.replace("'", "\u2019").replace(":", "\\:")
            y_pos = f"h*0.65+{i * 70}"
            vf_parts.append(
                f"drawtext=text='{escaped_line}'"
                f":fontsize=52:fontcolor=cream:x=(w-text_w)/2:y={y_pos}"
                f":shadowcolor=black:shadowx=3:shadowy=3:font='Georgia'"
            )
        vf = ",".join(vf_parts)

    ffmpeg_cmd = [
        ffmpeg_bin, "-y", "-i", input_path,
        "-vf", vf,
        "-codec:a", "copy",
        output_path,
    ]
    result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg error: {result.stderr[-500:]}")
        os.rename(input_path, output_path)
    else:
        os.remove(input_path)
        print(f"Final video ready: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate a daily faith video")
    parser.add_argument("--prompt", type=str, help="Custom video prompt")
    parser.add_argument("--text", type=str, help="Text to overlay on the video")
    parser.add_argument("--image", type=str, help="Path to an image for image-to-video")
    parser.add_argument("--reference", type=str, help="Bible reference (e.g. John 3:16)")
    args = parser.parse_args()

    if not API_KEY:
        print("ERROR: LTX_API_KEY not set. Add it to your .env file.")
        sys.exit(1)

    today = date.today().strftime("%Y-%m-%d")
    raw_path = os.path.join(OUTPUT_DIR, f"{today}_raw.mp4")
    final_path = os.path.join(OUTPUT_DIR, f"{today}_final.mp4")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if args.prompt:
        prompt = args.prompt
        overlay_text = args.text or ""
        reference = args.reference or ""
        image_path = args.image
    else:
        verse = pick_verse()
        prompt = verse["prompt"]
        overlay_text = verse["text"]
        reference = verse["reference"]
        image_path = None

    success = generate_video(prompt, raw_path, image_path)
    if not success:
        sys.exit(1)

    if overlay_text:
        add_text_overlay(raw_path, final_path, overlay_text, reference or None)
    else:
        os.rename(raw_path, final_path)

    print(f"\nDone! Video saved to: {final_path}")


if __name__ == "__main__":
    main()
