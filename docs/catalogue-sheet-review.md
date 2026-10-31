# Catalogue sheet review

Results from `scripts/extract_catalogue_specs.py` (output in
`data/catalogue-specs.json`).

**Rule: the masterlist is final.** Each spec is attached to a masterlist record
by matching the product name, not the code printed on the sheet. A sheet
description is used only if it keeps every word of the masterlist name; it may
add colours or sizes. Otherwise the spec is the masterlist name itself
(`spec_source: "masterlist"`). Prices come only from the masterlist.

Result: all 1,038 records have a spec. 1,026 come from the sheets and 12 fall
back to the masterlist name.

**Folders:**
- **F1:** `1. PRICELIST - PRIVATE (Incomplete, yellow tag only)`. Its files carry the category name, e.g. `JANITOR SUPPLY 10.png`.
- **F2:** `2. PRICELIST -  PRIVATE (COMPLETE)`. Its files are numbered, e.g. `10.png`.

## OCR accuracy

The sheet discrepancies below are printed on the sheets themselves. They are
not OCR misreads.

- 99.5% of 1,543 sheet rows read as an exact masterlist code.
- 98.8% of those rows carry the masterlist price for that code. This confirms
  that description, code and price were read from the same row.
- 904 sheet descriptions are word-for-word the masterlist name.
- I checked JAN-001-22B and JAN-001-23 against the image. F2
  `JANITOR SUPPLY (JAN-001)/18.png` prints JAN-001-23 beside "Stanchion Black
  Stand Gold Round Head" (₱2,170) and JAN-001-22B beside "Rope for Stanchion"
  (₱1,000). The masterlist has these two codes the other way round.

---

The sections below list errors on the sheets, for anyone correcting the sheets.
The data already follows the masterlist in every case.

## 1. Sheet shows a different product under the code (spec = masterlist name)

| Code | Masterlist name | Sheet shows | Sheet |
|---|---|---|---|
| FIR-002-30B | Exit Sign (lighted Led) - Double Faced | EMERGENCY LIGHT LED 6V | F2 `FIRE SAFETY (FIR-001, FIR-002)/11.png` |
| PPE-014-38H | No Smoking Signage | TOILET SIGNAGE (CLEAR) | F1 `SIGNAGES & PRECAUTIONARIES 7.png`, F2 `.../7.png` |
| RAI-001-27 | Poncho Plain | PANTS AND JACKET 922 | F1 `RAINCOAT.png`, F2 `RAINCOAT (RAI-001)/1.png` |

## 2. Sheet text contradicts the masterlist name (spec = masterlist name)

| Code | Masterlist name | Sheet says | Sheet |
|---|---|---|---|
| FIR-002-38B | … 50FT **Double** Jacket | … 50FT **SINGLE** JACKET (same text as 38A) | F2 `FIRE SAFETY (FIR-001, FIR-002)/12.png` |
| FUR-002-111 | BARSTOOL (Black **Fabric, Low** Back) | BARSTOOL (BLACK **LEATHERETTE, HIGH** BACK) (same text as 110) | F1 `FURNITURE (CHAIR) 13.png` |
| FUR-003-14 | 2 Layer Lateral Cabinet **Recessed** Handle | … **FLUSH** HANDLE | F2 `FURNITURE (CABINET) (FUR-003)/3.png` |
| WHI-001-11 | FOX 40 **Stainess** | FOX 40 **HAND HELD** | F2 `WHISTLE (WHI-001)/1.png` |
| PPE-014-03B | Caution Tape (**1000FT**\*10C) | CAUTION TAPE (**100M**\*10C) | F2 `SIGNAGES AND PRECAUTIONARIES (PPE-012,PPE-014)/10.png` |
| PPE-005-14A | Blue Dotted Gloves 900G - **Omaga** | BLUE DOTTED GLOVES 900G (BLUE) | F1 `PPE 1.png` |
| PPE-005-26 | Fishing Scale **Gloves** | FISHING SCALE (BLACK/ORANGE/YELLOW) | F1 `PPE 3.png` |
| PPE-012-13B | Expandable Barrier **ORD** | EXPANDABLE BARRIER | F2 `SIGNAGES AND PRECAUTIONARIES (PPE-012,PPE-014)/9.png` |

## 3. Code printed differently from the masterlist (spec matched by name)

| Masterlist code | Printed on sheet | Sheet |
|---|---|---|
| JAN-001-22B (Stanchion Black Stand) | JAN-001-23 | F2 `JANITOR SUPPLY (JAN-001)/18.png` |
| JAN-001-23 (Rope for Stanchion) | JAN-001-22B | same sheet |
| JAN-001-08181D | JAN-001-0818D | F2 `JANITOR SUPPLY (JAN-001)/25.png` |
| JAN-001-520-R and JAN-001-520-G | one row: JAN-001-520-R/G, so 520-G's spec reads "(RED/GREY)" | F2 `JANITOR SUPPLY (JAN-001)/10.png` |
| JAN-001-585-3-Y | JAN-001-585-3 | F1 `JANITOR SUPPLY 10.png`, F2 `10.png` |

## 4. Same code printed for two products (the masterlist product's row was used)

| Code | Stray row and where |
|---|---|
| FIR-002-100LBS-AFFF | AFFF 5LBS (WALL TYPE), F1 `FIRE EXTINGUISHER.png` |
| JAN-001-580-Y | 13" BURNISHER (YELLOW), F1 `JANITOR SUPPLY 10.png` |
| JAN-001-11102 | WASH AND SCRAPE COMBINATION (masterlist: JAN-001-06003), F1 `JANITOR SUPPLY 14.png` and `15.png` |
| FUR-001-40 | CD L SHAPE TABLE W/HANGING DRAWER…, F1 `FURNITURE TABLE 5.png` |
| TRA-001-29 | SQUARE TRASH BIN 21L, F1 `TRASH 1.png` |

LIF-002-05 and LIF-001-09 are the known `duplicate_code_conflict` codes. Each
masterlist record got its own matching row.

## 5. Not on any sheet (spec = masterlist name)

- TRA-001-07338-B, 60L Pedal Classification Trash Bin. F2 `TRASH (TRA-001)/10.png` ends at 07338-G.

## 6. On the sheets but not in the masterlist (ignored)

- JAN-001-67-6667, HAND DRYER 6667 WHITE. F1 `JANITOR SUPPLY 8.png`, F2 `8.png`.
