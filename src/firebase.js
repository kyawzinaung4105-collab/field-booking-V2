// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC8wQfK1j-EdCi51gqUVFZAOeksMKS-nMY",
  authDomain: "football-booking-sorqyf.firebaseapp.com",
  projectId: "football-booking-sorqyf",
  storageBucket: "football-booking-sorqyf.firebasestorage.app",
  messagingSenderId: "106157196548",
  appId: "1:106157196548:web:614fd3e9a7974f11923c51"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firestore ကို အသုံးပြုနိုင်ရန် ဒီစာကြောင်းကိုပါ ထပ်ထည့်ပေးပါ
import { getFirestore } from "firebase/firestore";
export const db = getFirestore(app);