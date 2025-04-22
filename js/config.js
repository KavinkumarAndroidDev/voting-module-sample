// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDuKns6v5EOUDL-aZXMA2i6223aquQzo1E",
    authDomain: "voter-card-scanner.firebaseapp.com",
    projectId: "voter-card-scanner",
    storageBucket: "voter-card-scanner.appspot.com",
    messagingSenderId:  "665299220821",
    appId: "1:665299220821:web:f8025478a24f5375c697dc",
    measurementId: "G-G88F77H8VR",
    databaseURL: "https://voter-card-scanner-default-rtdb.asia-southeast1.firebasedatabase.app",
    // Add other Firebase config parameters here if needed
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    // Make database globally accessible
    window.database = firebase.database();
    
    // Enable offline persistence to handle network issues
    window.database.goOnline();
    
    // Log successful connection
    console.log("Firebase connection established");
} catch (error) {
    console.error("Firebase initialization error:", error);
    document.getElementById('status').textContent = 'Error: Failed to connect to database';
} 