const DANGEROUS_SPREADSHEET_PREFIX = /^(?:[\t\r]|[ \t\r]*[=+\-@])/;

function csvText(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "");
}

export function csvCell(value: unknown) {
  const text = csvText(value);
  const safeText = typeof value === "string" && DANGEROUS_SPREADSHEET_PREFIX.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function csvDownload(rows: ReadonlyArray<ReadonlyArray<unknown>>, filename: string) {
  const safeFilename = filename.replaceAll(/[^a-zA-Z0-9._-]/g, "-") || "export.csv";

  return new Response(serializeCsv(rows), {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${safeFilename}"`,
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff"
    }
  });
}
