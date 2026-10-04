"""Build the self-contained CrazyGames upload archive."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "release" / "castlelands-crazygames.zip"
FILES = [ROOT / "index.html", ROOT / "style.css"]
FILES += sorted((ROOT / "js").glob("*.js"))
FILES += sorted((ROOT / "fonts").iterdir())

with ZipFile(DESTINATION, "w", ZIP_DEFLATED, compresslevel=9) as archive:
    for path in FILES:
        if path.is_file():
            archive.write(path, path.relative_to(ROOT).as_posix())

with ZipFile(DESTINATION) as archive:
    assert archive.testzip() is None
    assert all(archive.read(path.relative_to(ROOT).as_posix()) == path.read_bytes()
               for path in FILES if path.is_file())

print(f"{DESTINATION}: {len(FILES)} files, {DESTINATION.stat().st_size} bytes")
