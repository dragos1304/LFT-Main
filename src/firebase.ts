import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCOoUSqJL7uOgLRdumFmBtmoBbMEekKvTY",
  authDomain: "lft-app-4a61a.firebaseapp.com",
  projectId: "lft-app-4a61a",
  storageBucket: "lft-app-4a61a.appspot.com",
  messagingSenderId: "716434662454",
  appId: "1:716434662454:web:dc5d72168dd25e446c2497",
  measurementId: "G-LFEZYXFMML"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);