from pathlib import Path
import sys

import pypdfium2 as pdfium


def main() -> None:
    source = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/browser/menu-print.pdf")
    output = Path(sys.argv[2] if len(sys.argv) > 2 else "artifacts/browser/pdf-pages")
    output.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(source)
    for number, page in enumerate(document, 1):
        target = output / f"page-{number}.png"
        page.render(scale=2).to_pil().convert("RGB").save(target)
        print(target)


if __name__ == "__main__":
    main()
