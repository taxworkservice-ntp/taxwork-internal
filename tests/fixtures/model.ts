import type { ReportModel } from "@/lib/report-model";

export const SAMPLE_QR =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

/** Deterministic model used by template and integration tests. */
export function sampleModel(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    reportId: "r1",
    firmName: "Taxwork",
    preparedBy: "สมชาย",
    reportNo: "TW-6908-7F3K9Q2M",
    reportLabel: "ครั้งที่ 1",
    periodLabel: "2026-08",
    issueDate: "22/09/2569",
    logoDataUri: null,
    client: {
      name: "บริษัท ทดสอบ จำกัด",
      tax_id: "0105550000000",
      address: "123 ถนนทดสอบ",
      phone: "02-000-0000",
      email: "a@b.co",
    },
    filings: [
      {
        id: "f1",
        form_code: "ภ.พ.30",
        description: "ภาษีมูลค่าเพิ่ม เดือน 7/69",
        amount: 5000,
        due_date: "2026-09-15",
        remark: null,
        payment_method: null,
        bank: {
          id: "b1",
          label: "KBANK",
          bank_name: "ธนาคารกสิกรไทย",
          account_no: "164-3-84594-2",
          account_name: "ณัฐพล ลิขิตโสภี",
          promptpay_id: "0810000000",
          qrDataUri: SAMPLE_QR,
          logoDataUri: null,
          logoBottomDataUri: null,
        },
        qrDataUri: SAMPLE_QR,
      },
    ],
    documents: [],
    total: 5000,
    ...overrides,
  };
}
