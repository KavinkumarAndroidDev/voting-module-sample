class VotingSystem {
    constructor(stationId, database) {
        this.stationId = stationId;
        this.database = database;
        this.votesRef = this.database.ref('votes');
        this.setupVotingUI();
    }

    setupVotingUI() {
        const container = document.querySelector('.container');
        
        // Create voting section
        const votingSection = document.createElement('div');
        votingSection.className = 'voting-section';
        votingSection.innerHTML = `
            <h2>Cast Your Vote</h2>
            <div class="candidates">
                <div class="candidate">
                    <input type="radio" id="candidate1" name="vote" value="candidate1">
                    <label for="candidate1">Candidate 1</label>
                </div>
                <div class="candidate">
                    <input type="radio" id="candidate2" name="vote" value="candidate2">
                    <label for="candidate2">Candidate 2</label>
                </div>
                <div class="candidate">
                    <input type="radio" id="candidate3" name="vote" value="candidate3">
                    <label for="candidate3">Candidate 3</label>
                </div>
            </div>
            <button id="submitVote" class="submit-vote-btn">Submit Vote</button>
        `;

        // Add voting section after the status container
        const statusContainer = document.querySelector('.status-container');
        statusContainer.parentNode.insertBefore(votingSection, statusContainer.nextSibling);

        // Add event listener for vote submission
        document.getElementById('submitVote').addEventListener('click', () => this.submitVote());
    }

    async submitVote() {
        const selectedVote = document.querySelector('input[name="vote"]:checked');
        
        if (!selectedVote) {
            alert('Please select a candidate before submitting your vote.');
            return;
        }

        try {
            const voteData = {
                stationId: this.stationId,
                candidate: selectedVote.value,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };

            await this.votesRef.push(voteData);
            alert('Vote submitted successfully!');
            
            // Disable voting after submission
            document.querySelectorAll('input[name="vote"]').forEach(input => {
                input.disabled = true;
            });
            document.getElementById('submitVote').disabled = true;
            
        } catch (error) {
            console.error('Error submitting vote:', error);
            alert('Failed to submit vote. Please try again.');
        }
    }
} 