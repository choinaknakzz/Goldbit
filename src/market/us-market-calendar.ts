const NEW_YORK_TIMEZONE = "America/New_York";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEW_YORK_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const toDateKey = (year: number, month: number, day: number): string => {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const utcDate = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day));

const observedDateKey = (year: number, month: number, day: number): string => {
  const date = utcDate(year, month, day);
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

const nthWeekdayOfMonth = (year: number, month: number, weekday: number, nth: number): string => {
  const first = utcDate(year, month, 1);
  const day = 1 + ((7 + weekday - first.getUTCDay()) % 7) + (nth - 1) * 7;
  return toDateKey(year, month, day);
};

const lastWeekdayOfMonth = (year: number, month: number, weekday: number): string => {
  const last = utcDate(year, month + 1, 0);
  const day = last.getUTCDate() - ((7 + last.getUTCDay() - weekday) % 7);
  return toDateKey(year, month, day);
};

const easterSunday = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
};

const goodFridayDateKey = (year: number): string => {
  const date = easterSunday(year);
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
};

const getNyseHolidayDateKeys = (year: number): Set<string> => {
  const holidays = new Set([
    observedDateKey(year, 1, 1),
    nthWeekdayOfMonth(year, 1, 1, 3),
    nthWeekdayOfMonth(year, 2, 1, 3),
    goodFridayDateKey(year),
    lastWeekdayOfMonth(year, 5, 1),
    observedDateKey(year, 7, 4),
    nthWeekdayOfMonth(year, 9, 1, 1),
    nthWeekdayOfMonth(year, 11, 4, 4),
    observedDateKey(year, 12, 25)
  ]);

  if (year >= 2022) holidays.add(observedDateKey(year, 6, 19));

  // A Saturday New Year's Day is observed on the final Friday of the prior year.
  holidays.add(observedDateKey(year + 1, 1, 1));
  return holidays;
};

export const getNewYorkDateKey = (instant = new Date()): string => dateFormatter.format(instant);

export const isNyseTradingDate = (dateKey: string): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid date key: ${dateKey}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month, day);
  if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !getNyseHolidayDateKeys(year).has(dateKey);
};

export const getCurrentNyseTradingDate = (instant = new Date()): string | null => {
  const dateKey = getNewYorkDateKey(instant);
  return isNyseTradingDate(dateKey) ? dateKey : null;
};
