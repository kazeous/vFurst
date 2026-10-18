const dayFirstDatePattern = /^(\d{1,2})[/.-](\d{1,2})[/.-]([1-9]\d{3})$/;
const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function isCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Reads a typed dd/mm/yyyy date as the ISO yyyy-mm-dd value forms submit, or null. */
export function parseDayFirstDate(text: string) {
  const match = dayFirstDatePattern.exec(text.trim());
  if (!match) return null;

  const [day, month, year] = match.slice(1).map(Number);
  if (!isCalendarDate(year, month, day)) return null;

  return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
}

/** Shows an ISO yyyy-mm-dd value as dd/mm/yyyy, or "" when it is not a date. */
export function formatDayFirstDate(value: string) {
  const match = isoDatePattern.exec(value);
  if (!match) return "";

  const [year, month, day] = match.slice(1).map(Number);
  if (!isCalendarDate(year, month, day)) return "";

  return `${twoDigits(day)}/${twoDigits(month)}/${match[1]}`;
}
