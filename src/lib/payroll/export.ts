import type { PrepayReport } from "@/lib/payroll/prepay";

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export function prepayCsvFilename(report: PrepayReport) {
  return `pre-paie-${report.fromIso.slice(0, 10)}-${report.toIso.slice(0, 10)}.csv`;
}

export function prepayCabinetCsvFilename(report: PrepayReport) {
  return `pre-paie-cabinet-${report.fromIso.slice(0, 10)}-${report.toIso.slice(0, 10)}.csv`;
}

export function buildPrepayCsv(report: PrepayReport) {
  const header = [
    "Agent",
    "Matricule/ID",
    "Contrat mensuel",
    "Heures totales",
    "Heures payables",
    "Absences",
    "Nuit",
    "Dimanche",
    "Jours feries",
    "1er mai",
    "HS hebdo indicatives",
    "Depassement contrat",
    "Base estimee",
    "Majoration nuit",
    "Majoration dimanche",
    "Majoration jours feries",
    "Majoration 1er mai",
    "Indemnite panier",
    "Indemnite transport",
    "Total estime",
    "Vacations",
    "Sites",
    "Anomalies",
  ];

  const rows = report.rows.map((row) => [
    row.agentName,
    row.payrollId,
    row.contractHours,
    row.totalHours,
    row.payableHours,
    row.absenceHours,
    row.nightHours,
    row.sundayHours,
    row.publicHolidayHours,
    row.mayFirstHours,
    row.weeklyOvertimeHours,
    row.contractOverageHours,
    row.basePayAmount,
    row.nightPremiumAmount,
    row.sundayPremiumAmount,
    row.publicHolidayPremiumAmount,
    row.mayFirstPremiumAmount,
    row.mealAllowanceAmount,
    row.transportAllowanceAmount,
    row.estimatedGrossAmount,
    row.vacationCount,
    row.siteNames.join(", "),
    row.anomalies.join(" | "),
  ]);

  return [header, ...rows]
    .map((line) => line.map(csvCell).join(";"))
    .join("\r\n");
}

function periodLabel(report: PrepayReport) {
  return `${report.fromIso.slice(0, 10)}_${report.toIso.slice(0, 10)}`;
}

function exportNumber(report: PrepayReport, value: number | null | undefined) {
  if (value === null || typeof value === "undefined") return "";
  if (!Number.isFinite(value)) return "";

  const text = String(Math.round((value + Number.EPSILON) * 100) / 100);
  if (report.settings.exportDecimalSeparator === "dot") return text;
  return text.replace(".", ",");
}

function pushCabinetLine(
  lines: unknown[][],
  input: {
    report: PrepayReport;
    agentId: string;
    agentName: string;
    code: string;
    label: string;
    quantity: number;
    rate?: number | null;
    amount?: number | null;
    comment?: string | null;
  }
) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return;

  lines.push([
    input.agentId,
    input.agentName,
    periodLabel(input.report),
    input.report.fromIso.slice(0, 10),
    input.report.toIso.slice(0, 10),
    input.code,
    input.label,
    exportNumber(input.report, input.quantity),
    exportNumber(input.report, input.rate),
    exportNumber(input.report, input.amount),
    input.comment ?? "",
  ]);
}

export function buildPrepayCabinetCsv(report: PrepayReport) {
  const header = [
    "Matricule/ID",
    "Agent",
    "Periode",
    "Date debut",
    "Date fin",
    "Code rubrique",
    "Libelle rubrique",
    "Quantite/Base",
    "Taux",
    "Montant",
    "Commentaire",
  ];

  const lines: unknown[][] = [];
  const codes = report.settings.payrollRubricCodes;

  report.rows.forEach((row) => {
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.payableHours,
      label: "Heures payables",
      quantity: row.payableHours,
      rate: report.settings.hourlyBaseRate,
      amount: row.basePayAmount,
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.nightHours,
      label: "Heures de nuit",
      quantity: row.nightHours,
      rate: report.settings.nightPremiumPercent,
      amount: row.nightPremiumAmount,
      comment: "Taux a confirmer selon convention/accords.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.sundayHours,
      label: "Heures dimanche",
      quantity: row.sundayHours,
      rate: report.settings.sundayPremiumPercent,
      amount: row.sundayPremiumAmount,
      comment: "Taux a confirmer selon convention/accords.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.publicHolidayHours,
      label: "Heures jours feries",
      quantity: row.publicHolidayHours,
      rate: report.settings.publicHolidayPremiumPercent,
      amount: row.publicHolidayPremiumAmount,
      comment: "Hors traitement specifique du 1er mai si renseigne.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.mayFirstHours,
      label: "Heures 1er mai",
      quantity: row.mayFirstHours,
      rate: report.settings.mayFirstPremiumPercent,
      amount: row.mayFirstPremiumAmount,
      comment: "A valider par le gestionnaire paie.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.overtimeIndicative,
      label: "Heures supplementaires indicatives",
      quantity: row.weeklyOvertimeHours,
      comment: "Indicatif planning, arbitrage paie requis.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.absenceHours,
      label: "Absences detectees",
      quantity: row.absenceHours,
      comment: "Type d'absence a qualifier avant paie.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.mealAllowance,
      label: "Indemnite panier",
      quantity: row.mealAllowanceAmount,
      amount: row.mealAllowanceAmount,
      comment: "Montant calcule selon parametrage agence.",
    });
    pushCabinetLine(lines, {
      report,
      agentId: row.payrollId,
      agentName: row.agentName,
      code: codes.transportAllowance,
      label: "Indemnite transport",
      quantity: row.transportAllowanceAmount,
      amount: row.transportAllowanceAmount,
      comment: "Montant calcule selon parametrage agence.",
    });
  });

  return [header, ...lines]
    .map((line) => line.map(csvCell).join(";"))
    .join("\r\n");
}
