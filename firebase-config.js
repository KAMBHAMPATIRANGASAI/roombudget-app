// 🔥 Import Firebase (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// 🔥 Your config
export const firebaseConfig = {
  apiKey: "AIzaSyC7yj0KCcpyb1lZZnzp4LKfZBIeYKKvXOc",
  authDomain: "roombudget-app.firebaseapp.com",
  projectId: "roombudget-app",
  storageBucket: "roombudget-app.firebasestorage.app",
  messagingSenderId: "1056177026184",
  appId: "1:1056177026184:web:53427486a28076270e5b3d"
};

// 🔥 Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 🔥 Export for APP.js
export { db, collection, addDoc, onSnapshot };