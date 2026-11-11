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
  { id: 'MSA', name: 'Mombasa', county: 'Mombasa County' },
  { id: 'MCK', name: 'Machakos', county: 'Machakos County' }
];
const EDGES = [['ELD', 'NKR', 160], ['KSM', 'NKR', 190], ['NKR', 'NBO', 160], ['NBO', 'MSA', 480], ['NBO', 'MCK', 60]];
const CLASSES = {
  economy:  { label: 'Economy class',  rate: 3,   cap: 120 },
  business: { label: 'Business class', rate: 6.5, cap: 40 },
  first:    { label: 'First class',    rate: 9,   cap: 16 }
};
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
    const left = 100; // Fake seats for now
    let btn = `<button class="btn" data-action="select" data-i="${i}">Select</button>`;
    return `<div class="trow">
      <div class="cell"><small>Train number</small><b>${tr.num}</b></div>
      <div class="cell"><small>Departs</small><b>${fmtT(tr.dep)}</b></div>
      <div class="cell"><small>Arrives</small><b>${fmtT(tr.arr)}</b></div>
      <div class="cell"><small>Duration</small><b class="plain">${fmtDur(tr.dur)}</b></div>
      <div class="cell"><small>${paying > 1 ? 'Total fare' : 'Fare'}</small><b class="plain">${kes(total)}</b><small>${kes(fr.adult)} per adult</small></div>
      <div class="cell act">${btn}<small class="${left < 15 ? 'low' : ''}" style="margin-top:.35rem;text-align:center">${left} seats left</small></div>
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
              <label class="fld"><span>ID number</span><input name="id-${k}" autocomplete="off"></label>
            </div></fieldset>`).join('')}
        </div>
        <div class="actions" style="margin:0">
          <button class="btn" type="submit">Pay ${kes(total)} and get tickets</button>
          <button class="btn ghost" type="button" data-action="nav" data-view="book">Back to trains</button>
        </div>
      </form>
      <aside class="sum" aria-label="Trip summary">
        <h2>${f.name} to ${t.name}</h2>
        <dl>
          <div><dt>Train</dt><dd>${tr.num}</dd></div>
          <div><dt>Date</dt><dd>${fmtDate(tr.date)}</dd></div>
          <div><dt>Departs</dt><dd>${fmtT(tr.dep)}</dd></div>
          <div><dt>Class</dt><dd>${CLASSES[q.cls].label}</dd></div>
          <div class="tot"><dt>Total</dt><dd>${kes(total)}</dd></div>
        </dl>
      </aside>
    </div>
  </div>`;
}

function viewTicket(app) {
  // This is the page shown immediately after a successful booking
  app.innerHTML = `<div class="wrap page">
    <h1>Booking Successful!</h1>
    <div class="panel">
      <h2>Your ticket is confirmed</h2>
      <p>You can view all your tickets by clicking <b>My tickets</b> in the menu above.</p>
      <button class="btn" data-action="nav" data-view="tickets">Go to My tickets</button>
    </div>
  </div>`;
}

async function viewTickets(app) {
  app.innerHTML = `<div class="wrap page">
    <h1>My tickets</h1>
    <div class="panel" id="ticketsList"><p>Loading your tickets...</p></div>
  </div>`;

  if (!state.user || !state.user.id) {
    $('#ticketsList').innerHTML = '<p>Please sign in to view your tickets.</p>';
    return;
  }

  try {
    const response = await fetch(`/FastLine/fastline/my_tickets.php?api=1&user_id=${state.user.id}`);
    const data = await response.json();
    
    if (data.success && data.bookings.length > 0) {
      let html = '<h2>Your bookings</h2>';
      data.bookings.forEach(b => {
        html += `
          <div class="bk" style="border-bottom: 1px solid #ccc; padding: 15px 0;">
            <div>
              <h3>${b.origin} to ${b.destination}</h3>
              <p>Ref: <b>${b.booking_ref}</b> | Train: ${b.train_number} (${b.train_name})</p>
              <p>Date: ${b.departure_time} | Passenger: ${b.passenger_name}</p>
            </div>
            <div class="btns">
              <span class="tag" style="background:#4CAF50; color:white;">${b.status.toUpperCase()}</span>
            </div>
          </div>
        `;
      });
      $('#ticketsList').innerHTML = html;
    } else {
      $('#ticketsList').innerHTML = '<p>No bookings yet. <button class="btn" data-action="nav" data-view="book">Book a train</button></p>';
    }
  } catch (e) {
    $('#ticketsList').innerHTML = '<p class="err">Could not load your tickets right now.</p>';
  }
}

async function viewInfo(app) {
  app.innerHTML = `<div class="wrap page">
    <h1>Stations and travel rules</h1>
    <div class="panel" id="stationsList"><p>Loading stations...</p></div>
    
    <div class="panel"><h2>Passenger types</h2>
      <table><thead><tr><th>Type</th><th>Age</th><th>Fare</th><th>Seat</th></tr></thead><tbody>
        <tr><td>Infant</td><td>Under 2 years</td><td>Free</td><td>On an adult's lap</td></tr>
        <tr><td>Child</td><td>2 to 17 years</td><td>Half fare</td><td>Own seat</td></tr>
        <tr><td>Adult</td><td>18 years and above</td><td>Full fare</td><td>Own seat</td></tr>
      </tbody></table></div>
    <div class="panel"><h2>Ticket validity</h2>
      <ul><li>Tickets are valid only for the selected train and date.</li><li>Arrive 45 minutes before departure.</li><li>Cancel bookings up to 60 minutes before departure.</li></ul></div>
  </div>`;

  try {
    const response = await fetch('/FastLine/fastline/info.php?api=1');
    const data = await response.json();
    
    if (data.success && data.stations.length > 0) {
      let html = '<h2>Stations</h2><div class="st-grid">';
      data.stations.forEach(s => {
        html += `
          <div class="st">
            <h3>${s.name}</h3>
            <p>${s.city} County</p>
          </div>
        `;
      });
      html += '</div>';
      $('#stationsList').innerHTML = html;
    } else {
      $('#stationsList').innerHTML = '<p>Could not load stations.</p>';
    }
  } catch (e) {
    $('#stationsList').innerHTML = '<p class="err">Could not connect to the server.</p>';
  }
}
/* ---------- navigation ---------- */
function render() {
  const app = $('#app');
  const viewFunction = { 
    book: viewBook, 
    checkout: viewCheckout, 
    ticket: viewTicket, 
    tickets: viewTickets, 
    info: viewInfo 
  }[state.view] || viewBook;
  
  viewFunction(app);
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

/* ---------- FIXED SEARCH FUNCTION ---------- */
async function runSearch() {
  const q = { ...state.search }, err = $('#searchErr');
  err.textContent = '';
  if (q.from === q.to) { err.textContent = 'Choose two different stations for From and To.'; return; }
  
  const box = $('#results'); 
  if (box) box.innerHTML = '<p style="text-align:center; padding: 2rem;">Searching real database...</p>';

  try {
    const map = { ELD: 7, NKR: 5, NBO: 1, KSM: 4, MSA: 2, MCK: 10 };
    const url = `/FastLine/fastline/search.php?api=1&origin=${map[q.from]}&destination=${map[q.to]}&date=${q.date}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (!data.trains || data.trains.length === 0) {
        if (box) box.innerHTML = '<p class="err">No trains found for this date.</p>';
        return;
    }

    const realTrains = data.trains.map(t => {
       const getMinutes = (timeString) => {
           if (!timeString) return 0;
           const timePart = timeString.split(' ')[1]; 
           if (!timePart) return 0;
           const [hours, minutes] = timePart.split(':');
           return (parseInt(hours) * 60) + parseInt(minutes);
       };

            let depMins = getMinutes(t.departure_time);
       let arrMins = getMinutes(t.arrival_time);
       let dayOffset = 0;
       
       // If arrival is earlier than departure, it arrives the next day
       if (arrMins < depMins) {
           arrMins += 1440; // Add 24 hours in minutes
           dayOffset = 1;
       }

       return {
          num: t.train_number,
          dep: depMins, 
          arr: arrMins % 1440,
          dayOffset: dayOffset,
          dur: arrMins - depMins, 
          km: 100,
          path: [q.from, q.to],
          from: q.from,
          to: q.to,
          date: q.date,
          departed: false
       };
    });

    state.results = { q, trains: realTrains, route: route(q.from, q.to) };
    if (box) {
        box.innerHTML = resultsHtml();
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (err) err.textContent = 'Could not connect to the database. Is the PHP server running?';
    if (box) box.innerHTML = '';
  }
}

/* ---------- events ---------- */
/* ---------- REAL AUTHENTICATION LOGIC ---------- */
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
      <p class="err" id="authErr" role="alert"></p>
      <button class="btn block" type="submit">${reg ? 'Create account' : 'Sign in'}</button>
    </form>
  `;
}
function openAuth(tab) { state.authTab = tab; renderAuth(); const d = $('#authDlg'); if (!d.open) d.showModal(); }

async function doRegister(form) {
  const fd = new FormData(form), err = $('#authErr');
  const name = String(fd.get('name') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const pw = String(fd.get('pw') || '');
  
  if (name.length < 3) return err.textContent = 'Enter your full name.';
  if (pw.length < 8) return err.textContent = 'Use a password with at least 8 characters.';

  try {
    const response = await fetch('/FastLine/fastline/register.php?api=1', {
      method: 'POST',
      body: JSON.stringify({ name, email, pw })
    });
    const data = await response.json();
    
    if (data.success) {
      state.user = { email: data.email, name: data.name };
      $('#authDlg').close(); toast('Welcome to Fastline, ' + data.name); render();
    } else {
      err.textContent = data.message || 'Registration failed.';
    }
  } catch (e) { err.textContent = 'Could not connect to the server.'; }
}

async function doLogin(form) {
  const fd = new FormData(form), err = $('#authErr');
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const pw = String(fd.get('pw') || '');
  
  if (!email || !pw) return err.textContent = 'Enter your email and password.';

  try {
   const response = await fetch('login.php?api=1', {
      method: 'POST',
      body: JSON.stringify({ email, pw })
    });
    const data = await response.json();
    
    if (data.success) {
   state.user = { id: data.id, email: data.email, name: data.name };
      $('#authDlg').close(); toast('Signed in as ' + data.name); render();
    } else {
      err.textContent = data.message || 'Invalid login.';
    }
  } catch (e) { err.textContent = 'Could not connect to the server.'; }
}

const actions = {
  nav: el => go(el.dataset.view),
  swap: () => { const s = state.search; [s.from, s.to] = [s.to, s.from]; render(); },
  count: el => changeCount(el.dataset.key, +el.dataset.delta),
  select: el => { state.selected = { train: state.results.trains[+el.dataset.i], q: state.results.q }; go('checkout'); },
    auth: el => openAuth(el.dataset.tab || 'in'),
  'auth-tab': el => openAuth(el.dataset.tab),
  'close-auth': () => $('#authDlg').close(),
  logout: () => { store.set('fl_session', null); state.user = null; render(); }
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
  if (e.target.id === 'searchForm') runSearch();
    else if (e.target.id === 'regForm') doRegister(e.target);
  else if (e.target.id === 'loginForm') doLogin(e.target);
    else if (e.target.id === 'checkoutForm') {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    
    // Get the selected train from our state
    const selected = state.selected;
    if (!selected) return alert('No train selected.');
    
    const tr = selected.train;
    
    // We need the real database ID for the schedule. 
    // Since we don't have it in the frontend yet, we will use the train number for this test.
    // In a fully finished app, search.php should return the schedule `id`.
    const schedule_id = tr.schedule_id || 1; 
    
    const passengerName = form.querySelector('input[name="name-0"]').value;
    const userId = state.user ? state.user.id || 0 : 0; // 0 = guest
    
    btn.textContent = 'Processing...';
    btn.disabled = true;

    fetch('/FastLine/fastline/book.php?api=1', {
        method: 'POST',
        body: JSON.stringify({ 
            schedule_id: schedule_id, 
            user_id: userId, 
            passenger_name: passengerName 
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Booking Successful! Your reference is: ' + data.booking_ref);
            go('book'); // Go back to home
        } else {
            alert('Booking failed: ' + data.message);
            btn.textContent = 'Pay and get tickets';
            btn.disabled = false;
        }
    })
    .catch(err => {
        alert('Error connecting to server.');
        btn.textContent = 'Pay and get tickets';
        btn.disabled = false;
    });
  }
});

loadSession();
render();
})();