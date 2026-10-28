(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const fmtT = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const fmtDur = m => Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
const kes = n => 'KES ' + Number(n).toLocaleString('en-KE');

/* ---------- API client  ---------- */
class ApiError extends Error {
  constructor(message, status, field) { super(message); this.status = status; this.field = field; }
}
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
  if (opts.body !== undefined) {
    init.method = opts.method || 'POST';
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  let res;
  try { res = await fetch('/api' + path, init); }
  catch (e) { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', res.status, data && data.field);
  return data;
}

/* ---------- state ---------- */
let config = null;       // stations, classes, dates from the server
let renderSeq = 0;       // guards async views against stale renders
let searchSeq = 0;
const state = {
  view: 'book', user: null, authTab: 'in', results: null, selected: null,
  booking: null, banner: false, lookup: null, myBookings: [],
  search: { from: 'ELD', to: 'NBO', date: '', cls: 'economy', adults: 1, children: 0, infants: 0 }
};
const st = id => config.stations.find(s => s.id === id) || { id, name: id, county: '', links: [] };
const clsLabel = k => (config.classes[k] && config.classes[k].label) || k;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200);
}
const loadingHtml = msg => `<div class="wrap page"><p>${esc(msg || 'Loading...')}</p></div>`;
const errorHtml = msg => `<div class="wrap page"><div class="panel"><h2>Something went wrong</h2><p class="err" role="alert">${esc(msg)}</p>
  <div class="actions"><button class="btn" data-action="reload">Try again</button></div></div></div>`;

/* ---------- header ---------- */
function updateHeader() {
  const active = { checkout: 'book', ticket: 'tickets' }[state.view] || state.view;
  $$('.nav [data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === active ? 'page' : 'false'));
  $('#acct').innerHTML = state.user
    ? `<span class="who"><small>Registered user</small><b>${esc(state.user.name.split(' ')[0])}</b></span><button class="link" data-action="logout">Sign out</button>`
    : `<span class="who"><small>Guest</small></span><button class="btn sm" data-action="auth" data-tab="in">Sign in</button>`;
}

/* ---------- views ---------- */
function steps(n) {
  const l = ['Search', 'Passengers', 'Ticket'];
  return `<ol class="steps" aria-label="Booking progress">${l.map((t, i) =>
    `<li class="${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}" ${i + 1 === n ? 'aria-current="step"' : ''}><b>${i + 1}</b>${t}</li>`).join('')}</ol>`;
}
const stationOpts = sel => config.stations.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
function counter(key, label, sub) {
  return `<div class="counter"><div><b>${label}</b><small>${sub}</small></div>
    <div class="stepper"><button type="button" data-action="count" data-key="${key}" data-delta="-1" aria-label="Fewer ${label.toLowerCase()}s">&minus;</button>
    <output id="c-${key}" aria-live="polite">${state.search[key]}</output>
    <button type="button" data-action="count" data-key="${key}" data-delta="1" aria-label="More ${label.toLowerCase()}s">+</button></div></div>`;
}

function viewBook(app) {
  const s = state.search;
  app.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div><h1>Book your train across Kenya</h1>
    <p>Eldoret, Nakuru, Nairobi, Kisumu and Mombasa. Choose a route and a class, then get your ticket on screen or on paper.</p></div>
    <div class="hero-logo-box"><img class="hero-logo" src="logo.jpg" alt="Fastline Transport Services. Safe people, comfortable journeys, on time."></div>
  </div></section>
  <form class="search" id="searchForm" novalidate aria-label="Search trains">
    <div class="route">
      <label class="fld"><span>From</span><select data-field="from">${stationOpts(s.from)}</select></label>
      <button type="button" class="swap" data-action="swap" aria-label="Swap From and To">&#8644;</button>
      <label class="fld"><span>To</span><select data-field="to">${stationOpts(s.to)}</select></label>
      <label class="fld"><span>Travel date</span><input type="date" data-field="date" min="${config.today}" max="${config.maxDate}" value="${s.date}"></label>
      <label class="fld"><span>Booking class</span><select data-field="cls">${Object.entries(config.classes).map(([k, v]) => `<option value="${k}" ${k === s.cls ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    </div>
    <div class="pax-row">
      ${counter('adults', 'Adult', '18 years and above')}
      ${counter('children', 'Child', '2 to 17 years')}
      ${counter('infants', 'Infant', 'Under 2, travels free')}
      <button class="btn" type="submit">Search trains</button>
    </div>
    <p class="err" id="searchErr" role="alert"></p>
  </form>
  <div class="wrap section" id="results">${resultsHtml()}</div>
  <div class="wrap facts">
    <div><h3>Infants travel free</h3><p>Children under 2 sit on an adult's lap. Each adult can carry one infant.</p></div>
    <div><h3>Bring your ID</h3><p>Adults need a national ID or passport. Children need a birth certificate or school ID.</p></div>
    <div><h3>Ticket your way</h3><p>Show your ticket on your phone or print it. Both work at the gate.</p></div>
  </div>`;
  updateCounters();
}

function resultsHtml() {
  const R = state.results; if (!R) return '';
  if (R.loading) return `<div class="board"><p class="empty">Searching trains...</p></div>`;
  const { q, trains, route: r } = R;
  const via = r.path.slice(1, -1).map(id => st(id).name);
  const need = q.adults + q.children;
  const rows = trains.map((tr, i) => {
    let btn;
    if (tr.closed) btn = `<button class="btn" disabled>Closed</button>`;
    else if (tr.seatsLeft < need) btn = `<button class="btn" disabled>${tr.seatsLeft === 0 ? 'Sold out' : 'Not enough seats'}</button>`;
    else btn = `<button class="btn" data-action="select" data-i="${i}">Select</button>`;
    return `<div class="trow ${tr.closed ? 'off' : ''}">
      <div class="cell"><small>Train number</small><b>${esc(tr.num)}</b></div>
      <div class="cell"><small>Departs</small><b>${fmtT(tr.dep)}</b></div>
      <div class="cell"><small>Arrives</small><b>${fmtT(tr.arr)}${tr.dayOffset ? `<em>+${tr.dayOffset} day</em>` : ''}</b></div>
      <div class="cell"><small>Duration</small><b class="plain">${fmtDur(tr.dur)}</b></div>
      <div class="cell"><small>${need > 1 ? 'Total fare' : 'Fare'}</small><b class="plain">${kes(tr.total)}</b><small>${kes(tr.fares.adult)} per adult</small></div>
      <div class="cell act">${btn}<small class="${tr.seatsLeft < 15 && !tr.closed ? 'low' : ''}" style="margin-top:.35rem;text-align:center">${tr.closed ? 'Booking closed' : tr.seatsLeft + ' seats left'}</small></div>
    </div>`;
  }).join('');
  return `<div class="board" role="region" aria-label="Available trains">
    <div class="board-head"><h2>${esc(st(q.from).name)} to ${esc(st(q.to).name)}</h2><span>${fmtDate(q.date)}</span><span>${esc(clsLabel(q.cls))}</span>${via.length ? `<span>Stops at ${esc(via.join(', '))}</span>` : ''}</div>
    ${rows || '<p class="empty">No trains found for this route.</p>'}
  </div>`;
}

function paxList(q) {
  const l = [];
  for (let i = 1; i <= q.adults; i++) l.push({ type: 'Adult', n: i, sub: '18 years and above' });
  for (let i = 1; i <= q.children; i++) l.push({ type: 'Child', n: i, sub: '2 to 17 years' });
  for (let i = 1; i <= q.infants; i++) l.push({ type: 'Infant', n: i, sub: 'Under 2, free' });
  return l;
}
const idLabel = t => t === 'Adult' ? 'National ID or passport number' : t === 'Child' ? 'Birth certificate or school ID number' : 'Birth certificate number (optional)';

function viewCheckout(app) {
  if (!state.selected) return go('book');
  const { train: tr, q } = state.selected;
  const f = st(tr.from), t = st(tr.to), fr = tr.fares;
  const list = paxList(q);
  const u = state.user;
  app.innerHTML = `<div class="wrap page">
    ${steps(2)}
    <h1>Passenger details</h1>
    <div class="cols">
      <form id="checkoutForm" novalidate>
        <div class="panel">
          <h2>Who is travelling</h2>
          ${list.map((p, k) => `<fieldset class="px"><legend>${p.type} ${p.n}<small>${p.sub}</small></legend>
            <div class="grid2">
              <label class="fld"><span>Full name</span><input name="name-${k}" autocomplete="${k === 0 ? 'name' : 'off'}" value="${k === 0 && u ? esc(u.name) : ''}"></label>
              <label class="fld"><span>${idLabel(p.type)}</span><input name="id-${k}" autocomplete="off"></label>
            </div></fieldset>`).join('')}
        </div>
        <div class="panel">
          <h2>Contact and payment</h2>
          <div class="grid2">
            <label class="fld"><span>Phone number (M-Pesa)</span><input name="phone" type="tel" inputmode="tel" placeholder="0712 345 678" autocomplete="tel"></label>
            <label class="fld"><span>Email address</span><input name="email" type="email" autocomplete="email" value="${u ? esc(u.email) : ''}"></label>
          </div>
          <p class="fine" style="margin-top:.7rem">Demo mode: no payment is taken.</p>
          <label class="check"><input type="checkbox" name="agree"><span>I will carry the ID shown for each passenger and I accept the ticket validity rules.</span></label>
          <p class="err" id="checkoutErr" role="alert"></p>
          <div class="actions" style="margin:0">
            <button class="btn" type="submit" id="payBtn">Pay ${kes(tr.total)} and get tickets</button>
            <button class="btn ghost" type="button" data-action="nav" data-view="book">Back to trains</button>
          </div>
        </div>
      </form>
      <aside class="sum" aria-label="Trip summary">
        <h2>${esc(f.name)} to ${esc(t.name)}</h2>
        <dl>
          <div><dt>Train</dt><dd>${esc(tr.num)}</dd></div>
          <div><dt>Date</dt><dd>${fmtDate(tr.date)}</dd></div>
          <div><dt>Departs</dt><dd>${fmtT(tr.dep)}</dd></div>
          <div><dt>Arrives</dt><dd>${fmtT(tr.arr)}${tr.dayOffset ? ` (+${tr.dayOffset} day)` : ''}</dd></div>
          <div><dt>Class</dt><dd>${esc(clsLabel(q.cls))}</dd></div>
          ${q.adults ? `<div><dt>${q.adults} adult${q.adults > 1 ? 's' : ''}</dt><dd>${kes(q.adults * fr.adult)}</dd></div>` : ''}
          ${q.children ? `<div><dt>${q.children} child${q.children > 1 ? 'ren' : ''}</dt><dd>${kes(q.children * fr.child)}</dd></div>` : ''}
          ${q.infants ? `<div><dt>${q.infants} infant${q.infants > 1 ? 's' : ''}</dt><dd>Free</dd></div>` : ''}
          <div class="tot"><dt>Total</dt><dd>${kes(tr.total)}</dd></div>
        </dl>
      </aside>
    </div>
  </div>`;
}

const idRule = t => t === 'Adult' ? 'Carry the original national ID or passport that matches the ID number on this ticket.'
  : t === 'Child' ? 'Carry the birth certificate or school ID that matches the number on this ticket.'
  : 'Carry the infant\'s birth certificate or clinic card. Infants sit on an adult\'s lap.';

function ticketHtml(b, p) {
  const f = st(b.from), t = st(b.to);
  return `<article class="ticket" aria-label="Ticket ${esc(p.ticketNo)}">
    <div>
      <div class="t-head"><span class="b">Fastline</span><span class="c">${esc(clsLabel(b.cls))}</span></div>
      <div class="t-route">
        <div class="pt"><small>From</small><strong>${esc(f.name)}</strong></div><div class="ln" aria-hidden="true"></div>
        <div class="pt"><small>Destination</small><strong>${esc(t.name)}</strong></div>
      </div>
      <div class="t-grid">
        <div><small>Passenger name</small><b>${esc(p.name)}</b></div>
        <div><small>ID number</small><b>${esc(p.id || 'Not required')}</b></div>
        <div><small>Passenger type</small><b>${esc(p.type)}</b></div>
        <div><small>Train number</small><b>${esc(b.trainNo)}</b></div>
        <div><small>Boarding station</small><b>${esc(f.name)} Station</b></div>
        <div><small>Travel date</small><b>${fmtDate(b.date)}</b></div>
        <div><small>Departure</small><b>${fmtT(b.dep)}</b></div>
        <div><small>Arrival</small><b>${fmtT(b.arr)}${b.dayOffset ? ` (+${b.dayOffset} day)` : ''}</b></div>
        <div><small>Fare</small><b>${p.fare ? kes(p.fare) : 'Free'}</b></div>
      </div>
      <div class="t-rules">
        <h4>Validity rules</h4>
        <ul>
          <li>Valid only for the train, date and class printed on this ticket.</li>
          <li>Not transferable. One ticket per passenger.</li>
          <li>Be at the station 45 minutes before departure.</li>
        </ul>
        <h4>Mandatory ID requirement</h4>
        <p>${idRule(p.type)}</p>
      </div>
    </div>
    <div class="t-stub"><div class="no">${esc(p.ticketNo)}</div><small>Unique ticket number</small></div>
  </article>`;
}

function viewTicket(app) {
  const b = state.booking;
  if (!b) return go('tickets');
  const f = st(b.from), t = st(b.to);
  app.innerHTML = `<div class="wrap page">
    ${state.banner ? steps(3) : ''}
    ${state.banner ? `<div class="banner"><h2>Booking confirmed</h2><p>${b.passengers.length} ticket${b.passengers.length > 1 ? 's' : ''} for ${esc(f.name)} to ${esc(t.name)}, ${fmtDate(b.date)}. Total paid ${kes(b.total)}.</p>
      ${!state.user ? `<p class="fine" style="margin-top:.4rem">Guest tickets are tied to this browser. <button class="link" data-action="auth" data-tab="up">Create an account</button> to keep them under your name.</p>` : ''}</div>` : `<h1>Your tickets</h1>`}
    <div class="actions no-print">
      <button class="btn" data-action="print">Print tickets</button>
      <button class="btn ghost" data-action="nav" data-view="tickets">My tickets</button>
      <button class="btn ghost" data-action="nav" data-view="book">Book another trip</button>
    </div>
    ${b.passengers.map(p => ticketHtml(b, p)).join('')}
  </div>`;
}

function bookingCard(b) {
  const f = st(b.from), t = st(b.to);
  let action = '';
  if (b.past) action = '<span class="tag">Past trip</span>';
  else if (b.canCancel) action = `<button class="btn sm ghost" data-action="cancel" data-id="${esc(b.id)}">Cancel</button>`;
  return `<div class="bk">
    <div><h3>${esc(f.name)} to ${esc(t.name)}</h3>
      <p>${fmtDate(b.date)}, ${fmtT(b.dep)}. Train ${esc(b.trainNo)}. ${esc(clsLabel(b.cls))}.</p>
      <p>${b.passengers.map(p => esc(p.name)).join(', ')} <span class="tag">${b.passengers.map(p => esc(p.ticketNo)).join(', ')}</span></p></div>
    <div class="btns"><button class="btn sm" data-action="view-booking" data-id="${esc(b.id)}">View tickets</button>${action}</div>
  </div>`;
}

async function viewTickets(app, rid) {
  app.innerHTML = loadingHtml('Loading your tickets...');
  let mine;
  try { mine = (await api('/bookings')).bookings; }
  catch (e) { if (rid === renderSeq) app.innerHTML = errorHtml(e.message); return; }
  if (rid !== renderSeq) return;
  state.myBookings = mine;
  let lookupHtml = '';
  if (state.lookup && state.lookup.error) lookupHtml = `<p class="err" role="alert">${esc(state.lookup.error)}</p>`;
  else if (state.lookup && state.lookup.booking) lookupHtml = bookingCard(state.lookup.booking);
  app.innerHTML = `<div class="wrap page">
    <h1>My tickets</h1>
    <div class="cols" style="grid-template-columns:1fr">
      <div class="panel">
        <h2>${state.user ? 'Your bookings' : 'Guest bookings in this browser'}</h2>
        ${mine.length ? mine.map(bookingCard).join('') : `<p>No bookings yet.</p><div class="actions"><button class="btn" data-action="nav" data-view="book">Book a train</button></div>`}
        ${!state.user ? `<p class="fine" style="margin-top:.8rem">Sign in or register to keep your bookings under your name.</p>` : ''}
      </div>
      <div class="panel">
        <h2>Find a ticket</h2>
        <form id="lookupForm" class="lookup" novalidate>
          <label class="fld"><span>Unique ticket number</span><input name="no" placeholder="FL-ABCD-EFGH" autocomplete="off"></label>
          <button class="btn" type="submit">Find ticket</button>
        </form>
        <div style="margin-top:1rem">${lookupHtml}</div>
      </div>
    </div></div>`;
}

function viewInfo(app) {
  app.innerHTML = `<div class="wrap page">
    <h1>Stations and travel rules</h1>
    <div class="panel"><h2>Stations</h2>
      <div class="st-grid">${config.stations.map(s =>
        `<div class="st"><h3>${esc(s.name)}</h3><p>${esc(s.county)}</p><p>Direct link: ${s.links.map(l => `${esc(l.name)} (${l.km} km)`).join(', ')}</p></div>`).join('')}</div></div>
    <div class="panel"><h2>Passenger types</h2>
      <table><thead><tr><th>Type</th><th>Age</th><th>Fare</th><th>Seat</th></tr></thead><tbody>
        <tr><td>Infant</td><td>Under 2 years</td><td>Free</td><td>On an adult's lap, one infant per adult</td></tr>
        <tr><td>Child</td><td>2 to 17 years</td><td>Half the adult fare</td><td>Own seat</td></tr>
        <tr><td>Adult</td><td>18 years and above</td><td>Full fare</td><td>Own seat</td></tr>
      </tbody></table></div>
    <div class="panel"><h2>Mandatory ID</h2>
      <ul><li>Adults: original national ID or passport.</li><li>Children: birth certificate or school ID.</li><li>Infants: birth certificate or clinic card.</li></ul>
      <p class="fine">The name and ID number on the ticket must match the document you show.</p></div>
    <div class="panel"><h2>Ticket validity</h2>
      <ul><li>A ticket is valid only for its train, travel date and booking class.</li><li>Tickets are not transferable.</li>
      <li>Arrive 45 minutes before departure.</li><li>Online booking closes ${config.bookingClosesMin} minutes before departure.</li>
      <li>You can cancel a booking from My tickets up to ${config.bookingClosesMin} minutes before departure.</li></ul></div>
  </div>`;
}

/* ---------- navigation ---------- */
function render() {
  const app = $('#app'), rid = ++renderSeq;
  const view = { book: viewBook, checkout: viewCheckout, ticket: viewTicket, tickets: viewTickets, info: viewInfo }[state.view] || viewBook;
  view(app, rid);
  updateHeader();
}
function go(view) {
  state.view = view;
  if (view !== 'ticket') state.banner = false;
  if (view !== 'tickets') state.lookup = null;
  render();
  window.scrollTo(0, 0);
}

/* ---------- search ---------- */
function updateCounters() {
  const s = state.search, max = config.maxSeated;
  const lim = { adults: s.adults + s.children >= max, children: s.adults + s.children >= max, infants: s.infants >= s.adults };
  ['adults', 'children', 'infants'].forEach(k => {
    const o = $('#c-' + k); if (o) o.textContent = s[k];
    const min = k === 'adults' ? 1 : 0;
    const minus = $(`[data-key="${k}"][data-delta="-1"]`), plus = $(`[data-key="${k}"][data-delta="1"]`);
    if (minus) minus.disabled = s[k] <= min;
    if (plus) plus.disabled = lim[k];
  });
}
function changeCount(key, delta) {
  const s = state.search, max = config.maxSeated;
  let v = Math.max(key === 'adults' ? 1 : 0, s[key] + delta);
  if (key === 'adults') v = Math.min(v, max - s.children);
  if (key === 'children') v = Math.min(v, max - s.adults);
  if (key === 'infants') v = Math.min(v, s.adults);
  s[key] = v;
  if (s.infants > s.adults) s.infants = s.adults;
  updateCounters();
}
async function runSearch() {
  const q = { ...state.search }, err = $('#searchErr');
  err.textContent = '';
  if (q.from === q.to) { err.textContent = 'Choose two different stations for From and To.'; return; }
  if (!q.date || q.date < config.today || q.date > config.maxDate) { err.textContent = 'Pick a travel date from today up to 90 days ahead.'; return; }
  const seq = ++searchSeq;
  state.results = { loading: true, q };
  const box = $('#results'); box.innerHTML = resultsHtml();
  box.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  try {
    const r = await api('/trains?' + new URLSearchParams({ from: q.from, to: q.to, date: q.date, cls: q.cls, adults: q.adults, children: q.children, infants: q.infants }));
    if (seq !== searchSeq) return;
    state.results = { q, trains: r.trains, route: r.route };
  } catch (e) {
    if (seq !== searchSeq) return;
    state.results = null;
    const el = $('#searchErr'); if (el) el.textContent = e.message;
  }
  const b2 = $('#results'); if (state.view === 'book' && b2) b2.innerHTML = resultsHtml();
}

/* ---------- checkout ---------- */
async function submitCheckout(form) {
  const { train: tr, q } = state.selected;
  const fd = new FormData(form);
  const fail = (msg, field) => { $('#checkoutErr').textContent = msg; const el = field && form.elements[field]; if (el) el.focus(); };
  $('#checkoutErr').textContent = '';
  const list = paxList(q), people = [];
  for (let k = 0; k < list.length; k++) {
    const p = list[k];
    people.push({ type: p.type, name: String(fd.get('name-' + k) || '').trim(), id: String(fd.get('id-' + k) || '').trim() });
  }
  const phone = String(fd.get('phone') || '').trim(), email = String(fd.get('email') || '').trim();
  const agree = !!fd.get('agree');
  const btn = $('#payBtn'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Booking...';
  try {
    const r = await api('/bookings', { body: {
      from: tr.from, to: tr.to, date: tr.date, trainNo: tr.num, cls: q.cls,
      passengers: people, contact: { phone, email }, agree
    } });
    state.booking = r.booking; state.banner = true; state.selected = null; state.results = null;
    go('ticket');
  } catch (e) {
    btn.disabled = false; btn.textContent = label;
    fail(e.message, e.field);
  }
}

/* ---------- auth ---------- */
function renderAuth() {
  const reg = state.authTab === 'up';
  $('#authBody').innerHTML = `
    <div class="dlg-head"><h2 id="authTitle">${reg ? 'Create account' : 'Sign in'}</h2><button class="x" data-action="close-auth" aria-label="Close">&times;</button></div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${!reg}" data-action="auth-tab" data-tab="in">Sign in</button>
      <button role="tab" aria-selected="${reg}" data-action="auth-tab" data-tab="up">Register</button>
    </div>
    <form id="${reg ? 'regForm' : 'loginForm'}" class="stack" novalidate>
      ${reg ? `<label class="fld"><span>Full name</span><input name="name" autocomplete="name"></label>` : ''}
      <label class="fld"><span>Email address</span><input name="email" type="email" autocomplete="email"></label>
      <label class="fld"><span>Password</span><input name="pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}">${reg ? '<small>At least 8 characters.</small>' : ''}</label>
      ${reg ? `<label class="fld"><span>Confirm password</span><input name="pw2" type="password" autocomplete="new-password"></label>` : ''}
      <p class="err" id="authErr" role="alert"></p>
      <button class="btn block" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
    </form>
    <button class="link center" data-action="close-auth">Continue as guest</button>
    <p class="fine">Passwords are stored on the server as one-way hashes.</p>`;
}
function openAuth(tab) { state.authTab = tab; renderAuth(); const d = $('#authDlg'); if (!d.open) d.showModal(); }
async function doRegister(form) {
  const fd = new FormData(form), err = $('#authErr');
  const pw = String(fd.get('pw') || '');
  if (pw !== String(fd.get('pw2') || '')) { err.textContent = 'The passwords do not match.'; return; }
  try {
    const r = await api('/register', { body: { name: String(fd.get('name') || ''), email: String(fd.get('email') || ''), password: pw } });
    state.user = r.user; $('#authDlg').close();
    toast('Welcome to Fastline, ' + r.user.name.split(' ')[0] + '.'); render();
  } catch (e) { err.textContent = e.message; }
}
async function doLogin(form) {
  const fd = new FormData(form), err = $('#authErr');
  try {
    const r = await api('/login', { body: { email: String(fd.get('email') || ''), password: String(fd.get('pw') || '') } });
    state.user = r.user; $('#authDlg').close();
    toast('Signed in as ' + r.user.name.split(' ')[0] + '.'); render();
  } catch (e) { err.textContent = e.message; }
}

/* ---------- events ---------- */
const actions = {
  nav: el => go(el.dataset.view),
  reload: () => init(),
  swap: () => { const s = state.search; [s.from, s.to] = [s.to, s.from]; $('[data-field="from"]').value = s.from; $('[data-field="to"]').value = s.to; },
  count: el => changeCount(el.dataset.key, +el.dataset.delta),
  select: el => {
    const tr = state.results.trains[+el.dataset.i];
    state.selected = { train: tr, q: state.results.q };
    go('checkout');
  },
  auth: el => openAuth(el.dataset.tab),
  'auth-tab': el => openAuth(el.dataset.tab),
  'close-auth': () => $('#authDlg').close(),
  logout: async () => {
    try { await api('/logout', { body: {} }); } catch (e) { /* session cleared locally anyway */ }
    state.user = null; state.booking = null; state.myBookings = []; state.lookup = null;
    toast('You have signed out.'); go('book');
  },
  print: () => window.print(),
  'view-booking': el => {
    const id = el.dataset.id;
    const b = state.myBookings.find(x => x.id === id) || (state.lookup && state.lookup.booking && state.lookup.booking.id === id ? state.lookup.booking : null);
    if (!b) return;
    state.booking = b; state.banner = false; go('ticket');
  },
  cancel: async el => {
    const b = state.myBookings.find(x => x.id === el.dataset.id); if (!b) return;
    if (!confirm(`Cancel your ${st(b.from).name} to ${st(b.to).name} booking on ${fmtDate(b.date)}?`)) return;
    try { await api('/bookings/' + encodeURIComponent(b.id), { method: 'DELETE' }); toast('Booking cancelled.'); }
    catch (e) { toast(e.message); }
    render();
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) Promise.resolve(fn(el, e)).catch(err => toast(err.message || 'Something went wrong.'));
});
document.addEventListener('change', e => {
  const f = e.target.dataset && e.target.dataset.field; if (!f) return;
  state.search[f] = e.target.value;
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const id = e.target.id;
  try {
    if (id === 'searchForm') await runSearch();
    else if (id === 'checkoutForm') await submitCheckout(e.target);
    else if (id === 'regForm') await doRegister(e.target);
    else if (id === 'loginForm') await doLogin(e.target);
    else if (id === 'lookupForm') {
      const no = String(new FormData(e.target).get('no') || '').trim();
      if (!no) return;
      try { state.lookup = { booking: (await api('/tickets/' + encodeURIComponent(no))).booking }; }
      catch (er) { state.lookup = { error: er.message }; }
      render();
    }
  } catch (err) { toast(err.message || 'Something went wrong.'); }
});

/* ---------- start ---------- */
async function init() {
  const app = $('#app');
  app.innerHTML = loadingHtml('Loading Fastline...');
  try {
    const [cfg, me] = await Promise.all([api('/config'), api('/me')]);
    config = cfg; state.user = me.user;
    state.search.date = state.search.date || cfg.today;
    const ids = cfg.stations.map(s => s.id);
    if (!ids.includes(state.search.from)) state.search.from = ids[0];
    if (!ids.includes(state.search.to) || state.search.to === state.search.from) state.search.to = ids.find(i => i !== state.search.from);
  } catch (e) { app.innerHTML = errorHtml(e.message); updateHeaderSafe(); return; }
  render();
}
function updateHeaderSafe() { try { $('#acct').innerHTML = ''; } catch (e) { /* ignore */ } }
init();
})();
