class SignalingManager {
    constructor(peerConnection, socket, peerId, roomId, userId, username, polite) {
        this.pc = peerConnection;
        this.socket = socket;
        this.peerId = peerId;
        this.roomId = roomId;
        this.userId = userId;
        this.username = username;
        this.polite = polite;

        this.makingOffer = false;
        this.ignoreOffer = false;
        this.isSettingRemoteAnswerPending = false;

        // Setup internal listeners
        this.pc.onnegotiationneeded = async () => {
            try {
                this.makingOffer = true;
                await this.pc.setLocalDescription();
                this.socket.emit('offer', {
                    roomId: this.roomId,
                    targetSocketId: this.peerId,
                    offer: this.pc.localDescription,
                    from: { id: this.userId, username: this.username }
                });
            } catch (err) {
                console.error(`[Signaling] Offer generation failed: ${err}`);
            } finally {
                this.makingOffer = false;
            }
        };

        this.pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
                this.socket.emit('ice-candidate', {
                    roomId: this.roomId,
                    targetSocketId: this.peerId,
                    candidate
                });
            }
        };
    }

    async handleOffer(offer) {
        try {
            const offerCollision = this.makingOffer || this.pc.signalingState !== 'stable';

            this.ignoreOffer = !this.polite && offerCollision;

            if (this.ignoreOffer) {
                console.log(`[Signaling] Glare detected. Impolite peer ignoring offer from ${this.peerId}`);
                return;
            }

            if (offerCollision) {
                console.log(`[Signaling] Glare detected. Polite peer rolling back for ${this.peerId}`);
                await this.pc.setLocalDescription({ type: 'rollback' });
            }

            await this.pc.setRemoteDescription(offer);
            await this.pc.setLocalDescription();

            this.socket.emit('answer', {
                roomId: this.roomId,
                targetSocketId: this.peerId,
                answer: this.pc.localDescription,
                from: { id: this.userId, username: this.username }
            });
            console.log(`[Signaling] Sent answer to ${this.peerId}`);

        } catch (err) {
            console.error(`[Signaling] Error handling offer from ${this.peerId}:`, err);
        }
    }

    async handleAnswer(answer) {
        try {
            if (this.isSettingRemoteAnswerPending) {
                console.warn(`[Signaling] Ignoring duplicate answer from ${this.peerId}`);
                return;
            }

            if (this.pc.signalingState === 'stable') {
                console.warn(`[Signaling] Received answer in stable state from ${this.peerId}, ignoring`);
                return;
            }

            this.isSettingRemoteAnswerPending = true;
            await this.pc.setRemoteDescription(answer);
            console.log(`[Signaling] Remote description set for ${this.peerId}`);
        } catch (err) {
            console.error(`[Signaling] Error handling answer from ${this.peerId}:`, err);
        } finally {
            this.isSettingRemoteAnswerPending = false;
        }
    }

    async handleIceCandidate(candidate) {
        try {
            await this.pc.addIceCandidate(candidate);
        } catch (err) {
            if (!this.ignoreOffer) {
                console.warn(`[Signaling] Failed to add ICE candidate from ${this.peerId}:`, err);
            }
        }
    }
}

export default SignalingManager;
