import type { LocalChild, ISODate, UUID } from './localTypes';

export type BirthdaySpecialDay = {
  childId: UUID;
  title: string;
  type: 'birthday';
  date: ISODate;
  recurring: 'yearly';
  source: 'child_birthday';
  daysLeft: number;
};

export function getBirthdaySpecialDays(
  children: LocalChild[],
  currentDate: Date | ISODate = new Date()
): BirthdaySpecialDay[] {
  const today = normalizeDate(currentDate);
  return children
    .filter((child) => child.status === 'active' && Boolean(child.birth_date ?? child.birthday))
    .map((child) => {
      const birthDate = (child.birth_date ?? child.birthday) as ISODate;
      const nextBirthday = getNextBirthdayDate(birthDate, today);
      return {
        childId: child.id,
        title: `${child.display_name}生日`,
        type: 'birthday' as const,
        date: formatDate(nextBirthday),
        recurring: 'yearly' as const,
        source: 'child_birthday' as const,
        daysLeft: daysBetween(today, nextBirthday)
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title));
}

function getNextBirthdayDate(birthDate: ISODate, today: Date) {
  const [, monthRaw, dayRaw] = birthDate.split('-').map(Number);
  const month = monthRaw || 1;
  const day = dayRaw || 1;
  const thisYearBirthday = birthdayDateForYear(today.getFullYear(), month, day);
  if (thisYearBirthday.getTime() >= today.getTime()) return thisYearBirthday;
  return birthdayDateForYear(today.getFullYear() + 1, month, day);
}

function birthdayDateForYear(year: number, month: number, day: number) {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return new Date(year, 1, 28);
  }
  return new Date(year, month - 1, day);
}

function normalizeDate(value: Date | ISODate) {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function formatDate(date: Date): ISODate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
