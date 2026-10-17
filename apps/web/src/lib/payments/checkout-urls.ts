import { getPortalUrl, type PortalUrlOrganization } from "@/lib/portal-url";

export function getPortalCheckoutUrls(
  org: PortalUrlOrganization,
  orderId: string,
  token: string
): { checkoutUrl: string; successUrl: string; cancelUrl: string } {
  const checkoutUrl = getPortalUrl(org, `/checkout/${orderId}?token=${encodeURIComponent(token)}`);

  return {
    checkoutUrl,
    successUrl: `${checkoutUrl}&returned=stripe`,
    cancelUrl: `${checkoutUrl}&cancelled=stripe`
  };
}
