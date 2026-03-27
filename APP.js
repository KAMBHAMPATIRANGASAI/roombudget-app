/**
 * ExpSplit Pro — APP.js
 * Firestore sync · Per-month presence · Payments tracking · UPI Deep Links
 *
 * Firestore structure:
 *   config/main                     → { months, presentMap, currentMonth }
 *   months/{monthId}/expenses/{id}  → { person, item, amount, timestamp }
 *   months/{monthId}/payments/{id}  → { from, to, amount, note, timestamp }
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, addDoc, onSnapshot,
  deleteDoc, doc, updateDoc, query, orderBy, setDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Firebase Config ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyC7yj0KCcpyb1lZZnzp4LKfZBIeYKKvXOc",
  authDomain:        "roombudget-app.firebaseapp.com",
  projectId:         "roombudget-app",
  storageBucket:     "roombudget-app.firebasestorage.app",
  messagingSenderId: "1056177026184",
  appId:             "1:1056177026184:web:53427486a28076270e5b3d"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Constants ──────────────────────────────────────────────────────
const ALL_MEMBERS = ["Ranga Sai", "Shekar", "Naveen", "Mahesh", "Vinod"];

// ── UPI IDs for each member ────────────────────────────────────────
const UPI_IDS = {
  "Ranga Sai": "9502493816@ybl",
  "Shekar":    "9347098702@ybl",
  "Naveen":    "8187849730@ybl",
  "Mahesh":    "9652864912@kotak811",
  "Vinod":     "vinodkumar996609@axl"
};

// ── State ──────────────────────────────────────────────────────────
let expenses       = [];
let payments       = [];
let months         = [];
let currentMonth   = null;
let presentMap     = {};
let editingId      = null;
let editingPayId   = null;
let chart          = null;
let unsubExpenses  = null;
let unsubPayments  = null;

// ── Helpers ────────────────────────────────────────────────────────
const presentMembers = () =>
  currentMonth && presentMap[currentMonth]
    ? [...presentMap[currentMonth]]
    : [...ALL_MEMBERS];

function monthIdNow() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(id) {
  const [y, m] = id.split('-');
  return new Date(+y, +m - 1, 1)
    .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return n.toFixed(2).replace(/\.?0+$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3400);
}

// ── Build UPI Deep Link ────────────────────────────────────────────
function buildUpiLink(toName, amount, note) {
  const upiId = UPI_IDS[toName];
  if (!upiId) return null;
  const params = new URLSearchParams({
    pa: upiId,
    pn: toName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note || `ExpSplit payment to ${toName}`
  });
  return `upi://pay?${params.toString()}`;
}

// ── Open UPI Payment ───────────────────────────────────────────────
// Opens the UPI app then shows a "confirm" dialog to log it in Firestore
function openUpiPayment(fromName, toName, amount) {
  const upiLink = buildUpiLink(toName, amount, `ExpSplit: ${fromName} pays ${toName}`);
  if (!upiLink) {
    showToast(`No UPI ID found for ${toName}`, 'error');
    return;
  }

  // Show the UPI modal
  document.getElementById('upiFromName').textContent   = fromName;
  document.getElementById('upiToName').textContent     = toName;
  document.getElementById('upiToName2').textContent    = toName;
  document.getElementById('upiAmount').textContent     = `₹${fmt(amount)}`;
  document.getElementById('upiUpiId').textContent      = UPI_IDS[toName];
  document.getElementById('upiAmountVal').textContent  = `₹${fmt(amount)}`;

  // Store for confirm handler
  window._pendingUpi = { fromName, toName, amount, upiLink };

  document.getElementById('upiModal').classList.add('open');
}

// Called when user taps "Open UPI App" inside modal
function launchUpiApp() {
  if (!window._pendingUpi) return;
  const { upiLink } = window._pendingUpi;
  // Try to open the UPI deep link
  window.location.href = upiLink;
  // After 2 seconds, show the confirm step
  setTimeout(() => {
    document.getElementById('upiStep1').style.display = 'none';
    document.getElementById('upiStep2').style.display = 'block';
  }, 2000);
}

// Called when user confirms payment was successful
async function confirmUpiPaid() {
  if (!window._pendingUpi) return;
  const { fromName, toName, amount } = window._pendingUpi;
  closeUpiModal();

  // Auto-record in Firestore
  try {
    await addDoc(collection(db, 'months', currentMonth, 'payments'), {
      from: fromName,
      to: toName,
      amount: amount,
      note: 'UPI Payment ✅',
      timestamp: Date.now()
    });
    showToast(`✅ ₹${fmt(amount)} payment recorded — ${fromName} → ${toName}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Failed to record payment', 'error');
  }
  window._pendingUpi = null;
}

function closeUpiModal() {
  document.getElementById('upiModal').classList.remove('open');
  document.getElementById('upiStep1').style.display = 'block';
  document.getElementById('upiStep2').style.display = 'none';
  window._pendingUpi = null;
}
function handleUpiOverlayClick(e) {
  if (e.target === document.getElementById('upiModal')) closeUpiModal();
}

// ── Firestore: Config ──────────────────────────────────────────────
async function loadConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'main'));
    if (snap.exists()) {
      const d      = snap.data();
      months       = d.months       || [];
      presentMap   = d.presentMap   || {};
      currentMonth = d.currentMonth || null;
    }
  } catch (e) { console.error('loadConfig:', e); }
}
async function saveConfig() {
  try {
    await setDoc(doc(db, 'config', 'main'), { months, presentMap, currentMonth });
  } catch (e) { console.error('saveConfig:', e); }
}

// ── Init ───────────────────────────────────────────────────────────
(async function init() {
  await loadConfig();

  if (months.length === 0) {
    await createCurrentMonth();
  } else {
    if (!currentMonth || !months.find(m => m.id === currentMonth))
      currentMonth = months[months.length - 1].id;
    renderMonthTabs();
    renderMemberChips();
    subscribeAll();
  }

  // Keyboard shortcuts
  ['forInput', 'amountInput'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addExpense(); }));
  ['editFor', 'editAmount'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); }));
  ['payAmount', 'payNote'].forEach(id =>
    document.getElementById(id)
      ?.addEventListener('keydown', e => { if (e.key === 'Enter') addPayment(); }));

  // Live validation clearing
  [['forInput','forError'],['amountInput','amountError'],
   ['editFor','editForError'],['editAmount','editAmountError'],
   ['payAmount','payAmountError']
  ].forEach(([i,e]) =>
    document.getElementById(i)?.addEventListener('input', () => clearErr(i, e)));
})();

// ── Month Management ───────────────────────────────────────────────
async function createCurrentMonth() {
  const id   = monthIdNow();
  const name = monthLabel(id);
  if (months.find(m => m.id === id)) {
    showToast(`${name} already exists`, 'error'); return;
  }
  months.push({ id, name });
  if (!presentMap[id]) presentMap[id] = [...ALL_MEMBERS];
  currentMonth = id;
  await saveConfig();
  renderMonthTabs();
  renderMemberChips();
  subscribeAll();
  showToast(`✓ ${name} created`, 'success');
}

async function selectMonth(id) {
  if (currentMonth === id) return;
  currentMonth = id;
  await saveConfig();
  renderMonthTabs();
  renderMemberChips();
  subscribeAll();
}

// ── Member Presence ────────────────────────────────────────────────
async function toggleMember(name) {
  if (!currentMonth) return;
  const list = presentMembers();
  const idx  = list.indexOf(name);
  if (idx > -1) {
    list.splice(idx, 1);
    showToast(`${name} marked absent`, 'info');
  } else {
    list.push(name);
    showToast(`${name} marked present`, 'success');
  }
  presentMap[currentMonth] = list;
  await saveConfig();
  renderMemberChips();
  renderAll();
}

// ── Firestore Listeners ────────────────────────────────────────────
function subscribeAll() {
  if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
  if (currentMonth) {
    const qe = query(
      collection(db, 'months', currentMonth, 'expenses'),
      orderBy('timestamp', 'asc')
    );
    unsubExpenses = onSnapshot(qe, snap => {
      expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }, err => { console.error(err); showToast('🔴 Expense sync error', 'error'); });
  }

  if (unsubPayments) { unsubPayments(); unsubPayments = null; }
  if (currentMonth) {
    const qp = query(
      collection(db, 'months', currentMonth, 'payments'),
      orderBy('timestamp', 'asc')
    );
    unsubPayments = onSnapshot(qp, snap => {
      payments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    }, err => { console.error(err); showToast('🔴 Payment sync error', 'error'); });
  }
}

// ══════════════════════════════════════════════════════════════════
//  EXPENSES CRUD
// ══════════════════════════════════════════════════════════════════

async function addExpense() {
  clearErr('forInput', 'forError');
  clearErr('amountInput', 'amountError');
  if (!validateAddForm()) return;

  const person = document.getElementById('personSelect').value;
  const item   = document.getElementById('forInput').value.trim();
  const amount = parseFloat(document.getElementById('amountInput').value);

  try {
    await addDoc(collection(db, 'months', currentMonth, 'expenses'), {
      person, item, amount, timestamp: Date.now()
    });
    document.getElementById('forInput').value    = '';
    document.getElementById('amountInput').value = '';
    document.getElementById('forInput').focus();
    showToast(`✓ ₹${fmt(amount)} — ${item} by ${person}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Failed to save expense', 'error');
  }
}

async function deleteExpense(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Delete expense?\n👤 ${e.person}\n🛒 ${e.item}\n💰 ₹${fmt(e.amount)}`)) return;
  try {
    await deleteDoc(doc(db, 'months', currentMonth, 'expenses', id));
    showToast('🗑 Expense deleted', 'error');
  } catch (err) { showToast('❌ Delete failed', 'error'); }
}

function openEdit(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  editingId = id;

  const sel = document.getElementById('editPerson');
  sel.innerHTML = '';
  presentMembers().forEach(name => {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    sel.appendChild(o);
  });
  sel.value = presentMembers().includes(e.person) ? e.person : presentMembers()[0];

  document.getElementById('editFor').value    = e.item;
  document.getElementById('editAmount').value = e.amount;
  document.getElementById('editRowNum').textContent = `#${expenses.indexOf(e) + 1}`;
  clearErr('editFor', 'editForError');
  clearErr('editAmount', 'editAmountError');
  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editFor').focus(), 200);
}

async function saveEdit() {
  if (!editingId) return;
  clearErr('editFor', 'editForError');
  clearErr('editAmount', 'editAmountError');
  if (!validateEditForm()) return;

  const old = expenses.find(x => x.id === editingId);
  const np  = document.getElementById('editPerson').value;
  const ni  = document.getElementById('editFor').value.trim();
  const na  = parseFloat(document.getElementById('editAmount').value);

  const changes = [];
  if (old.person !== np) changes.push(`Person: ${old.person} → ${np}`);
  if (old.item   !== ni) changes.push(`Item: ${old.item} → ${ni}`);
  if (old.amount !== na) changes.push(`Amount: ₹${fmt(old.amount)} → ₹${fmt(na)}`);

  try {
    await updateDoc(
      doc(db, 'months', currentMonth, 'expenses', editingId),
      { person: np, item: ni, amount: na }
    );
    closeModal();
    showToast(changes.length ? '✏️ ' + changes.join(' | ') : 'No changes', 'info');
  } catch (err) { showToast('❌ Update failed', 'error'); }
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null;
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('editModal')) closeModal();
}

async function resetAll() {
  if (!expenses.length && !payments.length) {
    showToast('Nothing to reset', 'error'); return;
  }
  const total = expenses.length + payments.length;
  if (!confirm(`Delete ALL ${total} records (${expenses.length} expenses + ${payments.length} payments) for ${monthLabel(currentMonth)}?\n\nThis cannot be undone.`)) return;
  try {
    await Promise.all([
      ...expenses.map(e => deleteDoc(doc(db, 'months', currentMonth, 'expenses', e.id))),
      ...payments.map(p => deleteDoc(doc(db, 'months', currentMonth, 'payments', p.id)))
    ]);
    showToast('↺ All cleared', 'error');
  } catch (err) { showToast('❌ Reset failed', 'error'); }
}

// ══════════════════════════════════════════════════════════════════
//  PAYMENTS CRUD
// ══════════════════════════════════════════════════════════════════

async function addPayment() {
  clearErr('payAmount', 'payAmountError');

  const from   = document.getElementById('payFrom').value;
  const to     = document.getElementById('payTo').value;
  const amount = parseFloat(document.getElementById('payAmount').value);
  const note   = document.getElementById('payNote').value.trim();

  if (from === to) {
    showToast('Payer and receiver cannot be the same person', 'error'); return;
  }
  const ae = checkAmount(String(amount));
  if (ae) { setErr('payAmount', 'payAmountError', ae); return; }

  try {
    await addDoc(collection(db, 'months', currentMonth, 'payments'), {
      from, to, amount, note: note || '', timestamp: Date.now()
    });
    document.getElementById('payAmount').value = '';
    document.getElementById('payNote').value   = '';
    showToast(`✅ ₹${fmt(amount)} recorded: ${from} → ${to}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Failed to record payment', 'error');
  }
}

async function deletePayment(id) {
  const p = payments.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete payment?\n👤 ${p.from} → ${p.to}\n💰 ₹${fmt(p.amount)}`)) return;
  try {
    await deleteDoc(doc(db, 'months', currentMonth, 'payments', id));
    showToast('🗑 Payment deleted', 'error');
  } catch (err) { showToast('❌ Delete failed', 'error'); }
}

function openEditPayment(id) {
  const p = payments.find(x => x.id === id);
  if (!p) return;
  editingPayId = id;

  ['editPayFrom','editPayTo'].forEach(selId => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '';
    ALL_MEMBERS.forEach(name => {
      const o = document.createElement('option');
      o.value = o.textContent = name;
      sel.appendChild(o);
    });
  });
  document.getElementById('editPayFrom').value   = p.from;
  document.getElementById('editPayTo').value     = p.to;
  document.getElementById('editPayAmount').value = p.amount;
  document.getElementById('editPayNote').value   = p.note || '';
  clearErr('editPayAmount','editPayAmountError');
  document.getElementById('editPayModal').classList.add('open');
  setTimeout(() => document.getElementById('editPayAmount').focus(), 200);
}

async function saveEditPayment() {
  if (!editingPayId) return;
  clearErr('editPayAmount','editPayAmountError');

  const from   = document.getElementById('editPayFrom').value;
  const to     = document.getElementById('editPayTo').value;
  const amount = parseFloat(document.getElementById('editPayAmount').value);
  const note   = document.getElementById('editPayNote').value.trim();

  if (from === to) { showToast('Payer and receiver cannot be same', 'error'); return; }
  const ae = checkAmount(String(amount));
  if (ae) { setErr('editPayAmount','editPayAmountError', ae); return; }

  try {
    await updateDoc(
      doc(db, 'months', currentMonth, 'payments', editingPayId),
      { from, to, amount, note: note || '' }
    );
    closePayModal();
    showToast('✏️ Payment updated', 'info');
  } catch (err) { showToast('❌ Update failed', 'error'); }
}

function closePayModal() {
  document.getElementById('editPayModal').classList.remove('open');
  editingPayId = null;
}
function handlePayOverlayClick(e) {
  if (e.target === document.getElementById('editPayModal')) closePayModal();
}

// ══════════════════════════════════════════════════════════════════
//  BALANCE CALCULATION
// ══════════════════════════════════════════════════════════════════

function calcBalances(present, share) {
  const paid = {};
  ALL_MEMBERS.forEach(m => (paid[m] = 0));
  expenses.forEach(e => {
    if (paid[e.person] !== undefined) paid[e.person] += e.amount;
  });

  const payAdj = {};
  ALL_MEMBERS.forEach(m => (payAdj[m] = 0));
  payments.forEach(p => {
    if (payAdj[p.from] !== undefined) payAdj[p.from] += p.amount;
    if (payAdj[p.to]   !== undefined) payAdj[p.to]   -= p.amount;
  });

  return present.map(name => {
    const totalEffective = paid[name] + payAdj[name];
    return {
      name,
      paid:    paid[name],
      payAdj:  payAdj[name],
      share,
      balance: totalEffective - share
    };
  });
}

function calcSettlement(balances) {
  const p   = balances.map(b => ({ name: b.name, balance: +b.balance.toFixed(2) }));
  const cr  = p.filter(x => x.balance >  0.01).sort((a, b) => b.balance - a.balance);
  const db_ = p.filter(x => x.balance < -0.01).sort((a, b) => a.balance - b.balance);
  const txns = []; let ci = 0, di = 0;
  while (ci < cr.length && di < db_.length) {
    const c = cr[ci], d = db_[di];
    const amt = Math.min(c.balance, Math.abs(d.balance));
    if (amt > 0.01) txns.push({ from: d.name, to: c.name, amount: +amt.toFixed(2) });
    c.balance -= amt; d.balance += amt;
    if (Math.abs(c.balance) < 0.01) ci++;
    if (Math.abs(d.balance) < 0.01) di++;
  }
  return txns;
}

// ══════════════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════════════

function renderMonthTabs() {
  const el = document.getElementById('monthTabs');
  let html = months.map(m =>
    `<button class="month-btn${m.id === currentMonth ? ' active' : ''}" onclick="selectMonth('${m.id}')">${m.name}</button>`
  ).join('');
  html += `<button class="month-btn add-btn" onclick="createCurrentMonth()">+ Add Month</button>`;
  el.innerHTML = html;
}

function renderMemberChips() {
  const el   = document.getElementById('memberChips');
  const list = presentMembers();
  el.innerHTML = ALL_MEMBERS.map(name => {
    const p = list.includes(name);
    return `<div class="chip ${p ? 'present' : 'absent'}" onclick="toggleMember('${name}')">
      <span class="chip-dot"></span>${name}<span class="chip-icon">${p ? '✓' : '✕'}</span>
    </div>`;
  }).join('');
}

function renderPersonSelect() {
  const sel = document.getElementById('personSelect');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  presentMembers().forEach(name => {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    sel.appendChild(o);
  });
  if (presentMembers().includes(cur)) sel.value = cur;
}

function renderPaymentSelects() {
  ['payFrom','payTo'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '';
    ALL_MEMBERS.forEach(name => {
      const o = document.createElement('option');
      o.value = o.textContent = name;
      sel.appendChild(o);
    });
    if (cur) sel.value = cur;
  });
  const pf = document.getElementById('payFrom');
  const pt = document.getElementById('payTo');
  if (pf && pt && pf.value === pt.value) {
    const others = ALL_MEMBERS.filter(m => m !== pf.value);
    if (others.length) pt.value = others[0];
  }
}

function renderAll() {
  renderPersonSelect();
  renderPaymentSelects();

  const present       = presentMembers();
  const total         = expenses.reduce((s, e) => s + e.amount, 0);
  const share         = total / (present.length || 1);
  const totalPaidBack = payments.reduce((s, p) => s + p.amount, 0);

  document.getElementById('totalDisplay').textContent    = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent    = '₹' + fmt(share);
  document.getElementById('paidBackDisplay').textContent = '₹' + fmt(totalPaidBack);

  renderTable();
  renderPaymentsTable();

  const balances = calcBalances(present, share);
  renderBalance(balances);

  const txns = calcSettlement(balances);
  document.getElementById('txnCountDisplay').textContent = txns.length;
  renderSettlement(txns);
  renderChart(balances);
}

// ── Expense Table ──────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('expenseBody');
  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div>No expenses yet</div></td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map((e, i) => `
    <tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${e.person}</td>
      <td><span class="td-for" title="${e.item}">${e.item}</span></td>
      <td class="td-amt">₹${fmt(e.amount)}</td>
      <td><div class="action-btns">
        <button class="icon-btn edit" onclick="openEdit('${e.id}')" title="Edit">✏️</button>
        <button class="icon-btn del"  onclick="deleteExpense('${e.id}')" title="Delete">🗑</button>
      </div></td>
    </tr>`).join('');
}

// ── Payments Table ─────────────────────────────────────────────────
function renderPaymentsTable() {
  const tbody = document.getElementById('paymentsBody');
  if (!tbody) return;

  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div>No payments recorded yet</div></td></tr>`;
    return;
  }

  tbody.innerHTML = payments.map((p, i) => {
    const fi = p.from.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const ti = p.to.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<tr>
      <td class="td-num">${i + 1}</td>
      <td>
        <div class="pay-persons">
          <div class="avatar-sm pay" title="${p.from}">${fi}</div>
          <div class="pay-arrow">→</div>
          <div class="avatar-sm recv" title="${p.to}">${ti}</div>
          <div class="pay-names">
            <span class="pay-from">${p.from}</span>
            <span class="pay-to-label">→ ${p.to}</span>
          </div>
        </div>
      </td>
      <td>${p.note ? `<span class="pay-note">${p.note}</span>` : '<span style="color:var(--muted2);font-size:.7rem">—</span>'}</td>
      <td class="td-pay-amt">₹${fmt(p.amount)}</td>
      <td><div class="action-btns">
        <button class="icon-btn edit" onclick="openEditPayment('${p.id}')" title="Edit">✏️</button>
        <button class="icon-btn del"  onclick="deletePayment('${p.id}')" title="Delete">🗑</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ── Balance Cards ──────────────────────────────────────────────────
function renderBalance(balances) {
  const el = document.getElementById('balanceSummary');
  if (!balances.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div>No present members</div>`;
    return;
  }
  const maxAbs = Math.max(...balances.map(b => Math.abs(b.balance)), 1);

  el.innerHTML = `<div class="balance-grid">${balances.map(b => {
    const pct   = Math.round((Math.abs(b.balance) / maxAbs) * 100);
    const cls   = b.balance > 0.01 ? 'recv' : b.balance < -0.01 ? 'pay' : 'even';
    const label = b.balance > 0.01 ? `+₹${fmt(b.balance)} to receive`
                : b.balance < -0.01 ? `-₹${fmt(Math.abs(b.balance))} to pay`
                : 'Settled ✓';
    const init  = b.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const adjNote = b.payAdj !== 0
      ? `<div class="bc-adj">${b.payAdj > 0 ? `+₹${fmt(b.payAdj)} paid to others` : `-₹${fmt(Math.abs(b.payAdj))} received`}</div>`
      : '';

    return `<div class="balance-card">
      <div class="bc-header">
        <div class="avatar ${cls}">${init}</div>
        <span class="bc-name">${b.name}</span>
        <span class="bc-badge ${cls}">${label}</span>
      </div>
      <div class="bc-bar-wrap"><div class="bc-bar ${cls}" style="width:${pct}%"></div></div>
      <div class="bc-sub">Paid ₹${fmt(b.paid)} · Share ₹${fmt(b.share)}</div>
      ${adjNote}
    </div>`;
  }).join('')}</div>`;
}

// ── Settlement ─────────────────────────────────────────────────────
function renderSettlement(txns) {
  const el = document.getElementById('settlementList');
  if (!expenses.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div>No expenses yet</div>`;
    return;
  }
  if (!txns.length) {
    el.innerHTML = `<div class="all-settled"><div class="icon">🎉</div>Everyone is settled!</div>`;
    return;
  }
  el.innerHTML = txns.map(t => {
    const fi = t.from.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const ti = t.to.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const toUpi = UPI_IDS[t.to] || '';
    return `<div class="txn">
      <div class="txn-left">
        <div class="avatar pay">${fi}</div>
        <div class="txn-info">
          <div class="txn-from"><strong>${t.from}</strong> pays</div>
          <div class="txn-to">→ <span>${t.to}</span></div>
          ${toUpi ? `<div class="txn-upi-id">📱 ${toUpi}</div>` : ''}
        </div>
        <div class="avatar recv">${ti}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount">₹${fmt(t.amount)}</div>
        <button class="btn-upi-pay" onclick="openUpiPayment('${t.from}','${t.to}',${t.amount})" title="Pay via UPI">
          📲 Pay via UPI
        </button>
        <button class="btn-record-pay" onclick="prefillPayment('${t.from}','${t.to}',${t.amount})" title="Record manually">
          ✍️ Manual
        </button>
      </div>
    </div>`;
  }).join('');
}

// Pre-fill payment form from settlement card
function prefillPayment(from, to, amount) {
  document.getElementById('payFrom').value   = from;
  document.getElementById('payTo').value     = to;
  document.getElementById('payAmount').value = amount;
  document.getElementById('payNote').value   = 'Settlement payment';
  document.getElementById('paymentsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => document.getElementById('payAmount').focus(), 600);
  showToast(`💡 Payment form filled — confirm to record`, 'info');
}

// ── Chart ──────────────────────────────────────────────────────────
function renderChart(balances) {
  const canvas = document.getElementById('expenseChart');
  if (!canvas || !window.Chart) return;
  if (chart) { chart.destroy(); chart = null; }
  const hasPaid = balances.filter(b => b.paid > 0);
  if (!hasPaid.length) return;
  const COLORS = ['#0d9488','#3b82f6','#10b981','#f59e0b','#ef4444'];
  chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: hasPaid.map(b => b.name),
      datasets: [{
        data: hasPaid.map(b => b.paid),
        backgroundColor: COLORS.slice(0, hasPaid.length),
        borderColor: '#fff', borderWidth: 3, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#334155',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '600' },
            padding: 16, usePointStyle: true, pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: '#fff', titleColor: '#0f172a', bodyColor: '#334155',
          borderColor: '#e2e8f0', borderWidth: 1, padding: 12, cornerRadius: 8,
          callbacks: { label: ctx => `  Paid: ₹${fmt(ctx.parsed)}` }
        }
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════
//  VALIDATION
// ══════════════════════════════════════════════════════════════════
function setErr(iid, eid, msg) {
  document.getElementById(iid)?.classList.add('err');
  const el = document.getElementById(eid);
  if (el) { el.textContent = '⚠ ' + msg; el.classList.add('show'); }
  document.getElementById(iid)?.focus();
}
function clearErr(iid, eid) {
  document.getElementById(iid)?.classList.remove('err');
  document.getElementById(eid)?.classList.remove('show');
}
function checkForWhat(v) {
  if (!v?.trim())  return 'Please describe what was spent.';
  if (v.trim().length < 2) return 'At least 2 characters required.';
  if (/^\d+(\.\d+)?$/.test(v.trim())) return 'Enter an item name, not a number.';
  if (/^[^a-zA-Z\u0900-\u097F]+$/.test(v.trim())) return 'Must contain at least one letter.';
  return null;
}
function checkAmount(r) {
  if (!r || String(r).trim() === '') return 'Amount cannot be empty.';
  const n = parseFloat(r);
  if (isNaN(n))    return 'Enter a valid number (e.g. 500).';
  if (n <= 0)      return 'Must be greater than ₹0.';
  if (n > 9999999) return 'Amount too large. Double-check.';
  return null;
}
function validateAddForm() {
  const fe = checkForWhat(document.getElementById('forInput').value);
  const ae = checkAmount(document.getElementById('amountInput').value);
  if (fe) setErr('forInput','forError',fe);
  if (ae) setErr('amountInput','amountError',ae);
  return !fe && !ae;
}
function validateEditForm() {
  const fe = checkForWhat(document.getElementById('editFor').value);
  const ae = checkAmount(document.getElementById('editAmount').value);
  if (fe) setErr('editFor','editForError',fe);
  if (ae) setErr('editAmount','editAmountError',ae);
  return !fe && !ae;
}

// ══════════════════════════════════════════════════════════════════
//  DOWNLOAD REPORT
// ══════════════════════════════════════════════════════════════════
function downloadReport() {
  if (!expenses.length && !payments.length) {
    showToast('No data to report', 'error'); return;
  }
  const present  = presentMembers();
  const total    = expenses.reduce((s,e) => s+e.amount, 0);
  const share    = total / (present.length || 1);
  const balances = calcBalances(present, share);
  const txns     = calcSettlement(balances);
  const absent   = ALL_MEMBERS.filter(m => !present.includes(m));
  const now      = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const mName    = currentMonth ? monthLabel(currentMonth) : now;
  const totalPay = payments.reduce((s,p) => s+p.amount, 0);

  const eRows = expenses.map((e,i) =>
    `<tr><td>${i+1}</td><td>${e.person}</td><td>${e.item}</td><td style="text-align:right;font-weight:600">₹${fmt(e.amount)}</td></tr>`
  ).join('');

  const pRows = payments.length ? payments.map((p,i) =>
    `<tr><td>${i+1}</td><td>${p.from}</td><td>${p.to}</td><td>${p.note||'—'}</td><td style="text-align:right;font-weight:600;color:#0d9488">₹${fmt(p.amount)}</td></tr>`
  ).join('') : `<tr><td colspan="5" style="text-align:center;color:#94a3b8">No payments recorded</td></tr>`;

  const bRows = balances.map(b => {
    const c = b.balance>0.01?'#10b981':b.balance<-0.01?'#ef4444':'#64748b';
    const l = b.balance>0.01?`+₹${fmt(b.balance)} to receive`:b.balance<-0.01?`-₹${fmt(Math.abs(b.balance))} to pay`:'Settled ✓';
    const adj = b.payAdj!==0?(b.payAdj>0?`+₹${fmt(b.payAdj)} paid`:`-₹${fmt(Math.abs(b.payAdj))} received`):'—';
    return `<tr><td>${b.name}</td><td style="text-align:right">₹${fmt(b.paid)}</td><td style="text-align:right">₹${fmt(b.share)}</td><td style="text-align:right;color:#3b82f6">${adj}</td><td style="text-align:right;color:${c};font-weight:700">${l}</td></tr>`;
  }).join('');

  const sRows = txns.length
    ? txns.map(t=>`<tr><td><strong>${t.from}</strong></td><td style="text-align:center;color:#64748b">→ pays →</td><td><strong style="color:#0d9488">${t.to}</strong></td><td style="color:#64748b;font-size:.8rem">${UPI_IDS[t.to]||'—'}</td><td style="text-align:right;font-weight:700;color:#0d9488">₹${fmt(t.amount)}</td></tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:#10b981;font-weight:600">🎉 Everyone settled!</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>ExpSplit — ${mName}</title>
<style>
body{font-family:sans-serif;background:#f0f4f8;color:#0f172a;padding:2rem 1rem}
.page{max-width:820px;margin:0 auto}
.hdr{background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;border-radius:16px;padding:2rem;margin-bottom:1.5rem}
.hdr h1{font-size:1.8rem;font-weight:800}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.5rem}
@media(max-width:500px){.stats{grid-template-columns:1fr 1fr}}
.stat{background:#fff;border-radius:12px;padding:1rem;border:1px solid #e2e8f0}
.sl{font-size:.6rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:.25rem}
.sv{font-size:1.4rem;font-weight:700;color:#0d9488}
.sec{background:#fff;border-radius:12px;padding:1.5rem;margin-bottom:1.25rem;border:1px solid #e2e8f0}
.st{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:1rem}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th{background:#f8fafc;color:#64748b;font-size:.62rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:.55rem .8rem;text-align:left;border-bottom:1px solid #e2e8f0}
td{padding:.65rem .8rem;border-bottom:1px solid #f1f5f9}
tr:last-child td{border-bottom:none}
.ft{text-align:center;color:#94a3b8;font-size:.75rem;margin-top:2rem}
</style></head>
<body><div class="page">
<div class="hdr">
  <h1>💰 ExpSplit Pro</h1>
  <p style="opacity:.85;margin-top:.3rem">${mName}${absent.length?` · Absent: ${absent.join(', ')}`:''} · ${present.length} present members</p>
  <p style="opacity:.65;font-size:.8rem;margin-top:.2rem">Generated ${now}</p>
</div>
<div class="stats">
  <div class="stat"><div class="sl">Total Spent</div><div class="sv">₹${fmt(total)}</div></div>
  <div class="stat"><div class="sl">Per Person Share</div><div class="sv" style="color:#10b981">₹${fmt(share)}</div></div>
  <div class="stat"><div class="sl">Total Payments</div><div class="sv" style="color:#3b82f6">₹${fmt(totalPay)}</div></div>
  <div class="stat"><div class="sl">Remaining Settles</div><div class="sv" style="color:#f59e0b">${txns.length}</div></div>
</div>
<div class="sec"><div class="st">Expense Log (${expenses.length})</div>
<table><thead><tr><th>#</th><th>Paid By</th><th>Spent On</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${eRows}</tbody>
<tfoot><tr><td colspan="3" style="font-weight:700;padding:.75rem .8rem">Total</td><td style="text-align:right;font-weight:800;color:#0d9488;font-size:1rem;padding:.75rem .8rem">₹${fmt(total)}</td></tr></tfoot>
</table></div>
<div class="sec"><div class="st">Payments Recorded (${payments.length})</div>
<table><thead><tr><th>#</th><th>From</th><th>To</th><th>Note</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${pRows}</tbody></table></div>
<div class="sec"><div class="st">Balance per Person (after payments)</div>
<table><thead><tr><th>Name</th><th style="text-align:right">Paid</th><th style="text-align:right">Share</th><th style="text-align:right">Pay Adj</th><th style="text-align:right">Final Balance</th></tr></thead>
<tbody>${bRows}</tbody></table></div>
<div class="sec"><div class="st">Remaining Settlement (with UPI IDs)</div>
<table><thead><tr><th>From</th><th style="text-align:center"></th><th>To</th><th>UPI ID</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${sRows}</tbody></table></div>
<div class="ft">ExpSplit Pro · ${mName} · Generated ${now}</div>
</div></body></html>`;

  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })),
    download: `ExpSplit_${mName.replace(/\s+/g,'_')}.html`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('⬇ Report downloaded', 'success');
}

// ══════════════════════════════════════════════════════════════════
//  EXPOSE TO HTML
// ══════════════════════════════════════════════════════════════════
window.addExpense            = addExpense;
window.deleteExpense         = deleteExpense;
window.openEdit              = openEdit;
window.saveEdit              = saveEdit;
window.closeModal            = closeModal;
window.handleOverlayClick    = handleOverlayClick;
window.resetAll              = resetAll;
window.downloadReport        = downloadReport;
window.selectMonth           = selectMonth;
window.createCurrentMonth    = createCurrentMonth;
window.toggleMember          = toggleMember;
window.addPayment            = addPayment;
window.deletePayment         = deletePayment;
window.openEditPayment       = openEditPayment;
window.saveEditPayment       = saveEditPayment;
window.closePayModal         = closePayModal;
window.handlePayOverlayClick = handlePayOverlayClick;
window.prefillPayment        = prefillPayment;
window.openUpiPayment        = openUpiPayment;
window.launchUpiApp          = launchUpiApp;
window.confirmUpiPaid        = confirmUpiPaid;
window.closeUpiModal         = closeUpiModal;
window.handleUpiOverlayClick = handleUpiOverlayClick;