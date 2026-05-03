"""
Edit the three lines below, then run:  python3 today.py
"""

IMAGE = None

PROMPT = (
    "A grand white colonial mansion with a red roof and brick chimney, completely still and frozen. "
    "Only the clouds above slowly drift from right to left across a deep moody blue sky. "
    "Uncanny stillness. Retro Super 8 film grain, warm golden-amber light, cinematic locked-off shot."
)

TEXT = "don't let what you see cause you to doubt what God said"

# ── don't edit below this line ──────────────────────────────────────────────

import os, sys, shutil
sys.argv = ["generate_video.py", "--prompt", PROMPT, "--text", TEXT]

# copy image to local folder to avoid macOS permission issues
if IMAGE:
    local_image = os.path.join(os.path.dirname(__file__), "input_image.jpg")
    shutil.copy2(IMAGE, local_image)
    sys.argv += ["--image", local_image]

exec(open(os.path.join(os.path.dirname(__file__), "generate_video.py")).read())
