const DIGITS = [
  "",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า",
] as const;

const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"] as const;

function readGroup(n: number): string {
  let out = "";
  for (let pos = 5; pos >= 0; pos--) {
    const digit = Math.floor(n / 10 ** pos) % 10;
    if (digit === 0) continue;
    if (pos === 0) {
      out += n >= 10 && digit === 1 ? "เอ็ด" : DIGITS[digit];
    } else if (pos === 1 && digit === 2) {
      out += "ยี่สิบ";
    } else if (pos === 1 && digit === 1) {
      out += "สิบ";
    } else {
      out += DIGITS[digit] + PLACES[pos];
    }
  }
  return out;
}

function readInteger(n: number): string {
  if (n === 0) return "ศูนย์";
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000000);
    n = Math.floor(n / 1000000);
  }
  let out = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    out += readGroup(groups[i]);
    for (let m = 0; m < i; m++) out += "ล้าน";
  }
  return out;
}

export function thaiBahtText(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const negative = amount < 0;
  const abs = Math.abs(amount);
  let satang = Math.round((abs - Math.trunc(abs)) * 100);
  let baht = Math.trunc(abs);
  if (satang === 100) {
    satang = 0;
    baht += 1;
  }
  const prefix = negative ? "ลบ" : "";
  if (baht === 0 && satang === 0) return `${prefix}ศูนย์บาทถ้วน`;
  if (satang === 0) return `${prefix}${readInteger(baht)}บาทถ้วน`;
  if (baht === 0) return `${prefix}(${readInteger(satang)}สตางค์)`;
  return `${prefix}${readInteger(baht)}บาท${readInteger(satang)}สตางค์`;
}
