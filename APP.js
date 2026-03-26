// ExpSplit Pro — Firebase Firestore Realtime App
// Single source of truth: Firestore "expenses" collection

// Firebase CDN Imports (ES6 modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Global State (Firestore driven)
let expenses = [];
let unsubscribe = null; // Listener cleanup

// 🔥 STEP 2: REAL-TIME LISTENER (SINGLE SOURCE)
function listenExpenses() {
  if (unsubscribe) unsubscribe(); // Clean previous

  const ref = collection(db, "expenses");
  
  unsubscribe = onSnapshot(ref, (snapshot) => {
    console.log("🔥 Firestore snapshot working");
    
    expenses = [];
    snapshot.forEach((document) => {
      expenses.push({
        id: document.id,
        ...document.data()
      });
    });
    
    console.log("UI updating with:", expenses.length, "expenses");
    updateUI(); // Central rebuild
  }, (error) => {
    console.error("Firestore listener error:", error);
  });
}

// 🔥 STEP 3: ADD EXPENSE (Firestore ONLY)
async function addExpenseFirebase(person, item, amount) {
  try {
    await addDoc(collection(db, "expenses"), {
      person,
      item, 
      amount: Number(amount),
      timestamp: Date.now()
    });
    console.log("✅ Added to Firestore");
  } catch (error) {
    console.error("Add error:", error);
  }
}

// 🔥 DELETE EXPENSE
async function deleteExpenseFirebase(id) {
  try {
    await deleteDoc(doc(db, "expenses", id));
  } catch (error) {
    console.error("Delete error:", error);
  }
}

// 🔥 UPDATE EXPENSE
async function updateExpenseFirebase(id, person, item, amount) {
  try {
    await updateDoc(doc(db, "expenses", id), {
      person,
      item,
      amount: Number(amount)
    });
  } catch (error) {
    console.error("Update error:", error);
  }
}

// 🔥 CENTRAL UI UPDATE (ALL sections)
function updateUI() {
  console.log("🔥 updateUI called with", expenses.length, "expenses");
  
  // Clear old UI
  const tbody = document.getElementById('expenseBody');
  tbody.innerHTML = '';

  // Render expenses
  renderExpenses(expenses);
  
  // Calculate totals (all expenses)
  calculateTotals(expenses);
  
  // Update balances (all expenses)
  updateBalances(expenses);
}

// Clear expense table
function clearExpenseUI() {
  document.getElementById('expenseBody').innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div>Syncing...</div></td></tr>';
}

// Render Expenses Table (Firestore data)
function renderExpenses(expenses) {
  const tbody = document.getElementById('expenseBody');
  
  if (!expenses || expenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">📋</div>No expenses yet — LIVE sync</div></td></tr>';
    return;
  }
  
  tbody.innerHTML = expenses.map((e, i) => `
    <tr>
      <td class="td-num">${i + 1}</td>
      <td class="td-name">${e.person}</td>
      <td><span class="td-for" title="${e.item}">${e.item}</span></td>
      <td class="td-amt">₹${fmt(e.amount)}</td>
      <td><div class="action-btns">
        <button class="icon-btn edit" onclick="openEditFirebase('${e.id}')" title="Edit">✏️</button>
        <button class="icon-btn del" onclick="deleteExpenseFirebase('${e.id}')" title="Delete">🗑</button>
      </div></td>
    </tr>
  `).join('');
}

// Calculate Totals from Firestore expenses
function calculateTotals(expenses) {
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);
  document.getElementById('totalDisplay').textContent = '₹' + fmt(total);
  document.getElementById('shareDisplay').textContent = '₹' + fmt(total / 5); // 5 members
  document.getElementById('txnCountDisplay').textContent = expenses.length > 0 ? 'LIVE' : '0';
}

// Update Balances (simplified - all present)
function updateBalances(expenses) {
  const paid = {};
  MEMBERS.forEach(m => paid[m] = 0);
  expenses.forEach(e => paid[e.person] = (paid[e.person] || 0) + e.amount);
  
  const share = expenses.reduce((sum, e) => sum + e.amount, 0) / 5;
  const balances = MEMBERS.map(name => ({
    name,
    paid: paid[name] || 0,
    share,
    balance: (paid[name] || 0) - share
  }));
  
  renderBalance(balances);
  renderSettlement([], null); // Simplified
  renderChart(balances);
}

// 🔥 UI Button Connections
window.addExpense = function() {
  const person = document.getElementById("personSelect").value;
  const item = document.getElementById("forInput").value.trim();
  const amount = document.getElementById("amountInput").value;

  if (!person || !item || !amount) return showToast('Fill all fields', 'error');
  
  document.getElementById("forInput").value = '';
  document.getElementById("amountInput").value = '';
  
  addExpenseFirebase(person, item, amount);
  showToast('✅ Synced to Firestore LIVE', 'success');
};

window.openEditFirebase = function(id) {
  // Edit modal (Firestore update)
  editingId = id;
  const expense = expenses.find(e => e.id === id);
  document.getElementById('editPerson').value = expense.person;
  document.getElementById('editFor').value = expense.item;
  document.getElementById('editAmount').value = expense.amount;
  document.getElementById('editModal').classList.add('open');
};

// 🔥 START FIRESTORE ON LOAD
window.onload = () => {
  console.log("🚀 Starting Firestore realtime app");
  listenExpenses();
};

// Cleanup
window.onbeforeunload = () => {
  if (unsubscribe) unsubscribe();
};

