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