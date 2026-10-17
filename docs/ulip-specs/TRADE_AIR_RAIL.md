# ULIP API specs: DGFT, AAICLAS, ACMES, FOIS, LDB

Extracted offline from the official ULIP Integration Requirement PDFs (text via pdftotext -layout). No network requests were made.

## Source documents

- ULIP_DGFT_Integration_Requirement.pdf: Version 6.0, dated 30/03/2026, 13 pages
- ULIP_AAICLAS_Integration_Requirement.pdf: Version 4.0, dated 24/03/2026, 17 pages
- ULIP_ACMES_Integration_Requirement.pdf: Version 4.0, dated 24/03/2026, 14 pages
- ULIP_FOIS_Integration_Requirement.pdf: Version 8.0, dated 19/05/2026, 15 pages
- ULIP_LDB_Integration_Requirement.pdf: Version 8.0, dated 27/03/2026, 16 pages (this document also contains CFSICD/01, which is not in scope and was not extracted)

FOIS/03: not approved, skipped. (The v8.0 FOIS document has no FOIS/03 section. Its revision history mentions "Added fois_03 new API" at version 5.0, but no FOIS/03 section exists in the current document.)

Common status codes (listed at the end of most API sections in the source documents): 200 data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 internal server error; 502 server not responding.

Notes on conventions in this file:
- Bearer tokens in the source curl examples are not copied.
- Where PDF line wraps split a JSON string or key, the wrap was rejoined. Keys and values are otherwise unchanged, including spelling mistakes.
- "Not given in document" means the PDF has no such sample or text.

---

## DGFT/01 — Exporter/importer details by IEC number

**Purpose:** DGFT API will share details of exporter/importer information which exist in DGFT system in JSON format (input: IEC number).

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| iecnumber | Required | [0-9]{10} | 10 | Import export code number as available in DGFT system. |

**Example request body:**
```json
{"iecnumber": "0388197021"}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "exporterType": 1,
             "address2": "S*c*o* 4* C*n*a*t N*: 9*9*9*1*5*6*",
             "city": "Gurugram",
             "address1": "1*1*",
             "responseTime": "09:53:34",
             "iecIssueDate": "Jan 27, 2016 6:30:00 PM",
             "requestTime": "09:53:21",
             "natureOfConcern": 111000113,
             "entityName": "HAMLET E COMMERCE PRIVATE LIMITED",
             "pinCode": 122001,
             "iecStatus": 0,
             "state": "HARYANA",
             "pan": "A*D*H*6*1*",
             "iecNumber": "0515920797"
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
                                                  "errorDescription": "No record found - IEC Not Found",
                                                  "error": "record_not_found"
                                     },
                                     "responseStatus": "ERROR"
                         }
            ],
            "error": "false",
            "code": "200",
            "message": "Success"
}
```

**Response — invalid input:**
```json
{
            "response": null,
            "error": "true",
            "code": "400",
            "message": "Data format failed OR wrong value entered at: iecnumber. Format should follow [0-9]{10}"
}
```
Message text: "Data format failed OR wrong value entered at: iecnumber. Format should follow [0-9]{10}"

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`: no description given.
- Inside `response[0]`: `response`, `responseStatus`: no description given.
- Inside the data object (`response[0].response`): `exporterType`, `address2`, `city`, `address1`, `responseTime`, `iecIssueDate`, `requestTime`, `natureOfConcern`, `entityName`, `pinCode`, `iecStatus`, `state`, `pan`, `iecNumber`: no description given.
- Inside the not-found object: `errorDescription`, `error`: no description given.

**Document problems:**
- The overall description says the user shares a "vehicle registration number" for DGFT/01. The API takes an IEC number. This looks like text copied from the vehicle document.
- Section 1.5 says "vehicle details" for DGFT/01 requests.
- Section 1.3.1 says the IEC number is "passed within the URL body in JSON format". It is actually the JSON request body.
- Section 1.3 says "refer Section 1.6" for authentication, but authentication is in Section 1.5.
- The page header on every DGFT page reads "LDB Integration Requirement Document".

---

## DGFT/02 — Import policy details by ITC(HS) code

**Purpose:** DGFT API will share import policies related to itchs code which exist in DGFT system in JSON format (input: ITC(HS) code).

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| itchs | Required | [0-9]{8} | 8 | ITC(HS) Code |

**Example request body:**
```json
{"itchs": "29035100"}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "chapter": "29",
             "productDescriptionImportPolicy": [
                {
                    "hsCode": "29035100",
                    "description": "Unsaturated fluorinated derivatives of acyclic hydrocarbons:\n- - 2,3,3,3-Tetrafluoropropene (HFO-1234yf), 1,3,3,3-tetrafluoropropene (HFO-1234ze) and (z)-1,1,1,4,4,4-hexafluoro-2-butene (HFO1336mzz)",
                    "notificationNumber": "08.11.2020"
                }
             ],
             "description": "PRODUCTS OF THE CHEMICAL OR ALLIED INDUSTRIES",
             "main": [
                {
                    "notes": "Within any one heading of this Chapter, derivatives of a chemical compound (or group of chemical compounds) are to be classified in the same sub-heading asthat compound (or group of compounds) provided that they are not more specially covered by any other sub-heading and that there is no residual sub-heading named \"other\" in the series of sub-headings concerned.",
                    "notificationNumber": "",
                    "slNo": "1",
                    "notificationDate": ""
                },
                {
                    "notes": "Note 3 to this Chapter shall not be applicable to the sub-heading of this Chapter.",
                    "notificationNumber": "",
                    "slNo": "2",
                    "notificationDate": ""
                }
             ],
             "poliicyCondition": [
                {
                    "notes": "Import is permitted by actual users against a licence from a country which is a party to the Montreal Protocol on Substances that Deplete the Ozone Layer. List of countries which are parties to the Montreal Protocol (details can be accessed from website: www.unep.org/ozone) is in Appendix IV to this Schedule. However, import from countries, which are not parties to the Montreal Protocol is -- Prohibited.\r\n\r\n\r\n\r\n*Import of the Chemicals is allowed from State Parties and Non State Parties to the CWC subject to the condition that the importer shall, for each import consignment, within 30 days of import, notify the details to the National Authority, Chemical Weapons Convention, Cabinet Secretariat ; Ministry of External Affairs (DandISA); Department of Chemicals and Petrochemicals and the Directorate General of Foreign Trade and submit to the DGFT a copy of the bill of entry within 30 days of import.",
                    "notificationNumber": "",
                    "slNo": "1",
                    "notificationDate": ""
                },
                {
                    "notes": "All Narcotic drugs and psychotropic substances covered under this chapter will be subject to the following conditions\r\n\r\n(a) Any narcotic drug and psychotropic substance can be imported under the Special Provisions for medical and scientific purposes as per Chapter VII-A of the NDPS Rules, 1985 after obtaining an import certificate under the proviso to Rule 53 of the NDPS Rules (details can be accessed from website of Central Bureau of Narcotics, Gwalior: http://cbn.nic.in) \r\n\r\n(b) Imports other than category (a) above will be governed by Appendix- I to this Schedule",
                    "notificationNumber": "",
                    "slNo": "2",
                    "notificationDate": ""
                },
                {
                    "notes": "Import of the Chemicals is allowed from State Parties and Non State Parties to the CWC subject to the condition that the importer shall, for each import consignment, within 30 days of import, notify the details to the National Authority, Chemical Weapons Convention, Cabinet Secretariat ; Ministry of External Affairs (DandISA); Department of Chemicals and Petrochemicals and the Directorate General of Foreign Trade and submit to the DGFT a copy of the bill of entry within 30 days of import\r\n\r\nNo Objection Certificate (NOC) is required from Narcotics Commissioner, Gwalior, before import of the item.",
                    "notificationNumber": "",
                    "slNo": "3",
                    "notificationDate": ""
                },
                {
                    "notes": "The importer shall, for each consignment, submit a copy of the Bill of Entry within 30 days to the Ozone Cell, Ministry of Environment, Forest and Climate Change, New Delhi.",
                    "notificationNumber": "08.11.2020",
                    "slNo": "4",
                    "notificationDate": ""
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
             "errorDescription": "No record found",
             "error": "record_not_found"
          },
          "responseStatus": "ERROR"
      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"
}
```

**Response — invalid input:**
```json
{
   "response": null,
   "error": "true",
   "code": "400",
   "message": "Data format failed OR wrong value entered at: itchs. Format should follow [0-9]{8}"
}
```
Message text: "Data format failed OR wrong value entered at: itchs. Format should follow [0-9]{8}"

Other documented error case, "In case of a 3rd party error" (shown as a 200 response with `responseStatus` "SUCCESS"):
```json
{
             "response": [
                {
                   "response": {
                       "chapter": null,
                       "productDescriptionImportPolicy": null,
                       "description": null,
                       "error": "System exception while processing request",
                       "main": null,
                       "poliicyCondition": null
                   },
                   "responseStatus": "SUCCESS"
                }
             ],
             "error": "false",
             "code": "200",
             "message": "Success"
}
```

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`: no description given.
- Inside `response[0]`: `response`, `responseStatus`: no description given.
- Data object: `chapter`, `productDescriptionImportPolicy`, `description`, `main`, `poliicyCondition`, `error`: no description given.
- `productDescriptionImportPolicy[]`: `hsCode`, `description`, `notificationNumber`: no description given.
- `main[]`: `notes`, `notificationNumber`, `slNo`, `notificationDate`: no description given.
- `poliicyCondition[]`: `notes`, `notificationNumber`, `slNo`, `notificationDate`: no description given.

**Document problems:**
- The example text says "IEC number 29035100 is shared by ULIP system". It should say ITC(HS) code; the value is an itchs code.
- The key `poliicyCondition` is misspelled in the document. It is kept as written.
- The 3rd-party error case returns `responseStatus` "SUCCESS" with `error` "System exception while processing request" inside the response. The not-found case uses `responseStatus` "ERROR". The document does not say which is intended for a system error.
- Section 1.4 says "refer Section 1.6" for authentication. Authentication is in Section 1.5.
- The page header on every DGFT page reads "LDB Integration Requirement Document".
- Section 1.4.1 example text has the same "IEC number" copy error as DGFT/01 (see above).

---

## AAICLAS/01 — Air cargo tracking by AWB number and location (AAICLAS)

**Purpose:** AAICLAS API will share details of cargo information which exist in AAICLAS system in JSON format, given an AWB number and a location. The response uses the ExportTrackingData shape (shipping bill, X-ray, ULD, EGM), which suggests the export side. The document does not state export explicitly. The document does not name the airport or operator for AAICLAS or ACMES. AAICLAS/01 needs a location code (CCU in the example), and ACMES/01 does not. Compare AAICLAS/02, which is the import-side shape.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| awbnumber (table) / `awbNumber` (JSON in all examples) | Required | [0-9]{11} | Max 11 | Master Airway bill Number as available in AAICLAS system. |
| location | Required | [A-Z]{1,3} | Max 3 | Location as available in AAICLAS system |

**Example request body:**
```json
{"awbNumber": "61835488224", "location": "CCU"}
```

**Response — found:**
```json
{
      "response": [
             {
                   "response": {
                          "ExportTrackingData": {
                                 "AWB": null,
                                 "SHIPPING_BILL": [],
                                 "LOCATION_DETAILS": [],
                                 "XRAY_DETAILS": [],
                                 "ULD_DETAILS": [
                                       {
                                              "ULDNo": "BT-SQ517",
                                              "ULDType": "BULK",
                                              "Status": "R",
                                              "FlightNo": "SQ517",
                                              "FlightDate": "19/12/2021"
                                       }
                                 ],
                                 "EGM_DETAILS": [
                                       {
                                              "EGMNo": "7066",
                                              "EGMYear": "19/12/2021",
                                              "FlightNo": "SQ517",
                                              "FlightDate": "19/12/2021",
                                              "ATD": " ",
                                              "Commodity": "CRABS",
                                              "Packages": "33",
                                              "GrossWeight": "523"
                                       }
                                 ]
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

**Response — not found:** (AWB number does not exist in AAICLAS system; the document shows HTTP-level code 200 with `responseStatus` "SUCCESS")
```json
{
      "response": [
             {
                   "response": {
                          "ExportTrackingData": {
                                 "AWB": null,
                                 "SHIPPING_BILL": [],
                                 "LOCATION_DETAILS": [],
                                 "XRAY_DETAILS": [],
                                 "ULD_DETAILS": [],
                                 "EGM_DETAILS": []
                          }
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

Invalid AWB number:
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: awbNumber. Format should follow [0-9]{11}"
}
```

Invalid location:
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: location. Format should follow [A-Z]{1,3}"
}
```

Location does not exist in AAICLAS system (documented as a 200 response):
```json
{
      "response": [
             {
                   "response": "\"Value cannot be null.\\r\\nParameter name: remoteAddress\"",
                   "responseStatus": "ERROR"
             }
      ],
      "error": "false",
      "code": "200",
      "message": "Success"
}
```

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`, `message`: no description given.
- `ExportTrackingData`: `AWB`, `SHIPPING_BILL`, `LOCATION_DETAILS`, `XRAY_DETAILS`, `ULD_DETAILS`, `EGM_DETAILS`: no description given.
- `ULD_DETAILS[]`: `ULDNo`, `ULDType`, `Status`, `FlightNo`, `FlightDate`: no description given.
- `EGM_DETAILS[]`: `EGMNo`, `EGMYear`, `FlightNo`, `FlightDate`, `ATD`, `Commodity`, `Packages`, `GrossWeight`: no description given.

**Document problems:**
- The field table says `awbnumber`, but every JSON example uses `awbNumber`.
- Section 1.5 says "vehicle details" for AAICLAS/01 requests. This is copied from the vehicle document.
- The location-does-not-exist response exposes an internal .NET-style error string ("Value cannot be null. Parameter name: remoteAddress") inside a 200 response. The document does not say whether this is intended.
- The AWB-does-not-exist response is a 200 "SUCCESS" with `AWB` null and empty arrays, while format errors use a 400.
- Section 1.3.1 wording "AAICLAS Integration will add JSON in response key" is unclear.

---

## AAICLAS/02 — Air cargo tracking by AWB, HAWB and location (AAICLAS)

**Purpose:** AAICLAS API will share details of cargo information which exist in AAICLAS system in JSON format, given an AWB number, HAWB number and location. The response uses the ImportTrackingData shape (AWB details, IGM, delivery orders, gate passes), which suggests the import side. The document does not state import explicitly. Compare AAICLAS/01 (export-side shape, location only) and ACMES/02 (import-side shape, no location).

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| awbnumber (table) / `awbNumber` (JSON in all examples) | Required | [0-9]{11} | Max 11 | Master Airway bill Number as available in AAICLAS system. |
| hawb | Not-required | ^[a-zA-Z0-9]{0,20}$ | Max 20 | House Airway bill Number as available in AAICLAS system. |
| location | Required | [A-Z]{1,3} | Max 3 | Location as available in AAICLAS system |

**Example request body:**
```json
{"awbNumber": "15770597822", "hawb": "21120039", "location": "CCU"}
```

**Response — found:**
```json
{
      "response": [
             {
                   "response": {
                          "ImportTrackingData": {
                                 "AWB_DETAILS": {
                                       "IgmNo": "1986312",
                                       "IgmYear": "2021",
                                       "AwbNo": "15770597822",
                                       "HawbNo": "21120039",
                                       "ArrivedPackages": "2",
                                       "ArrivedWeight": "211.50",
                                       "ChargeableWeight": "211.50",
                                       "DamagedPackages": "0"
                                 },
                                 "IGM_DETAILS": [
                                       {
                                              "IgmNo": "1986312",
                                              "IgmYear": "2021",
                                              "FlightNo": "QR8094",
                                              "FlightDate": "20/12/2021",
                                              "SegregationDate": "20/12/2021 06:00",
                                              "SegregationStatus": "DONE",
                                              "ATA": "20/12/2021 02:25"
                                       }
                                 ],
                                 "DO_DETAILS": [
                                       {
                                              "DOIssuedBy": "QATAR AIRWAYS",
                                              "DODate": "20/12/2021 15:35:13",
                                              "HawbNo": "0",
                                              "DOIssuedTo": "UNIQUE LOGISTICS INTERNATIONAL (INDIA) PVT LTD"
                                       },
                                       {
                                              "DOIssuedBy": "UNIQUE LOGISTICS INTERNATIONAL (INDIA) PVT LTD",
                                              "DODate": "20/12/2021 07:09:13",
                                              "HawbNo": "21120039",
                                              "DOIssuedTo": "W.HUNGER HYDRAULICS INDIA PVT.LTD."
                                       }
                                 ],
                                 "GP_DETAILS": [
                                       {
                                              "GatePassNo": "N202112210010",
                                              "DeliveryPackages": "",
                                              "GeneratedOn": "21/12/2021 12:46:38",
                                              "DocStatus": "DELIVERED"
                                       }
                                 ],
                                 "LOC_DETAILS": []
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

AWB number does not exist:
```json
{
      "response": [
             {
                   "response": {
                          "ImportTrackingData": {
                                 "AWB_DETAILS": null,
                                 "IGM_DETAILS": [],
                                 "DO_DETAILS": [],
                                 "GP_DETAILS": [],
                                 "LOC_DETAILS": []
                          }
                   },
                   "responseStatus": "SUCCESS"
             }
      ],
      "error": "false",
      "code": "200",
      "message": "Success"
}
```

HAWB number does not exist (as shown in the document; note that `DO_DETAILS` is not empty):
```json
{
      "response": [
             {
                   "response": {
                          "ImportTrackingData": {
                                 "AWB_DETAILS": null,
                                 "IGM_DETAILS": [],
                                 "DO_DETAILS": [
                                       {
                                              "DOIssuedBy": "",
                                              "DODate": "20/12/2021 03:35:13",
                                              "HawbNo": "0",
                                              "DOIssuedTo": "UNIQUE LOGISTICS INTERNATIONAL (INDIA) PVT LTD"
                                       }
                                 ],
                                 "GP_DETAILS": [],
                                 "LOC_DETAILS": []
                          }
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

Invalid AWB number:
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: awbNumber. Format should follow [0-9]{11}"
}
```

Invalid HAWB number:
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: hawb. Format should follow ^[a-zA-Z0-9]{0,20}$"
}
```

Invalid location:
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: location. Format should follow [A-Z]{1,3}"
}
```

Location does not exist in AAICLAS system (documented as a 200 response):
```json
{
      "response": [
             {
                   "response": "\"Value cannot be null.\\r\\nParameter name: remoteAddress\"",
                   "responseStatus": "ERROR"
             }
      ],
      "error": "false",
      "code": "200",
      "message": "Success"
}
```

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`, `message`: no description given.
- `ImportTrackingData`: `AWB_DETAILS`, `IGM_DETAILS`, `DO_DETAILS`, `GP_DETAILS`, `LOC_DETAILS`: no description given.
- `AWB_DETAILS`: `IgmNo`, `IgmYear`, `AwbNo`, `HawbNo`, `ArrivedPackages`, `ArrivedWeight`, `ChargeableWeight`, `DamagedPackages`: no description given.
- `IGM_DETAILS[]`: `IgmNo`, `IgmYear`, `FlightNo`, `FlightDate`, `SegregationDate`, `SegregationStatus`, `ATA`: no description given.
- `DO_DETAILS[]`: `DOIssuedBy`, `DODate`, `HawbNo`, `DOIssuedTo`: no description given.
- `GP_DETAILS[]`: `GatePassNo`, `DeliveryPackages`, `GeneratedOn`, `DocStatus`: no description given.

**Document problems:**
- The field table says `awbnumber`, but every JSON example uses `awbNumber`.
- The "HAWB number does not exist" sample (c) returns a non-empty `DO_DETAILS` entry with `HawbNo` "0". This does not match the document's own "does not exist" wording or the AWB-not-found sample.
- The staging curl URL has a double slash: `/ulip/v1.0.0//AAICLAS/02`.
- The field table lists `hawb` as "Not-required" but the header row is partly garbled in the PDF. The regex and length are as shown.
- Section 1.5 covers authentication and examples only for AAICLAS/01; there is no separate AAICLAS/02 authentication example.
- The location-does-not-exist response is the same internal error string as AAICLAS/01 (see above).

---

## ACMES/01 — Air cargo tracking by AWB number (ACMES)

**Purpose:** ACMES API will share details of cargo information which exist in ACMES system in JSON format, given an AWB number. The response uses the ExportTrackingData shape, which suggests the export side. The document does not state export explicitly. Unlike AAICLAS/01, ACMES/01 takes no location. Compare ACMES/02, which is the import-side shape.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| awbnumber | Required | [0-9]{11} | Max 11 | Master Airway bill Number as available in ACMES system. |

**Example request body:**
```json
{"awbnumber": "40689348000"}
```

**Response — found:**
```json
{"response":[{"response":{"ExportTrackingData":{"AWB":{"Destination":"DXB","Packages":"24","GrossWeight":"464","ChargeableWeight":"464","TDGDateTime":"08/03/2021 16:57:00","BAGDateTime":"08/03/2021 21:13:00","GatePassDateTime":"N/A","HandOverDateTime":""},"SHIPPING_BILL":[],"LOCATION_DETAILS":[],"XRAY_DETAILS":[{"XRayDate":"08/03/2021 20:33","XRayMachine":"40011512","XRayBy":"XRAY05"}],"ULD_DETAILS":[{"ULDNo":"BT07IND:","ULDType":"BT","Status":"A","FlightNo":"6E9602","FlightDate":"10/03/2021"}],"EGM_DETAILS":[{"EGMNo":"341511","EGMYear":"11/03/2021","FlightNo":"6E23","FlightDate":"11/03/2021","ATD":" ","Commodity":"CONSOL COURIER","Packages":"24","GrossWeight":"464"}]}},"responseStatus":"SUCCESS"}],"error":"false","code":"200","message":"Success"}
```

**Response — not found:**
```json
{
            "response": [
                         {
                                     "response": {
                                                  "ExportTrackingData": {
                                                              "AWB": null,
                                                              "SHIPPING_BILL": [],
                                                              "LOCATION_DETAILS": [],
                                                              "XRAY_DETAILS": [],
                                                              "ULD_DETAILS": [],
                                                              "EGM_DETAILS": []
                                                  }
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
```json
{
            "response": null,
            "error": "true",
            "code": "400",
            "message": "Data format failed OR wrong value entered at: awbnumber. Format should follow [0-9]{11}"
}
```
Message text: "Data format failed OR wrong value entered at: awbnumber. Format should follow [0-9]{11}"

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`: no description given.
- `ExportTrackingData`: `AWB`, `SHIPPING_BILL`, `LOCATION_DETAILS`, `XRAY_DETAILS`, `ULD_DETAILS`, `EGM_DETAILS`: no description given.
- `AWB`: `Destination`, `Packages`, `GrossWeight`, `ChargeableWeight`, `TDGDateTime`, `BAGDateTime`, `GatePassDateTime`, `HandOverDateTime`: no description given.
- `XRAY_DETAILS[]`: `XRayDate`, `XRayMachine`, `XRayBy`: no description given.
- `ULD_DETAILS[]`: `ULDNo`, `ULDType`, `Status`, `FlightNo`, `FlightDate`: no description given.
- `EGM_DETAILS[]`: `EGMNo`, `EGMYear`, `FlightNo`, `FlightDate`, `ATD`, `Commodity`, `Packages`, `GrossWeight`: no description given.

**Document problems:**
- Section 1.5 says "vehicle details" for ACMES/01 requests. This is copied from the vehicle document.
- The production request body in Section 1.5 is garbled in the PDF (`Body: "awbnumber": "40689348000"` followed by a stray `{}`).
- The found sample has `ULDNo` "BT07IND:" with a trailing colon, and `ULDType` "BT". This may be sample data error; it is kept as written.
- The found sample is written as one compact line. It is valid JSON and is kept as written.

---

## ACMES/02 — Air cargo tracking by AWB and HAWB (ACMES)

**Purpose:** ACMES API will share details of cargo information which exist in ACMES system in JSON format, given an AWB number and HAWB number. The response uses the ImportTrackingData shape, which suggests the import side. The document does not state import explicitly. Unlike AAICLAS/02, ACMES/02 takes no location.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| awbnumber | Required | [0-9]{11} | Max 11 | Master Airway bill Number as available in ACMES system. |
| hawb | Not-Required | ^[a-zA-Z0-9]{0,20}$ | Max 20 | House Airway bill Number as available in ACMES system. |

**Example request body:**
```json
{"awbnumber": "23552194682", "hawb": "MUC75007115"}
```

**Response — found:**
```json
{
      "response": [
             {
                   "response": {
                          "ImportTrackingData": {
                                 "AWB_DETAILS": {
                                       "IgmNo": "1896697",
                                       "IgmYear": "2021",
                                       "AwbNo": "23552194682",
                                       "HawbNo": "MUC75007115",
                                       "ArrivedPackages": "1",
                                       "ArrivedWeight": "70",
                                       "ChargeableWeight": "192",
                                       "DamagedPackages": "0"
                                 },
                                 "IGM_DETAILS": [
                                       {
                                              "IgmNo": "1896697",
                                              "IgmYear": "2021",
                                              "FlightNo": "TK6448",
                                              "FlightDate": "16/03/2021",
                                              "SegregationDate": "16/03/2021 15:30",
                                              "SegregationStatus": "DONE",
                                              "ATA": "16/03/2021 04:45"
                                       }
                                 ],
                                 "DO_DETAILS": [
                                       {
                                              "DOIssuedBy": "TURKISH AIRLINES",
                                              "DODate": "17/03/2021 12:02:21",
                                              "HawbNo": "0",
                                              "DOIssuedTo": "SUNRISE FREIGHT FORWARDERS PVT. LTD."
                                       },
                                       {
                                              "DOIssuedBy": "SUNRISE FREIGHT FORWARDERS PVT. LTD.",
                                              "DODate": "17/03/2021 12:34:28",
                                              "HawbNo": "MUC75007115",
                                              "DOIssuedTo": "REGENT GARAGE (P) LTD."
                                       },
                                       {
                                              "DOIssuedBy": "SUNRISE FREIGHT FORWARDERS PVT. LTD.",
                                              "DODate": "17/03/2021 12:35:01",
                                              "HawbNo": "MUC75007116",
                                              "DOIssuedTo": "ASHWANI AUTOMOBILES PVT LTD."
                                       }
                                 ],
                                 "GP_DETAILS": [
                                       {
                                              "GatePassNo": "NN202103232098",
                                              "DeliveryPackages": "1",
                                              "GeneratedOn": "23/03/2021 11:48:00",
                                              "DocStatus": "DELIVERED"
                                       }
                                 ],
                                 "LOC_DETAILS": []
                          }
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

AWB number does not exist:
```json
{
            "response": [
                         {
                                     "response": {
                                                  "ImportTrackingData": {
                                                              "AWB_DETAILS": null,
                                                              "IGM_DETAILS": [],
                                                              "DO_DETAILS": [],
                                                              "GP_DETAILS": [],
                                                              "LOC_DETAILS": []
                                                  }
                                     },
                                     "responseStatus": "SUCCESS"
                         }
            ],
            "error": "false",
            "code": "200",
            "message": "Success"
}
```

HAWB number does not exist (the document's sample is identical to the AWB-not-found sample):
```json
{
            "response": [
                         {
                                     "response": {
                                                  "ImportTrackingData": {
                                                              "AWB_DETAILS": null,
                                                              "IGM_DETAILS": [],
                                                              "DO_DETAILS": [],
                                                              "GP_DETAILS": [],
                                                              "LOC_DETAILS": []
                                                  }
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

Invalid AWB number:
```json
{
          "response": null,
          "error": "true",
          "code": "400",
          "message": "Data format failed OR wrong value entered at: awbnumber. Format should follow [0-9]{11}"
}
```

Invalid HAWB number:
```json
{
          "response": null,
          "error": "true",
          "code": "400",
          "message": "Data format failed OR wrong value entered at: hawb. Format should follow ^[a-zA-Z0-9]{0,20}$"
}
```

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`: no description given.
- `ImportTrackingData`: `AWB_DETAILS`, `IGM_DETAILS`, `DO_DETAILS`, `GP_DETAILS`, `LOC_DETAILS`: no description given.
- `AWB_DETAILS`: `IgmNo`, `IgmYear`, `AwbNo`, `HawbNo`, `ArrivedPackages`, `ArrivedWeight`, `ChargeableWeight`, `DamagedPackages`: no description given.
- `IGM_DETAILS[]`: `IgmNo`, `IgmYear`, `FlightNo`, `FlightDate`, `SegregationDate`, `SegregationStatus`, `ATA`: no description given.
- `DO_DETAILS[]`: `DOIssuedBy`, `DODate`, `HawbNo`, `DOIssuedTo`: no description given.
- `GP_DETAILS[]`: `GatePassNo`, `DeliveryPackages`, `GeneratedOn`, `DocStatus`: no description given.

**Document problems:**
- The HAWB-does-not-exist sample (c) is identical to the AWB-does-not-exist sample (b). The document gives no example that separates the two cases.
- Section 1.5 says "vehicle details" for ACMES requests. This is copied from the vehicle document.
- The production request body in Section 1.5 is garbled in the PDF (same as ACMES/01).
- The HAWB regex is split across lines in the PDF (`^[a-zA-Z0-` / `9]{0,20}$`). It is rejoined here.
- The table header reads "Required/Not Required" with a garbled cell for `hawb`. The values are as shown.
- The ACMES/02 found sample is valid as written, with one wrap rejoined ("PVT. LTD.").

---

## FOIS/01 — FNR consignment tracking (FOIS)

**Purpose:** FOIS API will share details of fnr number which exist in FOIS system in JSON format. The document describes FOIS as tracking and monitoring the movement of wagons, locomotives and unit trains.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| fnrnumber | Required | [0-9]{11} | 11 | FNR (freight name record) number for consignment tracking |

**Example request body:**
```json
{"fnrnumber": "21030407355"}
```

**Response — found:**
```json
{ "response": [
      {
          "response": [
             {
                "newFnr": "",
                "etaDstn": "22:10 20-09-2023",
                "cmdt": "PHC",
                "currentStatus": "REACHED AT DESTINATION ON 22:10 20-09-2023",
                "lastRepStts": "AR",
                "locoNumb": "",
                "lastRepLocn": "M/S NABHA POWER LTD.SIDING(NPSB)",
                "lgtd": "76.515312",
                "fnrNo": "23091420258",
                "lttd": "30.538016",
                "stationFrom": "NEW KUSMUNDA COLLIERY SIDING, KORBA(NKCR)",
                "stationTo": "M/S NABHA POWER LTD.SIDING(NPSB)"
             }
          ],
          "responseStatus": "SUCCESS"
      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"}
```

**Response — not found:** Not given in document.

**Response — invalid input:** Not given in document (no invalid-input sample; only the common status-code list applies).

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`: no description given.
- Inside the inner `response` array: `newFnr`, `etaDstn`, `cmdt`, `currentStatus`, `lastRepStts`, `locoNumb`, `lastRepLocn`, `lgtd`, `fnrNo`, `lttd`, `stationFrom`, `stationTo`: no description given.

**Document problems:**
- Three different FNR numbers appear as examples: 21013108749 (Section 1.3.1 text), 21030407355 (JSON example, used here), and 00000023000 (production curl). The staging JSON example in the PDF is " 23121326682" with a leading space; the staging curl uses "23121326682" without it. Section 1.6 uses 23091420258 in the curl.
- Section 1.3.1 says the FNR is "passed within the URL body in JSON format". It is the JSON request body.
- Section 1.3 refers to "Section 1.7" for authentication. Authentication is in Section 1.6.
- No invalid-input or not-found sample is given.

---

## FOIS/02 — Freight charge details by from/to station, commodity and wagon type (FOIS)

**Purpose:** FOIS API will share details of sttnfrom, sttnto, cmdt and wgontype which exist in FOIS system in JSON format. The sample response is a freight calculation (rates, charges, taxes, surcharges, rebates and route) for the given inputs.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| sttnfrom | Required | [0-9]{10} | 10 | Enter the station from as available in freight fois system |
| sttnto | Required | [0-9]{10} | 10 | Enter the station to as available in freight fois system |
| cmdt | Required | [0-9]{10} | 10 | Enter the cmdt as available in freight fois system |
| wgontype | Required | [0-9]{10} | 10 | Enter the wgon type as available in freight fois system |

**Example request body:**
```json
{ "sttnfrom": "NZM", "sttnto": "HPP", "cmdt": "CEMENT", "wgontype": "BOXN"}
```

**Response — found:**
```json
{ "response": [
      {
          "response": {
             "stts": {
                "evntCode": "FRGTDTLS",
                "error": "",
                "successFailFlag": "S"
             },
             "frgt": {
                "tranloadclss": "140A",
                "wgonothrchrg": "0.00",
                "wgonfrgttaxwrds": "SIX LAKH SEVENTY-ONE THOUSAND EIGHT HUNDRED EIGHTEEN RUPEES ONLY",
                "tranntr": "779.93",
                "CCInfo": "CC+8",
                "dist": "488",
                "wgonbascfrgt": "746.10",
                "transurchrg": "101.73",
                "cmdtClssTL": "140A",
                "trantotlfrgt": "5,84,072.40",
                "wgongsttax": "31,992.00",
                "wgonrebtcont": "",
                "rateWL": "746.10",
                "surchrg": "DYNAMIC PRICING FOR COMMODITIES OTHER THAN COAL AND COK",
                "wgonchblwght": "680.0",
                "wgonsurcont": "1",
                "tranrebtrmrk": "",
                "rakeSize": "10",
                "tranrebtamount": "",
                "wgonothrcont": "3",
                "tranfinlfrgt": "5,84,072.40",
                "routInfo": "Shortest",
                "wgonfrgttax": "6,71,818",
                "wgonloadfrgt": "940.92",
                "PCC": "68.00",
                "miniRake": "10",
                "totlchblwght": "680.0",
                "tranrebtchrg": "0.00",
                "trangsttax": "29,204.00",
                "tranothrchrg": "0.00",
                "tranfullamount": "",
                "wgonntr": "858.02",
                "transurchrgdtls": [
                    {
                       "rebtamnt": "101.73",
                       "rebtcode": "DPO",
                       "prcn": "15.00",
                       "desc": "DYNAMIC PRICING FOR COMMODITIES OTHER THAN COAL AND COKE(DPO)"
                    }
                ],
                "wgonrebtprcen": "",
                "wgonsurchrg": "111.92",
                "tranfrgttaxwrds": "SIX LAKH THIRTEEN THOUSAND TWO HUNDRED SEVENTY-SEVEN RUPEES ONLY",
                "rateTL": "678.20",
                "tranbascfrgt": "678.20",
                "tranothrchrgdtls": [
                    {
                       "rebtamnt": "39.00",
                       "rebtcode": "DS",
                       "prcn": "5.00",
                       "desc": "DEVELOPMENT CHARGE(DS)"
                    },
                    {
                       "rebtamnt": "20.00",
                       "rebtcode": "OTC",
                       "prcn": "0",
                       "desc": "ORIGINATING TERMINAL CHARGES(OTC)"
                    },
                    {
                       "rebtamnt": "20.00",
                       "rebtcode": "DTC",
                       "prcn": "0",
                       "desc": "DESTINATION TERMINAL CHARGES(DTC)"
                    }
                ],
                "tranchrg": "79.00",
                "tranloadfrgt": "858.93",
                "tranrebtcont": "",
                "wgonrebtamount": "",
                "wgontotlfrgt": "6,39,825.60",
                "atlrout": [
                    {
                       "sttnto": "HARPALPUR- HPP (NC)",
                       "sttnfrom": "HAZRAT NIZAM-UD-DIN JN.- NZM (NR)"
                    }
                ],
                "wgonothrrebt": "0.00",
                "tranothrrebt": "0.00",
                "wgonfullamount": "",
                "othrchrg": "DEVELOPMENT CHARGE,ORIGINATING TERMINAL CHARGES,DESTINATION TERMINAL CHARGE",
                "tranfrgttax": "6,13,277",
                "wgonrebtrmrk": "",
                "minmRake": "10",
                "tranrebtprcen": "",
                "wgonrebtchrg": "0.00",
                "ETA": "20",
                "cmdtClssWL": "140B",
                "rebtchrg": "0",
                "tranothrcont": "3",
                "tranrebtchrgdtls": [],
                "transurcont": "1",
                "viaDesc": "TKD-AST-PWL-BTSR-MTJ-RKM-AGC-DHO-BLNR-GWL-VGLJ",
                "wgonchrg": "82.90",
                "wgonfinlfrgt": "6,39,825.60",
                "wgonloadclss": "140B"
             }
          },
          "responseStatus": "SUCCESS"
      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"}
```

**Response — not found:** Not given in document.

**Response — invalid input:** Not given in document (no invalid-input sample; only the common status-code list applies).

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`: no description given.
- `stts`: `evntCode`, `error`, `successFailFlag`: no description given.
- `frgt` (all fields, no description given): `tranloadclss`, `wgonothrchrg`, `wgonfrgttaxwrds`, `tranntr`, `CCInfo`, `dist`, `wgonbascfrgt`, `transurchrg`, `cmdtClssTL`, `trantotlfrgt`, `wgongsttax`, `wgonrebtcont`, `rateWL`, `surchrg`, `wgonchblwght`, `wgonsurcont`, `tranrebtrmrk`, `rakeSize`, `tranrebtamount`, `wgonothrcont`, `tranfinlfrgt`, `routInfo`, `wgonfrgttax`, `wgonloadfrgt`, `PCC`, `miniRake`, `totlchblwght`, `tranrebtchrg`, `trangsttax`, `tranothrchrg`, `tranfullamount`, `wgonntr`, `wgonrebtprcen`, `wgonsurchrg`, `tranfrgttaxwrds`, `rateTL`, `tranbascfrgt`, `tranchrg`, `tranloadfrgt`, `tranrebtcont`, `wgonrebtamount`, `wgontotlfrgt`, `wgonothrrebt`, `tranothrrebt`, `wgonfullamount`, `othrchrg`, `tranfrgttax`, `wgonrebtrmrk`, `minmRake`, `tranrebtprcen`, `wgonrebtchrg`, `ETA`, `cmdtClssWL`, `rebtchrg`, `tranothrcont`, `transurcont`, `viaDesc`, `wgonchrg`, `wgonfinlfrgt`, `wgonloadclss`: no description given.
- `transurchrgdtls[]`, `tranothrchrgdtls[]`, `tranrebtchrgdtls[]`: `rebtamnt`, `rebtcode`, `prcn`, `desc`: no description given. (`tranrebtchrgdtls` is an empty array in the sample.)
- `atlrout[]`: `sttnto`, `sttnfrom`: no description given.

**Document problems:**
- Section 1.4 gives format `[0-9]{10}` for all four inputs (sttnfrom, sttnto, cmdt, wgontype). The example values are station codes "NZM" and "HPP", commodity "CEMENT" and wagon type "BOXN", which do not match `[0-9]{10}`. The format rule and the example are inconsistent.
- The staging curl example includes a Cookie header. It is not copied here.
- Section 1.4 says "Enter the cmdt as available..." with no further definition of the codes.
- Several sample values are strings with Indian digit grouping (for example "5,84,072.40", "6,71,818"). They are kept as written.
- Section 1.4 says "refer Section 1.7" for authentication. Authentication is in Section 1.6.
- The sample `wgonfrgttaxwrds` and `tranfrgttaxwrds` values were split by the PDF at a hyphen ("SEVENTY-" / "ONE"). They are rejoined here.
- No invalid-input or not-found sample is given.

---

## FOIS/04 — Parcel tracking by lngpwbltno (FOIS)

**Purpose:** FOIS API will share details of Parcel tracking based on lngpwbltno which exist in FOIS system in JSON format.

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| lngpwbltno | Required | [0-9]{10} | 10 | Enter the lngpwbltno as available in FOIS system. |

**Example request body:**
```json
{"lngpwbltno": "4002411032"}
```

**Response — found:**
```json
{
   "response": [
      {
          "response": [
             {
                "RR": {
                    "PWBLTNO": "4002411032",
                    "SCALE": "Lugguage",
                    "BDT": "02-09-2025",
                    "CNEE": "RAM UDGAR",
                    "CNEEADD": "MIRZAPUR JYG",
                    "CNOR": "RAM UDGAR",
                    "FSTN": "BAREILLY JN.",
                    "ITMDET_PRNT": {
                       "ITMDET": {
                          "LOADSTNDET": "",
                          "UNLOADSTATUS_DT": "05-Sep-2025 00:52",
                          "LOADTRAIN": "14650",
                          "UNLOADSTNDET": "",
                          "DESC": "BICYCLE (40KG)",
                          "UNLOADTRAIN": "14650",
                          "STATUS_DT": "06-Sep-2025 08:26",
                          "STATUS": "Delivered",
                          "STNDET": "",
                          "TOTITMS": "2",
                          "LOADSTATUS_DT": "04-Sep-2025 03:37"
                       }
                    },
                    "CNORADD": "MIRZAPUR JYG",
                    "TSTN": "JYG-JAYNAGAR"
                }
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

**Response — not found:** (data do not exist for given lngpwbltno; the document shows responseStatus "SUCCESS" with an error text inside)
```json
{ "response": [
      {
          "response": [
             {
                "error": "Invalid Receipt Number.."
             }
          ],
          "responseStatus": "SUCCESS",
          "message": null
      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"}
```

**Response — invalid input:**
```json
{ "response": null,
   "error": "true",
   "code": "400 BAD_REQUEST",
   "message": "Data format failed OR wrong value entered at: lngpwbltno. Format should follow [0-9]{10}"}
```
Message text: "Data format failed OR wrong value entered at: lngpwbltno. Format should follow [0-9]{10}"

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`, `message`: no description given.
- `RR`: `PWBLTNO`, `SCALE`, `BDT`, `CNEE`, `CNEEADD`, `CNOR`, `FSTN`, `ITMDET_PRNT`, `CNORADD`, `TSTN`: no description given.
- `ITMDET_PRNT.ITMDET`: `LOADSTNDET`, `UNLOADSTATUS_DT`, `LOADTRAIN`, `UNLOADSTNDET`, `DESC`, `UNLOADTRAIN`, `STATUS_DT`, `STATUS`, `STNDET`, `TOTITMS`, `LOADSTATUS_DT`: no description given.
- Not-found object: `error`: no description given.

**Document problems:**
- The staging URL is written as `https://ulipstaging.dpiit.gov.in/ulip/v1.0.0/FOIS/04` in Section 1.5.1, without "www". The other staging URLs use "www.ulipstaging".
- The invalid-format `code` is the string "400 BAD_REQUEST", unlike the numeric "400" used in the other documents.
- The not-found sample is `responseStatus` "SUCCESS" with an error string inside `response`. Its heading says data do not exist.
- The error string "Invalid Receipt Number.." has two trailing dots. It is kept as written.
- Date formats differ inside the sample (`BDT` "02-09-2025" vs `UNLOADSTATUS_DT` "05-Sep-2025 00:52"). No format is documented.
- Section 1.5 refers to "Section 1.7" for authentication. Authentication is in Section 1.6.
- The status-code list says "Some internal server errors occurred" (plural), unlike the other documents.

---

## LDB/01 — Container tracking by container number (LDB)

**Purpose:** LDB API will share details of container tracking information which exist in LDB system in JSON format (input: container number).

**Request body fields:**

| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| containerNumber (table shows "containerNu mber", split by the PDF) | Required | ^[a-zA-Z0-9]{8,11}$ | Min 8, Max 11 | container number as available in LDB system. |

**Example request body:**
```json
{"containerNumber": "ACMP1000010"}
```

**Response — found:**
```json
{
       "response": [
              {
                     "response": {
                             "eximContainerTrail": {
                                    "cntrDetail": {
                                           "cntrno": "NSST1234570",
                                           "refflg": "Yes",
                                           "cntrsize": 40,
                                           "isocode": "22G3",
                                           "containertype": null
                                    },
                                    "dpd_dpe": {
                                           "c_import": {
                                                  "dpd": "N",
                                                  "destination": null
                                           },
                                           "c_export": null
                                    },
                                    "last_event": [
                                           {
                                                  "serialno": 1,
                                                  "eventname": "PORT OUT",
                                                  "currentlocation": "Raigad/Nhava Sheva Freeport Terminal (NSFT)",
                                                  "division": null,
                                                  "timestamptimezone": "2023-03-29 11:00:09",
                                                  "timezoneabvr": "IST",
                                                  "latitude": 18.950149,
                                                  "longitude": 72.95123,
                                                  "containernumber": "NSST1234570",
                                                  "timeinms": 1680067809000,
                                                  "transportmode": "TRUCK",
                                                  "type": "I",
                                                  "isempty": "Y"
                                           }
                                    ],
                                    "res_Message": "Success",
                                    "trackLog": [
                                           {
                                                  "serialno": 1,
                                                  "eventname": "PORT OUT",
                                                  "currentlocation": "Raigad/Nhava Sheva Freeport Terminal (NSFT)",
                                                  "division": null,
                                                  "timestamptimezone": "2023-03-29 11:00:09",
                                                  "timezoneabvr": "IST",
                                                  "latitude": 18.950149,
                                                  "longitude": 72.95123,
                                                  "containernumber": "NSST1234570",
                                                  "timeinms": 1680067809000,
                                                  "transportmode": "TRUCK",
                                                  "type": "I",
                                                  "isempty": "Y"
                                           },
                                           {
                                                  "serialno": 2,
                                                  "eventname": "PORT IN",
                                                  "currentlocation": "Raigad/Nhava Sheva Freeport Terminal (NSFT)",
                                                  "division": null,
                                                  "timestamptimezone": "2023-03-28 09:00:08",
                                                  "timezoneabvr": "IST",
                                                  "latitude": 18.950149,
                                                  "longitude": 72.95123,
                                                  "containernumber": "NSST1234570",
                                                  "timeinms": 1679974208000,
                                                  "transportmode": "VESSEL",
                                                  "type": "I",
                                                  "isempty": "Y"
                                           }
                                    ],
                                    "vessel_ata": null,
                                    "vessel_atd": null,
                                    "vessel_eta": [
                                           {
                                                  "eventid": 24,
                                                  "infotime": 1680659629000,
                                                  "eventname": "EXPECTED VESSEL ARRIVAL",
                                                  "orgname": "Nhava Sheva Freeport Terminal (NSFT)",
                                                  "timeinms": 1679978002000,
                                                  "timetimestamp": "2023-03-28 10:03:22",
                                                  "latitude": null,
                                                  "longitude": null,
                                                  "vesselname": "APR EXPRESSS",
                                                  "vesselimo": null,
                                                  "cntrcycleid": 1,
                                                  "shippingline": "TRANSPORT CORPORATION OF INDIA LTD"
                                           }
                                    ],
                                    "vessel_etd": null,
                                    "vessel_gate_cutoff": null
                             },
                             "domesticContainerTrail": {
                                    "cntrDetail": null,
                                    "dpd_dpe": null,
                                    "last_event": null,
                                    "res_Message": "NO RECORD FOUND",
                                    "trackLog": null,
                                    "vessel_ata": null,
                                    "vessel_atd": null,
                                    "vessel_eta": null,
                                    "vessel_etd": null,
                                    "vessel_gate_cutoff": null
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
                     "responseStatus": "FAILURE",
                     "message": {
                             "text": "Container details not found for the given container number: TCLU8538800"
                     }
              }
       ],
       "error": "false",
       "code": "200",
       "message": "Success"
}
```

**Response — invalid input:**
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: containerNumber. Format should follow [A-Z]{4}[0-9]{4,7}"
}
```
Message text: "Data format failed OR wrong value entered at: containerNumber. Format should follow [A-Z]{4}[0-9]{4,7}"

**Response field meanings:**
- Top level `response`, `error`, `code`, `message`, and per-item `responseStatus`, `message`: no description given.
- `eximContainerTrail` and `domesticContainerTrail` (both objects): `cntrDetail`, `dpd_dpe`, `last_event`, `res_Message`, `trackLog`, `vessel_ata`, `vessel_atd`, `vessel_eta`, `vessel_etd`, `vessel_gate_cutoff`: no description given.
- `cntrDetail`: `cntrno`, `refflg`, `cntrsize`, `isocode`, `containertype`: no description given.
- `dpd_dpe`: `c_import` (`dpd`, `destination`), `c_export`: no description given.
- `last_event[]` and `trackLog[]`: `serialno`, `eventname`, `currentlocation`, `division`, `timestamptimezone`, `timezoneabvr`, `latitude`, `longitude`, `containernumber`, `timeinms`, `transportmode`, `type`, `isempty`: no description given.
- `vessel_eta[]`: `eventid`, `infotime`, `eventname`, `orgname`, `timeinms`, `timetimestamp`, `latitude`, `longitude`, `vesselname`, `vesselimo`, `cntrcycleid`, `shippingline`: no description given.

**Document problems:**
- The field name in the table is split across lines by the PDF ("containerNu / mber"). The JSON example key is `containerNumber`, and that is used here.
- The format regex in the table, `^[a-zA-Z0-9]{8,11}$`, does not match the regex in the invalid-format message, `[A-Z]{4}[0-9]{4,7}`. The two rules are different. The example values fit both.
- The not-found response uses `responseStatus` "FAILURE" and a `message` object, while other documents use a string `message` or `responseStatus` "SUCCESS"/"ERROR".
- Section 1.3.1 says "LDB Integration will add response from LDB system as value to response key". The wording is unclear.
- The found sample has a numeric `cntrsize` (40), while other documents' numeric-looking values are strings. Kept as written.
- The document also contains CFSICD/01 in the same file. It is not in scope for this extraction.
