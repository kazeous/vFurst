import { bulkGenerateVouchers, createVoucher } from "@/actions/voucher-actions";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma, type CurrencyCode } from "@vfurst/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

function discountLabel(voucher: { discountType: "PERCENT" | "AMOUNT"; discountValue: number; restrictions: unknown }, currency: CurrencyCode) {
  const value = voucher.discountType === "PERCENT" ? `${voucher.discountValue}%` : formatCurrency(voucher.discountValue, currency);
  const restrictions =
    voucher.restrictions && typeof voucher.restrictions === "object" && "compedRegistration" in voucher.restrictions
      ? (voucher.restrictions as { compedRegistration?: boolean })
      : null;

  return restrictions?.compedRegistration ? "Comped registration" : value;
}

export default async function VouchersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      registrationTypes: {
        orderBy: {
          sortOrder: "asc"
        }
      },
      vouchers: {
        include: {
          orders: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Discounts</p>
          <h1>Vouchers</h1>
        </div>
      </header>

      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Create voucher</h2>
          <form action={createVoucher} className="vf-form">
            <input type="hidden" name="orgId" value={event.orgId} />
            <input type="hidden" name="eventId" value={event.id} />
            <label>
              Code
              <input name="code" required placeholder="EARLYBIRD" />
            </label>
            <label>
              Discount type
              <select name="discountType" defaultValue="PERCENT">
                <option value="PERCENT">Percentage</option>
                <option value="AMOUNT">Flat amount</option>
                <option value="COMP">Comped registration</option>
              </select>
            </label>
            <label>
              Discount value
              <input name="discountValue" type="number" min="0" step="0.01" defaultValue="10" />
            </label>
            <div className="vf-subform-row">
              <label>
                Max uses
                <input name="maxUses" type="number" min="1" />
              </label>
              <label>
                Expires
                <input name="expiresAt" type="date" />
              </label>
            </div>
            <div className="vf-stack">
              <p className="vf-label">Tier restrictions</p>
              {event.registrationTypes.map((type) => (
                <label key={type.id} className="vf-check">
                  <input name="tierId" type="checkbox" value={type.id} />
                  {type.name}
                </label>
              ))}
            </div>
            <Button label="Create voucher" type="submit" variant="primary" />
          </form>
        </div>

        <div className="vf-section">
          <h2>Bulk generate</h2>
          <form action={bulkGenerateVouchers} className="vf-form">
            <input type="hidden" name="orgId" value={event.orgId} />
            <input type="hidden" name="eventId" value={event.id} />
            <label>
              Prefix
              <input name="prefix" required placeholder="STAFF" />
            </label>
            <label>
              Quantity
              <input name="count" type="number" min="1" max="500" defaultValue="10" required />
            </label>
            <label>
              Discount type
              <select name="discountType" defaultValue="COMP">
                <option value="PERCENT">Percentage</option>
                <option value="AMOUNT">Flat amount</option>
                <option value="COMP">Comped registration</option>
              </select>
            </label>
            <label>
              Discount value
              <input name="discountValue" type="number" min="0" step="0.01" defaultValue="100" />
            </label>
            <label>
              Max uses
              <input name="maxUses" type="number" min="1" defaultValue="1" />
            </label>
            <Button label="Generate codes" type="submit" />
          </form>
        </div>
      </section>

      <section className="vf-section">
        <h2>Usage tracking</h2>
        <div className="vf-table">
          <div className="vf-table-head">
            <span>Code</span>
            <span>Discount</span>
            <span>Uses</span>
            <span>Status</span>
          </div>
          {event.vouchers.map((voucher) => {
            const expired = voucher.expiresAt != null && voucher.expiresAt < new Date();
            const maxed = voucher.maxUses != null && voucher.usedCount >= voucher.maxUses;

            return (
              <div key={voucher.id} className="vf-table-row">
                <strong>{voucher.code}</strong>
                <span>{discountLabel(voucher, event.currency)}</span>
                <span>
                  {voucher.usedCount} / {voucher.maxUses ?? "unlimited"}
                </span>
                <Badge label={expired ? "Expired" : maxed ? "Used" : "Active"} variant={expired || maxed ? "warning" : "success"} />
              </div>
            );
          })}
          {event.vouchers.length === 0 ? <p className="vf-empty">No vouchers yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
