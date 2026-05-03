// 🔥 Import Firebase (MODULAR v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔥 Your Firebase config (REAL VALUES)
const firebaseConfig = {
  apiKey: "AIzaSy...",  // keep your actual key here
  authDomain: "roombudget-app.firebaseapp.com",
  projectId: "roombudget-app",
  storageBucket: "roombudget-app.firebasestorage.app",
  messagingSenderId: "1056177026184",
  appId: "1:1056177026184:web:53427486a28076270e5b3d"
};

// 🔥 Initialize Firebase
const app = initializeApp(firebaseConfig);

// 🔥 Initialize services
const auth = getAuth(app);
const db = getFirestore(app);

// 🔥 Export everything
export { auth, db, collection, addDoc, onSnapshot };