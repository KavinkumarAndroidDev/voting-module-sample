// Disable right-click
document.addEventListener('contextmenu', event => event.preventDefault());

// Block some keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if (e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") ||
      (e.ctrlKey && e.key.toLowerCase() === "u") ||
      (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "c")) {
    e.preventDefault();
  }
});

// Warn before leaving
window.onbeforeunload = function(event) {
  // Standard practice to check if the event has been prevented
  if (!event.defaultPrevented) {
    return "Leaving this page might interrupt the voting process. Are you sure you want to proceed?";
  }
};

// Function to check if the document is in fullscreen
function isFullscreen() {
  return !!(document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

// Request full screen
function openFullscreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.mozRequestFullScreen) { /* Firefox */
    elem.mozRequestFullScreen();
  } else if (elem.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { /* IE/Edge */
    elem.msRequestFullscreen();
  }
}

// Event listener for the first click to enter fullscreen
function onFirstClick() {
  openFullscreen();
  document.removeEventListener('click', onFirstClick); // Remove listener after first click
}

document.addEventListener('click', onFirstClick);

// Event listener to re-enter fullscreen if focus is regained and not already in fullscreen
document.addEventListener('focus', () => {
  if (!isFullscreen()) {
    openFullscreen();
  }
});


//NEW
async function generateSalt() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
}

async function loadPublicKey() {
  try {
      const response = await fetch('public_key_spki.b64');
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      const b64 = await response.text();
      const der = Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
      return await crypto.subtle.importKey(
          'spki',
          der.buffer,
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['encrypt']
      );
  } catch (error) {
      console.error('Error loading or importing public key:', error);
      return null;
  }
}

async function sha256Hash(data) {
  const msgUint8 = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function encryptRSA(data, publicKey) {
  if (!publicKey) {
      console.error('Public key not loaded.');
      return null;
  }
  const dataUint8 = new TextEncoder().encode(data);
  const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      dataUint8
  );
  return btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
}