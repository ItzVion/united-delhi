import { createHash } from 'node:crypto';

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function sourceWithSha256(source, digest) {
  const base = String(source || '').replace(/#sha256=[0-9a-f]{64}$/i, '').replace(/#$/, '');
  return base + '#sha256=' + String(digest || '').toLowerCase();
}

export function sourceHasSha256(source, digest) {
  const match = /#sha256=([0-9a-f]{64})$/i.exec(String(source || ''));
  return Boolean(match && digest && match[1].toLowerCase() === String(digest).toLowerCase());
}

export function currentGtfsDate(timeZone = 'Asia/Kolkata', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return value.year + value.month + value.day;
}

function validDate(value) {
  const text = String(value ?? '').trim();
  if (!/^\d{8}$/.test(text)) return null;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return text;
}

export function inspectGtfsServiceCoverage({
  calendarRows = [],
  calendarDateRows = [],
  today = currentGtfsDate(),
} = {}) {
  const normalizedToday = validDate(today);
  if (!normalizedToday) throw new TypeError('today must be a valid YYYYMMDD GTFS date');

  const baseRows = (Array.isArray(calendarRows) ? calendarRows : []).map(row => ({
    serviceId: String(row?.service_id ?? '').trim(),
    start: validDate(row?.start_date),
    end: validDate(row?.end_date),
    weekdays: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => String(row?.[day] ?? '') === '1'),
  })).filter(row => row.serviceId && row.start && row.end && row.start <= row.end);

  const exceptions = (Array.isArray(calendarDateRows) ? calendarDateRows : []).map(row => ({
    serviceId: String(row?.service_id ?? '').trim(),
    date: validDate(row?.date),
    type: String(row?.exception_type ?? '').trim(),
  })).filter(row => row.serviceId && row.date && (row.type === '1' || row.type === '2'));

  const starts = [...baseRows.map(row => row.start), ...exceptions.map(row => row.date)].sort();
  const ends = [...baseRows.map(row => row.end), ...exceptions.map(row => row.date)].sort();
  const calendarStartDate = starts[0] || null;
  const calendarEndDate = ends.at(-1) || null;

  const activeServices = new Set();
  const date = new Date(Date.UTC(
    Number(normalizedToday.slice(0, 4)),
    Number(normalizedToday.slice(4, 6)) - 1,
    Number(normalizedToday.slice(6, 8))
  ));
  const mondayIndex = (date.getUTCDay() + 6) % 7;

  for (const row of baseRows) {
    if (row.start <= normalizedToday && normalizedToday <= row.end && row.weekdays[mondayIndex]) {
      activeServices.add(row.serviceId);
    }
  }
  for (const exception of exceptions) {
    if (exception.date !== normalizedToday) continue;
    if (exception.type === '1') activeServices.add(exception.serviceId);
    else activeServices.delete(exception.serviceId);
  }

  const hasServiceToday = activeServices.size > 0;
  let status = 'unknown';
  if (baseRows.length || exceptions.length) {
    if (calendarEndDate && normalizedToday > calendarEndDate) status = 'expired';
    else if (hasServiceToday) status = 'active-today';
    else status = 'no-service-today';
  }

  return {
    status,
    today: normalizedToday,
    calendarStartDate,
    calendarEndDate,
    hasServiceToday,
    baseServiceCount: baseRows.length,
    exceptionCount: exceptions.length,
    invalidBaseRows: (Array.isArray(calendarRows) ? calendarRows.length : 0) - baseRows.length,
    invalidExceptionRows: (Array.isArray(calendarDateRows) ? calendarDateRows.length : 0) - exceptions.length,
  };
}
