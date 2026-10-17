# PCS API Specifications (ULIP)

**Source:** ULIP_PCS_Integration_Requirement.pdf
**Document version:** 4.0 (dated 26/03/2026), 46 pages
**Scope:** PCS/01 to PCS/05. PCS/06 is listed below only.

Shared notes from the document (apply to every API below):
- Every API is a POST with a JSON body. Section 1.x text says the values are "passed within the URL parameters in JSON format", but the examples send them as a JSON body (`--data-raw`).
- Every API uses a secret key header plus a Bearer token. The document says "We have to send secret key with header" and "For obtaining secret key, refer Section 1.9". Section 1.9 (Data Transmission & Authentication Mechanism, page 44) was not extracted, so the header name is not given here.
- Bearer tokens in the curl examples are replaced with `<token>`.
- Shared HTTP status codes (same text in every section): 200 vessel data response; 400 Bad request (Invalid JSON syntax, invalid JSON key); 401 or 403 Unauthenticated or Unauthorized; 500 Some internal server error occurred; 502 Server is not responding.
- The Purpose text in Section 1.1 mentions VCN numbers, but none of PCS/01 to PCS/05 takes a VCN.
- Staging and production URLs: production `https://www.ulip.dpiit.gov.in/ulip/v1.0.0/PCS/0X`; staging `https://www.ulipstaging.dpiit.gov.in/ulip/v1.0.0/PCS/0X`.
- Layout note: the "Required" and "Length" columns are garbled in the PDF. Values below are read from the text layer.

---

## PCS/01 — Cargo and vessel import details by IGM number [variant: interfaceName=CHPOI03]
**Purpose:** This API will take below details and connect with PCS API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| interfaceName | Required | `\bCHPOI03\b` | Not given in document | The interface name in the PCS system |
| igmNumber | Required | `[0-9]{1,10}` | Min 1, Max 10 | IGM number present in PCS system |

**Example request body:**
```json
{
   "interfaceName":"CHPOI03",
   "igmNumber": "2272354"
}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "voyage_no": "909E",
                "bill_date": "30012023",
                "port_of_arrival": "INMUN1",
                "goods_description": "P*A*T*C*R*G*I*D*H* *O*E*3*0*1*9* *5*(*I*T* *I*E* *A*K*G*S*O*L* *E* * *A*F*7*2*L*5* *A*K*G*S",
                "port_of_loading": "JPYOK",
                "bill_no": "010DW06169",
                "total_no_of_packages": "29",
                "mode_of_transport": null,
                "sub_line_number": "0",
                "container_seal_no": "WHLU045961",
                "line_number": "40",
                "container_no": "WHSU6942383",
                "number_of_packages": "55",
                "container_weight": 25.65,
                "terminal_operator_code": "INMUN1MCT1",
                "nature_of_cargo": "C",
                "responseMsg": "SUCCESS",
                "shipping_line_code": "AAFCT5861J",
                "port_of_destination": "INMUN1",
                "line_no": "40",
                "custom_house_code": "INMUN1",
                "grossWeight": 50847,
                "expected_date_and_time_of_arrival": "02032023:21:18",
                "sub_line_no": "0",
                "igm_date": "27022023",
                "shipping_agent_code": "AAFCT5861J",
                "cargo_imo_code": "ZZZ",
                "igm_no": "2336612",
                "iso_code": "4410",
                "port_of_discharge": "INMUN1SMS1"
             }
          ],
          "responseStatus": "SUCCESS",
          "message": null
      }
```
Note: the document sample stops after the closing `}` of the inner response object. The closing `],`, `"error": "false"`, `"code": "200"`, `"message": "Success"` and `}` lines are not in the document, so the block is not complete JSON as given. Nothing was added.

**Response — not found:**
```json
{
   "response": [
      {
          "response": [
             {
                "custom_house_code": null,
                "igm_no": null,
                "igm_date": null,
                "voyage_no": null,
                "shipping_line_code": null,
                "shipping_agent_code": null,
                "port_of_arrival": null,
                "expected_date_and_time_of_arrival": null,
                "terminal_operator_code": null,
                "cargo_imo_code": null,
                "line_no": null,
                "sub_line_no": null,
                "bill_no": null,
                "bill_date": null,
                "port_of_loading": null,
                "port_of_destination": null,
                "nature_of_cargo": null,
                "port_of_discharge": null,
                "grossWeight": null,
                "number_of_packages": null,
                "goods_description": null,
                "mode_of_transport": null,
                "container_no": null,
                "line_number": null,
                "sub_line_number": null,
                "container_seal_no": null,
                "total_no_of_packages": null,
                "container_weight": null,
                "iso_code": null,
                "responseMsg": "not found"
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

**Response — invalid input:**
- Invalid igmNumber (HTTP body, code 400):
```json
{
   "response": null,
   "error": "true",
   "code": "400",
   "message": "Data format failed OR wrong value entered at: igmNumber.

Format should follow [0-9]{1,10}"
}
```
- Invalid interfaceName (code 400):
```json
{
   "response": null,
   "error": "true",
   "code": "400",
   "message": "Data format failed OR wrong value entered at: interfaceName.

Format should follow \\bCHPOI03\\b"
}
```

**Response field meanings:**
- `response` (outer, top level): no description given
- `responseStatus`: no description given
- `message`: no description given
- `voyage_no`: no description given
- `bill_date`: no description given
- `port_of_arrival`: no description given
- `goods_description`: no description given
- `port_of_loading`: no description given
- `bill_no`: no description given
- `total_no_of_packages`: no description given
- `mode_of_transport`: no description given
- `sub_line_number`: no description given
- `container_seal_no`: no description given
- `line_number`: no description given
- `container_no`: no description given
- `number_of_packages`: no description given
- `container_weight`: no description given
- `terminal_operator_code`: no description given
- `nature_of_cargo`: no description given
- `responseMsg`: no description given
- `shipping_line_code`: no description given
- `port_of_destination`: no description given
- `line_no`: no description given
- `custom_house_code`: no description given
- `grossWeight`: no description given
- `expected_date_and_time_of_arrival`: no description given
- `sub_line_no`: no description given
- `igm_date`: no description given
- `shipping_agent_code`: no description given
- `cargo_imo_code`: no description given
- `igm_no`: no description given
- `iso_code`: no description given
- `port_of_discharge`: no description given

**Document problems:**
- Interface name value is a regex with word boundaries (`\bCHPOI03\b`). It is the only accepted value for PCS/01; no other variant is defined.
- Found sample is truncated (closing lines missing), as noted above.
- `goods_description` is split across two PDF lines inside the string value. Rejoined with one space at the wrap point. The original character at that point is not certain.
- Mixed naming in the samples: snake_case (`igm_no`), camelCase (`grossWeight`, `responseMsg`), and both `line_no` and `line_number` plus `sub_line_no` and `sub_line_number`.
- The Length cell for interfaceName is blank in the document.

---

## PCS/02 — Shipping bill details by SB number [variant: interfaceName=CHPOE05]
**Purpose:** This API will take below details and connect with PCS API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| interfaceName | Required | `\bCHPOE05\b` | Not given in document | The interface name in the PCS system |
| sbNumber | Required | `[0-9]{1,10}` | Min 1, Max 10 | SB number present in PCS system |

**Example request body:**
```json
{
   "interfaceName":"CHPOE05",
   "sbNumber": "7005705"
}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "grossQuantity": 736.4,
                "sbNo": "9023937",
                "natureOfCargo": "P",
                "portOfOrigin": "INNSA1",
                "portOfDestination": "MXLZC",
                "unitOfQuantity": "KGS",
                "totalNoOfPackages": "263",
                "chaCode": "AAECS5612BCH001",
                "sbDate": "02042023",
                "responseMsg": "SUCCESS"
             }
          ],
          "responseStatus": "SUCCESS",
          "message": null
      }
```
Note: as in PCS/01, the document sample stops before the closing `],`, `"error"`, `"code"`, `"message"` and `}` lines. Nothing was added.

**Response — not found:**
```json
{
   "response": [
      {
          "response": [
             {
                "sbNo": null,
                "sbDate": null,
                "natureOfCargo": null,
                "grossQuantity": null,
                "unitOfQuantity": null,
                "totalNoOfPackages": null,
                "portOfDestination": null,
                "portOfOrigin": null,
                "responseMsg": "not found",
                "chaCode": null
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

**Response — invalid input:**
- Invalid sbNumber (code 400): `"message": "Data format failed OR wrong value entered at: sbNumber.` followed by a blank line and `Format should follow [0-9]{1,10}"`. Envelope: `"response": null`, `"error": "true"`, `"code": "400"`.
- Invalid interfaceName (code 400): `"message": "Data format failed OR wrong value entered at: interfaceName.` followed by a blank line and `Format should follow \\bCHPOE05\\b"`. Envelope: `"response": null`, `"error": "true"`, `"code": "400"`.

**Response field meanings:**
- `response` (outer, top level): no description given
- `responseStatus`: no description given
- `message`: no description given
- `grossQuantity`: no description given
- `sbNo`: no description given
- `natureOfCargo`: no description given
- `portOfOrigin`: no description given
- `portOfDestination`: no description given
- `unitOfQuantity`: no description given
- `totalNoOfPackages`: no description given
- `chaCode`: no description given
- `sbDate`: no description given
- `responseMsg`: no description given

**Document problems:**
- Section 1.4 (a)3 says "In case of IGM number does not exist in PCS system". This API takes an SB number, so the text is wrong.
- The production and staging curl URLs contain a stray space: `https://www. ulip.dpiit.gov.in/ulip/v1.0.0/PCS/02`.
- Found sample is truncated (closing lines missing).
- Request text says "URL parameters", but the example is a JSON body.

---

## PCS/03 — Shipping bill rotation and LEO details by SB number [variant: interfaceName=CHPOE07]
**Purpose:** This API will take the details below and connect with PCS API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| interfaceName | Required | `\bCHPOE07\b` | Not given in document | The interface name in the PCS system |
| sbNumber | Required | `[0-9]{1,10}` | Min 1, Max 10 | SB number present in PCS system |

**Example request body:**
```json
{
   "interfaceName":"CHPOE07",
   "sbNumber": "2405125"
}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "leoDate": "03042023",
                "rotationDate": "31032023",
                "natureOfCargo": "C",
                "rotationNo": "269212",
                "sbNumber": "8932488",
                "sbDate": "30032023",
                "responseMsg": "SUCCESS"
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
          "response": [
             {
                "sbNumber": null,
                "sbDate": null,
                "rotationNo": null,
                "rotationDate": null,
                "leoDate": null,
                "natureOfCargo": null,
                "responseMsg": "not found"
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

**Response — invalid input:**
- Invalid sbNumber (code 400): `"message": "Data format failed OR wrong value entered at: sbNumber.` then `Format should follow [0-9]{1,10}"`.
- Invalid interfaceName (code 400): `"message": "Data format failed OR wrong value entered at: interfaceName.` then `Format should follow \\bCHPOE07\\b"`.

**Response field meanings:**
- `response` (outer, top level): no description given
- `responseStatus`: no description given
- `message`: no description given
- `leoDate`: no description given
- `rotationDate`: no description given
- `natureOfCargo`: no description given
- `rotationNo`: no description given
- `sbNumber`: no description given
- `sbDate`: no description given
- `responseMsg`: no description given

**Document problems:**
- Section 1.5 (a)3 says "In case of IGM numbers do not exist in PCS system". This API takes an SB number, so the text is wrong.
- Staging curl URL contains a stray space: `https://www. ulipstaging.dpiit.gov.in/ulip/v1.0.0/PCS/03`.
- Request text says "URL parameters", but the example is a JSON body.

---

## PCS/04 — Bill of entry details by BOE number [variant: interfaceName=CHPOI09]
**Purpose:** This API will take below details and connect with PCS API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| interfaceName | Required | `\bCHPOI09\b` | Not given in document | The interface name in the PCS system |
| boeNumber | Required | `[0-9]{1,10}` | Min 1, Max 10 | SB number present in PCS system (as written in the document) |

**Example request body:**
```json
{
   "interfaceName":"CHPOI09",
   "boeNumber": "7274213"
}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "items_IgmNo": "2337849",
                "items_BillOfEntryDate": "07032023",
                "sublineNo": "1",
                "igmNo": "2337849",
                "natureOfCargo": "CP",
                "items_IgmDate": "13032023",
                "items_sub_line_number": "1",
                "igmDate": "13032023",
                "numberOfPackages": "10",
                "sub_line_number": "1",
                "grossWeight": 3600,
                "lineNo": "89",
                "customHouseCode": "INKAT1",
                "line_number": "89",
                "billOfEntryNo": "4940717",
                "container_no": "BSIU2568595",
                "countryOfOrigin": "CN",
                "items_line_number": "89",
                "chaCode": "AAKFG4453HCH001",
                "unitOfQuantity": "KGS",
                "items_BillOfEntryNo": "4940717",
                "billOfEntryDate": "07032023",
                "responseMsg": "SUCCESS"
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
          "response": [
             {
                "customHouseCode": null,
                "igmDate": null,
                "lineNo": null,
                "sublineNo": null,
                "billOfEntryNo": null,
                "billOfEntryDate": null,
                "chaCode": null,
                "natureOfCargo": null,
                "grossWeight": null,
                "unitOfQuantity": null,
                "numberOfPackages": null,
                "countryOfOrigin": null,
                "line_number": null,
                "sub_line_number": null,
                "container_no": null,
                "items_IgmNo": null,
                "items_IgmDate": null,
                "items_line_number": null,
                "items_sub_line_number": null,
                "items_BillOfEntryNo": null,
                "items_BillOfEntryDate": null,
                "responseMsg": "not found"
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

**Response — invalid input:**
- Invalid boeNumber (code 400): `"message": "Data format failed OR wrong value entered at: boeNumber.` then a blank line and `Format should follow [0-9]{1,10}"`.
- Invalid interfaceName (code 400): `"message": "Data format failed OR wrong value entered at: interfaceName.` then a blank line and `Format should follow \\bCHOI09\\b"`. Note the value is `CHOI09`, not `CHPOI09`.

**Response field meanings:**
- `response` (outer, top level): no description given
- `responseStatus`: no description given
- `message`: no description given
- `items_IgmNo`: no description given
- `items_BillOfEntryDate`: no description given
- `sublineNo`: no description given
- `igmNo`: no description given
- `natureOfCargo`: no description given
- `items_IgmDate`: no description given
- `items_sub_line_number`: no description given
- `igmDate`: no description given
- `numberOfPackages`: no description given
- `sub_line_number`: no description given
- `grossWeight`: no description given
- `lineNo`: no description given
- `customHouseCode`: no description given
- `line_number`: no description given
- `billOfEntryNo`: no description given
- `container_no`: no description given
- `countryOfOrigin`: no description given
- `items_line_number`: no description given
- `chaCode`: no description given
- `unitOfQuantity`: no description given
- `items_BillOfEntryNo`: no description given
- `billOfEntryDate`: no description given
- `responseMsg`: no description given

**Document problems:**
- `boeNumber` is described as "SB number present in PCS system". It should be a BOE number. The Technical Approach (1.6.1) says BOE number.
- Section 1.6 Request text says "where SB number and interface name is passed". The field is `boeNumber`.
- Invalid interfaceName message says `\bCHOI09\b`, but the required value is `CHPOI09`. The message and the field disagree.
- Staging curl URL is `https:// www.ulip.dpiit.gov.in/ulipstaging/v1.0.0/PCS/04`. The staging URL given just above is `https://www.ulipstaging.dpiit.gov.in/ulip/v1.0.0/PCS/04`. The two do not match.
- Mixed naming in samples: `igmNo` and `sublineNo` (camelCase) next to `line_number`, `sub_line_number`, `items_IgmNo`, and `items_sub_line_number` (snake_case). `sublineNo` and `sub_line_number` both appear.
- Interface name table cell is garbled in the PDF ("Require d"). Read as Required.

---

## PCS/05 — Bill of entry out-of-charge details by BOE number [variant: interfaceName=CHPOI10]
**Purpose:** This API will take the details below and connect with PCS API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| interfaceName | Required | `\bCHPOI10\b` | Not given in document | The interface name in the PCS system |
| boeNumber | Required | `[0-9]{1,10}` | Min 1, Max 10 | SB number present in PCS system (as written in the document) |

**Example request body:**
```json
{
   "interfaceName":"CHPOI10",
   "boeNumber": "2219940"
}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "subLineNo": "1",
                "items_BillOfEntryDate": "21032023",
                "igmNo": "2338556",
                "out_of_charge_no": "2050911362",
                "igmDate": "21032023",
                "numberOfPackages": "40",
                "out_of_charge_date": "28032023",
                "sub_line_number": "1",
                "lineNo": "139",
                "line_number": "139",
                "billOfEntryNo": "5159836",
                "container_no": "ESDU4016990",
                "chaCode": "ABWPV2386DCH001",
                "items_BillOfEntryNo": "5159836",
                "responseMsg": "SUCCESS",
                "items_SubLineNo": "1",
                "items_IgmNo": "2338556",
                "natureOfCargo": "C",
                "items_IgmDate": "21032023",
                "items_CustomHouseCode": "INNSA1",
                "customHouseCode": "INNSA1",
                "items_LineNumber": "139",
                "countryOfOrigin": "VN",
                "unitOfQuantity": "KGS",
                "billOfEntryDate": "21032023"
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
          "response": [
             {
                "customHouseCode": null,
                "igmNo": null,
                "igmDate": null,
                "lineNo": null,
                "subLineNo": null,
                "billOfEntryNo": null,
                "billOfEntryDate": null,
                "chaCode": null,
                "natureOfCargo": null,
                "unitOfQuantity": null,
                "numberOfPackages": null,
                "countryOfOrigin": null,
                "responseMsg": "not found",
                "out_of_charge_date": null,
                "out_of_charge_no": null,
                "line_number": null,
                "sub_line_number": null,
                "container_no": null,
                "items_CustomHouseCode": null,
                "items_IgmNo": null,
                "items_IgmDate": null,
                "items_LineNumber": null,
                "items_SubLineNo": null,
                "items_BillOfEntryNo": null,
                "items_BillOfEntryDate": null
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

**Response — invalid input:**
- Invalid boeNumber (code 400): `"message": "Data format failed OR wrong value entered at: boeNumber.` then a blank line and `Format should follow [0-9]{1,10}"`. The document heading says "Invalid Boe number".
- Invalid interfaceName (code 400): `"message": "Data format failed OR wrong value entered at: interfaceName.` then a blank line and `Format should follow \\bCHOI10\\b"`. Note the value is `CHOI10`, not `CHPOI10`.

**Response field meanings:**
- `response` (outer, top level): no description given
- `responseStatus`: no description given
- `message`: no description given
- `subLineNo`: no description given
- `items_BillOfEntryDate`: no description given
- `igmNo`: no description given
- `out_of_charge_no`: no description given
- `igmDate`: no description given
- `numberOfPackages`: no description given
- `out_of_charge_date`: no description given
- `sub_line_number`: no description given
- `lineNo`: no description given
- `line_number`: no description given
- `billOfEntryNo`: no description given
- `container_no`: no description given
- `chaCode`: no description given
- `items_BillOfEntryNo`: no description given
- `responseMsg`: no description given
- `items_SubLineNo`: no description given
- `items_IgmNo`: no description given
- `natureOfCargo`: no description given
- `items_IgmDate`: no description given
- `items_CustomHouseCode`: no description given
- `customHouseCode`: no description given
- `items_LineNumber`: no description given
- `countryOfOrigin`: no description given
- `unitOfQuantity`: no description given
- `billOfEntryDate`: no description given

**Document problems:**
- `boeNumber` is described as "SB number present in PCS system". It should be a BOE number. The Technical Approach (1.7.1) says BOE number.
- Section 1.7 Request text says "where SB number and interface name is passed". The field is `boeNumber`.
- Invalid interfaceName message says `\bCHOI10\b`, but the required value is `CHPOI10`.
- Production and staging curl URLs contain a stray space: `https://www.ulip.dpiit.gov.in/ulip /v1.0.0/PCS/05`.
- Mixed naming in samples: camelCase (`igmNo`, `subLineNo`) next to snake_case (`out_of_charge_no`, `line_number`, `sub_line_number`), and `items_` keys that use both `items_LineNumber` and `items_SubLineNo` spellings.
- Found sample is complete, but the not-found sample lists `responseMsg` in a different position than the found sample. This has no effect on parsing.

---

## PCS/06 — not approved, skipped
