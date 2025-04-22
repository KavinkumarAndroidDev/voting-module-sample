class StationManager {
    constructor() {
        this.currentStationId = null;
        this.stationRef = null;
        this.heartbeatInterval = null;
        this.setupLogoutHandlers();
    }

    async allocateStation() {
        try {
            // Get a reference to the stations node
            const stationsRef = window.database.ref('stations');
            
            // First, get all stations to find an inactive one
            const snapshot = await stationsRef.once('value');
            const stations = snapshot.val();
            
            if (!stations) {
                throw new Error('No stations found in database. Please import the stations data manually.');
            }
            
            // Find the first inactive station
            let foundStationId = null;
            for (let stationId in stations) {
                // Check if the station follows the pattern station1, station2, etc.
                if (stationId.startsWith('station') && stations[stationId].session === 'inactive') {
                    foundStationId = stationId;
                    break;
                }
            }
            
            if (!foundStationId) {
                throw new Error('No available stations. All stations are currently active.');
            }
            
            // Now update only the specific station using a transaction
            const stationRef = window.database.ref(`stations/${foundStationId}`);
            const result = await stationRef.transaction((station) => {
                if (!station) return null;
                
                // Double-check the station is still inactive
                if (station.session === 'inactive') {
                    station.session = 'active';
                    station.lastActive = firebase.database.ServerValue.TIMESTAMP;
                    this.currentStationId = foundStationId;
                    return station;
                }
                
                return null; // Station is no longer inactive
            });
            
            if (result.committed) {
                this.stationRef = window.database.ref(`stations/${this.currentStationId}`);
                this.setupStationCleanup();
                this.startHeartbeat();
                return this.currentStationId;
            } else {
                throw new Error('Failed to allocate station');
            }
        } catch (error) {
            console.error('Error allocating station:', error);
            throw error;
        }
    }

    startHeartbeat() {
        // Send heartbeat every 30 seconds to keep the station active
        this.heartbeatInterval = setInterval(() => {
            if (this.stationRef) {
                this.stationRef.update({
                    lastActive: firebase.database.ServerValue.TIMESTAMP
                }).catch(error => {
                    console.error('Heartbeat error:', error);
                    // Try to reconnect if there's an error
                    this.handleConnectionError();
                });
            }
        }, 30000);
    }

    handleConnectionError() {
        // Clear the heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Try to reconnect after a delay
        setTimeout(() => {
            if (this.currentStationId) {
                this.stationRef.set({ 
                    session: 'inactive',
                    lastActive: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    // Try to allocate a new station
                    this.allocateStation().catch(error => {
                        console.error('Failed to reconnect:', error);
                        document.getElementById('status').textContent = 'Error: Connection lost. Please refresh the page.';
                    });
                });
            }
        }, 5000);
    }

    setupStationCleanup() {
        // Handle page unload/close
        window.addEventListener('beforeunload', () => {
            this.cleanupStation();
        });

        // Handle browser/tab crash
        window.addEventListener('unload', () => {
            this.cleanupStation();
        });
    }

    cleanupStation() {
        if (this.currentStationId && this.stationRef) {
            // Clear the heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            // Mark the station as inactive
            this.stationRef.set({ 
                session: 'inactive',
                lastActive: firebase.database.ServerValue.TIMESTAMP
            }).catch(error => {
                console.error('Error during cleanup:', error);
            });
        }
    }

    setupLogoutHandlers() {
        // Get modal elements
        const passwordModal = document.getElementById('passwordModal');
        const confirmModal = document.getElementById('confirmModal');
        const passwordInput = document.getElementById('passwordInput');
        const submitPasswordBtn = document.getElementById('submitPassword');
        const cancelPasswordBtn = document.getElementById('cancelPassword');
        const confirmLogoutBtn = document.getElementById('confirmLogout');
        const cancelLogoutBtn = document.getElementById('cancelLogout');
        const logoutBtn = document.getElementById('logoutBtn');

        // Show password modal when logout button is clicked
        logoutBtn.addEventListener('click', () => {
            passwordModal.style.display = 'flex';
            passwordInput.value = '';
            passwordInput.focus();
        });

        // Handle password submission
        submitPasswordBtn.addEventListener('click', () => {
            const password = passwordInput.value;
            if (password === '771987') {
                // Password correct, show confirmation modal
                passwordModal.style.display = 'none';
                confirmModal.style.display = 'flex';
            } else {
                // Password incorrect
                alert('Incorrect password. Please try again.');
                passwordInput.value = '';
                passwordInput.focus();
            }
        });

        // Handle password cancellation
        cancelPasswordBtn.addEventListener('click', () => {
            passwordModal.style.display = 'none';
        });

        // Handle confirmation
        confirmLogoutBtn.addEventListener('click', () => {
            confirmModal.style.display = 'none';
            this.manualLogout();
        });

        // Handle confirmation cancellation
        cancelLogoutBtn.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });

        // Allow Enter key to submit password
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitPasswordBtn.click();
            }
        });
    }

    manualLogout() {
        if (this.currentStationId && this.stationRef) {
            // Clear the heartbeat interval
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            // Mark the station as inactive
            this.stationRef.set({ 
                session: 'inactive',
                lastActive: firebase.database.ServerValue.TIMESTAMP
            }).then(() => {
                document.getElementById('status').textContent = 'Status: Logged Out';
                document.getElementById('logoutBtn').disabled = true;
                
                // Add a button to get a new station
                const getNewStationBtn = document.createElement('button');
                getNewStationBtn.textContent = 'Get New Station';
                getNewStationBtn.className = 'get-new-station-btn';
                getNewStationBtn.style.marginTop = '20px';
                getNewStationBtn.style.padding = '10px 20px';
                getNewStationBtn.style.backgroundColor = '#3498db';
                getNewStationBtn.style.color = 'white';
                getNewStationBtn.style.border = 'none';
                getNewStationBtn.style.borderRadius = '5px';
                getNewStationBtn.style.cursor = 'pointer';
                
                getNewStationBtn.addEventListener('click', () => {
                    // Try to allocate a new station
                    this.allocateStation().then(newStationId => {
                        document.getElementById('stationId').textContent = `Station ID: ${newStationId}`;
                        document.getElementById('status').textContent = 'Status: Active';
                        document.getElementById('logoutBtn').disabled = false;
                        getNewStationBtn.remove();
                    }).catch(error => {
                        document.getElementById('status').textContent = `Error: ${error.message}`;
                    });
                });
                
                // Add the button to the page
                document.querySelector('.container').appendChild(getNewStationBtn);
            }).catch(error => {
                console.error('Error during manual logout:', error);
                document.getElementById('status').textContent = 'Error: Failed to logout';
            });
        }
    }
}

// Initialize station manager when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const stationManager = new StationManager();
    try {
        const stationId = await stationManager.allocateStation();
        document.getElementById('stationId').textContent = `Station ID: ${stationId}`;
        document.getElementById('status').textContent = 'Status: Active';
    } catch (error) {
        document.getElementById('status').textContent = `Error: ${error.message}`;
    }
}); 