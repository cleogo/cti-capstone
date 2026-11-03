# Knowledge sheets: the first 60

WBS 2.7. This is the draft list of the 60 sheets to write. It follows the
priority order in PRD §8: power stations, fire extinguishers, fire blankets,
emergency lights, then flashlights and rescue items.

Each sheet is one Markdown file with four `##` sections: Specs, Usage,
Advantages and Cautions. The front matter lists the codes it covers and the
URL of each source. The sheets go in `corpus/sheets/<slug>.md`.

## Two kinds of sheet

Most masterlist items carry no brand or model. "Fire Extinguisher DRY Chemical
10LBS" has no manufacturer datasheet. A sheet must never present facts about
a product type as the datasheet of CTI's unit.

- **Model sheet.** The item has a brand or model number. Specs come from the
  manufacturer's page or manual.
- **Type sheet.** The item is generic. Specs hold only what the masterlist name
  states (size, agent, mounting). Usage, Advantages and Cautions describe the
  product type. They come from cited references: manufacturer type pages, NFPA
  standards and the Fire Code of the Philippines (RA 9514). The sheet says
  that these are general facts for the type. It never states a rating, range
  or discharge time for CTI's unit.

One type sheet covers every size of one product. The masterlist still holds
one record for each code, and the price always comes from that record.

## The list

17 model sheets and 43 type sheets cover 120 masterlist codes and 17 Bluetti
items.

### Power stations (12, all model sheets)

Bluetti items carry PWR codes (PWR-001 to PWR-004), set in
`scripts/clean_bluetti.py`. The 7 items with `on_sale = no` get no sheet.

| # | Slug | Covers |
|---|---|---|
| 1 | bluetti-premium-20 | Premium 20 (AC2P) |
| 2 | bluetti-premium-30-v2 | Premium 30 V2 |
| 3 | bluetti-premium-50 | Premium 50 (AC50P) |
| 4 | bluetti-premium-80 | Premium 80 (AC70P) |
| 5 | bluetti-premium-150 | Premium 150 (AC180P) |
| 6 | bluetti-premium-100-v2 | Premium 100 V2 |
| 7 | bluetti-premium-200-v2 | Premium 200 V2 |
| 8 | bluetti-premium-200 | Premium 200 (AC200PL) |
| 9 | bluetti-apex-300 | APEX300 |
| 10 | bluetti-elite-320 | ELITE320 |
| 11 | bluetti-b300k | B300K expansion battery |
| 12 | bluetti-pv-panels | PV60, PV100, PV130, PV200, PV220, PV350 (CTI calls them Sora) |

### Fire extinguishers (14, type sheets)

| # | Slug | Codes |
|---|---|---|
| 13 | extinguisher-dry-chemical-portable | FIR-001-3LBS, FIR-001-5LBS, FIR-001-10LBS, FIR-001-15LBS, FIR-001-20LBS, FIR-002-1LB-DC, FIR-002-2LBS-DC, FIR-002-3LBS-DC, FIR-002-5LBS-DC, FIR-002-10LBS-DC, FIR-002-20LBS-DC |
| 14 | extinguisher-dry-chemical-wheeled | FIR-001-50LBS, FIR-001-100LBS, FIR-001-200LBS, FIR-002-50LBS-DC, FIR-002-100LBS-DC, FIR-002-200LBS-DC |
| 15 | extinguisher-afff-portable | FIR-002-3LBS-AFFF, FIR-002-5LBS-AFFF, FIR-002-10LBS-AFFF, FIR-002-20LBS-AFFF |
| 16 | extinguisher-afff-wheeled | FIR-002-50LBS-AFFF ⚠, FIR-002-100LBS-AFFF, FIR-002-200LBS-AFFF |
| 17 | extinguisher-hcfc-portable | FIR-002-5LBS-HCFC, FIR-002-10LBS-HCFC, FIR-002-20LBS-HCFC |
| 18 | extinguisher-hcfc-ceiling | FIR-001-HCFC10LBS, FIR-001-HCFC20LBS, FIR-002-10LBS-HCFC-CT, FIR-002-20LBS-HCFC-CT |
| 19 | extinguisher-hfc236fa-portable | FIR-002-5LBS-HFC236FA, FIR-002-10LBS-HFC236FA, FIR-002-20LBS-HFC236FA, FIR-002-50LBS-HFC236FA, FIR-002-10LBS-CO2HFC, FIR-002-20LBS-CO2HFC |
| 20 | extinguisher-hfc236fa-ceiling | FIR-002-10LBS-HFC236FA-CT, FIR-002-20LBS-HFC236FA-CT |
| 21 | extinguisher-co2 | FIR-002-10LBS-CO2 |
| 22 | extinguisher-class-k | FIR-002-10LBS-CK, FIR-002-20LBS-CK |
| 23 | fire-ball | FIR-002-FB |
| 24 | bottle-fire-extinguisher | FIR-001-36 |
| 25 | auto-fire-off | FIR-001-06 |
| 26 | extinguisher-cabinet | FIR-002-CAB10, FIR-002-CAB20 |

### Fire blankets, lights and signs (4, type sheets)

| # | Slug | Codes |
|---|---|---|
| 27 | fire-blanket | FIR-001-11A, FIR-001-11B, FIR-001-11C, FIR-001-11D, FIR-001-11E, FIR-002-A, FIR-002-B, FIR-002-C, FIR-002-D |
| 28 | emergency-light-led | FIR-002-20A, FIR-002-20B |
| 29 | exit-sign-lighted | FIR-002-30A, FIR-002-30B |
| 30 | exit-sign-luminous | FIR-002-31A, FIR-002-31B, FIR-002-31C, FIR-002-31D, FIR-002-31E |

### Detection and alarms (12)

| # | Slug | Kind | Codes |
|---|---|---|---|
| 31 | smoke-detector-sd-604pc | model | FIR-001-20 |
| 32 | smoke-alarm-sd-426 | model | FIR-001-22 |
| 33 | smoke-detector-424-220v | model | FIR-001-24 |
| 34 | smoke-detector-interlinked | type | FIR-001-44 |
| 35 | smoke-alarm-battery | type | FIR-001-19, FIR-001-42, FIR-001-43, FIR-002-19 |
| 36 | heat-alarm | type | FIR-001-21 |
| 37 | alarm-bell-es-14 | model | FIR-001-14 |
| 38 | fire-alarm-bell-set | type | FIR-002-21A, FIR-002-21B, FIR-002-21C |
| 39 | fire-call-point | type | FIR-001-16 |
| 40 | led-siren | type | FIR-001-15 |
| 41 | flash-alarm | type | FIR-001-17 |
| 42 | fire-hose-cabinet | type | FIR-002-38A, FIR-002-38B, FIR-002-38C, FIR-002-38D |

### Escape (2, type sheets)

| # | Slug | Codes |
|---|---|---|
| 43 | fire-escape-mask | FIR-001-07 |
| 44 | rope-ladder | FIR-001-45 |

### Flashlights and headlights (4, type sheets)

| # | Slug | Codes |
|---|---|---|
| 45 | headlight | FLA-001-13 ⚠ |
| 46 | flashlight | FLA-001-14 |
| 47 | flashlight-511 | FLA-001-15 |
| 48 | pen-light | WHI-001-12 |

### Water rescue and first aid (12)

| # | Slug | Kind | Codes |
|---|---|---|---|
| 49 | life-ring | type | LIF-001-01A, LIF-001-01B |
| 50 | life-jacket-hd | type | LIF-001-03A, LIF-001-03B |
| 51 | life-jacket-ord | type | LIF-001-04A, LIF-001-04B |
| 52 | life-jacket-inflatable | type | LIF-001-06 |
| 53 | rescue-can | type | LIF-001-08A, LIF-001-08B |
| 54 | rescue-tube | type | LIF-001-09 ⚠ |
| 55 | spine-board | type | LIF-001-10 |
| 56 | rescue-rope | type | LIF-001-12-R10M to LIF-001-12-R200M (12 codes) |
| 57 | first-aid-kit-176 | type | LIF-002-04 |
| 58 | first-aid-kit-basic | type | LIF-002-06 |
| 59 | fox-40-whistles | model | WHI-001-09, WHI-001-10, WHI-001-11 |
| 60 | rescue-whistle | type | WHI-001-08 |

⚠ The code has `data_quality_flag: "duplicate_code_conflict"`. The sheet
can give specs. The agent still warns about the price and refers the user to
sales.

## Left out on purpose

- **Modular tents** (LIF-003-01, LIF-002-05). Every code conflicts.
- **First Aid Kit 326 pcs** (LIF-002-05). The code conflicts with a tent.
- **Names too vague to describe:** Handle Alarm, Fire Proof Sprinkler, Fire
  Sprinkler Head (475L, 700L), SUN Flower Light.
- **Low priority:** firefighter suits and PPE, fire axe, crowbar, glass breaker,
  key box, megaphone.

## Open questions

1. Does CTI know the brand or supplier of the generic items? A known supplier
   changes a type sheet into a model sheet with real specs.
2. The model numbers SD-604PC, SD-426, 424 and ES-14 have no maker in the
   masterlist. If a web search finds no single maker, these become type
   sheets.
