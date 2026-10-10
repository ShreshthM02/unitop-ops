// Cost Sheet pricing maths, as pure functions.
//
// This used to live inside the CostSheet component. It is separate now so
// the on-screen sheet, the PDF and the Excel workbook all price from the
// exact same code, and so it can be tested (and compared against the Excel
// formulas) without rendering anything.
//
// Rounding is deliberate and must not change: the intermediate per-pax
// figures are rounded only for DISPLAY, while subtotal / tax / markup run on
// the unrounded values, exactly as the app has always done.

const n = (v) => parseFloat(v) || 0;

export function computeTotals({ days = [], localHandlers = [], monuments = [], monExtra = "" }) {
  const totMeal = days.reduce((s, d) => s + n(d.mealCost), 0);
  const totHotel = days.reduce((s, d) => s + n(d.hotelNetPP), 0);
  const daySS = days.reduce((s, d) => s + n(d.singleSupp), 0);
  const handlerSS = localHandlers.reduce((s, h) => s + n(h.singleSupp), 0);
  const totSS = daySS + handlerSS;
  const monTotal = monuments.filter((m) => m.include).reduce((s, m) => s + n(m.fee), 0) + n(monExtra);
  return { totMeal, totHotel, daySS, handlerSS, totSS, monTotal };
}

export function makeCalculators(s) {
  const {
    transports = [], tlMode, tlCost, miscMode, miscCost, monMode, localHandlers = [], extras = [],
    gst, markup, roe,
  } = s;
  const { totMeal, totHotel, totSS, monTotal } = s.totals || computeTotals(s);

  const calcSlab = (slab) => {
    const tptTotal = transports.filter((t) => (t.slabs || []).includes(slab.id)).reduce((a, t) => a + n(t.cost), 0);
    const tptPP = slab.foc > 0 ? tptTotal / slab.foc : 0;
    const tlPP = tlMode === "pp" ? n(tlCost) : (slab.foc > 0 ? n(tlCost) / slab.foc : 0);
    const miscPP = miscMode === "pp" ? n(miscCost) : (slab.foc > 0 ? n(miscCost) / slab.foc : 0);
    const monPP = monMode === "pp" ? monTotal : (slab.foc > 0 ? monTotal / slab.foc : 0);
    const localPP = localHandlers.reduce((a, h) => a + (h.mode === "pp" ? n(h.cost) : (slab.foc > 0 ? n(h.cost) / slab.foc : 0)), 0);
    // "PP" is already per-pax; Lumpsum / Per Vehicle / Per Group are one total
    // for the group, divided across the paying pax like local handler lumpsums.
    const extrasPP = extras.reduce((a, e) => a + (e.mode === "PP" ? n(e.cost) : (slab.foc > 0 ? n(e.cost) / slab.foc : 0)), 0);

    const sub = totHotel + totMeal + tptPP + tlPP + miscPP + monPP + localPP + extrasPP;
    const tax = Math.round(sub * gst / 100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup / 100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = Math.ceil(sellingINR / roe);
    const ssFX = Math.ceil(((totSS + totSS * gst / 100) * (1 + markup / 100)) / roe);
    return {
      tptTotal, tptPP: Math.round(tptPP), tlPP: Math.round(tlPP), miscPP: Math.round(miscPP), monPP: Math.round(monPP),
      localPP: Math.round(localPP), extrasPP: Math.round(extrasPP), sub: Math.round(sub), tax, afterTax: Math.round(afterTax),
      markupAmt, sellingINR: Math.round(sellingINR), finalFX, ssFX,
    };
  };

  // A Tour Leader slab is a normal slab (its own paying pax as the divisor)
  // plus the T/L surcharge: the foreign agent's own escort has no FOC cover
  // in a small group, so their costs are spread over the paying guests.
  const calcTlSlab = (tl) => {
    const base = calcSlab({ id: tl.id, foc: n(tl.pax) });
    const surchargeTotal = Object.entries(tl.costs || {}).reduce((a, [k, v]) => a + ((tl.includes || {})[k] ? n(v) : 0), 0);
    const surchargePP = n(tl.pax) > 0 ? surchargeTotal / n(tl.pax) : 0;
    const sub = base.sub + surchargePP;
    const tax = Math.round(sub * gst / 100);
    const afterTax = sub + tax;
    const markupAmt = Math.round(afterTax * markup / 100);
    const sellingINR = afterTax + markupAmt;
    const finalFX = Math.ceil(sellingINR / roe);
    return { ...base, surchargeTotal: Math.round(surchargeTotal), surchargePP: Math.round(surchargePP), sub: Math.round(sub), tax, afterTax: Math.round(afterTax), markupAmt, sellingINR: Math.round(sellingINR), finalFX };
  };

  return { calcSlab, calcTlSlab };
}
