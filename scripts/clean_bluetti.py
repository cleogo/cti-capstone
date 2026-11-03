"""Clean the Bluetti Leyte calculator workbook and product list into data/bluetti/.

Inputs (data/raw/, as supplied by CTI):
  bluetti-category.csv           25 Bluetti products, names only
  bluetti-leyte-calculator.xlsx  the sales team's runtime calculator
  bluetti-prices.csv             CTI retail prices (SRP), product_name + srp_php
  bluetti-specs.csv              specs read off the photographed price list
                                 (data/bluetti/images), keyed by product_name
  bluetti-web-specs.csv          surge, self-consumption and charging power from
                                 official BLUETTI 230 V pages and manuals (not
                                 from CTI), source URL per row, keyed by model

Outputs (data/bluetti/):
  products.csv    one row per product; specs parsed from the name, calculator
                  specs joined in where the workbook has them; on_sale = no
                  for the NOT_SOLD items
  appliances.csv  the WATTAGE sheet deduplicated: one row per appliance/variant,
                  running and surge watts side by side, user types as a list
  solar.csv       the SOLAR PANEL RECOMMENDATION sheet, flattened

The derived sheets (Runtime Calculator, RUNNING TIME PER APPLIANCES, Wattage
Consumption) are not exported: they are views over the data above and the
formulas in data/bluetti/README.md.

Run: python scripts/clean_bluetti.py
"""

import csv
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
XLSX = RAW / "bluetti-leyte-calculator.xlsx"
CATEGORY_CSV = RAW / "bluetti-category.csv"
PRICES_CSV = RAW / "bluetti-prices.csv"
SPECS_CSV = RAW / "bluetti-specs.csv"
WEB_SPECS_CSV = RAW / "bluetti-web-specs.csv"
OUT = ROOT / "data" / "bluetti"

# The calculator's own defaults (Formula Reference sheet).
DOD = 0.9
INVERTER_EFFICIENCY = 0.85

# In bluetti-category.csv but not in CTI's current catalogue: on hold, not sold
# (decided 2026-10-31). The recommender must not offer them.
NOT_SOLD = {"AC300", "AC500", "EP760", "HV800", "EP2000", "B500K", "B700"}

# Calculator values replaced by the manufacturer's figure (decided 2026-10-31).
# APEX 300: the workbook's 12,000 W is a US 240 V bypass rating, not a
# charging rate. BLUETTI's EU manual gives 3,840 W (one AC input, 230 V, Turbo).
CALC_OVERRIDES = {("APEX300", "ac_charge_w"): 3840}


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def num(s):
    return float(s.replace(",", ""))


def load_calculator_db(wb):
    ws = wb["Database"]
    db = {}
    for row in ws.iter_rows(min_row=3, max_row=8, values_only=True):
        model, cap, self_w, solar_w, ac_w = row[:5]
        db[norm(model)] = {
            "calc_model": model.strip(),
            "calc_capacity_wh": cap,
            "self_consumption_w": self_w,
            "solar_charge_w": solar_w,
            "ac_charge_w": ac_w,
        }
    for (model, col), value in CALC_OVERRIDES.items():
        db[norm(model)][col] = value
    return db


def build_products(db):
    with CATEGORY_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))[2:]  # row 1 is blank, row 2 is the header

    out = []
    for no, category, name in rows:
        model = re.sub(r"^BLUETTI\s+|\s*\|.*$|\s+(Portable\s+)?Power Station$", "", name.split("|")[0].strip())
        specs = name.split("|")[1:]
        watts = [num(m) for s in specs for m in re.findall(r"([\d,.]+)\s*W(?!h)", s)]
        wh = [num(m) for s in specs for m in re.findall(r"([\d,.]+)\s*Wh", s)]
        kw = [s.strip() for s in specs if "kW" in s]

        rec = {
            "no": int(no),
            "category": category.strip(),
            "model": model,
            "name": name.strip(),
            # The calculator and CTI's sales team call the PV panels "Sora".
            "alias": f"Sora {model[2:].split()[0]}" if category.strip() == "Solar Panel" else "",
            "on_sale": "no" if any(norm(m) in norm(model) for m in NOT_SOLD) else "yes",
            "rated_w": watts[0] if watts and not kw else "",
            "capacity_wh": wh[0] if wh else "",
            "rated_kw_options": " / ".join(kw),
            "calc_model": "",
            "calc_capacity_wh": "",
            "self_consumption_w": "",
            "solar_charge_w": "",
            "ac_charge_w": "",
            "surge_w": "",  # filled by apply_web_specs()
            "web_source_url": "",
            "ac_output_w": "",  # these seven are filled by apply_specs()
            "power_lifting_w": "",
            "total_outlets": "",
            "ac_outlets": "",
            "warranty_months": "",
            "cell_efficiency_pct": "",
            "ingress_protection": "",
            "price_php": "",  # filled by apply_prices(); blank means CTI has not priced this item
            "notes": "",
        }
        key = norm(model)
        hit = next((v for k, v in db.items() if k in key), None)
        if hit:
            rec.update(hit)
            if rec["capacity_wh"] and abs(rec["capacity_wh"] - hit["calc_capacity_wh"]) > 0.5:
                rec["notes"] = f"capacity differs: name says {rec['capacity_wh']} Wh, calculator uses {hit['calc_capacity_wh']} Wh"
        out.append(rec)

    matched = {r["calc_model"] for r in out if r["calc_model"]}
    missing = [v["calc_model"] for v in db.values() if v["calc_model"] not in matched]
    assert not missing, f"calculator models with no product row: {missing}"
    return out


def load_prices():
    with PRICES_CSV.open(encoding="utf-8-sig", newline="") as f:
        return [(r["product_name"].strip(), int(r["srp_php"])) for r in csv.DictReader(f)]


def apply_prices(products, prices):
    """Fill price_php for each product a price row names (substring match on norm()).

    Returns the price rows that matched no product.
    """
    unmatched = []
    for name, srp in prices:
        hits = [p for p in products if norm(name) in norm(p["model"])]
        assert len(hits) <= 1, f"price row {name} matches more than one product: {[p['model'] for p in hits]}"
        if not hits:
            unmatched.append((name, srp))
            continue
        p = hits[0]
        assert p["price_php"] == "", f"{p['model']} gets two price rows; second is {name}"
        p["price_php"] = srp
    return unmatched


SPEC_COLUMNS = ["ac_output_w", "power_lifting_w", "total_outlets", "ac_outlets",
                "warranty_months", "cell_efficiency_pct", "ingress_protection"]


def load_specs():
    with SPECS_CSV.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def apply_specs(products, specs):
    """Merge the photographed spec rows into products (substring match on norm()).

    The photo's capacity and AC output must agree with the figures parsed from
    the product name; a mismatch means a misread digit in one of the two.
    Returns the spec rows that matched no product.
    """
    unmatched = []
    for row in specs:
        hits = [p for p in products if norm(row["product_name"]) in norm(p["model"])]
        assert len(hits) <= 1, f"spec row {row['product_name']} matches more than one product: {[p['model'] for p in hits]}"
        if not hits:
            unmatched.append(row["product_name"])
            continue
        p = hits[0]
        assert p["ac_output_w"] == "", f"{p['model']} gets two spec rows; second is {row['product_name']}"
        for col in SPEC_COLUMNS:
            if row[col]:
                p[col] = row[col] if col in ("ac_outlets", "ingress_protection") else num(row[col])
        if row["capacity_wh"] and p["capacity_wh"] != "":
            assert num(row["capacity_wh"]) == p["capacity_wh"], f"{p['model']}: photo capacity {row['capacity_wh']} vs name {p['capacity_wh']}"
        if row["ac_output_w"] and p["rated_w"] != "":
            assert num(row["ac_output_w"]) == p["rated_w"], f"{p['model']}: photo AC output {row['ac_output_w']} vs name {p['rated_w']}"
        if row["notes"]:
            p["notes"] = f"{p['notes']}; {row['notes']}" if p["notes"] else row["notes"]
    return unmatched


WEB_COLUMNS = ["self_consumption_w", "solar_charge_w", "ac_charge_w"]


def apply_web_specs(products):
    """Merge the researched manufacturer specs into products (exact model match).

    CTI's calculator wins: a web value fills only a blank calculator column, so
    the agent and the sales team give the same numbers. surge_w comes only
    from the web file. Returns (model, column, calculator, web) disagreements.
    """
    with WEB_SPECS_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    by_model = {p["model"]: p for p in products}
    disagreements = []
    for row in rows:
        assert row["model"] in by_model, f"web spec row {row['model']} matches no product"
        p = by_model[row["model"]]
        if row["surge_w"]:
            p["surge_w"] = num(row["surge_w"])
        for col in WEB_COLUMNS:
            if not row[col]:
                continue
            if p[col] == "":
                p[col] = num(row[col])
            elif num(row[col]) != p[col]:
                disagreements.append((p["model"], col, p[col], num(row[col])))
        p["web_source_url"] = row["source_url"]
    return disagreements


def build_appliances(wb):
    ws = wb["WATTAGE"]
    groups = {}
    for user_type, appliance, variant, watts, _kw, note in ws.iter_rows(min_row=5, max_col=6, values_only=True):
        if not isinstance(watts, (int, float)):
            continue  # section header rows
        variant = str(variant).strip()
        is_surge = "surge" in variant.lower() or "start-up" in str(note).lower()
        base = re.sub(r"\s*\((surge|running)\)", "", variant, flags=re.I).strip()
        key = (appliance.strip(), base)
        g = groups.setdefault(key, {"running_w": set(), "surge_w": set(), "user_types": [], "notes": set()})
        g["surge_w" if is_surge else "running_w"].add(watts)
        if user_type not in g["user_types"]:
            g["user_types"].append(user_type)
        if not is_surge and note:
            g["notes"].add(note)

    out, conflicts = [], []
    for (appliance, variant), g in sorted(groups.items(), key=lambda kv: (kv[0][0].lower(), kv[0][1].lower())):
        if len(g["running_w"]) > 1 or len(g["surge_w"]) > 1:
            conflicts.append((appliance, variant, g["running_w"], g["surge_w"]))
        out.append({
            "appliance": appliance,
            "variant": variant,
            "running_w": max(g["running_w"]) if g["running_w"] else "",
            "surge_w": max(g["surge_w"]) if g["surge_w"] else "",
            "notes": "; ".join(sorted(g["notes"])),
            "user_types": "; ".join(g["user_types"]),
        })
    return out, conflicts


def build_solar(wb):
    ws = wb["SOLAR PANEL RECOMMENDATION"]
    out = []
    for model, limits, configs, wiring in ws.iter_rows(min_row=8, max_col=4, values_only=True):
        if not model:
            continue
        flat = lambda s: re.sub(r"\s*\n\s*", "; ", str(s).replace("​", "")).strip()
        out.append({"model": model.strip(), "input_limits": flat(limits),
                    "recommended": flat(configs), "wiring": flat(wiring)})
    return out


def write(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: int(v) if isinstance(v, float) and v.is_integer() else v for k, v in r.items()})


def runtime_hours(capacity_wh, self_w, load_w):
    return capacity_wh * DOD * INVERTER_EFFICIENCY / (load_w + self_w)


def main():
    wb = openpyxl.load_workbook(XLSX)
    db = load_calculator_db(wb)

    # One runnable check: the workbook's saved example (APEX 300, one 150 W
    # fridge) must come out at the 12.438 h the spreadsheet itself shows.
    apex = db[norm("APEX 300")]
    assert abs(runtime_hours(apex["calc_capacity_wh"], apex["self_consumption_w"], 150) - 12.438) < 0.001

    products = build_products(db)
    assert sum(p["on_sale"] == "no" for p in products) == len(NOT_SOLD), "a NOT_SOLD name matches no product, or more than one"
    unmatched = apply_prices(products, load_prices())
    unmatched_specs = apply_specs(products, load_specs())
    web_disagreements = apply_web_specs(products)
    for p in products:
        if p["on_sale"] == "no" and p["price_php"] != "":
            print(f"PRICED BUT NOT SOLD {p['model']}: CTI may sell it again, check NOT_SOLD")
    appliances, conflicts = build_appliances(wb)
    solar = build_solar(wb)

    OUT.mkdir(parents=True, exist_ok=True)
    write(OUT / "products.csv", products)
    write(OUT / "appliances.csv", appliances)
    write(OUT / "solar.csv", solar)

    print(f"products.csv   {len(products)} rows, {sum(1 for p in products if p['calc_model'])} with calculator specs")
    print(f"appliances.csv {len(appliances)} rows, {sum(1 for a in appliances if a['surge_w'])} with surge watts")
    print(f"solar.csv      {len(solar)} rows")
    print(f"price_php      {sum(1 for p in products if p['price_php'] != '')} of {len(products)} products have a price")
    print(f"photo specs    {sum(1 for p in products if p['warranty_months'] != '')} of {len(products)} products have a warranty, {sum(1 for p in products if p['ac_output_w'] != '')} an AC output")
    for name, srp in unmatched:
        print(f"UNMATCHED PRICE {name} {srp}")
    for name in unmatched_specs:
        print(f"UNMATCHED SPEC {name}")
    stations = [p for p in products if "Power Station" in p["category"] and p["on_sale"] == "yes"]
    print(f"web specs      {sum(1 for p in stations if p['surge_w'] != '')} of {len(stations)} stations on sale have surge_w, "
          f"{sum(1 for p in stations if p['self_consumption_w'] != '')} self_consumption_w")
    for model, col, calc, web in web_disagreements:
        print(f"CALC VS WEB {model} {col}: calculator {calc:g}, manufacturer {web:g} (calculator kept)")
    for c in conflicts:
        print("WATT CONFLICT", c)
    for p in products:
        if p["notes"]:
            print("NOTE", p["model"], "-", p["notes"])


if __name__ == "__main__":
    main()
