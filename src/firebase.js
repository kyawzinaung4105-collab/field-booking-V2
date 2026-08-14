import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCMuEbPcTT9j-WvNLAWcAX3nJr_-x1uFo",
  authDomain: "fieldbooking-80ad6.firebaseapp.com",
  projectId: "fieldbooking-80ad6",
  storageBucket: "fieldbooking-80ad6.appspot.com",
  messagingSenderId: "297623698493",
  appId: "1:297623698493:web:49483a28305cba8abc7e54"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
