export function classNames(...values: Array<string | undefined | false | null>) {
  return values.filter(Boolean).join(' ');
}

export function passwordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[!@#$%^&*]/.test(password)) score += 1;
  if (password.length >= 12) score += 1;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

export function passwordLabel(score: number) {
  if (score <= 0) return 'Weak';
  if (score === 1) return 'Fair';
  if (score === 2) return 'Strong';
  return 'Very strong';
}
