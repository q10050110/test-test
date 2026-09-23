/**
 * 将数字转换为指定单位显示（自动模式）
 * @param num 原始数字
 * @param decimals 保留小数位数
 */
export const formatNumberByUnit = (
  num: number | string,
  decimals: number = 2
): string => {
  if (!num && num !== 0) return '0';

  const value = Number(num);
  if (isNaN(value)) return '0';

  // 取绝对值用于判断量级
  const absValue = Math.abs(value);

  let divisor = 1;
  let suffix = '';

  if (absValue >= 100_000_000) {
    // 亿
    divisor = 100_000_000;
    suffix = '亿';
  } else if (absValue >= 1_000_000) {
    // 百万
    divisor = 1_000_000;
    suffix = '百万';
  } else if (absValue >= 10_000) {
    // 万
    divisor = 10_000;
    suffix = '万';
  } else {
    // 小于万，直接返回原数字（可根据需求决定是否保留小数）
    return Number(value.toFixed(decimals)).toString();
  }

  const result = (value / divisor).toFixed(decimals);
  return `${result} ${suffix}`;
};