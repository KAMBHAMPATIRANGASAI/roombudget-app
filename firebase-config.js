// 🔥 Import Firebase (MODULAR v10)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 🔥 Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC7yj0KCcpyb1lZZnzp4LKfZBIeYKKvXOc",
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

console.log('Firebase initialized');
console.log('Firebase project:', firebaseConfig.projectId);
console.log('Firebase auth domain:', firebaseConfig.authDomain);
console.log('Firebase app name:', app.name);
console.log('Auth service initialized:', auth !== undefined);
console.log('Firestore service initialized:', db !== undefined);

// 🔥 Export everything
export { auth, db, collection, addDoc, onSnapshot };