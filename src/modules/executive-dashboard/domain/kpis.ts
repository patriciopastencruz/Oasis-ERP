export function safePercentage(
  numerator: number,
  denominator: number,
): number | null {
  return denominator === 0
    ? null
    : Math.round((numerator / denominator) * 10_000) / 100;
}

export function monthlyVariation(
  current: number,
  previous: number,
): number | null {
  return safePercentage(current - previous, previous);
}

export function isOverdue(
  scheduledDate: string,
  today: string,
  paid: boolean,
): boolean {
  return !paid && scheduledDate < today;
}
