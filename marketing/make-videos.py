"""Create silent CrazyGames previews from actual gameplay stills."""
from pathlib import Path
from PIL import Image
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
STAGES = [0, 2, 5, 8, 12, 16]
FPS = 15
SCENE_FRAMES = [18, 40, 40, 40, 40, 40, 40]  # 17.2 seconds
FADE_FRAMES = 6
ENLARGED = {}


def scenes_for(variant, size):
    w, h = size
    cover_name = "landscape-1920x1080.jpg" if variant == "landscape" else "portrait-800x1200.jpg"
    paths = [ROOT / "covers" / cover_name]
    paths += [ROOT / "stills" / f"{variant}-{stage}.png" for stage in STAGES]
    return [Image.open(path).convert("RGB").resize((w, h), Image.Resampling.LANCZOS) for path in paths]


def frame_for(scene, frame_index, total, cover=False):
    if cover:
        return scene
    w, h = scene.size
    # A subtle camera move keeps the board readable and preserves the full UI.
    scale = 1.025
    key = id(scene)
    if key not in ENLARGED:
        ENLARGED[key] = scene.resize((round(w * scale), round(h * scale)),
                                      Image.Resampling.BICUBIC)
    enlarged = ENLARGED[key]
    max_x, max_y = enlarged.width - w, enlarged.height - h
    progress = frame_index / max(1, total - 1)
    x = round(max_x * progress)
    y = round(max_y * (1 - progress))
    return enlarged.crop((x, y, x + w, y + h))


def build(variant, size, filename):
    ENLARGED.clear()
    images = scenes_for(variant, size)
    out = ROOT / "video" / filename
    out.parent.mkdir(parents=True, exist_ok=True)
    writer = imageio_ffmpeg.write_frames(
        str(out), size, fps=FPS, codec="libx264", pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p", macro_block_size=1,
        output_params=["-crf", "23", "-preset", "veryfast",
                       "-an", "-movflags", "+faststart"],
    )
    writer.send(None)
    try:
        for scene_idx, scene in enumerate(images):
            count = SCENE_FRAMES[scene_idx]
            for i in range(count):
                frame = frame_for(scene, i, count, cover=(scene_idx == 0))
                if scene_idx + 1 < len(images) and i >= count - FADE_FRAMES:
                    alpha = (i - (count - FADE_FRAMES) + 1) / (FADE_FRAMES + 1)
                    next_frame = frame_for(images[scene_idx + 1], 0,
                                           SCENE_FRAMES[scene_idx + 1])
                    frame = Image.blend(frame, next_frame, alpha)
                writer.send(frame.tobytes())
    finally:
        writer.close()
    print(out.name, size, sum(SCENE_FRAMES) / FPS, out.stat().st_size)


if __name__ == "__main__":
    build("landscape", (1920, 1080), "landscape-1920x1080.mp4")
    build("portrait", (1080, 1620), "portrait-1080x1620.mp4")
