/**
 * ExpSplit Pro — APP.js
 * Pure Firestore real-time sync. No localStorage, no months.
 */

// ── Configuration ──────────────────────────────────────────────────
const MEMBERS = ["Ranga Sai", "Shekar", "Naveen", "Mahesh", "Vinod"];

// ── Firebase Setup ─────────────────────────────────────────────────
import { initializeApp }     from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "AIzaSyC7yj0KCcpyb1lZZnzp4LKfZBIeYKKvXOc",
  authDomain:        "roombudget-app.firebaseapp.com",
  projectId:         "roombudget-app",
  storageBucket:     "roombudget-app.firebasestorage.app",
  messagingSenderId: "1056177026184",
  appId:             "1:1056177026184:web:53427486a28076270e5b3d"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── App State ──────────────────────────────────────────────────────
let expenses    = [];   // live from Firestore
let editingId   = null; // Firestore doc ID of expense being edited
let chart       = null;

// ── Chart.js guard ─────────────────────────────────────────────────
// Chart.js loads via <script> tag; wait for it to be ready
function getChart() { return window.Chart || null; }

// ── Init ───────────────────────────────────────────────────────────
(function init() {
  // Populate person selects
  ['personSelect', 'editPerson'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    MEMBERS.forEach(name => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  // Enter-key shortcuts
  ['forInput', 'amountInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') addExpense(); });
  });
  ['editFor', 'editAmount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(); });
  });

  // Inline validation clearing
  document.getElementById('forInput')   ?.addEventListener('input', () => clearErr('forInput',    'forError'));
  document.getElementById('amountInput')?.addEventListener('input', () => clearErr('amountInput', 'amountError'));
  document.getElementById('editFor')    ?.addEventListener('input', () => clearErr('editFor',     'editForError'));
  document.getElementById('editAmount') ?.addEventListener('input', () => clearErr('editAmount',  'editAmountError'));

  // Live Firestore listener
  const q = query(collection(db, 'expenses'), orderBy('timestamp', 'asc'));
  onSnapshot(q, snapshot => {
    expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, err => {
    console.error('Firestore error:', err);
    showToast('🔴 Firestore connection error', 'error');
  });
})();

// ── Add Expense ─────────────────────────────────────────────────────
async function addExpense() {
  clearErr('forInput', 'forError');
  clearErr('amountInput', 'amountError');
  if (!validateAddForm()) return;

  const person = document.getElementById('personSelect').value;
  const item   = document.getElementById('forInput').value.trim();
  const amount = parseFloat(document.getElementById('amountInput').value);

  try {
    await addDoc(collection(db, 'expenses'), {
      person,
      item,
      amount,
      timestamp: Date.now()
    });
    document.getElementById('forInput').value    = '';
    document.getElementById('amountInput').value = '';
    document.getElementById('forInput').focus();
    showToast(`✓ ₹${fmt(amount)} — ${item} by ${person}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('❌ Failed to save. Check connection.', 'error');
  }
}

// ── Delete Expense ──────────────────────────────────────────────────
async function deleteExpense(firestoreId) {
  const e = expenses.find(x => x.id === firestoreId);
  if (!e) return;
  if (!confirm(`Delete this expense?\n\n👤 ${e.person}\n🛒 ${e.item}\n💰 ₹${fmt(e.amount)}`)) return;
  try {
    await deleteDoc(doc(db, 'expenses', firestoreId));
    showToast('🗑 Expense deleted', 'error');
  } catch (err) {
    console.error(err);
    showToast('❌ Delete failed', 'error');
  }
}

// ── Edit Expense ────────────────────────────────────────────────────
function openEdit(firestoreId) {
  const e = expenses.find(x => x.id === firestoreId);
  if (!e) return;
  editingId = firestoreId;

  document.getElementById('editPerson').value = e.person;
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

  const old       = expenses.find(x => x.id === editingId);
  const newPerson = document.getElementById('editPerson').value;
  const newItem   = document.getElementById('editFor').value.trim();
  const newAmount = parseFloat(document.getElementById('editAmount').value);

  const changes = [];
  if (old.person !== newPerson) changes.push(`Person: ${old.person} → ${newPerson}`);
  if (old.item   !== newItem)   changes.push(`Item: ${old.item} → ${newItem}`);
  if (old.amount !== newAmount) changes.push(`Amount: ₹${fmt(old.amount)} → ₹${fmt(newAmount)}`);

  try {
    await updateDoc(doc(db, 'expenses', editingId), {
      person: newPerson,
      item:   newItem,
      amount: newAmount
    });
    closeModal();
    showToast(changes.length ? '✏️ ' + changes.join(' | ') : 'No changes made', 'info');
  } catch (err) {
    console.error(err);
    showToast('❌ Update failed', 'error');
  }
}

// ── Modal ───────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('editModal')) closeModal();
}

// ── Reset All ───────────────────────────────────────────────────────
async function resetAll() {
  if (expenses.length === 0) { showToast('Nothing to reset', 'error'); return; }
  if (!confirm(`Delete ALL ${expenses.length} expenses? This cannot be undone.`)) return;
  try {
    await Promise.all(expenses.map(e => deleteDoc(doc(db, 'expenses', e.id))));
    showToast('↺ All expenses cleared', 'error');
  } catch (err) {
    console.error(err);
    showToast('❌ Reset failed', 'error');
  }
}

// ── Master Render ───────────────────────────────────────────────────
function renderAll() {
  const total      = expenses.reduce((s, e) => s + e.amount, 0);
  const shareCount = MEMBERS.length;
  const share      = shareCount ? total / shareCount : 0;

  document.getElementById('totalDisplay').textContent = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent = '₹' + fmt(share);

  renderTable(expenses);

  const balances = calcBalances(expenses, MEMBERS, share);
  renderBalance(balances);

  const txns = calcSettlement(balances);
  document.getElementById('txnCountDisplay').textContent = txns.length;
  renderSettlement(txns, expenses.length);

  renderChart(balances);
}

// ── Render Table ────────────────────────────────────────────────────
function renderTable(list) {
  const tbody = document.getElementById('expenseBody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div>No expenses yet — add one above</div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((e, i) => `
    <tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${e.person}</td>
      <td><span class="td-for" title="${e.item}">${e.item}</span></td>
      <td class="td-amt">₹${fmt(e.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn edit" onclick="openEdit('${e.id}')" title="Edit">✏️</button>
          <button class="icon-btn del"  onclick="deleteExpense('${e.id}')" title="Delete">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

// ── Calculate Balances ──────────────────────────────────────────────
function calcBalances(list, members, share) {
  const paid = {};
  members.forEach(m => (paid[m] = 0));
  list.forEach(e => { if (paid[e.person] !== undefined) paid[e.person] += e.amount; });
  return members.map(name => ({
    name,
    paid:    paid[name],
    share,
    balance: paid[name] - share
  }));
}

// ── Render Balance ──────────────────────────────────────────────────
function renderBalance(balances) {
  const el = document.getElementById('balanceSummary');
  if (!balances.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div>Add expenses to see balances</div>`;
    return;
  }
  const maxAbs = Math.max(...balances.map(b => Math.abs(b.balance)), 1);
  el.innerHTML = `<div class="balance-grid">` +
    balances.map(b => {
      const pct   = Math.round((Math.abs(b.balance) / maxAbs) * 100);
      const cls   = b.balance > 0.01 ? 'recv' : b.balance < -0.01 ? 'pay' : 'even';
      const label = b.balance > 0.01 ? `+₹${fmt(b.balance)} to receive`
                  : b.balance < -0.01 ? `-₹${fmt(Math.abs(b.balance))} to pay`
                  : 'Settled ✓';
      const init     = b.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const subLabel = `Paid ₹${fmt(b.paid)} · Share ₹${fmt(b.share)}`;
      return `
        <div class="balance-row">
          <div class="balance-name">
            <div class="avatar ${cls}">${init}</div>
            <span class="balance-name-text">${b.name}</span>
          </div>
          <div class="balance-bar-wrap">
            <div class="balance-bar ${cls}" style="width:${pct}%"></div>
          </div>
          <div class="balance-sub">${subLabel}</div>
          <div class="balance-amount ${cls}">${label}</div>
        </div>`;
    }).join('') + `</div>`;
}

// ── Settlement Algorithm ────────────────────────────────────────────
function calcSettlement(balances) {
  const people    = balances.map(b => ({ name: b.name, balance: +b.balance.toFixed(2) }));
  const creditors = people.filter(p => p.balance >  0.01).sort((a, b) => b.balance - a.balance);
  const debtors   = people.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);
  const txns = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cr  = creditors[ci];
    const db_ = debtors[di];
    const amt = Math.min(cr.balance, Math.abs(db_.balance));
    if (amt > 0.01) txns.push({ from: db_.name, to: cr.name, amount: +amt.toFixed(2) });
    cr.balance  -= amt;
    db_.balance += amt;
    if (Math.abs(cr.balance)  < 0.01) ci++;
    if (Math.abs(db_.balance) < 0.01) di++;
  }
  return txns;
}

// ── Render Settlement ───────────────────────────────────────────────
function renderSettlement(txns, expenseCount) {
  const el = document.getElementById('settlementList');
  if (expenseCount === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div>No expenses yet</div>`;
    return;
  }
  if (txns.length === 0) {
    el.innerHTML = `<div class="all-settled"><div class="icon">🎉</div>Everyone is perfectly settled!</div>`;
    return;
  }
  el.innerHTML = `<div class="txn-list">` +
    txns.map(t => {
      const fi = t.from.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      const ti = t.to.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
        <div class="txn">
          <div class="txn-left">
            <div class="avatar pay"  title="${t.from}">${fi}</div>
            <div class="txn-info">
              <div class="txn-from"><strong>${t.from}</strong> pays</div>
              <div class="txn-to">→ <span>${t.to}</span></div>
            </div>
            <div class="avatar recv" title="${t.to}">${ti}</div>
          </div>
          <div class="txn-amount">₹${fmt(t.amount)}</div>
        </div>`;
    }).join('') + `</div>`;
}

// ── Chart ───────────────────────────────────────────────────────────
function renderChart(balances) {
  const canvas = document.getElementById('expenseChart');
  if (!canvas) return;
  const C = getChart();
  if (!C) return; // Chart.js not loaded yet

  if (chart) { chart.destroy(); chart = null; }

  const hasPaid = balances.filter(b => b.paid > 0);
  if (!hasPaid.length) return;

  const COLORS = ['#0d9488', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  chart = new C(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels:   hasPaid.map(b => b.name),
      datasets: [{
        data:            hasPaid.map(b => b.paid),
        backgroundColor: COLORS.slice(0, hasPaid.length),
        borderColor:     '#fff',
        borderWidth:     3,
        hoverOffset:     6
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:         '#334155',
            font:          { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '600' },
            padding:       16,
            usePointStyle: true,
            pointStyle:    'circle'
          }
        },
        tooltip: {
          backgroundColor: '#fff',
          titleColor:      '#0f172a',
          bodyColor:       '#334155',
          borderColor:     '#e2e8f0',
          borderWidth:     1,
          padding:         12,
          cornerRadius:    8,
          callbacks: { label: ctx => `  Paid: ₹${fmt(ctx.parsed)}` }
        }
      }
    }
  });
}

// ── Validation ──────────────────────────────────────────────────────
function setErr(inputId, errorId, msg) {
  document.getElementById(inputId)?.classList.add('err');
  const el = document.getElementById(errorId);
  if (el) { el.textContent = '⚠ ' + msg; el.classList.add('show'); }
  document.getElementById(inputId)?.focus();
}

function clearErr(inputId, errorId) {
  document.getElementById(inputId)?.classList.remove('err');
  document.getElementById(errorId)?.classList.remove('show');
}

function checkForWhat(val) {
  if (!val || val.trim() === '')           return 'Please describe what this was spent on.';
  if (val.trim().length < 2)               return 'Too short — at least 2 characters required.';
  if (/^\d+(\.\d+)?$/.test(val.trim()))   return 'That looks like a number. Please enter an item name.';
  if (/^[^a-zA-Z\u0900-\u097F]+$/.test(val.trim())) return 'Item name must contain at least one letter.';
  return null;
}

function checkAmount(raw) {
  if (!raw || raw.trim() === '') return 'Amount cannot be empty.';
  const n = parseFloat(raw);
  if (isNaN(n))    return 'Not a valid number. Please enter digits (e.g. 500).';
  if (n <= 0)      return 'Amount must be greater than ₹0.';
  if (n > 9999999) return 'Amount seems too large. Please double-check.';
  return null;
}

function validateAddForm() {
  const fe = checkForWhat(document.getElementById('forInput').value);
  const ae = checkAmount(document.getElementById('amountInput').value);
  if (fe) setErr('forInput',    'forError',    fe);
  if (ae) setErr('amountInput', 'amountError', ae);
  return !fe && !ae;
}

function validateEditForm() {
  const fe = checkForWhat(document.getElementById('editFor').value);
  const ae = checkAmount(document.getElementById('editAmount').value);
  if (fe) setErr('editFor',    'editForError',    fe);
  if (ae) setErr('editAmount', 'editAmountError', ae);
  return !fe && !ae;
}

// ── Download HTML Report ─────────────────────────────────────────────
function downloadReport() {
  if (expenses.length === 0) { showToast('No expenses to report', 'error'); return; }

  const total      = expenses.reduce((s, e) => s + e.amount, 0);
  const share      = total / MEMBERS.length;
  const balances   = calcBalances(expenses, MEMBERS, share);
  const txns       = calcSettlement(balances);
  const now        = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const expenseRows = expenses.map((e, i) => `
    <tr>
      <td>${i + 1}</td><td>${e.person}</td><td>${e.item}</td>
      <td style="text-align:right;font-weight:600">₹${fmt(e.amount)}</td>
    </tr>`).join('');

  const balanceRows = balances.map(b => {
    const color = b.balance > 0.01 ? '#10b981' : b.balance < -0.01 ? '#ef4444' : '#64748b';
    const label = b.balance > 0.01 ? `+₹${fmt(b.balance)} to receive`
                : b.balance < -0.01 ? `-₹${fmt(Math.abs(b.balance))} to pay` : 'Settled ✓';
    return `<tr>
      <td>${b.name}</td>
      <td style="text-align:right">₹${fmt(b.paid)}</td>
      <td style="text-align:right">₹${fmt(b.share)}</td>
      <td style="text-align:right;color:${color};font-weight:700">${label}</td>
    </tr>`;
  }).join('');

  const settlementRows = txns.length
    ? txns.map(t => `<tr>
        <td><strong>${t.from}</strong></td>
        <td style="text-align:center;color:#64748b">→ pays →</td>
        <td><strong style="color:#0d9488">${t.to}</strong></td>
        <td style="text-align:right;font-weight:700;color:#0d9488">₹${fmt(t.amount)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#10b981;font-weight:600">🎉 Everyone is perfectly settled!</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>ExpSplit Pro Report — ${now}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; background: #f0f4f8; color: #0f172a; padding: 2rem 1rem; }
  .page { max-width: 800px; margin: 0 auto; }
  .header { background: linear-gradient(135deg,#0d9488,#0f766e); color:#fff; border-radius:16px; padding:2rem; margin-bottom:1.5rem; }
  .header h1 { font-size:1.8rem; font-weight:800; }
  .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.5rem; }
  .stat { background:#fff; border-radius:12px; padding:1rem 1.2rem; border:1px solid #e2e8f0; }
  .stat-label { font-size:0.65rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b; margin-bottom:0.3rem; }
  .stat-value { font-size:1.5rem; font-weight:700; color:#0d9488; }
  .section { background:#fff; border-radius:12px; padding:1.5rem; margin-bottom:1.25rem; border:1px solid #e2e8f0; }
  .section-title { font-size:0.7rem; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#64748b; margin-bottom:1rem; }
  table { width:100%; border-collapse:collapse; font-size:0.88rem; }
  th { background:#f8fafc; color:#64748b; font-size:0.65rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:0.6rem 0.9rem; text-align:left; border-bottom:1px solid #e2e8f0; }
  td { padding:0.7rem 0.9rem; border-bottom:1px solid #f1f5f9; }
  tr:last-child td { border-bottom:none; }
  .footer { text-align:center; color:#94a3b8; font-size:0.78rem; margin-top:2rem; }
</style></head><body><div class="page">
  <div class="header"><h1>💰 ExpSplit Pro</h1><p style="opacity:.85;margin-top:.25rem">Expense Report — Generated ${now}</p></div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total Spent</div><div class="stat-value">₹${fmt(total)}</div></div>
    <div class="stat"><div class="stat-label">Per Person Share</div><div class="stat-value" style="color:#10b981">₹${fmt(share)}</div></div>
    <div class="stat"><div class="stat-label">Settlements</div><div class="stat-value" style="color:#f59e0b">${txns.length}</div></div>
  </div>
  <div class="section"><div class="section-title">Expense Log</div>
    <table><thead><tr><th>#</th><th>Paid By</th><th>Spent On</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${expenseRows}</tbody>
    <tfoot><tr><td colspan="3" style="font-weight:700;padding:.8rem .9rem">Total</td>
    <td style="text-align:right;font-weight:800;color:#0d9488;font-size:1rem;padding:.8rem .9rem">₹${fmt(total)}</td></tr></tfoot></table>
  </div>
  <div class="section"><div class="section-title">Balance per Person</div>
    <table><thead><tr><th>Name</th><th style="text-align:right">Paid</th><th style="text-align:right">Share</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>${balanceRows}</tbody></table>
  </div>
  <div class="section"><div class="section-title">Final Settlement</div>
    <table><thead><tr><th>From</th><th style="text-align:center"></th><th>To</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${settlementRows}</tbody></table>
  </div>
  <div class="footer">ExpSplit Pro • Generated ${now} • All amounts in Indian Rupees (₹)</div>
</div></body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `ExpSplit_Report_${now.replace(/\s+/g, '_')}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('⬇ Report downloaded', 'success');
}

// ── Utilities ───────────────────────────────────────────────────────
function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return n.toFixed(2).replace(/\.?0+$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// Expose to HTML onclick handlers
window.addExpense      = addExpense;
window.deleteExpense   = deleteExpense;
window.openEdit        = openEdit;
window.saveEdit        = saveEdit;
window.closeModal      = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.resetAll        = resetAll;
window.downloadReport  = downloadReport;