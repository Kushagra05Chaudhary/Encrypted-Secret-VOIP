import { useState } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Phone, PhoneOff, ScreenShare, Video, Users, Pin, Bell, Search, Inbox, HelpCircle, Shield, ShieldCheck, Lock } from 'lucide-react';
import ParticipantTile from './ParticipantTile';

const VoiceChannel = ({
    channel,
    participants = [],
    isConnected,
    onConnect,
    onDisconnect,
    cryptoReady,
    isSpeaking = false,
    speakingPeers = new Map(),
    mutedPeers = new Map(),
    onToggleMute,
    onToggleDeafen,
    onInvite // New prop for opening invite modal
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isVideoOn, setIsVideoOn] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // --- RENDER HELPERS ---

    // Bottom Control Bar
    const renderControls = () => (
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-2xl glass-panel shadow-2xl overflow-visible z-50 animate-fade-in transition-all hover:scale-105">
            <button
                onClick={() => onInvite && onInvite()}
                className="w-12 h-12 rounded-full flex-center bg-[var(--primary)]/20 text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white border border-[var(--primary)]/30 transition-all font-medium"
                title="Invite Friends"
            >
                <Users className="w-5 h-5" />
            </button>

            <div className="w-px h-8 bg-[var(--border-subtle)] mx-2"></div>

            <button
                onClick={() => {
                    const newMuted = !isMuted;
                    setIsMuted(newMuted);
                    onToggleMute?.(newMuted);
                }}
                className={`w-12 h-12 rounded-full flex-center transition-all duration-200 ${isMuted
                    ? 'bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] shadow-lg shadow-red-500/20'
                    : 'bg-[var(--bg-surface-hover)] text-white hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
                    }`}
                title={isMuted ? 'Unmute' : 'Mute'}
            >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
                onClick={() => {
                    const newDeafened = !isDeafened;
                    setIsDeafened(newDeafened);
                    // Deafen usually implies Mute
                    if (newDeafened && !isMuted) {
                        setIsMuted(true);
                        onToggleMute?.(true);
                    }
                    onToggleDeafen?.(newDeafened);
                }}
                className={`w-12 h-12 rounded-full flex-center transition-all duration-200 ${isDeafened
                    ? 'bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] shadow-lg shadow-red-500/20'
                    : 'bg-[var(--bg-surface-hover)] text-white hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
                    }`}
                title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
                {isDeafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
            </button>

            <button
                onClick={() => alert("Video coming soon")}
                className="w-12 h-12 rounded-full flex-center bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] opacity-50 cursor-not-allowed"
                title="Turn on video"
            >
                <Video className="w-5 h-5" />
            </button>

            <button
                onClick={() => alert("Screen share coming soon")}
                className="w-12 h-12 rounded-full flex-center bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] opacity-50 cursor-not-allowed"
                title="Present now"
            >
                <ScreenShare className="w-5 h-5" />
            </button>

            <div className="w-px h-8 bg-[var(--border-subtle)] mx-2"></div>

            <button
                onClick={onDisconnect}
                className="w-16 h-10 rounded-full flex-center bg-[var(--danger)] text-white hover:bg-[var(--danger-hover)] shadow-lg shadow-red-500/30 transition-all font-medium text-sm gap-2 px-4"
                title="Leave call"
            >
                <PhoneOff className="w-4 h-4" />
                <span className="hidden md:inline">End</span>
            </button>
        </div>
    );

    if (!channel) return null;

    return (
        <div className="relative w-full h-full flex flex-col bg-transparent">
            {/* Participants Grid */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto flex items-center justify-center">

                {isConnected ? (
                    <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-fr">
                        {/* Current User */}
                        <ParticipantTile
                            isCurrentUser={true}
                            isMuted={isMuted}
                            isSpeaking={isSpeaking && !isMuted}
                            isEncrypted={true}
                        />

                        {/* Remote Peers */}
                        {participants.map((participant, index) => (
                            <ParticipantTile
                                key={`${participant.id}-${index}`}
                                participant={participant}
                                isCurrentUser={false}
                                isMuted={mutedPeers.get(participant.socketId) || false}
                                isSpeaking={speakingPeers.get(participant.socketId) || false}
                                isEncrypted={true}
                            />
                        ))}

                        {/* Waiting State (if alone) */}
                        {participants.length === 0 && (
                            <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-4 min-h-[300px] flex-center flex-col text-center p-8 border-2 border-dashed border-[var(--border-subtle)] rounded-3xl opacity-50">
                                <div className="w-20 h-20 rounded-full bg-[var(--bg-surface)] flex-center mb-4 animate-pulse">
                                    <Users className="w-8 h-8 text-[var(--text-secondary)]" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2">Waiting for others to join...</h3>
                                <p className="text-[var(--text-secondary)]">
                                    Share the meeting details to invite participants.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    /* Initial Join State (Should rarely be seen due to auto-join logic in Dashboard, but good fallback) */
                    <div className="flex-center flex-col animate-fade-in">
                        <div className="w-24 h-24 rounded-full bg-[var(--primary)]/10 flex-center mb-6 animate-pulse">
                            <Headphones className="w-10 h-10 text-[var(--primary)]" />
                        </div>
                        <h2 className="text-3xl font-bold mb-4">Ready to join?</h2>
                        <button
                            onClick={onConnect}
                            disabled={!cryptoReady}
                            className="btn btn-primary px-8 py-4 text-lg shadow-xl shadow-blue-500/20"
                        >
                            Join "{channel.name}"
                        </button>
                    </div>
                )}
            </div>

            {/* Controls Overlay */}
            {isConnected && renderControls()}
        </div>
    );
};

export default VoiceChannel;
