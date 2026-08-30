#!/usr/bin/env python3
"""Fill the README contributor markers from the GitHub API.

No third-party Action, no hardcoded names. Bots are omitted. Does not open a
pull request — a protected default branch cannot be pushed to by CI, so the
Contributors workflow only writes on a branch it is allowed to write.

    python3 .github/scripts/fill_contributors.py           # rewrite README.md
    python3 .github/scripts/fill_contributors.py --check   # fail if stale
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

START = "<!-- readme: contributors,bots/- -start -->"
END = "<!-- readme: contributors,bots/- -end -->"
IMAGE = 48
COLUMNS = 6
API = "https://api.github.com"


def _get(url: str, token: str) -> object:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "molecare-fill-contributors",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def list_people(repo: str, token: str) -> list[dict[str, str]]:
    """Contributors in commit order, bots removed."""
    people: list[dict[str, str]] = []
    page = 1
    while True:
        rows = _get(
            f"{API}/repos/{repo}/contributors?per_page=100&anon=false&page={page}",
            token,
        )
        if not isinstance(rows, list) or not rows:
            break
        for row in rows:
            if not isinstance(row, dict):
                continue
            login = str(row.get("login") or "")
            if not login or str(row.get("type") or "") == "Bot" or login.endswith("[bot]"):
                continue
            profile = _get(f"{API}/users/{login}", token)
            name = login
            if isinstance(profile, dict) and profile.get("name"):
                name = str(profile["name"])
            people.append({"login": login, "name": name})
        if len(rows) < 100:
            break
        page += 1
    return people


def render_table(people: list[dict[str, str]]) -> str:
    if not people:
        return ""
    cells = [
        '\t\t\t<td align="center">\n'
        f'\t\t\t\t<a href="https://github.com/{p["login"]}">\n'
        f'\t\t\t\t\t<img src="https://avatars.githubusercontent.com/{p["login"]}?s={IMAGE}" '
        f'width="{IMAGE}" alt="{p["name"]}" />\n'
        "\t\t\t\t\t<br />\n"
        f'\t\t\t\t\t<sub><b>{p["name"]}</b></sub>\n'
        "\t\t\t\t</a>\n"
        "\t\t\t</td>"
        for p in people
    ]
    rows = [
        "\t\t<tr>\n" + "\n".join(cells[i : i + COLUMNS]) + "\n\t\t</tr>"
        for i in range(0, len(cells), COLUMNS)
    ]
    return "<table>\n\t<tbody>\n" + "\n".join(rows) + "\n\t</tbody>\n</table>\n"


def apply_readme(text: str, table: str) -> str:
    if START not in text or END not in text:
        raise SystemExit(f"README.md is missing {START} / {END}")
    before, rest = text.split(START, 1)
    _, after = rest.split(END, 1)
    return f"{before}{START}\n{table}{END}{after}"


def main() -> int:
    readme = Path(__file__).resolve().parents[2] / "README.md"
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not repo:
        raise SystemExit("GITHUB_REPOSITORY is not set")

    current = readme.read_text(encoding="utf-8")
    updated = apply_readme(current, render_table(list_people(repo, os.environ.get("GITHUB_TOKEN", "").strip())))

    if updated == current:
        print("README contributors already current")
        return 0
    if "--check" in sys.argv:
        print("README contributors are stale — run this script and commit")
        return 1

    readme.write_text(updated, encoding="utf-8")
    print("README contributors updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
