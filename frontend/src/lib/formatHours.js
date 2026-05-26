export function formatHours(decimalHours) {
  const total = Math.max(0, parseFloat(decimalHours) || 0);
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
