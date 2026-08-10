#!/usr/bin/env python3
"""Render a markdown itinerary to a clean, printable HTML page for Chromium's PDF export."""
import re
import subprocess
import sys
from pathlib import Path

import markdown

CSS = """
@page { size: Letter; margin: 0.55in 0.6in 0.6in 0.6in; }

* { box-sizing: border-box; }

body {
  font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif;
  font-size: 9.25pt;
  line-height: 1.38;
  color: #1a1a1a;
  margin: 0;
}

h1 {
  font-size: 19pt;
  line-height: 1.15;
  margin: 0 0 2pt;
  color: #14532d;
  letter-spacing: -0.2pt;
}

h2 {
  font-size: 13pt;
  margin: 13pt 0 5pt;
  padding: 5pt 0 4pt;
  border-top: 1.6pt solid #14532d;
  border-bottom: 0.5pt solid #cfd8d2;
  color: #14532d;
  break-after: avoid;
}

h3 {
  font-size: 10.6pt;
  margin: 9pt 0 3pt;
  padding: 3pt 6pt;
  background: #eef3ef;
  border-left: 3pt solid #2f6b45;
  color: #14532d;
  break-after: avoid;
  break-inside: avoid;
}

p { margin: 3.5pt 0; orphans: 2; widows: 2; }

ul, ol { margin: 3.5pt 0 5pt; padding-left: 15pt; }
li { margin: 1.8pt 0; }

strong { color: #0d2b1a; }

hr {
  border: 0;
  border-top: 0.5pt solid #d6ded8;
  margin: 7pt 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 6pt 0 8pt;
  font-size: 8.7pt;
  break-inside: avoid;
}
th {
  background: #14532d;
  color: #fff;
  text-align: left;
  padding: 4pt 6pt;
  font-weight: 600;
}
td {
  padding: 3.4pt 6pt;
  border-bottom: 0.5pt solid #dde4df;
  vertical-align: top;
}
tbody tr:nth-child(even) { background: #f5f8f6; }

blockquote {
  margin: 8pt 0;
  padding: 6pt 9pt;
  background: #fdf6e3;
  border-left: 3pt solid #c99700;
  break-inside: avoid;
}
blockquote p { margin: 2.5pt 0; }
blockquote h3 {
  background: none;
  border: 0;
  padding: 0;
  margin: 0 0 4pt;
  font-size: 10pt;
  color: #7a5c00;
}
blockquote ul { margin: 3pt 0; }

code {
  font-family: "DejaVu Sans Mono", "Liberation Mono", monospace;
  font-size: 8.4pt;
  background: #eef1ef;
  padding: 0.5pt 2.5pt;
  border-radius: 2pt;
}

a { color: #14532d; text-decoration: none; }

/* Schedule entries: keep a time heading with the text under it */
.entry { break-inside: avoid; }

.subtitle {
  font-size: 9.2pt;
  color: #4a5a51;
  margin: 0 0 9pt;
  padding-bottom: 7pt;
  border-bottom: 1.6pt solid #14532d;
}

/* Sources block at the end -- small and unobtrusive */
.sources { font-size: 7.6pt; color: #5c6b63; line-height: 1.35; }
.sources a { color: #5c6b63; }
"""


def normalize_lists(text: str) -> str:
    """Python-markdown needs a blank line before a list that follows a paragraph.

    The itinerary writes `**Heading:**` immediately above its bullets, which
    otherwise get swallowed into the preceding paragraph.
    """
    out = []
    prev = ""
    for line in text.split("\n"):
        starts_item = re.match(r"^\s*([-*+]|\d+\.)\s+", line)
        prev_is_item = re.match(r"^\s*([-*+]|\d+\.)\s+", prev)
        if starts_item and prev.strip() and not prev_is_item:
            out.append("")
        out.append(line)
        prev = line
    return "\n".join(out)


def build(md_path: Path, out_pdf: Path) -> None:
    text = normalize_lists(md_path.read_text())

    html_body = markdown.markdown(
        text,
        extensions=["tables", "sane_lists", "attr_list"],
    )

    # Keep each timed schedule entry from splitting across a page break.
    html_body = re.sub(
        r"(<h3>.*?</h3>)((?:\s*<(?:p|ul|ol|blockquote|table)[\s\S]*?</(?:p|ul|ol|blockquote|table)>)*)",
        r'<div class="entry">\1\2</div>',
        html_body,
    )

    # Shrink the trailing sources paragraph.
    html_body = re.sub(
        r"(<p><strong>Sources:</strong>[\s\S]*?</p>)",
        r'<div class="sources">\1</div>',
        html_body,
    )

    html = f"""<!doctype html>
<html><head><meta charset="utf-8">
<title>{md_path.stem}</title>
<style>{CSS}</style>
</head><body>
{html_body}
</body></html>"""

    tmp_html = out_pdf.with_suffix(".html")
    tmp_html.write_text(html)

    subprocess.run(
        [
            "/opt/pw-browsers/chromium",
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--no-pdf-header-footer",
            f"--print-to-pdf={out_pdf}",
            tmp_html.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    tmp_html.unlink()


if __name__ == "__main__":
    build(Path(sys.argv[1]), Path(sys.argv[2]))
