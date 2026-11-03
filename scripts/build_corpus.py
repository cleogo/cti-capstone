"""Convert the CTI price masterlist into a RAG-ready corpus.

This script reads fixed-cti-masterlist.xlsx and writes three files:
  - corpus/products.jsonl  -- one retrieval chunk for each product
  - corpus/products.csv    -- exact values for the filter tool
  - corpus/categories.json

Run: python scripts/build_corpus.py

BEGINNER'S MAP
-----------------------------------------------------------
STAGE 1 of 3 ("data preparation").
This script runs offline on your machine. It never connects to OpenAI or
to the database.

    xlsx  --[THIS FILE]-->  corpus/*.jsonl  --[lib/seed.ts]-->  Upstash Vector
                                                                     |
                                 user question --[lib/retrieval.ts]--+

Read the code in this order:
  1. main()               -- the loop over the spreadsheet rows (bottom of file)
  2. clean_text()         -- cleans messy source text
  3. CATEGORIES           -- derives a category that the sheet does not have
  4. extract_attributes() -- extracts facts from the product name
  5. build_text()         -- converts one row into the sentence to embed
  6. the duplicate check  -- flags bad source data and does not hide it

Key word: a "chunk" is one piece of text with its own embedding. This
script makes one chunk for each product. Thus a product's name and price
can never be in two different chunks.
"""

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "fixed-cti-masterlist.xlsx"
# Bluetti items on sale, with their PWR codes (scripts/clean_bluetti.py).
BLUETTI = ROOT / "data" / "bluetti" / "products.csv"
OUT = ROOT / "corpus"

# Code prefixes carry the taxonomy; the sheet has no category column.
# "Taxonomy" just means a grouping scheme: department -> category -> product.
# We read the first two parts of a code ("MED-001" from "MED-001-01") and
# look it up here. This is "deriving structure": adding a field the source
# never had, so the bot can answer "show me Fire Safety items".
CATEGORIES = {
    "MED-001": ("Medical & Clinic Equipment", "Medical"),
    "FUR-001": ("Office Tables & Desks", "Furniture"),
    "FUR-002": ("Office Chairs & Seating", "Furniture"),
    "FUR-003": ("Pedestals, Cabinets & Storage", "Furniture"),
    "JAN-001": ("Janitorial & Cleaning Equipment", "Janitorial"),
    "PPE-005": ("Hand Protection (Gloves)", "PPE"),
    "PPE-012": ("Traffic Cones", "Traffic & Site Safety"),
    "PPE-014": ("Barriers, Chains & Warning Tape", "Traffic & Site Safety"),
    "PPE-018": ("Work Boots", "Footwear"),
    "FIR-001": ("Fire Safety Equipment", "Fire Safety"),
    "FIR-002": ("Fire Extinguishers", "Fire Safety"),
    "SAF-001": ("Safety & Reflective Vests", "PPE"),
    "SAF-002": ("Safety Shoes", "Footwear"),
    "TRA-001": ("Trash Bins & Waste Containers", "Janitorial"),
    "SPO-001": ("Sports & Martial Arts Equipment", "Sports"),
    "LIF-001": ("Water Rescue & Life Saving", "Rescue"),
    "LIF-002": ("First Aid Kits", "Rescue"),
    "LIF-003": ("Modular Tents", "Rescue"),
    "FAC-001": ("Face & Welding Protection", "PPE"),
    "BOD-001": ("Fall Protection Harnesses", "Fall Protection"),
    "BOD-002": ("Welding Aprons & Body Protection", "PPE"),
    "GOG-001": ("Safety Goggles", "PPE"),
    "LAN-001": ("Fall Protection Lanyards", "Fall Protection"),
    "WHI-001": ("Whistles & Signaling Devices", "PPE"),
    "EAR-001": ("Hearing Protection", "PPE"),
    "RAI-001": ("Rainwear", "PPE"),
    "HEA-001": ("Helmets", "PPE"),
    "HAR-001": ("Hard Hats", "PPE"),
    "FLA-001": ("Flashlights & Headlights", "Equipment"),
    "LCS-001": ("Low Cut Safety Shoes", "Footwear"),
    "LCS-002": ("Low Cut Safety Shoes", "Footwear"),
    "HCS-001": ("High Cut Safety Shoes", "Footwear"),
    "MAC-001": ("Vending & Coffee Machines", "Equipment"),
    "TND-001": ("Barangay Tanod Equipment", "Security"),
    "ORD-001": ("Assorted Safety Footwear", "Footwear"),
    "MEG-001": ("Megaphones", "Equipment"),
    "PLT-001": ("Portable Toilets", "Equipment"),
    "PWR-001": ("Portable Power Stations", "Power"),
    "PWR-002": ("Power Stations", "Power"),
    "PWR-003": ("Solar Panels", "Power"),
    "PWR-004": ("Power Station Batteries & Accessories", "Power"),
}

# Prices as words people actually use. An embedding can't do maths, so
# "something cheap" only matches if the word "budget" is in the chunk text.
PRICE_BANDS = [
    (0, 500, "budget"),
    (500, 2000, "standard"),
    (2000, 10000, "mid-range"),
    (10000, 50000, "premium"),
    (50000, float("inf"), "capital equipment"),
]

ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight",
        "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
        "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
        "eighty", "ninety"]


def number_to_words(n: int) -> str:
    """Spell a peso amount so 'four hundred eighty-five' matches the digits."""
    if n == 0:
        return "zero"
    parts = []
    for div, label in ((1_000_000, "million"), (1_000, "thousand")):
        if n >= div:
            parts.append(f"{number_to_words(n // div)} {label}")
            n %= div
    if n >= 100:
        parts.append(f"{ONES[n // 100]} hundred")
        n %= 100
    if n >= 20:
        word = TENS[n // 10]
        if n % 10:
            word += f"-{ONES[n % 10]}"
        parts.append(word)
    elif n:
        parts.append(ONES[n])
    return " ".join(parts)


def clean_text(value) -> str:
    """Strip the mojibake and stray separators the export left behind."""
    # "Mojibake" = garbled characters from a bad text encoding, e.g. a "×"
    # that came out as "�". Garbage in the text means garbage in the
    # embedding, so cleaning happens before anything else.
    if value is None:
        return ""
    text = unicodedata.normalize("NFKC", str(value))
    text = text.replace("�", "x").replace("×", "x")
    text = text.replace("\\", " ").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip(" -,")


def title_case(name: str) -> str:
    """The sheet mixes ALL CAPS and Sentence case; normalise for display."""
    if not name:
        return ""
    letters = [c for c in name if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) < 0.7:
        return name
    def fix(word):
        # Leave codes, abbreviations and slashed variants (B/W, HD) as-is.
        if re.search(r"[\d/]", word) or len(word) <= 3:
            return word
        return word.capitalize()
    return " ".join(fix(w) for w in name.split())


def price_band(price: int) -> str:
    for low, high, label in PRICE_BANDS:
        if low <= price < high:
            return label
    return "unclassified"


def parse_colors(raw: str):
    if not raw:
        return []
    return [c.strip() for c in re.split(r"[,/]", raw) if c.strip()]


def extract_attributes(name: str):
    """Pull structured facts out of the free-text item name."""
    # Each block below is a regular expression (regex): a text pattern.
    # e.g. r"(\d+(?:\.\d+)?)\s*L\b" means "a number followed by L", so
    # "TRASH BIN 120L" gives capacity_liters = 120. These facts go into the
    # chunk text (searchable) and the metadata (displayable/filterable).
    attrs = {}
    upper = name.upper()

    dims = re.search(r"W\s*([\d.]+)\s*x?\s*D\s*([\d.]+)\s*x?\s*H\s*([\d.]+)\s*(CM|MM)?", upper)
    if dims:
        attrs["dimensions_cm"] = f"{dims.group(1)} x {dims.group(2)} x {dims.group(3)}"
    else:
        generic = re.search(r"(\d+(?:\.\d+)?)\s*[Mm]?\s*[xX]\s*(\d+(?:\.\d+)?)\s*[Mm]?(?:\s*[xX]\s*(\d+(?:\.\d+)?))?\s*(CM|M|MM|IN|\")", upper)
        if generic:
            attrs["size"] = generic.group(0).strip()

    capacity = re.search(r"(\d+(?:\.\d+)?)\s*L\b", upper)
    if capacity:
        attrs["capacity_liters"] = float(capacity.group(1))

    weight = re.search(r"(\d+(?:\.\d+)?)\s*(LBS?|KG|G)\b", upper)
    if weight:
        attrs["weight"] = f"{weight.group(1)} {weight.group(2).lower()}"

    pack = re.search(r"(\d+)\s*(?:PCS?|PIECES)\s*(?:PER|/)\s*(BOX|PACK|SET|TYPE)", upper)
    if pack:
        attrs["pack_quantity"] = f"{pack.group(1)} pcs per {pack.group(2).lower()}"
    elif re.search(r"\((\d+)\s*PACK", upper):
        attrs["pack_quantity"] = re.search(r"\((\d+\s*PACK[^)]*)\)", upper).group(1).lower()

    if "OSHC" in upper:
        attrs["oshc_certified"] = True
    if "FREE" in upper:
        bundle = re.search(r"\+?\s*FREE\s+([A-Z ]+)", upper)
        if bundle:
            attrs["bundled_item"] = bundle.group(1).strip().title()

    for material in ("STAINLESS", "RUBBER", "PLASTIC", "LEATHER", "COTTON",
                     "STEEL", "PVC", "WOODEN", "ALUMINUM", "NYLON"):
        if material in upper:
            attrs["material"] = material.title()
            break

    for variant, label in (("HIGH CUT", "high cut"), ("HC\\b", "high cut"),
                           ("LOW CUT", "low cut"), ("LC\\b", "low cut")):
        if re.search(variant, upper):
            attrs["cut"] = label
            break

    if re.search(r"\b(KIDS?|CHILD)\b", upper):
        attrs["size_class"] = "kids"
    elif re.search(r"\bADULTS?\b", upper):
        attrs["size_class"] = "adult"

    sizes = re.search(r"SIZE\s*(\d+)\s*-\s*(\d+)", upper)
    if sizes:
        attrs["size_range"] = f"{sizes.group(1)}-{sizes.group(2)}"

    return attrs


def build_text(rec) -> str:
    """The paragraph that the embedding model receives.

    A user might phrase a question around any fact about a product. Each
    fact must appear here in natural language:
      - the code, with and without hyphens
      - the price, as digits and as words
      - the category
      - the colours
      - the attributes

    This step is called "denormalising". A spreadsheet row stores facts in
    separate cells. An embedding model understands sentences. So this
    function flattens every cell into one readable paragraph.

    The paragraph states the same fact in several forms on purpose
    (MED-001-01 / MED00101 / MED 001 01). Each form is one more way for a
    user's wording to land close to this chunk.

    To see the result, compare one row of the xlsx with one line of
    corpus/products.jsonl.
    """
    code = rec["code"]
    price = rec["price_php"]
    lines = []

    lines.append(
        f"{rec['name']} (product code {code}) is sold by CTI for "
        f"PHP {price:,}.00."
    )
    lines.append(
        f"Price: ₱{price:,}.00 — {number_to_words(price)} pesos. "
        f"Product code {code}, also written {code.replace('-', '')} or "
        f"{code.replace('-', ' ')}."
    )
    lines.append(
        f"Category: {rec['category']} under the {rec['department']} department. "
        f"This is a {rec['price_band']} item in the CTI price masterlist."
    )

    if rec["colors"]:
        lines.append(f"Available colors: {', '.join(rec['colors'])}.")

    attrs = rec["attributes"]
    if attrs:
        readable = []
        labels = {
            "dimensions_cm": "Dimensions (W x D x H, cm)",
            "size": "Size", "capacity_liters": "Capacity (liters)",
            "weight": "Weight/capacity", "pack_quantity": "Packaging",
            "material": "Material", "cut": "Cut", "size_class": "Intended user",
            "size_range": "Size range", "bundled_item": "Included free",
            "model": "Model", "rated_output_w": "Rated AC output (W)",
            "capacity_wh": "Battery capacity (Wh)", "also_known_as": "Also called",
        }
        for key, value in attrs.items():
            if key == "oshc_certified":
                readable.append("OSHC certified (Occupational Safety and Health Center compliant)")
            else:
                readable.append(f"{labels.get(key, key)}: {value}")
        lines.append(" ".join(f"{part}." for part in readable))

    lines.append(
        f"To order this item, quote product code {code} and the item name "
        f"\"{rec['name']}\"."
    )
    return " ".join(lines)


def main():
    # STEP 1: read the spreadsheet. data_only=True gives cell values, not
    # formulas. min_row=2 skips the header row.
    workbook = openpyxl.load_workbook(SOURCE, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(min_row=2, values_only=True))

    records = []
    issues = []
    seen = defaultdict(list)

    # STEP 2: turn every row into one record (one chunk).
    for index, row in enumerate(rows, start=2):
        raw_name, raw_color, code, price = row[0], row[1], row[3], row[4]

        name = title_case(clean_text(raw_name))
        code = clean_text(code).upper()

        # Validation: a row with no name or no real price can't be answered
        # truthfully, so it is logged in data-issues.json and skipped.
        if not name:
            issues.append({"row": index, "code": code, "issue": "missing item name"})
            continue
        if not isinstance(price, int) or price <= 0:
            issues.append({"row": index, "code": code, "issue": f"unusable price {price!r}"})
            continue

        group = "-".join(code.split("-")[:2])
        category, department = CATEGORIES.get(group, ("Uncategorized", "Other"))

        # Everything except "text" becomes METADATA: exact values stored next
        # to the vector. The vector is only used to *find* a chunk; the price
        # shown on screen comes from price_php here, never from the AI's
        # wording. "id" is code + row number because codes aren't unique.
        record = {
            "id": f"{code}::{index}",
            "code": code,
            "code_group": group,
            "name": name,
            "category": category,
            "department": department,
            "price_php": price,
            "price_band": price_band(price),
            "currency": "PHP",
            "colors": parse_colors(clean_text(raw_color)),
            "attributes": extract_attributes(clean_text(raw_name)),
            "source_row": index,
            "source_file": SOURCE.name,
        }
        record["text"] = build_text(record)
        records.append(record)
        seen[code].append(record)

    # STEP 2b: add the Bluetti items on sale. They are not in the masterlist
    # xlsx; CTI prices them on a separate price list. clean_bluetti.py gives
    # each one a PWR code, and an item without a price is an error.
    masterlist_count = len(records)
    with BLUETTI.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["on_sale"] != "yes":
                continue
            code = row["code"]
            assert code not in seen, f"{code} is already a masterlist code"
            assert row["price_php"], f"{code} {row['model']} is on sale but has no price"
            price = int(row["price_php"])
            group = "-".join(code.split("-")[:2])
            category, department = CATEGORIES[group]
            attrs = {"model": row["model"]}
            for key, column in (("rated_output_w", "rated_w"), ("capacity_wh", "capacity_wh"),
                                ("also_known_as", "alias")):
                if row[column]:
                    value = row[column]
                    attrs[key] = value if key == "also_known_as" else float(value) if "." in value else int(value)
            record = {
                "id": f"{code}::bluetti{row['no']}",
                "code": code,
                "code_group": group,
                "name": row["name"],
                "category": category,
                "department": department,
                "price_php": price,
                "price_band": price_band(price),
                "currency": "PHP",
                "colors": [],
                "attributes": attrs,
                "source_row": int(row["no"]),
                "source_file": "data/bluetti/products.csv",
            }
            record["text"] = build_text(record)
            records.append(record)
            seen[code].append(record)

    # STEP 3: check data quality.
    # Duplicate codes are a real defect in the source sheet, not noise to hide.
    # Same code + same data = harmless copy. Same code + different price =
    # conflict; the flag tells the chatbot to warn instead of quoting a price.
    for code, group in seen.items():
        if len(group) < 2:
            continue
        prices = {r["price_php"] for r in group}
        names = {r["name"] for r in group}
        if len(prices) > 1 or len(names) > 1:
            issues.append({
                "row": ", ".join(str(r["source_row"]) for r in group),
                "code": code,
                "issue": "duplicate code with conflicting data",
                "detail": " | ".join(f"{r['name']} @ PHP {r['price_php']:,}" for r in group),
            })
            for record in group:
                record["data_quality_flag"] = "duplicate_code_conflict"
        else:
            for record in group:
                record["data_quality_flag"] = "duplicate_code_identical"

    # STEP 4: write the output files into corpus/.
    OUT.mkdir(exist_ok=True)

    # JSONL = "JSON Lines": one JSON object per line. lib/seed.ts reads this
    # file line by line and embeds each record's "text" field.
    with (OUT / "products.jsonl").open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    # products.json is imported directly by the filterProducts tool, so it
    # carries only the fields that tool needs -- not the embedded text.
    # "id" is what the hybrid merge de-duplicates on -- "code" is not unique
    # (five codes carry conflicting rows), so it cannot serve as the key.
    filter_fields = ("id", "code", "name", "category", "department", "price_php",
                     "price_band", "colors", "attributes")
    (OUT / "products.json").write_text(
        json.dumps([{k: r[k] for k in filter_fields} | (
            {"data_quality_flag": r["data_quality_flag"]}
            if "data_quality_flag" in r else {}
        ) for r in records], ensure_ascii=False, indent=None),
        encoding="utf-8")

    with (OUT / "products.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["code", "name", "category", "department", "price_php",
                         "price_band", "colors", "attributes", "flag"])
        for record in records:
            writer.writerow([
                record["code"], record["name"], record["category"],
                record["department"], record["price_php"], record["price_band"],
                "; ".join(record["colors"]),
                json.dumps(record["attributes"], ensure_ascii=False),
                record.get("data_quality_flag", ""),
            ])

    taxonomy = defaultdict(lambda: {"categories": {}, "count": 0})
    for record in records:
        department = taxonomy[record["department"]]
        department["count"] += 1
        category = department["categories"].setdefault(
            record["category"], {"count": 0, "code_groups": set(),
                                 "min_price": record["price_php"],
                                 "max_price": record["price_php"]})
        category["count"] += 1
        category["code_groups"].add(record["code_group"])
        category["min_price"] = min(category["min_price"], record["price_php"])
        category["max_price"] = max(category["max_price"], record["price_php"])
    for department in taxonomy.values():
        for category in department["categories"].values():
            category["code_groups"] = sorted(category["code_groups"])

    (OUT / "categories.json").write_text(
        json.dumps(taxonomy, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUT / "data-issues.json").write_text(
        json.dumps(issues, indent=2, ensure_ascii=False), encoding="utf-8")

    prices = sorted(r["price_php"] for r in records)
    print(f"products written : {len(records)} ({masterlist_count} masterlist, {len(records) - masterlist_count} Bluetti)")
    print(f"skipped rows     : {len(rows) - masterlist_count}")
    print(f"data issues      : {len(issues)}")
    print(f"departments      : {len(taxonomy)}")
    print(f"categories       : {len(CATEGORIES)}")
    print(f"price range      : PHP {prices[0]:,} - {prices[-1]:,}")
    print(f"median price     : PHP {prices[len(prices) // 2]:,}")
    print(f"avg chunk chars  : {sum(len(r['text']) for r in records) // len(records)}")
    print("\nby department:")
    for name, data in sorted(taxonomy.items(), key=lambda kv: -kv[1]["count"]):
        print(f"  {name:<22} {data['count']:>5}")


if __name__ == "__main__":
    main()
