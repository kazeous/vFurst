"use client";

import { useMemo, useState } from "react";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

function fee(value: number, unitFee: number) {
  return value * unitFee;
}

export function PricingCalculator() {
  const [attendees, setAttendees] = useState(800);
  const [hotelRooms, setHotelRooms] = useState(120);
  const [storeRevenue, setStoreRevenue] = useState(45_000);
  const [vendorRevenue, setVendorRevenue] = useState(20_000);
  const totals = useMemo(() => {
    const attendeeFees = fee(attendees, 1);
    const hotelFees = fee(hotelRooms, 1);
    const transactionFees = Math.ceil((storeRevenue + vendorRevenue) * 0.01);

    return {
      attendeeFees,
      hotelFees,
      transactionFees,
      total: attendeeFees + hotelFees + transactionFees
    };
  }, [attendees, hotelRooms, storeRevenue, vendorRevenue]);

  return (
    <section className="vf-marketing-calculator" aria-labelledby="pricing-calculator-title">
      <div>
        <p className="vf-label">Fee calculator</p>
        <h2 id="pricing-calculator-title">Estimate platform fees</h2>
        <p>
          vFurst charges predictable usage fees: one dollar per attendee, one dollar per hotel room, and one percent on store
          or vendor transactions.
        </p>
      </div>
      <div className="vf-marketing-slider-grid">
        <label>
          Attendees
          <input type="range" min="0" max="5000" step="50" value={attendees} onChange={(event) => setAttendees(Number(event.target.value))} />
          <strong>{attendees.toLocaleString()}</strong>
        </label>
        <label>
          Hotel rooms
          <input type="range" min="0" max="1000" step="10" value={hotelRooms} onChange={(event) => setHotelRooms(Number(event.target.value))} />
          <strong>{hotelRooms.toLocaleString()}</strong>
        </label>
        <label>
          Store revenue
          <input
            type="range"
            min="0"
            max="250000"
            step="1000"
            value={storeRevenue}
            onChange={(event) => setStoreRevenue(Number(event.target.value))}
          />
          <strong>{currency.format(storeRevenue)}</strong>
        </label>
        <label>
          Vendor revenue
          <input
            type="range"
            min="0"
            max="250000"
            step="1000"
            value={vendorRevenue}
            onChange={(event) => setVendorRevenue(Number(event.target.value))}
          />
          <strong>{currency.format(vendorRevenue)}</strong>
        </label>
      </div>
      <dl className="vf-marketing-fee-summary">
        <div>
          <dt>Attendee fees</dt>
          <dd>{currency.format(totals.attendeeFees)}</dd>
        </div>
        <div>
          <dt>Hotel fees</dt>
          <dd>{currency.format(totals.hotelFees)}</dd>
        </div>
        <div>
          <dt>Store and vendor fees</dt>
          <dd>{currency.format(totals.transactionFees)}</dd>
        </div>
        <div>
          <dt>Estimated total</dt>
          <dd>{currency.format(totals.total)}</dd>
        </div>
      </dl>
    </section>
  );
}
