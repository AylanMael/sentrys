export type AllowanceMode = "none" | "per_shift" | "per_worked_day";
export type PrepayExportProfile = "custom" | "silae" | "sage" | "ebp";
export type PrepayDecimalSeparator = "comma" | "dot";

export type PrepayRubricCodes = {
  payableHours: string;
  nightHours: string;
  sundayHours: string;
  publicHolidayHours: string;
  mayFirstHours: string;
  overtimeIndicative: string;
  absenceHours: string;
  mealAllowance: string;
  transportAllowance: string;
};

export type PrepaySettings = {
  conventionLabel: string;
  hourlyBaseRate: number;
  monthlyDefaultHours: number;
  weeklyOvertimeThreshold: number;
  nightStartTime: string;
  nightEndTime: string;
  nightPremiumPercent: number;
  sundayPremiumPercent: number;
  publicHolidayPremiumPercent: number;
  mayFirstPremiumPercent: number;
  mealAllowanceAmount: number;
  transportAllowanceAmount: number;
  allowanceMode: AllowanceMode;
  exportProfile: PrepayExportProfile;
  exportDecimalSeparator: PrepayDecimalSeparator;
  payrollRubricCodes: PrepayRubricCodes;
};

export const DEFAULT_PREPAY_RUBRIC_CODES: PrepayRubricCodes = {
  payableHours: "HPAY",
  nightHours: "HNUIT",
  sundayHours: "HDIM",
  publicHolidayHours: "HFER",
  mayFirstHours: "HMAI",
  overtimeIndicative: "HSIND",
  absenceHours: "ABS",
  mealAllowance: "PANIER",
  transportAllowance: "TRANSP",
};

export const DEFAULT_PREPAY_SETTINGS: PrepaySettings = {
  conventionLabel: "Prevention et securite - IDCC 1351",
  hourlyBaseRate: 0,
  monthlyDefaultHours: 151.67,
  weeklyOvertimeThreshold: 35,
  nightStartTime: "21:00",
  nightEndTime: "06:00",
  nightPremiumPercent: 0,
  sundayPremiumPercent: 0,
  publicHolidayPremiumPercent: 0,
  mayFirstPremiumPercent: 0,
  mealAllowanceAmount: 0,
  transportAllowanceAmount: 0,
  allowanceMode: "none",
  exportProfile: "custom",
  exportDecimalSeparator: "comma",
  payrollRubricCodes: DEFAULT_PREPAY_RUBRIC_CODES,
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeText(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min = 0, max = 100000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number * 100) / 100));
}

function normalizePercent(value: unknown, fallback: number) {
  return normalizeNumber(value, fallback, 0, 500);
}

export function parseTimeToMinutes(value: string) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function normalizeTime(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return parseTimeToMinutes(text) === null ? fallback : text.padStart(5, "0");
}

function normalizeAllowanceMode(value: unknown): AllowanceMode {
  const text = String(value ?? "").trim();
  if (text === "per_shift" || text === "per_worked_day" || text === "none") {
    return text;
  }
  return DEFAULT_PREPAY_SETTINGS.allowanceMode;
}

function normalizeExportProfile(value: unknown): PrepayExportProfile {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "silae" || text === "sage" || text === "ebp" || text === "custom") {
    return text;
  }
  return DEFAULT_PREPAY_SETTINGS.exportProfile;
}

function normalizeDecimalSeparator(value: unknown): PrepayDecimalSeparator {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "dot" || text === "comma") return text;
  return DEFAULT_PREPAY_SETTINGS.exportDecimalSeparator;
}

function normalizeRubricCode(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return (text || fallback).slice(0, 40);
}

function normalizeRubricCodes(value: unknown): PrepayRubricCodes {
  const data = readRecord(value);
  const defaults = DEFAULT_PREPAY_RUBRIC_CODES;

  return {
    payableHours: normalizeRubricCode(data.payableHours, defaults.payableHours),
    nightHours: normalizeRubricCode(data.nightHours, defaults.nightHours),
    sundayHours: normalizeRubricCode(data.sundayHours, defaults.sundayHours),
    publicHolidayHours: normalizeRubricCode(
      data.publicHolidayHours,
      defaults.publicHolidayHours
    ),
    mayFirstHours: normalizeRubricCode(data.mayFirstHours, defaults.mayFirstHours),
    overtimeIndicative: normalizeRubricCode(
      data.overtimeIndicative,
      defaults.overtimeIndicative
    ),
    absenceHours: normalizeRubricCode(data.absenceHours, defaults.absenceHours),
    mealAllowance: normalizeRubricCode(data.mealAllowance, defaults.mealAllowance),
    transportAllowance: normalizeRubricCode(
      data.transportAllowance,
      defaults.transportAllowance
    ),
  };
}

export function normalizePrepaySettings(value: unknown): PrepaySettings {
  const data = readRecord(value);

  return {
    conventionLabel: normalizeText(
      data.conventionLabel,
      DEFAULT_PREPAY_SETTINGS.conventionLabel
    ).slice(0, 120),
    hourlyBaseRate: normalizeNumber(
      data.hourlyBaseRate,
      DEFAULT_PREPAY_SETTINGS.hourlyBaseRate,
      0,
      500
    ),
    monthlyDefaultHours: normalizeNumber(
      data.monthlyDefaultHours,
      DEFAULT_PREPAY_SETTINGS.monthlyDefaultHours,
      1,
      300
    ),
    weeklyOvertimeThreshold: normalizeNumber(
      data.weeklyOvertimeThreshold,
      DEFAULT_PREPAY_SETTINGS.weeklyOvertimeThreshold,
      1,
      80
    ),
    nightStartTime: normalizeTime(
      data.nightStartTime,
      DEFAULT_PREPAY_SETTINGS.nightStartTime
    ),
    nightEndTime: normalizeTime(
      data.nightEndTime,
      DEFAULT_PREPAY_SETTINGS.nightEndTime
    ),
    nightPremiumPercent: normalizePercent(
      data.nightPremiumPercent,
      DEFAULT_PREPAY_SETTINGS.nightPremiumPercent
    ),
    sundayPremiumPercent: normalizePercent(
      data.sundayPremiumPercent,
      DEFAULT_PREPAY_SETTINGS.sundayPremiumPercent
    ),
    publicHolidayPremiumPercent: normalizePercent(
      data.publicHolidayPremiumPercent,
      DEFAULT_PREPAY_SETTINGS.publicHolidayPremiumPercent
    ),
    mayFirstPremiumPercent: normalizePercent(
      data.mayFirstPremiumPercent,
      DEFAULT_PREPAY_SETTINGS.mayFirstPremiumPercent
    ),
    mealAllowanceAmount: normalizeNumber(
      data.mealAllowanceAmount,
      DEFAULT_PREPAY_SETTINGS.mealAllowanceAmount,
      0,
      1000
    ),
    transportAllowanceAmount: normalizeNumber(
      data.transportAllowanceAmount,
      DEFAULT_PREPAY_SETTINGS.transportAllowanceAmount,
      0,
      1000
    ),
    allowanceMode: normalizeAllowanceMode(data.allowanceMode),
    exportProfile: normalizeExportProfile(data.exportProfile),
    exportDecimalSeparator: normalizeDecimalSeparator(data.exportDecimalSeparator),
    payrollRubricCodes: normalizeRubricCodes(data.payrollRubricCodes),
  };
}

export function toStoredPrepaySettings(settings: PrepaySettings) {
  return normalizePrepaySettings(settings);
}
