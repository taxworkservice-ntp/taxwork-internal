/**
 * RDPrep converter — ported from the offline Python "RDPrep Excel Converter".
 *
 * Reads a `Settings` + `Payees` Excel workbook (or the flat client JSON) and
 * produces the two RDPrep JSON documents (main `M.json` + attach `D.json`),
 * packed into an AES-256 encrypted `.rdx` archive. Everything runs in the
 * browser; nothing is uploaded.
 */

import type { WorkSheet } from "xlsx";

type XlsxModule = typeof import("xlsx");
const loadXlsx = () => import("xlsx");

export const RDX_PASSWORD = "AZ1298xYU1593kDrZjpi0";
export const RDX_FORMS = ["PND3", "PND53"] as const;
export type RdxForm = (typeof RDX_FORMS)[number];

const DETAIL_GROUPS = [1, 2, 3] as const;

const SETTINGS_HEADERS = [
  "form_code", "payer_id", "branch_type", "branch_no", "tax_year", "tax_month",
  "filing_type", "filing_no", "minus_flag", "wht_under_1", "wht_under_2", "wht_under_3",
];

const PAYEE_HEADERS: string[] = [
  "recipient_id", "title_code", "title_name", "first_name", "middle_name", "surname",
  "branch_type", "branch_no",
];
for (const group of DETAIL_GROUPS) {
  PAYEE_HEADERS.push(
    `date${group}`, `income_code${group}`, `income_desc${group}`,
    `tax_rate_id${group}`, `tax_rate${group}`, `income_amt${group}`,
    `tax_amt${group}`, `condition_code${group}`
  );
}

const FORM_TAX_RATE_IDS: Record<string, Record<number, number>> = {
  PND3: { 0.5: 23, 0.75: 9, 1: 3, 2: 4, 3: 5, 5: 6, 10: 7, 15: 8 },
  PND53: { 0.5: 23, 0.75: 9, 1: 3, 2: 4, 3: 14, 5: 6, 10: 7, 15: 8 },
};
const TITLE_CODES: Record<string, string> = { "นาย": "2110", "น.ส.": "2120", "นาง": "2121" };
const INCOME_CODES: Record<string, string> = {
  "ค่าจ้างทำของ": "148",
  "วิชาชีพอิสระ - การบัญชี": "172",
};

type Row = Record<string, unknown>;
type SheetRows = { settings: Row[]; payees: Row[] };

export type ConvertOptions = {
  formCode?: string | null;
  filingYear?: number | null;
  filingMonth?: number | null;
};

export type ConvertResult = {
  formCode: string;
  payerId: string;
  branchType: string;
  base: string;
  totalIncome: number;
  totalTax: number;
  recipients: number;
  summary: string;
  mainJson: string;
  attachJson: string;
};

// --- value coercion (mirrors the Python helpers) ---

function clean(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value;
}

function number(value: unknown, field: string, row: number, required = true): number | null {
  const v = clean(value);
  if (v === null) {
    if (required) throw new Error(`Payees row ${row}: ${field} is required`);
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`Payees row ${row}: ${field} must be numeric`);
  return n;
}

function integer(value: unknown, field: string, required = true): number | null {
  const v = clean(value);
  if (v === null) {
    if (required) throw new Error(`Settings: ${field} is required`);
    return null;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`Settings: ${field} must be an integer`);
  return Math.trunc(n);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function isoDateFromParts(year: number, month: number, day: number, row: number, field: string): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error(`Payees row ${row}: ${field} is not a valid date`);
  }
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function thaiDate(value: unknown, field: string, row: number): string {
  const v = clean(value);
  if (v === null) throw new Error(`Payees row ${row}: ${field} is required`);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) throw new Error(`Payees row ${row}: ${field} is not a valid date`);
    return isoDateFromParts(v.getFullYear(), v.getMonth() + 1, v.getDate(), row, field);
  }
  const text = String(v).trim().replace(/\//g, "-");
  const parts = text.split("-");
  if (parts.length !== 3) {
    throw new Error(`Payees row ${row}: ${field} must be YYYY-MM-DD or DD/MM/YYYY`);
  }
  const [first, second, third] = parts.map((part) => parseInt(part, 10));
  if (![first, second, third].every((n) => Number.isFinite(n))) {
    throw new Error(`Payees row ${row}: ${field} is not a valid date`);
  }
  let year: number, month: number, day: number;
  if (first > 31) {
    year = first; month = second; day = third;
  } else {
    day = first; month = second; year = third;
  }
  if (year >= 2400) year -= 543;
  return isoDateFromParts(year, month, day, row, field);
}

function id13(value: unknown, field: string, rowName: string): string {
  const text = (value === null || value === undefined ? "" : String(value)).trim().replace(/-/g, "");
  if (!/^\d{13}$/.test(text)) {
    throw new Error(`${rowName}: ${field} must contain exactly 13 digits`);
  }
  let checksum = 0;
  for (let i = 0; i < 12; i++) checksum += parseInt(text[i], 10) * (13 - i);
  if ((11 - (checksum % 11)) % 10 !== parseInt(text[12], 10)) {
    throw new Error(`${rowName}: ${field} has an invalid check digit`);
  }
  return text;
}

// --- Python-faithful JSON serialization ---
//
// The RDX contract is defined by the desktop tool's
// `json.dumps(value, ensure_ascii=False, separators=(",", ":"))`. Python always
// renders floats with a decimal point (`450.0`), whereas `JSON.stringify` drops
// the trailing `.0` on integral numbers — and RDPrep is stricter than a generic
// JSON client here. We tag the float-typed fields and reproduce the exact text
// instead of relying on `JSON.stringify`.

/** Marks a number that Python would serialize as a float literal (e.g. `450.0`). */
export class FloatLiteral {
  constructor(readonly value: number) {}
}

function asFloat(value: number): FloatLiteral {
  return new FloatLiteral(value);
}

/** Serialize exactly like `json.dumps(..., ensure_ascii=False, separators=(",", ":"))`. */
export function serializeRdxJson(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof FloatLiteral) {
    return Number.isInteger(value.value) ? `${value.value}.0` : String(value.value);
  }
  switch (typeof value) {
    case "number":
      return String(value);
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map(serializeRdxJson).join(",")}]`;
      }
      const entries = Object.entries(value as Record<string, unknown>);
      return `{${entries
        .map(([key, val]) => `${JSON.stringify(key)}:${serializeRdxJson(val)}`)
        .join(",")}}`;
    }
    default:
      throw new Error(`Cannot serialize a value of type ${typeof value}`);
  }
}

// --- workbook / JSON reading ---

function rowsFromSheet(XLSX: XlsxModule, ws: WorkSheet, title: string): Row[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  if (!matrix.length) return [];
  const headers = (matrix[0] as unknown[]).map((cell) => clean(cell));
  if (headers.some((header) => header === null)) {
    throw new Error(`Sheet ${title}: header cells cannot be blank`);
  }
  const keys = headers as string[];
  const rows: Row[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const values = matrix[i] as unknown[];
    if (!values.some((value) => clean(value) !== null)) continue;
    const row: Row = {};
    keys.forEach((key, c) => {
      row[key] = values[c] ?? null;
    });
    rows.push(row);
  }
  return rows;
}

function sheetRowsFromWorkbook(XLSX: XlsxModule, buffer: ArrayBuffer): SheetRows {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
  if (!workbook.SheetNames.includes("Settings") || !workbook.SheetNames.includes("Payees")) {
    throw new Error("Workbook must contain Settings and Payees sheets");
  }
  return {
    settings: rowsFromSheet(XLSX, workbook.Sheets["Settings"], "Settings"),
    payees: rowsFromSheet(XLSX, workbook.Sheets["Payees"], "Payees"),
  };
}

// --- JSON input (flat client rows) ---

function loadJsonInput(
  records: unknown,
  opts: ConvertOptions
): { settings: Row; payees: Row[] } {
  const formCode = (opts.formCode || "PND3").toUpperCase();
  if (!FORM_TAX_RATE_IDS[formCode]) {
    throw new Error("Settings: form_code must be PND3 or PND53");
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("JSON input must be a non-empty array of payment rows");
  }
  const first = records[0] as Row;
  const payerId = id13(first.withholder_tax_id, "withholder_tax_id", "JSON");
  const groups = new Map<string, Row>();

  records.forEach((rawRecord, idx) => {
    const record = rawRecord as Row;
    const index = idx + 1;
    if (String(clean(record.withholder_tax_id) ?? "") !== payerId) {
      throw new Error(`JSON row ${index}: withholder_tax_id does not match the first row`);
    }
    const recipientId = id13(record.tax, "tax", `JSON row ${index}`);
    let recipient = groups.get(recipientId);
    if (!recipient) {
      recipient = {
        recipient_id: recipientId,
        title_code: TITLE_CODES[clean(record.prefix) as string] ?? "",
        title_name: clean(record.prefix),
        first_name: clean(record.name),
        middle_name: "",
        surname: clean(record.last_name),
        branch_type: "",
        branch_no: "",
      };
      groups.set(recipientId, recipient);
    }
    const slot = Object.keys(recipient).filter((key) => key.startsWith("date")).length + 1;
    if (slot > 3) {
      throw new Error(`JSON recipient ${recipientId}: more than three payments are not supported`);
    }
    const taxpct = Number(record.taxpct);
    recipient[`date${slot}`] = record.invoice_date;
    recipient[`income_code${slot}`] = INCOME_CODES[clean(record.description) as string] ?? "0";
    recipient[`income_desc${slot}`] = clean(record.description);
    recipient[`tax_rate_id${slot}`] = FORM_TAX_RATE_IDS[formCode][taxpct] ?? 99;
    recipient[`tax_rate${slot}`] = record.taxpct;
    recipient[`income_amt${slot}`] = record.amount;
    recipient[`tax_amt${slot}`] = record.wht;
    recipient[`condition_code${slot}`] = "1";
  });

  const firstDate = thaiDate(first.invoice_date, "invoice_date", 1);
  const parsed = new Date(`${firstDate}T00:00:00Z`);
  let filingYear = opts.filingYear ?? null;
  if (filingYear === null) filingYear = parsed.getUTCFullYear() + 543;
  else if (filingYear < 2400) filingYear += 543;
  let filingMonth = opts.filingMonth ?? null;
  if (filingMonth === null) filingMonth = parsed.getUTCMonth() + 1;
  if (filingMonth < 1 || filingMonth > 12) {
    throw new Error("JSON: filing month must be between 1 and 12");
  }
  const settings: Row = {
    form_code: formCode,
    payer_id: payerId,
    branch_type: "V",
    branch_no: 0,
    tax_year: filingYear,
    tax_month: filingMonth,
    filing_type: 0,
    filing_no: 0,
    minus_flag: "N",
    wht_under_1: 1,
    wht_under_2: 0,
    wht_under_3: 0,
  };
  return { settings, payees: [...groups.values()] };
}

// --- core conversion ---

function convert(
  settings: Row,
  payeeRows: Row[],
  opts: ConvertOptions,
  isJson: boolean
): ConvertResult {
  const override = (clean(opts.formCode) as string | null)?.toUpperCase() ?? "";
  if (FORM_TAX_RATE_IDS[override] && isJson) settings.form_code = override;

  const formCode = String(clean(settings.form_code) ?? "").toUpperCase();
  if (!FORM_TAX_RATE_IDS[formCode]) {
    throw new Error("Settings: form_code must be PND3 or PND53");
  }
  const payerId = id13(settings.payer_id, "payer_id", "Settings");
  const branchType = String(clean(settings.branch_type) ?? "").toUpperCase();
  if (!["V", "S", "W", "N"].includes(branchType)) {
    throw new Error("Settings: branch_type must be V, S, W, or N");
  }
  const branchNo = integer(settings.branch_no, "branch_no", branchType !== "N");
  let year = integer(settings.tax_year, "tax_year")!;
  if (year < 2400) year += 543;
  const month = integer(settings.tax_month, "tax_month")!;
  if (month < 1 || month > 12) {
    throw new Error("Settings: tax_month must be between 1 and 12");
  }
  const filingType = integer(settings.filing_type, "filing_type")!;
  const filingNo = integer(settings.filing_no, "filing_no")!;
  if ((filingType !== 0 && filingType !== 1) || filingNo < 0) {
    throw new Error("Settings: filing_type or filing_no is invalid");
  }

  const emptyAddress = () =>
    Object.fromEntries(
      [
        "building", "village", "roomNo", "floorNo", "houseNo", "moo", "soi", "road",
        "junction", "subDistrictCode", "subdistrict", "districtCode", "district",
        "provinceCode", "province", "postCode",
      ].map((key) => [key, null])
    );

  const details: Row[] = [];
  const seen = new Set<string>();
  let totalIncome = 0;
  let totalTax = 0;

  payeeRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const recipientId = id13(row.recipient_id, "recipient_id", `Payees row ${rowNumber}`);
    if (seen.has(recipientId)) {
      throw new Error(`Payees row ${rowNumber}: duplicate recipient_id`);
    }
    seen.add(recipientId);

    const recipient: Row = {
      seq: details.length + 1,
      branchType: clean(row.branch_type),
      branchNo: clean(row.branch_no),
      id13: recipientId,
      titleCode: clean(row.title_code),
      titleName: clean(row.title_name),
      firstName: clean(row.first_name),
      middleName: clean(row.middle_name),
      name: (clean(row.first_name) as string) || "",
      surname: clean(row.surname),
      addressInfo: emptyAddress(),
      taxDetail: [],
    };
    if (!recipient.firstName && !recipient.name) {
      throw new Error(`Payees row ${rowNumber}: first_name is required`);
    }

    const taxDetail = recipient.taxDetail as Row[];
    for (const group of DETAIL_GROUPS) {
      const dateValue = clean(row[`date${group}`]);
      const fields = [
        row[`income_code${group}`], row[`income_desc${group}`], row[`tax_rate${group}`],
        row[`income_amt${group}`], row[`tax_amt${group}`], row[`condition_code${group}`],
      ];
      if ([dateValue, ...fields].every((value) => clean(value) === null)) continue;
      if (dateValue === null || fields.some((value) => clean(value) === null)) {
        throw new Error(`Payees row ${rowNumber}: payment group ${group} is incomplete`);
      }
      const income = Math.round(number(row[`income_amt${group}`], `income_amt${group}`, rowNumber)! * 100) / 100;
      const tax = Math.round(number(row[`tax_amt${group}`], `tax_amt${group}`, rowNumber)! * 100) / 100;
      const rate = number(row[`tax_rate${group}`], `tax_rate${group}`, rowNumber)!;
      if (income < 0 || tax < 0 || rate < 0 || rate > 35) {
        throw new Error(`Payees row ${rowNumber}: amount/rate is out of range`);
      }
      const rateId = integer(row[`tax_rate_id${group}`], `tax_rate_id${group}`)!;
      const conditionCode = String(clean(row[`condition_code${group}`]));
      taxDetail.push({
        seq: taxDetail.length,
        date: thaiDate(dateValue, `date${group}`, rowNumber),
        incomeTaxCode: String(clean(row[`income_code${group}`])),
        incomeTaxType: null,
        incomeTaxDesc: String(clean(row[`income_desc${group}`])),
        taxRateId: rateId,
        taxRate: asFloat(rate),
        incomeAmt: asFloat(income),
        netAmt: asFloat(tax),
        conditionCode,
        conditionName: conditionCode === "1" ? "หัก ณ ที่จ่าย" : "ออกภาษีให้",
      });
      totalIncome += income;
      totalTax += tax;
    }
    if (!taxDetail.length) {
      throw new Error(`Payees row ${rowNumber}: at least one payment group is required`);
    }
    details.push(recipient);
  });

  if (!details.length) {
    throw new Error("Payees sheet must contain at least one recipient");
  }
  totalIncome = Math.round(totalIncome * 100) / 100;
  totalTax = Math.round(totalTax * 100) / 100;

  const payerInfo = {
    id13: payerId, id10: null, titleCode: null, titleName: null,
    firstName: null, middleName: null, surName: null, name: "",
    lastsynUserInfoDate: null, branchNo: branchNo, lto: null,
    address: Object.fromEntries(
      ["building", "roomNo", "floorNo", "village", "houseNo", "moo", "junction", "soi", "road",
        "subDistrictCode", "subdistrict", "district", "province", "postCode", "telNo"].map((k) => [k, null])
    ),
    addressInfo: Object.fromEntries(
      ["building", "roomNo", "floorNo", "village", "houseNo", "moo", "junction", "soi", "road",
        "subDistrictCode", "subdistrict", "district", "districtCode", "province", "provinceCode", "postCode"].map((k) => [k, null])
    ),
  };

  const taxDetail = {
    branchType, createDate: null, criminal: null, filingNo,
    filingType, homeOffice: "", month, netAmt: 0,
    netTax: asFloat(totalTax), penalty: 0, refNo: null, roundFlag: null, surcharge: null,
    taxAmt: null, totIncome: asFloat(totalIncome), totNum: details.length, totSheet: null,
    totTaxAmt: null, totAmt: null,
    whtRmtUnder: [
      integer(settings.wht_under_1, "wht_under_1", false) || 0,
      integer(settings.wht_under_2, "wht_under_2", false) || 0,
      integer(settings.wht_under_3, "wht_under_3", false) || 0,
    ],
    year,
  };

  const doc = { code: formCode, version: "1.0.0", minusFlag: String(clean(settings.minus_flag) ?? "N") };
  const main = {
    rdForm: {
      docDetail: doc,
      formDetail: {
        payment: { dueDate: null, payAmt: null },
        taxDetail,
        taxPayerInfo: payerInfo,
      },
      processing: { receiptNo: null, criminalReceiptNo: null, receiptDate: null, paidAmount: null, paidAmountTxt: null, uid: null, dln: null },
    },
  };
  const attach = {
    rdForm: {
      attachDetail: {
        taxPayerInfo: { id13: payerId, branchNo },
        taxDetail: { refNo: null },
        printDetail: { numPerPage: 0 },
      },
      docDetail: doc,
      formAttach: { attDet: details, numberOfId13: details.length, totalIncomeAmt: asFloat(totalIncome), totalNetTax: asFloat(totalTax) },
    },
  };

  const branchPart = branchType === "N" ? "OZZZZZ" : `${branchType}${String(Math.trunc(branchNo || 0)).padStart(5, "0")}`;
  const suffix = formCode.replace("PND", "").padStart(2, "0");
  const base = `${payerId}${branchPart}P${suffix}${String(year).padStart(4, "0")}${pad2(month)}${String(filingNo).padStart(4, "0")}`;

  return {
    formCode,
    payerId,
    branchType,
    base,
    totalIncome,
    totalTax,
    recipients: details.length,
    summary: `รายรับ: ${totalIncome} | ภาษี: ${totalTax} | ผู้รับ: ${details.length}`,
    mainJson: serializeRdxJson(main),
    attachJson: serializeRdxJson(attach),
  };
}

// --- public API ---

export async function convertFile(file: File, opts: ConvertOptions = {}): Promise<ConvertResult> {
  const isJson = file.name.toLowerCase().endsWith(".json");
  if (isJson) {
    const records = JSON.parse(await file.text());
    const { settings, payees } = loadJsonInput(records, opts);
    return convert(settings, payees, opts, true);
  }

  const XLSX = await loadXlsx();
  const { settings, payees } = sheetRowsFromWorkbook(XLSX, await file.arrayBuffer());
  if (settings.length !== 1) {
    throw new Error("Settings sheet must contain exactly one data row");
  }
  const first = settings[0];
  if (opts.filingYear != null) first.tax_year = opts.filingYear;
  if (opts.filingMonth != null) first.tax_month = opts.filingMonth;
  return convert(first, payees, opts, false);
}

/** Pack the two RDPrep JSON docs into an AES-256 encrypted `.rdx` archive. */
export async function buildRdx(result: ConvertResult, password = RDX_PASSWORD): Promise<Blob> {
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  const blobWriter = new BlobWriter("application/zip");
  const writer = new ZipWriter(blobWriter, { password, encryptionStrength: 3 });
  await writer.add(`${result.base}M.json`, new TextReader(result.mainJson));
  await writer.add(`${result.base}D.json`, new TextReader(result.attachJson));
  await writer.close();
  return blobWriter.getData();
}

/** Unencrypted ZIP holding the two JSON docs (for inspection / hand-off). */
export async function buildJsonZip(result: ConvertResult): Promise<Blob> {
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  const blobWriter = new BlobWriter("application/zip");
  const writer = new ZipWriter(blobWriter);
  await writer.add(`${result.base}M.json`, new TextReader(result.mainJson));
  await writer.add(`${result.base}D.json`, new TextReader(result.attachJson));
  await writer.close();
  return blobWriter.getData();
}

/** Build the same starter workbook the desktop app's "Create template" produces. */
export async function buildTemplate(formCode: RdxForm = "PND3"): Promise<Blob> {
  const XLSX = await loadXlsx();
  const settings = XLSX.utils.aoa_to_sheet([
    SETTINGS_HEADERS,
    [formCode, "0275566001619", "V", 0, 2569, 8, 0, 0, "N", 1, 0, 0],
  ]);
  const payeeRow = [
    "1100400398106", "2110", "นาย", "ณัฐพล", "", "ลิขิตโสภี", "", "",
    new Date(Date.UTC(2026, 7, 1)), "389", "วิชาชีพอิสระ - การบัญชี", 5, 3, 4000, 120, 1,
    ...Array(16).fill(""),
  ];
  const payees = XLSX.utils.aoa_to_sheet([PAYEE_HEADERS, payeeRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, settings, "Settings");
  XLSX.utils.book_append_sheet(workbook, payees, "Payees");
  const out = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([out as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
