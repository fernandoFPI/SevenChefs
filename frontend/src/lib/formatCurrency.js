export function formatCurrency(amount, currency) {
  const num = parseFloat(amount) || 0;
  if (currency === 'USD') {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
  }
  return Math.round(num).toLocaleString('en-US') + ' IQD';
}
