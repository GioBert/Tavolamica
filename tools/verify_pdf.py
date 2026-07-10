from pathlib import Path
import sys

from pypdf import PdfReader


def main() -> int:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/browser/menu-print.pdf")
    pages = PdfReader(source).pages
    required = (
        "Progetto indipendente e non ufficiale",
        "2026 Giovanni Bertozzi",
        "GioBert on GitHub",
    )
    print(f"Pagine: {len(pages)}")
    valid = True
    for number, page in enumerate(pages, 1):
        text = page.extract_text() or ""
        checks = {label: label in text for label in required}
        valid = valid and all(checks.values())
        print(f"Pagina {number}: " + ", ".join(f"{label}={found}" for label, found in checks.items()))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
