export function organizerNetAmount(total: number, platformFee: number) {
  return Math.max(0, total - platformFee);
}
