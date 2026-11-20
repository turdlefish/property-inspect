// The sums behind the Budget tab (no screen code here, so they can be checked on their own).
// All figures are estimates for NSW first home buyers.

// NSW transfer (stamp) duty, general rates for 2025–26 (Revenue NSW).
export function dutyFull(v) {
  if (v <= 17000) return Math.max(20, v * 0.0125);
  if (v <= 36000) return 212 + (v - 17000) * 0.015;
  if (v <= 97000) return 497 + (v - 36000) * 0.0175;
  if (v <= 364000) return 1564 + (v - 97000) * 0.035;
  if (v <= 1212000) return 10909 + (v - 364000) * 0.045;
  return 49069 + (v - 1212000) * 0.055;
}
// First Home Buyers Assistance Scheme: no duty up to $800k; a concession up to $1m
// (approximated here as a straight line from $0 at $800k to full duty at $1m).
export function dutyNSW(v, firstHome) {
  if (!firstHome) return dutyFull(v);
  if (v <= 800000) return 0;
  if (v < 1000000) return dutyFull(v) * (v - 800000) / 200000;
  return dutyFull(v);
}
export const MORTGAGE_REG = 165.40;   // NSW Land Registry fee, 2025–26
export const TRANSFER_REG = 165.40;

/** Monthly principal-and-interest repayment. */
export function repayment(loan, ratePct, years = 30) {
  const r = ratePct / 100 / 12, n = years * 12;
  if (loan <= 0) return 0;
  return r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
}

/** Rough lenders mortgage insurance when the deposit is under 20% (none with the Home Guarantee). */
export function lmi(loan, price, homeGuarantee) {
  const lvr = loan / price;
  if (homeGuarantee || lvr <= 0.8) return 0;
  return loan * (lvr > 0.9 ? 0.035 : lvr > 0.85 ? 0.02 : 0.01);
}

/**
 * The loan month by month with an offset account. Interest is charged only on
 * (loan − offset); the repayment stays the same, so the extra goes off the
 * loan and it's paid off sooner.
 * opts: { loan, ratePct, years, start (offset balance), monthly (added to the offset each month),
 *         extra (paid on top of the minimum repayment each month) }
 * Also used without an offset (start 0, monthly 0) to see what extra repayments do.
 */
export function withOffset({ loan, ratePct, years = 30, start = 0, monthly = 0, extra = 0 }) {
  const r = ratePct / 100 / 12;
  const pay = repayment(loan, ratePct, years);
  let bal = loan, off = start, months = 0, interest = 0, firstInterest = null;
  while (bal > 0.005 && months < years * 12 + 1) {
    const i = Math.max(0, bal - off) * r;
    if (firstInterest === null) firstInterest = i;
    interest += i;
    bal = bal + i - pay - extra;
    off += monthly;
    months++;
  }
  const plainInterest = pay * years * 12 - loan;
  return { pay, months, interest, firstInterest: firstInterest || 0, saved: Math.max(0, plainInterest - interest), plainInterest, monthsSaved: years * 12 - months };
}

/** Whole months from now until a 'YYYY-MM' (or 'YYYY-MM-DD') date, at least 1. */
export function monthsUntil(due, now = new Date()) {
  const [y, mo] = String(due).split('-').map(Number);
  return Math.max(1, (y * 12 + mo) - (now.getFullYear() * 12 + now.getMonth() + 1));
}
const monthName = due => { const [y, mo] = String(due).split('-').map(Number); return new Date(y, mo - 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }); };

/**
 * Everything the Budget tab shows, from its inputs:
 *   price, dep (%), rate (%), fhb, hg, dutyOverride, lmiOverride, mortReg, transReg (registration fees),
 *   buying costs: conv, insp, homeIns (first year's home & contents insurance), settleRates (council & water due at settlement),
 *   moving: [{ name, amount }] (removalists, end of lease clean, break lease fee…), bondBack (rental bond refund, taken off),
 *   income, exp (a month), councilQ, waterQ, strataQ, specialQ (a quarter), specialOnce (one-off, paid upfront),
 *   yearly: [{ name, amount, have (saved so far), due? 'YYYY-MM' }] (what's still to save is spread over the
 *     months until `due`, or over 12 months),
 *   saveMode 'share' | 'amount', save (% of what's left) or saveAmt ($ a month),
 *   offset, offStart, offSavings, offFee (a year).
 */
export function work(m, now = new Date()) {
  const q = n => (n || 0) / 3;                                    // per quarter → a month
  const yearly = (m.yearly || []).filter(x => x.amount > 0);
  const costs = [                                                 // what comes out each month besides the loan
    { key: 'council', name: 'Council rates', each: m.councilQ, per: 'a quarter', month: q(m.councilQ) },
    { key: 'water', name: 'Water rates', each: m.waterQ, per: 'a quarter', month: q(m.waterQ) },
    { key: 'strata', name: 'Strata levies', each: m.strataQ, per: 'a quarter', month: q(m.strataQ) },
    { key: 'special', name: 'Special levy', each: m.specialQ, per: 'a quarter', month: q(m.specialQ) },
    // only what's still to save: the amount less what you've already put away
    ...yearly.map(x => ({ x, rest: Math.max(0, x.amount - (x.have || 0)) })).map(({ x, rest }) => x.due
      ? { key: 'y', name: x.name, each: x.amount, have: x.have || 0, per: `by ${monthName(x.due)}`, month: rest / monthsUntil(x.due, now), months: monthsUntil(x.due, now) }
      : { key: 'y', name: x.name, each: x.amount, have: x.have || 0, per: 'a year', month: rest / 12 }),
    ...(m.offset && m.offFee ? [{ key: 'fee', name: 'Offset package fee', each: m.offFee, per: 'a year', month: m.offFee / 12 }] : []),
  ].filter(c => c.month > 0);
  const monthlyCosts = costs.reduce((a, c) => a + c.month, 0);
  const ratesMonthly = costs.filter(c => ['council', 'water', 'strata', 'special'].includes(c.key)).reduce((a, c) => a + c.month, 0);
  const setAside = monthlyCosts - ratesMonthly;   // yearly bills (and the offset fee) saved up for

  // The deposit is set either as a dollar amount (kept when you switch property) or as a percentage.
  const deposit = m.depMode === 'amt' ? Math.min(m.depAmt || 0, m.price) : m.price * m.dep / 100;
  const depPct = m.price ? deposit / m.price * 100 : 0;
  const loan = Math.max(0, m.price - deposit);
  const dutyCalc = dutyNSW(m.price, m.fhb);
  const duty = m.dutyOverride != null ? m.dutyOverride : dutyCalc;   // your own figure wins
  const mortReg = m.mortReg ?? MORTGAGE_REG, transReg = m.transReg ?? TRANSFER_REG;
  const buyingTotal = (m.conv || 0) + (m.insp || 0) + (m.homeIns || 0) + (m.settleRates || 0);
  const movingTotal = (m.moving || []).reduce((a, x) => a + (x.amount || 0), 0) - (m.bondBack || 0);   // the bond coming back reduces it
  const upfront = deposit + duty + mortReg + transReg + buyingTotal + (m.specialOnce || 0) + movingTotal;
  const pay = repayment(loan, m.rate);                     // the bank's minimum
  const extra = Math.max(0, m.extra || 0);                 // optional extra repayments, a month
  const payTotal = pay + extra;                            // what actually goes to the loan each month
  const left = m.income - m.exp - payTotal - monthlyCosts;
  // savings: a share of what's left, or a set amount (which can be more than what's left)
  const toSavings = m.saveMode === 'amount' ? (m.saveAmt || 0) : Math.max(0, left) * (m.save || 0) / 100;
  const toSpend = left - toSavings;
  const rows = [];
  for (let k = 0; k <= 8; k++) {
    const d = k * 0.25, p = repayment(loan, m.rate + d);
    const l = m.income - m.exp - p - extra - monthlyCosts;
    rows.push({ d, rate: m.rate + d, pay: p + extra, extra: p - pay, left: l, spend: l - (m.saveMode === 'amount' ? (m.saveAmt || 0) : Math.max(0, l) * (m.save || 0) / 100) });
  }
  const off = m.offset
    ? withOffset({ loan, ratePct: m.rate, start: m.offStart, monthly: m.offSavings ? Math.max(0, toSavings) : 0, extra })
    : null;
  // Extra repayments on their own (no offset): how much sooner and how much interest saved.
  const ext = extra > 0 ? withOffset({ loan, ratePct: m.rate, extra }) : null;
  const lmiCalc = lmi(loan, m.price, m.hg);
  // Can we afford the set-asides? What's free after the loan, living costs and rates, before setting aside or saving.
  const free = m.income - m.exp - payTotal - ratesMonthly;
  const viable = !m.income ? 'unknown' : setAside > free ? 'no' : setAside + Math.max(0, toSavings) > free ? 'tight' : 'yes';
  return { deposit, depPct, loan, lvr: m.price ? loan / m.price : 0, duty, dutyCalc, mortReg, transReg, buyingTotal, movingTotal, upfront, lmi: m.lmiOverride ?? lmiCalc, lmiCalc, pay, extra, payTotal, ext, ratesMonthly, setAside, free, viable, costs, monthlyCosts, left, toSavings, toSpend, rows, off };
}
