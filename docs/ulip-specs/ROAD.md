# ULIP ROAD API specifications

Extracted offline from the six ULIP integration PDFs (pdftotext -layout). No network requests were made.

- ULIP_FASTAG_Integration_Requirement.pdf: Version 5.0, dated 30/03/2026, 17 pages
- ULIP_VAHAN_Integration_Requirement.pdf: Version 6.0, dated 27/03/2026, 32 pages
- ULIP_SARATHI_Integration_Requirement.pdf: Version 5.0, dated 11/06/2026, 14 pages
- ULIP_ECHALLAN_Integration_Requirement.pdf: Version 4.0, dated 26/03/2026, 12 pages
- ULIP_EWAYBILL_Integration_Requirement.pdf: Version 3.0, dated 26/03/2026, 10 pages
- ULIP_Toll_Charges_Integration_Requirement.pdf: Version 4.0, dated 18/05/2026, 40 pages

Page counts are the page totals shown in each document's footer ("Page x of N"), including the unnumbered cover page.

Bearer tokens from curl examples are not copied. Where a sample came from a wrapped PDF line, the wrap was rejoined. Keys and values were not changed.

---

## FASTAG/01 — FASTag transactions by vehicle registration or chassis number
**Purpose:** This API will take Vehicle registration number / Vehicle Chassis number and connect with FASTAG API to get data. Data related to VRN will be available for past 72 Hours.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vehiclenumber | Required | ^[A-Z0-9]{5,11}$\|^[A-Z0-9]{17,20}$ | (5 to 11) and (17 to 20) | Vehicle registration number / Vehicle Chassis number as available in FASTAG system. |

**Example request body:** (production example, section 1.3.1)
```json
{"vehiclenumber": "GA060000"}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "result": "SUCCESS",
             "respCode": "000",
             "ts": "2021-11-01T19:20:47",
             "vehicle": {
                "errCode": "000",
                "vehltxnList": {
                    "totalTagsInMsg": "2",
                    "msgNum": "1",
                    "totalTagsInresponse": "2",
                    "totalMsg": "1",
                    "txn": [
                       {
                          "readerReadTime": "2021-10-30 12:26:09.0",
                          "seqNo": "68d47e2d-c10f-4f57-b12a-2dfb547ce5c8",
                          "laneDirection": "N",
                          "tollPlazaGeocode": "11.0001,11.0001",
                          "tollPlazaName": "GMR Chillakallu Toll Plaza",
                          "vehicleType": "VC7",
                          "vehicleRegNo": "MH19JK3923"
                       },
                       {
                          "readerReadTime": "2021-10-30 12:41:23.0",
                          "seqNo": "6361cf5f-8ddd-46dd-9593-0aa0e1fd5780",
                          "laneDirection": "N",
                          "tollPlazaGeocode": "11.0001,11.0001",
                          "tollPlazaName": "GMR Chillakallu Toll Plaza",
                          "vehicleType": "VC7",
                          "vehicleRegNo": "MH19JK3923"
                       }
                    ]
                }
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
```json
{
   "response": [
      {
          "response": {
             "result": "FAILURE",
             "respCode": "000",
             "ts": "2022-02-15T11:34:31",
             "vehicle": {
                "errCode": "740"
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
   "message": "Data format failed OR wrong value entered at: vehiclenumber. Format should follow ^[A-Z0-9]{5,11}$|^[A-Z0-9]{17,20}$"
}
```
**Response field meanings:**
- `response`: no description given (the list of result objects in found/not-found cases; null on invalid input)
- `error`: no description given (string "true" or "false")
- `code`: no description given ("200", "400")
- `message`: no description given ("Success" in samples)
- `result`: no description given ("SUCCESS" or "FAILURE")
- `respCode`: no description given
- `ts`: no description given (timestamp)
- `vehicle`: no description given
- `errCode`: no description given ("000" found, "740" not found)
- `vehltxnList`: no description given
- `totalTagsInMsg`, `msgNum`, `totalTagsInresponse`, `totalMsg`: no description given
- `txn`: no description given (list of transactions)
- `readerReadTime`: no description given
- `seqNo`: no description given
- `laneDirection`: no description given
- `tollPlazaGeocode`: no description given
- `tollPlazaName`: no description given
- `vehicleType`: no description given
- `vehicleRegNo`: no description given
- `responseStatus`: no description given
- HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server errors occurred; 502 server is not responding.

**Document problems:**
- Section 1.3.1 72-hour note has a typo: "1rd Jan" (should read "1st Jan" or "3rd Jan" as the example intends).

---

## FASTAG/02 — FASTag vehicle or tag details by vehicle number or tag ID
**Purpose:** This API will take Vehicle registration number / tagid and connect with FASTAG API to get data. Exactly one of vehiclenumber or tagid must be entered in the request body.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vehiclenumber | Optional | ^[A-Z0-9]{5,11}$\|^[A-Z0-9]{17,20}$ | (5 to 11) and (17 to 20); "(0 to 25)" also appears in this cell (placement ambiguous, see Document problems) | Vehicle registration number / Vehicle Chassis number as available in FASTAG system. |
| tagid | Optional | ^[A-Z0-9]{0,25}$ | Not given in document | Tag id as available in FASTAG system. |

**Example request body:** (production example, section 1.4.1; both fields are shown, which the document's note says is an error)
```json
{"vehiclenumber": "MP09HF4987",
"tagid": "34161FA8203286140F4064E0"}
```
**Response — found:** (two samples are given: sample 6 for a vehicle number and sample 7 for a tag ID)

Sample 6, vehicle number exists:
```json
{
   "response": [
      {
          "response": {
             "result": "SUCCESS",
             "successReqCnt": "1",
             "totReqCnt": "1",
             "respCode": "000",
             "ts": "2024-03-14T14:07:48",
             "vehicle": {
                "errCode": "000",
                "vehicledetails": [
                    {
                       "detail": [
                          {
                              "name": "TAGID",
                              "value": "34161FA820328972020FB320"
                          },
                          {
                              "name": "REGNUMBER",
                              "value": "MP09HF4987"
                          },
                          {
                              "name": "TID",
                              "value": "E20034120183C2FFEEB86B77"
                          },
                          {
                              "name": "VEHICLECLASS",
                              "value": "VC11"
                          },
                          {
                              "name": "TAGSTATUS",
                              "value": "I"
                          },
                          {
                              "name": "ISSUEDATE",
                              "value": "2017-07-14"
                          },
                          {
                              "name": "EXCCODE",
                              "value": "06"
                          },
                          {
                              "name": "BANKID",
                              "value": "607417"
                          },
                          {
                              "name": "COMVEHICLE",
                              "value": "T"
                          }
                       ]
                    },
                    {
                       "detail": [
                          {
                              "name": "TAGID",
                              "value": "34161FA8203289720E14EEA0"
                          },
                          {
                              "name": "REGNUMBER",
                              "value": "MP09HF4987"
                          },
                          {
                              "name": "TID",
                              "value": "E20034120137FE0006D097ED"
                          },
                          {
                              "name": "VEHICLECLASS",
                              "value": "VC11"
                          },
                          {
                              "name": "TAGSTATUS",
                              "value": "I"
                          },
                          {
                              "name": "ISSUEDATE",
                              "value": "2019-01-09"
                          },
                          {
                              "name": "EXCCODE",
                              "value": "06"
                          },
                          {
                              "name": "BANKID",
                              "value": "607417"
                          },
                          {
                              "name": "COMVEHICLE",
                              "value": "T"
                          }
                       ]
                    },
                    {
                       "detail": [
                          {
                              "name": "TAGID",
                              "value": "34161FA82033E764D9F45341"
                          },
                          {
                              "name": "REGNUMBER",
                              "value": "MP09HF4987"
                          },
                          {
                              "name": "TID",
                              "value": "34161FA82033E764D9F45341"
                          },
                          {
                              "name": "VEHICLECLASS",
                              "value": "VC11"
                          },
                          {
                              "name": "TAGSTATUS",
                              "value": "A"
                          },
                          {
                              "name": "ISSUEDATE",
                              "value": "2019-10-11"
                          },
                          {
                              "name": "EXCCODE",
                              "value": "00"
                          },
                          {
                              "name": "BANKID",
                              "value": "652210"
                          },
                          {
                              "name": "COMVEHICLE",
                              "value": "T"
                          }
                       ]
                    }
                ]
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
Sample 7, tag ID exists. The PDF sample has one unmatched closing brace before `"responseStatus"`. It is re-nested below so it parses; keys and values are unchanged.
```json
{
   "response": [
      {
          "response": {
             "result": "SUCCESS",
             "successReqCnt": "1",
             "totReqCnt": "1",
             "respCode": "000",
             "ts": "2024-03-14T14:09:07",
             "vehicle": {
                "errCode": "000",
                "vehicledetails": [
                    {
                       "detail": [
                          {
                             "name": "TAGID",
                             "value": "34161FA8203286140F4064E0"
                          },
                          {
                             "name": "REGNUMBER",
                             "value": "MAT735701"
                          },
                          {
                             "name": "TID",
                             "value": "E2801105200088444B320B00"
                          },
                          {
                             "name": "VEHICLECLASS",
                             "value": "VC4"
                          },
                          {
                             "name": "TAGSTATUS",
                             "value": "A"
                          },
                          {
                             "name": "ISSUEDATE",
                             "value": "2023-07-10"
                          },
                          {
                             "name": "EXCCODE",
                             "value": "00"
                          },
                          {
                             "name": "BANKID",
                             "value": "606986"
                          },
                          {
                             "name": "COMVEHICLE",
                             "value": "F"
                          }
                       ]
                    }
                ]
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
**Response — not found:** (sample 5, vehicle number or tag ID does not exist)
```json
{
   "response": [
      {
          "response": {
             "result": "FAILURE",
             "successReqCnt": "0",
             "totReqCnt": "1",
             "respCode": "239",
             "ts": "2024-03-14T14:07:09",
             "vehicle": {
                "errCode": "239"
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
**Response — invalid input:** (four cases in the document)

1. Invalid vehicle number:
```json
{

   "response": null,
   "error": "true",
   "code": "400",
   "message": "Data format failed OR wrong value entered at: vehiclenumber. Format should follow [A-Z]{2}[0-9]{2}[A-Z]{0,5}[0-9]{4}$"
}
```
2. Invalid tagid:
```json
{

   "response": null,
   "error": "true",
   "code": "400",
   "message": "Data format failed OR wrong value entered at: tagid. Format should follow ^[A-Z0-9]{0,25}$"
}
```
3. vehiclenumber or tagid is null or empty:
```json
{

   "response": [
      {
          "response": "vehiclenumber or tagid :must not be Empty or null, Please enter vehiclenumber or tagid",
          "responseStatus": "ERROR"

      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"
}
```
4. Both vehiclenumber and tagid entered:
```json
{

   "response": [
      {
          "response": {
             "result": "FAILURE",
             "successReqCnt": "0",
             "totReqCnt": "1",
             "respCode": "239",
             "ts": "2024-03-15T09:23:19",
             "vehicle": {
                "errCode": "239"
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
**Response field meanings:**
- `response`: no description given
- `error`: no description given
- `code`: no description given
- `message`: no description given
- `responseStatus`: no description given ("SUCCESS" or "ERROR")
- `result`: no description given ("SUCCESS" or "FAILURE")
- `successReqCnt`: no description given
- `totReqCnt`: no description given
- `respCode`: no description given
- `ts`: no description given (timestamp)
- `vehicle`: no description given
- `errCode`: no description given ("000" found, "239" not found or both entered)
- `vehicledetails`: no description given (list of tag detail groups)
- `detail`: no description given (list of name/value pairs)
- `name` and `value` (inside `detail`): no description given. Name values seen in the samples are TAGID, REGNUMBER, TID, VEHICLECLASS, TAGSTATUS, ISSUEDATE, EXCCODE, BANKID, COMVEHICLE. Their meanings are not given.
- HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server errors occurred; 502 server is not responding.

**Document problems:**
- The regex in the field table for vehiclenumber (`^[A-Z0-9]{5,11}$|^[A-Z0-9]{17,20}$`) does not match the regex in the invalid-vehiclenumber error message (`[A-Z]{2}[0-9]{2}[A-Z]{0,5}[0-9]{4}$`). The two are different patterns.
- The length cell for vehiclenumber contains "(5 to 11) and (17 to 20)" and "(0 to 25)". The "(0 to 25)" sits on the vehiclenumber row but matches the tagid regex. Its placement is ambiguous.
- The staging example sends `"vehiclenumber": ""` together with a tagid. The table allows vehiclenumber to be Optional, but the table regex does not match an empty string. The document does not say whether an empty string counts as absent.
- Samples 4 (both fields entered) and 5 (not found) have the same shape and the same values (`respCode` "239", `errCode` "239", `result` "FAILURE"). They differ only in `ts`. The document does not state how the two cases differ.
- The document says entering both fields gives an error response, but sample 4 is a SUCCESS-status response with respCode 239.
- Sample 7 has an unmatched brace in the PDF (see the note above the sample).
- The section 1.4.1 technical approach numbering restarts at 5 (continues from FASTAG/01). Cosmetic only.

---

## VAHAN/01 — Vehicle registration (RC) record by vehicle number, XML in a string
**Purpose:** This API will take vehicle number and connect with VAHAN API to get data. The VAHAN record comes back as an XML document converted to a string under the `response` key (not JSON); this is the vehicle-number lookup with XML output.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vehiclenumber | Required | ^[a-zA-Z0-9]{5,11}$ | Min 5, Max 11 | Vahicle Number as available in VAHAN system |

**Example request body:** (production example, section 1.4)
```json
{
  "vehiclenumber": "UP91L0001"

}
```
**Response — found:** The document gives only one sample of the record, and it is shown under "a) In case of invalid format". It is a success response, not an error. See Document problems.
```json
{
   "response": [
      {
          "response": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n<stautsMessage>OK</stautsMessage>\n<rc_regn_no>UP91L0001</rc_regn_no>\n<rc_regn_dt>26-Jan-2017</rc_regn_dt>\n<rc_regn_upto>25-Jan-2032</rc_regn_upto>\n<rc_purchase_dt>24-Jan-2017</rc_purchase_dt>\n<rc_owner_sr>1</rc_owner_sr>\n<rc_owner_name>R***L K***R</rc_owner_name>\n<state_cd>UP</state_cd>\n<rto_cd>91</rto_cd>\n<rc_present_address>, 999999</rc_present_address>\n<rc_permanent_address>, 999999</rc_permanent_address>\n<rc_vch_catg>2WN</rc_vch_catg>\n<rc_vh_class_desc>M-Cycle/Scooter(2WN)</rc_vh_class_desc>\n<rc_vhclass_desc>M-Cycle/Scooter</rc_vhclass_desc>\n<rc_chasi_no>ME4JF509AH70*****</rc_chasi_no>\n<rc_eng_no>JF50E760*****</rc_eng_no>\n<rc_maker_desc>HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD</rc_maker_desc>\n<rc_maker_model>HONDA ACTIVA</rc_maker_model>\n<rc_body_type_desc>SOLO</rc_body_type_desc>\n<rc_fuel_desc>PETROL</rc_fuel_desc>\n<rc_color>P A WHITE</rc_color>\n<rc_norms_desc>BHARAT STAGE II</rc_norms_desc>\n<rc_fit_upto>25-Jan-2032</rc_fit_upto>\n<rc_tax_upto>25-01-2032</rc_tax_upto>\n<rc_financer></rc_financer>\n<rc_insurance_comp>HDFC ERGO General Insurance Company Ltd</rc_insurance_comp>\n<rc_insurance_policy_no>2320100501934300000</rc_insurance_policy_no>\n<rc_insurance_upto>15-Sep-2020</rc_insurance_upto>\n<rc_manu_month_yr>1/2017</rc_manu_month_yr>\n<rc_unld_wt>108</rc_unld_wt>\n<rc_gvw>269</rc_gvw>\n<rc_no_cyl>1</rc_no_cyl>\n<rc_cubic_cap>109.00</rc_cubic_cap>\n<rc_seat_cap>2</rc_seat_cap>\n<rc_sleeper_cap></rc_sleeper_cap>\n<rc_stand_cap>0</rc_stand_cap>\n<rc_wheelbase>1230</rc_wheelbase>\n<rc_registered_at>HAMIRPUR(UP), Uttar Pradesh</rc_registered_at>\n<rc_status_as_on>03-Feb-2026</rc_status_as_on>\n<rc_status>ACTIVE</rc_status>\n<rc_blacklist_status></rc_blacklist_status>\n<rc_noc_details></rc_noc_details>\n<rc_vh_type>N</rc_vh_type>\n<rc_vh_class>1</rc_vh_class>\n<rc_noc_dt></rc_noc_dt>\n<rc_fuel_cd>1</rc_fuel_cd>\n<rc_maker_cd>36</rc_maker_cd>\n<rc_model_cd>HONDA ACTIVA</rc_model_cd>\n<rc_norms_cd>0</rc_norms_cd>\n<rc_sale_amt>51129.0</rc_sale_amt>\n<rc_own_catg_desc>OTHERS</rc_own_catg_desc>\n<rc_vch_catg_desc>TWO WHEELER(NT)</rc_vch_catg_desc>\n<rc_owner_cd_desc>INDIVIDUAL</rc_owner_cd_desc>\n<rc_vehicle_surrendered_to_dealer>0</rc_vehicle_surrendered_to_dealer>\n<rc_currentadd_districtcode>0</rc_currentadd_districtcode>\n<rc_non_use>false</rc_non_use>\n<rc_passenger_tax></rc_passenger_tax>\n<rc_goods_tax></rc_goods_tax>\n<rc_tax_mode>L</rc_tax_mode>\n</VehicleDetails>\n",

          "responseStatus": "SUCCESS",
          "message": null
      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success"
}
```
**Response — not found:** Not given in document.

**Response — invalid input:** Not given in document. The sample under "a) In case of invalid format" is the success response shown above. No error message text is given for VAHAN/01.

**Response field meanings:**
- `response`: the VAHAN XML converted to a string (per section 1.4.1)
- `responseStatus`: no description given
- `message` (inside the element): no description given
- `error`, `code`, `message` (top level): no description given
- Inside the XML, every tag is listed below. No description is given for any of them.
  - `stautsMessage` (spelling as in the document), `rc_regn_no`, `rc_regn_dt`, `rc_regn_upto`, `rc_purchase_dt`, `rc_owner_sr`, `state_cd`, `rto_cd`, `rc_vch_catg`, `rc_vh_class_desc`, `rc_vhclass_desc`, `rc_chasi_no`, `rc_eng_no`, `rc_maker_desc`, `rc_maker_model`, `rc_body_type_desc`, `rc_fuel_desc`, `rc_color`, `rc_norms_desc`, `rc_fit_upto`, `rc_tax_upto`, `rc_financer`, `rc_insurance_comp`, `rc_insurance_policy_no`, `rc_insurance_upto`, `rc_manu_month_yr`, `rc_unld_wt`, `rc_gvw`, `rc_no_cyl`, `rc_cubic_cap`, `rc_seat_cap`, `rc_sleeper_cap`, `rc_stand_cap`, `rc_wheelbase`, `rc_registered_at`, `rc_status_as_on`, `rc_status`, `rc_blacklist_status`, `rc_noc_details`, `rc_vh_type`, `rc_vh_class`, `rc_noc_dt`, `rc_fuel_cd`, `rc_maker_cd`, `rc_model_cd`, `rc_norms_cd`, `rc_sale_amt`, `rc_own_catg_desc`, `rc_vch_catg_desc`, `rc_owner_cd_desc`, `rc_vehicle_surrendered_to_dealer`, `rc_currentadd_districtcode`, `rc_non_use`, `rc_passenger_tax`, `rc_goods_tax`, `rc_tax_mode`: no description given for each.
  - `rc_owner_name`, `rc_present_address`, `rc_permanent_address`: masked by default for all users (section 1.3). The document does not describe the mask pattern beyond the sample values.
  - `rc_mobile_no`, `rc_f_name`: listed as masked fields in section 1.3. Neither appears in any sample.
- HTTP status codes: 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The "a) In case of invalid format" sample is a SUCCESS response with full XML data, not an invalid-format error. There is no real invalid-format sample and no not-found sample for VAHAN/01.
- Section 1.3 lists `rc_mobile_no` and `rc_f_name` as masked fields. Neither appears in any sample.
- Section 1.10 gives the production URL as `/VAHAN/<sequence number>`, but the examples use `/VAHAN/01` to `/VAHAN/06`.

---

## VAHAN/02 — Vehicle registration (RC) record by chassis number, XML in a string
**Purpose:** This API will take a chassis number (field `chasisnumber`) and connect with VAHAN API to get data. The VAHAN record comes back as an XML document converted to a string under the `response` key. The section's own opening sentence says "vehicle number", which is incorrect (see Document problems).
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| chasisnumber | Required | ^[a-zA-Z0-9]{1,20}$ | Min 1, Max 20 | Chassis Number as available in VAHAN system |

**Example request body:** (production example, section 1.5)
```json
{
  "chasisnumber": " ME4JF509AH7069705"

}
```
Note: the production example value has a leading space (`" ME4JF509AH7069705"`), as printed in the document.

**Response — found:**
```json
{
   "response": [
      {
          "response": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n<stautsMessage>OK</stautsMessage>\n<rc_regn_no>UP91L0001</rc_regn_no>\n<rc_regn_dt>26-Jan-2017</rc_regn_dt>\n<rc_regn_upto>25-Jan-2032</rc_regn_upto>\n<rc_purchase_dt>24-Jan-2017</rc_purchase_dt>\n<rc_owner_sr>1</rc_owner_sr>\n<rc_owner_name>R***L K***R</rc_owner_name>\n<state_cd>UP</state_cd>\n<rto_cd>91</rto_cd>\n<rc_present_address>, 999999</rc_present_address>\n<rc_permanent_address>, 999999</rc_permanent_address>\n<rc_vch_catg>2WN</rc_vch_catg>\n<rc_vh_class_desc>M-Cycle/Scooter(2WN)</rc_vh_class_desc>\n<rc_vhclass_desc>M-Cycle/Scooter</rc_vhclass_desc>\n<rc_chasi_no>ME4JF509AH70*****</rc_chasi_no>\n<rc_eng_no>JF50E760*****</rc_eng_no>\n<rc_maker_desc>HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD</rc_maker_desc>\n<rc_maker_model>HONDA ACTIVA</rc_maker_model>\n<rc_body_type_desc>SOLO</rc_body_type_desc>\n<rc_fuel_desc>PETROL</rc_fuel_desc>\n<rc_color>P A WHITE</rc_color>\n<rc_norms_desc>BHARAT STAGE II</rc_norms_desc>\n<rc_fit_upto>25-Jan-2032</rc_fit_upto>\n<rc_tax_upto>25-01-2032</rc_tax_upto>\n<rc_financer></rc_financer>\n<rc_insurance_comp>HDFC ERGO General Insurance Company Ltd</rc_insurance_comp>\n<rc_insurance_policy_no>2320100501934300000</rc_insurance_policy_no>\n<rc_insurance_upto>15-Sep-2020</rc_insurance_upto>\n<rc_manu_month_yr>1/2017</rc_manu_month_yr>\n<rc_unld_wt>108</rc_unld_wt>\n<rc_gvw>269</rc_gvw>\n<rc_no_cyl>1</rc_no_cyl>\n<rc_cubic_cap>109.00</rc_cubic_cap>\n<rc_seat_cap>2</rc_seat_cap>\n<rc_sleeper_cap></rc_sleeper_cap>\n<rc_stand_cap>0</rc_stand_cap>\n<rc_wheelbase>1230</rc_wheelbase>\n<rc_registered_at>HAMIRPUR(UP), Uttar Pradesh</rc_registered_at>\n<rc_status_as_on>03-Feb-2026</rc_status_as_on>\n<rc_status>ACTIVE</rc_status>\n<rc_blacklist_status></rc_blacklist_status>\n<rc_noc_details></rc_noc_details>\n<rc_vh_type>N</rc_vh_type>\n<rc_vh_class>1</rc_vh_class>\n<rc_noc_dt></rc_noc_dt>\n<rc_fuel_cd>1</rc_fuel_cd>\n<rc_maker_cd>36</rc_maker_cd>\n<rc_model_cd>HONDA ACTIVA</rc_model_cd>\n<rc_norms_cd>0</rc_norms_cd>\n<rc_sale_amt>51129.0</rc_sale_amt>\n<rc_own_catg_desc>OTHERS</rc_own_catg_desc>\n<rc_vch_catg_desc>TWO WHEELER(NT)</rc_vch_catg_desc>\n<rc_owner_cd_desc>INDIVIDUAL</rc_owner_cd_desc>\n<rc_vehicle_surrendered_to_dealer>0</rc_vehicle_surrendered_to_dealer>\n<rc_currentadd_districtcode>0</rc_currentadd_districtcode>\n<rc_non_use>false</rc_non_use>\n<rc_passenger_tax></rc_passenger_tax>\n<rc_goods_tax></rc_goods_tax>\n<rc_tax_mode>L</rc_tax_mode>\n</VehicleDetails>\n",

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
     "response": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n <stautsMessage>Vehicle Data Not Found</stautsMessage>\n</VehicleDetails>\n",

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
     "message": "Data format failed OR wrong value entered at: chasisnumber. Format should follow ^[a-zA-Z0-9]{1,17}$"
}
```
**Response field meanings:** Same XML tags as VAHAN/01 (see VAHAN/01 for the full list). No description is given for any of them. The top-level keys are `response`, `responseStatus`, `message`, `error`, `code`. No description is given for these either, except that `response` is the XML string (per section 1.5.1). Masked fields are the same as in VAHAN/01.

HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The opening sentence of section 1.5 says "This API will take vehicle number". The field is `chasisnumber`, and section 1.5.1 says chassis number.
- The field table regex `^[a-zA-Z0-9]{1,20}$` (Max 20) does not match the invalid-format error message `^[a-zA-Z0-9]{1,17}$`.
- The production example chassis value has a leading space.

---

## VAHAN/03 — Vehicle registration (RC) record by engine number, XML in a string
**Purpose:** This API will take engine number and connect with VAHAN API to get data. The VAHAN record comes back as an XML document converted to a string under the `response` key.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| enginenumber | Required | ^[a-zA-Z0-9]{1,20}$ | Min 1, Max 20 | Engine Number as available in VAHAN system |

**Example request body:** (production example, section 1.6)
```json
{
  "enginenumber": "JF50E76069768"

}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n<stautsMessage>OK</stautsMessage>\n<rc_regn_no>UP91L0001</rc_regn_no>\n<rc_regn_dt>26-Jan-2017</rc_regn_dt>\n<rc_regn_upto>25-Jan-2032</rc_regn_upto>\n<rc_purchase_dt>24-Jan-2017</rc_purchase_dt>\n<rc_owner_sr>1</rc_owner_sr>\n<rc_owner_name>R***L K***R</rc_owner_name>\n<state_cd>UP</state_cd>\n<rto_cd>91</rto_cd>\n<rc_present_address>, 999999</rc_present_address>\n<rc_permanent_address>, 999999</rc_permanent_address>\n<rc_vch_catg>2WN</rc_vch_catg>\n<rc_vh_class_desc>M-Cycle/Scooter(2WN)</rc_vh_class_desc>\n<rc_vhclass_desc>M-Cycle/Scooter</rc_vhclass_desc>\n<rc_chasi_no>ME4JF509AH70*****</rc_chasi_no>\n<rc_eng_no>JF50E760*****</rc_eng_no>\n<rc_maker_desc>HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD</rc_maker_desc>\n<rc_maker_model>HONDA ACTIVA</rc_maker_model>\n<rc_body_type_desc>SOLO</rc_body_type_desc>\n<rc_fuel_desc>PETROL</rc_fuel_desc>\n<rc_color>P A WHITE</rc_color>\n<rc_norms_desc>BHARAT STAGE II</rc_norms_desc>\n<rc_fit_upto>25-Jan-2032</rc_fit_upto>\n<rc_tax_upto>25-01-2032</rc_tax_upto>\n<rc_financer></rc_financer>\n<rc_insurance_comp>HDFC ERGO General Insurance Company Ltd</rc_insurance_comp>\n<rc_insurance_policy_no>2320100501934300000</rc_insurance_policy_no>\n<rc_insurance_upto>15-Sep-2020</rc_insurance_upto>\n<rc_manu_month_yr>1/2017</rc_manu_month_yr>\n<rc_unld_wt>108</rc_unld_wt>\n<rc_gvw>269</rc_gvw>\n<rc_no_cyl>1</rc_no_cyl>\n<rc_cubic_cap>109.00</rc_cubic_cap>\n<rc_seat_cap>2</rc_seat_cap>\n<rc_sleeper_cap></rc_sleeper_cap>\n<rc_stand_cap>0</rc_stand_cap>\n<rc_wheelbase>1230</rc_wheelbase>\n<rc_registered_at>HAMIRPUR(UP), Uttar Pradesh</rc_registered_at>\n<rc_status_as_on>03-Feb-2026</rc_status_as_on>\n<rc_status>ACTIVE</rc_status>\n<rc_blacklist_status></rc_blacklist_status>\n<rc_noc_details></rc_noc_details>\n<rc_vh_type>N</rc_vh_type>\n<rc_vh_class>1</rc_vh_class>\n<rc_noc_dt></rc_noc_dt>\n<rc_fuel_cd>1</rc_fuel_cd>\n<rc_maker_cd>36</rc_maker_cd>\n<rc_model_cd>HONDA ACTIVA</rc_model_cd>\n<rc_norms_cd>0</rc_norms_cd>\n<rc_sale_amt>51129.0</rc_sale_amt>\n<rc_own_catg_desc>OTHERS</rc_own_catg_desc>\n<rc_vch_catg_desc>TWO WHEELER(NT)</rc_vch_catg_desc>\n<rc_owner_cd_desc>INDIVIDUAL</rc_owner_cd_desc>\n<rc_vehicle_surrendered_to_dealer>0</rc_vehicle_surrendered_to_dealer>\n<rc_currentadd_districtcode>0</rc_currentadd_districtcode>\n<rc_non_use>false</rc_non_use>\n<rc_passenger_tax></rc_passenger_tax>\n<rc_goods_tax></rc_goods_tax>\n<rc_tax_mode>L</rc_tax_mode>\n</VehicleDetails>\n",

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
     "response": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<VehicleDetails>\n <stautsMessage>Vehicle Data Not Found</stautsMessage>\n</VehicleDetails>\n",

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
     "message": "Data format failed OR wrong value entered at: enginenumber. Format should follow ^[a-zA-Z0-9]{1,12}$"
}
```
**Response field meanings:** Same XML tags as VAHAN/01 (see VAHAN/01 for the full list). No description is given for any of them. Top-level keys (`response`, `responseStatus`, `message`, `error`, `code`): no description given, except that `response` is the XML string (per section 1.6.1). Masked fields are the same as in VAHAN/01.

HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The field table regex `^[a-zA-Z0-9]{1,20}$` (Max 20) does not match the invalid-format error message `^[a-zA-Z0-9]{1,12}$`.
- Section 1.6 says "where vehicle number is passed within the URL body", but this API takes an engine number. Copy-paste error.
- Section 1.6 found sample: `rc_eng_no` is `JF50E760*****` (masked), while the request example uses `JF50E76069768`. This is expected masking, not an error.

---

## VAHAN/04 — Vehicle registration (RC) record by vehicle number, JSON
**Purpose:** This API will take vehicle number and connect with VAHAN API to get data. Unlike VAHAN/01, the record is returned as a JSON object under the `response` key (not as an XML string).
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vehiclenumber | Required | ^[a-zA-Z0-9]{5,11}$ | Min 5, Max 11 | Vehicle Number as available in VAHAN system |

**Example request body:** (production example, section 1.7)
```json
{
  "vehiclenumber": "UP91L0001"

}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "stautsMessage": "OK",
             "stateCd": "UP",
             "rtoCd": "91",
             "rcRegnNo": "UP91L0001",
             "rcRegnDt": "26-Jan-2017",
             "rcPurchaseDt": "24-Jan-2017",
             "rcChasiNo": "ME4JF509AH70*****",
             "rcEngNo": "JF50E760*****",
             "rcVhClassDesc": "M-Cycle/Scooter",
             "rcMakerDesc": "HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD",
             "rcMakerModel": "HONDA ACTIVA",
             "rcBodyTypeDesc": "SOLO",
             "rcFuelDesc": "PETROL",
             "rcColor": "P A WHITE",
             "rcOwnerName": "R***L K***R",
             "rcPermanentAddress": ", 999999",
             "rcPresentAddress": ", 999999",
             "rcFitUpto": "25-Jan-2032",
             "rcNormsDesc": "BHARAT STAGE II",
             "rcFinancer": "",
             "rcRegisteredAt": "HAMIRPUR(UP), Uttar Pradesh",
             "rcStatusAsOn": "03-Feb-2026 05:02:62604",
             "rcManuMonthYr": "1/2017",
             "rcUnldWt": "108",
             "rcVchCatg": "2WN",
             "rcGvw": "269",
             "rcNoCyl": "1",
             "rcCubicCap": "109.00",
             "rcSeatCap": "2",
             "rcWheelbase": "1230",
             "rcStandCap": "0",
             "rcSleeperCap": "",
             "rcOwnerSr": "1",
             "rcPuccUpto": "",
             "rcPuccNo": "",
             "rcBlacklistStatus": "",
             "rcNocDetails": "",
             "rcNocDt": "",
             "rcVhClass": 1,
             "rcVhType": "N",
             "rcFuelCd": "1",
             "rcMakerCd": "36",
             "rcModelCd": "HONDA ACTIVA",
             "rcSaleAmt": "51129",
             "rcRegnUpto": "25-Jan-2032",
             "rcOwnCatgDesc": "OTHERS",
             "rcVchCatgDesc": "TWO WHEELER(NT)",
             "rcOwnerCdDesc": "INDIVIDUAL",
             "rcPassengerTax": "",
             "rcGoodsTax": "",
             "rcOwnerHistory": [
                {
                    "stateCd": "",
                    "offName": "",
                    "ownerSr": 0,
                    "ownerName": ""
                }
             ],
             "rcTaxUpto": "25-Jan-2032",
             "rcTaxMode": "L",
             "rcInsuranceComp": "HDFC ERGO General Insurance Company Ltd",
             "rcInsurancePolicyNo": "2320100501934300000",
             "rcInsuranceUpto": "15-Sep-2020",
             "rcStatus": "ACTIVE"
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
          "response": null,
          "responseStatus": "ERROR",
          "message": {
             "id": null,
             "code": "231",
             "params": null,
             "text": "Vehicle Details not Found"
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
   "code": "400 BAD_REQUEST",
   "message": "Data format failed OR wrong value entered at: vehiclenumber. Format should follow ^[A-Z0-9]{5,11}$"
}
```
**Response field meanings:**
- `response`: the VAHAN record as a JSON object (found), a list with an ERROR entry (not found), or null (invalid input)
- `responseStatus`: no description given ("SUCCESS" or "ERROR")
- `message` (inside `response` list element): no description given. On found it is null. On not found it is an object with `id`, `code`, `params`, `text`.
- `id`, `code` (231 = "Vehicle Details not Found"), `params`, `text`: no description given. `text` is "Vehicle Details not Found" in the sample.
- `error`, `code`, `message` (top level): no description given. `code` is the string "400 BAD_REQUEST" for invalid input.
- Fields inside the found record (no description is given for any of them):
  - `stautsMessage`, `stateCd`, `rtoCd`, `rcRegnNo`, `rcRegnDt`, `rcPurchaseDt`, `rcChasiNo`, `rcEngNo`, `rcVhClassDesc`, `rcMakerDesc`, `rcMakerModel`, `rcBodyTypeDesc`, `rcFuelDesc`, `rcColor`, `rcFitUpto`, `rcNormsDesc`, `rcFinancer`, `rcRegisteredAt`, `rcStatusAsOn`, `rcManuMonthYr`, `rcUnldWt`, `rcVchCatg`, `rcGvw`, `rcNoCyl`, `rcCubicCap`, `rcSeatCap`, `rcWheelbase`, `rcStandCap`, `rcSleeperCap`, `rcOwnerSr`, `rcPuccUpto`, `rcPuccNo`, `rcBlacklistStatus`, `rcNocDetails`, `rcNocDt`, `rcVhClass`, `rcVhType`, `rcFuelCd`, `rcMakerCd`, `rcModelCd`, `rcSaleAmt`, `rcRegnUpto`, `rcOwnCatgDesc`, `rcVchCatgDesc`, `rcOwnerCdDesc`, `rcPassengerTax`, `rcGoodsTax`, `rcTaxUpto`, `rcTaxMode`, `rcInsuranceComp`, `rcInsurancePolicyNo`, `rcInsuranceUpto`, `rcStatus`: no description given.
  - `rcOwnerName`, `rcPermanentAddress`, `rcPresentAddress`: masked by default for all users (section 1.3).
  - `rcOwnerHistory` (list of objects with `stateCd`, `offName`, `ownerSr`, `ownerName`): no description given.
- HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The invalid-format case is labelled "b)" and the not-found case "c)". There is no "a)" block.
- The found sample has `rcStatusAsOn` = "03-Feb-2026 05:02:62604". The time part is not a valid time (62604 seconds). It is copied as shown.
- Section 1.7.1 says VAHAN "will share details of chassis number details based on vehiclenumber". The wording is confused, but the request and response are the vehicle-number lookup.
- The field table regex is `^[a-zA-Z0-9]{5,11}$` (mixed case), but the invalid-format error message says `^[A-Z0-9]{5,11}$` (upper case only).
- The invalid-format code is the string "400 BAD_REQUEST", not "400" as in VAHAN/01 to 03.
- The found record's `rcInsuranceComp` value is split across pages in the PDF ("HDFC ERGO General Insurance Company" / "Ltd"). It is rejoined as "HDFC ERGO General Insurance Company Ltd".

---

## VAHAN/05 — Vehicle registration (RC) record by chassis number, JSON
**Purpose:** This API will take chassis number (field `chasisnumber`) and connect with VAHAN API to get data. The record is returned as a JSON object under the `response` key. The section's own opening sentence says "vehicle number", which is incorrect (see Document problems).
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| chasisnumber | Required | ^[^\s]{5,24}$ | Min 5, Max 24 | Chassis Number as available in VAHAN system |

**Example request body:** (production example, section 1.8)
```json
{"chasisnumber": " ME4JF509AH7069705"}
```
Note: the production example value has a leading space, as printed in the document.

**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "stautsMessage": "OK",
             "stateCd": "UP",
             "rtoCd": "91",
             "rcRegnNo": "UP91L0001",
             "rcRegnDt": "26-Jan-2017",
             "rcPurchaseDt": "24-Jan-2017",
             "rcChasiNo": "ME4JF509AH70*****",
             "rcEngNo": "JF50E760*****",
             "rcVhClassDesc": "M-Cycle/Scooter",
             "rcMakerDesc": "HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD",
             "rcMakerModel": "HONDA ACTIVA",
             "rcBodyTypeDesc": "SOLO",
             "rcFuelDesc": "PETROL",
             "rcColor": "P A WHITE",
             "rcOwnerName": "R***L K***R",
             "rcPermanentAddress": ", 999999",
             "rcPresentAddress": ", 999999",
             "rcFitUpto": "25-Jan-2032",
             "rcNormsDesc": "BHARAT STAGE II",
             "rcFinancer": "",
             "rcRegisteredAt": "HAMIRPUR(UP), Uttar Pradesh",
             "rcStatusAsOn": "03-Feb-2026 12:02:45044",
             "rcManuMonthYr": "1/2017",
             "rcUnldWt": "108",
             "rcVchCatg": "2WN",
             "rcGvw": "269",
             "rcNoCyl": "1",
             "rcCubicCap": "109.00",
             "rcSeatCap": "2",
             "rcWheelbase": "1230",
             "rcStandCap": "0",
             "rcSleeperCap": "",
             "rcOwnerSr": "1",
             "rcPuccUpto": "",
             "rcPuccNo": "",
             "rcBlacklistStatus": "",
             "rcNocDetails": "",
             "rcNocDt": "",
             "rcVhClass": 1,
             "rcVhType": "N",
             "rcFuelCd": "1",
             "rcMakerCd": "36",
             "rcModelCd": "HONDA ACTIVA",
             "rcSaleAmt": "51129",
             "rcRegnUpto": "25-Jan-2032",
             "rcOwnCatgDesc": "OTHERS",
             "rcVchCatgDesc": "TWO WHEELER(NT)",
             "rcOwnerCdDesc": "INDIVIDUAL",
             "rcPassengerTax": "",
             "rcGoodsTax": "",
             "rcOwnerHistory": [
                {
                    "stateCd": "",
                    "offName": "",
                    "ownerSr": 0,
                    "ownerName": ""
                }
             ],
             "rcTaxUpto": "25-Jan-2032",
             "rcTaxMode": "L",
             "rcInsuranceComp": "HDFC ERGO General Insurance Company Ltd",
             "rcInsurancePolicyNo": "2320100501934300000",
             "rcInsuranceUpto": "15-Sep-2020",
             "rcStatus": "ACTIVE"
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
          "response": null,
          "responseStatus": "ERROR",
          "message": {
             "id": null,
             "code": "231",
             "params": null,
             "text": "Vehicle Details not Found"
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
   "code": "400 BAD_REQUEST",
   "message": "Data format failed OR wrong value entered at: chasisnumber. Format should follow ^[^\\s]{5,24}$"
}
```
The regex is shown with a doubled backslash, as printed in the document's JSON string.

**Response field meanings:** Same as VAHAN/04 (same top-level keys, same `message` object on not-found, same record fields including `rcOwnerHistory`). No description is given for any of them. Masked fields are the same as in VAHAN/04.

HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The opening sentence of section 1.8 says "This API will take vehicle number". The field is `chasisnumber`, and section 1.8.1 says chassis number.
- The invalid-format case is labelled "d)" and not-found "e)". The found case is "f)". There are no "a)" to "c)" labels for this API.
- The regex `^[^\s]{5,24}$` in the table is not the same as the printed error text `^[^\\s]{5,24}$`. The second one is the same pattern with a doubled backslash, as the JSON string shows it.
- The found sample has `rcStatusAsOn` = "03-Feb-2026 12:02:45044". The time part is not a valid time. It is copied as shown.

---

## VAHAN/06 — Vehicle registration (RC) record by engine number, JSON
**Purpose:** This API will take engine number and connect with VAHAN API to get data. The record is returned as a JSON object under the `response` key.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| enginenumber | Required | ^[^\s]{1,20}$ | Min 1, Max 20 | Engine Number as available in VAHAN system |

**Example request body:** (production example, section 1.9)
```json
{"enginenumber": "JF50E76069768"}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "stautsMessage": "OK",
             "stateCd": "UP",
             "rtoCd": "91",
             "rcRegnNo": "UP91L0001",
             "rcRegnDt": "26-Jan-2017",
             "rcPurchaseDt": "24-Jan-2017",
             "rcChasiNo": "ME4JF509AH70*****",
             "rcEngNo": "JF50E760*****",
             "rcVhClassDesc": "M-Cycle/Scooter",
             "rcMakerDesc": "HONDA MOTORCYCLE AND SCOOTER INDIA (P) LTD",
             "rcMakerModel": "HONDA ACTIVA",
             "rcBodyTypeDesc": "SOLO",
             "rcFuelDesc": "PETROL",
             "rcColor": "P A WHITE",
             "rcOwnerName": "R***L K***R",
             "rcPermanentAddress": ", 999999",
             "rcPresentAddress": ", 999999",
             "rcFitUpto": "25-Jan-2032",
             "rcNormsDesc": "BHARAT STAGE II",
             "rcFinancer": "",
             "rcRegisteredAt": "HAMIRPUR(UP), Uttar Pradesh",
             "rcStatusAsOn": "03-Feb-2026 12:02:44194",
             "rcManuMonthYr": "1/2017",
             "rcUnldWt": "108",
             "rcVchCatg": "2WN",
             "rcGvw": "269",
             "rcNoCyl": "1",
             "rcCubicCap": "109.00",
             "rcSeatCap": "2",
             "rcWheelbase": "1230",
             "rcStandCap": "0",
             "rcSleeperCap": "",
             "rcOwnerSr": "1",
             "rcPuccUpto": "",
             "rcPuccNo": "",
             "rcBlacklistStatus": "",
             "rcNocDetails": "",
             "rcNocDt": "",
             "rcVhClass": 1,
             "rcVhType": "N",
             "rcFuelCd": "1",
             "rcMakerCd": "36",
             "rcModelCd": "HONDA ACTIVA",
             "rcSaleAmt": "51129",
             "rcRegnUpto": "25-Jan-2032",
             "rcOwnCatgDesc": "OTHERS",
             "rcVchCatgDesc": "TWO WHEELER(NT)",
             "rcOwnerCdDesc": "INDIVIDUAL",
             "rcPassengerTax": "",
             "rcGoodsTax": "",
             "rcOwnerHistory": [
                {
                    "stateCd": "",
                    "offName": "",
                    "ownerSr": 0,
                    "ownerName": ""
                }
             ],
             "rcTaxUpto": "25-Jan-2032",
             "rcTaxMode": "L",
             "rcInsuranceComp": "HDFC ERGO General Insurance Company Ltd",
             "rcInsurancePolicyNo": "2320100501934300000",
             "rcInsuranceUpto": "15-Sep-2020",
             "rcStatus": "ACTIVE"
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
          "response": null,
          "responseStatus": "ERROR",
          "message": {
             "id": null,
             "code": "231",
             "params": null,
             "text": "Vehicle Details not Found"
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
   "code": "400 BAD_REQUEST",
   "message": "Data format failed OR wrong value entered at: enginenumber. Format should follow ^[^\\s]{1,20}$"
}
```
The regex is shown with a doubled backslash, as printed in the document's JSON string.

**Response field meanings:** Same as VAHAN/04 and VAHAN/05 (same top-level keys, same not-found `message` object, same record fields). No description is given for any of them. Masked fields are the same as in VAHAN/04.

HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- Section 1.9 says "where vehicle number is passed within the URL body", but this API takes an engine number. Copy-paste error.
- The invalid-format case is labelled "d)" and not-found "e)". The found case is "f)".
- The found sample has `rcStatusAsOn` = "03-Feb-2026 12:02:44194". The time part is not a valid time. It is copied as shown.
- The table regex `^[^\s]{1,20}$` is shown in the error message as `^[^\\s]{1,20}$` (doubled backslash in the JSON string).

---

## SARATHI/01 — Driving licence details by DL number and date of birth
**Purpose:** This API will take driving license number and connect with SARATHI API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| dlnumber | Required | (([A-Z]{2}(-)[0-9]{2})\|([A-Z]{2}[0-9]{2} ))((19\|20)[0-9][0-9])[0-9]{7}$ | 16 | Driving license Number as available in SARATHI system. |
| dob | Required | yyyy-mm-dd (no regex given in table) | 10 | Date of birth as available in SARATHI system. |

Note: the regex in the table is written here as in the PDF. It contains a literal space in its second alternative, `[A-Z]{2}[0-9]{2} `. The document's example `GJ04 20120005008` has that space.

**Example request body:** (production example, section 1.3.1)
```json
{
      "dlnumber": "GJ04 20120005008",
      "dob": "1987-05-26"

}
```
**Response — found:** Not given in document. Section 1.3 (c) says "For response format, please check the attached word file. SARATHI - Response.docx". That file is not in the document folder provided, so the response format could not be read.

**Response — not found:**
```json
{
   "response": [
      {
          "response": {
             "dldetobj": [
                {
                    "transReqObj": null,
                    "dlTest": null,
                    "dlEndorsementObj": null,
                    "objections": null,
                    "psvBadgeissued": null,
                    "dbLoc": "National Register",
                    "dlHzHillObj": null,
                    "errorcd": -1,
                    "dlCovHistObj": null,
                    "dlcovs": null,
                    "bioObj": null,
                    "idIdpIssuedpPojo": null,
                    "dlobj": null,
                    "erormsg": "No Details are available.",
                    "bioImgObj": null,
                    "dlHistObj": null
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
**Response — invalid input:**

1. Invalid dl number:
```json
{
      "response": null,
      "error": "true",
      "code": "400",
      "message": "Data format failed OR wrong value entered at: dlnumber. Format should follow (([A-Z]{2}(-)[0-9]{2})|([A-Z]{2}[0-9]{2} ))((19|20)[0-9][0-9])[0-9]{7}$"
}
```
2. Invalid dob:
```json
{
      "response": null,
      "error": "true",
      "code": "400",
      "message": "Data format failed OR wrong value entered at: dob. Format should follow ^\\d{4}\\-(0[1-9]|1[012])\\-(0[1-9]|[12][0-9]|3[01])$"
}
```
**Response field meanings:**
- `response` (top level in invalid case): null
- `dldetobj`: no description given
- `transReqObj`, `dlTest`, `dlEndorsementObj`, `objections`, `psvBadgeissued`, `dlHzHillObj`, `dlCovHistObj`, `dlcovs`, `bioObj`, `idIdpIssuedpPojo`, `dlobj`, `bioImgObj`, `dlHistObj`: no description given (all null in the not-found sample)
- `dbLoc`: no description given ("National Register" in sample)
- `errorcd`: no description given (-1 in sample)
- `erormsg`: no description given. The spelling "erormsg" is as printed in the document. Text in sample: "No Details are available."
- `responseStatus`, `error`, `code`, `message`: no description given
- HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The found response (section 1.3 (c)) is not in the PDF. It refers to "SARATHI - Response.docx", which is not in the folder provided.
- The dob row in the field table gives only the format `yyyy-mm-dd`. The regex appears only in the invalid-dob error message.
- The dlnumber table regex and the error-message regex are the same, but the PDF text is wrapped across two lines in both places. It has been rejoined as shown.
- The not-found sample uses the key "erormsg" (typo as printed in the document).

---

## SARATHI/02 — Driving licence details by DL number only
**Purpose:** This API will take driving license number and connect with SARATHI API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| dlnumber | Required | (([A-Z]{2}(-)[0-9]{2})\|([A-Z]{2}[0-9]{2} ))((19\|20)[0-9][0-9])[0-9]{7}$ | 16 | Driving license Number as available in SARATHI system. |

Note: the regex is written here as in the PDF. The second alternative includes a literal space, as in SARATHI/01.

**Example request body:** (production example, section 1.4)
```json
{
      "dlnumber": "UP9620110001440"

}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "DLinformation": {
                "Classofcovs": [
                    {
                       "CovDiscription": "Motor Cycle with Gear(Non Transport)",
                       "CovCode": 3
                    },
                    {
                       "CovDiscription": "LIGHT MOTOR VEHICLE",
                       "CovCode": 4
                    },
                    {
                       "CovDiscription": "Transport Vehicle-M/HMV (Goods and Passenger)",
                       "CovCode": 10
                    }
                ],
                "NonTransportValidityTodate": "27-04-2031",
                "TransportValidityTodate": "16-02-2028",
                "DL_Holder_FullName": "RAMSANEHI",
                "DL_status": "Active."
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
             "errormessage": "Details not Found For Given DLNumber",
             "errorcode": -1
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
**Response — invalid input:**

1. Invalid dl number:
```json
{
      "response": null,
      "error": "true",
      "code": "400 BAD_REQUEST",
      "message": "Data format failed OR wrong value entered at: dlnumber. Format should follow ^.{1,25}$"
}
```
**Response field meanings:**
- `response`: the result object (found, not found) or null (invalid input)
- `DLinformation`: no description given
- `Classofcovs`: no description given (list of class-of-vehicle entries)
- `CovDiscription`: no description given. The spelling is as printed in the document.
- `CovCode`: no description given
- `NonTransportValidityTodate`: no description given (date format dd-mm-yyyy in sample)
- `TransportValidityTodate`: no description given (date format dd-mm-yyyy in sample)
- `DL_Holder_FullName`: no description given
- `DL_status`: no description given ("Active." in sample)
- `errormessage`, `errorcode`: no description given (not-found case)
- `responseStatus`, `message`, `error`, `code`: no description given
- HTTP status codes (listed after the samples): 200 vehicle data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The invalid-dl-number error message gives the format `^.{1,25}$`, but the table gives the 16-character regex above. The two disagree.
- The layout of the invalid-dl-number text in the PDF is split across lines, and the word "dlnumber." is printed to the right of the "at:" text. It has been reassembled as "at: dlnumber. Format should follow ^.{1,25}$".
- The technical approach numbering restarts at 5 (continues from SARATHI/01). Cosmetic only.

---

## ECHALLAN/01 — E-challan records by vehicle number
**Purpose:** This API will take vehicle number and connect with E-Challan API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| vehicleNumber | Required | ^[a-zA-Z0-9]{5,11}$ | Min 5, Max 11 | Enter the vehicleNumber as available in E-Challan system. |

The field name is split across two lines in the PDF ("vehicleNumb" / "er") and is rejoined here as `vehicleNumber`, which matches the request examples.

**Example request body:** (production example, section 1.3)
```json
{
       "vehicleNumber": "UP15AU1291"

}
```
**Response — found:**
```json
{
       "response": [
              {
                     "response": {
                             "data": {
                                    "Disposed_data": [
                                           {
                                                  "challan_place": "",
                                                  "sent_to_reg_court": "No",
                                                  "owner_name": "T**T P*T L*D",
                                                  "receipt_no": null,
                                                  "challan_date_time": "11-03-2022 11:38:21",
                                                  "document_impounded": "",
                                                  "received_amount": 1,
                                                  "sent_to_court_on": null,
                                                  "remark": "NA",
                                                  "fine_imposed": "1",
                                                  "amount_of_fine_imposed": null,
                                                  "challan_no": "KL48648220311113821",
                                                  "dl_no": null,
                                                  "name_of_violator": "T**T P*T L*D",
                                                  "sent_to_virtual_court": "No",
                                                  "date_of_proceeding": null,
                                                  "driver_name": "T**T P*T L*D",
                                                  "court_address": null,
                                                  "challan_status": "Disposed",
                                                  "department": "Traffic",
                                                  "state_code": "KL",
                                                  "court_name": null,
                                                  "offence_details": [
                                                         {
                                                                "act": "",
                                                                "name": "test offence 1 rupee"
                                                         }
                                                  ]
                                           },
                                           {
                                                  "challan_place": "",
                                                  "sent_to_reg_court": "No",
                                                  "owner_name": "T**T P*T L*D",
                                                  "receipt_no": null,
                                                  "challan_date_time": "25-02-2022 11:20:01",
                                                  "document_impounded": "",
                                                  "received_amount": 1,
                                                  "sent_to_court_on": null,
                                                  "remark": "NA",
                                                  "fine_imposed": "1",
                                                  "amount_of_fine_imposed": null,
                                                  "challan_no": "KL48648220225112001",
                                                  "dl_no": null,
                                                  "name_of_violator": "T**T P*T L*D",
                                                  "sent_to_virtual_court": "No",
                                                  "date_of_proceeding": null,
                                                  "driver_name": "T**T P*T L*D",
                                                  "court_address": null,
                                                  "challan_status": "Disposed",
                                                  "department": "Traffic",
                                                  "state_code": "KL",
                                                  "court_name": null,
                                                  "offence_details": [
                                                         {
                                                                "act": "",
                                                                "name": "test offence 1 rupee"
                                                         }
                                                  ]
                                           }
                                    ],
                                    "Pending_data": [
                                           {
                                                  "challan_place": "test",
                                                  "sent_to_reg_court": "No",
                                                  "owner_name": "T**T P*T L*D",
                                                  "challan_date_time": "01-09-2023 17:36:00",
                                                  "document_impounded": "",
                                                  "sent_to_court_on": null,
                                                  "remark": "gdgg",
                                                  "fine_imposed": "7750",
                                                  "amount_of_fine_imposed": null,
                                                  "challan_no": "KL548476230713105383",
                                                  "dl_no": null,
                                                  "name_of_violator": "T**T P*T L*D",
                                                  "sent_to_virtual_court": "No",
                                                  "date_of_proceeding": null,
                                                  "driver_name": null,
                                                  "court_address": null,
                                                  "rto_distric_name": "Thiruvananthapuram",
                                                  "challan_status": "Pending",
                                                  "department": "Traffic",
                                                  "state_code": "KL",
                                                  "court_name": null,
                                                  "offence_details": [
                                                         {
                                                                "act": "S130(4)",
                                                                "name": "Fitness certificate (CF) of a transport vehicle not produced on demand for examination by the officer authorised."
                                                         },
                                                         {
                                                                "act": "S66(1),S84(a) RW S192A(1)",
                                                                "name": "Driving or causing or allowing to be driven a vehicle as contract carriage without valid permit.(MMV and HMV)"
                                                         }
                                                  ]
                                           },
                                           {
                                                  "challan_place": "",
                                                  "sent_to_reg_court": "No",
                                                  "owner_name": "T**T P*T L*D",
                                                  "challan_date_time": "11-03-2022 11:49:37",
                                                  "document_impounded": "",
                                                  "sent_to_court_on": null,
                                                  "remark": "NA",
                                                  "fine_imposed": "1",
                                                  "amount_of_fine_imposed": null,
                                                  "challan_no": "KL48648220311114937",
                                                  "dl_no": null,
                                                  "name_of_violator": "T**T P*T L*D",
                                                  "sent_to_virtual_court": "No",
                                                  "date_of_proceeding": null,
                                                  "driver_name": "T**T P*T L*D",
                                                  "court_address": null,
                                                  "rto_distric_name": "Palakkad",
                                                  "challan_status": "Pending",
                                                  "department": "Traffic",
                                                  "state_code": "KL",
                                                  "court_name": null,
                                                  "offence_details": [
                                                         {
                                                                "act": "",
                                                                "name": "test offence 1 rupee"
                                                         }
                                                  ]
                                           }
                                    ]
                             },
                             "message": "Record finds successfully",
                             "status": "200"
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
                             "code": "305",
                             "message": "No Records Found!"
                     },
                     "responseStatus": "SUCCESS"
              }
       ],
       "error": "false",
       "code": "200",
       "message": "Success"

}
```
**Response — invalid input:** The PDF text for this message is damaged (the field name is cut off). The text as extracted is shown below, with the two pieces joined where the layout split them.
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: [field name not legible in PDF] nhno. Format should follow [A-Z]{2}-[A-Z0-9]{1,4}"
}
```
The sample label reads "1. Invalid vehicle number format". The text "nhno. Format should fol" appears on a separate line below the sample, and "low [A-Z]{2}-[A-Z0-9]{1,4}" appears inside it. The text before "nhno" is not visible in the PDF.

**Response field meanings:**
- `response`: the result object (found, not found) or null (invalid input)
- `data`: no description given
- `Disposed_data`: no description given (list of challans with status Disposed)
- `Pending_data`: no description given (list of challans with status Pending)
- `message` (inside `response`): "Record finds successfully" in the found sample; "No Records Found!" in the not-found sample. No further description given.
- `status`: no description given ("200" in the found sample)
- `code`: no description given ("305" in the not-found sample)
- Fields in each challan object (no description given for any of these): `challan_place`, `sent_to_reg_court`, `owner_name`, `receipt_no`, `challan_date_time`, `document_impounded`, `received_amount`, `sent_to_court_on`, `remark`, `fine_imposed`, `amount_of_fine_imposed`, `challan_no`, `dl_no`, `name_of_violator`, `sent_to_virtual_court`, `date_of_proceeding`, `driver_name`, `court_address`, `rto_distric_name` (present in Pending items only, spelling as printed), `challan_status`, `department`, `state_code`, `court_name`, `offence_details`.
- `offence_details` items: `act`, `name` (no description given).
- `owner_name`, `name_of_violator`, `driver_name`: masked in the sample ("T**T P*T L*D").
- HTTP status codes (listed after the samples): 200 ECHALLAN data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The regex in the field table (`^[a-zA-Z0-9]{5,11}$`) does not match the invalid-format error text (`[A-Z]{2}-[A-Z0-9]{1,4}`). The table allows no hyphen and no fixed letter prefix. The error text requires a hyphen after two letters.
- The invalid-format error message is damaged in the PDF (the field name is not legible, and "nhno" appears in place of a field name). Reconstructed as shown above. The exact field name cannot be confirmed from the document.
- The sample label "1. Invalid vehicle number format" and the message disagree on the input format.
- Section 1.4 (authentication) says "request ULIP system for cargo details", which is copy-paste from another API.
- Section 1.3 says "ECHALLA-integration" (typo).
- Section 1.3.1 says staging fetches data directly, production calls an AUTH API first. The AUTH API is not described in this document.
- Section 1.4 staging example body uses `KL150000`, but the curl example in the same section uses `UP93BK9110`. Minor.
- The found sample contains rejoined strings from wrapped lines in the offence `name` values ("transport vehicle", "Driving or causing ... driven"). They are rejoined without changing wording.

---

## EWAYBILL/01 — E-way bill details by EWB number
**Purpose:** This API will take EWB (e-way bill) number and connect with EWAYBILL API to get data.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| ewbNo | Required | [0-9]{12} | 12 | Enter the EWB number as available in EWAYBILL system. |

**Example request body:** (section 1.3.1, staging and production examples are the same)
```json
{
       "ewbNo": "101000609218"

}
```
**Response — found:**
```json
{
   "response": [
      {
          "response": {
             "fromPincode": 301404,
             "hsnCode": "",
             "ewayBillDate": "29/11/2017 04:30:00 PM",
             "validUpto": " 11:59:00 PM",
             "ewbNo": 101000609218,
             "toPincode": 302014,
             "VehiclListDetails": [
                {
                       "vehicleNo": "RJ14CG4508",
                       "enteredDate": "29/11/2017 04:30:00 PM",
                       "transMode": "1"
                }
             ],
             "status": "ACT"
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
                             "errorCodes": "404"
                     },
                     "responseStatus": "ERROR"
              }
       ],
       "error": "false",
       "code": "200",
       "message": "Success"

}
```
**Response — invalid input:** The PDF text for this message is damaged (the field name is split across lines). The text as extracted is shown below, with the two pieces joined.
```json
{
       "response": null,
       "error": "true",
       "code": "400",
       "message": "Data format failed OR wrong value entered at: ewbNo. Format should follow [0-9]{12}"
}
```
The sample label reads "1. Invalid ewbNo number". The fragments "ewbNo. Format should fo" and "llow [0-9]{12}" are printed on separate lines and are joined here.

**Response field meanings:**
- `response`: the result object (found, not found) or null (invalid input)
- `fromPincode`: no description given
- `hsnCode`: no description given
- `ewayBillDate`: no description given
- `validUpto`: no description given. The sample value is " 11:59:00 PM" (time only, no date), as printed.
- `ewbNo`: no description given (number in sample)
- `toPincode`: no description given
- `VehiclListDetails`: no description given (list). The spelling is as printed.
- `vehicleNo`, `enteredDate`, `transMode`: no description given
- `status`: no description given ("ACT" in sample)
- `errorCodes`: no description given ("404" in not-found sample)
- `responseStatus`, `error`, `code`, `message`: no description given
- HTTP status codes (listed after the samples): 200 EWAYBILL data response; 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server error occurred; 502 server is not responding.

**Document problems:**
- The regex in the field table (`[0-9]{12}`) matches the error text, so these two agree.
- The invalid-format message is damaged in the PDF (split across lines). Reconstructed as shown above.
- Production example body in section 1.3.1 is `101000609218`, but the production curl example in the same section sends `871347047092`. Section 1.4 also uses `871347047092` for production. The two values differ.
- The heading for the found sample reads "In case nhno number exist". "nhno" appears where "ewb number" is meant. Copy-paste error.
- Section 1.4 says "request ULIP system for cargo details", which is copy-paste from another API.
- The found sample's `validUpto` value has a time but no date.
- Found sample has `ewbNo` and pincodes as numbers, while the request has `ewbNo` as a string.

---

## TOLL/01 — Toll plaza rate by toll code, toll name or state name
**Purpose:** This API will take tollCode, tollName, stateName and based on the user input data, ULIP System will find the toll rate for the particular toll and send back the response to the user. Only one of the three parameters may be sent per request.
**Request body fields:**
| Field (exact case) | Required | Format/regex (exact) | Length | Description |
|---|---|---|---|---|
| tollCode | Not Required | ^\d{1,7}$ | Max 7 digits | Toll code for the toll |
| tollName | Not Required | ^[A-Za-z0-9@#$%^&*()_+!.,":;?\-\s]{1,200}$ | Up to 200 characters | Toll Name for the toll |
| stateName | Not Required | ^[A-Za-z0-9@#$%^&*()_+!.,":;?\-\s]{1,200}$ | Up to 200 characters | State Name for the toll |

The tollName and stateName regex is broken across two lines in the PDF (`?\` then `-\s]{1,200}$`) and is rejoined here as `?\-\s]`. The document's note says users may send only one of tollCode, tollName or stateName at a time.

**Example request body:** (production example, section 1.3)
```json
{ "tollCode": "180001",
   "tollName":"",
   "stateName": "" }
```
**Response — found:**
```json
{ "response": [
      {"response": [
             {
                "lcvRateMulti": 260,
                "hcmEmeMonthly": 19085,
                "latitude": 27.218247,
                "multiAxlerateMulti": 595,
                "sevenOrMoreExelSingle": 695,
                "fourToSixExelCommReg": 285,
                "sevenOrMoreExelReturn": 1045,
                "dtEffectiveRates": "01-10-2025",
                "fourToSixExelReturn": 860,
                "lcvRateSingle": 175,
                "hcmEmeSingle": 575,
                "stateName": "UTTAR PRADESH",
                "lcvRateMth": 5810,
                "tollName": "Tundla",
                "carRateMth": 3595,
                "piu": "AGRA",
                "longitude": 78.272821,
                "lcvRateCommReg": 85,
                "busRateMth": 12170,
                "fourToSixExelMonthly": 19085,
                "carRateCommReg": 55,
                "fourToSixExelSingle": 575,
                "hcmEmeReturn": 860,
                "carRateMulti": 160,
                "busRateCommReg": 185,
                "busRateSingle": 365,
                "hcmEmeCommReg": 285,
                "multiAxlerateSingle": 400,
                "sevenOrMoreExelMonthly": 23235,
                "dtRateRevision": "31-03-2026",
                "tollCode": 180001,
                "multiAxlerateCommReg": 200,
                "multiAxlerateMth": 13280,
                "sevenOrMoreExelCommReg": 350,
                "busRateMulti": 550,
                "ro": "LUCKNOW (UP WEST)",
                "carRateSingle": 110
             }
          ],
          "responseStatus": "SUCCESS"}

   ],
   "error": "false",
   "code": "200",
   "message": "Success"}
```
**Response — not found:** Not given in document.

**Response — invalid input:**
```json
{ "response": [
      {
          "response": "Input variable cannot be more than one it should be either tollCode or tollName or stateName",
          "responseStatus": "ERROR"

      }
   ],
   "error": "false",
   "code": "200",
   "message": "Success" }
```
**Response field meanings:**
- `response`: list of result objects (found: list of rate objects; invalid input: a string message)
- `responseStatus`: no description given ("SUCCESS" or "ERROR")
- `error`, `code`, `message`: no description given
- `lcvRateMulti`, `lcvRateSingle`, `lcvRateMth`, `lcvRateCommReg`: no description given (LCV rate fields)
- `hcmEmeMonthly`, `hcmEmeSingle`, `hcmEmeReturn`, `hcmEmeCommReg`: no description given (HCM/EME rate fields)
- `fourToSixExelMonthly`, `fourToSixExelSingle`, `fourToSixExelReturn`, `fourToSixExelCommReg`: no description given (4-to-6 axle rate fields; "Exel" as printed)
- `sevenOrMoreExelSingle`, `sevenOrMoreExelReturn`, `sevenOrMoreExelMonthly`, `sevenOrMoreExelCommReg`: no description given (7 or more axle rate fields; "Exel" as printed)
- `multiAxlerateMulti`, `multiAxlerateSingle`, `multiAxlerateMth`, `multiAxlerateCommReg`: no description given (multi-axle rate fields)
- `carRateMulti`, `carRateSingle`, `carRateMth`, `carRateCommReg`: no description given (car rate fields)
- `busRateMulti`, `busRateSingle`, `busRateMth`, `busRateCommReg`: no description given (bus rate fields)
- `dtEffectiveRates`: no description given (date, format dd-mm-yyyy in sample)
- `dtRateRevision`: no description given (date, format dd-mm-yyyy in sample)
- `latitude`, `longitude`: no description given
- `piu`: no description given ("AGRA" in sample)
- `ro`: no description given ("LUCKNOW (UP WEST)" in sample)
- `stateName`: no description given
- `tollName`: no description given
- `tollCode`: no description given (number in sample; string in request)
- HTTP status codes (listed after the samples): 200 corporate data response (wording as printed); 400 bad request (invalid JSON syntax, invalid JSON key); 401 or 403 unauthenticated or unauthorized; 500 some internal server errors occurred; 502 server is not responding.

**Document problems:**
- The sample request sends `tollCode` "180001". The toll reference list in section 1.3 maps 180001 to "Brahmarakotlu Toll Plaza" (KARNATAKA). The found sample response returns `tollCode` 180001 with `tollName` "Tundla" and `stateName` "UTTAR PRADESH". The list shows Tundla as code 356018. The sample response and the reference list disagree.
- The toll reference list in section 1.3 is about 1,180 rows (toll code, toll name, state). It is not copied here. It is in the source PDF, lines 85 to 1418 of the extracted text.
- Section 1.4 says "Request from ULIP's system would be made in IWAI system". The system name does not match this document (copy-paste from another API).
- Section 1.4 says "request ULIP system for CIN details" twice. CIN is not a field in this API (copy-paste).
- The HTTP status list says "Status Code 200: corporate data response". The wording does not match toll data (copy-paste).
- The sample response's `tollCode` is a number, but the request's `tollCode` is a string.
- No not-found sample is given (for a toll code that is not in the list). Not given in document.
- The request table's Required column says "Not Required" for all three fields. The note says one of them must be sent. The table does not say what happens when none is sent.
- The toll list contains some misspelled names as printed (e.g. "Jamli Toll Pllaza (Sendhwa )", "Banglaore-Nelamangala Plaza"). Not corrected here, because the list is not copied.
- Only one API (TOLL/01) is defined in this document.
