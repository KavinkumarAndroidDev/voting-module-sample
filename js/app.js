// js/app.js
class StationManager {
    constructor() {
        this.currentStationId = null;
        this.currentBoothId = null; // Track the current booth ID
        this.stationRef = null;
        this.heartbeatInterval = null;
        this.activeVoterId = null;
        this.voteTimerInterval = null;
        this.voteEndTime = null;
        this.voterIdQueue = [];
        this.votingActive = false;
        this.delayTimeout = null; // To clear the timeout if needed
        this.publicKey = null;
        this.setupLogoutHandlers();
        this.setupCloseConfirmation();
        this.beepSound = new Audio('beep.mp3');
        this.loadPublicKey();
    }

    async loadPublicKey() {
        this.publicKey = await loadPublicKey();
    }

    async requestBoothLogin() {
        return new Promise((resolve, reject) => {
            const boothId = prompt("Enter Booth ID:");
            if (boothId) {
                resolve(boothId.trim());
            } else {
                reject("Booth ID cannot be empty.");
            }
        });
    }

    async verifyBoothPassword(boothId) {
        try {
            const doc = await firebase.firestore().collection('booth_credentials').doc(boothId).get();
            if (doc.exists) {
                const data = doc.data();
                const password = prompt(`Enter password for Booth ${boothId}:`);
                if (password === data.password) {
                    return true;
                } else {
                    alert('Incorrect password.');
                    return false;
                }
            } else {
                alert(`Booth ID "${boothId}" not found.`);
                return false;
            }
        } catch (error) {
            console.error("Error verifying booth password:", error);
            alert("Failed to verify booth credentials.");
            return false;
        }
    }

    async allocateStation(boothId) {
        try {
            const stationsRef = window.database.ref(`booths/${boothId}/stations`);
            const snapshot = await stationsRef.once('value');
            const stations = snapshot.val();
    
            if (!stations) {
                throw new Error(`No stations found for booth ${boothId}.`);
            }
    
            let foundStationId = null;
            for (const stationId in stations) {
                if (stations[stationId].session === 'inactive') {
                    foundStationId = stationId;
                    break;
                }
            }
    
            if (!foundStationId) {
                throw new Error(`No available stations in booth ${boothId}.`);
            }
    
            const stationRef = window.database.ref(`booths/${boothId}/stations/${foundStationId}`);
            const result = await stationRef.transaction((station) => {
                if (station && station.session === 'inactive') {
                    station.session = 'active';
                    station.lastActive = firebase.database.ServerValue.TIMESTAMP;
                    station.currentVoterIds = {};
                    this.currentStationId = foundStationId;
                    this.currentBoothId = boothId; // Ensure booth ID is set here as well
                    return station;
                }
                return null;
            });
    
            if (result.committed) {
                // Now 'this' should correctly refer to the StationManager instance
                this.stationRef = window.database.ref(`booths/${this.currentBoothId}/stations/${this.currentStationId}`);
                this.setupStationCleanup();
                this.startHeartbeat();
                this.setupVoterIdListener();
                this.setupVoteSubmission();
                this.clearVoterDetails();
                this.disableVoting();
                this.loadCandidates(); // Load candidates after station allocation
                return this.currentStationId;
            } else {
                throw new Error('Failed to allocate station');
            }
        } catch (error) {
            console.error('Error allocating station:', error);
            throw error;
        }
    }

    async loadCandidates() {
        const candidatesDiv = document.querySelector('.candidates');
        candidatesDiv.innerHTML = ''; // Clear existing placeholders
        try {
            const candidatesSnapshot = await firebase.firestore().collection('candidates').get();
            candidatesSnapshot.forEach(doc => {
                const candidateData = doc.data();
                const candidateId = doc.id;
                const candidateDiv = document.createElement('label');
candidateDiv.classList.add('candidate');
candidateDiv.innerHTML =
    '<input type="radio" name="vote" value="' + candidateId + '" disabled>' +
    '<div class="candidate-info">' +
        '<img src="' + candidateData.imageURL + '" alt="' + candidateData.englishName + '" class="party-image">' +
        '<div class="names">' +
            '<span class="english-name">' + candidateData.englishName + '</span>' +
            '<span class="tamil-name">' + candidateData.tamilName + '</span>' +
        '</div>' +
    '</div>';
candidatesDiv.appendChild(candidateDiv);
            });
        } catch (error) {
            console.error('Error fetching candidates:', error);
            candidatesDiv.innerHTML = '<p class="error-message">Failed to load candidates.</p>';
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.stationRef) {
                this.stationRef.update({
                    lastActive: firebase.database.ServerValue.TIMESTAMP
                }).catch(error => {
                    console.error('Heartbeat error:', error);
                    this.handleConnectionError();
                });
            }
        }, 30000);
    }

    handleConnectionError() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        setTimeout(() => {
            if (this.currentStationId && this.currentBoothId) {
                this.stationRef.set({
                    session: 'inactive',
                    lastActive: firebase.database.ServerValue.TIMESTAMP,
                    currentVoterIds: null
                }).then(() => {
                    this.allocateStation(this.currentBoothId).catch(error => {
                        console.error('Failed to reconnect:', error);
                        document.getElementById('status').textContent = 'Error: Connection lost. Please refresh the page.';
                    });
                });
            }
        }, 5000);
    }

    setupStationCleanup() {
        window.addEventListener('beforeunload', () => {
            this.cleanupStation();
        });

        window.addEventListener('unload', () => {
            this.cleanupStation();
        });
    }

    cleanupStation() {
        if (this.currentStationId && this.currentBoothId && this.stationRef) {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            this.stationRef.update({
                session: 'inactive',
                lastActive: firebase.database.ServerValue.TIMESTAMP,
                currentVoterIds: null
            }).catch(error => {
                console.error('Error during cleanup:', error);
            });
        }
    }

    setupVoterIdListener() {
        if (this.stationRef) {
            const currentVoterIdsRef = this.stationRef.child('currentVoterIds');

            currentVoterIdsRef.on('child_added', (snapshot) => {
                const voterId = snapshot.val();
                if (voterId) {
                    this.voterIdQueue.push(voterId);
                    this.processVoterQueue();
                }
            });

            currentVoterIdsRef.on('child_removed', (snapshot) => {
                const removedVoterId = snapshot.val();
                const index = this.voterIdQueue.indexOf(removedVoterId);
                if (index > -1) {
                    this.voterIdQueue.splice(index, 1);
                    if (this.activeVoterId === removedVoterId) {
                        this.resetVotingUI();
                        this.clearDelayMessage();
                        this.activeVoterId = null;
                        this.processVoterQueue();
                    }
                }
            });
        }
    }

    processVoterQueue() {
        if (!this.activeVoterId && this.voterIdQueue.length > 0 && !this.votingActive) {
            this.votingActive = true;
            this.activeVoterId = this.voterIdQueue.shift();
            this.fetchVoterDetails(this.activeVoterId);
            this.startVoteTimer();
        }
    }

    async fetchVoterDetails(voterId) {
        try {
            const voterDoc = await firebase.firestore().collection('Voter detials').doc(voterId).get();
            if (voterDoc.exists) {
                const voterData = voterDoc.data();
                document.getElementById('voterName').textContent = voterData.Name || 'N/A';
                document.getElementById('voterIdDisplay').textContent = voterId;
                this.enableVoting();
            } else {
                this.resetVotingUI();
                this.clearDelayMessage();
                alert(`Voter details not found for ID: ${voterId}`);
                await this.removeCurrentVoterIdFromDB(voterId);
                this.votingActive = false;
                this.processVoterQueue();
            }
        } catch (error) {
            this.resetVotingUI();
            this.clearDelayMessage();
            alert('Failed to fetch voter details.');
            await this.removeCurrentVoterIdFromDB(voterId);
            this.votingActive = false;
            this.processVoterQueue();
        }
    }

    resetVotingUI() {
        this.clearVoterDetails();
        this.disableVoting();
        this.stopVoteTimer();
    }

    clearVoterDetails() {
        document.getElementById('voterName').textContent = 'Loading...';
        document.getElementById('voterIdDisplay').textContent = 'Loading...';
    }

    enableVoting() {
        document.querySelectorAll('input[name="vote"]').forEach(input => {
            input.disabled = false;
        });
        document.getElementById('submitVote').disabled = false;
    }

    disableVoting() {
        document.querySelectorAll('input[name="vote"]').forEach(input => {
            input.disabled = true;
            input.checked = false;
        });
        document.getElementById('submitVote').disabled = true;
    }

    startVoteTimer() {
        this.voteEndTime = Date.now() + 5 * 60 * 1000; // 5 minutes
        this.updateVoteTimerDisplay();
        this.voteTimerInterval = setInterval(() => {
            this.updateVoteTimerDisplay();
            if (Date.now() > this.voteEndTime) {
                this.stopVoteTimer();
                this.removeCurrentVoterIdFromDB(this.activeVoterId);
                alert('Voting time expired.');
                this.resetVotingUI();
                this.clearDelayMessage();
                this.activeVoterId = null;
                this.votingActive = false;
                this.processVoterQueue();
            }
        }, 1000);
    }

    stopVoteTimer() {
        clearInterval(this.voteTimerInterval);
        this.voteTimerInterval = null;
        document.getElementById('voteTimer').textContent = '--:--';
    }

    updateVoteTimerDisplay() {
        const timeLeft = this.voteEndTime - Date.now();
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        document.getElementById('voteTimer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    displayDelayMessage(message) {
        document.getElementById('delayMessage').textContent = message;
    }

    clearDelayMessage() {
        document.getElementById('delayMessage').textContent = '';
    }

    setupVoteSubmission() {
        const submitVoteBtn = document.getElementById('submitVote');
        submitVoteBtn.addEventListener('click', async () => {
            const selectedVote = document.querySelector('input[name="vote"]:checked');
            if (selectedVote && this.activeVoterId) {
                await this.submitVote(this.activeVoterId, selectedVote.value);
            } else {
                alert('Select a candidate.');
            }
        });
    }

    async submitVote(voterId, candidateId) {
        try {
          const salt = await generateSalt();
          const timestamp = Date.now();
          const voteDataString = `${voterId}|${candidateId}|${salt}|${timestamp}`;
          const hashedVoteData = await sha256Hash(voteDataString);
          const encryptedHash = await encryptRSA(hashedVoteData, this.publicKey);
      
          if (encryptedHash) {
            const voteDetailsFirestore = {
              encryptedHash: encryptedHash
            };
            await firebase.firestore().collection('votedetials').doc(voterId).set(voteDetailsFirestore);
            console.log('Encrypted vote submitted to Firestore for voter:', voterId);
      
            // Store the encrypted hash in Firebase Realtime Database
            const blockchainVotesRef = window.database.ref('blockchain_votes');
            const voteEntry = {
              voterId: voterId,
              candidateId: candidateId,
              salt: salt,
              timestamp: timestamp
            };
            await blockchainVotesRef.push(voteEntry);
            console.log('Encrypted vote data pushed to Realtime Database:', encryptedHash);
            this.beepSound.play();
      
            await firebase.firestore().collection('Voter detials').doc(voterId).update({
              hasVoted: true
            });
            await this.removeCurrentVoterIdFromDB(voterId);
            this.resetVotingUI();
            this.activeVoterId = null;
            this.votingActive = true;
      
            this.displayDelayMessage('Waiting for 30 seconds...');
            this.delayTimeout = setTimeout(() => {
              this.votingActive = false;
              this.clearDelayMessage();
              this.processVoterQueue();
            }, 30000);
      
            // **New: Send data to n8n webhook**
            const voterDoc = await firebase.firestore().collection('Voter detials').doc(voterId).get();
            if (voterDoc.exists) {
              const voterData = voterDoc.data();
              const voterName = voterData.Name || 'N/A';
              const email = voterData.emailid;
              const phoneNumber = voterData.phonenumber;
              const formattedTimestamp = new Date(timestamp).toLocaleString();
              const messagePayload = {
                voterId: voterId,
                voterName: voterName,
                email: email,
                phoneNumber: phoneNumber,
                timestamp: formattedTimestamp,
                fullMessage: `${voterName}, your vote has been casted successfully at ${formattedTimestamp}. Regarding any issue or any problem regarding voting or booth kindly report on this link https://voting-issue-complaint-form-ete.netlify.app/, immediate actions are take place.`
              };
      
              try {
                const n8nWebhookUrl = 'https://primary-production-ad16.up.railway.app/webhook/5139c4fe-1da5-4e33-997a-f83d92c868c6'; // Replace with your n8n webhook URL
                const response = await fetch(n8nWebhookUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(messagePayload),
                });
      
                if (response.ok) {
                  console.log('Data sent to n8n successfully:', await response.json());
                } else {
                  console.error('Failed to send data to n8n:', response.status);
                }
              } catch (error) {
                console.error('Error sending data to n8n:', error);
              }
            }
      
          } else {
            alert('Failed to encrypt vote data.');
          }
      
        } catch (error) {
          console.error('Error submitting vote:', error);
          alert('Failed to submit vote.');
        }
      }

    async removeCurrentVoterIdFromDB(voterId) {
        if (this.currentStationId && this.currentBoothId && this.stationRef && voterId) {
            const currentVoterIdsRef = this.stationRef.child('currentVoterIds');
            const snapshot = await currentVoterIdsRef.orderByValue().equalTo(voterId).once('value');
            snapshot.forEach(childSnapshot => {
                childSnapshot.ref.remove();
            });
        }
    }

    setupLogoutHandlers() {
        const passwordModal = document.getElementById('passwordModal');
        const confirmModal = document.getElementById('confirmModal');
        const passwordInput = document.getElementById('passwordInput');
        const submitPasswordBtn = document.getElementById('submitPassword');
        const cancelPasswordBtn = document.getElementById('cancelPassword');
        const confirmLogoutBtn = document.getElementById('confirmLogout');
        const cancelLogoutBtn = document.getElementById('cancelLogout');
        const logoutBtn = document.getElementById('logoutBtn');

        logoutBtn.addEventListener('click', () => {
            passwordModal.style.display = 'flex';
            passwordInput.value = '';
            passwordInput.focus();
        });

        submitPasswordBtn.addEventListener('click', () => {
            const password = passwordInput.value;
            // Basic password check, consider fetching from database for security
            if (password === '771987') {
                passwordModal.style.display = 'none';
                confirmModal.style.display = 'flex';
            } else {
                alert('Incorrect password.');
                passwordInput.value = '';
                passwordInput.focus();
            }
        });

        cancelPasswordBtn.addEventListener('click', () => {
            passwordModal.style.display = 'none';
        });

        confirmLogoutBtn.addEventListener('click', () => {
            confirmModal.style.display = 'none';
            this.manualLogout();
        });

        cancelLogoutBtn.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });

        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitPasswordBtn.click();
            }
        });
    }

    manualLogout() {
        if (this.currentStationId && this.currentBoothId && this.stationRef) {
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            this.stopVoteTimer();
            this.stationRef.update({
                session: 'inactive',
                lastActive: firebase.database.ServerValue.TIMESTAMP,
                currentVoterIds: null
            }).then(() => {document.getElementById('status').textContent = 'Logged Out';
                document.getElementById('logoutBtn').disabled = true;
                this.clearVoterDetails();
                this.disableVoting();

                const getNewStationBtn = document.createElement('button');
                getNewStationBtn.textContent = 'Get New Station';
                getNewStationBtn.className = 'get-new-station-btn';
                getNewStationBtn.addEventListener('click', async () => {
                    try {
                        const boothId = await this.requestBoothLogin();
                        const isPasswordCorrect = await this.verifyBoothPassword(boothId);
                        if (isPasswordCorrect) {
                            const newStationId = await this.allocateStation(boothId);
                            document.getElementById('stationId').textContent = newStationId;
                            document.getElementById('status').textContent = 'Active';
                            document.getElementById('logoutBtn').disabled = false;
                            getNewStationBtn.remove();
                        } else {
                            document.getElementById('status').textContent = 'Booth login failed.';
                        }
                    } catch (error) {
                        document.getElementById('status').textContent = `Error: ${error}`;
                    }
                });
                const container = document.querySelector('.container');
                if (container) {
                    container.appendChild(getNewStationBtn);
                }
            }).catch(error => {
                console.error('Error during manual logout:', error);
                document.getElementById('status').textContent = 'Logout Failed';
            });
        }
    }

    setupCloseConfirmation() {
        window.addEventListener('beforeunload', (event) => {
            if (this.currentStationId && document.getElementById('status').textContent === 'Active') {
                event.preventDefault();
                event.returnValue = 'Are you sure you want to close? This will deactivate the station.'; // Modern browsers
                return 'Are you sure you want to close? This will deactivate the station.';       // Older browsers
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const stationManager = new StationManager();
    try {
        const boothId = await stationManager.requestBoothLogin();
        const isPasswordCorrect = await stationManager.verifyBoothPassword(boothId);
        if (isPasswordCorrect) {
            stationManager.currentBoothId = boothId; // Set booth ID immediately
            const stationId = await stationManager.allocateStation(boothId);
            document.getElementById('stationId').textContent = stationId;
            document.getElementById('status').textContent = 'Active';
        } else {
            document.getElementById('status').textContent = 'Booth login failed.';
        }
    } catch (error) {
        document.getElementById('status').textContent = `Error: ${error}`;
    }
});