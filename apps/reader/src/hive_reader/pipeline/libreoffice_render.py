from __future__ import annotations

import logging
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from hive_reader.config import settings

logger = logging.getLogger("hive_reader")

_VERSION_RE = re.compile(r"LibreOffice\s+([\d.]+)", re.IGNORECASE)
_cached_version: str | None = None


class LibreOfficeRenderError(Exception):
    pass


def _console_binary(exe: str) -> str:
    """On Windows, ``soffice.com`` is the console entrypoint (version + headless)."""
    path = Path(exe)
    if path.name.lower() == "soffice.exe":
        console = path.with_name("soffice.com")
        if console.is_file():
            return str(console)
    return exe


def resolve_libreoffice_binary() -> str:
    configured = settings.libreoffice_binary.strip()
    if configured:
        path = Path(configured)
        if path.is_file():
            return str(path)
        resolved = shutil.which(configured)
        if resolved:
            return resolved
        raise LibreOfficeRenderError("Configured LibreOffice binary was not found.")

    for candidate in ("soffice", "libreoffice"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    windows_default = Path(r"C:\Program Files\LibreOffice\program\soffice.exe")
    if windows_default.is_file():
        return str(windows_default)

    raise LibreOfficeRenderError("LibreOffice (soffice) is not installed or not on PATH.")


def libreoffice_version(binary: str | None = None) -> str:
    global _cached_version
    if _cached_version is not None:
        return _cached_version

    exe = _console_binary(binary or resolve_libreoffice_binary())
    try:
        completed = subprocess.run(
            [exe, "--version"],
            capture_output=True,
            text=True,
            timeout=min(settings.libreoffice_render_timeout_seconds, 30.0),
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise LibreOfficeRenderError("Could not determine LibreOffice version.") from exc

    combined = f"{completed.stdout}\n{completed.stderr}"
    match = _VERSION_RE.search(combined)
    if not match:
        raise LibreOfficeRenderError("LibreOffice version string was not recognized.")
    _cached_version = match.group(1)
    return _cached_version


def _assert_version_pin(version: str) -> None:
    pin = settings.libreoffice_version_pin.strip()
    if not pin:
        return
    if not version.startswith(pin):
        raise LibreOfficeRenderError(
            "LibreOffice version does not match the pinned reproducible renderer version."
        )


def render_docx_to_pdf(docx_bytes: bytes) -> bytes:
    resolved = resolve_libreoffice_binary()
    binary = _console_binary(resolved)
    version = libreoffice_version(resolved)
    _assert_version_pin(version)

    with tempfile.TemporaryDirectory(prefix="hive_reader_docx_") as tmp:
        work = Path(tmp)
        profile_dir = work / "lo_profile"
        profile_dir.mkdir(parents=True, exist_ok=True)
        profile_uri = profile_dir.resolve().as_uri()

        input_docx = work / "source.docx"
        input_docx.write_bytes(docx_bytes)

        cmd = [
            binary,
            f"-env:UserInstallation={profile_uri}",
            "--headless",
            "--norestore",
            "--convert-to",
            "pdf",
            "--outdir",
            str(work),
            str(input_docx),
        ]

        try:
            completed = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=settings.libreoffice_render_timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise LibreOfficeRenderError("LibreOffice DOCX render timed out.") from exc
        except OSError as exc:
            raise LibreOfficeRenderError("LibreOffice DOCX render failed to start.") from exc

        if completed.returncode != 0:
            logger.warning(
                "libreoffice_render_failed",
                extra={
                    "returncode": completed.returncode,
                    "stderr_tail": (completed.stderr or "")[-500:],
                },
            )
            raise LibreOfficeRenderError("LibreOffice could not render DOCX to PDF.")

        output_pdf = work / "source.pdf"
        if not output_pdf.is_file():
            raise LibreOfficeRenderError("LibreOffice did not produce a PDF output.")

        return output_pdf.read_bytes()
