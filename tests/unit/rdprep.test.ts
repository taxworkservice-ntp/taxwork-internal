// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FloatLiteral, buildTemplate, convertFile, serializeRdxJson } from "@/lib/rdprep/convert";

// Synthetic, checksum-valid tax ids (13 digits, RD check digit).
const WITHHOLDER = "9999999999994";
const RECIPIENT = "1234567890121";

const baseRow = {
  prefix: "นาย",
  last_name: "ทดสอบ",
  address: "123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ",
  taxpct: 3,
  description: "ค่าจ้างทำของ",
  withholder_name: "บริษัท ตัวอย่าง จำกัด",
  withholder_tax_id: WITHHOLDER,
};

function jsonFile(rows: unknown[]): File {
  return new File([JSON.stringify(rows)], "input.json", { type: "application/json" });
}

describe("serializeRdxJson", () => {
  it("renders float literals with a decimal point and plain ints without", () => {
    expect(serializeRdxJson({ i: 3, f: new FloatLiteral(450) })).toBe('{"i":3,"f":450.0}');
    expect(serializeRdxJson(new FloatLiteral(12.5))).toBe("12.5");
    expect(serializeRdxJson(new FloatLiteral(0))).toBe("0.0");
    expect(serializeRdxJson([1, new FloatLiteral(-5)])).toBe("[1,-5.0]");
  });

  it("is compact and preserves unicode, nulls and booleans", () => {
    expect(serializeRdxJson({ s: "ค่าจ้างทำของ", n: null, b: true })).toBe(
      '{"s":"ค่าจ้างทำของ","n":null,"b":true}'
    );
  });
});

describe("convertFile — JSON input", () => {
  it("writes money/rate fields as float literals like the desktop tool", async () => {
    const r = await convertFile(
      jsonFile([
        { ...baseRow, invoice_date: "01/07/2569", name: "หนึ่ง", tax: RECIPIENT, amount: "1500.00", wht: "45.00" },
      ]),
      { formCode: "PND3" }
    );
    expect(r.base).toBe(`${WITHHOLDER}V00000P032569070000`);
    expect(r.totalIncome).toBe(1500);
    expect(r.totalTax).toBe(45);
    expect(r.mainJson).toContain('"taxDetail":{"branchType":"V"');
    expect(r.mainJson).toContain('"month":7,"netAmt":0,"netTax":45.0');
    expect(r.mainJson).toContain('"totIncome":1500.0');
    expect(r.attachJson).toContain('"taxRate":3.0,"incomeAmt":1500.0,"netAmt":45.0');
    expect(r.attachJson).toContain('"totalIncomeAmt":1500.0,"totalNetTax":45.0');
  });

  it("leaves recipient addressInfo null even when the row carries an address", async () => {
    const r = await convertFile(
      jsonFile([
        { ...baseRow, invoice_date: "01/07/2569", name: "หนึ่ง", tax: RECIPIENT, amount: "1.00", wht: "1.00" },
      ]),
      { formCode: "PND3" }
    );
    const attach = JSON.parse(r.attachJson);
    const recipient = attach.rdForm.formAttach.attDet[0];
    expect(recipient.addressInfo.subdistrict).toBeNull();
    expect(recipient.addressInfo.postCode).toBeNull();
    expect(r.attachJson).not.toContain("ถนนตัวอย่าง");
  });

  it("groups several payments to the same recipient into payment slots", async () => {
    const row = { ...baseRow, name: "หนึ่ง", tax: RECIPIENT };
    const r = await convertFile(
      jsonFile([
        { ...row, invoice_date: "01/07/2569", amount: "1000.00", wht: "30.00" },
        { ...row, invoice_date: "15/07/2569", amount: "2000.00", wht: "60.00" },
      ]),
      { formCode: "PND3" }
    );
    const attach = JSON.parse(r.attachJson);
    expect(attach.rdForm.formAttach.numberOfId13).toBe(1);
    expect(attach.rdForm.formAttach.attDet[0].taxDetail).toHaveLength(2);
    expect(r.mainJson).toContain('"totIncome":3000.0');
  });

  it("derives the filing period from the first invoice date", async () => {
    const r = await convertFile(
      jsonFile([
        { ...baseRow, invoice_date: "30/09/2569", name: "หนึ่ง", tax: RECIPIENT, amount: "1.00", wht: "1.00" },
      ]),
      { formCode: "PND3" }
    );
    const taxDetail = JSON.parse(r.mainJson).rdForm.formDetail.taxDetail;
    expect(taxDetail.year).toBe(2569);
    expect(taxDetail.month).toBe(9);
  });

  it("rejects an invalid tax id and incomplete payment groups", async () => {
    await expect(
      convertFile(
        jsonFile([
          { ...baseRow, invoice_date: "01/07/2569", name: "หนึ่ง", tax: "1234567890123", amount: "1.00", wht: "1.00" },
        ]),
        { formCode: "PND3" }
      )
    ).rejects.toThrow(/invalid check digit/);

    await expect(
      convertFile(
        jsonFile([{ ...baseRow, invoice_date: "01/07/2569", name: "หนึ่ง", tax: RECIPIENT, amount: "1.00" }]),
        { formCode: "PND3" }
      )
    ).rejects.toThrow(/incomplete/);
  });
});

describe("convertFile — Excel workbook input", () => {
  it("reads the generated template and formats its money/rate fields", async () => {
    const blob = await buildTemplate("PND3");
    const file = new File([await blob.arrayBuffer()], "template.xlsx");
    const r = await convertFile(file, { formCode: "PND3", filingYear: 2569, filingMonth: 8 });
    expect(r.base).toBe("0275566001619V00000P032569080000");
    expect(r.mainJson).toContain('"totIncome":4000.0');
    expect(r.mainJson).toContain('"netTax":120.0');
    expect(r.attachJson).toContain('"incomeTaxCode":"389"');
    expect(r.attachJson).toContain('"date":"2026-08-01"');
    expect(r.attachJson).toContain('"incomeAmt":4000.0');
  });
});
