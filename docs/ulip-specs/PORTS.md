# ULIP Port API Specifications (JNPT, MBPT, IPORTMAN)

Extracted offline from the three ULIP Integration Requirement PDFs with `pdftotext -layout`. Where PDF layout broke a JSON sample, it was rejoined; any value or placeholder the document does not give is marked as such.

- JNPT: Version 5.0, dated 20/05/2026, 13 pages
- MBPT: Version 3.0, dated 20/05/2026, 16 pages
- IPORTMAN: Version 2.0, dated 01/10/2024, 21 pages

Page counts come from form-feed counts in the extracted text (pdfinfo was not available).

---

## JNPT/01 — Vessel call (VCN) details
**Purpose:** This API takes VCN number and connects with JNPT API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vcnNo | Required | ^[a-zA-Z0-9]{2,14}$ | Min 2, Max 14 | vessel call number as available in JNPT system. |

**Example request body:** `{"vcnNo":"M7264"}`

**Response — found:**
```json
{
  "response": [
    {
      "response": [
        {
          "Bombay=Mumbai(exBombay)": "<no value in document>",
          "Application Type": "I",
          "IMO Numner": "9804928",
          "Shipping Line Code": "",
          "ShippingAgentCode": "GAC02",
          "Last Port of Call Name.": "<no value in document>",
          "Vessel Name": "MT FURANO GALAXY",
          "ATA": null,
          "ATD": null,
          "ETA": "20/07/2021 20:20",
          "VCN No": "M7264",
          "ETD": "21/07/2021 16:17",
          "Port Of Arrival Name": "HaziraPort/Surat",
          "Vessel Type": "F"
        }
      ],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": [],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: vcnNo. Format should follow ^[a-zA-Z0-9]{2,14}$` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- Bombay=Mumbai(exBombay) — no description given (no value in document)
- Application Type — no description given
- IMO Numner — no description given
- Shipping Line Code — no description given
- ShippingAgentCode — no description given
- Last Port of Call Name. — no description given (no value in document)
- Vessel Name — no description given
- ATA — no description given
- ATD — no description given
- ETA — no description given
- VCN No — no description given
- ETD — no description given
- Port Of Arrival Name — no description given
- Vessel Type — no description given

**Document problems:**
- The found-response sample is corrupted by PDF layout. The key `"Bombay=Mumbai(exBombay)"` has no value. `"Last Port of Call Name."` has no value. The `error`, `code` and `message` lines sit in the middle of the inner object in the PDF; they are shown here at the outer level, matching the other samples. The two placeholders above are not from the document.
- Key spellings differ: `IMO Numner` (typo), `ShippingAgentCode` vs `Shipping Line Code`, `VCN No` in the response vs `vcnNo` in the request, `Port Of Arrival Name` casing.
- Section 1.3.1 example says VCN number `M726412`, but the request samples use `M7264`.
- Status code list gives 200 as "vessel data response". No other response fields are described.

---

## JNPT/02 — Bill of Entry (BE) cargo details
**Purpose:** This API will take VCN number, BE number and shipping bill number and connect with JNPT API to get data. (The document's text, but only `beNo` is a request field.)
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| beNo | Required | [a-zA-Z0-9]{7} | 7 | Bill of Entry Number as available in JNPT system. |

**Example request body:** `{"beNo":"BEK7262"}` (the production text line shows `{beNo":"BEK7262"}` with a missing opening quote; the production curl body is `{"beNo":"BEK7262"}`)

**Response — found:**
```json
{
  "response": [
    {
      "response": [
        {
          "Marks No": null,
          "IGM Date": "26/07/2021 00:00",
          "Out of Charge Date": null,
          "Mode of Transport": "R",
          "CHA Code": "AAK02",
          "IGM NO": 312,
          "Out of Charge No": null,
          "Survey Date": null,
          "DO Date": null,
          "Goods Description": null,
          "Importer Address": null,
          "Nature of Cargo": "C",
          "Type of Packages": "PROJECT COACHES",
          "Vehicle Info": [
            {
              "Vehicle Number": "TRK145570",
              "Truck Entry Permit No": null,
              "Truck Entry Time": null,
              "Truck Exit Time": null,
              "vehicleNum": "TRK145570"
            }
          ],
          "Unit of Measurement": null,
          "Be No": "BE5787",
          "Line No": null,
          "Delivery Oder No": 109,
          "BL No": null,
          "Be Date": "26/07/2021 00:00",
          "Importer Name": null,
          "Surveyor Code": "",
          "No of Packages Qty": null,
          "Sub Line No": null,
          "Cargo Type": "PROJECT",
          "Country of Origin": null
        }
      ],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": [],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: beNo. Format should follow [a-zA-Z0-9]{7}` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- Marks No — no description given
- IGM Date — no description given
- Out of Charge Date — no description given
- Mode of Transport — no description given
- CHA Code — no description given
- IGM NO — no description given
- Out of Charge No — no description given
- Survey Date — no description given
- DO Date — no description given
- Goods Description — no description given
- Importer Address — no description given
- Nature of Cargo — no description given
- Type of Packages — no description given
- Vehicle Info (array) — no description given
  - Vehicle Number — no description given
  - Truck Entry Permit No — no description given
  - Truck Entry Time — no description given
  - Truck Exit Time — no description given
  - vehicleNum — no description given
- Unit of Measurement — no description given
- Be No — no description given
- Line No — no description given
- Delivery Oder No — no description given
- BL No — no description given
- Be Date — no description given
- Importer Name — no description given
- Surveyor Code — no description given
- No of Packages Qty — no description given
- Sub Line No — no description given
- Cargo Type — no description given
- Country of Origin — no description given

**Document problems:**
- Purpose text lists VCN number, BE number and shipping bill number, but this API takes only `beNo`. The same text appears under JNPT/03.
- Technical approach example says "BE number 4756840 and shipping bill number", which does not match the request sample `BEK7262` and mentions a shipping bill number.
- Production example text has a missing opening quote (`{beNo":"BEK7262"}`).
- The found sample's `Be No` is `BE5787`, not the requested `BEK7262`. The sample `Vehicle Info` array had a trailing comma in the PDF, which was removed to make the JSON valid.
- Key spelling varies: `Be No` / `beNo`, `IGM NO`, `Delivery Oder No` (typo).
- Status code list describes 200 as "vehicle data response" for cargo data.
- Technical approach step numbering continues from JNPT/01 (6 to 10).

---

## JNPT/03 — Shipping bill details
**Purpose:** This API will take VCN number, BE number and shipping bill number and connect with JNPT API to get data. (The document's text, but only `sbillNo` is a request field.)
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| sbillNo | Required | [0-9]{7} | 7 | Shipping Bill number as available in JNPT system. |

**Example request body:** `{"sbillNo":"2321654"}`

**Response — found:**
```json
{
  "response": [
    {
      "response": [
        {
          "Leo Date": null,
          "Nature of Cargo": null,
          "Vehicle Info": null,
          "Vcn No": "KJ8777",
          "Port of Loading": "SAIM PORT",
          "Exporter Name": "ACT INFRAPORT LTD.,",
          "Port of Destination Code": null,
          "Port of Origin": null,
          "Rotation Date": null,
          "Shipping Bill No": "2321654",
          "Port Where SB Filed": null,
          "Allow for Shipment Date": null,
          "Shipping Date": "29/06/2021 00:00",
          "EGM Date": null,
          "EGM No": null,
          "Cargo Type": "LIQUID",
          "Rotation No": null
        }
      ],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": [],
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: sbillNo. Format should follow [0-9]{7}` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- Leo Date — no description given
- Nature of Cargo — no description given
- Vehicle Info — no description given
- Vcn No — no description given
- Port of Loading — no description given
- Exporter Name — no description given
- Port of Destination Code — no description given
- Port of Origin — no description given
- Rotation Date — no description given
- Shipping Bill No — no description given
- Port Where SB Filed — no description given
- Allow for Shipment Date — no description given
- Shipping Date — no description given
- EGM Date — no description given
- EGM No — no description given
- Cargo Type — no description given
- Rotation No — no description given

**Document problems:**
- Purpose text is copied from JNPT/02 and names VCN and BE numbers, which this API does not use.
- Status code list describes 200 as "vehicle data response" for shipping bill data.
- Key spelling differs from JNPT/01: `Vcn No` here vs `VCN No` there. `Leo Date` is spelled as in the document.
- Exporter Name value has a trailing comma (`"ACT INFRAPORT LTD.,"`), kept as printed.
- Technical approach numbering continues from JNPT/02 (11 to 15).

---

## MBPT/01 — Vessel call (VCN) details
**Purpose:** This API will take VCN number and connect with MBPT API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vcnNo | Required | ^[a-zA-Z0-9]{2,14}$ | Min 2, Max 14 | vessel call number as available in MBPT system. |

**Example request body:** `{"vcnNo": "2101485"}`

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "VoyageDetails": {
          "IMO_NUMBER": "M00066",
          "APPLICATION_TYPE": "I",
          "SHIPPING_AGENT_CODE": "KHA01",
          "ATA": "04.03.2021:15:45",
          "ATD": null,
          "PORT_OF_ARRIVAL_NAME": null,
          "VESSEL_TYPE": "WATR",
          "ETA": "20.01.2021:17:40",
          "ETD": "06.05.2021:23:59",
          "VIA_NO": "2101485",
          "LAST_PORT_OF_CALL_NAME": "INBOM",
          "VESSEL_NAME": "AQUA",
          "SHIPPING_LINE_CODE": "KHA"
        },
        "message": "Success",
        "status": "0"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "status": "1",
        "Error": 256,
        "message": "Invalid VCN Number"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: vcnNo. Format should follow ^[a-zA-Z0-9]{2,14}$` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- status — no description given (sample value "0" in found, "1" in not found)
- VoyageDetails (object) — no description given
  - IMO_NUMBER — no description given
  - APPLICATION_TYPE — no description given
  - SHIPPING_AGENT_CODE — no description given
  - ATA — no description given
  - ATD — no description given
  - PORT_OF_ARRIVAL_NAME — no description given
  - VESSEL_TYPE — no description given
  - ETA — no description given
  - ETD — no description given
  - VIA_NO — no description given
  - LAST_PORT_OF_CALL_NAME — no description given
  - VESSEL_NAME — no description given
  - SHIPPING_LINE_CODE — no description given

**Document problems:**
- Overview paragraph says users share "VCN number, Send Export Gate Pass Details, and Send Import Gate Pass Details". This API takes only the VCN number.
- Status code list describes 200 as "vessel data response".
- The not-found sample uses `"Error": 256` (capital E) and `"status": "1"`. The found sample uses `"status": "0"`. Neither is described.
- Sample `IMO_NUMBER` is `M00066`, which is not numeric like the JNPT IMO sample. Shown as given.
- Date formats differ from JNPT: `04.03.2021:15:45` here vs `20/07/2021 20:20` there.

---

## MBPT/02 — Import gate (IGM) details
**Purpose:** This API will take import gate details and connect with MBPT API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| igmNo | Required | [0-9]{7} | 7 | Igm Number as available in MBPT system. |
| igmDate | Required | [0-9]{8} | 8 | Igm date as available in MBPT system |
| itemNo | Required | [0-9]{1,2} | 2 | Item number as available in MBPT system |

**Example request body:** `{"igmNo" : "2283545", "igmDate" : "26052021", "itemNo" : "8"}`

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "IgmGPDtls": {
          "bl_no": "77SE21050257",
          "no_of_packages_qty": "2",
          "goods_description": "KNEADER REACTOR HS CODE 8479820090 6000L SOLVENT WASHER REACTOR SS304L(6000L KNEADER REACTOR) SPECIA",
          "importer_name": "UPL LIMITED JHAGADIA",
          "delivery_order_no": "120210608982541",
          "crg_type": "G",
          "be_date": "24052021",
          "out_of_charge_date": "04062021",
          "unit_of_measurement": "MT",
          "Item_no": "8",
          "type_of_packages": "PKG",
          "nature_of_cargo": "DB",
          "surveyor_code": "Dummy",
          "vehicle_info": [
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "SSM",
              "TRUCK_EXIT_TIME": "08062021",
              "TRUCK_ENTRY_TIME": "08062021"
            }
          ],
          "do_date": "08062021",
          "marks_no": "UPL LIMITED INVOICE NUMBER AND DATE SSDC20210412 AND APRIL 12, 2021 PURCHASE ORDER NUMBER: 4510261808",
          "line_no": "8",
          "importer_address": "PLOT NO 746/750, PO BOX NO 9 393110 JHAGADIA BHARUCH INDIA",
          "country_of_origin": "2041951813",
          "be_no": "4062308",
          "sub_line_no": "0",
          "igm_date": "26052021",
          "survey_date": "",
          "igm_no": "2283545",
          "cha_code": "11/779"
        },
        "message": "Success",
        "status": "0"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "status": "1",
        "message": "No records found "
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: igmNo. Format should follow [0-9]{7}` (response: null, error: "true", code: "400")
- `Data format failed OR wrong value entered at: igmDate. Format should follow [0-9]{8}` (response: null, error: "true", code: "400")
- `Data format failed OR wrong value entered at: itemNo. Format should follow [0-9]{1,2}` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- status — no description given
- IgmGPDtls (object) — no description given
  - bl_no — no description given
  - no_of_packages_qty — no description given
  - goods_description — no description given
  - importer_name — no description given
  - delivery_order_no — no description given
  - crg_type — no description given
  - be_date — no description given
  - out_of_charge_date — no description given
  - unit_of_measurement — no description given
  - Item_no — no description given
  - type_of_packages — no description given
  - nature_of_cargo — no description given
  - surveyor_code — no description given
  - vehicle_info (array) — no description given
    - TRUCK_ENTRY_PERMIT_NO, VEHICLE_NUMBER, TRUCK_EXIT_TIME, TRUCK_ENTRY_TIME — no description given
  - do_date — no description given
  - marks_no — no description given
  - line_no — no description given
  - importer_address — no description given
  - country_of_origin — no description given
  - be_no — no description given
  - sub_line_no — no description given
  - igm_date — no description given
  - survey_date — no description given
  - igm_no — no description given
  - cha_code — no description given

**Document problems:**
- Section letters for invalid-format cases start at `d)` (after the "Response" heading), then `e)` and `f)`. The letters are not a) to c).
- Key spelling varies: `Item_no` in the response vs `itemNo` in the request; `igm_no` / `igmNo`.
- `goods_description` ends in "SPECIA", which looks truncated in the source. The `goods_description`, `marks_no` and `importer_address` values wrap across lines in the PDF; they are rejoined here with a single space.
- `country_of_origin` is `"2041951813"`, a numeric value in a field that looks like a country code. Shown as given.
- Sample `surveyor_code` is `"Dummy"`.
- Status code list describes 200 as "IGM data response".

---

## MBPT/03 — Shipping bill (export) details
**Purpose:** This API will take shipping bill number and shipping bill date and connect with MBPT API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| shppingBillNo (as printed in the field table; the request sample uses `shippingBillNo`) | Required | [0-9]{7} | 7 | Shipping Bill number as available in MBPT system. |
| shippingBillDate (table shows "shippingBill Date", split across lines) | required | [0-9]{8} | 8 | Shipping bill date as per MBPT system. |

**Example request body:** `{"shippingBillNo": "2132144", "shippingBillDate" : "01062021"}`

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "ExpGPDtls": {
          "egm_date": "",
          "egm_no": "",
          "exporter_name": "SKODA AUTO VOLKSWAGEN INDIA PRIVATE LIMITED",
          "port_where_sb_filed": "INBOM1",
          "importer_address": "",
          "goods_description": "",
          "port_of_loading": "INBOM1",
          "cargo_type": "BK",
          "rotation_date": "07.06.2021:00:00",
          "importer_name": "",
          "allow_for_shipment_date": "12.06.2021:00:00",
          "leo_date": "12.06.2021:00:00",
          "rotation_no": "224366",
          "shipping_bill_date": "01062021",
          "vehicle_info ": [
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NC123",
              "TRUCK_EXIT_TIME": null,
              "TRUCK_ENTRY_TIME": "01062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AD8109",
              "TRUCK_EXIT_TIME": "02062021",
              "TRUCK_ENTRY_TIME": "02062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AD3147",
              "TRUCK_EXIT_TIME": null,
              "TRUCK_ENTRY_TIME": "02062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AC6461",
              "TRUCK_EXIT_TIME": "02062021",
              "TRUCK_ENTRY_TIME": "02062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AC5539",
              "TRUCK_EXIT_TIME": "02062021",
              "TRUCK_ENTRY_TIME": "02062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AC3494",
              "TRUCK_EXIT_TIME": "02062021",
              "TRUCK_ENTRY_TIME": "02062021"
            },
            {
              "TRUCK_ENTRY_PERMIT_NO": null,
              "VEHICLE_NUMBER": "NL01AD3145",
              "TRUCK_EXIT_TIME": null,
              "TRUCK_ENTRY_TIME": "02062021"
            }
          ],
          "cha_code": "",
          "port_of_origin": "INBOM1",
          "shipping_bill_no": "2132144",
          "vcn_no": "2106140",
          "nature_of_cargo": "BK",
          "port_of_destination_code": "MXVER"
        },
        "message": "Success",
        "status": "0"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "status": "1",
        "message": "No records found "
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: shippingBillNo. Format should follow [0-9]{7}` (response: null, error: "true", code: "400")
- `Data format failed OR wrong value entered at: shippingBillDate. Format should follow [0-9]{8}` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- status — no description given
- ExpGPDtls (object) — no description given
  - egm_date, egm_no — no description given
  - exporter_name — no description given
  - port_where_sb_filed — no description given
  - importer_address — no description given
  - goods_description — no description given
  - port_of_loading — no description given
  - cargo_type — no description given
  - rotation_date — no description given
  - importer_name — no description given
  - allow_for_shipment_date — no description given
  - leo_date — no description given
  - rotation_no — no description given
  - shipping_bill_date — no description given
  - vehicle_info (array; key spelled with a trailing space in the document) — no description given
    - TRUCK_ENTRY_PERMIT_NO, VEHICLE_NUMBER, TRUCK_EXIT_TIME, TRUCK_ENTRY_TIME — no description given
  - cha_code — no description given
  - port_of_origin — no description given
  - shipping_bill_no — no description given
  - vcn_no — no description given
  - nature_of_cargo — no description given
  - port_of_destination_code — no description given

**Document problems:**
- Technical approach step 12 says "ULIP system will provide Send Export Gate Pass Details", which is copied from another section.
- Field name spelling: the field table reads `shppingBillNo`, while the request sample and the invalid-input message use `shippingBillNo`.
- Found-response key is `"vehicle_info "` with a trailing space, while MBPT/02 uses `"vehicle_info"`.
- Section letters for invalid-format cases are `g)`, `h)` and `i)`, continuing from MBPT/02 instead of starting at a).
- Date formats differ within the sample: `07.06.2021:00:00` for `rotation_date` vs `01062021` for `shipping_bill_date`.
- Status code list describes 200 as "export data response".

---

## IPORTMAN/01 — Vessel details by VCN and port
**Purpose:** This API will take below details and connect with IPORTMAN API to get data. (The overall description says it takes VCN Number and Port Code.)
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| portCode | Required | [A-Z0-9]+ | Not defined | The Port code in the IPORTMAN system |
| vcnNo | Required | ^[a-zA-Z0-9]{2,14}$ (typeset in the document as '^[a-zA-Z0-9]{2,14}$') | Min 2, Max 14 | VCN number present in IPORTMAN system |

**Example request body (production):**
```json
{
  "portCode": "INMAA1",
  "vcnNo": "INMAA120210958"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "imo_number": "6680021",
        "shipping_line_code": "INMAA120210958",
        "last_port_of_call_name": "Abu Dhabi",
        "eta": "2021-08-16 23:00:00",
        "etd": "2021-08-18 23:00:00",
        "application_type": "IMPORT",
        "port_of_arrival_name": "INMAA120210958",
        "vessel_type": "Carrier general cargo/container",
        "shipping_agent_code": "70001246",
        "vessel_name": "MV RANOP",
        "vcn_no": "INMAA120210958"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "imo_number": null,
        "shipping_line_code": null,
        "last_port_of_call_name": null,
        "eta": null,
        "etd": null,
        "application_type": null,
        "port_of_arrival_name": null,
        "vessel_type": null,
        "shipping_agent_code": null,
        "vessel_name": null,
        "vcn_no": null,
        "error": "Data is not available for given Vcn No : AA"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: VCN Number. Format should follow ^[a-zA-Z0-9]{2,14}$'` (response: null, error: "true", code: "400"; the document has a stray trailing apostrophe after the regex)

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- imo_number — no description given
- shipping_line_code — no description given
- last_port_of_call_name — no description given
- eta — no description given
- etd — no description given
- application_type — no description given
- port_of_arrival_name — no description given
- vessel_type — no description given
- shipping_agent_code — no description given
- vessel_name — no description given
- vcn_no — no description given

**Document problems:**
- Request is described as "passed within the URL parameters in JSON format", but all examples send a JSON body with `--data-raw`.
- Authentication is inconsistent. Section 1.3.1 says "We have to send secret key with header" and refers to Section 1.6, which describes Bearer tokens. The header name and how the key is obtained are not given.
- The invalid-input message says "at: VCN Number" but the field is `vcnNo`.
- Section 1.6 example body is `{"portCode":"INMAA1","vcnNo": " INMAA120210958"}`, with a leading space in the VCN value. That value would fail the regex.
- The not-found sample's error text says "Vcn No : AA", which does not match the example VCN.
- The not-found sample has an `error` key inside the `response` object, plus the outer `error` "false".
- Status code list describes 200 as "vessel data response".

---

## IPORTMAN/02 — BE details by BE number, date and port
**Purpose:** This API will take below details and connect with IPORTMAN API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| portCode | Required | [A-Z0-9]+ | Not defined | The Port code in the IPORTMAN system |
| beNo | Required | [0-9]{1,7} | Min 1, Max 7 | BE number present in IPORTMAN system |
| beDate | Required | [0-9]{8} | 8 | BE Date number present in IPORTMAN system |

**Example request body (production):**
```json
{
  "portCode": "INMAA1",
  "beNo": "8987001",
  "beDate": "01082021"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "igm_no": "CRUDE OIL",
        "igm_date": "2021-08-01 00:00:00",
        "line_no": null,
        "sub_line_no": null,
        "bl_no": null,
        "be_no": "BL71",
        "be_date": "2021-08-01 00:00:00",
        "importer_name": null,
        "importer_address": "Metric Ton",
        "cha_code": "70001242",
        "nature_of_cargo": "LB",
        "cargo_type": null,
        "goods_description": null,
        "marks_no": null,
        "no_of_packages_qty": null,
        "type_of_packages": null,
        "unit_of_measurement": null,
        "country_of_origin": "AE",
        "out_of_charge_no": 6497453,
        "out_of_charge_date": "2021-08-05 11:35:00",
        "delivery_order_no": "7321234",
        "do_date": "2021-08-05 00:00:00",
        "mode_of_transport": null,
        "survey_date": null,
        "surveyor_code": null,
        "vehicle_info": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "igm_no": null,
        "igm_date": null,
        "line_no": null,
        "sub_line_no": null,
        "bl_no": null,
        "be_no": null,
        "be_date": null,
        "importer_name": null,
        "importer_address": null,
        "cha_code": null,
        "nature_of_cargo": null,
        "cargo_type": null,
        "goods_description": null,
        "marks_no": null,
        "no_of_packages_qty": null,
        "type_of_packages": null,
        "unit_of_measurement": null,
        "country_of_origin": null,
        "out_of_charge_no": null,
        "delivery_order_no": null,
        "do_date": null,
        "mode_of_transport": null,
        "survey_date": null,
        "surveyor_code": null,
        "vehicle_info": null,
        "error": "Data is not available for given Be No : 89"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: beNo. Format should follow [0-9]{1,7}` (response: null, error: "true", code: "400")
- `Data format failed OR wrong value entered at: beNo. Format should follow [0-9]{8}` (response: null, error: "true", code: "400"; this message names `beNo` for the BE Date case, as printed)

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- igm_no — no description given
- igm_date — no description given
- line_no — no description given
- sub_line_no — no description given
- bl_no — no description given
- be_no — no description given
- be_date — no description given
- importer_name — no description given
- importer_address — no description given
- cha_code — no description given
- nature_of_cargo — no description given
- cargo_type — no description given
- goods_description — no description given
- marks_no — no description given
- no_of_packages_qty — no description given
- type_of_packages — no description given
- unit_of_measurement — no description given
- country_of_origin — no description given
- out_of_charge_no — no description given
- out_of_charge_date — no description given
- delivery_order_no — no description given
- do_date — no description given
- mode_of_transport — no description given
- survey_date — no description given
- surveyor_code — no description given
- vehicle_info — no description given

**Document problems:**
- The invalid BE Date message says "at: beNo" but should name `beDate`. Shown as printed.
- Technical approach step 4 says "IPORTMAN API will share information which exist in PCS system", which is copied from another document.
- Request is described as "passed within the URL parameters in JSON format", but examples send a JSON body.
- Secret-key authentication is unclear, as in IPORTMAN/01.
- The found sample does not match the request: `be_no` is `"BL71"` (request `8987001`), and `igm_no` is `"CRUDE OIL"`, which looks like a description, not a number. `importer_address` is `"Metric Ton"`.
- `out_of_charge_no` is numeric in the found sample. `out_of_charge_date` appears in the found sample but not in the not-found sample.
- Not-found error text "Be No : 89" looks truncated.
- Status code list describes 200 as "vessel data response".

---

## IPORTMAN/03 — Shipping bill details by SB number, date and port
**Purpose:** This API will take below details and connect with IPORTMAN API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| portCode | Required | [A-Z0-9]+ | Not defined | The Port code in the IPORTMAN system |
| shippingBillNo | Required | [0-9]{1,7} | Min 1, Max 7 | Shipping Bill number present in IPORTMAN system |
| shippingBillDate (table shows "shippingBillDat" + "e", split across lines) | Required | [0-9]{8} | 8 | Shipping Bill Date present in IPORTMAN system |

**Example request body (production):**
```json
{
  "portCode": "INMAA1",
  "shippingBillNo": "9847542",
  "shippingBillDate": "01082021"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "egm_no": "159357",
        "egm_date": "2021-08-03 15:17:00",
        "shipping_bill_no": "9847542",
        "shipping_bill_date": "2021-08-01 00:00:00",
        "nature_of_cargo": "DB",
        "cargo_type": null,
        "exporter_name": "JSW STEELS LIMITED",
        "port_where_sb_filed": "INMAA1",
        "port_of_origin": "INMAA1",
        "port_of_destination_code": "AEAUH1",
        "vehicle_info": null,
        "rotation_no": "7266535",
        "leo_date": "2021-08-02 00:00:00",
        "rotation_date": "2021-07-26 00:00:00",
        "vcn_no": null,
        "allow_for_shipment_date": null,
        "port_of_loading": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — not found:**
```json
{
  "response": [
    {
      "response": {
        "egm_no": null,
        "egm_date": null,
        "shipping_bill_no": null,
        "shipping_bill_date": null,
        "nature_of_cargo": null,
        "cargo_type": null,
        "exporter_name": null,
        "port_where_sb_filed": null,
        "port_of_origin": null,
        "port_of_destination_code": null,
        "vehicle_info": null,
        "rotation_no": null,
        "leo_date": null,
        "rotation_date": null,
        "vcn_no": null,
        "allow_for_shipment_date": null,
        "port_of_loading": null,
        "error": "Data is not available for given Shipping Bill No : 98"
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:**
- `Data format failed OR wrong value entered at: shippingBillNO. Format should follow [0-9]{1,7}` (response: null, error: "true", code: "400"; the document prints `shippingBillNO` with a capital O)
- `Data format failed OR wrong value entered at: shippingBillDate. Format should follow [0-9]{8}` (response: null, error: "true", code: "400")

**Response field meanings:**
- response — no description given
- responseStatus — no description given
- error — no description given
- code — no description given
- message — no description given
- egm_no — no description given
- egm_date — no description given
- shipping_bill_no — no description given
- shipping_bill_date — no description given
- nature_of_cargo — no description given
- cargo_type — no description given
- exporter_name — no description given
- port_where_sb_filed — no description given
- port_of_origin — no description given
- port_of_destination_code — no description given
- vehicle_info — no description given
- rotation_no — no description given
- leo_date — no description given
- rotation_date — no description given
- vcn_no — no description given
- allow_for_shipment_date — no description given
- port_of_loading — no description given

**Document problems:**
- Invalid-input message prints `shippingBillNO` (capital O), while the field is `shippingBillNo`.
- Request is described as "passed within the URL parameters in JSON format", but examples send a JSON body.
- Secret-key authentication is unclear, as in IPORTMAN/01.
- Status code list describes 200 as "vessel data response".
- Purpose line ends with "data.." (double period). Technical approach refers to "SB Date", while the field is `shippingBillDate`.
- After the Section 1.5 status codes, a "Different Port Code IDENTIFIER" table lists six port codes (INMAA1, INBOM1, INPRT1, INXY1, INCCU1, INHAL1). Column layout is broken: INPRT1 sits in the identifier column, and PORT_NAME is not printed for row 3. Every identifier and identifier-type value is "N/A". No description of how the codes are used is given.

---

## General notes (IPORTMAN)
- Section 1.6 (authentication) describes Bearer tokens and a login endpoint. Sections 1.3.1 to 1.5.1 refer to a "secret key" in a header. The document never names that header or explains how to obtain the key.
- Section 1.6 example body uses a leading space in `vcnNo` (see IPORTMAN/01).
