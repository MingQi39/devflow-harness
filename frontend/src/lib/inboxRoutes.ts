export function inboxPath(deliveryId?: string | null): string {
  if (!deliveryId) return '/inbox'
  return `/inbox/${deliveryId}`
}
