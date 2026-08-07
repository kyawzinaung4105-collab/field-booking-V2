import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC8wQfK1j-EdCi51ggUVFZAoeksMKS-nMY",
  authDomain: "football-booking-sorqyf.firebaseapp.com",
  projectId: "football-booking-sorqyf",
  storageBucket: "football-booking-sorqyf.firebasestorage.app",
  messagingSenderId: "106157196548",
  appId: "1:106157196548:web:614fd3e9a794f11923c51"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);