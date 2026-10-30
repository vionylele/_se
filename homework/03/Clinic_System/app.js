// Clinic System - application logic (ES module)
// Architected and generated with assistance from Claude (Anthropic)

const SUPABASE_URL = 'https://xwchiameamzcwpbwyfea.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Y2hpYW1lYW16Y3dwYnd5ZmVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxNTAyODYsImV4cCI6MjEwNzcyNjI4Nn0.KlwXGphzy6ptCfnniV2Lqm-sDgHfw0sv7NE_FqBlRTk';
const ADMIN_EMAIL = 'vionylee07@gmail.com';
// Canonical app URL (folder, no index.html) used as the email-confirmation redirect target
const APP_URL = location.origin + location.pathname.replace(/index\.html$/, '');
const DEPARTMENTS = ['General Medicine', 'Family Medicine', 'ENT', 'Pediatrics'];
const STATUSES = ['Scheduled', 'Rescheduled', 'Completed', 'Cancelled', 'No-Show'];

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  session: null, profile: null, isAdmin: false, view: 'book', tab: 'upcoming',
  authMode: 'signin', appts: [], patients: [], channel: null,
  filters: { q: '', date: '', dept: '', status: '' },
};

/* ------------------------- Business rules ------------------------- */
// 30-min slots from 08:00; last slot 20:30. Breaks: 12:00-13:30 and 17:00-18:00 are excluded.
const SLOTS = [];
for (let m = 480; m <= 1230; m += 30) {
  if ((m >= 720 && m < 810) || (m >= 1020 && m < 1080)) continue;
  SLOTS.push(m);
}
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t) => { const [h, m] = t.split(':'); return +h * 60 + +m; };

function taipeiNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: +g('hour') * 60 + +g('minute') };
}
const dayNum = (d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? +n - 1 : +n))) / 86400000;

/** Returns an error string, or '' when the slot is valid (hours, breaks, 1-hour lead time). */
function slotError(date, m, isAdmin = false) {
  if (!SLOTS.includes(m)) return 'Choose a slot within clinic hours (08:00-21:00), outside the 12:00-13:30 and 17:00-18:00 breaks.';
  const now = taipeiNow();
  const diff = (dayNum(date) - dayNum(now.date)) * 1440 + m - now.minutes;
  if (!isAdmin && diff < 60) return 'Bookings and changes must be made at least 1 hour before the appointment time.';
  return '';
}

/* ------------------------------ UI helpers ------------------------------ */
function toast(msg, type = 'info') {
  const colors = { info: 'bg-pine-800', success: 'bg-emerald-700', error: 'bg-red-700' };
  const el = document.createElement('div');
  el.className = `${colors[type]} text-white text-sm rounded-lg px-4 py-3 shadow-lg`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
const profileComplete = (p) => !!(p && p.full_name && p.national_id && p.date_of_birth && p.gender && p.phone && p.emergency_contact && p.emergency_phone);
const displayName = () => state.profile?.full_name?.trim() || state.session?.user?.user_metadata?.full_name || state.session?.user?.email || '';
const badge = (s) => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;
const icon = (n, c = 'w-4 h-4') => `<i data-lucide="${n}" class="${c}"></i>`;
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
const apptTs = (a) => `${a.appointment_date}T${a.appointment_time.slice(0, 5)}`;

function openModal(html, wide = false) {
  $('#modal-root').innerHTML = `<div class="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" data-action="close-modal-bg">
    <div class="modal-panel card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto p-6 shadow-2xl">${html}</div></div>`;
  window.lucide?.createIcons();
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };

/* ------------------------------ Data layer ------------------------------ */
async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle();
  state.profile = data;
}
async function loadAppts() {
  const q = sb.from('appointments').select('*, profiles(full_name, email, phone)')
    .order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false });
  const { data, error } = await q;
  if (error) return toast(error.message, 'error');
  state.appts = data || [];
}
async function loadPatients() {
  const { data, error } = await sb.from('profiles').select('*').neq('email', ADMIN_EMAIL).order('created_at', { ascending: false });
  if (error) return toast(error.message, 'error');
  state.patients = data || [];
}
function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);
  state.channel = sb.channel('appts-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async (payload) => {
      await loadAppts();
      if (state.isAdmin) await loadPatients();
      if (['appointments', 'schedule', 'dashboard'].includes(state.view)) render();
      toast(`Appointment ${payload.eventType === 'INSERT' ? 'created' : payload.eventType === 'DELETE' ? 'removed' : 'updated'} (live update).`);
    }).subscribe();
}

/* ------------------------------ Auth flow ------------------------------ */
async function onSession(session) {
  state.session = session;
  if (!session) {
    if (state.channel) sb.removeChannel(state.channel);
    state.profile = null; state.appts = []; state.isAdmin = false;
    return render();
  }
  state.isAdmin = session.user.email.toLowerCase() === ADMIN_EMAIL;
  await loadProfile();
  // Safety net: if the DB trigger did not copy the sign-up name, take it from the account metadata
  const metaName = session.user.user_metadata?.full_name;
  if (state.profile && !state.profile.full_name && metaName) {
    const { data } = await sb.from('profiles').update({ full_name: metaName }).eq('id', session.user.id).select().maybeSingle();
    if (data) state.profile = data;
  }
  await loadAppts();
  if (state.isAdmin) { await loadPatients(); state.view = 'dashboard'; }
  else state.view = profileComplete(state.profile) ? 'book' : 'profile';
  subscribeRealtime();
  render();
  toast(`Welcome, ${displayName()}!`, 'success');
  if (!state.isAdmin && !profileComplete(state.profile)) toast('Please complete your profile before booking.', 'info');
}
sb.auth.onAuthStateChange((event, session) => {
  // Defer to avoid deadlocks inside the auth callback
  setTimeout(() => {
    const sameUser = session && state.session && session.user.id === state.session.user.id;
    // Supabase re-fires SIGNED_IN / TOKEN_REFRESHED when the tab regains focus; re-rendering then would wipe open forms.
    if (sameUser && event !== 'SIGNED_OUT') { state.session = session; return; }
    onSession(session);
  }, 0);
});

/* ------------------------------ Views ------------------------------ */
function pwInput(id, autocomplete) {
  return `<div class="relative"><input id="${id}" name="${id}" type="password" minlength="6" required class="input pr-11" autocomplete="${autocomplete}">
    <button type="button" data-action="toggle-pw" data-target="${id}" class="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-pine-700" aria-label="Show password" title="Show password"><i data-lucide="eye" class="w-5 h-5"></i></button></div>`;
}

function authView() {
  const up = state.authMode === 'signup';
  return `<div class="min-h-screen grid md:grid-cols-2">
    <div class="hidden md:flex flex-col justify-between bg-pine-900 text-pine-50 p-12">
      <div class="flex items-center gap-2 text-lg font-semibold">${icon('stethoscope', 'w-6 h-6')} Lele Clinic</div>
      <div>
        <h1 class="text-4xl font-bold leading-tight mb-4">See a doctor without the waiting room queue.</h1>
        <p class="text-pine-100/80 max-w-md">Book, reschedule, or cancel outpatient visits online. Open daily 08:00-21:00, with breaks 12:00-13:30 and 17:00-18:00.</p>
      </div>
      <p class="text-sm text-pine-100/60">Appointments must be made at least 1 hour in advance.</p>
    </div>
    <div class="flex items-center justify-center p-6">
      <form data-form="auth" class="w-full max-w-sm space-y-4">
        <h2 class="text-2xl font-bold">${up ? 'Create your account' : 'Sign in'}</h2>
        ${up ? `<div><label class="label" for="full_name">Full name (account name)</label><input id="full_name" name="full_name" type="text" required minlength="2" class="input" autocomplete="name" placeholder="As shown on your National ID / ARC"></div>` : ''}
        <div><label class="label" for="email">Email</label><input id="email" name="email" type="email" required class="input" autocomplete="email"></div>
        <div><label class="label" for="password">Password</label>${pwInput('password', up ? 'new-password' : 'current-password')}</div>
        ${up ? `<div><label class="label" for="password2">Confirm password</label>${pwInput('password2', 'new-password')}</div>` : ''}
        <button class="btn btn-primary w-full justify-center" type="submit">${up ? 'Create account' : 'Sign in'}</button>
        ${up ? '' : `<button type="button" class="text-sm text-pine-700 underline w-full text-center" data-action="resend">Resend confirmation email</button>`}
        <p class="text-sm text-slate-600 text-center">${up ? 'Already registered?' : 'New patient?'}
          <button type="button" class="text-pine-700 font-semibold underline" data-action="toggle-auth">${up ? 'Sign in' : 'Create an account'}</button></p>
      </form>
    </div></div>`;
}

function layout(inner) {
  const nav = state.isAdmin
    ? [['dashboard', 'Dashboard', 'layout-dashboard'], ['schedule', 'Master Schedule', 'calendar-days'], ['patients', 'Patient Directory', 'users']]
    : [['book', 'Book Appointment', 'calendar-plus'], ['appointments', 'My Appointments', 'clipboard-list'], ['profile', 'My Profile', 'user-round']];
  return `<header class="bg-pine-900 text-white">
    <div class="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2 font-semibold">${icon('stethoscope', 'w-5 h-5')} Lele Clinic</div>
      <div class="flex items-center gap-3 text-sm">
        <span class="hidden sm:inline text-pine-100" title="${esc(state.session.user.email)}">${esc(displayName())}</span>
        <span class="badge ${state.isAdmin ? 'bg-amber-200 text-amber-900' : 'bg-pine-100 text-pine-800'}">${state.isAdmin ? 'Admin' : 'Patient'}</span>
        <button class="btn btn-ghost !py-1" data-action="signout">${icon('log-out')} Sign out</button>
      </div></div>
    <nav class="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
      ${nav.map(([k, l, i]) => `<button data-action="nav" data-view="${k}" class="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-t-lg whitespace-nowrap ${state.view === k ? 'bg-[#F6F8F7] text-pine-800' : 'text-pine-100 hover:bg-pine-800'}">${icon(i)} ${l}</button>`).join('')}
    </nav></header>
    <main class="max-w-6xl mx-auto px-4 py-6">${inner}</main>`;
}

const deptOptions = (sel = '') => `<option value="">Select department</option>` + DEPARTMENTS.map((d) => `<option ${d === sel ? 'selected' : ''}>${d}</option>`).join('');

function bookView() {
  const today = taipeiNow().date;
  return `<div class="grid lg:grid-cols-3 gap-6">
    <form data-form="book" class="card p-6 lg:col-span-2 space-y-4">
      <h2 class="text-xl font-bold">Book an appointment</h2>
      <div class="grid sm:grid-cols-2 gap-4">
        <div><label class="label" for="b-dept">Medical department</label><select id="b-dept" name="department" required class="input" data-slot-source>${deptOptions()}</select></div>
        <div><label class="label" for="b-date">Date</label><input id="b-date" name="date" type="date" min="${today}" required class="input" data-slot-source></div>
      </div>
      <div><span class="label">Time slot (30 minutes)</span>
        <div id="book-slots" class="grid grid-cols-4 sm:grid-cols-6 gap-2"></div>
        <input type="hidden" name="time" id="b-time"></div>
      <div><label class="label" for="b-cc">Chief complaint / symptoms</label><textarea id="b-cc" name="complaint" required rows="3" class="input" placeholder="e.g. Sore throat and fever for 2 days"></textarea></div>
      <div><label class="label" for="b-notes">Notes</label><textarea id="b-notes" name="notes" required rows="2" class="input" placeholder="Medications you take, preferred doctor, other details (write 'None' if not applicable)"></textarea></div>
      <button class="btn btn-primary" type="submit">${icon('calendar-check')} Confirm booking</button>
    </form>
    <aside class="card p-6 text-sm space-y-3 h-fit">
      <h3 class="font-bold text-base">Clinic schedule</h3>
      <p><b>Open:</b> 08:00 - 21:00 (last slot 20:30)</p>
      <p><b>Lunch break:</b> 12:00 - 13:30</p>
      <p><b>Dinner break:</b> 17:00 - 18:00</p>
      <p class="text-slate-600">Book or reschedule at least <b>1 hour</b> before your slot. Greyed-out times are unavailable or already booked.</p>
    </aside></div>`;
}

function patientApptList() {
  const now = taipeiNow(); const nowIso = `${now.date}T${fmt(now.minutes)}`;
  const tabs = {
    upcoming: ['Upcoming', (a) => ['Scheduled', 'Rescheduled'].includes(a.status) && apptTs(a) >= nowIso],
    past: ['Past Visits', (a) => a.status === 'Completed' || (['Scheduled', 'Rescheduled'].includes(a.status) && apptTs(a) < nowIso)],
    rescheduled: ['Rescheduled', (a) => a.reschedule_count > 0],
    cancelled: ['No-Show / Cancelled', (a) => ['Cancelled', 'No-Show'].includes(a.status)],
  };
  const rows = state.appts.filter(tabs[state.tab][1]);
  return `<div class="flex flex-wrap gap-2 mb-4">${Object.entries(tabs).map(([k, [l, f]]) => `<button data-action="tab" data-tab="${k}" class="btn ${state.tab === k ? 'btn-primary' : 'btn-ghost'}">${l} <span class="opacity-70">(${state.appts.filter(f).length})</span></button>`).join('')}</div>
  <div class="space-y-3">${rows.length ? rows.map((a) => {
    const active = ['Scheduled', 'Rescheduled'].includes(a.status) && apptTs(a) >= nowIso;
    return `<div class="card p-4 flex flex-wrap items-start justify-between gap-3">
      <div><div class="flex items-center gap-2 mb-1"><b>${fmtDate(a.appointment_date)} at ${a.appointment_time.slice(0, 5)}</b> ${badge(a.status)}</div>
        <p class="text-sm text-slate-600">${esc(a.department)} - ${esc(a.chief_complaint)}</p>
        ${a.notes ? `<p class="text-xs text-slate-500 mt-1">Notes: ${esc(a.notes)}</p>` : ''}
        ${a.cancellation_reason ? `<p class="text-xs text-red-700 mt-1">Reason (${esc(a.cancelled_by)}): ${esc(a.cancellation_reason)}</p>` : ''}</div>
      ${active ? `<div class="flex gap-2"><button class="btn btn-ghost" data-action="reschedule" data-id="${a.id}">${icon('calendar-clock')} Reschedule</button>
        <button class="btn btn-danger" data-action="cancel" data-id="${a.id}">${icon('x')} Cancel</button></div>` : ''}</div>`;
  }).join('') : `<div class="card p-8 text-center text-slate-500">No appointments in this view. Book a visit from the "Book Appointment" tab.</div>`}</div>`;
}

function profileView() {
  const p = state.profile || {};
  const f = (id, label, val, type = 'text', req = false) => `<div><label class="label" for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${esc(val)}" ${req ? 'required' : ''} class="input"></div>`;
  return `<form data-form="profile" class="card p-6 space-y-4 max-w-3xl">
    <h2 class="text-xl font-bold">My profile</h2>
    <div class="grid sm:grid-cols-2 gap-4">
      ${f('full_name', 'Full name', p.full_name, 'text', true)}
      ${f('national_id', 'Taiwan National ID / ARC number', p.national_id, 'text', true)}
      ${f('date_of_birth', 'Date of birth', p.date_of_birth, 'date', true)}
      <div><label class="label" for="gender">Gender</label><select id="gender" name="gender" required class="input">${['', 'Male', 'Female', 'Other'].map((g) => `<option value="${g}" ${p.gender === g ? 'selected' : ''}>${g || 'Select gender'}</option>`).join('')}</select></div>
      ${f('phone', 'Phone number', p.phone, 'tel', true)}
      <div><label class="label">Email</label><input class="input bg-slate-100" value="${esc(p.email || state.session.user.email)}" disabled></div>
      ${f('emergency_contact', 'Emergency contact name', p.emergency_contact, 'text', true)}
      ${f('emergency_phone', 'Emergency contact phone', p.emergency_phone, 'tel', true)}
    </div>
    <div><label class="label" for="medical_notes">Medical allergies / chronic conditions</label><textarea id="medical_notes" name="medical_notes" rows="3" class="input" placeholder="e.g. Penicillin allergy; Type 2 diabetes">${esc(p.medical_notes)}</textarea></div>
    <button class="btn btn-primary" type="submit">${icon('save')} Save profile</button></form>`;
}

function dashboardView() {
  const today = taipeiNow().date;
  const todayN = state.appts.filter((a) => a.appointment_date === today && a.status !== 'Cancelled').length;
  const cancelled = state.appts.filter((a) => a.status === 'Cancelled').length;
  const rate = state.appts.length ? ((cancelled / state.appts.length) * 100).toFixed(1) : '0.0';
  const stat = (l, v, i) => `<div class="card p-5 flex items-center gap-4"><div class="p-3 rounded-lg bg-pine-50 text-pine-700">${icon(i, 'w-6 h-6')}</div><div><p class="text-3xl font-bold">${v}</p><p class="text-sm text-slate-600">${l}</p></div></div>`;
  return `<div class="grid sm:grid-cols-3 gap-4 mb-6">${stat('Registered patients', state.patients.length, 'users')}${stat("Today's appointments", todayN, 'calendar-check')}${stat('Cancellation rate', rate + '%', 'percent')}</div>
  <div class="card p-5"><h3 class="font-bold mb-3">Today's schedule</h3>${scheduleTable(state.appts.filter((a) => a.appointment_date === today).sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)), true)}</div>`;
}

function scheduleTable(rows, compact = false) {
  if (!rows.length) return `<p class="text-slate-500 text-sm py-6 text-center">No appointments found.</p>`;
  return `<div class="overflow-x-auto"><table class="w-full text-sm text-left"><thead class="text-slate-500 border-b"><tr>
    <th class="py-2 pr-3">Date / time</th><th class="pr-3">Patient</th><th class="pr-3">Department</th><th class="pr-3">Complaint</th><th class="pr-3">Status</th>${compact ? '' : '<th>Actions</th>'}</tr></thead><tbody>
    ${rows.map((a) => {
      const active = ['Scheduled', 'Rescheduled'].includes(a.status);
      return `<tr class="border-b last:border-0 align-top"><td class="py-2 pr-3 whitespace-nowrap">${a.appointment_date}<br><span class="text-slate-500">${a.appointment_time.slice(0, 5)}</span></td>
      <td class="pr-3">${esc(a.profiles?.full_name || '(no name)')}<br><span class="text-xs text-slate-500">${esc(a.profiles?.email)}</span></td>
      <td class="pr-3">${esc(a.department)}</td><td class="pr-3 max-w-[12rem]">${esc(a.chief_complaint)}${a.cancellation_reason ? `<br><span class="text-xs text-red-700">Cancelled: ${esc(a.cancellation_reason)}</span>` : ''}</td>
      <td class="pr-3">${badge(a.status)}</td>
      ${compact ? '' : `<td class="whitespace-nowrap"><div class="flex flex-nowrap items-center gap-1"><button class="btn btn-ghost !py-1 !px-2 !text-xs" data-action="edit-status" data-id="${a.id}">${icon('pencil', 'w-3.5 h-3.5')} Change status</button>${active ? `<button class="btn btn-ghost !py-1 !px-2 !text-xs" data-action="set-status" data-id="${a.id}" data-status="Completed">Completed</button>
        <button class="btn btn-ghost !py-1 !px-2 !text-xs" data-action="set-status" data-id="${a.id}" data-status="No-Show">No-Show</button>
        <button class="btn btn-danger !py-1 !px-2 !text-xs" data-action="cancel" data-id="${a.id}">Cancel</button>` : ''}</div></td>`}</tr>`;
    }).join('')}</tbody></table></div>`;
}

function filteredAppts() {
  const { q, date, dept, status } = state.filters;
  return state.appts.filter((a) => (!q || (a.profiles?.full_name || '').toLowerCase().includes(q.toLowerCase()) || (a.profiles?.email || '').toLowerCase().includes(q.toLowerCase()))
    && (!date || a.appointment_date === date) && (!dept || a.department === dept) && (!status || a.status === status));
}

function scheduleView() {
  const f = state.filters;
  return `<div class="card p-5"><div class="grid sm:grid-cols-4 gap-3 mb-4">
    <input class="input" placeholder="Search patient name or email" value="${esc(f.q)}" data-filter="q">
    <input class="input" type="date" value="${esc(f.date)}" data-filter="date">
    <select class="input" data-filter="dept"><option value="">All departments</option>${DEPARTMENTS.map((d) => `<option ${f.dept === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
    <select class="input" data-filter="status"><option value="">All statuses</option>${STATUSES.map((s) => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div id="sched-body">${scheduleTable(filteredAppts())}</div></div>`;
}

function patientsView() {
  return `<div class="card p-5 overflow-x-auto"><table class="w-full text-sm text-left"><thead class="text-slate-500 border-b"><tr>
    <th class="py-2 pr-3">Name</th><th class="pr-3">Email</th><th class="pr-3">Phone</th><th class="pr-3">Emergency contact</th><th class="pr-3">Visits</th><th></th></tr></thead><tbody>
    ${state.patients.map((p) => `<tr class="border-b last:border-0"><td class="py-2 pr-3">${esc(p.full_name || '(profile incomplete)')}</td><td class="pr-3">${esc(p.email)}</td><td class="pr-3">${esc(p.phone)}</td>
      <td class="pr-3">${esc(p.emergency_contact)} ${esc(p.emergency_phone)}</td><td class="pr-3">${state.appts.filter((a) => a.patient_id === p.id).length}</td>
      <td><button class="btn btn-ghost !py-1" data-action="patient-detail" data-id="${p.id}">${icon('eye')} Details</button></td></tr>`).join('') || '<tr><td colspan="6" class="py-6 text-center text-slate-500">No patients registered yet.</td></tr>'}
    </tbody></table></div>`;
}

function render() {
  const app = $('#app');
  if (!state.session) app.innerHTML = authView();
  else {
    const views = { book: bookView, appointments: patientApptList, profile: profileView, dashboard: dashboardView, schedule: scheduleView, patients: patientsView };
    app.innerHTML = layout(views[state.view]());
  }
  window.lucide?.createIcons();
  if (state.session) restoreDrafts();
}

/* ------------------------------ Form drafts ------------------------------ */
const DRAFT_FORMS = ['book', 'profile'];
const draftKey = (name) => `lele_clinic_draft:${state.session?.user?.id}:${name}`;
function saveDraft(form) {
  try { localStorage.setItem(draftKey(form.dataset.form), JSON.stringify(Object.fromEntries(new FormData(form)))); } catch { /* storage unavailable */ }
}
function clearDraft(name) { try { localStorage.removeItem(draftKey(name)); } catch { /* ignore */ } }
async function restoreDrafts() {
  for (const name of DRAFT_FORMS) {
    const form = document.querySelector(`form[data-form="${name}"]`); if (!form) continue;
    let d; try { d = JSON.parse(localStorage.getItem(draftKey(name)) || 'null'); } catch { d = null; }
    if (!d) continue;
    for (const [k, v] of Object.entries(d)) {
      const el = form.elements[k]; if (!el || k === 'time') continue;
      if (k === 'date' && v < taipeiNow().date) continue; // skip dates that are already in the past
      el.value = v;
    }
    if (name === 'book' && d.department && d.date && d.date >= taipeiNow().date) {
      await loadSlots('book-slots', d.date, d.department, 'b-time');
      const btn = d.time && form.querySelector(`.slot[data-time="${d.time}"]:not([disabled])`);
      if (btn) { $('#b-time').value = d.time; btn.classList.add('selected'); }
    }
  }
}

/* ------------------------------ Slot picker ------------------------------ */
async function loadSlots(boxId, date, dept, inputId, excludeId = null) {
  const box = $('#' + boxId); if (!box) return;
  $('#' + inputId).value = '';
  if (!date || !dept) { box.innerHTML = '<p class="col-span-full text-sm text-slate-500">Select a department and date to see available times.</p>'; return; }
  const { data, error } = await sb.rpc('get_taken_slots', { p_date: date, p_dept: dept });
  if (error) return toast(error.message, 'error');
  const taken = new Set((data || []).map((t) => (typeof t === 'string' ? t : t.appointment_time).slice(0, 5)));
  box.innerHTML = SLOTS.map((m) => {
    const t = fmt(m); const ok = !slotError(date, m, false) && !taken.has(t);
    return `<button type="button" class="slot" data-action="pick-slot" data-input="${inputId}" data-time="${t}" ${ok ? '' : 'disabled'}>${t}</button>`;
  }).join('');
}

/* ------------------------------ Modals ------------------------------ */
function rescheduleModal(a) {
  openModal(`<form data-form="reschedule" data-id="${a.id}" class="space-y-4"><h3 class="text-lg font-bold">Reschedule appointment</h3>
    <p class="text-sm text-slate-600">${esc(a.department)} - currently ${a.appointment_date} ${a.appointment_time.slice(0, 5)}</p>
    <div><label class="label" for="r-date">New date</label><input id="r-date" type="date" min="${taipeiNow().date}" required class="input"></div>
    <div><span class="label">New time slot</span><div id="resched-slots" class="grid grid-cols-4 gap-2"></div><input type="hidden" id="r-time"></div>
    <div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Keep current time</button><button class="btn btn-primary" type="submit">Confirm change</button></div></form>`);
  $('#r-date').addEventListener('change', (e) => loadSlots('resched-slots', e.target.value, a.department, 'r-time'));
  loadSlots('resched-slots', '', a.department, 'r-time');
}
function cancelModal(a) {
  openModal(`<form data-form="cancel" data-id="${a.id}" class="space-y-4"><h3 class="text-lg font-bold">Cancel appointment</h3>
    <p class="text-sm text-slate-600">${esc(a.department)} on ${a.appointment_date} at ${a.appointment_time.slice(0, 5)}</p>
    <div><label class="label" for="c-reason">Cancellation reason (required)</label><textarea id="c-reason" required minlength="3" rows="3" class="input"></textarea></div>
    <div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Keep appointment</button><button class="btn btn-danger" type="submit">Cancel appointment</button></div></form>`);
}
function statusModal(a) {
  openModal(`<form data-form="status" data-id="${a.id}" class="space-y-4"><h3 class="text-lg font-bold">Change appointment status</h3>
    <p class="text-sm text-slate-600">${esc(a.profiles?.full_name || a.profiles?.email || '')} - ${esc(a.department)} on ${a.appointment_date} at ${a.appointment_time.slice(0, 5)}<br>Current status: ${badge(a.status)}</p>
    <div><label class="label" for="s-status">New status</label><select id="s-status" class="input">${STATUSES.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div id="s-reason-wrap" class="${a.status === 'Cancelled' ? '' : 'hidden'}"><label class="label" for="s-reason">Cancellation reason (required)</label><textarea id="s-reason" rows="3" class="input">${esc(a.cancellation_reason || '')}</textarea></div>
    <div class="flex justify-end gap-2"><button type="button" class="btn btn-ghost" data-action="close-modal">Close</button><button class="btn btn-primary" type="submit">Save status</button></div></form>`);
}
function patientModal(p) {
  const hist = state.appts.filter((a) => a.patient_id === p.id);
  const row = (l, v) => `<div><p class="text-xs text-slate-500">${l}</p><p class="text-sm font-medium">${esc(v) || '-'}</p></div>`;
  openModal(`<div class="flex justify-between items-start mb-4"><h3 class="text-lg font-bold">${esc(p.full_name || p.email)}</h3><button class="btn btn-ghost !p-1" data-action="close-modal" aria-label="Close">${icon('x')}</button></div>
    <div class="grid sm:grid-cols-3 gap-3 mb-4">${row('Email', p.email)}${row('National ID / ARC', p.national_id)}${row('Date of birth', p.date_of_birth)}${row('Gender', p.gender)}${row('Phone', p.phone)}
      ${row('Emergency contact', p.emergency_contact)}${row('Emergency phone', p.emergency_phone)}<div class="sm:col-span-2">${row('Allergies / chronic conditions', p.medical_notes)}</div></div>
    <h4 class="font-bold mb-2">Appointment &amp; consultation history (${hist.length})</h4>
    ${hist.length ? `<div class="space-y-2">${hist.map((a) => `<div class="border rounded-lg p-3 text-sm"><div class="flex justify-between"><b>${a.appointment_date} ${a.appointment_time.slice(0, 5)} - ${esc(a.department)}</b>${badge(a.status)}</div>
      <p class="text-slate-600">${esc(a.chief_complaint)}</p>${a.notes ? `<p class="text-xs text-slate-500">Notes: ${esc(a.notes)}</p>` : ''}${a.cancellation_reason ? `<p class="text-xs text-red-700">Cancelled (${esc(a.cancelled_by)}): ${esc(a.cancellation_reason)}</p>` : ''}</div>`).join('')}</div>` : '<p class="text-sm text-slate-500">No appointments on record.</p>'}`, true);
}

/* ------------------------------ Events ------------------------------ */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const act = el.dataset.action; const id = el.dataset.id;
  const appt = () => state.appts.find((a) => a.id === id);
  if (act === 'close-modal-bg') { if (e.target === el) closeModal(); return; }
  if (act === 'close-modal') return closeModal();
  if (act === 'toggle-auth') { state.authMode = state.authMode === 'signin' ? 'signup' : 'signin'; return render(); }
  if (act === 'toggle-pw') {
    const input = $('#' + el.dataset.target); const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.title = show ? 'Hide password' : 'Show password';
    el.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" class="w-5 h-5"></i>`;
    return window.lucide?.createIcons();
  }
  if (act === 'resend') {
    const email = ($('#email')?.value || '').trim();
    if (!email) return toast('Enter your email address first, then click "Resend confirmation email".', 'error');
    el.disabled = true; setTimeout(() => { el.disabled = false; }, 30000); // avoid hitting email rate limits
    const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: APP_URL } });
    return error ? toast(error.message, 'error') : toast('A new confirmation email has been sent. Open the newest email and click its link once.', 'success');
  }
  if (act === 'signout') { await sb.auth.signOut(); return toast('You have been signed out.', 'success'); }
  if (act === 'nav') {
    if (el.dataset.view === 'book' && !profileComplete(state.profile)) { toast('Please complete your profile before booking.', 'error'); state.view = 'profile'; return render(); }
    state.view = el.dataset.view; return render();
  }
  if (act === 'tab') { state.tab = el.dataset.tab; return render(); }
  if (act === 'pick-slot') {
    $('#' + el.dataset.input).value = el.dataset.time;
    el.parentElement.querySelectorAll('.slot').forEach((b) => b.classList.toggle('selected', b === el));
    const f = el.closest('form[data-form]'); if (f && DRAFT_FORMS.includes(f.dataset.form)) saveDraft(f);
    return;
  }
  if (act === 'reschedule') return rescheduleModal(appt());
  if (act === 'cancel') return cancelModal(appt());
  if (act === 'edit-status') return statusModal(appt());
  if (act === 'patient-detail') return patientModal(state.patients.find((p) => p.id === id));
  if (act === 'set-status') {
    const { error } = await sb.from('appointments').update({ status: el.dataset.status }).eq('id', id);
    if (error) return toast(error.message, 'error');
    toast(`Appointment marked as ${el.dataset.status}.`, 'success'); await loadAppts(); render();
  }
});

const autosave = (e) => { const f = e.target.closest?.('form[data-form]'); if (f && DRAFT_FORMS.includes(f.dataset.form)) saveDraft(f); };
document.addEventListener('input', autosave);
document.addEventListener('change', autosave);

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-slot-source]')) loadSlots('book-slots', $('#b-date').value, $('#b-dept').value, 'b-time').then(() => saveDraft(e.target.closest('form')));
  if (e.target.id === 's-status') $('#s-reason-wrap').classList.toggle('hidden', e.target.value !== 'Cancelled');
  if (e.target.matches('select[data-filter]')) { state.filters[e.target.dataset.filter] = e.target.value; $('#sched-body').innerHTML = scheduleTable(filteredAppts()); window.lucide?.createIcons(); }
});
document.addEventListener('input', (e) => {
  if (e.target.matches('input[data-filter]')) { state.filters[e.target.dataset.filter] = e.target.value; $('#sched-body').innerHTML = scheduleTable(filteredAppts()); }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form; const fd = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
  try {
    if (kind === 'auth') {
      if (state.authMode === 'signup') {
        const fullName = (fd.full_name || '').trim();
        if (fullName.length < 2) return toast('Please enter your full name.', 'error');
        if (fd.password !== fd.password2) return toast('Passwords do not match.', 'error');
        const { data, error } = await sb.auth.signUp({ email: fd.email.trim(), password: fd.password, options: { emailRedirectTo: APP_URL, data: { full_name: fullName } } });
        if (error) return toast(error.message, 'error');
        toast(data.session ? 'Account created. Welcome!' : 'Account created. Check your email to confirm, then sign in.', 'success');
        if (!data.session) { state.authMode = 'signin'; render(); }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: fd.email.trim(), password: fd.password });
        if (error) return toast(/not confirmed/i.test(error.message) ? 'Email not confirmed. Click "Resend confirmation email" below and use the newest link.' : error.message, 'error');
        /* welcome toast is shown by onSession */
      }
    } else if (kind === 'profile') {
      const { error } = await sb.from('profiles').update({ ...fd, date_of_birth: fd.date_of_birth || null, gender: fd.gender || null }).eq('id', state.session.user.id);
      if (error) return toast(error.message, 'error');
      clearDraft('profile'); await loadProfile(); toast('Profile saved.', 'success'); render();
    } else if (kind === 'book') {
      if (!fd.time) return toast('Please select a time slot.', 'error');
      const err = slotError(fd.date, toMin(fd.time)); if (err) return toast(err, 'error');
      const { error } = await sb.from('appointments').insert({ patient_id: state.session.user.id, appointment_date: fd.date, appointment_time: fd.time, department: fd.department, chief_complaint: fd.complaint.trim(), notes: fd.notes.trim(), status: 'Scheduled' });
      if (error) return toast(error.code === '23505' ? 'That slot was just taken. Please pick another time.' : error.message, 'error');
      clearDraft('book'); toast('Appointment booked successfully.', 'success'); await loadAppts(); state.view = 'appointments'; state.tab = 'upcoming'; render();
    } else if (kind === 'reschedule') {
      const date = $('#r-date').value, time = $('#r-time').value;
      if (!time) return toast('Please select a new time slot.', 'error');
      const err = slotError(date, toMin(time)); if (err) return toast(err, 'error');
      const a = state.appts.find((x) => x.id === form.dataset.id);
      const { error } = await sb.from('appointments').update({ appointment_date: date, appointment_time: time, status: 'Rescheduled', reschedule_count: a.reschedule_count + 1 }).eq('id', a.id);
      if (error) return toast(error.code === '23505' ? 'That slot was just taken. Please pick another time.' : error.message, 'error');
      closeModal(); toast('Appointment rescheduled.', 'success'); await loadAppts(); render();
    } else if (kind === 'status') {
      const status = $('#s-status').value; const reason = $('#s-reason').value.trim();
      if (status === 'Cancelled' && reason.length < 3) return toast('A cancellation reason is required when cancelling.', 'error');
      const patch = status === 'Cancelled' ? { status, cancellation_reason: reason, cancelled_by: 'admin' } : { status, cancellation_reason: null, cancelled_by: null };
      const { error } = await sb.from('appointments').update(patch).eq('id', form.dataset.id);
      if (error) return toast(error.code === '23505' ? 'Another active appointment already uses this slot, so it cannot be set back to Scheduled/Rescheduled.' : error.message, 'error');
      closeModal(); toast(`Status changed to ${status}.`, 'success'); await loadAppts(); render();
    } else if (kind === 'cancel') {
      const reason = $('#c-reason').value.trim(); if (reason.length < 3) return toast('A cancellation reason is required.', 'error');
      const { error } = await sb.from('appointments').update({ status: 'Cancelled', cancellation_reason: reason, cancelled_by: state.isAdmin ? 'admin' : 'patient' }).eq('id', form.dataset.id);
      if (error) return toast(error.message, 'error');
      closeModal(); toast('Appointment cancelled.', 'success'); await loadAppts(); render();
    }
  } finally { if (btn) btn.disabled = false; }
});

// Bootstrap: restore persisted session (Supabase stores it in localStorage)
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) render();
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (hash.get('error_code')) {
    const expired = hash.get('error_code') === 'otp_expired';
    toast(expired
      ? 'This confirmation link is invalid or already used. If you already confirmed, just sign in; otherwise sign up again to get a new link.'
      : (hash.get('error_description') || 'Authentication error.').replace(/\+/g, ' '), 'error');
    history.replaceState(null, '', location.pathname);
  }
})();
