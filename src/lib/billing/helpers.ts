export function yearNow() {
    return new Date().getFullYear();
  }

  export function pad(n: number, size = 4) {
    return String(n).padStart(size, "0");
  }

  export function quoteNumber(year: number, seq: number) {
    return `D-${year}-${pad(seq, 4)}`;
  }

  export function invoiceNumber(year: number, seq: number) {
    return `F-${year}-${pad(seq, 4)}`;
  }
