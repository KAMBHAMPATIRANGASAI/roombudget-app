/**
 * ExpSplit Pro — app.js
 */

// ── Configuration ──────────────────────────────────────────────────
const MEMBERS = ["Ranga Sai", "Shekar", "Naveen", "Mahesh", "Vinod"];

// ── App State ──────────────────────────────────────────────────────
let chart = null;

// Firebase CDN imports (modular)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global state - Firestore driven ONLY
let expenses = [];
let unsubscribe = null;
let editingId = null;





// 🔥 Firebase Firestore ONLY (NO localStorage)


// ── Month Management ───────────────────────────────────────────────
function createMonth() {
  const now  = new Date();
  const id   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const name = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (months.find(m => m.id === id)) {
    showToast(`${name} already exists`, 'error');
    return;
  }

  months.push({ id, name, present: [...MEMBERS], expenses: [] });
  currentMonthId = id;
  saveData();
  renderMonthSelector();
  renderMembersStrip();
  render();
  showToast(`✓ ${name} created`, 'success');
}

function selectMonth(id) {
  currentMonthId = id;
  renderMonthSelector();
  renderMembersStrip();
  render();
}

// ── Member Presence ────────────────────────────────────────────────
function toggleMemberPresence(name) {
  const month = getMonth();
  if (!month) return;

  const idx = month.present.indexOf(name);
  if (idx > -1) {
    month.present.splice(idx, 1);
    showToast(`${name} marked absent this month`, 'info');
  } else {
    month.present.push(name);
    showToast(`${name} marked present this month`, 'success');
  }

  saveData();
  renderMembersStrip();
  render();
}

// ── Init ───────────────────────────────────────────────────────────
(function init() {
  const q = query(collection(db, "expenses"), orderBy("timestamp", "asc"));

onSnapshot(q, (snapshot) => {
  expenses = [];

  snapshot.forEach((doc) => {
    expenses.push({
      id: doc.id,
      ...doc.data()
    });
  });

  console.log("🔥 LIVE DATA:", expenses);

  renderFirestore();
});

  if (months.length === 0) {
    createMonth();
  } else if (!currentMonthId || !months.find(m => m.id === currentMonthId)) {
    currentMonthId = months[months.length - 1].id;
  }

  ['personSelect', 'editPerson'].forEach(id => {
    const sel = document.getElementById(id);
    MEMBERS.forEach(name => {
      const opt       = document.createElement('option');
      opt.value       = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
  });

  ['forInput', 'amountInput'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') addExpense();
    });
  });

  ['editFor', 'editAmount'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') saveEdit();
    });
  });

  document.getElementById('forInput').addEventListener('input',    () => clearErr('forInput',    'forError'));
  document.getElementById('amountInput').addEventListener('input', () => clearErr('amountInput', 'amountError'));
  document.getElementById('editFor').addEventListener('input',     () => clearErr('editFor',     'editForError'));
  document.getElementById('editAmount').addEventListener('input',  () => clearErr('editAmount',  'editAmountError'));

  renderMonthSelector();
  renderMembersStrip();
  render();
})();

// ── Validation ─────────────────────────────────────────────────────
function setErr(inputId, errorId, msg) {
  document.getElementById(inputId).classList.add('err');
  const errEl       = document.getElementById(errorId);
  errEl.textContent = '⚠ ' + msg;
  errEl.classList.add('show');
  document.getElementById(inputId).focus();
}

function clearErr(inputId, errorId) {
  document.getElementById(inputId).classList.remove('err');
  document.getElementById(errorId).classList.remove('show');
}

function checkForWhat(val) {
  if (!val || val.trim() === '') return 'Please describe what this was spent on.';
  if (val.trim().length < 2)     return 'Too short — at least 2 characters required.';
  if (/^\d+(\.\d+)?$/.test(val.trim())) return 'That looks like a number. Please enter an item name.';
  if (/^[^a-zA-Z\u0900-\u097F]+$/.test(val.trim())) return 'Item name must contain at least one letter.';
  return null;
}

function checkAmount(raw) {
  if (!raw || raw.trim() === '') return 'Amount cannot be empty.';
  const n = parseFloat(raw);
  if (isNaN(n))  return 'Not a valid number. Please enter digits (e.g. 500).';
  if (n <= 0)    return 'Amount must be greater than ₹0.';
  if (n > 9999999) return 'Amount seems too large. Please double-check.';
  return null;
}

function validateAddForm() {
  const forErr = checkForWhat(document.getElementById('forInput').value);
  const amtErr = checkAmount(document.getElementById('amountInput').value);
  if (forErr) setErr('forInput',    'forError',    forErr);
  if (amtErr) setErr('amountInput', 'amountError', amtErr);
  return !forErr && !amtErr;
}

function validateEditForm() {
  const forErr = checkForWhat(document.getElementById('editFor').value);
  const amtErr = checkAmount(document.getElementById('editAmount').value);
  if (forErr) setErr('editFor',    'editForError',    forErr);
  if (amtErr) setErr('editAmount', 'editAmountError', amtErr);
  return !forErr && !amtErr;
}

// ── Add Expense ─────────────────────────────────────────────────────
function addExpense() {
  if (!currentMonthId) { showToast('Please select or create a month first', 'error'); return; }
  clearErr('forInput', 'forError');
  clearErr('amountInput', 'amountError');
  if (!validateAddForm()) return;

  const month   = getMonth();
  const person  = document.getElementById('personSelect').value;
  const forWhat = document.getElementById('forInput').value.trim();
  const amount  = parseFloat(document.getElementById('amountInput').value);

  async function addExpense() {
  clearErr('forInput', 'forError');
  clearErr('amountInput', 'amountError');
  if (!validateAddForm()) return;

  const person  = document.getElementById('personSelect').value;
  const forWhat = document.getElementById('forInput').value.trim();
  const amount  = parseFloat(document.getElementById('amountInput').value);

  await addDoc(collection(db, "expenses"), {
    person,
    forWhat,
    amount,
    timestamp: Date.now()
  });

  document.getElementById('forInput').value = '';
  document.getElementById('amountInput').value = '';

  showToast("🔥 Synced to Firebase", "success");
}
  render();
  showToast(`✓ ₹${fmt(amount)} — ${forWhat} by ${person}`, 'success');
}

// ── Delete Expense ──────────────────────────────────────────────────
function deleteExpense(i) {
  const month = getMonth();
  if (!month) return;
  const e = month.expenses[i];
  if (!confirm(`Delete this expense?\n\n👤 ${e.person}\n🛒 ${e.forWhat}\n💰 ₹${fmt(e.amount)}`)) return;
  month.expenses.splice(i, 1);
  saveData();
  render();
  showToast('Expense deleted', 'error');
}

// ── Edit Expense ────────────────────────────────────────────────────
function openEdit(i) {
  const month = getMonth();
  if (!month) return;
  editingIndex = i;
  const e = month.expenses[i];
  document.getElementById('editPerson').value = e.person;
  document.getElementById('editFor').value    = e.forWhat;
  document.getElementById('editAmount').value = e.amount;
  document.getElementById('editRowNum').textContent = `#${i + 1}`;
  clearErr('editFor',    'editForError');
  clearErr('editAmount', 'editAmountError');
  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editFor').focus(), 200);
}

function saveEdit() {
  if (editingIndex === -1) return;
  clearErr('editFor', 'editForError');
  clearErr('editAmount', 'editAmountError');
  if (!validateEditForm()) return;

  const month      = getMonth();
  const newPerson  = document.getElementById('editPerson').value;
  const newForWhat = document.getElementById('editFor').value.trim();
  const newAmount  = parseFloat(document.getElementById('editAmount').value);
  const old        = month.expenses[editingIndex];

  const changes = [];
  if (old.person  !== newPerson)  changes.push(`Person: ${old.person} → ${newPerson}`);
  if (old.forWhat !== newForWhat) changes.push(`Item: ${old.forWhat} → ${newForWhat}`);
  if (old.amount  !== newAmount)  changes.push(`Amount: ₹${fmt(old.amount)} → ₹${fmt(newAmount)}`);

  month.expenses[editingIndex] = { person: newPerson, forWhat: newForWhat, amount: newAmount };

  closeModal();
  saveData();
  render();

  showToast(changes.length ? '✏️ ' + changes.join(' | ') : 'No changes made', 'info');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('open');
  editingIndex = -1;
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('editModal')) closeModal();
}

// ── Reset ───────────────────────────────────────────────────────────
function resetAll() {
  const month = getMonth();
  if (!month) return;
  if (month.expenses.length === 0) { showToast('Nothing to reset', 'error'); return; }
  if (!confirm(`Delete ALL ${month.expenses.length} expenses for ${month.name}? Cannot be undone.`)) return;
  month.expenses = [];
  saveData();
  render();
  showToast('↺ All expenses cleared', 'error');
}

// ── Master Render ───────────────────────────────────────────────────
function render() {
  const month = getMonth();
  if (!month) return;

  const presentMembers = month.present;
  const allExpenses    = month.expenses;
  const total          = allExpenses.reduce((s, e) => s + e.amount, 0);
  const shareCount     = presentMembers.length || 1;
  const share          = total / shareCount;

  document.getElementById('totalDisplay').textContent = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent = '₹' + fmt(share);

  renderTable(allExpenses);

  const balances = calcBalances(allExpenses, presentMembers, share);
  renderBalance(balances);

  const txns = calcSettlement(balances);
  document.getElementById('txnCountDisplay').textContent = txns.length;
  renderSettlement(txns, month);

  renderChart(balances);
}

// ── Render Month Selector ───────────────────────────────────────────
function renderMonthSelector() {
  const el = document.getElementById('monthSelector');
  let html = months.map(m =>
    `<button class="month-btn ${m.id === currentMonthId ? 'active' : ''}" onclick="selectMonth('${m.id}')">${m.name}</button>`
  ).join('');
  html += `<button class="month-btn add-btn" onclick="createMonth()">+ Add Month</button>`;
  el.innerHTML = html;
}

// ── Render Members Strip ────────────────────────────────────────────
function renderMembersStrip() {
  const el    = document.getElementById('membersStrip');
  const month = getMonth();
  if (!month) { el.innerHTML = ''; return; }

  el.innerHTML = MEMBERS.map(name => {
    const isPresent = month.present.includes(name);
    const cls  = isPresent ? 'present' : 'absent';
    const icon = isPresent ? '✓' : '✕';
    const title = isPresent
      ? `${name} is present — click to mark absent`
      : `${name} is absent this month — click to mark present`;
    return `
      <div class="member-chip ${cls}" onclick="toggleMemberPresence('${name}')" title="${title}">
        <span class="chip-dot"></span>
        ${name}
        <span class="chip-toggle">${icon}</span>
      </div>`;
  }).join('');
}

// ── Render Table ────────────────────────────────────────────────────
function renderTable(expenses) {
  const tbody = document.getElementById('expenseBody');
  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div>No expenses yet — add one above</div></td></tr>`;
    return;
  }
  tbody.innerHTML = expenses.map((e, i) => `
    <tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${e.person}</td>
      <td><span class="td-for" title="${e.forWhat}">${e.forWhat}</span></td>
      <td class="td-amt">₹${fmt(e.amount)}</td>
      <td>
        <div class="action-btns">
          <button class="icon-btn edit" onclick="openEdit(${i})" title="Edit">✏️</button>
          <button class="icon-btn del"  onclick="deleteExpense(${i})" title="Delete">🗑</button>
        </div>
      </td>
    </tr>`).join('');
}

// ── Calculate Balances ──────────────────────────────────────────────
function calcBalances(expenses, presentMembers, share) {
  const paid = {};
  MEMBERS.forEach(m => (paid[m] = 0));
  expenses.forEach(e => (paid[e.person] += e.amount));
  return presentMembers.map(name => ({
    name,
    paid:    paid[name],
    share,
    balance: paid[name] - share
  }));
}

// ── Render Balance — FIXED GRID LAYOUT ─────────────────────────────
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
      const cls   = b.balance >  0.01 ? 'recv' : b.balance < -0.01 ? 'pay' : 'even';
      const label = b.balance >  0.01 ? `+₹${fmt(b.balance)} to receive`
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
    const db  = debtors[di];
    const amt = Math.min(cr.balance, Math.abs(db.balance));
    if (amt > 0.01) txns.push({ from: db.name, to: cr.name, amount: +amt.toFixed(2) });
    cr.balance -= amt;
    db.balance += amt;
    if (Math.abs(cr.balance) < 0.01) ci++;
    if (Math.abs(db.balance) < 0.01) di++;
  }

  return txns;
}

// ── Render Settlement ───────────────────────────────────────────────
function renderSettlement(txns, month) {
  const el = document.getElementById('settlementList');

  if (!month || month.expenses.length === 0) {
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
            <div class="avatar pay" title="${t.from}">${fi}</div>
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
  if (chart) { chart.destroy(); chart = null; }

  const hasPaid = balances.filter(b => b.paid > 0);
  if (!hasPaid.length) return;

  const COLORS = ['#0d9488', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels:   hasPaid.map(b => b.name),
      datasets: [{
        data:            hasPaid.map(b => b.paid),
        backgroundColor: COLORS.slice(0, hasPaid.length),
        borderColor:     '#fff',
        borderWidth:     3,
        hoverOffset:     6,
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
            pointStyle:    'circle',
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
          callbacks: {
            label: ctx => `  Paid: ₹${fmt(ctx.parsed)}`
          }
        }
      }
    }
  });
}

function renderFirestore() {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  const share = total / MEMBERS.length;

  document.getElementById('totalDisplay').textContent = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent = '₹' + fmt(share);

  renderTable(expenses);

  const balances = calcBalances(expenses, MEMBERS, share);
  renderBalance(balances);

  const txns = calcSettlement(balances);
  document.getElementById('txnCountDisplay').textContent = txns.length;
  renderSettlement(txns, { expenses });
}

// ── Download Month Report ───────────────────────────────────────────
function downloadReport() {
  const month = getMonth();
  if (!month) { showToast('No month selected', 'error'); return; }

  const total      = month.expenses.reduce((s, e) => s + e.amount, 0);
  const presentMembers = month.present;
  const shareCount = presentMembers.length || 1;
  const share      = total / shareCount;
  const balances   = calcBalances(month.expenses, presentMembers, share);
  const txns       = calcSettlement(balances);

  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const expenseRows = month.expenses.length
    ? month.expenses.map((e, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${e.person}</td>
          <td>${e.forWhat}</td>
          <td style="text-align:right;font-weight:600">₹${fmt(e.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#94a3b8">No expenses recorded</td></tr>`;

  const balanceRows = balances.map(b => {
    const cls   = b.balance > 0.01 ? '#10b981' : b.balance < -0.01 ? '#ef4444' : '#64748b';
    const label = b.balance > 0.01 ? `+₹${fmt(b.balance)} to receive`: b.balance < -0.01 ? `-₹${fmt(Math.abs(b.balance))} to pay`: 'Settled ✓';
    return `
      <tr>
        <td>${b.name}</td>
        <td style="text-align:right">₹${fmt(b.paid)}</td>
        <td style="text-align:right">₹${fmt(b.share)}</td>
        <td style="text-align:right;color:${cls};font-weight:700">${label}</td>
      </tr>`;
  }).join('');

  const settlementRows = txns.length
    ? txns.map(t => `
        <tr>
          <td><strong>${t.from}</strong></td>
          <td style="text-align:center;color:#64748b">→ pays →</td>
          <td><strong style="color:#0d9488">${t.to}</strong></td>
          <td style="text-align:right;font-weight:700;color:#0d9488">₹${fmt(t.amount)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#10b981;font-weight:600">🎉 Everyone is perfectly settled!</td></tr>`;

  const absentMembers = MEMBERS.filter(m => !month.present.includes(m));
  const absentNote = absentMembers.length
    ? `<p style="margin-top:0.5rem;font-size:0.8rem;color:#94a3b8">Absent this month: ${absentMembers.join(', ')}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ExpSplit Pro — ${month.name} Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: #f0f4f8;
      color: #0f172a;
      padding: 2rem 1rem 4rem;
    }
    .page { max-width: 800px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #0d9488, #0f766e);
      color: #fff;
      border-radius: 16px;
      padding: 2rem;
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .header h1 { font-size: 1.8rem; font-weight: 800; }
    .header .sub { opacity: 0.85; font-size: 0.88rem; margin-top: 0.25rem; }
    .header .date { font-size: 0.8rem; opacity: 0.7; text-align: right; }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 500px) {
      .stats { grid-template-columns: 1fr 1fr; }
      .stats .stat:last-child { grid-column: 1/-1; }
    }
    .stat {
      background: #fff;
      border-radius: 12px;
      padding: 1rem 1.2rem;
      border: 1px solid #e2e8f0;
    }
    .stat-label { font-size: 0.65rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #64748b; margin-bottom: 0.3rem; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #0d9488; }
    .section { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.25rem; border: 1px solid #e2e8f0; }
    .section-title {
      font-size: 0.7rem; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
      color: #64748b; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;
    }
    .section-title::before { content:''; width:3px; height:14px; border-radius:2px; background:#0d9488; display:inline-block; }
    .section-title.green::before { background:#10b981; }
    .section-title.amber::before { background:#f59e0b; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
    th { background: #f8fafc; color: #64748b; font-size: 0.65rem; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; padding: 0.6rem 0.9rem; text-align: left; border-bottom: 1px solid #e2e8f0; }
    td { padding: 0.7rem 0.9rem; border-bottom: 1px solid #f1f5f9; }
    tr:last-child td { border-bottom: none; }
    .footer { text-align: center; color: #94a3b8; font-size: 0.78rem; margin-top: 2rem; }
    @media print {
      body { background: #fff; }
      .section { break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div>
      <h1>💰 ExpSplit Pro</h1>
      <div class="sub">${month.name} — Expense Report</div>
      ${absentNote}
    </div>
    <div class="date">Generated on<br/>${now}</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total Spent</div>
      <div class="stat-value">₹${fmt(total)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Per Person Share</div>
      <div class="stat-value" style="color:#10b981">₹${fmt(share)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Settlements</div>
      <div class="stat-value" style="color:#f59e0b">${txns.length}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Expense Log</div>
    <table>
      <thead>
        <tr><th>#</th><th>Paid By</th><th>Spent On</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>${expenseRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="font-weight:700;padding:0.8rem 0.9rem;color:#334155">Total</td>
          <td style="text-align:right;font-weight:800;color:#0d9488;font-size:1rem;padding:0.8rem 0.9rem">₹${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="section">
    <div class="section-title green">Balance per Person</div>
    <table>
      <thead>
        <tr><th>Name</th><th style="text-align:right">Paid</th><th style="text-align:right">Share</th><th style="text-align:right">Balance</th></tr>
      </thead>
      <tbody>${balanceRows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title amber">Final Settlement</div>
    <table>
      <thead>
        <tr><th>From</th><th style="text-align:center"></th><th>To</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>${settlementRows}</tbody>
    </table>
  </div>

  <div class="footer">ExpSplit Pro • Generated ${now} • All amounts in Indian Rupees (₹)</div>

</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ExpSplit_${month.name.replace(/\s+/g, '_')}_Report.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`⬇ Report downloaded for ${month.name}`, 'success');
}

// ── Utilities ───────────────────────────────────────────────────────
function getMonth() {
  return months.find(m => m.id === currentMonthId) || null;
}

function fmt(n) {
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return n.toFixed(2).replace(/\.?0+$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function showToast(msg, type = 'success') {
  const t      = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}