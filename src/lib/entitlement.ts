/**
 * The single place the premium tier is decided (#12).
 *
 * There is no billing yet (#173), so everyone is entitled. When payments land, this is the
 * only function that changes — every premium feature reads it rather than deciding for itself.
 */
export function isPremium(_uid?: string): boolean {
  return true;
}
