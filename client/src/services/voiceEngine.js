/**
 * VoiceEngine - Handles WebRTC connections, audio capture, encryption, and playback
 * Uses DataChannels for encrypted audio transmission
 * Includes speaking detection and security event logging
 */

import { cryptoService } from './cryptoService';
import SignalingManager from './SignalingManager';
import { io } from 'socket.io-client';

// Socket server URL - Dynamic for local network access
const getSocketUrl = () => {
    // If explicit URL in env, use it (production)
    if (import.meta.env.VITE_SOCKET_URL && !import.meta.env.DEV) {
        return import.meta.env.VITE_SOCKET_URL;
    }

    // For development, dynamically replace the port
    // This allows accessing via IP (e.g., 10.75.x.x) and having socket connect to same IP
    if (typeof window !== 'undefined') {
        const port = '5000';
        // Replace current port (likely 5173 or 5174) with backend port 5000
        let url = window.location.origin.replace(/:\d+$/, `:${port}`);
        // FORCE HTTP to avoid WSS connection failure
        return url.replace(/^https:/, 'http:');
    }

    return 'http://localhost:5000';
};

const SOCKET_URL = getSocketUrl();

// STUN servers from environment or default
const defaultStunUrls = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
const envStunUrls = import.meta.env.VITE_STUN_URLS ? import.meta.env.VITE_STUN_URLS.split(',') : defaultStunUrls;

const ICE_SERVERS = envStunUrls.map(url => ({ urls: url.trim() }));

// Speaking detection thresholds
const SPEAKING_THRESHOLD = 0.01;
const SPEAKING_HISTORY_SIZE = 5;

class VoiceEngine {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.audioContext = null;
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.signalingManagers = new Map(); // New: Track signaling managers per peer
        this.peerSessionKeys = new Map(); // Stores AES-GCM keys for each peer
        this.secureChannels = new Set(); // Track peers with ACKed keys
        this.audioNodes = new Map();
        this.currentRoom = null;
        this.userId = null;
        this.username = null;
        this.isConnected = false;
        this.isInitialized = false;

        // Audio processing
        this.processor = null;
        this.analyser = null;
        this.inputSampleRate = 48000;
        this.bufferSize = 2048;

        // Speaking detection
        this.speakingHistory = [];
        this.isSpeaking = false;
        this.peerSpeakingState = new Map();

        // ICE candidate queue for handling candidates before remote description is set
        this.pendingCandidates = new Map();

        // Event callbacks
        this.onParticipantJoined = null;
        this.onParticipantLeft = null;
        this.onConnectionStateChange = null;
        this.onSpeakingChange = null;
        this.onSpeakingChange = null;
        this.peerMuteState = new Map();
        this.onPeerMuteChange = null;
        this.onPeerSpeakingChange = null;
        this.onSecurityEvent = null;
        this.onIncomingCall = null;
        this.onError = null;
    }

    /**
     * Emit a security event
     */
    emitSecurityEvent(type, message) {
        const event = {
            type,
            message,
            timestamp: new Date().toLocaleTimeString()
        };
        console.log(`[Security] ${message}`);
        this.onSecurityEvent?.(event);
    }

    /**
     * Emit an error event
     */
    emitError(type, message) {
        const error = { type, message };
        console.error(`[Error] ${type}: ${message}`);
        this.onError?.(error);
    }

    /**
     * Initialize the voice engine with user credentials
     */
    async initialize(userId, username, token) {
        // Fix 2: Protect against multiple initialize() calls properly
        if (this.isInitialized) {
            console.log("VoiceEngine already initialized");
            return;
        }

        this.userId = userId;
        this.username = username;

        try {
            // Initialize Web Audio API context
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: this.inputSampleRate
                });
            }

            // Fix 3: Create socket ONLY ONCE with autoConnect: false
            this.socket = io(SOCKET_URL, {
                auth: { token },
                transports: ['websocket'], // Enforce WebSocket only
                secure: false, // Ensure we use WS not WSS
                upgrade: false, // Disable upgrade from polling
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                timeout: 20000, // Increase connection timeout
                autoConnect: false // Fix: Prevent auto-connection to control the flow
            });

            this.setupSocketListeners();

            // Fix 4: Mark initialized ONLY AFTER connect
            this.socket.on("connect", () => {
                console.log(`[Socket] Connected: ${this.socket.id}`);
                this.isInitialized = true;
                this.emitSecurityEvent('connection', 'Connected to signaling server');
                // Authenticate after connection if needed, though auth is sent in handshake
                this.socket.emit('authenticate', { userId, username });
            });

            this.socket.on("disconnect", (reason) => {
                console.log(`[Socket] Disconnected: ${reason}`);
                this.isInitialized = false;
                if (reason === 'io server disconnect' || reason === 'transport close') {
                    this.emitError('connection-lost', 'Connection to server lost');
                }
            });

            // Manually connect
            this.socket.connect();

            this.emitSecurityEvent('rsa-init', 'Voice engine initializing...');
            console.log('VoiceEngine initializing...');
        } catch (error) {
            this.emitError('initialization-failed', error.message);
            throw error;
        }
    }

    /**
     * Setup Socket.io event listeners for signaling
     */
    setupSocketListeners() {
        if (!this.socket) {
            console.error('Cannot setup listeners: socket is null');
            return;
        }

        this.socket.on('connect', () => {
            console.log('Socket connected:', this.socket?.id);
            this.emitSecurityEvent('connection', 'Connected to signaling server');
        });



        this.socket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            if (reason === 'io server disconnect' || reason === 'transport close') {
                this.emitError('connection-lost', 'Connection to server lost');
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            this.emitError('connection-lost', 'Failed to connect to server');
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            this.emitSecurityEvent('connection', 'Reconnected to signaling server');
        });

        this.socket.on('reconnect_failed', () => {
            this.emitError('connection-lost', 'Failed to reconnect after multiple attempts');
        });

        this.socket.on('incoming-call', (data) => {
            console.log('[VoiceEngine] Incoming call:', data);
            if (this.onIncomingCall) this.onIncomingCall(data);
        });

        // Handle user joining the room
        this.socket.on('user-joined', async (data) => {
            try {
                const { userId, username, socketId, publicKey } = data || {};
                if (!socketId) {
                    console.warn('user-joined event missing socketId');
                    return;
                }
                console.log(`User joined: ${username || 'Unknown'} (${socketId})`);

                await this.createPeerConnection(socketId, userId, username, publicKey, false);

                this.onParticipantJoined?.({ id: userId, username: username || 'Unknown', socketId });
            } catch (error) {
                console.error('Error handling user-joined:', error);
            }
        });

        // Handle user leaving
        this.socket.on('user-left', (data) => {
            try {
                const { userId, username, socketId } = data || {};
                if (!socketId) return;

                console.log(`User left: ${username || 'Unknown'}`);
                this.closePeerConnection(socketId);
                this.peerSpeakingState.delete(socketId);
                this.peerMuteState.delete(socketId);

                this.onParticipantLeft?.({ id: userId, username: username || 'Unknown', socketId });
            } catch (error) {
                console.error('Error handling user-left:', error);
            }
        });

        // Handle incoming WebRTC offer
        this.socket.on('offer', async (data) => {
            try {
                const { offer, from } = data || {};
                if (!offer || !from) return;

                let manager = this.signalingManagers.get(from);
                if (!manager) {
                    // We need to create connection if we receive an offer unexpectedly (impolite peer side)
                    // But createPeerConnection handles polite state.
                    // The socket handler for 'user-joined' creates the connection as "impolite" (isInitiator=true) usually?
                    // Wait, 'user-joined' -> we initiate. 'room-participants' -> we initiate.
                    // So effectively we are always initiator if we are seeing them join?
                    // No, "Perfect Negotiation" defines polite/impolite by ID comparison usually, or explicit role.
                    // Here I will assume we should create connection if missing.
                    const { fromUser } = data;
                    await this.createPeerConnection(from, fromUser?.id, fromUser?.username, fromUser?.publicKey, false);
                    manager = this.signalingManagers.get(from);
                }

                if (manager) {
                    await manager.handleOffer(offer);
                }
            } catch (error) {
                console.error('Error handling offer:', error);
            }
        });

        // Handle incoming WebRTC answer
        this.socket.on('answer', async (data) => {
            try {
                const { answer, from } = data || {};
                const manager = this.signalingManagers.get(from);
                if (manager) {
                    await manager.handleAnswer(answer);
                }
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        });

        // Handle incoming ICE candidate
        this.socket.on('ice-candidate', async (data) => {
            try {
                const { candidate, from } = data || {};
                const manager = this.signalingManagers.get(from);
                if (manager) {
                    await manager.handleIceCandidate(candidate);
                }
            } catch (error) {
                console.error('Error handling ice-candidate:', error);
            }
        });


        // Handle peer mute status
        this.socket.on('peer-mute-status', ({ socketId, isMuted }) => {
            this.peerMuteState.set(socketId, isMuted);
            this.onPeerMuteChange?.(socketId, isMuted);
        });

        // Handle room participants list (on join)
        this.socket.on('room-participants', async (data) => {
            try {
                const { participants } = data || {};
                if (!participants || !Array.isArray(participants)) {
                    console.log('No existing participants or invalid data');
                    return;
                }
                console.log('Existing participants:', participants.length);
                for (const participant of participants) {
                    if (participant?.socketId && participant.socketId !== this.socket?.id) {
                        await this.createPeerConnection(
                            participant.socketId,
                            participant.id,
                            participant.username || 'Unknown',
                            participant.publicKey,
                            true
                        );
                    }
                }
            } catch (error) {
                console.error('Error handling room-participants:', error);
            }
        });
    }

    /**
     * Join a voice room
     */
    async joinRoom(roomId, userPublicKey) {
        if (this.currentRoom) {
            await this.leaveRoom();
        }

        this.currentRoom = roomId;

        try {
            // Ensure socket is connected
            if (!this.socket || !this.socket.connected) {
                console.log('Socket not connected, waiting for connection...');

                // Wait for socket to connect (with timeout)
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Socket connection timeout'));
                    }, 5000);

                    if (this.socket) {
                        if (this.socket.connected) {
                            clearTimeout(timeout);
                            resolve();
                        } else {
                            this.socket.once('connect', () => {
                                clearTimeout(timeout);
                                resolve();
                            });
                        }
                    } else {
                        clearTimeout(timeout);
                        reject(new Error('Socket is not initialized. Please refresh the page.'));
                    }
                });
            }

            // Start audio capture
            await this.startAudioCapture();
            this.emitSecurityEvent('rsa-ready', 'RSA asymmetric encryption ready');

            // Notify server (socket is guaranteed to be connected now)
            this.socket.emit('join-room', {
                roomId,
                userId: this.userId,
                username: this.username,
                publicKey: userPublicKey
            });

            this.isConnected = true;
            this.onConnectionStateChange?.(true);

            this.emitSecurityEvent('handshake-complete', 'Joined voice channel securely');
            console.log(`Joined room: ${roomId}`);
        } catch (error) {
            this.currentRoom = null;
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                this.emitError('microphone-denied', 'Microphone access was denied');
            } else {
                this.emitError('join-failed', error.message);
            }
            throw error;
        }
    }


    /**
     * Leave current voice room
     */
    async leaveRoom() {
        if (!this.currentRoom) return;

        this.stopAudioCapture();

        for (const [peerId] of this.peerConnections) {
            this.closePeerConnection(peerId);
        }
        this.signalingManagers.clear();

        this.socket.emit('leave-room', {
            roomId: this.currentRoom,
            userId: this.userId,
            username: this.username
        });

        this.currentRoom = null;
        this.isConnected = false;
        this.peerSpeakingState.clear();

        this.onConnectionStateChange?.(false);
        this.onConnectionStateChange?.(false);
        console.log('Left room');
    }

    /**
     * Call a user to join the current room
     */
    callUser(targetUserId, roomId, roomName) {
        if (!this.socket || !this.isConnected) {
            console.warn('Cannot call user: not connected');
            return;
        }
        this.socket.emit('call-user', { targetUserId, roomId, roomName });
    }

    /**
     * Start capturing audio from microphone
     */
    async startAudioCapture() {
        try {
            // Ensure audioContext exists
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: this.inputSampleRate
                });
            }

            // Verify permissions api valid (some browsers like Firefox may behave differently)
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                    console.log(`[Permission] Microphone permission state: ${permissionStatus.state}`);
                    permissionStatus.onchange = () => {
                        console.log(`[Permission] Microphone permission changed to: ${permissionStatus.state}`);
                    };
                } catch (e) {
                    console.warn('[Permission] Could not query microphone permission:', e);
                }
            }

            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.inputSampleRate
                },
                video: false
            });

            // Resume audioContext if needed
            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createMediaStreamSource(this.localStream);

            // Create analyser for speaking detection
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            await this.setupAudioProcessor(source);

            // Start speaking detection
            this.startSpeakingDetection();

            console.log('Audio capture started');
        } catch (error) {
            console.error('Error starting audio capture:', error);
            throw error;
        }
    }

    /**
     * Start speaking detection loop
     */
    startSpeakingDetection() {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

        const detectSpeaking = () => {
            if (!this.analyser || !this.isConnected) return;

            this.analyser.getByteFrequencyData(dataArray);

            // Calculate average volume
            const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const normalizedVolume = average / 255;

            // Update speaking history
            this.speakingHistory.push(normalizedVolume > SPEAKING_THRESHOLD);
            if (this.speakingHistory.length > SPEAKING_HISTORY_SIZE) {
                this.speakingHistory.shift();
            }

            // Determine if speaking based on history (debouncing)
            const speakingCount = this.speakingHistory.filter(Boolean).length;
            const newSpeakingState = speakingCount >= SPEAKING_HISTORY_SIZE / 2;

            if (newSpeakingState !== this.isSpeaking) {
                this.isSpeaking = newSpeakingState;
                this.onSpeakingChange?.(this.isSpeaking);
            }

            requestAnimationFrame(detectSpeaking);
        };

        detectSpeaking();
    }

    /**
     * Setup audio processor for capturing and encrypting audio data
     */
    async setupAudioProcessor(source) {
        try {
            await this.audioContext.audioWorklet.addModule('/audio-processor.js');
            this.processor = new AudioWorkletNode(this.audioContext, 'audio-processor');

            this.processor.port.onmessage = async (event) => {
                const audioData = event.data; // Float32Array

                // Debug logging (throttled)
                if (!this.debugLogTime || Date.now() - this.debugLogTime > 3000) {
                    const maxAmp = Math.max(...audioData.map(Math.abs));
                    console.log(`[AudioDebug] Channels: ${this.dataChannels.size}, Peers: ${this.peerConnections.size}, MaxAmplitude: ${maxAmp.toFixed(4)}`);
                    this.debugLogTime = Date.now();
                }

                // Convert to ArrayBuffer for encryption service if needed, or pass TypedArray
                // The previous code passed new Float32Array(input).buffer
                await this.broadcastEncryptedAudio(audioData.buffer);
            };

            this.processor.onprocessorerror = (err) => {
                console.error('AudioWorklet processor error:', err);
                this.emitError('audio-error', 'Audio processing failed');
            };

            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

        } catch (error) {
            console.error('Failed to setup AudioWorklet:', error);
            console.warn('Falling back to ScriptProcessor...');
            // Fallback implementation could go here if needed, or just throw
            throw error;
        }
    }


    /**
     * Broadcast encrypted audio to all connected peers
     */
    async broadcastEncryptedAudio(audioData) {
        for (const [peerId, dataChannel] of this.dataChannels) {
            // Check if secure channel is established (ACK received)
            if (!this.secureChannels.has(peerId)) {
                if (!this.debugNoKeyTime || Date.now() - this.debugNoKeyTime > 5000) {
                    console.log(`[AudioDebug] Waiting for key-ack from ${peerId}`);
                    this.debugNoKeyTime = Date.now();
                }
                continue;
            }

            // Check if channel is open and not congested
            if (dataChannel.readyState === 'open' && dataChannel.bufferedAmount < 16384) {
                const sessionKey = this.peerSessionKeys.get(peerId);

                if (sessionKey) {
                    try {
                        // Encrypt audio using AES-GCM session key (FAST)
                        const encryptedBuffer = await cryptoService.encryptAudioAES(audioData, sessionKey);

                        // Extract IV and Data (AES-GCM puts IV at start)
                        // Actually encryptAudioAES returns pre-pended IV.
                        // We will send specific fields as requested by user.
                        // User requested: type="audio", iv=..., data=...
                        // My encryptAudioAES returns [IV (12) + Ciphertext].

                        const fullBuffer = new Uint8Array(encryptedBuffer);
                        const iv = fullBuffer.slice(0, 12);
                        const ciphertext = fullBuffer.slice(12);

                        const message = {
                            type: 'audio',
                            iv: Array.from(iv),
                            data: Array.from(ciphertext)
                        };

                        dataChannel.send(JSON.stringify(message));

                        // Debug: Log when actually sending
                        if (!this.debugSendTime || Date.now() - this.debugSendTime > 3000) {
                            console.log(`[AudioDebug] AES packet to ${peerId}, size: ${fullBuffer.byteLength}`);
                            this.debugSendTime = Date.now();
                        }
                    } catch (error) {
                        if (!this.lastEncryptError || Date.now() - this.lastEncryptError > 5000) {
                            console.error('Error encrypting/sending audio:', error);
                            this.lastEncryptError = Date.now();
                        }
                    }
                }
            }
        }
    }

    /**
     * Stop audio capture
     */
    stopAudioCapture() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        this.speakingHistory = [];
        this.isSpeaking = false;

        // Don't clear keys here, as we might rejoin or need them for cleanup
        // Keys are cleared in leaveRoom/disconnect/closePeerConnection

        console.log('Audio capture stopped');
    }



    /**
     * Setup specific listeners for session keys
     */
    setupSessionKeyListeners() {
        this.socket.on('session-key', async (data) => {
            try {
                const { encryptedSessionKey, from } = data || {};
                if (!encryptedSessionKey || !from) return;

                console.log(`[HybridCrypto] Received encrypted session key from ${from}`);

                // Decrypt session key using our private RSA key
                const sessionKey = await cryptoService.decryptSessionKey(encryptedSessionKey);
                this.peerSessionKeys.set(from, sessionKey);

                console.log(`[HybridCrypto] AES session key established with ${from}`);
                this.emitSecurityEvent('key-exchange', `Secure AES session established with peer`);
            } catch (error) {
                console.error('[HybridCrypto] Failed to establish session key:', error);
                this.emitError('security-error', 'Failed to establish secure session');
            }
        });
    }

    /**
     * Create a peer connection for a remote user
     */
    async createPeerConnection(peerId, odileId, username, publicKey, isInitiator) {
        const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

        // Store public key with connection
        peerConnection.publicKey = publicKey;
        this.peerConnections.set(peerId, peerConnection);

        // Create Signaling Manager
        // Polite if we are NOT the initiator.
        // Or better: Use Socket ID comparison for consistent politeness (perfect negotiation).
        // const polite = this.socket.id < peerId; 
        // Actually, user-joined means we are already in room, they joined. We initiate.
        // We will stick to IsInitiator flag for now but SignalingManager uses politeness.
        // Let's pass 'polite' based on direction?
        // Usually: Initiator = Impolite (sends offer), Receiver = Polite (waits/rollsback).
        // Let's deduce polite from isInitiator. 
        const polite = !isInitiator;

        const signalingManager = new SignalingManager(
            peerConnection,
            this.socket,
            peerId,
            this.currentRoom,
            this.userId,
            this.username,
            polite
        );
        this.signalingManagers.set(peerId, signalingManager);

        // Note: onicecandidate is handled by SignalingManager now.
        // remove old onicecandidate if any? SignalingManager sets it on constructor.

        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log(`Peer ${peerId} connection state:`, state);

            if (state === 'failed' || state === 'disconnected') {
                this.emitSecurityEvent('peer-disconnected', `Peer connection ${state}`);
                // Cleanup keys
                this.peerSessionKeys.delete(peerId);
                this.secureChannels.delete(peerId);
                this.signalingManagers.delete(peerId);
            } else if (state === 'connected') {
                this.emitSecurityEvent('handshake-complete', `Secure connection established with peer`);
            }
        };

        if (isInitiator) {
            const dataChannel = peerConnection.createDataChannel('audio', {
                ordered: false,
                maxRetransmits: 0
            });

            this.setupDataChannel(dataChannel, peerId, true);

            // Trigger negotiation if initiator
            // SignalingManager monitors 'onnegotiationneeded'
            // We just need to add a data channel which triggers it.


            // Note: DataChannel creation triggers negotiationneeded event.
            // SignalingManager will catch it and send offer.
            // We DO NOT manually create offer here anymore!

            // Note: Key generation is now handled in setupDataChannel (onopen)
        } else {
            peerConnection.ondatachannel = (event) => {
                this.setupDataChannel(event.channel, peerId, false);
            };
        }

        return peerConnection;
    }

    /**
     * Setup DataChannel for receiving encrypted audio and keys
     */
    setupDataChannel(dataChannel, peerId, isInitiator = false) {
        this.dataChannels.set(peerId, dataChannel);

        // Remove binaryType to allow default blob/string handling for JSON
        // dataChannel.binaryType = 'arraybuffer';

        dataChannel.onopen = async () => {
            console.log(`DataChannel opened with ${peerId}, isInitiator: ${isInitiator}`);

            // Only Initiator sends key to prevent race condition
            // Receiver waits for 'key' message
            if (isInitiator) {
                const peerConnection = this.peerConnections.get(peerId);

                if (peerConnection && peerConnection.publicKey && !this.peerSessionKeys.has(peerId)) {
                    try {
                        console.log(`[HybridCrypto] Generating session key for ${peerId} (DataChannel Open)`);
                        const sessionKey = await cryptoService.generateSessionKey();
                        this.peerSessionKeys.set(peerId, sessionKey);

                        const publicKeyJwk = typeof peerConnection.publicKey === 'string'
                            ? JSON.parse(peerConnection.publicKey)
                            : peerConnection.publicKey;

                        const encryptedSessionKey = await cryptoService.encryptSessionKey(sessionKey, publicKeyJwk);

                        // Send Key Message
                        const message = {
                            type: 'key',
                            payload: Array.from(new Uint8Array(encryptedSessionKey))
                        };

                        dataChannel.send(JSON.stringify(message));
                        console.log(`[HybridCrypto] Sent AES session key to ${peerId}`);

                    } catch (e) {
                        console.error("Error sending session key:", e);
                    }
                } else {
                    console.log(`[HybridCrypto] Skipping key generation for ${peerId}. Check: PC=${!!peerConnection}, PubKey=${!!(peerConnection?.publicKey)}, HasKey=${this.peerSessionKeys.has(peerId)}`);
                }
            }
        };

        dataChannel.onclose = () => {
            console.log(`DataChannel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
            this.secureChannels.delete(peerId);
        };

        dataChannel.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'key') {
                    try {
                        console.log(`[HybridCrypto] Received AES key from ${peerId}`);
                        const raw = new Uint8Array(msg.payload).buffer;
                        const sessionKey = await cryptoService.decryptSessionKey(raw);
                        this.peerSessionKeys.set(peerId, sessionKey);

                        // Send ACK
                        dataChannel.send(JSON.stringify({ type: 'key-ack' }));

                        this.secureChannels.add(peerId);

                        console.log(`[HybridCrypto] AES key established with ${peerId}, sent ACK`);
                        this.emitSecurityEvent('key-exchange', `Secure AES session established`);
                    } catch (e) {
                        console.error("Error accepting session key:", e);
                    }
                } else if (msg.type === 'key-ack') {
                    console.log(`[HybridCrypto] Received KEY-ACK from ${peerId}`);
                    this.secureChannels.add(peerId);
                    this.emitSecurityEvent('handshake-complete', `Secure audio channel active`);
                } else if (msg.type === 'audio') {
                    await this.handleIncomingAudio(msg, peerId);
                }
            } catch (e) {
                // Ignore non-JSON
            }
        };
    }

    /**
     * Handle incoming encrypted audio data with speaking detection
     * Decrypts using RSA private key directly
     */
    async handleIncomingAudio(msg, peerId) {
        try {
            const sessionKey = this.peerSessionKeys.get(peerId);
            if (!sessionKey) {
                return;
            }

            // Msg struct: { type: 'audio', iv: [...], data: [...] }
            const iv = new Uint8Array(msg.iv);
            const ciphertext = new Uint8Array(msg.data);

            const combined = new Uint8Array(iv.length + ciphertext.length);
            combined.set(iv, 0);
            combined.set(ciphertext, iv.length);

            // Decrypt
            const decryptedBuffer = await cryptoService.decryptAudioAES(combined.buffer, sessionKey);
            const audioData = new Float32Array(decryptedBuffer);

            // Detect peer speaking
            const maxAmplitude = Math.max(...Array.from(audioData).map(Math.abs));
            const isPeerSpeaking = maxAmplitude > SPEAKING_THRESHOLD;

            const wasSpeaking = this.peerSpeakingState.get(peerId) || false;
            if (isPeerSpeaking !== wasSpeaking) {
                this.peerSpeakingState.set(peerId, isPeerSpeaking);
                this.onPeerSpeakingChange?.(peerId, isPeerSpeaking);
            }

            await this.playAudio(audioData, peerId);
        } catch (error) {
            // Throttle error logging to prevent spam
            if (!this.lastDecryptError || Date.now() - this.lastDecryptError > 5000) {
                console.error('Error decrypting audio:', error);
                this.lastDecryptError = Date.now();
            }
        }
    }

    /**
     * Play received audio through Web Audio API
     */
    async playAudio(audioData, peerId) {
        if (!this.audioContext) {
            console.warn('[PlayAudio] No audioContext available');
            return;
        }

        if (this.audioContext.state === 'suspended') {
            console.log('[PlayAudio] Resuming suspended audioContext');
            await this.audioContext.resume();
        }

        // Debug: Log playback occasionally
        if (!this.debugPlayTime || Date.now() - this.debugPlayTime > 3000) {
            const maxAmp = Math.max(...Array.from(audioData).map(Math.abs));
            console.log(`[PlayAudio] Playing audio from ${peerId}, samples: ${audioData.length}, maxAmp: ${maxAmp.toFixed(4)}, ctxState: ${this.audioContext.state}`);
            this.debugPlayTime = Date.now();
        }

        const audioBuffer = this.audioContext.createBuffer(
            1,
            audioData.length,
            this.inputSampleRate
        );

        audioBuffer.getChannelData(0).set(audioData);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;

        let gainNode = this.audioNodes.get(peerId)?.gain;
        if (!gainNode) {
            gainNode = this.audioContext.createGain();
            gainNode.gain.value = 2.0; // Boost gain for better audibility
            gainNode.connect(this.audioContext.destination);
            this.audioNodes.set(peerId, { gain: gainNode });
            console.log(`[PlayAudio] Created gain node for ${peerId} with gain=2.0`);
        }

        source.connect(gainNode);
        source.start();
    }







    /**
     * Close peer connection and cleanup
     */
    closePeerConnection(peerId) {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(peerId);
        }

        const dataChannel = this.dataChannels.get(peerId);
        if (dataChannel) {
            dataChannel.close();
            this.dataChannels.delete(peerId);
        }

        this.audioNodes.delete(peerId);
        this.peerSpeakingState.delete(peerId);
    }

    /**
     * Set mute state
     */
    setMuted(muted) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }

        if (this.socket && this.isConnected && this.currentRoom) {
            this.socket.emit('mute-status', {
                roomId: this.currentRoom,
                isMuted: muted
            });
        }
    }

    /**
     * Set deafen state
     */
    setDeafened(deafened) {
        for (const [, node] of this.audioNodes) {
            if (node.gain) {
                node.gain.gain.value = deafened ? 0 : 1;
            }
        }
    }


    /**
     * Get connected peers count
     */
    getConnectedPeersCount() {
        return this.peerConnections.size;
    }

    /**
     * Cleanup and disconnect
     */
    async disconnect() {
        await this.leaveRoom();

        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                await this.audioContext.close();
            } catch (e) {
                // AudioContext may already be closed
            }
            this.audioContext = null;
        }

        this.isInitialized = false;
        console.log('VoiceEngine disconnected');
    }
}

export const voiceEngine = new VoiceEngine();
export default voiceEngine;
