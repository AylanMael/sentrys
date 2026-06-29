// src/lib/planning/time.ts
export function toMs(d: Date | string | number) {
    return typeof d === "number" ? d : new Date(d).getTime();
  }

  export function overlaps(aStart: any, aEnd: any, bStart: any, bEnd: any) {
    const as = toMs(aStart);
    const ae = toMs(aEnd);
    const bs = toMs(bStart);
    const be = toMs(bEnd);
    return as < be && bs < ae;
  }

  export function addHours(date: Date, hours: number) {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }
