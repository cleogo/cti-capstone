"""CTI product photos -> public/products/<CODE>.webp, data/product-images.json and
data/product-photos-report.csv

Input: data/raw/photos/<letter>/<product name>/<image>, as supplied by CTI (gitignored).
The folders are named after products, not codes, so this script matches each folder to
masterlist codes by name. The masterlist is final: a folder that does not match a name
clearly gets no code, and the report lists it for a person to rename.

Matching rules, strictest first:
1. The folder name, with punctuation and spaces removed, equals a masterlist name. A
   one-letter typo is accepted when every digit still agrees ("SMALL RESTAURANT CARTT").
   A digit never fuzzes: "HAND DRYER 6667" is not HAND DRYER 6668.
2. Or the folder name is a masterlist name plus extra words: sizes ("100LBS") or colours
   ("GREY BLUE"). Each extra word must appear in the code or the colours of the product.
3. Several codes can share one name (FIR-001-3LBS ... FIR-001-200LBS are all "Fire
   Extinguisher DRY Chemical"). The extra words pick among them. With no extra words,
   the folder fits all of them only if they do not differ by colour.
4. Inside a folder, an image named with the product's colour wins. Otherwise the image
   named like the folder, otherwise the first image.

data/photo-overrides.json maps a folder name to codes by hand, for folders the rules
cannot match. A duplicate_code_conflict product never gets a photo (D5).

    python scripts/build_product_images.py
"""
import csv
import json
import pathlib
import re
from collections import defaultdict

from PIL import Image, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "photos"
PRODUCTS = ROOT / "corpus" / "products.json"
OVERRIDES = ROOT / "data" / "photo-overrides.json"
MANIFEST = ROOT / "data" / "product-images.json"
REPORT = ROOT / "data" / "product-photos-report.csv"
OUT_DIR = ROOT / "public" / "products"
SIZE = 480
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".webp"}

COLOURS = {"RED", "BLUE", "GREEN", "YELLOW", "GREY", "GRAY", "BLACK", "WHITE", "ORANGE",
           "BROWN", "PINK", "CLEAR", "DARK", "SILVER", "PURPLE"}
COLOUR_LETTER = {"R": "RED", "B": "BLUE", "G": "GREEN", "Y": "YELLOW", "BK": "BLACK", "W": "WHITE"}


def words(s):
    s = s.upper().replace("×", "X").replace("W/", "WITH ")
    return re.sub(r"[^A-Z0-9]+", " ", s).split()


def squash(s):
    return "".join("W" if w == "WITH" else w for w in words(s))


def digits(s):
    return re.sub(r"\D", "", s)


def one_typo(a, b):
    """True when a and b differ by one inserted, deleted or changed letter, and the
    digits agree."""
    if digits(a) != digits(b) or abs(len(a) - len(b)) > 1 or a == b:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) == 1 and not any(
            x.isdigit() or y.isdigit() for x, y in zip(a, b) if x != y)
    short, long_ = sorted((a, b), key=len)
    return any(long_[:i] + long_[i + 1:] == short for i in range(len(long_)))


def colours_of(p):
    """Colour words of p: "Black Base" -> {BLACK, BASE}, "Red,Black" -> {RED, BLACK}."""
    out = {"GREY" if w == "GRAY" else w for w in words(" ".join(p["colors"]))}
    tail = p["code"].rsplit("-", 1)[-1].upper()
    if not out and tail in COLOUR_LETTER:  # the listed colours win over a code letter
        out.add(COLOUR_LETTER[tail])
    return out


def fits(extra, p):
    """Every extra folder word appears in the code or the colour words of p."""
    code, cols = set(words(p["code"])), colours_of(p)
    for w in extra:
        w = "GREY" if w == "GRAY" else w
        if w in cols or w in code:  # whole code parts only: 10LBS is not 100LBS
            continue
        return False
    return True


def match_folder(name, by_key):
    key = squash(name)
    if key in by_key:
        return by_key[key], []
    typo = [k for k in by_key if one_typo(key, k)]
    if len(typo) == 1:
        return by_key[typo[0]], []
    w = words(name)
    # Name plus extra words, at the end ("JANITOR CART BLACK") or at the start ("RED 70L ...").
    best = None
    for i in range(1, len(w)):
        for head, extra in ((w[:i], w[i:]), (w[i:], w[:i])):
            k = "".join("W" if x == "WITH" else x for x in head)
            if k in by_key and (best is None or len(head) > len(best[0])):
                best = (head, extra, by_key[k])
    if best:
        return best[2], best[1]
    return [], []


def choose(group, extra):
    picked = [p for p in group if fits(extra, p)]
    if not extra and len({frozenset(colours_of(p)) for p in picked}) > 1:
        return []  # same name, different colours, and the folder does not say which
    return picked


def pick_image(images, folder, p):
    cols = colours_of(p)
    for f in images:
        if cols & set(words(f.stem)):
            return f
    for f in images:
        if squash(f.stem) == squash(folder):
            return f
    return images[0]


def to_tile(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    im = im.convert("RGB")
    diff = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L")
    box = diff.point(lambda v: 255 if v > 12 else 0).getbbox()
    if box:
        im = im.crop(box)
    side = int(max(im.size) * 1.1)
    tile = Image.new("RGB", (side, side), (255, 255, 255))
    tile.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return tile.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    by_code = {}
    by_key = defaultdict(list)
    for p in products:
        if p["code"] not in by_code:
            by_code[p["code"]] = p
            by_key[squash(p["name"])].append(p)

    chosen = {}  # code -> (image, folder)
    unmatched = []
    for folder in sorted(d for d in SRC.glob("*/*") if d.is_dir()):
        images = sorted(f for f in folder.rglob("*") if f.suffix.lower() in IMAGE_TYPES)
        if not images:
            unmatched.append((folder.name, "empty folder"))
            continue
        if folder.name in overrides:
            bad = [c for c in overrides[folder.name] if c not in by_code]
            if bad:
                raise SystemExit(f"{OVERRIDES.name}: not in the masterlist: {bad}")
            group = [by_code[c] for c in overrides[folder.name]]
        else:
            group, extra = match_folder(folder.name, by_key)
            group = choose(group, extra) if group else []
        if not group:
            unmatched.append((folder.name, "no clear masterlist match"))
            continue
        for p in group:
            if p["code"] not in chosen:
                chosen[p["code"]] = (pick_image(images, folder.name, p), folder)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.webp"):
        old.unlink()
    photos = {}
    for code, (img, _) in sorted(chosen.items()):
        if by_code[code].get("data_quality_flag") == "duplicate_code_conflict":
            continue
        file = re.sub(r"[^A-Za-z0-9._-]", "_", code) + ".webp"  # JAN-001-08A/08B
        to_tile(img).save(OUT_DIR / file, "WEBP", quality=80, method=6)
        photos[code] = f"/products/{file}"

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest["_note"] = ("Product photo manifest, written by scripts/build_product_images.py from "
                         "the CTI product photos in data/raw/photos/. CTI approved publishing them "
                         "on 2026-11-06.")
    manifest["products"] = photos
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    with REPORT.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["code", "name", "category", "photo", "source_folder"])
        for code, p in by_code.items():
            src = chosen.get(code)
            status = ("conflict, no photo" if p.get("data_quality_flag") == "duplicate_code_conflict"
                      else "yes" if code in photos else "missing")
            wr.writerow([code, p["name"], p["category"], status,
                         src[1].relative_to(SRC).as_posix() if src else ""])
        wr.writerow([])
        wr.writerow(["unmatched folder", "reason"])
        wr.writerows(unmatched)

    print(f"codes: {len(by_code)}  with photo: {len(photos)}  "
          f"missing: {len(by_code) - len(photos)}  unmatched folders: {len(unmatched)}")


if __name__ == "__main__":
    main()
