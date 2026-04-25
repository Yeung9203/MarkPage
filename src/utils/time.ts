/**
 * 相对时间格式化
 *
 * 将时间戳转为人类友好的"X 时间前"文案，文案走 i18n。
 *
 * 使用示例：
 *   import { formatRelativeTime } from '@/utils/time';
 *   formatRelativeTime(Date.now() - 5 * 60 * 1000); // "5 分钟前"
 */

import { t } from './i18n';

/** 60 秒 */
const SEC = 1000;
/** 60 分钟 */
const MIN = 60 * SEC;
/** 24 小时 */
const HOUR = 60 * MIN;
/** 7 天 */
const DAY = 24 * HOUR;

/**
 * 将时间戳格式化为相对时间
 *
 * - < 60s        → "刚刚" / "just now"
 * - < 60min      → "X 分钟前" / "X min ago"
 * - < 24h        → "X 小时前" / "X h ago"
 * - < 7d         → "X 天前" / "X d ago"
 * - 否则         → 本地短日期（如 "2026/3/12"）
 *
 * @param ts - 时间戳（毫秒）
 * @returns 本地化的相对时间字符串
 *
 * 使用示例：
 *   formatRelativeTime(Date.now() - 30 * 1000);          // "刚刚"
 *   formatRelativeTime(Date.now() - 5 * 60 * 1000);      // "5 分钟前"
 *   formatRelativeTime(Date.now() - 3 * 60 * 60 * 1000); // "3 小时前"
 */
export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;

  // 异常时间戳（未来时间或非法值），直接显示本地日期
  if (!Number.isFinite(diff) || diff < 0) {
    return new Date(ts).toLocaleDateString();
  }

  if (diff < MIN) {
    return t('time_justNow');
  }
  if (diff < HOUR) {
    return t('time_minutesAgo', [String(Math.floor(diff / MIN))]);
  }
  if (diff < DAY) {
    return t('time_hoursAgo', [String(Math.floor(diff / HOUR))]);
  }
  if (diff < 7 * DAY) {
    return t('time_daysAgo', [String(Math.floor(diff / DAY))]);
  }
  return new Date(ts).toLocaleDateString();
}
