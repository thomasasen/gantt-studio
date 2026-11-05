/** Calendar-only helpers: YYYY-MM-DD is never a timestamp or UTC "today". */
export function localTodayIso(now = new Date()) {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (day < 1) return false;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
