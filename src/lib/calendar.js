export const toLocalDateInput = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const formatDate = date => new Date(`${date}T00:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
export const lunarMonthNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
export const lunarDayNames = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const annualCalendarKinds = new Set(['anniversary', 'birthday', 'valentines', 'qixi']);
const lunarMonthNumbers = { '正月': 1, '一月': 1, '二月': 2, '三月': 3, '四月': 4, '五月': 5, '六月': 6, '七月': 7, '八月': 8, '九月': 9, '十月': 10, '十一月': 11, '冬月': 11, '十二月': 12, '腊月': 12 };
const lunarFormatter = (() => {
  try {
    const formatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return formatter.resolvedOptions().calendar === 'chinese' ? formatter : null;
  } catch { return null; }
})();
const lunarYearCache = new Map();
const lunarOccurrenceCache = new Map();

// Include whole lunar months on both sides of the Gregorian year boundary.
const getLunarDaysInYear = year => {
  if (lunarYearCache.has(year)) return lunarYearCache.get(year);
  if (!lunarFormatter) return [];
  const result = [];
  const end = Date.UTC(year + 1, 2, 1, 12);
  for (const date = new Date(Date.UTC(year - 1, 10, 1, 12)); date.getTime() < end; date.setUTCDate(date.getUTCDate() + 1)) {
    const parts = lunarFormatter.formatToParts(date);
    const monthName = parts.find(part => part.type === 'month')?.value || '';
    result.push({
      date: date.toISOString().slice(0, 10),
      year: parts.find(part => part.type === 'relatedYear')?.value,
      month: lunarMonthNumbers[monthName.replace('闰', '')],
      day: Number(parts.find(part => part.type === 'day')?.value),
      leap: monthName.startsWith('闰'),
    });
  }
  lunarYearCache.set(year, result);
  return result;
};

export const getLunarDatesInYear = (year, lunarMonth, lunarDay, leap = false) => {
  const month = Number(lunarMonth);
  const day = Number(lunarDay);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 30) return [];
  const cacheKey = `${year}-${month}-${day}-${leap}`;
  if (lunarOccurrenceCache.has(cacheKey)) return lunarOccurrenceCache.get(cacheKey);
  const months = new Map();
  for (const entry of getLunarDaysInYear(year)) {
    if (entry.month !== month || entry.day > day) continue;
    const key = `${entry.year}-${entry.leap}`;
    if (!months.has(key) || months.get(key).day < entry.day) months.set(key, entry);
  }
  const dates = [...months.values()].filter(entry => {
    if (entry.day < Math.min(day, 29)) return false;
    // A leap-month birthday uses its regular month in years without that leap month.
    const useLeap = leap && months.has(`${entry.year}-true`);
    return entry.leap === useLeap && entry.date.startsWith(`${year}-`);
  }).map(entry => entry.date).sort();
  lunarOccurrenceCache.set(cacheKey, dates);
  return dates;
};
export const getLunarDateInYear = (year, month, day, leap = false) => getLunarDatesInYear(year, month, day, leap)[0] || null;
export const getQixiDate = year => getLunarDateInYear(year, 7, 7);
export const getAnnualCalendarDates = (event, year) => {
  if (event.eventKind === 'valentines') return [`${year}-02-14`];
  if (event.eventKind === 'qixi') return getLunarDatesInYear(year, 7, 7);
  if (event.eventKind === 'birthday' && event.calendarSystem === 'lunar') return getLunarDatesInYear(year, event.lunarMonth, event.lunarDay, !!event.lunarLeap);
  if (!(event.repeatYearly || annualCalendarKinds.has(event.eventKind))) return [event.date];
  const [, month, day] = (event.sourceDate || event.date).split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return [`${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`];
};
export const getAnnualCalendarDate = (event, year) => getAnnualCalendarDates(event, year)[0] || null;
export const getCalendarEventLabel = eventKind => ({ date: '特别的日子', anniversary: '纪念日', birthday: '生日', valentines: '情人节', qixi: '七夕' })[eventKind] || '纪念日';
const dateNumber = date => Date.parse(`${date}T00:00:00Z`);
export const getCountdownOccurrence = (event, today) => {
  const currentYear = Number(today.slice(0, 4));
  const recurring = event.repeatYearly || annualCalendarKinds.has(event.eventKind);
  const candidates = getAnnualCalendarDates(event, currentYear);
  let date = recurring ? candidates.find(candidate => candidate >= today) : candidates[0];
  if (!date && recurring) date = getAnnualCalendarDates(event, currentYear + 1).find(candidate => candidate >= today);
  if (!date) return null;
  return { ...event, sourceDate: event.sourceDate || event.date, date, days: Math.round((dateNumber(date) - dateNumber(today)) / 86400000) };
};
export const formatLunarBirthday = event => `农历${event.lunarLeap ? '闰' : ''}${lunarMonthNames[Number(event.lunarMonth) - 1]}${lunarDayNames[Number(event.lunarDay) - 1] || ''}`;
export const getCalendarDateCaption = event => event.eventKind === 'birthday' && event.calendarSystem === 'lunar'
  ? `${formatLunarBirthday(event)} · 公历 ${formatDate(event.date)}`
  : event.eventKind === 'qixi'
    ? `农历七月初七 · 公历 ${formatDate(event.date)}`
    : `阳历 ${formatDate(event.date)} · ${getCalendarEventLabel(event.eventKind)}`;
