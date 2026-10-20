(() => {
'use strict';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) {} return k in mem ? mem[k] : d; },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const todayStr = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const maxDate = () => { const d = new Date(); d.setDate(d.getDate() + 90); return todayStr(d); };
const fmtT = m => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const fmtDur = m => Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
const fmtDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
const kes = n => 'KES ' + n.toLocaleString('en-KE');
const r10 = n => Math.round(n / 10) * 10;
const depMs = b => { const [y, m, d] = b.date.split('-').map(Number); return new Date(y, m - 1, d, Math.floor(b.dep / 60), b.dep % 60).getTime(); };

/* ---------- data ---------- */
const STATIONS = [
  { id: 'ELD', name: 'Eldoret', county: 'Uasin Gishu County' },
  { id: 'NKR', name: 'Nakuru', county: 'Nakuru County' },
  { id: 'NBO', name: 'Nairobi', county: 'Nairobi County' },
  { id: 'KSM', name: 'Kisumu', county: 'Kisumu County' },
  { id: 'MSA', name: 'Mombasa', county: 'Mombasa County' }
];
const EDGES = [['ELD', 'NKR', 160], ['KSM', 'NKR', 190], ['NKR', 'NBO', 160], ['NBO', 'MSA', 480]];
const CLASSES = {
  economy:  { label: 'Economy class',  rate: 3,   cap: 120 },
  business: { label: 'Business class', rate: 6.5, cap: 40 },
  first:    { label: 'First class',    rate: 9,   cap: 16 }
};
const SLOTS = ['05:30', '08:45', '12:30', '16:00', '20:15'];
const SPEED = 85; // km/h average
const st = id => STATIONS.find(s => s.id === id);

function route(a, b) {
  const adj = {};
  EDGES.forEach(([x, y, d]) => { (adj[x] ??= []).push([y, d]); (adj[y] ??= []).push([x, d]); });
  const q = [[a, [a], 0]], seen = new Set([a]);
  while (q.length) {
    const [n, p, k] = q.shift();
    if (n === b) return { path: p, km: k };
    for (const [m, d] of adj[n] || []) if (!seen.has(m)) { seen.add(m); q.push([m, [...p, m], k + d]); }
  }
  return null;
}
const fares = (km, cls) => { const adult = r10(km * CLASSES[cls].rate); return { adult, child: r10(adult / 2), infant: 0 }; };
const getBookings = () => store.get('fl_bookings', []);

function bookedSeats(num, date, cls) {
  return getBookings().filter(b => b.trainNo === num && b.date === date && b.cls === cls)
    .reduce((n, b) => n + b.passengers.filter(p => p.type !== 'Infant').length, 0);
}
function seatsLeft(num, date, cls) {
  const cap = CLASSES[cls].cap;
  const taken = h32(num + date + cls) % Math.floor(cap * 0.7);
  return Math.max(0, cap - taken - bookedSeats(num, date, cls));
}
function makeTrains(f, t, date) {
  const r = route(f, t); if (!r) return [];
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes(); const isToday = date === todayStr();
  return SLOTS.map(s => {
    const [hh, mm] = s.split(':').map(Number);
    const dep = hh * 60 + mm;
    const dur = Math.round(r.km / SPEED * 60 + (r.path.length - 2) * 10);
    const arr = dep + dur;
    const seed = h32(f + t + s);
    const num = ['KRC', 'KMH', 'VCJ', 'FLX'][seed % 4] + String(1000 + (seed >>> 3) % 9000);
    return { num, dep, arr: arr % 1440, dayOffset: Math.floor(arr / 1440), dur, km: r.km, path: r.path, from: f, to: t, date,
      departed: isToday && dep <= nowMin + 60 };
  });
}

/* ---------- state ---------- */
const state = {
  view: 'book', user: null, authTab: 'in', results: null, selected: null, currentBooking: null, banner: false, lookup: null,
  search: { from: 'ELD', to: 'NBO', date: todayStr(), cls: 'economy', adults: 1, children: 0, infants: 0 }
};
const owner = () => state.user ? state.user.email : 'guest';
function loadSession() {
  const email = store.get('fl_session', null);
  const users = store.get('fl_users', {});
  if (email && users[email]) state.user = { email, name: users[email].name };
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200);
}

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
const stationOpts = sel => STATIONS.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${s.name}</option>`).join('');
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
    <img class="hero-logo" src="logo.jpg" alt="Fastline Transport Services. Safe people, comfortable journeys, on time.">
  </div></section>
  <form class="search" id="searchForm" novalidate aria-label="Search trains">
    <div class="route">
      <label class="fld"><span>From</span><select data-field="from">${stationOpts(s.from)}</select></label>
      <button type="button" class="swap" data-action="swap" aria-label="Swap From and To">&#8644;</button>
      <label class="fld"><span>To</span><select data-field="to">${stationOpts(s.to)}</select></label>
      <label class="fld"><span>Travel date</span><input type="date" data-field="date" min="${todayStr()}" max="${maxDate()}" value="${s.date}"></label>
      <label class="fld"><span>Booking class</span><select data-field="cls">${Object.entries(CLASSES).map(([k, v]) => `<option value="${k}" ${k === s.cls ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
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
  const { q, trains, route: r } = R;
  const f = st(q.from), t = st(q.to);
  const via = r.path.slice(1, -1).map(id => st(id).name);
  const fr = fares(r.km, q.cls);
  const paying = q.adults + q.children;
  const total = q.adults * fr.adult + q.children * fr.child;
  const rows = trains.map((tr, i) => {
    const left = seatsLeft(tr.num, q.date, q.cls);
    const need = paying;
    let btn;
    if (tr.departed) btn = `<button class="btn" disabled>Departed</button>`;
    else if (left < need) btn = `<button class="btn" disabled>${left === 0 ? 'Sold out' : 'Not enough seats'}</button>`;
    else btn = `<button class="btn" data-action="select" data-i="${i}">Select</button>`;
    return `<div class="trow ${tr.departed ? 'off' : ''}">
      <div class="cell"><small>Train number</small><b>${tr.num}</b></div>
      <div class="cell"><small>Departs</small><b>${fmtT(tr.dep)}</b></div>
      <div class="cell"><small>Arrives</small><b>${fmtT(tr.arr)}${tr.dayOffset ? `<em>+${tr.dayOffset} day</em>` : ''}</b></div>
      <div class="cell"><small>Duration</small><b class="plain">${fmtDur(tr.dur)}</b></div>
      <div class="cell"><small>${paying > 1 ? 'Total fare' : 'Fare'}</small><b class="plain">${kes(total)}</b><small>${kes(fr.adult)} per adult</small></div>
      <div class="cell act">${btn}<small class="${left < 15 ? 'low' : ''}" style="margin-top:.35rem;text-align:center">${tr.departed ? 'Booking closed' : left + ' seats left'}</small></div>
    </div>`;
  }).join('');
  return `<div class="board" role="region" aria-label="Available trains">
    <div class="board-head"><h2>${f.name} to ${t.name}</h2><span>${fmtDate(q.date)}</span><span>${CLASSES[q.cls].label}</span>${via.length ? `<span>Stops at ${via.join(', ')}</span>` : ''}</div>
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
  const f = st(tr.from), t = st(tr.to);
  const fr = fares(tr.km, q.cls);
  const list = paxList(q);
  const total = q.adults * fr.adult + q.children * fr.child;
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
            <button class="btn" type="submit">Pay ${kes(total)} and get tickets</button>
            <button class="btn ghost" type="button" data-action="nav" data-view="book">Back to trains</button>
          </div>
        </div>
      </form>
      <aside class="sum" aria-label="Trip summary">
        <h2>${f.name} to ${t.name}</h2>
        <dl>
          <div><dt>Train</dt><dd>${tr.num}</dd></div>
          <div><dt>Date</dt><dd>${fmtDate(tr.date)}</dd></div>
          <div><dt>Departs</dt><dd>${fmtT(tr.dep)}</dd></div>
          <div><dt>Arrives</dt><dd>${fmtT(tr.arr)}${tr.dayOffset ? ` (+${tr.dayOffset} day)` : ''}</dd></div>
          <div><dt>Class</dt><dd>${CLASSES[q.cls].label}</dd></div>
          ${q.adults ? `<div><dt>${q.adults} adult${q.adults > 1 ? 's' : ''}</dt><dd>${kes(q.adults * fr.adult)}</dd></div>` : ''}
          ${q.children ? `<div><dt>${q.children} child${q.children > 1 ? 'ren' : ''}</dt><dd>${kes(q.children * fr.child)}</dd></div>` : ''}
          ${q.infants ? `<div><dt>${q.infants} infant${q.infants > 1 ? 's' : ''}</dt><dd>Free</dd></div>` : ''}
          <div class="tot"><dt>Total</dt><dd>${kes(total)}</dd></div>
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
      <div class="t-head"><span class="b">Fastline</span><span class="c">${CLASSES[b.cls].label}</span></div>
      <div class="t-route">
        <div class="pt"><small>From</small><strong>${f.name}</strong></div><div class="ln" aria-hidden="true"></div>
        <div class="pt"><small>Destination</small><strong>${t.name}</strong></div>
      </div>
      <div class="t-grid">
        <div><small>Passenger name</small><b>${esc(p.name)}</b></div>
        <div><small>ID number</small><b>${esc(p.id || 'Not required')}</b></div>
        <div><small>Passenger type</small><b>${p.type}</b></div>
        <div><small>Train number</small><b>${b.trainNo}</b></div>
        <div><small>Boarding station</small><b>${f.name} Station</b></div>
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
    <div class="t-stub"><div class="no">${p.ticketNo}</div><small>Unique ticket number</small></div>
  </article>`;
}

function viewTicket(app) {
  const b = getBookings().find(x => x.id === state.currentBooking);
  if (!b) return go('tickets');
  const f = st(b.from), t = st(b.to);
  app.innerHTML = `<div class="wrap page">
    ${state.banner ? steps(3) : ''}
    ${state.banner ? `<div class="banner"><h2>Booking confirmed</h2><p>${b.passengers.length} ticket${b.passengers.length > 1 ? 's' : ''} for ${f.name} to ${t.name}, ${fmtDate(b.date)}. Total paid ${kes(b.total)}.</p>
      ${b.owner === 'guest' ? `<p class="fine" style="margin-top:.4rem">Guest tickets stay on this device. <button class="link" data-action="auth" data-tab="up">Create an account</button> to book as a registered user next time.</p>` : ''}</div>` : `<h1>Your tickets</h1>`}
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
  const past = depMs(b) < Date.now();
  return `<div class="bk">
    <div><h3>${f.name} to ${t.name}</h3>
      <p>${fmtDate(b.date)}, ${fmtT(b.dep)}. Train ${b.trainNo}. ${CLASSES[b.cls].label}.</p>
      <p>${b.passengers.map(p => esc(p.name)).join(', ')} <span class="tag">${b.passengers.map(p => p.ticketNo).join(', ')}</span></p></div>
    <div class="btns"><button class="btn sm" data-action="view-booking" data-id="${b.id}">View tickets</button>
      ${past ? '<span class="tag">Past trip</span>' : `<button class="btn sm ghost" data-action="cancel" data-id="${b.id}">Cancel</button>`}</div>
  </div>`;
}

function viewTickets(app) {
  const mine = getBookings().filter(b => b.owner === owner()).sort((a, b) => b.createdAt - a.createdAt);
  let lookupHtml = '';
  if (state.lookup === 'none') lookupHtml = `<p class="err" role="alert">No ticket found with that number on this device.</p>`;
  else if (state.lookup) { const b = getBookings().find(x => x.id === state.lookup); if (b) lookupHtml = bookingCard(b); }
  app.innerHTML = `<div class="wrap page">
    <h1>My tickets</h1>
    <div class="cols" style="grid-template-columns:1fr">
      <div class="panel">
        <h2>${state.user ? 'Your bookings' : 'Guest bookings on this device'}</h2>
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
      <div class="st-grid">${STATIONS.map(s => {
        const links = EDGES.filter(e => e[0] === s.id || e[1] === s.id).map(e => `${st(e[0] === s.id ? e[1] : e[0]).name} (${e[2]} km)`);
        return `<div class="st"><h3>${s.name}</h3><p>${s.county}</p><p>Direct link: ${links.join(', ')}</p></div>`;
      }).join('')}</div></div>
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
      <li>Arrive 45 minutes before departure.</li><li>Online booking closes 60 minutes before departure.</li>
      <li>You can cancel a booking from My tickets up to 60 minutes before departure.</li></ul></div>
  </div>`;
}

/* ---------- navigation ---------- */
function render() {
  const app = $('#app');
  ({ book: viewBook, checkout: viewCheckout, ticket: viewTicket, tickets: viewTickets, info: viewInfo }[state.view] || viewBook)(app);
  updateHeader();
}
function go(view) {
  state.view = view;
  if (view !== 'ticket') state.banner = false;
  if (view !== 'tickets') state.lookup = null;
  render();
  window.scrollTo(0, 0);
}

/* ---------- search form logic ---------- */
function updateCounters() {
  const s = state.search;
  const lim = { adults: s.adults + s.children >= 9, children: s.adults + s.children >= 9, infants: s.infants >= s.adults };
  ['adults', 'children', 'infants'].forEach(k => {
    const o = $('#c-' + k); if (o) o.textContent = s[k];
    const min = k === 'adults' ? 1 : 0;
    const minus = $(`[data-key="${k}"][data-delta="-1"]`), plus = $(`[data-key="${k}"][data-delta="1"]`);
    if (minus) minus.disabled = s[k] <= min;
    if (plus) plus.disabled = lim[k];
  });
}
function changeCount(key, delta) {
  const s = state.search; let v = s[key] + delta;
  v = Math.max(key === 'adults' ? 1 : 0, v);
  if (key === 'adults') v = Math.min(v, 9 - s.children);
  if (key === 'children') v = Math.min(v, 9 - s.adults);
  if (key === 'infants') v = Math.min(v, s.adults);
  s[key] = v;
  if (s.infants > s.adults) s.infants = s.adults;
  updateCounters();
}
function runSearch() {
  const q = { ...state.search }, err = $('#searchErr');
  err.textContent = '';
  if (q.from === q.to) { err.textContent = 'Choose two different stations for From and To.'; return; }
  if (!q.date || q.date < todayStr() || q.date > maxDate()) { err.textContent = 'Pick a travel date from today up to 90 days ahead.'; return; }
  state.results = { q, trains: makeTrains(q.from, q.to, q.date), route: route(q.from, q.to) };
  const box = $('#results'); box.innerHTML = resultsHtml();
  box.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- checkout ---------- */
function genTicketNo(existing) {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    let s = '';
    for (let i = 0; i < 8; i++) {
      let r; try { r = crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { r = Math.floor(Math.random() * 4294967296); }
      s += c[r % c.length];
    }
    const no = 'FL-' + s.slice(0, 4) + '-' + s.slice(4);
    if (!existing.has(no)) return no;
  }
}
function submitCheckout(form) {
  const { train: tr, q } = state.selected;
  const fd = new FormData(form);
  const fail = (msg, field) => { $('#checkoutErr').textContent = msg; const el = field && form.elements[field]; if (el) el.focus(); };
  const list = paxList(q), pax = [], seen = new Set();
  for (let k = 0; k < list.length; k++) {
    const p = list[k], label = `${p.type} ${p.n}`;
    const name = String(fd.get('name-' + k) || '').trim().replace(/\s+/g, ' ');
    const id = String(fd.get('id-' + k) || '').trim().toUpperCase();
    if (name.length < 3 || !/^[\p{L}][\p{L}\s'.-]+$/u.test(name)) return fail(`Enter the full name of ${label}.`, 'name-' + k);
    if (p.type !== 'Infant' && !id) return fail(`Enter the ID number for ${label}.`, 'id-' + k);
    if (id && !/^[A-Z0-9\/-]{5,20}$/.test(id)) return fail(`The ID number for ${label} should be 5 to 20 letters or digits.`, 'id-' + k);
    if (id && seen.has(id)) return fail(`${label} has the same ID number as another passenger.`, 'id-' + k);
    if (id) seen.add(id);
    pax.push({ name, id, type: p.type, fare: p.type === 'Adult' ? fares(tr.km, q.cls).adult : p.type === 'Child' ? fares(tr.km, q.cls).child : 0 });
  }
  const ph = String(fd.get('phone') || '').replace(/[\s-]/g, '');
  const m = ph.match(/^(?:\+?254|0)([17]\d{8})$/);
  if (!m) return fail('Enter a valid Kenyan phone number, like 0712 345 678.', 'phone');
  const email = String(fd.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('Enter a valid email address.', 'email');
  if (!fd.get('agree')) return fail('Tick the box to accept the ID and ticket rules.', 'agree');
  if (seatsLeft(tr.num, q.date, q.cls) < q.adults + q.children) return fail('Those seats were just taken. Go back and pick another train.');

  const all = getBookings();
  const used = new Set(all.flatMap(b => b.passengers.map(p => p.ticketNo)));
  pax.forEach(p => { p.ticketNo = genTicketNo(used); used.add(p.ticketNo); });
  const total = pax.reduce((n, p) => n + p.fare, 0);
  const booking = { id: 'B' + Date.now().toString(36), owner: owner(), createdAt: Date.now(), trainNo: tr.num, from: tr.from, to: tr.to,
    date: tr.date, dep: tr.dep, arr: tr.arr, dayOffset: tr.dayOffset, cls: q.cls, passengers: pax, total,
    contact: { phone: '+254' + m[1], email } };
  all.push(booking); store.set('fl_bookings', all);
  state.currentBooking = booking.id; state.banner = true; state.selected = null; state.results = null;
  state.view = 'ticket'; render(); window.scrollTo(0, 0);
}

/* ---------- auth ---------- */
async function hashPw(email, pw) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email + ':' + pw));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return btoa(unescape(encodeURIComponent(email + ':' + pw))); }
}
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
    <p class="fine">Accounts are saved in this browser only until the site is connected to a server.</p>`;
}
function openAuth(tab) { state.authTab = tab; renderAuth(); const d = $('#authDlg'); if (!d.open) d.showModal(); }
async function doRegister(form) {
  const fd = new FormData(form), err = $('#authErr');
  const name = String(fd.get('name') || '').trim().replace(/\s+/g, ' ');
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const pw = String(fd.get('pw') || ''), pw2 = String(fd.get('pw2') || '');
  if (name.length < 3) return err.textContent = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err.textContent = 'Enter a valid email address.';
  if (pw.length < 8) return err.textContent = 'Use a password with at least 8 characters.';
  if (pw !== pw2) return err.textContent = 'The passwords do not match.';
  const users = store.get('fl_users', {});
  if (users[email]) return err.textContent = 'An account with this email already exists. Sign in instead.';
  users[email] = { name, hash: await hashPw(email, pw) };
  store.set('fl_users', users); store.set('fl_session', email);
  state.user = { email, name };
  $('#authDlg').close(); toast('Welcome to Fastline, ' + name.split(' ')[0] + '.'); render();
}
async function doLogin(form) {
  const fd = new FormData(form), err = $('#authErr');
  const email = String(fd.get('email') || '').trim().toLowerCase(), pw = String(fd.get('pw') || '');
  const users = store.get('fl_users', {});
  if (!email || !pw) return err.textContent = 'Enter your email and password.';
  if (!users[email] || users[email].hash !== await hashPw(email, pw)) return err.textContent = 'Email or password is incorrect.';
  store.set('fl_session', email);
  state.user = { email, name: users[email].name };
  $('#authDlg').close(); toast('Signed in as ' + state.user.name.split(' ')[0] + '.'); render();
}

/* ---------- events ---------- */
const actions = {
  nav: el => go(el.dataset.view),
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
  logout: () => { store.set('fl_session', null); state.user = null; toast('You have signed out.'); render(); },
  print: () => window.print(),
  'view-booking': el => { state.currentBooking = el.dataset.id; state.banner = false; go('ticket'); },
  cancel: el => {
    const b = getBookings().find(x => x.id === el.dataset.id); if (!b) return;
    if (depMs(b) - Date.now() < 3600e3) { toast('Bookings can only be cancelled up to 60 minutes before departure.'); return; }
    if (!confirm(`Cancel your ${st(b.from).name} to ${st(b.to).name} booking on ${fmtDate(b.date)}?`)) return;
    store.set('fl_bookings', getBookings().filter(x => x.id !== b.id));
    toast('Booking cancelled.'); render();
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  actions[el.dataset.action]?.(el, e);
});
document.addEventListener('change', e => {
  const f = e.target.dataset?.field; if (!f) return;
  state.search[f] = e.target.value;
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'searchForm') runSearch();
  else if (id === 'checkoutForm') submitCheckout(e.target);
  else if (id === 'regForm') doRegister(e.target);
  else if (id === 'loginForm') doLogin(e.target);
  else if (id === 'lookupForm') {
    const no = String(new FormData(e.target).get('no') || '').trim().toUpperCase();
    const b = no && getBookings().find(x => x.passengers.some(p => p.ticketNo === no));
    state.lookup = b ? b.id : 'none'; render();
  }
});

loadSession();
render();
})();
