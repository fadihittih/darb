// Firebase init — shared by every page. Import from here, never re-initialize.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Web config is public by design; access is controlled by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDeDLpU7mAPYVCTZQj0XjHQ_wYlZtk9I5k",
  authDomain: "darb-pixelsdev.firebaseapp.com",
  projectId: "darb-pixelsdev",
  storageBucket: "darb-pixelsdev.firebasestorage.app",
  messagingSenderId: "1096458764303",
  appId: "1:1096458764303:web:f2c96e89ea0e92fa04237a"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
