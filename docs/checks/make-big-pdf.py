"""Create a 200-page text PDF for the W4.2 / W1.3 checks (status changes and indexing time).

    cd backend && uv run python ../docs/checks/make-big-pdf.py big-200.pdf
Then upload big-200.pdf in the library and watch Wartet, Wird gelesen, Wird indexiert, Bereit.
"""

import sys

import pymupdf

SENTENCES = [
    "Die Anlage liefert im Jahresmittel rund vier Megawattstunden pro Tag und wird regelmäßig gewartet.",
    "Der Speicher puffert Lastspitzen und senkt dadurch die Kosten für den Bezug aus dem öffentlichen Netz.",
    "Nach Abschnitt {n} der Betriebsanleitung ist vor jeder Wartung die Spannungsfreiheit herzustellen.",
    "Die Vergütung richtet sich nach dem vereinbarten Tarif und wird quartalsweise abgerechnet.",
    "Bei Störungen ist zuerst die Anzeige am Wechselrichter zu prüfen und der Fehlercode zu notieren.",
]

out = sys.argv[1] if len(sys.argv) > 1 else "big-200.pdf"
doc = pymupdf.open()
for page_no in range(1, 201):
    page = doc.new_page()
    heading = f"Kapitel {(page_no - 1) // 10 + 1}, Seite {page_no}"
    page.insert_text((60, 60), heading, fontsize=16)
    body = " ".join(SENTENCES[(page_no + i) % len(SENTENCES)].replace("{n}", str(page_no)) for i in range(18))
    page.insert_textbox(pymupdf.Rect(60, 90, 540, 780), body, fontsize=10.5)
doc.set_metadata({"title": "Betriebshandbuch (200 Seiten)"})
doc.save(out)
print(f"{out}: {doc.page_count} pages")
