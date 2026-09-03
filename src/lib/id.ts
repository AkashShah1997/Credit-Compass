/** Collision-resistant ids that survive a JSON round-trip. */
export function uid(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
  return prefix ? `${prefix}_${random}` : random
}
