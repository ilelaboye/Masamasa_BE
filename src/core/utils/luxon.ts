// check if the internal date formatting is correct
import { appConfig } from '@/config';
import { DateTime, Settings } from 'luxon';

Settings.defaultZone = appConfig.TZ;

export const formateMailDate = (dateTime: string | Date) => {
  const dt = DateTime.fromISO(new Date(dateTime).toISOString()).toLocaleString(DateTime.DATE_FULL);
  return dt;
};
export const formateDate = (dateTime: string | Date, withTime = true) => {
  const dt = DateTime.fromISO(new Date(dateTime).toISOString());

  const formatted = dt.setLocale('en-US').toLocaleString({
    month: 'short',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const [month, year, time] = formatted.split(', ');
  return withTime ? `${month} '${year}, ${time}` : `${month} '${year}`;
};

export const formatToLuxon = (date: string) => DateTime.fromISO(date).toISO();

export const getDateTime = (time = 0) => DateTime.local().plus({ minutes: time }).toISO();

export function timeIsAfter(createdAt: string | Date, timing = 5): boolean {
  const dayTime = DateTime.fromISO(new Date(createdAt).toISOString());
  const { minutes } = DateTime.local().diff(dayTime, 'minutes');
  return minutes >= timing;
}

export const dateHasExpired = (createdAt: string | Date) => timeIsAfter(createdAt, 0);

export const startOfDay = (date: Date) => DateTime.fromJSDate(date).startOf('day').toISODate();
export const endOfDay = (date: Date) => DateTime.fromJSDate(date).endOf('day').toISO();

export const startOfMonth = (date: Date) => DateTime.fromJSDate(date).startOf('month').toISODate();

export const endOfMonth = (date: Date) => DateTime.fromJSDate(date).endOf('month').toISODate();

export const startOfYear = (date: Date) => DateTime.fromJSDate(date).startOf('year').toISODate();

export const endOfYear = (date: Date) => DateTime.fromJSDate(date).endOf('year').toISODate();

export const addDay = ({ seconds = 0, minutes = 0, hours = 0, days = 0, months = 0, year = 0 }) =>
  DateTime.now().plus({ seconds: seconds, minutes: minutes, hours: hours, days: days, months: months, year: year }).toISO();

export const subDay = ({ seconds = 0, minutes = 0, hours = 0, days = 0, months = 0, year = 0 }) =>
  DateTime.now().minus({ seconds: seconds, minutes: minutes, hours: hours, days: days, months: months, year: year }).toISO();

export const formatToLuxon2 = (date: string) => DateTime.fromJSDate(new Date(date)).toISO();
