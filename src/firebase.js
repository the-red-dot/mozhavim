import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBoinMU8YuBL-u9IxaqMCTgJ3-98DLJ7q4",
  authDomain: "mozhavim.firebaseapp.com",
  projectId: "mozhavim",
  storageBucket: "mozhavim.firebasestorage.app",
  messagingSenderId: "166521021388",
  appId: "1:166521021388:web:8f889e942907c584d03369",
  measurementId: "G-930J399Q96"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };