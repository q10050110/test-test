/**
 * 将数字转换为指定单位显示
 * @param num 原始数字
 * @param unit 单位类型: 'million' (百万), 'billion' (十亿/亿)
 * @param decimals 保留小数位数
 */
export const formatNumberByUnit = (
  num: number | string,
  unit: 'million' | 'billion' = 'million',
  decimals: number = 2
): string => {
  if (!num && num !== 0) return '0';

  const value = Number(num);
  if (isNaN(value)) return '0';

  let divisor = 1;
  let suffix = '';

  if (unit === 'million') {
    divisor = 1_000_000;
    suffix = '百万';
  } else if (unit === 'billion') {
    // 注意：中文语境下通常 "亿" 是 10^8，"十亿" 是 10^9。
    // 如果是指国际单位的 Billion (10^9)，则 divisor = 1_000_000_000
    // 如果是指中文的 "亿"，则 divisor = 100_000_000
    // 这里假设你需要的是国际单位 Million 对应的上一级，或者你可以直接定制
    divisor = 100_000_000; // 如果是要显示为 "亿"
    suffix = '亿';
  }

  const result = (value / divisor).toFixed(decimals);
  return `${result} ${suffix}`;
};