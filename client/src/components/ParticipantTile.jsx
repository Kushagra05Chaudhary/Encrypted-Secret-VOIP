import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Lock } from 'lucide-react';

const ParticipantTile = ({
    participant,
    isCurrentUser = false,
    isMuted = false,
    isSpeaking = false,
    isEncrypted = true
}) => {
    const [speakingAnimation, setSpeakingAnimation] = useState(false);

    // Animate speaking indicator
    useEffect(() => {
        if (isSpeaking) {
            setSpeakingAnimation(true);
        } else {
            // Small delay before removing animation for smoother transition
            const timeout = setTimeout(() => setSpeakingAnimation(false), 150);
            return () => clearTimeout(timeout);
        }
    }, [isSpeaking]);

    const displayName = isCurrentUser ? 'You' : (participant?.username || 'User');
    const initial = displayName.charAt(0).toUpperCase();

    return (
        <div
            className={`
                relative w-full aspect-video rounded-2xl overflow-hidden glass-card transition-all duration-300
                ${speakingAnimation ? 'ring-2 ring-[var(--primary)] shadow-[0_0_20px_var(--primary-glow)]' : 'ring-1 ring-[var(--border-subtle)]'}
            `}
        >
            {/* Background Gradient for Speaking */}
            <div
                className={`absolute inset-0 bg-gradient-to-b from-transparent to-[var(--bg-surface)] opacity-0 transition-opacity duration-300 ${speakingAnimation ? 'opacity-30' : ''}`}
            />

            {/* Encryption Lock */}
            {isEncrypted && (
                <div className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-[var(--bg-overlay)] backdrop-blur-md">
                    <Lock className="w-3 h-3 text-[var(--status-online)]" />
                </div>
            )}

            {/* Speaking Ripple Effect */}
            {speakingAnimation && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute w-32 h-32 rounded-full border border-[var(--primary)] opacity-20 animate-ping"></div>
                    <div className="absolute w-24 h-24 rounded-full border border-[var(--primary)] opacity-40 animate-pulse"></div>
                </div>
            )}

            {/* Avatar Center */}
            <div className="absolute inset-0 flex items-center justify-center z-0">
                <div
                    className={`
                        w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-2xl
                        transition-transform duration-300
                        ${isCurrentUser ? 'bg-gradient-to-br from-blue-500 to-indigo-600' : 'bg-gradient-to-br from-purple-500 to-pink-600'}
                        ${speakingAnimation ? 'scale-110' : 'scale-100'}
                    `}
                >
                    {initial}
                </div>
            </div>

            {/* Bottom Info Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 flex items-center justify-between z-10 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex flex-col">
                    <p className="text-white font-semibold text-shadow-sm tracking-wide text-sm truncate max-w-[120px]">
                        {displayName}
                    </p>
                    {isCurrentUser && <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">You</span>}
                </div>

                {/* Mic Status */}
                <div className={`p-2 rounded-full backdrop-blur-md shadow-sm transition-colors ${isMuted ? 'bg-[var(--danger)] text-white' : 'bg-[var(--bg-overlay)] text-white'}`}>
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </div>
            </div>
        </div>
    );
};

export default ParticipantTile;
