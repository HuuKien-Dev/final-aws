"""Publish corresponding source without secrets, builds, caches or dependencies."""
import os
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
out = root / "frontend/public/source.tar.gz"
blocked = {
    "node_modules", ".next", ".venv", ".tools", ".git", "__pycache__",
    ".pytest_cache", "assets", "releases", "test-results", ".aws", ".codex", ".agents",
}
with tarfile.open(out, "w:gz") as archive:
    for directory, directories, files in os.walk(root, followlinks=False):
        base = Path(directory)
        directories[:] = sorted(d for d in directories
                                if d not in blocked and not (base / d).is_symlink())
        for name in sorted(files):
            path = base / name
            if path == out or path.is_symlink() or not path.is_file():
                continue
            if name.endswith((".tsbuildinfo", ".pyc")):
                continue
            if name.startswith(".env") and name != ".env.example":
                continue
            archive.add(path, arcname="english-learning-app/" + str(path.relative_to(root)), recursive=False)
print(out)
