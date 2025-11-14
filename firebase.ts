import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// IMPORTANT: Replace with your Firebase project's configuration.
// It's recommended to use environment variables for this.
// For example, in a Vite project, you would use `import.meta.env.VITE_FIREBASE_API_KEY`.
const firebaseConfig = {
  apiKey: "AIzaSyCOoUSqJL7uOgLRdumFmBtmoBbMEekKvTY",
  authDomain: "lft-app-4a61a.firebaseapp.com",
  projectId: "lft-app-4a61a",
  storageBucket: "lft-app-4a61a.firebasestorage.app",
  messagingSenderId: "716434662454",
  appId: "1:716434662454:web:dc5d72168dd25e446c2497",
  measurementId: "G-LFEZYXFMML"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
