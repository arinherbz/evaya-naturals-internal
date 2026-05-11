export const formatUGX = (n: number) =>
  'UGX ' + Math.round(n).toLocaleString('en-US');
