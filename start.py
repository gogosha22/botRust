from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / ".runtime"
NODE_MIN_MAJOR = 20


def find_node() -> Path | None:
    candidates: list[Path] = []
    from_path = shutil.which("node")
    if from_path:
        candidates.append(Path(from_path))

    if os.name == "nt":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        candidates.extend(
            [
                Path(program_files) / "nodejs" / "node.exe",
                Path(program_files_x86) / "nodejs" / "node.exe",
                Path(local_app_data) / "Programs" / "nodejs" / "node.exe",
            ]
        )

    candidates.extend(RUNTIME.glob("node-*/node.exe"))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def download_portable_node() -> Path | None:
    if os.name != "nt":
        return None

    print("Node.js was not found. Downloading a portable Node.js runtime...")
    try:
        with urllib.request.urlopen("https://nodejs.org/dist/index.json", timeout=30) as response:
            versions = json.loads(response.read().decode("utf-8"))

        compatible = []
        for item in versions:
            version = item.get("version", "")
            major_text = version.lstrip("v").split(".", 1)[0]
            if (
                major_text.isdigit()
                and int(major_text) >= NODE_MIN_MAJOR
                and "win-x64-zip" in item.get("files", [])
            ):
                compatible.append(item)
        selected_item = next((item for item in compatible if item.get("lts")), None)
        selected = selected_item.get("version") if selected_item else (
            compatible[0].get("version") if compatible else None
        )
        if not selected:
            raise RuntimeError("No compatible Windows Node.js build was found.")

        archive = RUNTIME / f"node-{selected}-win-x64.zip"
        RUNTIME.mkdir(parents=True, exist_ok=True)
        url = f"https://nodejs.org/dist/{selected}/node-{selected}-win-x64.zip"
        print(f"Downloading {selected}...")
        with urllib.request.urlopen(url, timeout=120) as response, archive.open("wb") as output:
            shutil.copyfileobj(response, output)

        with zipfile.ZipFile(archive) as package:
            package.extractall(RUNTIME)
        archive.unlink(missing_ok=True)
        node = RUNTIME / f"node-{selected}-win-x64" / "node.exe"
        if not node.exists():
            raise RuntimeError("Node.js archive did not contain node.exe.")
        return node
    except Exception as error:
        print(f"Could not download Node.js automatically: {error}")
        print("Install Node.js 20 LTS manually from https://nodejs.org/ and run this file again.")
        return None


def npm_for(node: Path) -> Path | str:
    if os.name == "nt":
        candidate = node.parent / "npm.cmd"
        if candidate.exists():
            return candidate
    from_path = shutil.which("npm")
    if from_path:
        return from_path
    candidate = node.parent / "npm"
    return candidate if candidate.exists() else "npm"


def install_dependencies(npm: Path | str) -> int:
    base_command = [str(npm), "install", "--no-audit", "--no-fund"]
    registries = [
        ("https://registry.npmjs.org/", "official npm registry"),
        ("https://registry.npmmirror.com/", "fallback npm mirror"),
    ]
    for registry, label in registries:
        print(f"Installing dependencies from {label}...")
        command = [*base_command, "--registry", registry]
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode == 0:
            return 0
        if registry != registries[-1][0]:
            print("Official npm registry failed. Retrying with a fallback mirror...")
    return result.returncode


def prepare_env() -> bool:
    env_file = ROOT / ".env"
    example = ROOT / ".env.example"
    if not env_file.exists():
        shutil.copyfile(example, env_file)
        print("Created .env from .env.example.")
        print("Put your BOT_TOKEN into .env and run this file again.")
        if os.name == "nt":
            subprocess.Popen(["notepad.exe", str(env_file)])
        return False

    contents = env_file.read_text(encoding="utf-8", errors="ignore")
    if "replace_me" in contents:
        print("BOT_TOKEN is still set to replace_me in .env.")
        if os.name == "nt":
            subprocess.Popen(["notepad.exe", str(env_file)])
        return False
    return True


def main() -> int:
    if not prepare_env():
        return 0

    node = find_node() or download_portable_node()
    if not node:
        return 1

    npm = npm_for(node)
    node_modules = ROOT / "node_modules" / "grammy"
    if not node_modules.exists():
        print("Installing dependencies. This can take a few minutes...")
        result_code = install_dependencies(npm)
        if result_code != 0:
            return result_code

    print("Starting Rust Telegram Monitor. Press Ctrl+C to stop.")
    return subprocess.call([str(npm), "start"], cwd=ROOT)


if __name__ == "__main__":
    raise SystemExit(main())