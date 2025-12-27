import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roomsAPI, friendsAPI } from '../services/api';
import { voiceEngine } from '../services/voiceEngine';
import Sidebar from '../components/Sidebar';
import VoiceChannel from '../components/VoiceChannel';
import UserSettingsBar from '../components/UserSettingsBar';
import SecurityConsole from '../components/SecurityConsole';
import ErrorOverlay from '../components/ErrorOverlay';
import { Plus, X, Shield, ShieldCheck, Terminal, LogOut, Clock, Calendar, User as UserIcon, Users, ArrowRight } from 'lucide-react';

const Dashboard = () => {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedChannel, setSelectedChannel] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [joinCodeInput, setJoinCodeInput] = useState('');
    const [creating, setCreating] = useState(false);
    const [joining, setJoining] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [voiceEngineReady, setVoiceEngineReady] = useState(false);

    // Security Console state
    const [showSecurityConsole, setShowSecurityConsole] = useState(false);
    const [securityEvents, setSecurityEvents] = useState([]);

    // Speaking state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speakingPeers, setSpeakingPeers] = useState(new Map());
    const [mutedPeers, setMutedPeers] = useState(new Map());

    // Error handling
    const [currentError, setCurrentError] = useState(null);

    // Mic pre-warm state
    const [micPreWarmed, setMicPreWarmed] = useState(false);

    // Incoming Call State
    const [incomingCall, setIncomingCall] = useState(null);

    // Sidebar state
    const [channelListVisible, setChannelListVisible] = useState(true);
    const [activeTab, setActiveTab] = useState('home'); // 'home', 'history', 'friends'
    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [addFriendInput, setAddFriendInput] = useState('');

    const { user, token, isAuthenticated, cryptoReady, getPublicKeyString, logout } = useAuth();
    const navigate = useNavigate();

    // Fetch initial data
    useEffect(() => {
        if (isAuthenticated && user) {
            loadRooms();
            if (activeTab === 'friends') {
                loadFriends();
            }
        }
    }, [isAuthenticated, user, activeTab]);

    // Handle incoming calls
    useEffect(() => {
        if (!voiceEngine) return;

        voiceEngine.onIncomingCall = (data) => {
            console.log('Incoming call received:', data);
            setIncomingCall(data);
            // Play a ringtone if we had one
        };

        return () => {
            voiceEngine.onIncomingCall = null;
        };
    }, []);

    const handleAcceptCall = async () => {
        if (!incomingCall) return;
        try {
            const { roomId } = incomingCall;
            setIncomingCall(null);

            // Join the room
            // We might need to fetch room details or just join by ID if we have the code?
            // The incoming call data usually has roomId. 
            // Better to join by Code if possible to get full metadata, but signaling just sends roomId usually.
            // Let's rely on joinRoomByCode if we have it, or fallback.
            // voiceEngine.joinRoom expects roomId and key.
            // But we need to update UI state (selectedChannel).

            // For now, let's assume we need to join by code or find the room.
            // Actually, best to fetch the room first.
            const response = await roomsAPI.getRooms();
            // Optimally we'd have a getRoomById endpoint but getRooms filters.
            // Wait, we can use the join-by-code API if we had the code. 
            // Signaling sending roomId is good for joining via socket, but UI needs metadata.

            // Let's try to join via voiceEngine directly first? No, we need selectedChannel state.
            // Let's fetch the room to be sure.
            // If the room is private/new, it might not show in getRooms unless we are invited?
            // But we are using Friends system.

            // SIMPLIFICATION: just auto-join if we can find it in the list after refresh.
            // Or better: use the room details from the call if provided (I added roomName).

            console.log('Accepting call to:', incomingCall.roomId);

            // Since we don't have the Join Code in the call event (my mistake in signaling.js?), 
            // let's try to find it in the public list first.
            // Actually I should have sent joinCode in signaling.js. 
            // I'll fix that later. For now, let's try to find it in existing rooms.

            // Force refresh rooms
            const roomsRes = await roomsAPI.getRooms();
            const targetRoom = roomsRes.data.find(r => r.id === incomingCall.roomId);

            if (targetRoom) {
                setRooms(roomsRes.data.map(r => ({ ...r, type: 'voice' })));
                handleSelectChannel({ ...targetRoom, type: 'voice' });
            } else {
                // Fallback: try to join assuming we are allowed (if it was a private room we might fail)
                alert("Could not find room details. Please ask for the code.");
            }

        } catch (error) {
            console.error('Failed to accept call:', error);
        }
    };

    const handleDeclineCall = () => {
        setIncomingCall(null);
    };

    const loadRooms = async () => {
        try {
            setLoading(true);
            const response = await roomsAPI.getRooms();
            const formattedRooms = response.data.map(room => ({
                ...room,
                type: 'voice'
            }));
            setRooms(formattedRooms);
        } catch (error) {
            console.error('Failed to load rooms:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadFriends = async () => {
        try {
            const response = await friendsAPI.getFriends();
            setFriends(response.data.friends);
            setFriendRequests(response.data.friendRequests);
        } catch (error) {
            console.error('Failed to load friends:', error);
        }
    };

    const handleSendRequest = async () => {
        if (!addFriendInput.trim()) return;
        try {
            await friendsAPI.sendRequest(addFriendInput);
            setAddFriendInput('');
            alert('Friend request sent!');
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to send request');
        }
    };

    const handleRespondRequest = async (requestId, action) => {
        try {
            await friendsAPI.respondToRequest(requestId, action);
            loadFriends();
        } catch (error) {
            console.error('Failed to respond:', error);
        }
    };

    const handleStartPersonalMeeting = async () => {
        if (creating) return;
        try {
            setCreating(true);
            const response = await roomsAPI.createRoom(`${user.username}'s Personal Meeting`, { personal: true });
            const room = { ...response.data, type: 'voice' };
            setRooms([room, ...rooms]);
            handleSelectChannel(room);
        } catch (err) {
            console.error('Failed to start personal meeting:', err);
            setError(err.response?.data?.message || 'Failed to start meeting');
        } finally {
            setCreating(false);
        }
    };

    const initVoiceEngine = async () => {
        try {
            // Only initialize if we haven't already
            await voiceEngine.initialize(user._id, user.username, token);

            if (!isMounted) return;

            // Setup event handlers
            voiceEngine.onParticipantJoined = (participant) => {
                setParticipants(prev => [...prev, participant]);
                addSecurityEvent('handshake-complete', `${participant.username} joined the channel`);
            };

            voiceEngine.onParticipantLeft = (participant) => {
                setParticipants(prev => prev.filter(p => p.id !== participant.id));
                setSpeakingPeers(prev => {
                    const next = new Map(prev);
                    next.delete(participant.socketId);
                    return next;
                });
            };

            voiceEngine.onConnectionStateChange = (connected) => {
                setIsConnected(connected);
                if (!connected) {
                    setSpeakingPeers(new Map());
                    setIsSpeaking(false);
                }
            };

            voiceEngine.onSpeakingChange = (speaking) => {
                setIsSpeaking(speaking);
            };

            voiceEngine.onPeerSpeakingChange = (peerId, speaking) => {
                setSpeakingPeers(prev => {
                    const next = new Map(prev);
                    next.set(peerId, speaking);
                    return next;
                });
            };

            voiceEngine.onPeerMuteChange = (peerId, isMuted) => {
                setMutedPeers(prev => {
                    const next = new Map(prev);
                    next.set(peerId, isMuted);
                    return next;
                });
            };

            voiceEngine.onSecurityEvent = (event) => {
                addSecurityEvent(event.type, event.message);
            };

            voiceEngine.onError = (error) => {
                setCurrentError(error);
            };

            setVoiceEngineReady(true);
            addSecurityEvent('rsa-init', 'Voice engine initialized');
        } catch (error) {
            console.error('Failed to initialize voice engine:', error);
            if (isMounted) {
                setCurrentError({ type: 'initialization-failed', message: error.message });
            }
        }
    };

    useEffect(() => {
        if (!isAuthenticated || !user || !token) {
            navigate('/login');
            return;
        }

        let isMounted = true;
        initVoiceEngine();

        // Cleanup - only disconnect when actually leaving the app
        return () => {
            isMounted = false;
        };
    }, [isAuthenticated, user, token, navigate]);

    // Add initial crypto ready event
    useEffect(() => {
        if (cryptoReady) {
            addSecurityEvent('rsa-complete', 'RSA-2048 key pair ready');
        }
    }, [cryptoReady]);

    // Pre-warm microphone access on page load for faster join
    useEffect(() => {
        if (!micPreWarmed && isAuthenticated) {
            // Request mic permission early (before joining a channel)
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    // Stop immediately - we just wanted to trigger permission prompt
                    stream.getTracks().forEach(track => track.stop());
                    setMicPreWarmed(true);
                    console.log('[MicOptimization] Microphone permission pre-warmed');
                    addSecurityEvent('mic-ready', 'Microphone access pre-authorized');
                })
                .catch(err => {
                    console.log('[MicOptimization] Mic pre-warm skipped:', err.name);
                    // Don't show error - user will see it when they try to join
                });
        }
    }, [isAuthenticated, micPreWarmed]);

    const addSecurityEvent = (type, message) => {
        setSecurityEvents(prev => [...prev, {
            type,
            message,
            timestamp: new Date().toLocaleTimeString()
        }]);
    };

    const fetchRooms = async () => {
        // ... handled by loadRooms now
        loadRooms();
    };

    // Auto-refresh rooms every 10 seconds
    useEffect(() => {
        if (!isAuthenticated || !token) return;

        const interval = setInterval(() => {
            loadRooms();
        }, 10000);

        return () => clearInterval(interval);
    }, [isAuthenticated, token]);

    const handleSelectChannel = (channel) => {
        setSelectedChannel(channel);
        setParticipants(channel.participants || []);
    };

    const handleConnect = useCallback(async () => {
        if (!selectedChannel || !cryptoReady) {
            setError('Encryption not ready. Please wait...');
            return;
        }

        try {
            const publicKey = getPublicKeyString();
            await voiceEngine.joinRoom(selectedChannel.id, publicKey);
            setIsConnected(true);
            addSecurityEvent('rsa-ready', 'RSA asymmetric encryption active');
        } catch (error) {
            console.error('Failed to join room:', error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                setCurrentError({ type: 'microphone-denied', message: 'Microphone access denied' });
            } else {
                setCurrentError({ type: 'join-failed', message: error.message });
            }
        }
    }, [selectedChannel, cryptoReady, getPublicKeyString]);

    const handleDisconnect = useCallback(async () => {
        try {
            await voiceEngine.leaveRoom();
            setIsConnected(false);
            setParticipants([]);
            setIsSpeaking(false);
            setSpeakingPeers(new Map());
            setMutedPeers(new Map());
        } catch (error) {
            console.error('Failed to leave room:', error);
        }
    }, []);

    const handleMuteChange = useCallback((muted) => {
        voiceEngine.setMuted(muted);
        if (muted) setIsSpeaking(false);
    }, []);

    const handleDeafenChange = useCallback((deafened) => {
        voiceEngine.setDeafened(deafened);
    }, []);

    const handleRetryError = useCallback(async () => {
        if (currentError?.type === 'microphone-denied') {
            // Try to request microphone again
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                setCurrentError(null);
                if (selectedChannel) {
                    handleConnect();
                }
            } catch (e) {
                setCurrentError({ type: 'microphone-denied', message: 'Still denied' });
            }
        } else if (currentError?.type === 'connection-lost') {
            // Try to reconnect
            setCurrentError(null);
            if (selectedChannel) {
                handleConnect();
            }
        }
    }, [currentError, selectedChannel, handleConnect]);

    const handleCreateChannel = async (e) => {
        e.preventDefault();
        if (!newRoomName.trim()) return;

        setCreating(true);
        try {
            const response = await roomsAPI.createRoom(newRoomName);
            const newRoom = { ...response.data, type: 'voice' };
            setRooms([...rooms, newRoom]);
            setNewRoomName('');
            setShowCreateModal(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create room');
        } finally {
            setCreating(false);
        }
    };

    const handleJoinByCode = async (e) => {
        e.preventDefault();
        if (!joinCodeInput.trim()) return;

        setJoining(true);
        setError('');
        try {
            const response = await roomsAPI.joinRoomByCode(joinCodeInput);
            const room = { ...response.data, type: 'voice' };

            // Add to local list if not present
            if (!rooms.find(r => r.id === room.id)) {
                setRooms([room, ...rooms]);
            }

            setJoinCodeInput('');
            setShowJoinModal(false);
            // Auto join the room
            handleSelectChannel(room);
        } catch (err) {
            console.error('Join failed:', err);
            setError(err.response?.data?.message || 'Invalid code or room not found');
        } finally {
            setJoining(false);
        }
    };

    const handleDeleteChannel = async (channelId) => {
        try {
            await roomsAPI.deleteRoom(channelId);
            setRooms(rooms.filter(r => r.id !== channelId));
            // If the deleted channel was selected, clear selection
            if (selectedChannel?.id === channelId) {
                setSelectedChannel(null);
                if (isConnected) {
                    await handleDisconnect();
                }
            }
        } catch (err) {
            console.error('Failed to delete channel:', err);
            setError(err.response?.data?.message || 'Failed to delete channel');
        }
    };

    // --- RENDER HELPERS ---

    const renderLobby = () => (
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-6 animate-fade-in custom-scrollbar overflow-y-auto">
            {/* Header / Welcome */}
            <div className="flex items-center justify-between mb-8 md:mb-12">
                <div>
                    <h1 className="text-3xl font-bold mb-2">
                        Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.username}
                    </h1>
                    <p className="text-[var(--text-secondary)]">Ready to collaborate?</p>
                </div>
                <div className="flex items-center gap-4">
                    {/* Add PMI Display */}
                    <div className="text-right hidden md:block mr-4">
                        <div className="text-xs text-[var(--text-secondary)]">Your PMI</div>
                        <div className="font-mono font-bold text-[var(--accent)] cursor-pointer hover:text-white transition-colors" title="Personal Meeting ID = pmi-xxx-xxx">
                            {user?.personalJoinCode || 'Loading...'}
                        </div>
                    </div>

                    <div className="text-right hidden md:block">
                        <div className="text-sm font-medium">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <button
                        onClick={() => setShowSecurityConsole(!showSecurityConsole)}
                        className="btn btn-secondary p-2 rounded-full"
                        title="Security Console"
                    >
                        <Shield className="w-5 h-5" />
                    </button>
                    {/* User Profile Hook could go here */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex-center font-bold text-white shadow-lg">
                        {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <button
                        onClick={logout}
                        className="btn btn-secondary p-2 rounded-full text-[var(--danger)] hover:bg-[var(--danger)]/10 border-[var(--danger)]/20"
                        title="Logout"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-6 mb-8 border-b border-[var(--border-subtle)]">
                <button
                    onClick={() => setActiveTab('home')}
                    className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'home' ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Start / Join
                    </div>
                    {activeTab === 'home' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-full"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'history' ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Meeting History
                    </div>
                    {activeTab === 'history' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-full"></div>}
                </button>
                <button
                    onClick={() => setActiveTab('friends')}
                    className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'friends' ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Users className="w-4 h-4" />
                            {friendRequests.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
                        </div>
                        Friends
                    </div>
                    {activeTab === 'friends' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-full"></div>}
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'home' ? (
                /* Home Tab: Action Cards */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 animate-slide-up">
                    {/* New Meeting Card */}
                    <div
                        onClick={() => setShowCreateModal(true)}
                        className="glass-card p-8 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Plus className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-14 h-14 rounded-2xl bg-[var(--primary)] flex-center mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform">
                                <Plus className="w-8 h-8 text-[var(--bg-app)]" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">New Meeting</h3>
                            <p className="text-[var(--text-secondary)]">Create a new secure voice room and get a code to share.</p>
                        </div>
                    </div>

                    {/* Personal Meeting Card */}
                    <div
                        onClick={handleStartPersonalMeeting}
                        className="glass-card p-8 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <UserIcon className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-14 h-14 rounded-2xl bg-purple-500 flex-center mb-6 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform">
                                <UserIcon className="w-8 h-8 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Personal Room</h3>
                            <p className="text-[var(--text-secondary)]">Start with your fixed code: <span className="font-mono text-[var(--accent)] text-sm">{user?.personalJoinCode || '...'}</span></p>
                        </div>
                    </div>

                    {/* Join via Code */}
                    <div
                        onClick={() => setShowJoinModal(true)}
                        className="glass-card p-8 cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Terminal className="w-32 h-32" />
                        </div>
                        <div className="relative z-10">
                            <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex-center mb-6 shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform">
                                <ShieldCheck className="w-8 h-8 text-[var(--bg-app)]" />
                            </div>
                            <h3 className="text-2xl font-bold mb-2">Join with Code</h3>
                            <p className="text-[var(--text-secondary)]">
                                Enter a meeting code to join an existing secure room.
                            </p>
                        </div>
                    </div>
                </div>
            ) : activeTab === 'friends' ? (
                /* Friends Tab */
                <div className="flex-1 overflow-hidden flex flex-col min-h-[300px] animate-slide-up">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
                        {/* Friends List */}
                        <div className="lg:col-span-2 flex flex-col">
                            <h3 className="text-lg font-semibold mb-4 text-[var(--text-secondary)] uppercase tracking-wider text-xs">My Friends</h3>
                            {friends.length === 0 ? (
                                <div className="flex-1 flex-center border-2 border-dashed border-[var(--border-subtle)] rounded-xl min-h-[200px]">
                                    <p className="text-[var(--text-muted)]">No friends yet. Add someone!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                                    {friends.map(friend => (
                                        <div key={friend._id} className="glass-panel p-4 rounded-xl flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex-center font-bold text-white">
                                                    {friend.username[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-semibold">{friend.username}</div>
                                                    {friend.activeRoom ? (
                                                        <div className="text-xs text-green-400 flex items-center gap-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                                                            In a meeting
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-[var(--text-muted)]">Offline / Idle</div>
                                                    )}
                                                </div>
                                            </div>
                                            {friend.activeRoom && (
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        try {
                                                            console.log('Joining friend room:', friend.activeRoom);
                                                            const res = await roomsAPI.joinRoomByCode(friend.activeRoom.joinCode);
                                                            const room = { ...res.data, type: 'voice' };

                                                            // Avoid duplicates logic
                                                            setRooms(prev => {
                                                                if (prev.find(r => r.id === room.id)) return prev;
                                                                return [room, ...prev];
                                                            });

                                                            handleSelectChannel(room);
                                                        } catch (err) {
                                                            console.error('Failed to join friend room:', err);
                                                            alert('Failed to join room: ' + (err.response?.data?.message || err.message));
                                                        }
                                                    }}
                                                    className="btn btn-primary px-3 py-1.5 text-xs rounded-lg hover:scale-105 transition-transform"
                                                >
                                                    Join
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sidebar: Add Friend & Requests */}
                        <div className="flex flex-col gap-6">
                            {/* Add Friend */}
                            <div className="glass-panel p-6 rounded-xl">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-[var(--primary)]" />
                                    Add Friend
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={addFriendInput}
                                        onChange={(e) => setAddFriendInput(e.target.value)}
                                        placeholder="Enter Friend's PMI (e.g. pmi-abc-xyz)"
                                        className="flex-1 bg-[var(--bg-input)] border border-[var(--border-input)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-white"
                                    />
                                    <button
                                        onClick={handleSendRequest}
                                        className="btn btn-primary p-2 rounded-lg"
                                        disabled={!addFriendInput.trim()}
                                    >
                                        <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Requests */}
                            {friendRequests.length > 0 && (
                                <div className="glass-panel p-6 rounded-xl">
                                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <div className="relative">
                                            <Users className="w-5 h-5 text-[var(--accent)]" />
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                        </div>
                                        Requests
                                    </h3>
                                    <div className="space-y-3">
                                        {friendRequests.map(req => (
                                            <div key={req._id} className="bg-[var(--bg-surface)] p-3 rounded-lg flex items-center justify-between">
                                                <span className="font-medium text-sm">{req.username}</span>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleRespondRequest(req._id, 'accept')}
                                                        className="p-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                                    >
                                                        <ShieldCheck className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleRespondRequest(req._id, 'reject')}
                                                        className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* History Tab: Room List */
                <div className="flex-1 overflow-hidden flex flex-col min-h-[300px] animate-slide-up">
                    <h3 className="text-lg font-semibold mb-4 text-[var(--text-secondary)] uppercase tracking-wider text-xs">Past Meetings</h3>

                    {loading ? (
                        <div className="flex-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                        </div>
                    ) : rooms.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-[var(--border-subtle)] rounded-xl">
                            <p className="text-[var(--text-muted)]">No meeting history found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                            {rooms.map(room => (
                                <div
                                    key={room.id}
                                    onClick={() => handleSelectChannel(room)}
                                    className="glass-panel p-5 rounded-xl cursor-pointer hover:bg-[var(--bg-surface-hover)] hover:border-[var(--primary-glow)] transition-all group relative"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="bg-[var(--bg-surface)] p-2 rounded-lg">
                                            <Calendar className="w-6 h-6 text-[var(--text-primary)]" />
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteChannel(room.id); }}
                                            className="text-[var(--text-muted)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                            title="Delete from history"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <h4 className="font-semibold text-lg mb-1 truncate" title={room.name}>{room.name}</h4>
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-mono bg-black/20 rounded px-2 py-1 text-[var(--accent)]">
                                            {room.joinCode || 'No Code'}
                                        </span>
                                        <span className="text-xs text-[var(--text-muted)]">
                                            {new Date(room.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                                        <span className={`w-2 h-2 rounded-full ${room.participants?.length > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                        {room.participants?.length || 0} active now
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const [showInviteModal, setShowInviteModal] = useState(false);

    const handleInviteFriend = (friendId) => {
        if (!selectedChannel) return;
        voiceEngine.callUser(friendId, selectedChannel.id, selectedChannel.name);
        alert(`Invitation sent!`);
        // We could show a toast here
    };

    const renderMeetingRoom = () => (
        <div className="absolute inset-0 z-50 bg-[var(--bg-app)] flex flex-col">
            {/* Minimal Header for Meeting */}
            <div className="h-16 px-6 flex items-center justify-between bg-[var(--bg-surface)]/50 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-lg">{selectedChannel.name}</h2>
                    <div className="hidden md:flex flex-col items-start">
                        <span className="text-xs text-[var(--text-secondary)]">Code:</span>
                        <span className="text-sm font-mono text-[var(--accent)] select-all cursor-pointer" title="Click to copy" onClick={(e) => { navigator.clipboard.writeText(selectedChannel.joinCode); e.target.classList.add('text-green-400'); setTimeout(() => e.target.classList.remove('text-green-400'), 1000); }}>{selectedChannel.joinCode}</span>
                    </div>

                    <div className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1 ml-4">
                        <ShieldCheck className="w-3 h-3" /> Encrypted
                    </div>
                </div>

                {/* Duration or other info could go here */}
            </div>

            {/* Voice Channel Content */}
            <div className="flex-1 overflow-hidden relative">
                <VoiceChannel
                    channel={selectedChannel}
                    participants={participants}
                    isConnected={isConnected}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    cryptoReady={cryptoReady}
                    isSpeaking={isSpeaking}
                    speakingPeers={speakingPeers}
                    mutedPeers={mutedPeers}
                    onToggleMute={handleMuteChange}
                    onToggleDeafen={handleDeafenChange}
                    onInvite={() => {
                        loadFriends(); // Refresh friends to get latest status
                        setShowInviteModal(true);
                    }}
                />
            </div>

            {/* Invite Modal (Inside Meeting Room Context) */}
            {showInviteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowInviteModal(false)}></div>
                    <div className="glass-card w-full max-w-md relative p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold">Invite Friends</h3>
                            <button onClick={() => setShowInviteModal(false)}><X className="w-5 h-5" /></button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-3">
                            {friends.map(friend => (
                                <div key={friend._id} className="flex items-center justify-between p-3 bg-[var(--bg-surface)] rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex-center text-xs font-bold text-white">
                                            {friend.username[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">{friend.username}</div>
                                            <div className="text-xs text-[var(--text-muted)]">
                                                {friend.activeRoom ? 'In a call' : 'Online'}
                                                {/* Note: We rely on server check for 'online' status if we had presence. 
                                                      For now we just show they exist. Ideal would be tracking socket presence.
                                                  */}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInviteFriend(friend._id)}
                                        className="btn btn-primary px-3 py-1.5 text-xs rounded-lg"
                                    >
                                        Invite
                                    </button>
                                </div>
                            ))}
                            {friends.length === 0 && <p className="text-center text-[var(--text-muted)] py-4">No friends found.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="h-dvh flex flex-col bg-[var(--bg-app)] overflow-hidden font-sans text-[var(--text-primary)]">
            {/* Background Ambient Glow */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[20%] w-[60%] h-[60%] bg-[var(--primary)]/5 blur-[150px] rounded-full"></div>
            </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex overflow-hidden">
                {/* Logic: If selectedChannel and isConnected (or connecting), show Meeting Room. Else Lobby. */}
                {selectedChannel ? renderMeetingRoom() : renderLobby()}
            </div>

            {/* Modals & Overlays */}

            {/* Security Console (Global) */}
            <SecurityConsole
                isOpen={showSecurityConsole}
                onClose={() => setShowSecurityConsole(false)}
                events={securityEvents}
                cryptoReady={cryptoReady}
                isConnected={isConnected}
                connectedPeers={participants.length}
            />

            {/* Error Overlay */}
            <ErrorOverlay
                error={currentError}
                onDismiss={() => setCurrentError(null)}
                onRetry={handleRetryError}
            />

            {/* Join Room Modal */}
            {showJoinModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setShowJoinModal(false)}
                    ></div>
                    <div className="glass-card w-full max-w-md relative animate-fade-in p-8 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Join Meeting</h3>
                            <p className="text-[var(--text-secondary)] mt-1">Enter the code shared with you</p>
                        </div>
                        <form onSubmit={handleJoinByCode} className="space-y-6">
                            {error && (
                                <div className="p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-sm">
                                    {error}
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                    Meeting Code
                                </label>
                                <input
                                    type="text"
                                    value={joinCodeInput}
                                    onChange={(e) => setJoinCodeInput(e.target.value)}
                                    className="input-modern text-center font-mono text-lg tracking-widest placeholder:tracking-normal"
                                    placeholder="abc-def-ghi"
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowJoinModal(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={joining || !joinCodeInput.trim()}
                                    className="btn btn-primary flex-1"
                                >
                                    {joining ? 'Joining...' : 'Join Now'}
                                </button>
                            </div>
                        </form>
                        <button
                            onClick={() => setShowJoinModal(false)}
                            className="absolute top-4 right-4 p-2 text-[var(--text-muted)] hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Create Room Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setShowCreateModal(false)}
                    ></div>

                    <div className="glass-card w-full max-w-md relative animate-fade-in p-8 shadow-2xl overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>

                        <div className="text-center mb-6">
                            <h3 className="text-2xl font-bold">Create New Meeting</h3>
                            <p className="text-[var(--text-secondary)] mt-1">Set up a secure encrypted space</p>
                        </div>

                        <form onSubmit={handleCreateChannel} className="space-y-6">
                            {error && (
                                <div className="p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                                    Meeting Name
                                </label>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    className="input-modern"
                                    placeholder="e.g. Daily Standup"
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn btn-secondary flex-1"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !newRoomName.trim()}
                                    className="btn btn-primary flex-1"
                                >
                                    {creating ? 'Creating...' : 'Create Meeting'}
                                </button>
                            </div>
                        </form>

                        <button
                            onClick={() => setShowCreateModal(false)}
                            className="absolute top-4 right-4 p-2 text-[var(--text-muted)] hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
