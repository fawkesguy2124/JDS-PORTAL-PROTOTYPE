# ULIP ICEGATE API specifications

Source: ULIP Integration Requirement Document, version 4.0 (cover date 08/11/2021), 66 pages. Extracted from ULIP_ICEGATE_Integration_Requirement.pdf. Line breaks inside error messages and sample JSON were rejoined; no keys or values were changed.

## General document problems (apply to all sections)

- **G1 Versions:** The cover says version 4.0 dated 08/11/2021. The revision history lists 4.0 as 03/02/2025, 3.0 as 09/05/2025 (later than 4.0) and 2.0 as 01/10/2024.
- **G2 Auth reference:** Every section says "For obtaining authentication token, refer Section 1.6". Section 1.6 is ICEGATE/04. The authentication mechanism is in section 1.16.
- **G3 Copy-paste status text:** Every section's status-code list says "Status Code 200: vehicle data response", including non-vehicle APIs.
- **G4 HTTP status:** Validation errors are shown as a JSON body with `"code": "400"`. The document does not say which HTTP status code these return.
- **G5 Technical approach:** Step 3 of most sections says "cargo information", which does not match several responses (for example 04, 06, 11, 13).
- **G6 Response descriptions:** No response field is described anywhere in the document. Every response field below is marked "no description given".
- **G7 Garbled tables:** The PDF table layout for ICEGATE/01-08 is garbled. The Required column reads "d/Not Require", which was read as Required. Length cells are approximate where noted.
- **G8 Field names in messages:** For several APIs the field name appears only in a margin annotation and not in the message text. The margin label is quoted in each section.
- **G9 Regex mismatches:** The regex in the field table often differs from the regex in the error message. Each is listed in the relevant section.
- **G10 Login example:** The login example in section 1.16 has backtick and `-data` typos.
- **G11 Tokens:** Bearer tokens in curl examples are not copied. They are written as `<token>`.

---

## ICEGATE/01 — Vessel call (IGM) details by IGM number
**Purpose:** "This API will take VCN number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| igmNo | Required | [0-9]{1,7} | Min 1, Max 7 | vessel call number as available in ICEGATE system. |
| igmDt | Required | [0-9]{8} | Max 8 | IGM date |

**Example request body:**
```json
{"igmNo":"2001362","igmDt":"11102018"}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "voyageNo": "NILLL",
        "vesselType": "C",
        "containerNo": [
          "MLCU1234567",
          "TRLU1234567",
          "TTNU1234567",
          "YMLU1234567"
        ],
        "expDtOfArrival": "12102018",
        "portOfArrival": "INCCU1",
        "imoCodeOfVessel": "-",
        "igmDt": "11102018",
        "igmNo": 2001362,
        "vesselCode": "394137",
        "totalNoOfLines": 4,
        "masterName": "."
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
        "voyageNo": null,
        "vesselType": null,
        "containerNo": null,
        "expDtOfArrival": null,
        "portOfArrival": null,
        "imoCodeOfVessel": null,
        "igmDt": null,
        "igmNo": null,
        "vesselCode": null,
        "totalNoOfLines": null,
        "masterName": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: Format should follow [0-9]{1,10}` (margin label: "igmNo.")
- `Data format failed OR wrong value entered at: igmDt. Format should follow [0-9]{8}`

**Response field meanings:** (wrapper fields `response`, `responseStatus`, `error`, `code`, `message`: no description given)
- `voyageNo`: no description given
- `vesselType`: no description given
- `containerNo`: no description given
- `expDtOfArrival`: no description given
- `portOfArrival`: no description given
- `imoCodeOfVessel`: no description given
- `igmDt`: no description given
- `igmNo`: no description given
- `vesselCode`: no description given
- `totalNoOfLines`: no description given
- `masterName`: no description given

**Document problems:**
- Purpose sentence says "VCN number", but the field is `igmNo` and the technical approach says "IGM number".
- Table regex is `[0-9]{1,7}` and the length is Max 7. The invalid-input message says `[0-9]{1,10}`.
- The invalid-igmNo message does not name the field in its text. The margin label is "igmNo.".
- The sample request sends `igmNo` as a string. The sample response returns `igmNo` as a number.
- See G2, G3, G4.

---

## ICEGATE/02 — Bill of Entry (BE) cargo details
**Purpose:** "This API will take BE number and BE date and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| beNo | Required | [0-9]{1,7} | 7 | Bill of Entry Number as available in ICEGATE system. |
| beDt | Required | [0-9]{8} | 8 | BE date |

**Example request body:**
```json
{"beNo":"2002892","beDt":"16072011"}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "boeDetails": [
          {
            "imoCode": "1000000",
            "containerNo": [
              "MSCU7786602"
            ],
            "unitOfQt": "MTS",
            "igmDt": "04072011",
            "natureOfCargo": "C",
            "countryOrig": "BR",
            "grossWt": 25.99,
            "totNoPkg": 56
          }
        ]
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
        "boeDetails": []
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: beNo. Format should follow [0-9]{7}`
- `Data format failed OR wrong value entered at: beDt. Format should follow [0-9]{8}`

**Response field meanings:** (wrapper fields: no description given)
- `boeDetails`: no description given
- `imoCode`: no description given
- `containerNo`: no description given
- `unitOfQt`: no description given
- `igmDt`: no description given
- `natureOfCargo`: no description given
- `countryOrig`: no description given
- `grossWt`: no description given
- `totNoPkg`: no description given

**Document problems:**
- Table regex is `[0-9]{1,7}` but the invalid-input message says `[0-9]{7}`.
- See G2, G3, G4.

---

## ICEGATE/03 — BE out-of-charge (OOC) details
**Purpose:** "This API will take shipping bill number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| beNo | Required | [0-9]{1,7} | 7 | Shipping Bill number as available in ICEGATE system. |
| beDt | Required | [0-9]{8} | 8 | BE date |

**Example request body:**
```json
{"beNo":"6330973","beDt":"22032012"}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "oocNo": 2004296615,
        "oocDt": "26032012"
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
        "oocNo": null,
        "oocDt": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [0-9]{7}` (margin label: "beNo. Format")
- `Data format failed OR wrong value entered at: beDt. Format should follow [0-9]{8}`

**Response field meanings:** (wrapper fields: no description given)
- `oocNo`: no description given
- `oocDt`: no description given

**Document problems:**
- Purpose sentence and field description say "shipping bill number" on a BE-named API (`beNo`, `beDt`). The overall section item 3 says "BE number and date", and technical approach step 2 says "BE number".
- Table regex is `[0-9]{1,7}` but the invalid-input message says `[0-9]{7}`.
- The invalid-beNo message does not name the field in its text. The margin label is "beNo. Format".
- The meaning of `oocNo` and `oocDt` is not given.
- See G2, G3, G4.

---

## ICEGATE/04 — Vessel rotation (shipping line / agent) details
**Purpose:** "This API will take shipping bill number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| siteId | Required | [0-9]{6} | 6 | Site ID as available in ICEGATE system. |
| imoCode | Required | [A-Z0-9]{1,25} | Min 1, Max 25 | Unique identifier for ships / registered ship management companies. |
| vesselCode | Required | [A-Z0-9]{1,25} | Min 1, Max 25 | Vessel Code as available in ICEGATE system. |
| arrivalDate | Required | DATE (DDMMYYYY) — no regex given in table | 8 | The date when ship is estimated to arrive at the port of Call. |

**Example request body:**
```json
{
  "siteId": "INBOM1",
  "imoCode": "9241205",
  "vesselCode": "DCNT2",
  "arrivalDate": "15012020"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "shippingLineCode": "MSC",
        "shippingAgentCode": "JMB01",
        "rotationNumber": "1000045",
        "rotationDt": "24012020"
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
      "response": {},
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [A-Z0-9]{6}` (margin label: "siteId. Format")
- `Data format failed OR wrong value entered at: imoCode. Format should follow [A-Z0-9]{1,25}`
- `Data format failed OR wrong value entered at: vesselCode. Format should follow [A-Z0-9]{1,25}`
- `Data format failed OR wrong value entered at: arrivalDate. Format should follow [0-9]{8}`

**Response field meanings:** (wrapper fields: no description given)
- `shippingLineCode`: no description given
- `shippingAgentCode`: no description given
- `rotationNumber`: no description given
- `rotationDt`: no description given

**Document problems:**
- Purpose sentence says "shipping bill number", but the inputs are site ID, IMO code, vessel code and arrival date. The overall section says "arrival data".
- `siteId` table regex is `[0-9]{6}` but the invalid-input message says `[A-Z0-9]{6}`.
- `arrivalDate` has no regex in the table. The message says `[0-9]{8}`.
- The invalid-siteId message does not name the field in its text. The margin label is "siteId. Format".
- Technical approach says "cargo information", but the response contains shipping line, agent and rotation data.
- See G2, G3, G4.

---

## ICEGATE/05 — Shipping bill (SB) cargo details
**Purpose:** "This API will take shipping bill number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| sbNo | Required | [0-9]{7} | 7 | Shipping Bill number as available in ICEGATE system. |
| sbDt | Required | [0-9]{8} | 8 | Shipping Bill date as available in ICEGATE system. |

**Example request body:**
```json
{
  "sbNo": "6845161",
  "sbDt": "02042016"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "sbNo": "6845161",
        "unitOfQt": "null",
        "natureOfCargo": "C",
        "noOfPkgs": 287,
        "portOfDest": "LKCMB",
        "sbDt": "02042016",
        "grossQt": null
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
        "sbNo": null,
        "unitOfQt": null,
        "natureOfCargo": null,
        "noOfPkgs": null,
        "portOfDest": null,
        "sbDt": null,
        "grossQt": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [0-9]{1,7}` (margin label: "sbNo. Format")
- `Data format failed OR wrong value entered at: should follow [0-9]{8}` (margin label: "sbDt. Format")

**Response field meanings:** (wrapper fields: no description given)
- `sbNo`: no description given
- `unitOfQt`: no description given
- `natureOfCargo`: no description given
- `noOfPkgs`: no description given
- `portOfDest`: no description given
- `sbDt`: no description given
- `grossQt`: no description given

**Document problems:**
- Table regex is `[0-9]{7}` but the invalid-input message says `[0-9]{1,7}`.
- The invalid-input messages do not name the field in their text. Margin labels are "sbNo. Format" and "sbDt. Format".
- The sample found response has `unitOfQt` as the string `"null"`, while the not-found sample uses `null`.
- See G2, G3, G4.

---

## ICEGATE/06 — Shipping bill LEO date
**Purpose:** "This API will take shipping bill number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| sbNo | Required | [0-9]{7} | 7 | Shipping Bill number as available in ICEGATE system. |
| sbDt | Required | [0-9]{8} | 8 | Shipping Bill date as available in ICEGATE system. |

**Example request body:**
```json
{
  "sbNo": "5444772",
  "sbDt": "16092011"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "leoDt": "23092011"
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
        "leoDt": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [0-9]{1,7}` (margin label: "sbNo. Format")
- `Data format failed OR wrong value entered at: should follow [0-9]{8}` (margin label: "sbDt. Format")

**Response field meanings:** (wrapper fields: no description given)
- `leoDt`: no description given

**Document problems:**
- Table regex is `[0-9]{7}` but the invalid-input message says `[0-9]{1,7}`.
- Technical approach says "details of cargo information", but the response contains only `leoDt`.
- The invalid-input messages do not name the field in their text. Margin labels are "sbNo. Format" and "sbDt. Format".
- See G2, G3, G4.

---

## ICEGATE/07 — Import General Manifest (IGM) details
**Purpose:** "This API will take IGM number and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| igmNo | Required | [0-9]{1,7} | Min 1, Max 10 | Import General Manifest Number as available in ICEGATE system. |
| igmDt | Required | [0-9]{8} | Max 8 | IGM date |

**Example request body:**
```json
{
  "igmNo": "2000690",
  "igmDt": "31012014"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "imoCodeOfVessel": "12345",
        "vesselCode": "TETS1",
        "voyageNo": "03",
        "portOfDest": "INBOM1",
        "portOfShipment": "INPAV1",
        "importerName": "HINDUSTAN CARGO",
        "modeOfTransport": "T",
        "containerDetails": [
          {
            "containerNo": "MMAU1162485",
            "totNoPkg": 1
          }
        ]
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
        "imoCodeOfVessel": null,
        "vesselCode": null,
        "voyageNo": null,
        "portOfDest": null,
        "portOfShipment": null,
        "importerName": null,
        "modeOfTransport": null,
        "containerDetails": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [0-9]{7}` (margin label: "beNo. Format")
- `Data format failed OR wrong value entered at: should follow [0-9]{8}` (margin label: "igmDt. Format")

**Response field meanings:** (wrapper fields: no description given)
- `imoCodeOfVessel`: no description given
- `vesselCode`: no description given
- `voyageNo`: no description given
- `portOfDest`: no description given
- `portOfShipment`: no description given
- `importerName`: no description given
- `modeOfTransport`: no description given
- `containerDetails`: no description given
- `containerNo` (inside `containerDetails`): no description given
- `totNoPkg` (inside `containerDetails`): no description given

**Document problems:**
- Table regex is `[0-9]{1,7}` but the invalid-input message says `[0-9]{7}`. Table length is "Min 1, Max 10" while the regex allows at most 7 characters.
- The invalid-IGM-number message names the field as "beNo" (margin label "beNo. Format"). It should be `igmNo`. The message text does not name any field.
- See G2, G3, G4.

---

## ICEGATE/08 — Export General Manifest (EGM) details
**Purpose:** "This API will take EGM number, EGM date and connect with ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| egmNo | Required | [0-9]{7} | 7 | Export General Manifest Number as available in ICEGATE system. |
| egmDt | Required | [0-9]{8} | 8 | EGM date |

**Example request body:**
```json
{
  "egmNo": "103978",
  "egmDt": "29032016"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "sbDetails": [
          {
            "containerNo": [
              "GESU5599051"
            ],
            "sbNo": 6825667,
            "noOfPckgs": 25,
            "portOfDest": "SAJED"
          },
          {
            "containerNo": [
              "TCKU1732080"
            ],
            "sbNo": 6828170,
            "noOfPckgs": 33,
            "portOfDest": "GBCHD"
          },
          {
            "containerNo": [
              "APHU6684925"
            ],
            "sbNo": 6832965,
            "noOfPckgs": 127,
            "portOfDest": "USPXX"
          },
          {
            "containerNo": [
              "APZU3219840"
            ],
            "sbNo": 6833000,
            "noOfPckgs": 186,
            "portOfDest": "GBCHD"
          },
          {
            "containerNo": [
              "APHU4645318"
            ],
            "sbNo": 6833796,
            "noOfPckgs": 52,
            "portOfDest": "GBNWY"
          },
          {
            "containerNo": [
              "APHU4645318"
            ],
            "sbNo": 6834068,
            "noOfPckgs": 1,
            "portOfDest": "GBNWY"
          },
          {
            "containerNo": [
              "APZU4319058"
            ],
            "sbNo": 6887160,
            "noOfPckgs": 5225,
            "portOfDest": "GBNWY"
          },
          {
            "containerNo": [
              "APZU3330134"
            ],
            "sbNo": 6887578,
            "noOfPckgs": 1218,
            "portOfDest": "GBNWY"
          },
          {
            "containerNo": [
              "CRXU3001523"
            ],
            "sbNo": 6887587,
            "noOfPckgs": 1218,
            "portOfDest": "USCHI"
          }
        ],
        "egmNo": 21889,
        "egmDt": "20112008"
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
        "egmNo": null,
        "egmDt": null,
        "sbNo": null,
        "portOfDest": null,
        "noOfPckgs": null,
        "containerNo": null
      },
      "responseStatus": "SUCCESS"
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400"`)
- `Data format failed OR wrong value entered at: should follow [0-9]{7}` (heading "Invalid shipping bill number"; margin label: "beNo. Format")
- `Data format failed OR wrong value entered at: should follow [0-9]{8}` (margin label: "egmDt. Format")

**Response field meanings:** (wrapper fields: no description given)
- `sbDetails`: no description given
- `containerNo`: no description given
- `sbNo`: no description given
- `noOfPckgs`: no description given
- `portOfDest`: no description given
- `egmNo`: no description given
- `egmDt`: no description given

**Document problems:**
- The invalid-egmNo error is headed "Invalid shipping bill number" and its margin label is "beNo. Format". It should be egmNo and EGM number.
- The overall section example says "EGM number 21889 and date 20112008". The example request uses `egmNo` "103978" and `egmDt` "29032016". The found response returns 21889 and 20112008.
- The invalid-input messages do not name the field in their text.
- See G2, G3, G4.

---

## ICEGATE/09 — Air MAWB details by location
**Purpose:** "This API will provide MAWB details when the Location and MAWB details are entered as input"
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| mawbNumber | Required | ^[0-9]{1,20} | Not clearly given (layout garbled) | MASTER AIRWAY BILL NUMBER |
| custSite | Required | ^[A-Za-z0-9]{6} | Not clearly given (a "8" sits beside it) | location |

**Example request body:**
```json
{
  "mawbNumber": "06536234962",
  "custSite": "INDEL42iio2oo21"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": [
        {
          "grossWeight": "100",
          "flightDate": "15022025 12:02",
          "igmRtn": "71074",
          "dateOfIntegration": null,
          "mawbNumber": "06536234962",
          "totalPackage": "100",
          "igmDate": "25022025 12:02",
          "custSite": "INDEL4",
          "remarks": null,
          "flightNumber": "SV758",
          "status": "C"
        }
      ],
      "responseStatus": "SUCCESS",
      "message": null
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
        "errCode": "ERROR0004",
        "errMsg": "No Records Available"
      },
      "responseStatus": "ERROR",
      "message": null
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400 BAD_REQUEST"`)
- `Data format failed OR wrong value entered at: mawbNumber. Format should follow ^[0-9]{1,20}$`
- `Data format failed OR wrong value entered at: custSite. Format should follow ^[A-Za-z0-9]{6}$`

**Response field meanings:** (wrapper fields: no description given)
- `grossWeight`: no description given
- `flightDate`: no description given
- `igmRtn`: no description given
- `dateOfIntegration`: no description given
- `mawbNumber`: no description given
- `totalPackage`: no description given
- `igmDate`: no description given
- `custSite`: no description given
- `remarks`: no description given
- `flightNumber`: no description given
- `status`: no description given (sample value `"C"`; meaning of codes not given)

**Document problems:**
- The production JSON example uses `custSite` "INDEL42iio2oo21" (15 characters, which violates `^[A-Za-z0-9]{6}$`). The production curl uses "INDEL4". The staging example uses "INDEL4".
- The length cells are garbled. Length for `mawbNumber` cannot be read. An "8" sits beside `custSite`, which conflicts with the 6-character regex.
- Table regexes have no `$` anchor. The error messages use `$`.
- The error code is written as `"400 BAD_REQUEST"`, not `"400"`.
- The found response wraps an array inside `response`. ICEGATE/10 wraps an object.
- The `custSite` field is described only as "location".
- See G2, G3, G4.

---

## ICEGATE/10 — Air MAWB and HAWB details
**Purpose:** "This API will take the MAWB number and connect with the ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| mawbNumber | Required | ^[0-9]{1,20} | 20 max | MASTER AIRWAY BILL NUMBER |
| hawbNumber | Required | ^[A-Za-z0-9]{1,15} | 15 max | HOUSE AIRWAY BILL NUMBER |

**Example request body:**
```json
{
  "mawbNumber": "15754138070",
  "hawbNumber": "15751033332m23322"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "icdBlStatusResponceDto": {
          "subLineNo": "1",
          "voyageNo": "null",
          "mawbDT": "25052019",
          "portDest": "INJJK6",
          "uqc": "KGS",
          "igmDT": "31072019",
          "beLoc": "4",
          "containerDtlsResponseDtos": [
            {
              "subLineNo": "1",
              "lineNo": "1",
              "igmRTN": "2001935",
              "errCode": "40|41",
              "contNo": "MAEU4698704",
              "contStatus": "FCL",
              "arrDT": "null",
              "arrStatus": "null"
            },
            {
              "subLineNo": "1",
              "lineNo": "1",
              "igmRTN": "2001935",
              "errCode": "100",
              "contNo": "MAEU4698704",
              "contStatus": "FCL",
              "arrDT": "null",
              "arrStatus": "null"
            }
          ],
          "getewayPort": "1",
          "grossWeight": "21200",
          "hawbDT": "25052019",
          "lineNo": "1",
          "igmRTN": "2001935",
          "packageCode": "PCS",
          "descOfGoods": "ROLLED WORK",
          "totalPackage": "2",
          "inwDT": "31072019",
          "vesselCode": "null",
          "cargoMovement": "LC"
        }
      },
      "responseStatus": "SUCCESS",
      "message": null
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
        "errCode": "ERROR0004",
        "errMsg": "No Records Available"
      },
      "responseStatus": "ERROR",
      "message": null
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400 BAD_REQUEST"`)
- `Data format failed OR wrong value entered at: mawbNumber. Format should follow ^[0-9]{1,20}$`
- `Data format failed OR wrong value entered at: hawbNumber. Format should follow ^[A-Za-z0-9]{1,15}$`

**Response field meanings:** (wrapper fields: no description given)
- `subLineNo`: no description given
- `voyageNo`: no description given
- `mawbDT`: no description given
- `portDest`: no description given
- `uqc`: no description given
- `igmDT`: no description given
- `beLoc`: no description given
- `containerDtlsResponseDtos`: no description given
- `lineNo`: no description given
- `igmRTN`: no description given
- `errCode`: no description given
- `contNo`: no description given
- `contStatus`: no description given
- `arrDT`: no description given
- `arrStatus`: no description given
- `getewayPort`: no description given
- `grossWeight`: no description given
- `hawbDT`: no description given
- `packageCode`: no description given
- `descOfGoods`: no description given
- `totalPackage`: no description given
- `inwDT`: no description given
- `vesselCode`: no description given
- `cargoMovement`: no description given

**Document problems:**
- The production JSON example has `hawbNumber` "15751033332m23322" (17 characters). This exceeds the 15-character maximum. The production curl uses "1575103333" (10 characters). The staging JSON and curl use "1575103333".
- The purpose sentence mentions only the MAWB number, but the API takes the HAWB number as well. The overall section says "Master Bill Number and House Airway Bill no".
- Response key spellings are as in the document (`icdBlStatusResponceDto`, `getewayPort`). Key case varies (`igmRTN` here, `igmRtn` in ICEGATE/09).
- Sample values `voyageNo`, `arrDT`, `arrStatus`, `vesselCode` are the string `"null"`.
- Error code is `"400 BAD_REQUEST"`.
- See G2, G3, G4.

---

## ICEGATE/11 — Air import / export GM job status by flight
**Purpose:** "This API will provide Air Export General Manifest & Air Import General Manifest Job Status Details."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| location | Required | ^[A-Za-z0-9]{6} | 6 | Location |
| flightDt | Required | ^((0[1-9]\|[12][0-9]\|3[01])(0[1-9]\|1[012])\\d{4}) | 8 (per the column; see document problems) | Flight Date |
| flightNo | Required | ^[A-Za-z0-9]{1,30} | Not clearly given (regex allows up to 30) | Flight number |
| flag | Required | ^[A-Za-z0-9]{1,15} | Not clearly given (regex allows up to 15) | Flag |

**Example request body:**
```json
{
  "location": "IMMUN1",
  "flightDt": "15042025",
  "flightNo": "123G",
  "flag": "EGM"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": [
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "20/01/2025 12:06",
          "sentTime": "20032025 12:03",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "17/01/2025 17:14",
          "sentTime": "17032025 05:03",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "29/01/2025 15:40",
          "sentTime": "29012025 03:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "27/01/2025 13:07",
          "sentTime": "27012025 01:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "24/01/2025 17:21",
          "sentTime": "24012025 05:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "23/01/2025 15:49",
          "sentTime": "23012025 03:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "23/01/2025 15:48",
          "sentTime": "23012025 03:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "22/01/2025 12:25",
          "sentTime": "22012025 12:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "14/01/2025 16:28",
          "sentTime": "14012025 04:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "13/01/2025 10:12",
          "sentTime": "13012025 10:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        },
        {
          "ackSentTime": null,
          "flightDate": "19012022",
          "ackReceivedTime": null,
          "receivedTime": "10/01/2025 13:09",
          "sentTime": "10012025 01:01",
          "customLocation": "INDEL4",
          "flightNumber": "KU332",
          "status": "Inserted Successfully in Database. Sent to ICES for validation."
        }
      ],
      "responseStatus": "SUCCESS",
      "message": null
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
        "errCode": "ERROR0004",
        "errMsg": "No Records Available"
      },
      "responseStatus": "ERROR",
      "message": null
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400 BAD_REQUEST"`)
- `Data format failed OR wrong value entered at: at should follow ^[A-Za-z0-9]{6}$` (margin label: "location. Form")
- `Data format failed OR wrong value entered at: flightDt. Format should follow ^((0[1-9]|[12][0-9]|3[01])(0[1-9]|1[012])\\d{4})$`
- `Data format failed OR wrong value entered at: flightNo. Format should follow ^[A-Za-z0-9]{1,30}$`
- `Data format failed OR wrong value entered at: flag. Format should follow ^[A-Za-z0-9]{1,15}$`

**Response field meanings:** (wrapper fields: no description given)
- `ackSentTime`: no description given
- `flightDate`: no description given
- `ackReceivedTime`: no description given
- `receivedTime`: no description given
- `sentTime`: no description given
- `customLocation`: no description given
- `flightNumber`: no description given
- `status`: no description given

**Document problems:**
- The invalid-location message reads "at: at should follow ^[A-Za-z0-9]{6}$". It does not name the field. The margin label is "location. Form".
- The layout of the description and length cells is garbled. "Flight Date" sits beside the `location` row, and the lengths "8", "1-30" and "1-15" are not clearly tied to their fields.
- `flightDt` regex is written with a double backslash (`\\d{4}`) in both the table and the message. Message also appends `$` but the table does not.
- The found-response sample (pages 52-54) is garbled in the PDF. The 11 objects above were reconstructed in the order they appear. Status text is split across lines ("ICE" / "S") and was rejoined as "ICES".
- The three dates use different formats: `flightDate` is `ddMMyyyy`, `receivedTime` is `dd/MM/yyyy HH:mm`, `sentTime` is `ddMMyyyy HH:mm`.
- Allowed values for `flag` are not given (sample uses "EGM").
- Technical approach says "cargo information", but the response is job status.
- See G2, G3, G4.

---

## ICEGATE/12 — Manual / courier / postal SB details
**Purpose:** "This API will take the shipping bill number and connect with the ICEGATE API to get data."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| location | Required | ^[A-Za-z0-9]{6} | 6 | Location |
| sbNo | Required | ^[0-9]{7} | 7 | Shipping Bill Number |
| sbDate | Required | ^((0[1-9]\|[12][0-9]\|3[01])(0[1-9]\|1[012])\\d{4}) | 8 | Shipping Bill Date |

**Example request body:**
```json
{
  "sbNo": "1340721",
  "sbDate": "23102024",
  "location": "INCCU5"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "expName": "Ni****ay",
        "sbType": "F",
        "egmNo": "3063019",
        "egmDt": "28102024",
        "iec": "AM****7A",
        "leoDt": "28102024",
        "chaNo": "SE****01"
      },
      "responseStatus": "SUCCESS",
      "message": null
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
        "errCode": "ERROR0004",
        "errMsg": "No Records Available"
      },
      "responseStatus": "ERROR",
      "message": null
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400 BAD_REQUEST"`)
- `Data format failed OR wrong value entered at: should follow ^[0-9]{7}$` (margin label: "sbNo. Format")
- `Data format failed OR wrong value entered at: sbDate. Format should follow ^((0[1-9]|[12][0-9]|3[01])(0[1-9]|1[012])\\d{4})$`
- `Data format failed OR wrong value entered at: location. Format should follow ^[A-Za-z0-9]{6}$`

**Response field meanings:** (wrapper fields: no description given)
- `expName`: no description given (sample value is masked: "Ni****ay")
- `sbType`: no description given
- `egmNo`: no description given
- `egmDt`: no description given
- `iec`: no description given (sample value is masked: "AM****7A")
- `leoDt`: no description given
- `chaNo`: no description given (sample value is masked: "SE****01")

**Document problems:**
- The staging curl posts to `/ICEGATE/11`, not `/ICEGATE/12`.
- The sbNo invalid-input message does not name the field in its text. The margin label is "sbNo. Format s", overlapping the word "should". The message text is "at: should follow ^[0-9]{7}$".
- The request field is `sbDate`, but ICEGATE/05 and ICEGATE/06 use `sbDt` for the same concept.
- The sample response values are masked (for example "Ni****ay", "AM****7A", "SE****01"), so the sample is not a complete example.
- Technical approach says "cargo information", but the response is customs and clearance data.
- See G2, G3, G4.

---

## ICEGATE/13 — e-Seal details
**Purpose:** "This API will provide e-Seal details."
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| esealNumber | Required | ^.{1,20}$ | 20 max | Shipping Bill number as available in ICEGATE system. |
| containerNumber | Required | ^[A-Za-z0-9]{1,10} | 15 max | BE date |

**Example request body:**
```json
{
  "esealNumber": "000000000045",
  "containerNumber": "TU679"
}
```

**Response — found:**
```json
{
  "response": [
    {
      "response": {
        "esealNumber": "000000000045",
        "containerNumber": "TU679",
        "sealDateTime": "12042021 12:34",
        "sbNumber": "2323134",
        "sbDate": "12042021",
        "truckNumber": "UP16380",
        "portCode": null,
        "esealStatus": "null",
        "verificationTime": "null"
      },
      "responseStatus": "SUCCESS",
      "message": null
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
        "errCode": "ERROR0004",
        "errMsg": "No Records Available"
      },
      "responseStatus": "ERROR",
      "message": null
    }
  ],
  "error": "false",
  "code": "200",
  "message": "Success"
}
```

**Response — invalid input:** (body: `"response": null`, `"error": "true"`, `"code": "400 BAD_REQUEST"`)
- `Data format failed OR wrong value entered at: esealNumber. Format should follow ^[0-9]{1,20}$`
- `Data format failed OR wrong value entered at: containerNumber. Format should follow ^[A-Za-z0-9]{1,10}$`

**Response field meanings:** (wrapper fields: no description given)
- `esealNumber`: no description given
- `containerNumber`: no description given
- `sealDateTime`: no description given
- `sbNumber`: no description given
- `sbDate`: no description given
- `truckNumber`: no description given
- `portCode`: no description given
- `esealStatus`: no description given (sample value is the string `"null"`)
- `verificationTime`: no description given (sample value is the string `"null"`)

**Document problems:**
- Field descriptions are copy-pasted. `esealNumber` is described as "Shipping Bill number as available in ICEGATE system". `containerNumber` is described as "BE date".
- `esealNumber` regex is `^.{1,20}$` in the table, but the invalid-input message says `^[0-9]{1,20}$`.
- `containerNumber` length is "15 max" but the regex allows at most 10 characters.
- The staging curl sends `mawbNumber` and `hawbNumber` (copied from ICEGATE/10), not `esealNumber` and `containerNumber`. The production curl is correct.
- The invalid-input messages do not name the field in their text beyond the inline names shown above.
- See G2, G3, G4.
