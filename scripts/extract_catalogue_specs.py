"""Catalogue sheet PNGs -> data/catalogue-specs.{json,csv}

The printed catalogue sheets (PICTURE | DESCRIPTION | CODE NO. | RETAIL) carry a
description per product. This OCRs every sheet with RapidOCR, splits each sheet
into rows by its alternating row-background bands, assigns each text box to the
nearest column header, cleans the OCR text, and attaches the best-matching sheet
description to every corpus record as its `spec`.

The masterlist is final. Sheets are matched to masterlist records by name, not
by the code printed on the sheet, and a sheet description that drops or
contradicts a word of the masterlist name is replaced by the name. Sheet prices
are read only to confirm a fuzzy code match; they are never written out.

The sheets are private source material and are not in the repo, so pass their
folders on the command line. RapidOCR is not a project dependency; run this from
a venv with `pip install rapidocr-onnxruntime pillow`.

    python scripts/extract_catalogue_specs.py <sheet-folder>... --cache ocr_raw.json

OCR results are cached by file path, so re-running only re-parses.
"""
import argparse
import csv
import difflib
import hashlib
import json
import pathlib
import re
from collections import Counter

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "corpus" / "products.json"
OUT_JSON = ROOT / "data" / "catalogue-specs.json"
OUT_CSV = ROOT / "data" / "catalogue-specs.csv"

HEADERS = {"PICTURE": "picture", "DESCRIPTION": "description",
           "CODE": "code", "RETAIL": "price"}


# --- OCR -------------------------------------------------------------------

def ocr_all(folders, cache_path):
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    seen = {v["md5"] for v in cache.values()}
    files = sorted(p for f in folders for p in pathlib.Path(f).rglob("*.png"))
    engine = None
    for p in files:
        if str(p) in cache:
            continue
        md5 = hashlib.md5(p.read_bytes()).hexdigest()
        if md5 in seen:  # zips duplicate most loose sheets
            continue
        seen.add(md5)
        if engine is None:
            from rapidocr_onnxruntime import RapidOCR
            engine = RapidOCR()
        res, _ = engine(str(p))
        boxes = [{"x0": min(b[0] for b in box), "x1": max(b[0] for b in box),
                  "y0": min(b[1] for b in box), "y1": max(b[1] for b in box),
                  "text": text, "conf": conf} for box, text, conf in (res or [])]
        cache[str(p)] = {"md5": md5, "size": Image.open(p).size, "boxes": boxes}
        cache_path.write_text(json.dumps(cache), encoding="utf-8")
    return cache


# --- Layout ----------------------------------------------------------------

def row_bands(path):
    """Alternating grey/cream table rows, read down a column of pixels at the
    table's right edge where no text sits. Returns [(y0, y1), ...]."""
    im = Image.open(path).convert("RGB")
    w, h = im.size
    x = int(w * 0.976)
    runs, prev = [], None
    for y in range(h):
        c = tuple(v // 8 * 8 for v in im.getpixel((x, y)))
        if c != prev:
            runs.append([y, c])
            prev = c
    runs = [(y, c, (runs[i + 1][0] if i + 1 < len(runs) else h) - y)
            for i, (y, c) in enumerate(runs)]
    # Table rows are the near-neutral light bands; the page frame is saturated
    # yellow and the header band is tan.
    def is_row(c):
        return min(c) >= 200 and max(c) - min(c) <= 24
    return [(y, y + n) for y, c, n in runs if n > 120 and is_row(c)]


def header_columns(boxes, h):
    cols = {}
    for b in boxes:
        if b["y1"] > h * 0.2:
            continue
        word = b["text"].upper().replace(".", "").split()
        if word and word[0] in HEADERS:
            cols[HEADERS[word[0]]] = ((b["x0"] + b["x1"]) / 2, b["y1"])
    return cols


def parse_sheet(path, rec):
    boxes, (w, h) = rec["boxes"], rec["size"]
    cols = header_columns(boxes, h)
    if not {"description", "code"} <= cols.keys():
        return None, "no header"
    header_bottom = max(y for _, y in cols.values())
    bands = [b for b in row_bands(path) if b[0] >= header_bottom - 10]
    if not bands:
        return None, "no row bands"
    rows = []
    for y0, y1 in bands:
        cells = {k: [] for k in cols}
        for b in boxes:
            cy = (b["y0"] + b["y1"]) / 2
            if not (y0 <= cy < y1):
                continue
            cx = (b["x0"] + b["x1"]) / 2
            col = min(cols, key=lambda k: abs(cols[k][0] - cx))
            cells[col].append(b)
        for k in cells:
            cells[k].sort(key=lambda b: (round(b["y0"] / 25), b["x0"]))
        if not cells["code"] and not cells["description"]:
            continue
        rows.append({
            "description_raw": [b["text"] for b in cells["description"]],
            "code_raw": [b["text"] for b in cells["code"]],
            "price_raw": [b["text"] for b in cells.get("price", [])],
        })
    return rows, None


# --- Cleaning --------------------------------------------------------------

SHORT_WORDS = {"W/", "OF", "TO", "IN", "ON", "OR", "BY", "AND", "FOR", "WITH", "PCS", "SET", "HC"}
DIMENSION = re.compile(r"^(?:[WDHL]?\d+(?:\.\d+)?(?:CM|MM|M|FT|LBS|LB|L|G|KG|W|V|PCS|OZ)?X?)+$")
MODEL = re.compile(r"^[A-Z]\d{1,2}$")  # K9, A3, F3
CODE_RE = re.compile(r"\b[A-Z]{3}-\d{3}-[A-Z0-9/-]+")


def words_of(text):
    return re.findall(r"[A-Z0-9]+", text.upper())


def segment(word, vocab):
    """Split a run-together OCR token into known pieces, fewest pieces first:
    TABLEWIMOBILE -> TABLE W/ MOBILE. None if no full split exists."""
    best = {0: []}
    for end in range(1, len(word) + 1):
        for start in range(max(0, end - 20), end):
            if start not in best:
                continue
            piece = word[start:end]
            if piece in ("WI", "WL"):
                piece = "W/"
            ok = (piece in SHORT_WORDS or (len(piece) >= 3 and piece in vocab)
                  or bool(DIMENSION.match(piece) or MODEL.match(piece)))
            if ok and (end not in best or len(best[start]) + 1 < len(best[end])):
                best[end] = best[start] + [piece]
    parts = best.get(len(word))
    return parts if parts and len(parts) > 1 else None


def build_vocab(products, ocr_texts):
    """Words the corrector may produce: every word in a corpus name, plus any
    alphabetic word the OCR read the same way on three or more rows, unless
    that word is itself a run-together of corpus words (NEWITEM)."""
    vocab = {w for p in products for w in words_of(p["name"])}
    ocr = Counter(w for t in ocr_texts for w in words_of(t))
    for w, n in ocr.items():
        if n >= 3 and w.isalpha() and not segment(w, vocab):
            vocab.add(w)
    return vocab


def fix_word(word, vocab):
    """Correct one OCR'd alphanumeric run against the vocabulary."""
    if word in vocab or word.isdigit() or len(word) < 3 or DIMENSION.match(word):
        return word
    # Digit/letter confusion inside a word: GL0VE -> GLOVE
    swapped = word.translate(str.maketrans("015", "OIS"))
    if swapped in vocab:
        return swapped
    # Slash read as I: BLACKICHROME -> BLACK/CHROME, WISLEEVE -> W/SLEEVE
    for i, ch in enumerate(word):
        if ch == "I" and 0 < i < len(word) - 1:
            a, b = word[:i], word[i + 1:]
            if (a in vocab or a == "W") and b in vocab:
                return f"{a}/{b}"
    # Lost spaces: WELDINGAPRON -> WELDING APRON, WORKSTATION4 -> WORKSTATION 4
    parts = segment(word, vocab)
    if parts:
        return " ".join(parts)
    # Trailing slash read as I: DETECTORI -> DETECTOR/
    if word.endswith("I") and word[:-1] in vocab:
        return word[:-1] + "/"
    return word


def known(word, vocab):
    return (word in vocab or word in SHORT_WORDS or word.isdigit()
            or bool(DIMENSION.match(word) or MODEL.match(word)))


def merge_line_breaks(text, vocab):
    """Rejoin a word the sheet wrapped across lines: Y ELLOW -> YELLOW,
    75C M -> 75CM, POLYCARBO NATENOZZLE -> POLYCARBONATE NOZZLE."""
    tokens = text.split()
    i = 0
    while i < len(tokens) - 1:
        left = re.match(r"^(.*?)([A-Z0-9]+)$", tokens[i])
        right = re.match(r"^([A-Z0-9]+)(.*)$", tokens[i + 1])
        if left and right:
            a, b = left.group(2), right.group(1)
            # L320XW120XH7 5CM, 1 5LBS: both halves parse, but the whole is one size
            split_size = (("X" in a and a[-1].isdigit()) or a.isdigit()) and b[0].isdigit() \
                and bool(DIMENSION.match(a + b))
            if split_size or not (known(a, vocab) and known(b, vocab)):
                ab = a + b
                parts = [ab] if known(ab, vocab) else segment(ab, vocab)
                if parts:
                    joined = left.group(1) + " ".join(parts) + right.group(2)
                    tokens[i:i + 2] = joined.split()
                    continue
        i += 1
    return " ".join(tokens)


def clean_description(lines, vocab=frozenset()):
    text = " ".join(l.strip() for l in lines).upper()
    # The OCR can't encode × or °: W90×D45 between sizes, 500°C otherwise
    text = re.sub(r"(?<=\d)\N{REPLACEMENT CHARACTER}(?=[WDHL]?\d)", "X", text)
    text = text.replace("\N{REPLACEMENT CHARACTER}", "°").replace("×", "X")
    text = merge_line_breaks(text, vocab)
    text = re.sub(r"[A-Z0-9]+", lambda m: fix_word(m.group(), vocab), text)
    text = re.sub(r"(\d)\s*IBS\b", r"\1 LBS", text)          # 40-90 IBS
    text = re.sub(r"\b(\d{1,2})0Z\b", r"\1OZ", text)          # 120Z gloves -> 12OZ
    text = re.sub(r"\bW[IL]\s+(?=[A-Z])", "W/", text)        # WI MOBILE, WL HANGING
    text = re.sub(r"\b([A-Z0-9]+?)W/",                        # TABLEW/MOBILE, 220VW/
                  lambda m: f"{m.group(1)} W/" if known(m.group(1), vocab) else m.group(), text)
    text = text.replace("/)", ")")
    text = re.sub(r"(\w)- (?=\w)", r"\1-", text)              # MULTI- FUNCTIONAL (line wrap)
    text = re.sub(r'(\d")(?=[A-Z])', r"\1 ", text)            # 13"MULTI
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = re.sub(r"(\S)\(", r"\1 (", text)
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"\s+([,.])", r"\1", text)
    text = re.sub(r",(?=\S)", ", ", text)
    text = text.strip()
    if text.count("(") > text.count(")"):
        text += ")"
    return text


def clean_code(lines):
    code = "".join(l.strip() for l in lines).upper()
    code = re.sub(r"\s+", "", code)
    return code.strip("-.")


def clean_price(lines):
    digits = re.sub(r"[^\d]", "", "".join(lines))
    return int(digits) if digits else None


def similarity(a, b):
    norm = lambda s: re.sub(r"[^A-Z0-9]", "", s.upper())
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


def containment(name, spec):
    """Share of the corpus name's words that appear in the sheet text. A spec
    that adds colours or sizes still scores 1; another product scores low."""
    name_words = set(words_of(name))
    spec_text = re.sub(r"[^A-Z0-9]", "", spec.upper())
    spec_words = words_of(spec)
    def found(w):  # tolerate corpus typos: STEPPLING vs STEPPING
        return w in spec_text or any(similarity(w, s) >= 0.85 for s in spec_words)
    return sum(map(found, name_words)) / max(len(name_words), 1)


def family(code):
    """Department and series: TRA-001-07338-B -> TRA-001."""
    return code[:7]


# --- Main ------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folders", nargs="+")
    ap.add_argument("--cache", required=True, type=pathlib.Path)
    args = ap.parse_args()

    cache = ocr_all(args.folders, args.cache)
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in products}
    by_code = {}
    for p in products:
        by_code.setdefault(p["code"], []).append(p)
    codes = list(by_code)

    parsed, problems = [], []
    for path, rec in sorted(cache.items()):
        rows, err = parse_sheet(path, rec)
        sheet = pathlib.Path(path)
        sheet_label = f"{sheet.parent.name}/{sheet.name}"
        if err:
            problems.append({"sheet": sheet_label, "problem": err})
            continue
        parsed += [(sheet_label, r) for r in rows]
    vocab = build_vocab(products, [" ".join(r["description_raw"]) for _, r in parsed])

    # 1. Clean every sheet row and resolve its code to corpus codes.
    sheet_rows = []
    for sheet_label, r in parsed:
        spec = clean_description(r["description_raw"], vocab)
        code = clean_code(r["code_raw"])
        if not code:  # code printed inside the description cell
            m = CODE_RE.search(spec)
            if m:
                code = m.group()
                spec = re.sub(r"\s+", " ", spec.replace(code, " ")).strip()
        price = clean_price(r["price_raw"])
        if code in by_code:
            targets = [code]
        elif "/" in code:  # JAN-001-520-R/G: one row for two colour variants
            stem, _, tail = code.rpartition("-")
            targets = [f"{stem}-{v}" for v in tail.split("/") if f"{stem}-{v}" in by_code]
        else:
            # Fuzzy only when the price agrees too: 541 -> 54I is an OCR slip,
            # 67-6667 -> 68-6668 is a different product.
            near = difflib.get_close_matches(code, codes, n=5, cutoff=0.8)
            near = [c for c in near if any(p["price_php"] == price for p in by_code[c])]
            targets = sorted(near, key=lambda c: -similarity(spec, by_code[c][0]["name"]))[:1]
        sheet_rows.append({"spec": spec, "ocr_code": code, "price": price,
                           "targets": targets, "sheet": sheet_label, "used": False})

    # 2. Per corpus record, take the sheet row that best matches its name and
    #    price. Records sharing a code take distinct rows where they differ.
    candidates = {}
    for i, s in enumerate(sheet_rows):
        for c in s["targets"]:
            candidates.setdefault(c, []).append(i)

    def score(rec, s):
        return similarity(s["spec"], rec["name"]) + (0.3 if s["price"] == rec["price_php"] else 0)

    chosen = {}
    for code, recs in by_code.items():
        pairs = sorted(((score(rec, sheet_rows[i]), rec["id"], i)
                        for rec in recs for i in candidates.get(code, [])), reverse=True)
        taken_specs = set()
        for _, rid, i in pairs:
            if rid in chosen or sheet_rows[i]["spec"] in taken_specs:
                continue
            chosen[rid] = i
            taken_specs.add(sheet_rows[i]["spec"])
        for _, rid, i in pairs:  # identical duplicates share the one reading
            chosen.setdefault(rid, i)
    for i in chosen.values():
        sheet_rows[i]["used"] = True

    # 3. Records with no row, or whose row describes another product, take a
    #    row printed under a sibling code instead (the sheets swap JAN-001-22B
    #    with JAN-001-23). The row must carry the record's price and name, and
    #    be unclaimed or held by a record it doesn't describe, so a colour
    #    variant missing from the sheets never borrows another colour's row.
    #    Failing that the record gets no spec rather than another product's.
    def fits(p, i):
        return containment(p["name"], sheet_rows[i]["spec"]) >= 0.6
    misfit_rows = {i for rid, i in chosen.items() if not fits(by_id[rid], i)}
    mismatched = []
    for p in products:
        i = chosen.get(p["id"])
        if i is not None and fits(p, i):
            continue
        siblings = [j for j, s in enumerate(sheet_rows)
                    if (not s["used"] or j in misfit_rows)
                    and family(s["ocr_code"]) == family(p["code"]) and s["price"] == p["price_php"]
                    and containment(p["name"], s["spec"]) >= 0.8]
        siblings.sort(key=lambda j: -similarity(sheet_rows[j]["spec"], p["name"]))
        if siblings:
            chosen[p["id"]] = siblings[0]
            sheet_rows[siblings[0]]["used"] = True
        elif i is not None:
            mismatched.append({"code": p["code"], "name": p["name"],
                               "sheet_text": sheet_rows[i]["spec"], "sheet": sheet_rows[i]["sheet"]})
            del chosen[p["id"]]

    # 4. One output record per corpus product. The masterlist is final: a
    #    sheet description is used only if it keeps every word of the
    #    masterlist name (it may add colours or sizes). Otherwise, or with no
    #    sheet row at all, the spec is the masterlist name itself.
    out, contradicted = [], []
    for p in products:
        i = chosen.get(p["id"])
        s = sheet_rows[i] if i is not None else None
        readings = {sheet_rows[j]["spec"] for j in candidates.get(p["code"], [])}
        flags = []
        if s is None:
            on_sheet = any(m["code"] == p["code"] and m["name"] == p["name"] for m in mismatched)
            flags.append("sheet_shows_other_product" if on_sheet else "not_on_sheets")
        elif containment(p["name"], s["spec"]) < 1:
            flags.append("sheet_contradicts_masterlist")
            contradicted.append({"code": p["code"], "name": p["name"],
                                 "sheet_text": s["spec"], "sheet": s["sheet"]})
            s = None
        elif s["ocr_code"] != p["code"]:
            flags.append("code_corrected")
        if any(1 - similarity(a, b) > 0.25 for a in readings for b in readings):
            flags.append("sheets_disagree")
        out.append({
            "id": p["id"],
            "code": p["code"],
            "name": p["name"],
            "spec": s["spec"] if s else p["name"],
            "spec_source": "sheet" if s else "masterlist",
            "price_php": p["price_php"],  # masterlist only; sheet prices are not trusted
            "flags": flags,
            "sheet": s["sheet"] if s else None,
        })

    assigned_specs = {sheet_rows[i]["spec"] for i in chosen.values()}
    not_in_corpus = [{k: s[k] for k in ("ocr_code", "spec", "sheet")}
                     for s in sheet_rows if not s["targets"] and not s["used"]
                     and s["spec"] not in assigned_specs]

    OUT_JSON.write_text(json.dumps({"products": out, "sheet_rows_not_in_corpus": not_in_corpus,
                                    "sheet_shows_other_product": mismatched,
                                    "sheet_contradicts_masterlist": contradicted,
                                    "sheet_problems": problems},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=list(out[0]))
        wr.writeheader()
        wr.writerows({**r, "flags": ";".join(r["flags"])} for r in out)

    print(f"sheets: {len(cache)}  sheet rows: {len(sheet_rows)}  products: {len(out)}")
    print(Counter(r["spec_source"] for r in out))
    print(Counter(f for r in out for f in r["flags"]))
    print(f"sheet rows not in corpus: {len(not_in_corpus)}")


if __name__ == "__main__":
    main()
