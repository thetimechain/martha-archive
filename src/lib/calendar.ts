export type CalendarCell =
  | { kind: "pad"; iso: null }
  | { kind: "day"; day: number; iso: string; episode?: { id: string; title: string } | null };

export function monthCells(year: number, month: number /* 1-12 */): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = first.getUTCDay(); // 0..6 (Sun..Sat)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ kind: "pad", iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ kind: "day", day: d, iso });
  }
  while (cells.length < 42) cells.push({ kind: "pad", iso: null });
  return cells;
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
