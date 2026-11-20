// The Budget tab. A summary at the top (the three numbers that matter, whether the
// budget works, and a chart of where the pay goes), then three sections:
//   Monthly   – pay and expenses, rates and levies, set-asides, savings, the month's breakdown
//   Upfront   – the cash needed to buy and move, every line editable
//   Loan      – price, deposit and rate, the offset account, and what rate rises cost
// The inputs are shared by the two of you (fields m_* in the "settings" document);
// the sums are in moneycalc.js.

import * as store from './store.js';
import { allProperties, getProperty } from './props.js';
import { setSetting } from './people.js';
import { work, dutyNSW, monthsUntil, MORTGAGE_REG, TRANSFER_REG } from './moneycalc.js';
import { editField } from './edit.js';
import { esc, money, openSheet, closeSheet, toast } from './ui.js';

// Rates and levies are per quarter, as they're billed (used when you type a price in rather than pick a property).
const DEFAULTS = {
  price: 800000, dep: 10, depMode: 'pct', depAmt: 0, rate: 5.89, fhb: true, hg: false, conv: 2200, insp: 650,
  homeIns: 0, settleRates: 0, bondBack: 0,
  mortReg: null, transReg: null, lmiOverride: null,   // your own figures for upfront lines (null = the app's)
  income: 0, exp: 0, councilQ: 0, waterQ: 0, strataQ: 0, specialQ: 0, specialOnce: 0,
  saveMode: 'amount', save: 50, saveAmt: 0,
  offset: false, offStart: 20000, offSavings: true, offFee: 0,
  extra: 0,   // optional extra repayments on top of the minimum, a month
};
// Things to save up for; amounts start empty so nothing is counted until you fill them in.
const YEARLY = [{ name: 'Car rego', amount: 0, due: '' }, { name: 'Car insurance', amount: 0, due: '' }, { name: 'Car service', amount: 0, due: '' }, { name: 'Tax to set aside', amount: 0, due: '' }];
const MOVING = ['Removalists', 'Packing boxes & supplies', 'End of lease clean', 'Break lease fee', 'Electricity & gas connection', 'Internet connection', 'Mail redirection'].map(name => ({ name, amount: 0 }));
export const moneyState = { pid: null, editBudget: false, tab: 'monthly' };   // this phone only

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const yrs = n => { const y = Math.floor(n / 12), mo = n % 12; return `${y} yr${y === 1 ? '' : 's'}${mo ? ` ${mo} mth${mo === 1 ? '' : 's'}` : ''}`; };
const neg = n => (n < 0 ? 'neg' : '');
const fixed = (label, v, note = '') => `<div class="field"><label>${label}</label><div class="input num" style="background:var(--surface-2)">${v}</div>${note ? `<span class="small muted">${note}</span>` : ''}</div>`;
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

function inputs() {
  const v = store.values('settings'), m = {};
  for (const [k, d] of Object.entries(DEFAULTS)) m[k] = v['m_' + k] ?? d;
  // Before Nov 2026 the savings were always a share, and costs were one quarterly total.
  if (v.m_saveMode == null && v.m_save != null) m.saveMode = 'share';
  if (v.m_strataQ == null && v.m_councilQ == null && v.m_runningQ) m.strataQ = v.m_runningQ;
  m.yearly = v.m_yearly || YEARLY;
  // The lease clean and break fee had their own boxes before the moving list.
  m.moving = v.m_moving || MOVING.map(x => ({ ...x, amount: x.name === 'End of lease clean' ? (v.m_leaseClean || 0) : x.name === 'Break lease fee' ? (v.m_breakLease || 0) : 0 }));
  m.dutySaved = v.m_duty || null;   // { price, amount, why } for a typed-in price
  return m;
}

export function renderMoney(view, topbar) {
  topbar.set('Budget');
  const m = inputs();
  const props = allProperties().filter(p => p.list !== 'sold' && p.priceNum);
  if (moneyState.pid && !getProperty(moneyState.pid)) moneyState.pid = null;
  const p = moneyState.pid ? getProperty(moneyState.pid) : null;
  const tab = moneyState.tab;
  const inp = (id, label, val, { step = 1, suf = '', hint = '', ph = '' } = {}) => `<div class="field"><label for="m-${id}">${label}${suf ? ` <span class="muted">(${suf})</span>` : ''}</label><input class="input num" id="m-${id}" data-m="${id}" type="number" inputmode="decimal" step="${step}" value="${val === 0 && ph ? '' : val}" placeholder="${ph}">${hint ? `<span class="small muted">${hint}</span>` : ''}</div>`;

  view.innerHTML = `
  <div class="card glance">
    <select class="input" id="m-pid" aria-label="Property"><option value="">A price I type in (${money(m.price)})</option>${props.map(x => `<option value="${x.id}" ${p && p.id === x.id ? 'selected' : ''}>${esc(x.address)}${x.suburb ? ', ' + esc(x.suburb.split(' NSW')[0]) : ''} · ${money(x.priceNum)}</option>`).join('')}</select>
    <div id="glance"></div>
  </div>

  <div class="seg tabs3" role="tablist" aria-label="Money sections">${[['monthly', 'Monthly'], ['upfront', 'Upfront'], ['loan', 'Loan & offset']].map(([k, t]) => `<button role="tab" data-mtab="${k}" aria-selected="${tab === k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>

  ${tab === 'monthly' ? `
  <div class="card"><div class="sec-head"><h3>Pay & living costs</h3>${m.income && !moneyState.editBudget ? '<button class="edit" data-editbudget>✎ Change</button>' : ''}</div>
    ${m.income && !moneyState.editBudget
      ? `<div class="sum"><div class="r"><span>Take-home pay, both of us</span><span>${money(m.income)} a month</span></div><div class="r"><span>Living expenses</span><span>${money(m.exp)} a month</span></div></div>`
      : `<div class="grid2">${inp('income', 'Take-home pay', m.income, { step: 100, suf: 'a month, both', ph: 'e.g. 13500' })}${inp('exp', 'Living expenses', m.exp, { step: 100, suf: 'a month', ph: 'e.g. 4800' })}</div>
         <p class="small muted" style="margin:0">Enter these once. They’re saved for both of you and used for every property.</p>
         ${moneyState.editBudget ? '<button class="btn sm primary" data-donebudget style="align-self:flex-start">Done</button>' : ''}`}</div>

  <div class="card"><div class="sec-head"><h3>Rates & levies</h3><span class="muted small">a quarter</span></div>
    ${p ? `<div class="sum">${[['Council rates', p.councilQ], ['Water rates', p.waterQ], ['Strata levies', p.levyQ], ['Special levy, ongoing', p.specialQ]].map(([l, v]) => `<div class="r"><span>${l}</span><span>${money(v || 0)}</span></div>`).join('')}</div>
          <p class="small muted" style="margin:0">From this property. <button class="edit" data-openprop>Change them on its page ›</button></p>`
      : `<div class="grid2">${inp('councilQ', 'Council rates', m.councilQ, { step: 10, ph: 'e.g. 420' })}${inp('waterQ', 'Water rates', m.waterQ, { step: 10, ph: 'e.g. 180' })}${inp('strataQ', 'Strata levies', m.strataQ, { step: 10, ph: 'e.g. 1350' })}${inp('specialQ', 'Special levy, ongoing', m.specialQ, { step: 10, ph: '0' })}</div>`}</div>

  <div class="card"><div class="sec-head"><h3>Set aside for bills</h3><b class="num" id="yearTotal"></b></div>
    <div id="viable"></div>
    <div class="yearly">${m.yearly.map((x, i) => `<div class="yrow">
      <input class="input yname" data-yname="${i}" value="${esc(x.name)}" aria-label="What it’s for">
      <div class="yline4">
        <label class="ydue"><span class="small muted">Amount</span><input class="input num" data-yamt="${i}" type="number" inputmode="decimal" step="10" value="${x.amount || ''}" placeholder="$" aria-label="${esc(x.name)} amount"></label>
        <label class="ydue"><span class="small muted">Saved so far</span><input class="input num" data-yhave="${i}" type="number" inputmode="decimal" step="10" value="${x.have || ''}" placeholder="$0" aria-label="${esc(x.name)} saved so far"></label>
        <label class="ydue"><span class="small muted">Save by</span><input class="input" data-ydue="${i}" type="month" value="${esc(x.due || '')}" aria-label="Save ${esc(x.name)} by"></label>
        <button class="edit" data-ydel="${i}" aria-label="Remove ${esc(x.name)}">✕</button></div>
      ${x.amount ? billLine(x) : ''}</div>`).join('')}</div>
    <button class="btn sm" data-yadd style="align-self:flex-start">＋ Add a bill (e.g. a second car)</button></div>

  <div class="card"><h3>Savings</h3>
    <div class="seg" role="radiogroup" aria-label="How we save">${[['amount', 'A set amount'], ['share', 'A share of what’s left']].map(([k, t]) => `<button data-savemode="${k}" aria-pressed="${m.saveMode === k}">${t}</button>`).join('')}</div>
    ${m.saveMode === 'amount'
      ? inp('saveAmt', 'Put into savings', m.saveAmt, { step: 50, suf: 'a month', ph: 'e.g. 1500' })
      : `<div class="field"><label for="m-save">Share of what’s left: <b id="saveLbl">${m.save}%</b></label><input type="range" class="range" id="m-save" min="0" max="100" step="5" value="${m.save}"></div>`}</div>

  <div id="monthOut"></div>` : ''}

  ${tab === 'upfront' ? `
  <div id="upOut"></div>
  <details class="card fold" ${m.moving.some(x => x.amount) ? '' : 'open'}><summary><h3>Moving costs list</h3><span class="muted small">add, rename or remove</span></summary>
    <div class="yearly">${m.moving.map((x, i) => `<div class="mrow"><input class="input" data-mname="${i}" value="${esc(x.name)}" aria-label="What it’s for"><input class="input num" data-mamt="${i}" type="number" inputmode="decimal" step="10" value="${x.amount || ''}" placeholder="$" aria-label="${esc(x.name)} amount"><button class="edit" data-mdel="${i}" aria-label="Remove ${esc(x.name)}">✕</button></div>`).join('')}</div>
    <button class="btn sm" data-madd style="align-self:flex-start">＋ Add a moving cost</button></details>` : ''}

  ${tab === 'loan' ? `
  <div class="card"><h3>Price & loan</h3>
    <div class="grid2">
      ${p ? fixed('Purchase price', money(p.priceNum)) : inp('price', 'Purchase price', m.price, { step: 5000 })}
      ${(() => { const price = p ? p.priceNum : m.price; const amt = m.depMode === 'amt' ? Math.min(m.depAmt, price) : Math.round(price * m.dep / 100); const pct = price ? amt / price * 100 : 0;
        return `<div class="field"><label for="m-depAmt">Deposit <span class="muted">($)</span></label><input class="input num" id="m-depAmt" data-dep="amt" type="number" inputmode="decimal" step="1000" value="${Math.round(amt)}"></div>
        <div class="field"><label for="m-depPct">Deposit <span class="muted">(% of the price)</span></label><input class="input num" id="m-depPct" data-dep="pct" type="number" inputmode="decimal" step="0.5" value="${+pct.toFixed(2)}"><span class="small muted">${m.depMode === 'amt' ? 'Set as an amount: stays the same for every property.' : 'Set as a percentage: the amount follows the price.'}</span></div>`; })()}
      ${inp('rate', 'Interest rate', m.rate, { step: 0.01, suf: '% a year' })}
      ${fixed('Loan term', '30 years')}</div>
    <label class="toggle"><input type="checkbox" id="m-fhb" ${m.fhb ? 'checked' : ''}> First home buyers (NSW stamp duty exemption up to $800k, concession to $1m)</label>
    <label class="toggle"><input type="checkbox" id="m-hg" ${m.hg ? 'checked' : ''}> Using the 5% Home Guarantee (no lenders mortgage insurance)</label></div>
  <div class="card"><div class="sec-head"><h3>Extra repayments</h3><span class="muted small">optional</span></div>
    ${inp('extra', 'Extra on top of the minimum', m.extra, { step: 50, suf: 'a month', ph: 'e.g. 500', hint: 'Leave empty for none. Extra repayments come straight off the loan, so you pay less interest and finish sooner. It’s counted in your monthly budget.' })}</div>
  <div class="card"><h3>Offset account</h3>
    <label class="toggle"><input type="checkbox" id="m-offset" ${m.offset ? 'checked' : ''}> Use an offset account</label>
    <p class="small muted" style="margin:0">Money in an offset account is taken off the loan when interest is worked out. Your repayment stays the same, so more of it pays off the loan and you finish sooner.</p>
    ${m.offset ? `<div class="grid2">${inp('offStart', 'In the offset at the start', m.offStart, { step: 1000, hint: 'Savings left after the deposit and costs.' })}${inp('offFee', 'Package fee', m.offFee, { step: 50, suf: 'a year', hint: 'Often $0–$400.' })}</div>
      <label class="toggle"><input type="checkbox" id="m-offSavings" ${m.offSavings ? 'checked' : ''}> Put our monthly savings into the offset</label>` : ''}</div>
  <div id="loanOut"></div>` : ''}

  <p class="small muted">Estimates only, not financial advice. Stamp duty uses Revenue NSW’s 2025–26 rates; the first home buyer concession between $800k and $1m is approximated. Check with your lender, a broker or <a href="https://www.revenue.nsw.gov.au/" target="_blank" rel="noopener">Revenue NSW ↗</a> before you commit.</p>`;

  const $ = s => view.querySelector(s);
  const calc = () => {
    const cur = readForm(view, m);
    if (p) Object.assign(cur, { price: p.priceNum, councilQ: p.councilQ || 0, waterQ: p.waterQ || 0, strataQ: p.levyQ || 0, specialQ: p.specialQ || 0, specialOnce: p.specialOnce || 0 });
    // Your own stamp duty figure: on the property, or for this typed-in price.
    cur.dutyOverride = p ? (p.duty ?? null) : (m.dutySaved && m.dutySaved.price === cur.price ? m.dutySaved.amount : null);
    cur.dutyWhy = p ? p.rec.duty?.why : m.dutySaved?.why;
    const r = work(cur);
    $('#glance').innerHTML = glance(r, cur);
    if ($('#monthOut')) { $('#monthOut').innerHTML = monthly(r, cur); $('#viable').innerHTML = viability(r, cur); const tot = cur.yearly.reduce((a, x) => a + (x.amount || 0), 0), have = cur.yearly.reduce((a, x) => a + Math.min(x.have || 0, x.amount || 0), 0); $('#yearTotal').textContent = tot ? `${money(have)} of ${money(tot)} saved` : ''; }
    if ($('#upOut')) $('#upOut').innerHTML = upfront(r, cur);
    if ($('#loanOut')) $('#loanOut').innerHTML = loan(r, cur);
  };
  calc();
  const again = () => { const st = view.scrollTop; renderMoney(view, topbar); view.scrollTop = st; };
  const saveYearly = list => setSetting('m_yearly', list);
  const saveMoving = list => setSetting('m_moving', list);

  view.onclick = e => {
    const t = e.target.closest('[data-mtab],[data-editbudget],[data-donebudget],[data-dutyedit],[data-savemode],[data-yadd],[data-ydel],[data-openprop],[data-madd],[data-mdel],[data-up],[data-goto]');
    if (!t) return;
    const d = t.dataset;
    if (d.mtab) { moneyState.tab = d.mtab; return renderMoney(view, topbar); }
    if (d.goto) { moneyState.tab = d.goto; renderMoney(view, topbar); return; }
    if (t.hasAttribute('data-editbudget')) { moneyState.editBudget = true; again(); $('#m-income')?.focus(); return; }
    if (t.hasAttribute('data-donebudget')) { moneyState.editBudget = false; return again(); }
    if (d.savemode) { setSetting('m_saveMode', d.savemode); return again(); }
    if (t.hasAttribute('data-yadd')) { saveYearly([...readYearly(view, m), { name: 'Car rego (second car)', amount: 0, due: '' }]); again(); view.querySelector('.yrow:last-child input')?.select(); return; }
    if (d.ydel) { saveYearly(readYearly(view, m).filter((_, i) => i !== Number(d.ydel))); return again(); }
    if (t.hasAttribute('data-madd')) { saveMoving([...readMoving(view, m), { name: 'New moving cost', amount: 0 }]); again(); view.querySelector('.mrow:last-child input')?.select(); return; }
    if (d.mdel) { saveMoving(readMoving(view, m).filter((_, i) => i !== Number(d.mdel))); return again(); }
    if (t.hasAttribute('data-openprop') && p) { location.hash = 'prop-' + p.id; return; }
    if (d.up) return upfrontEdit(d.up, d.i, readForm(view, m), p, again);
    if (t.hasAttribute('data-dutyedit')) {
      const cur = readForm(view, m);
      if (p) return editField(p.id, 'duty', again);
      return dutySheet(cur.price, dutyNSW(cur.price, cur.fhb), m.dutySaved && m.dutySaved.price === cur.price ? m.dutySaved : null, again);
    }
  };
  view.oninput = e => {
    if (e.target.id === 'm-save') $('#saveLbl').textContent = e.target.value + '%';
    // deposit: typing either box fills in the other
    if (e.target.dataset.dep) {
      const price = p ? p.priceNum : (parseFloat($('#m-price')?.value) || m.price);
      const n = parseFloat(e.target.value) || 0;
      if (e.target.dataset.dep === 'amt') $('#m-depPct').value = price ? +(n / price * 100).toFixed(2) : 0;
      else $('#m-depAmt').value = Math.round(price * n / 100);
      return calc();
    }
    if (e.target.id === 'm-price' && $('#m-depAmt')) {   // a new price moves whichever deposit box isn't fixed
      const price = parseFloat(e.target.value) || 0;
      if (m.depMode === 'amt') $('#m-depPct').value = price ? +(parseFloat($('#m-depAmt').value) / price * 100).toFixed(2) : 0;
      else $('#m-depAmt').value = Math.round(price * parseFloat($('#m-depPct').value) / 100);
    }
    if (e.target.dataset.m || e.target.id === 'm-save' || e.target.dataset.yamt || e.target.dataset.yhave || e.target.dataset.mamt) calc();
  };
  // Saved (and shared with your partner) when you finish changing a value, not on every keystroke.
  view.onchange = e => {
    const t = e.target;
    if (t.id === 'm-pid') { moneyState.pid = t.value || null; return renderMoney(view, topbar); }
    if (t.type === 'checkbox') { setSetting('m_' + t.id.slice(2), t.checked); return again(); }
    if (t.dataset.yname != null || t.dataset.yamt != null || t.dataset.yhave != null || t.dataset.ydue != null) { saveYearly(readYearly(view, m)); return again(); }
    if (t.dataset.mname != null || t.dataset.mamt != null) { saveMoving(readMoving(view, m)); return again(); }
    if (t.dataset.dep) {   // whichever box you typed in becomes the fixed one
      const n = parseFloat(t.value) || 0;
      if (t.dataset.dep === 'amt') { setSetting('m_depMode', 'amt'); setSetting('m_depAmt', n); }
      else { setSetting('m_depMode', 'pct'); setSetting('m_dep', n); }
      return again();
    }
    if (t.dataset.m || t.id === 'm-save') { const n = parseFloat(t.value); setSetting('m_' + (t.dataset.m || 'save'), Number.isFinite(n) ? n : 0); calc(); }
  };
}

// ── The summary at the top ───────────────────────────────────────────────
function glance(r, m) {
  const noBudget = !m.income;
  const status = noBudget ? null
    : r.toSpend < 0 ? ['red', '!', `Short by ${money(-r.toSpend)} a month`, 'Your savings and set-asides are more than what’s left. Lower one of them, or look at a cheaper property.']
    : r.toSpend < m.income * 0.05 ? ['amber', '~', 'Tight', `Only ${money(r.toSpend)} a month left to spend after everything.`]
    : ['green', '✓', 'This works', `${money(r.toSpend)} a month left to spend after the mortgage, bills, set-asides and savings.`];
  return `
    <div class="tiles">
      <div><span class="eyebrow">Repayment</span><span class="num">${money(r.payTotal)}</span><span class="small muted">${r.extra ? `a month, incl. ${money(r.extra)} extra` : 'a month'}</span></div>
      <div><span class="eyebrow">Left to spend</span><span class="num ${noBudget ? '' : neg(r.toSpend)}">${noBudget ? '—' : money(r.toSpend)}</span><span class="small muted">${noBudget ? 'add your pay' : 'a month'}</span></div>
      <button data-goto="upfront"><span class="eyebrow">Cash upfront</span><span class="num">${money(r.upfront)}</span><span class="small muted">to buy and move ›</span></button>
    </div>
    ${status ? `<div class="flag ${status[0]}"><span class="ic">${status[1]}</span><span class="t"><span><b>${status[2]}</b></span><small>${status[3]}</small></span></div>` : '<p class="small muted" style="margin:0">Add your take-home pay in Monthly to see whether the budget works.</p>'}
    ${noBudget ? '' : payChart(r, m)}`;
}

// Where the take-home pay goes each month, as a donut with its figures listed beside it.
function payChart(r, m) {
  const parts = [
    ['Mortgage', r.payTotal, 's1'],
    ['Living expenses', m.exp, 's2'],
    ['Rates & levies', r.ratesMonthly, 's3'],
    ['Set aside for bills', r.setAside, 's4'],
    ['Savings', Math.max(0, r.toSavings), 's5'],
    ['Left to spend', Math.max(0, r.toSpend), 's6'],
  ].filter(x => x[1] > 0.5);
  const total = parts.reduce((a, x) => a + x[1], 0);
  const R = 42, C = 2 * Math.PI * R, gap = 1.2;   // a small gap of surface between segments
  let at = 0;
  const arcs = parts.map(([name, v, s]) => {
    const len = v / total * C;
    const seg = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="var(--${s})" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-at}" transform="rotate(-90 60 60)"><title>${esc(name)}: ${money(v)} (${pct(v, m.income)}% of pay)</title></circle>`;
    at += len;
    return seg;
  }).join('');
  const over = total > m.income + 0.5;
  return `<div class="pay-chart">
    <svg viewBox="0 0 120 120" role="img" aria-label="Where our pay goes each month">${arcs}
      <text x="60" y="56" text-anchor="middle" font-size="9" fill="var(--muted)" font-family="Inter,sans-serif">pay a month</text>
      <text x="60" y="70" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)" font-family="JetBrains Mono,monospace">${money(m.income)}</text></svg>
    <ul class="legend">${parts.map(([name, v, s]) => `<li><i style="background:var(--${s})"></i><span>${esc(name)}</span><b class="num">${money(v)}</b><span class="num muted">${pct(v, m.income)}%</span></li>`).join('')}
      ${over ? `<li class="short"><i></i><span>More than your pay by</span><b class="num">${money(total - m.income)}</b><span></span></li>` : ''}</ul></div>`;
}

// ── Monthly ──────────────────────────────────────────────────────────────
// Progress on one bill, and what's still to put away each month.
function billLine(x) {
  const have = Math.min(x.have || 0, x.amount), rest = x.amount - have;
  const n = x.due ? monthsUntil(x.due) : 12;
  const plan = rest <= 0 ? '<b class="up">Fully saved ✓</b>'
    : x.due ? `${money(rest)} to go: ${money(rest / n)} a month for ${n} month${n === 1 ? '' : 's'}${x.due < thisMonth() ? ' · that month has passed, pick the next one' : ''}`
      : `${money(rest)} to go: ${money(rest / 12)} a month (no date, so spread over a year)`;
  return `<div class="meter"><i style="width:${Math.round(have / x.amount * 100)}%" class="${rest <= 0 ? '' : 'part'}"></i></div>
    <span class="small muted">Saved ${money(have)} of ${money(x.amount)} · ${plan}</span>`;
}
function viability(r, m) {
  if (!m.yearly.some(x => x.amount)) return '<p class="small muted" style="margin:0">Add the bills you save up for: rego, insurance, servicing, a tax bill. Give one a “save by” month to spread it until then.</p>';
  if (!m.income) return `<p class="small" style="margin:0">That’s <b>${money(r.setAside)} a month</b>. Add your pay in “Pay & living costs” to check you can afford it.</p>`;
  const toGo = x => Math.max(0, x.amount - (x.have || 0));
  const soon = m.yearly.filter(x => toGo(x) > 0 && x.due && monthsUntil(x.due) <= 2);
  const head = {
    yes: ['green', '✓', `Yes, you can set this aside: ${money(r.setAside)} a month`, `That’s ${pct(r.setAside, m.income)}% of your pay. After the mortgage, living costs and rates you have ${money(r.free)} a month, so it fits with your savings and leaves ${money(r.toSpend)} to spend.`],
    tight: ['amber', '~', `Only if you save less: ${money(r.setAside)} a month`, `After the mortgage, living costs and rates you have ${money(r.free)} a month. Setting this aside leaves ${money(r.free - r.setAside)}, less than the ${money(r.toSavings)} you want to save.`],
    no: ['red', '!', `Not with this property: ${money(r.setAside)} a month`, `After the mortgage, living costs and rates you only have ${money(r.free)} a month, ${money(r.setAside - r.free)} short before any savings. Push the save-by dates later or lower the amounts.`],
  }[r.viable];
  return `<div class="flag ${head[0]}"><span class="ic">${head[1]}</span><span class="t"><span><b>${head[2]}</b></span><small>${head[3]}</small></span></div>
    ${soon.map(x => `<div class="flag amber"><span class="ic">~</span><span class="t"><span>${esc(x.name)} is due soon</span><small>${money(toGo(x))} still to save in ${monthsUntil(x.due)} month${monthsUntil(x.due) === 1 ? '' : 's'} is ${money(toGo(x) / monthsUntil(x.due))} a month until then.</small></span></div>`).join('')}`;
}

function monthly(r, m) {
  if (!m.income) return '';
  const savingsLabel = m.saveMode === 'amount' ? 'Into savings' : `Into savings (${m.save}% of what’s left)`;
  const group = (title, rows, total) => `<div class="r sub"><span><b>${title}</b></span><span><b>−${money(total)}</b></span></div>${rows}`;
  const line = c => `<div class="r in"><span>${esc(c.name)} <span class="muted small">(${money(c.each)} ${c.per})</span></span><span>−${money(c.month)}</span></div>`;
  return `<div class="card"><h3>The month, line by line</h3><div class="sum">
    <div class="r"><span>Take-home pay</span><span>${money(m.income)}</span></div>
    <div class="r"><span>Living expenses</span><span>−${money(m.exp)}</span></div>
    <div class="r"><span>Mortgage (${m.rate.toFixed(2)}%)</span><span>−${money(r.pay)}</span></div>
    ${r.extra ? `<div class="r"><span>Extra repayment</span><span>−${money(r.extra)}</span></div>` : ''}
    ${r.ratesMonthly ? group('Rates & levies', r.costs.filter(c => ['council', 'water', 'strata', 'special'].includes(c.key)).map(line).join(''), r.ratesMonthly) : ''}
    ${r.setAside ? group('Set aside for bills', r.costs.filter(c => !['council', 'water', 'strata', 'special'].includes(c.key)).map(line).join(''), r.setAside) : ''}
    <div class="r total"><span>Left over</span><span class="${neg(r.left)}">${money(r.left)}</span></div>
    <div class="r"><span>${savingsLabel}</span><span>−${money(r.toSavings)}</span></div>
    <div class="r total"><span>Left to spend</span><span class="${neg(r.toSpend)}">${money(r.toSpend)} <span class="muted small">(${money(r.toSpend * 12 / 52)} a week)</span></span></div></div></div>`;
}

// ── Upfront ──────────────────────────────────────────────────────────────
// One line with ✎. calc = the app's own figure, shown when you've put your own.
function up(key, label, value, calc = null, indent = false, i = null) {
  const cents = key === 'mortReg' || key === 'transReg';
  const show = n => (cents ? '$' + Number(n).toFixed(2) : money(n));
  return `<div class="r ${indent ? 'in' : ''}"><span>${esc(label)} <button class="edit" data-up="${key}" ${i != null ? `data-i="${i}"` : ''} aria-label="Change ${esc(label)}">✎</button>${calc != null ? `<br><span class="small muted">Your figure · the app’s: ${show(calc)}</span>` : ''}</span><span>${show(value)}</span></div>`;
}

function upfront(r, m) {
  const buyingTotal = r.deposit + r.duty + r.mortReg + r.transReg + r.buyingTotal + (m.specialOnce || 0);
  return `<div class="card"><div class="sec-head"><h3>Cash needed upfront</h3><b class="num">${money(r.upfront)}</b></div>
    <p class="small muted" style="margin:0">Tap ✎ on any line to change it.</p><div class="sum">
    <div class="r sub"><span><b>To buy</b></span><span><b>${money(buyingTotal)}</b></span></div>
    ${up('dep', `Deposit (${+r.depPct.toFixed(1)}%)`, r.deposit, null, true)}
    <div class="r in"><span>Stamp duty${m.dutyOverride != null ? ' · your figure' : m.fhb ? (r.duty === 0 ? ' · first home buyer exemption' : m.price < 1000000 ? ' · concession' : '') : ''} <button class="edit" data-dutyedit aria-label="Change stamp duty">✎</button>${m.dutyOverride != null ? `<br><span class="small muted">Calculator: ${money(r.dutyCalc)}${m.dutyWhy ? ` · “${esc(m.dutyWhy)}”` : ''}</span>` : ''}</span><span>${money(r.duty)}</span></div>
    ${up('mortReg', 'Mortgage registration fee', r.mortReg, m.mortReg != null ? MORTGAGE_REG : null, true)}
    ${up('transReg', 'Transfer registration fee', r.transReg, m.transReg != null ? TRANSFER_REG : null, true)}
    ${up('conv', 'Conveyancer', m.conv, null, true)}
    ${up('insp', 'Building & pest / strata report', m.insp, null, true)}
    ${up('homeIns', 'Home & contents insurance (first year)', m.homeIns || 0, null, true)}
    ${up('settleRates', 'Council & water rates due at settlement', m.settleRates || 0, null, true)}
    ${m.specialOnce ? up('specialOnce', 'Special levy, one-off', m.specialOnce, null, true) : ''}
    <div class="r sub"><span><b>To move</b>${m.bondBack ? ' <span class="muted small">after the bond comes back</span>' : ''}</span><span><b>${money(r.movingTotal)}</b></span></div>
    ${m.moving.map((x, i) => (x.amount ? up('move', x.name, x.amount, null, true, i) : '')).join('') || '<div class="r in"><span class="muted small">Nothing yet. Fill in the moving costs list below.</span><span></span></div>'}
    <div class="r in"><span>Rental bond refund <button class="edit" data-up="bondBack" aria-label="Change rental bond refund">✎</button></span><span class="up">−${money(m.bondBack || 0)}</span></div>
    <div class="r total"><span>Total</span><span>${money(r.upfront)}</span></div></div>
    <div class="sum"><div class="r"><span>Loan · ${(r.lvr * 100).toFixed(0)}% of the price</span><span>${money(r.loan)}</span></div>
    ${r.lmi || m.lmiOverride != null ? up('lmi', 'Lenders mortgage insurance (usually added to the loan, not paid upfront)', r.lmi, m.lmiOverride != null ? r.lmiCalc : null) : ''}</div></div>`;
}

// ── Loan & offset ────────────────────────────────────────────────────────
function loan(r, m) {
  const noBudget = !m.income;
  const maxSpend = Math.max(1, ...r.rows.map(x => x.spend));
  return `<div class="card"><h3>Repayments</h3><div class="sum">
      <div class="r"><span>Loan</span><span>${money(r.loan)}</span></div>
      ${r.extra ? `<div class="r"><span>Minimum each month (${m.rate.toFixed(2)}%, 30 years)</span><span>${money(r.pay)}</span></div>
      <div class="r"><span>Extra repayment</span><span>+${money(r.extra)}</span></div>
      <div class="r total"><span>Total each month</span><span>${money(r.payTotal)}</span></div>`
      : `<div class="r"><span>Each month (${m.rate.toFixed(2)}%, 30 years)</span><span>${money(r.pay)}</span></div>`}
      <div class="r"><span>Each fortnight</span><span>${money(r.payTotal * 12 / 26)}</span></div></div>
    ${r.ext && !r.off ? `<div class="hero-num"><div><span class="eyebrow">Paid off in</span><span class="num">${yrs(r.ext.months)}</span><span class="small muted">${yrs(r.ext.monthsSaved)} sooner</span></div>
      <div><span class="eyebrow">Interest saved</span><span class="num up">${money(r.ext.saved)}</span><span class="small muted">with ${money(r.extra)} extra a month</span></div></div>` : ''}</div>
  ${r.off ? `<div class="card"><h3>With the offset account${r.extra ? ' and extra repayments' : ''}</h3>
    <div class="hero-num"><div><span class="eyebrow">Paid off in</span><span class="num">${yrs(r.off.months)}</span><span class="small muted">${r.off.monthsSaved > 0 ? yrs(r.off.monthsSaved) + ' sooner' : 'no sooner'}</span></div>
      <div><span class="eyebrow">Interest saved</span><span class="num up">${money(r.off.saved)}</span><span class="small muted">over the loan</span></div></div>
    <div class="sum">
      <div class="r"><span>Interest in the first month</span><span>${money(r.off.firstInterest)} <span class="muted">instead of ${money(r.loan * m.rate / 1200)}</span></span></div>
      <div class="r"><span>Total interest</span><span>${money(r.off.interest)} <span class="muted">instead of ${money(r.off.plainInterest)}</span></span></div>
      <div class="r"><span>Going into the offset each month</span><span>${m.offSavings ? money(Math.max(0, r.toSavings)) : '$0'}</span></div></div></div>` : ''}
  <div class="card"><h3>If rates rise</h3><p class="small muted" style="margin:0">Each row is another 0.25% rise${m.saveMode === 'amount' && m.saveAmt ? `, still saving ${money(m.saveAmt)} a month` : ''}.</p>
    <div class="tbl rr"><table><thead><tr><th>Rate</th><th>Monthly</th><th>Extra</th>${noBudget ? '' : '<th>Left to spend</th><th></th>'}</tr></thead><tbody>
    ${r.rows.map(x => `<tr class="${x.d === 0 ? 'now' : ''}"><td class="n">${x.rate.toFixed(2)}%</td><td class="n">${money(x.pay)}</td><td class="n">${x.d ? '+' + money(x.extra) : 'now'}</td>${noBudget ? '' : `<td class="n ${neg(x.spend)}">${money(x.spend)}</td><td><span class="track"><i style="width:${Math.max(0, x.spend) / maxSpend * 100}%"></i></span></td>`}</tr>`).join('')}
    </tbody></table></div></div>`;
}

// ── Reading the form, and the edit sheets ────────────────────────────────
function readYearly(view, m) {
  const rows = view.querySelectorAll('.yrow');
  if (!rows.length) return m.yearly;
  return [...rows].map(r => ({ name: r.querySelector('[data-yname]').value.trim() || 'Yearly cost', amount: parseFloat(r.querySelector('[data-yamt]').value) || 0, have: parseFloat(r.querySelector('[data-yhave]').value) || 0, due: r.querySelector('[data-ydue]').value || '' }));
}
function readMoving(view, m) {
  const rows = view.querySelectorAll('.mrow');
  if (!rows.length) return m.moving;
  return [...rows].map(r => ({ name: r.querySelector('[data-mname]').value.trim() || 'Moving cost', amount: parseFloat(r.querySelector('[data-mamt]').value) || 0 }));
}
function readForm(view, m) {
  const cur = { ...m };
  view.querySelectorAll('[data-m]').forEach(x => { const n = parseFloat(x.value); cur[x.dataset.m] = Number.isFinite(n) ? n : 0; });
  // while typing a deposit, the box being typed in leads
  const da = view.querySelector('#m-depAmt'), dp = view.querySelector('#m-depPct');
  if (da && document.activeElement === da) { cur.depMode = 'amt'; cur.depAmt = parseFloat(da.value) || 0; }
  else if (dp && document.activeElement === dp) { cur.depMode = 'pct'; cur.dep = parseFloat(dp.value) || 0; }
  const s = view.querySelector('#m-save');
  if (s) cur.save = Number(s.value);
  cur.yearly = readYearly(view, m);
  cur.moving = readMoving(view, m);
  return cur;
}

// ✎ on an upfront line.
function upfrontEdit(key, i, cur, p, done) {
  const LABEL = { dep: 'Deposit', mortReg: 'Mortgage registration fee', transReg: 'Transfer registration fee', lmi: 'Lenders mortgage insurance',
    conv: 'Conveyancer', insp: 'Building & pest / strata report', homeIns: 'Home & contents insurance (first year)',
    settleRates: 'Council & water rates due at settlement', bondBack: 'Rental bond refund', specialOnce: 'Special levy, one-off' };
  if (key === 'specialOnce' && p) return editField(p.id, 'specialOnce', done);   // it belongs to the property
  if (key === 'dep') {
    const price = p ? p.priceNum : cur.price;
    const now = cur.depMode === 'amt' ? Math.min(cur.depAmt, price) : price * cur.dep / 100;
    return amountSheet({ title: 'Deposit', value: Math.round(now), hint: `${(now / price * 100).toFixed(1)}% of ${money(price)}. Type the dollar amount; the percentage works itself out. (To set a percentage instead, use Loan & offset.)`, save: n => { setSetting('m_depMode', 'amt'); setSetting('m_depAmt', n); } }, done);
  }
  if (key === 'move') {
    const list = cur.moving.map(x => ({ ...x }));
    return amountSheet({ title: list[i].name, value: list[i].amount, save: n => { list[i].amount = n; setSetting('m_moving', list); } }, done);
  }
  const own = { mortReg: 'm_mortReg', transReg: 'm_transReg', lmi: 'm_lmiOverride' }[key];
  if (own) {
    const app = key === 'mortReg' ? MORTGAGE_REG : key === 'transReg' ? TRANSFER_REG : work({ ...cur, price: p ? p.priceNum : cur.price, lmiOverride: null }).lmiCalc;
    const now = key === 'lmi' ? (cur.lmiOverride ?? app) : (cur[key] ?? app);
    return amountSheet({ title: LABEL[key], value: Math.round(now * 100) / 100, hint: `The app’s figure is ${key === 'lmi' ? money(app) : '$' + app.toFixed(2)}.`, save: n => setSetting(own, n), reset: (key === 'lmi' ? cur.lmiOverride : cur[key]) != null ? () => setSetting(own, null) : null }, done);
  }
  return amountSheet({ title: LABEL[key] || key, value: cur[key] || 0, save: n => setSetting('m_' + key, n) }, done);
}

function amountSheet({ title, value, unit = '$', hint = '', save, reset = null }, done) {
  const s = openSheet(`<h3>${esc(title)}</h3>
    <form id="aForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="a-amt">${unit === '%' ? 'Percentage of the price' : 'Amount'}</label><input class="input num" id="a-amt" type="number" inputmode="decimal" step="any" value="${value ?? ''}">${hint ? `<span class="small muted">${esc(hint)}</span>` : ''}</div>
      <div class="row-btns"><button class="btn primary">Save</button>${reset ? '<button type="button" class="btn" data-reset>Use the app’s figure</button>' : ''}<button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.querySelector('#a-amt').select();
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-reset]')) { reset(); closeSheet(); toast('Back to the app’s figure'); done(); }
  };
  s.querySelector('#aForm').onsubmit = e => {
    e.preventDefault();
    const n = Number(s.querySelector('#a-amt').value);
    if (!Number.isFinite(n) || n < 0) return;
    save(n); closeSheet(); toast('Saved'); done();
  };
}

// Stamp duty for a typed-in price: your own figure, kept with the price it's for.
function dutySheet(price, calculated, saved, done) {
  const s = openSheet(`<h3>Stamp duty</h3>
    <p class="small muted" style="margin:0">For ${money(price)}. The calculator says ${money(calculated)}.</p>
    <form id="dForm" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="d-amt">Stamp duty to use</label><input class="input num" id="d-amt" type="number" inputmode="decimal" value="${saved ? saved.amount : Math.round(calculated)}"></div>
      <div class="field"><label for="d-why">Why (optional)</label><input class="input" id="d-why" value="${esc(saved?.why || '')}" placeholder="e.g. From the Revenue NSW calculator"></div>
      <div class="row-btns"><button class="btn primary">Use this figure</button>${saved ? '<button type="button" class="btn" data-reset>Use the calculator</button>' : ''}<button type="button" class="btn" data-close>Cancel</button></div></form>`);
  s.onclick = e => {
    if (e.target.closest('[data-close]')) return closeSheet();
    if (e.target.closest('[data-reset]')) { setSetting('m_duty', null); closeSheet(); toast('Back to the calculated stamp duty'); done(); }
  };
  s.querySelector('#dForm').onsubmit = e => {
    e.preventDefault();
    const amount = Number(s.querySelector('#d-amt').value);
    if (!Number.isFinite(amount) || amount < 0) return;
    setSetting('m_duty', { price, amount, why: s.querySelector('#d-why').value.trim() });
    closeSheet(); toast('Stamp duty saved'); done();
  };
}
