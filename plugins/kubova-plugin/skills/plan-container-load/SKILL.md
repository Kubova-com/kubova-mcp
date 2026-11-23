---
name: plan-container-load
description: Plan how cargo loads into shipping containers or onto pallets with the Kubova tools. Collect carton sizes, weights, quantities and the container choice, call pack_containers, estimate_capacity or generate_report, and explain the plan using only the figures the tools return. Use when the user asks how many cartons fit in a container, how to load a container or pallet, how many containers a shipment needs, how many complete products fit in one container, or wants a load plan or PDF load report. Not for freight rates, customs, bookings or shipment tracking.
---

# Plan a container load with Kubova

The Kubova tools compute load plans. Every number you give the user (pieces loaded, containers used, utilization,
weight, balance) comes from a tool result, not from your own arithmetic.

## 1. Collect the cargo

For each product or SKU, ask for:

- a name;
- length, width and height of one carton or piece;
- weight of one carton or piece;
- quantity.

Ask about limits only when they matter to the user: a carton that must stay upright (`allowRotation`, `orientations`),
nothing on top (`noOverstack`), floor only (`noUnderstack`), or cargo that must come out first (`loadingOrder: "door"`).

If something is missing, ask for it. Do not guess sizes or weights.

## 2. Units

The tools take centimetres and kilograms. When the user gives inches, feet or pounds, convert exactly
(1 in = 2.54 cm, 1 ft = 30.48 cm, 1 lb = 0.45359237 kg), show the converted values to the user before the call, and
answer in the user's units where the result allows it.

## 3. Containers

- Standard containers: `references/standard-containers.json` holds the inner sizes, door sizes and payload of the
  20' DC, 40' DC and 40' HC. Pass the entry as `container`, or several as `containers`.
- Any other container or truck: ask for its inner length, width and height, door width and height, and maximum payload.
- `estimate_capacity` uses the three standard containers when `containers` is omitted.

## 4. Pick the tool

| The user wants | Tool |
|---|---|
| A plan for a list of cartons, or how many containers a shipment needs | `pack_containers` |
| Cartons stacked on pallets first, then the pallets loaded | `pack_containers` with `loadingMode: "pallet"` and a `pallet` |
| How many complete products (sets of one or more cartons) fit in one container | `estimate_capacity` |
| A PDF load report | `generate_report`, passing the `result` of the earlier `pack_containers` call so the report shows that same plan |
| To check the connection or which workspace is used | `verify_key` |

Call one tool per question. Do not run extra calculations the user did not ask for.

## 5. Explain the result

Report what the tool returned:

- pieces loaded against pieces requested, and any unplaced pieces with their SKU;
- containers used;
- volume utilization and total weight per container;
- the weight balance flags, when present;
- the loading order, if the user asks how to load.

Do not claim the cargo would fit a different container, or fewer containers, unless you ran the tool for that case.
Offer to run it instead.

## 6. When a call fails

Show the tool's message in plain words and say what to change (for example a size above the container's inner size).
If the message is about the account, the plan or the monthly limit, tell the user that and stop; do not retry in a
loop.

## 7. Feedback

Use `send_feedback` only when the user asks to send feedback to the Kubova team. Show them the exact text first, and
include their cargo data only if they agree.

## Data

Cargo data goes to Kubova for the calculation. Feedback the user chooses to send is stored with their account. See
https://kubova.com/en/privacy.
