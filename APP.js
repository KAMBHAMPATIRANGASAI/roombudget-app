/**
 * ExpSplit Pro — APP.js
 * Firestore real-time sync + per-month member presence
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

// ── State ──────────────────────────────────────────────────────────
let expenses      = [];
let months        = [];
let currentMonth  = null;
let presentMap    = {};   // { "2026-03": ["Ranga Sai", ...] }
let editingId     = null;
let chart         = null;
let unsubExpenses = null;

// ── Voice Assistant State ─────────────────────────────────────────
let recognition  = null;
let synthesis    = null;
let voiceState   = null;  // null, 'add1-who', 'add2-item', 'add3-amount'
let voiceTimeout = null;
let voiceWelcomeShown = false;

// ── Helpers ────────────────────────────────────────────────────────
function presentMembers() {
  if (!currentMonth) return [...ALL_MEMBERS];
  return presentMap[currentMonth] ? [...presentMap[currentMonth]] : [...ALL_MEMBERS];
}
function monthIdNow() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(id) {
  const [y, m] = id.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ── Firestore: Config doc ──────────────────────────────────────────
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
  if (months.length === 0) await createCurrentMonth();
  else {
    if (!currentMonth || !months.find(m => m.id === currentMonth))
      currentMonth = months[months.length - 1].id;
    renderMonthTabs();
    renderMemberChips();
    subscribeExpenses();
  }

  initVoice();  // 🔥 New: Voice Assistant

  ['forInput','amountInput'].forEach(id =>
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') addExpense(); }));
  ['editFor','editAmount'].forEach(id =>
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key==='Enter') saveEdit(); }));
  document.getElementById('forInput')   ?.addEventListener('input', () => clearErr('forInput',    'forError'));
  document.getElementById('amountInput')?.addEventListener('input', () => clearErr('amountInput', 'amountError'));
  document.getElementById('editFor')    ?.addEventListener('input', () => clearErr('editFor',     'editForError'));
  document.getElementById('editAmount') ?.addEventListener('input', () => clearErr('editAmount',  'editAmountError'));
})();

// ── Month Management ───────────────────────────────────────────────
async function createCurrentMonth() {
  const id   = monthIdNow();
  const name = monthLabel(id);
  if (months.find(m => m.id === id)) { showToast(`${name} already exists`, 'error'); return; }
  months.push({ id, name });
  if (!presentMap[id]) presentMap[id] = [...ALL_MEMBERS];
  currentMonth = id;
  await saveConfig();
  renderMonthTabs();
  renderMemberChips();
  subscribeExpenses();
  showToast(`✓ ${name} created`, 'success');
}

async function selectMonth(id) {
  if (currentMonth === id) return;
  currentMonth = id;
  await saveConfig();
  renderMonthTabs();
  renderMemberChips();
  subscribeExpenses();
}

// ── Member Presence Toggle ─────────────────────────────────────────
async function toggleMember(name) {
  if (!currentMonth) return;
  const list = presentMap[currentMonth] ? [...presentMap[currentMonth]] : [...ALL_MEMBERS];
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

// ── Firestore Listener (per month subcollection) ───────────────────
function subscribeExpenses() {
  if (unsubExpenses) { unsubExpenses(); unsubExpenses = null; }
  if (!currentMonth) return;
  const q = query(collection(db, 'months', currentMonth, 'expenses'), orderBy('timestamp', 'asc'));
  unsubExpenses = onSnapshot(q, snap => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, err => {
    console.error(err);
    showToast('🔴 Connection error', 'error');
  });
}

// ── Add ────────────────────────────────────────────────────────────
async function addExpense() {
  clearErr('forInput','forError'); clearErr('amountInput','amountError');
  if (!validateAddForm()) return;
  const person = document.getElementById('personSelect').value;
  const item   = document.getElementById('forInput').value.trim();
  const amount = parseFloat(document.getElementById('amountInput').value);
  try {
    await addDoc(collection(db, 'months', currentMonth, 'expenses'), { person, item, amount, timestamp: Date.now() });
    document.getElementById('forInput').value    = '';
    document.getElementById('amountInput').value = '';
    document.getElementById('forInput').focus();
    showToast(`✓ ₹${fmt(amount)} — ${item} by ${person}`, 'success');
  } catch (err) { console.error(err); showToast('❌ Failed to save', 'error'); }
}

// ── Delete ─────────────────────────────────────────────────────────
async function deleteExpense(id) {
  const e = expenses.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Delete?\n👤 ${e.person}\n🛒 ${e.item}\n💰 ₹${fmt(e.amount)}`)) return;
  try {
    await deleteDoc(doc(db, 'months', currentMonth, 'expenses', id));
    showToast('🗑 Deleted', 'error');
  } catch (err) { showToast('❌ Delete failed', 'error'); }
}

// ── Edit ───────────────────────────────────────────────────────────
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
  clearErr('editFor','editForError'); clearErr('editAmount','editAmountError');
  document.getElementById('editModal').classList.add('open');
  setTimeout(() => document.getElementById('editFor').focus(), 200);
}
async function saveEdit() {
  if (!editingId) return;
  clearErr('editFor','editForError'); clearErr('editAmount','editAmountError');
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
    await updateDoc(doc(db, 'months', currentMonth, 'expenses', editingId), { person: np, item: ni, amount: na });
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

// ── Reset All ──────────────────────────────────────────────────────
async function resetAll() {
  if (!expenses.length) { showToast('Nothing to reset', 'error'); return; }
  if (!confirm(`Delete ALL ${expenses.length} expenses for ${monthLabel(currentMonth)}?`)) return;
  try {
    await Promise.all(expenses.map(e => deleteDoc(doc(db, 'months', currentMonth, 'expenses', e.id))));
    showToast('↺ Cleared', 'error');
  } catch (err) { showToast('❌ Reset failed', 'error'); }
}

// ── Render: Month Tabs ─────────────────────────────────────────────
function renderMonthTabs() {
  const el = document.getElementById('monthTabs');
  let html = months.map(m => `
    <button class="month-btn${m.id === currentMonth ? ' active' : ''}" onclick="selectMonth('${m.id}')">${m.name}</button>`
  ).join('');
  html += `<button class="month-btn add-btn" onclick="createCurrentMonth()">+ Add Month</button>`;
  el.innerHTML = html;
}

// ── Render: Member Chips ───────────────────────────────────────────
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

// ── Render: Person Select ──────────────────────────────────────────
function renderPersonSelect() {
  const sel = document.getElementById('personSelect');
  const cur = sel?.value;
  if (!sel) return;
  sel.innerHTML = '';
  presentMembers().forEach(name => {
    const o = document.createElement('option');
    o.value = o.textContent = name;
    sel.appendChild(o);
  });
  if (presentMembers().includes(cur)) sel.value = cur;
}

// ── Master Render ──────────────────────────────────────────────────
function renderAll() {
  renderPersonSelect();
  const present    = presentMembers();
  const total      = expenses.reduce((s, e) => s + e.amount, 0);
  const share      = total / (present.length || 1);
  document.getElementById('totalDisplay').textContent = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent = '₹' + fmt(share);
  renderTable();
  const balances = calcBalances(present, share);
  renderBalance(balances);
  const txns = calcSettlement(balances);
  document.getElementById('txnCountDisplay').textContent = txns.length;
  renderSettlement(txns);
  renderChart(balances);
}

// ── Render: Table ──────────────────────────────────────────────────
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
        <button class="icon-btn edit" onclick="openEdit('${e.id}')">✏️</button>
        <button class="icon-btn del"  onclick="deleteExpense('${e.id}')">🗑</button>
      </div></td>
    </tr>`).join('');
}

// ── Calc ───────────────────────────────────────────────────────────
function calcBalances(present, share) {
  const paid = {};
  ALL_MEMBERS.forEach(m => (paid[m] = 0));
  expenses.forEach(e => { if (paid[e.person] !== undefined) paid[e.person] += e.amount; });
  return present.map(name => ({ name, paid: paid[name], share, balance: paid[name] - share }));
}
function calcSettlement(balances) {
  const p = balances.map(b => ({ name: b.name, balance: +b.balance.toFixed(2) }));
  const cr = p.filter(x => x.balance >  0.01).sort((a,b) => b.balance - a.balance);
  const db_ = p.filter(x => x.balance < -0.01).sort((a,b) => a.balance - b.balance);
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

// ── Render: Balance ────────────────────────────────────────────────
function renderBalance(balances) {
  const el = document.getElementById('balanceSummary');
  if (!balances.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div>No members present</div>`; return; }
  const maxAbs = Math.max(...balances.map(b => Math.abs(b.balance)), 1);
  el.innerHTML = balances.map(b => {
    const pct   = Math.round((Math.abs(b.balance) / maxAbs) * 100);
    const cls   = b.balance > 0.01 ? 'recv' : b.balance < -0.01 ? 'pay' : 'even';
    const label = b.balance > 0.01 ? `+₹${fmt(b.balance)} to receive`
                : b.balance < -0.01 ? `-₹${fmt(Math.abs(b.balance))} to pay` : 'Settled ✓';
    const init  = b.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `<div class="balance-card">
      <div class="bc-header">
        <div class="avatar ${cls}">${init}</div>
        <span class="bc-name">${b.name}</span>
        <span class="bc-badge ${cls}">${label}</span>
      </div>
      <div class="bc-bar-wrap"><div class="bc-bar ${cls}" style="width:${pct}%"></div></div>
      <div class="bc-sub">Paid ₹${fmt(b.paid)} · Share ₹${fmt(b.share)}</div>
    </div>`;
  }).join('');
}

// ── Render: Settlement ─────────────────────────────────────────────
function renderSettlement(txns) {
  const el = document.getElementById('settlementList');
  if (!expenses.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div>No expenses yet</div>`; return; }
  if (!txns.length) { el.innerHTML = `<div class="all-settled"><div class="icon">🎉</div>Everyone is settled!</div>`; return; }
  el.innerHTML = txns.map(t => {
    const fi = t.from.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const ti = t.to.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    return `<div class="txn">
      <div class="txn-left">
        <div class="avatar pay">${fi}</div>
        <div class="txn-info">
          <div class="txn-from"><strong>${t.from}</strong> pays</div>
          <div class="txn-to">→ <span>${t.to}</span></div>
        </div>
        <div class="avatar recv">${ti}</div>
      </div>
      <div class="txn-amount">₹${fmt(t.amount)}</div>
    </div>`;
  }).join('');
}

// ── Render: Chart ──────────────────────────────────────────────────
function renderChart(balances) {
  const canvas = document.getElementById('expenseChart');
  if (!canvas || !window.Chart) return;
  if (chart) { chart.destroy(); chart = null; }
  const hasPaid = balances.filter(b => b.paid > 0);
  if (!hasPaid.length) return;
  const COLORS = ['#0d9488','#3b82f6','#10b981','#f59e0b','#ef4444'];
  chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: { labels: hasPaid.map(b=>b.name), datasets: [{ data: hasPaid.map(b=>b.paid), backgroundColor: COLORS.slice(0,hasPaid.length), borderColor:'#fff', borderWidth:3, hoverOffset:6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#334155', font:{family:"'Plus Jakarta Sans', sans-serif",size:12,weight:'600'}, padding:16, usePointStyle:true, pointStyle:'circle' }},
        tooltip: { backgroundColor:'#fff', titleColor:'#0f172a', bodyColor:'#334155', borderColor:'#e2e8f0', borderWidth:1, padding:12, cornerRadius:8, callbacks:{ label: ctx=>`  Paid: ₹${fmt(ctx.parsed)}` }}
      }
    }
  });
}

// ── Validation ─────────────────────────────────────────────────────
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
  if (!v?.trim()) return 'Please describe what was spent.';
  if (v.trim().length < 2) return 'At least 2 characters required.';
  if (/^\d+(\.\d+)?$/.test(v.trim())) return 'Enter an item name, not a number.';
  if (/^[^a-zA-Z\u0900-\u097F]+$/.test(v.trim())) return 'Must contain at least one letter.';
  return null;
}
function checkAmount(r) {
  if (!r?.trim()) return 'Amount cannot be empty.';
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

// ── Download Report ────────────────────────────────────────────────
function downloadReport() {
  if (!expenses.length) { showToast('No expenses to report', 'error'); return; }
  const present   = presentMembers();
  const total     = expenses.reduce((s,e) => s+e.amount, 0);
  const share     = total / (present.length || 1);
  const balances  = calcBalances(present, share);
  const txns      = calcSettlement(balances);
  const absent    = ALL_MEMBERS.filter(m => !present.includes(m));
  const now       = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
  const mName     = currentMonth ? monthLabel(currentMonth) : now;
  const eRows     = expenses.map((e,i) => `<tr><td>${i+1}</td><td>${e.person}</td><td>${e.item}</td><td style="text-align:right;font-weight:600">₹${fmt(e.amount)}</td></tr>`).join('');
  const bRows     = balances.map(b => { const c=b.balance>0.01?'#10b981':b.balance<-0.01?'#ef4444':'#64748b'; const l=b.balance>0.01?`+₹${fmt(b.balance)} to receive`:b.balance<-0.01?`-₹${fmt(Math.abs(b.balance))} to pay`:'Settled ✓'; return `<tr><td>${b.name}</td><td style="text-align:right">₹${fmt(b.paid)}</td><td style="text-align:right">₹${fmt(b.share)}</td><td style="text-align:right;color:${c};font-weight:700">${l}</td></tr>`; }).join('');
  const sRows     = txns.length ? txns.map(t=>`<tr><td><strong>${t.from}</strong></td><td style="text-align:center;color:#64748b">→ pays →</td><td><strong style="color:#0d9488">${t.to}</strong></td><td style="text-align:right;font-weight:700;color:#0d9488">₹${fmt(t.amount)}</td></tr>`).join('') : `<tr><td colspan="4" style="text-align:center;color:#10b981;font-weight:600">🎉 Everyone settled!</td></tr>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>ExpSplit — ${mName}</title><style>body{font-family:sans-serif;background:#f0f4f8;color:#0f172a;padding:2rem 1rem}.page{max-width:800px;margin:0 auto}.hdr{background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;border-radius:16px;padding:2rem;margin-bottom:1.5rem}.hdr h1{font-size:1.8rem;font-weight:800}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem}.stat{background:#fff;border-radius:12px;padding:1rem 1.2rem;border:1px solid #e2e8f0}.sl{font-size:.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:.3rem}.sv{font-size:1.5rem;font-weight:700;color:#0d9488}.sec{background:#fff;border-radius:12px;padding:1.5rem;margin-bottom:1.25rem;border:1px solid #e2e8f0}.st{font-size:.7rem;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#64748b;margin-bottom:1rem}table{width:100%;border-collapse:collapse;font-size:.88rem}th{background:#f8fafc;color:#64748b;font-size:.65rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:.6rem .9rem;text-align:left;border-bottom:1px solid #e2e8f0}td{padding:.7rem .9rem;border-bottom:1px solid #f1f5f9}tr:last-child td{border-bottom:none}.ft{text-align:center;color:#94a3b8;font-size:.78rem;margin-top:2rem}</style></head><body><div class="page"><div class="hdr"><h1>💰 ExpSplit Pro</h1><p style="opacity:.85;margin-top:.25rem">${mName}${absent.length?` · Absent: ${absent.join(', ')}`:''}  · Present: ${present.length} members</p><p style="opacity:.7;font-size:.8rem;margin-top:.25rem">Generated ${now}</p></div><div class="stats"><div class="stat"><div class="sl">Total Spent</div><div class="sv">₹${fmt(total)}</div></div><div class="stat"><div class="sl">Per Person</div><div class="sv" style="color:#10b981">₹${fmt(share)}</div></div><div class="stat"><div class="sl">Settlements</div><div class="sv" style="color:#f59e0b">${txns.length}</div></div></div><div class="sec"><div class="st">Expense Log</div><table><thead><tr><th>#</th><th>Paid By</th><th>Spent On</th><th style="text-align:right">Amount</th></tr></thead><tbody>${eRows}</tbody><tfoot><tr><td colspan="3" style="font-weight:700;padding:.8rem .9rem">Total</td><td style="text-align:right;font-weight:800;color:#0d9488;font-size:1rem;padding:.8rem .9rem">₹${fmt(total)}</td></tr></tfoot></table></div><div class="sec"><div class="st">Balance (${present.length} present)</div><table><thead><tr><th>Name</th><th style="text-align:right">Paid</th><th style="text-align:right">Share</th><th style="text-align:right">Balance</th></tr></thead><tbody>${bRows}</tbody></table></div><div class="sec"><div class="st">Final Settlement</div><table><thead><tr><th>From</th><th style="text-align:center"></th><th>To</th><th style="text-align:right">Amount</th></tr></thead><tbody>${sRows}</tbody></table></div><div class="ft">ExpSplit Pro · ${mName} · ${now}</div></div></body></html>`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})), download: `ExpSplit_${mName.replace(/\s+/g,'_')}.html` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('⬇ Report downloaded', 'success');
}

// ── Utilities ──────────────────────────────────────────────────────
function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  if (Number.isInteger(n)) return n.toLocaleString('en-IN');
  return n.toFixed(2).replace(/\.?0+$/,'').replace(/\B(?=(\d{3})+(?!\d))/g,',');
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ── Expose to HTML onclick ─────────────────────────────────────────
window.addExpense         = addExpense;
window.deleteExpense      = deleteExpense;
window.openEdit           = openEdit;
window.saveEdit           = saveEdit;
window.closeModal         = closeModal;
window.handleOverlayClick = handleOverlayClick;
window.resetAll           = resetAll;
window.downloadReport     = downloadReport;
window.selectMonth        = selectMonth;
window.createCurrentMonth = createCurrentMonth;
window.toggleMember       = toggleMember;

// ── VOICE ASSISTANT FUNCTIONS ─────────────────────────────────────

// Vibration feedback (mobile)
function vibrate(pattern = [100]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// Text-to-Speech + Visual feedback
function speak(text) {
  if (!synthesis) return Promise.resolve();
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.85;  // slower, easier to follow
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Show visual toast briefly when the phrase begins speaking
    utterance.onstart = () => {
      const toast = document.getElementById('voiceResponse');
      toast.textContent = text;
      toast.className = 'voice-toast show';
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
    };
    utterance.onend = resolve;
    utterance.onerror = resolve;
    synthesis.speak(utterance);
  });
}

// Init Speech APIs
function initVoice() {
  // SpeechSynthesis
  synthesis = window.speechSynthesis;
  
  // SpeechRecognition (webkit fallback)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Voice not supported, please type', 'error');
    return;
  }
  
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-IN';
  
  recognition.onstart = () => {
    document.getElementById('voiceBtn').classList.add('listening');
    vibrate([100, 50, 100]);
    showToast('Listening...', 'info');
  };
  
  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.toLowerCase().trim();
    handleVoiceCommand(text);
  };
  
  recognition.onerror = (event) => {
    let msg = 'Voice error';
    if (event.error === 'not-allowed') msg = 'Mic access denied';
    else if (event.error === 'no-speech') msg = 'No speech detected';
    else if (event.error === 'network') msg = 'Network issue';
    stopListening();
    speak(msg);
    showToast(msg, 'error');
  };
  
  recognition.onend = () => stopListening();
  
  // Bind button
  document.getElementById('voiceBtn').onclick = startListening;
}

// Start listening
function startListening() {
  stopListening();  // Ensure clean state
  
  if (!recognition) initVoice();
  if (!voiceState) {
    voiceState = 'querySession';
    const prompt = voiceWelcomeShown
      ? 'Try: total expense, top spender, who should pay, or add expense'
      : 'Haii Buddy, Try: total expense, top spender, who should pay, or add expense';
    voiceWelcomeShown = true;
    speak(prompt);
    autoListen();
    return;
  }
  
  if (synthesis.speaking) {
    synthesis.cancel();
    vibrate([200]);
    setTimeout(() => recognition.start(), 500);
    return;
  }
  
  recognition.start();
}

// Continuous listening for conversation
function autoListen() {
  if (!voiceState || !recognition) return;
  if (synthesis.speaking) {
    return setTimeout(autoListen, 300);
  }
  setTimeout(() => {
    document.getElementById('voiceBtn').classList.add('listening');
    recognition.start();
  }, 2000);  // Wait 2s after response before listening
}

// Stop listening
function stopListening() {
  document.getElementById('voiceBtn')?.classList.remove('listening');
  if (recognition) recognition.stop();
  if (voiceTimeout) {
    clearTimeout(voiceTimeout);
    voiceTimeout = null;
  }
}

// Reset conversation state (idle timeout)
function resetVoiceState() {
  voiceState = null;
  stopListening();
}

// ── Voice Command Dispatcher ──────────────────────────────────────
function handleVoiceCommand(text) {
  // Reset timeout
  if (voiceTimeout) clearTimeout(voiceTimeout);
  voiceTimeout = setTimeout(resetVoiceState, 10000);  // 10s idle reset
  
  // Normalize text
  text = text.toLowerCase().trim();
  
  console.log('Voice:', text, 'State:', voiceState);  // Debug
  
  // Conversation handling (add expense)
  if (voiceState && voiceState.startsWith('add')) {
    handleVoiceConversation(text);
    return;
  }
  
  if (voiceState === 'querySession' || voiceState === 'followup') {
    handleGeneralVoiceQuery(text);
    return;
  }
  
  // Query handling
  if (text.includes('total expense') || text.includes('total spent')) {
    handleQueryTotal();
  } else if (text.includes('top spender') || text.includes('max paid')) {
    handleQueryTopSpender();
  } else if (text.includes('who should pay') || text.includes('settlement') || text.includes('pay')) {
    handleQuerySettle();
  } else if (text.includes('add expense') || text.includes('new expense')) {
    handleAddStart();
  } else {
    speak("Try: total expense, top spender, who should pay, or add expense");
  }
  
  if (!voiceState) stopListening();
}

// ── QUERY HANDLERS (using existing data/functions) ────────────────

function handleQueryTotal() {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  return speak(`Total expense: rupees ${fmt(total)}`);
}

function handleQueryTopSpender() {
  const present = presentMembers();
  if (!present.length) { return speak("No members present"); }
  const share = expenses.reduce((s, e) => s + e.amount, 0) / present.length;
  const balances = calcBalances(present, share);
  const top = balances.reduce((max, b) => b.paid > max.paid ? b : max, {paid:0});
  return speak(`${top.name} spent most: rupees ${fmt(top.paid)}`);
}

function handleQueryOwes() {
  const present = presentMembers();
  if (!present.length) { speak("No members present"); return; }
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const share = total / present.length;
  const balances = calcBalances(present, share);
  
  let summary = [];
  balances.forEach(b => {
    if (b.balance > 0.01) summary.push(`${b.name} gets rupees ${fmt(b.balance)}`);
    else if (b.balance < -0.01) summary.push(`${b.name} pays rupees ${fmt(Math.abs(b.balance))}`);
  });
  speak(summary.length ? summary[0] : "All balanced");  // Short: first item
}

function handleQuerySettle() {
  const present = presentMembers();
  if (!present.length || !expenses.length) { 
    return speak("All settled"); 
  }
  const share = expenses.reduce((s, e) => s + e.amount, 0) / present.length;
  const balances = calcBalances(present, share);
  const txns = calcSettlement(balances);
  
  if (!txns.length) {
    return speak("All settled");
  }
  const summary = txns.map(t => `${t.from} pays ${t.to} rupees ${fmt(t.amount)}`).join('. ');
  return speak(summary || "All settled");
}

function handleGeneralVoiceQuery(text) {
  const lower = text.toLowerCase().trim();
  if (lower === 'no' || lower === 'no question' || lower === 'no questions' || lower === 'nothing') {
    speak('Okay');
    resetVoiceState();
    return;
  }
  if (lower.includes('add expense') || lower.includes('new expense')) {
    handleAddStart();
    return;
  }
  if (lower.includes('total expense') || lower.includes('total spent')) {
    handleQueryTotal().then(askFollowUp);
    return;
  }
  if (lower.includes('top spender') || lower.includes('max paid')) {
    handleQueryTopSpender().then(askFollowUp);
    return;
  }
  if (lower.includes('who should pay') || lower.includes('settlement') || lower.includes('pay')) {
    handleQuerySettle().then(askFollowUp);
    return;
  }
  speak('Try: total expense, top spender, who should pay, or add expense');
  autoListen();
}

function askFollowUp() {
  voiceState = 'followup';
  speak('Any other question?');
  autoListen();
}

// ── ADD EXPENSE CONVERSATION (3-step) ────────────────────────────

function handleVoiceConversation(text) {
  switch (voiceState) {
    case 'add1-who':
      handleAddWho(text);
      break;
    case 'add2-item':
      handleAddItem(text);
      break;
    case 'add3-amount':
      handleAddAmount(text);
      break;
  }
}

function handleAddStart() {
  voiceState = 'add1-who';
  speak("Who paid?");
  autoListen();
}

function handleAddWho(text) {
  const present = presentMembers();
  const who = present.find(p => 
    text.includes(p.toLowerCase()) || 
    text.includes(p.split(' ')[0].toLowerCase())
  ) || present[0];  // Default to first
  
  document.getElementById('personSelect').value = who;
  voiceState = 'add2-item';
  speak(`Okay, ${who}. What item?`);
  autoListen();  // Continuous
}

function handleAddItem(text) {
  // Clean item text (remove numbers, trim)
  let item = text.replace(/\d/g, '').trim().replace(/\s+/g, ' ').substring(0, 50);
  if (item.length < 2) item = 'Item';
  
  document.getElementById('forInput').value = item;
  voiceState = 'add3-amount';
  speak('How much amount?');
  autoListen();  // Continuous
}

function handleAddAmount(text) {
  // Extract number from text
  const numMatch = text.match(/(\d+(?:\.\d{0,2})?)/);
  const amount = numMatch ? parseFloat(numMatch[1]) : 0;
  
  if (amount > 0 && amount < 100000) {
    document.getElementById('amountInput').value = amount;
    
    // Auto-submit!
    setTimeout(addExpense, 500);  // Brief pause for UX
    
    speak("Expense added successfully");
    resetVoiceState();
  } else {
    speak("Say a valid amount like two hundred fifty");
    voiceState = 'add3-amount';  // Retry
    autoListen();  // Retry listen
  }
}
