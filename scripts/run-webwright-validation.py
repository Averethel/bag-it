#!/usr/bin/env python3
"""Increment 0 Webwright validation wrapper.

This shell smoke keeps the CI entry point stable until the first pinned
Webwright task lands. It starts the built app for local validation and checks
that the workbench route is reachable.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "http://localhost:3000"


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=10) as response:
        return response.read().decode("utf-8", errors="replace")


def wait_for_app(base_url: str) -> str:
    last_error: Exception | None = None
    for _ in range(40):
        try:
            return fetch(base_url)
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            time.sleep(0.25)
    raise RuntimeError(f"App did not become reachable at {base_url}: {last_error}")


def main() -> int:
    base_url = os.environ.get("WEBWRIGHT_BASE_URL", DEFAULT_BASE_URL)
    process: subprocess.Popen[str] | None = None

    if base_url == DEFAULT_BASE_URL:
        process = subprocess.Popen(
            ["corepack", "pnpm", "run", "start"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )

    try:
        html = wait_for_app(base_url)
        required = ["Bag It", "Build steps", "Bags"]
        missing = [text for text in required if text not in html]
        if missing:
            print(f"Missing expected app-shell text: {', '.join(missing)}", file=sys.stderr)
            return 1
        print(f"Webwright validation shell passed for {base_url}")
        return 0
    finally:
        if process is not None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)


if __name__ == "__main__":
    raise SystemExit(main())
