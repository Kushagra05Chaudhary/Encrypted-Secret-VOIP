import { useState, useEffect } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, PhoneOff, Signal, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const UserSettingsBar = ({
    isConnected,
    currentChannel,
    onDisconnect,
    onMuteChange,
    onDeafenChange,
    isCompact = false
}) => {
    const { user, logout } = useAuth();
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        onMuteChange?.(newMuted);
    };

    const toggleDeafen = () => {
        const newDeafened = !isDeafened;
        setIsDeafened(newDeafened);
        onDeafenChange?.(newDeafened);

        if (newDeafened) {
            // Deafening also mutes
            setIsMuted(true);
            onMuteChange?.(true);
        }
    };

    // Reset mute/deafen when disconnecting
    useEffect(() => {
        if (!isConnected) {
            setIsMuted(false);
            setIsDeafened(false);
        }
    }, [isConnected]);

    // Compact mode - just show avatar and minimal controls
    if (isCompact) {
        return (
            <div className="bg-[#232428] py-2 flex flex-col items-center gap-2">
                {/* User Avatar */}
                <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center overflow-hidden">
                        <span className="text-white text-sm font-semibold">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                        </span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#232428] rounded-full flex items-center justify-center">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#3ba55c]' : 'bg-[#3ba55c]'}`}></div>
                    </div>
                </div>
                {/* Minimal Controls */}
                <div className="flex flex-col items-center gap-1">
                    <button
                        onClick={toggleMute}
                        disabled={!isConnected}
                        className={`p-1.5 rounded transition-colors ${!isConnected
                            ? 'text-[#4e5058] cursor-not-allowed'
                            : isMuted
                                ? 'text-[#ed4245] hover:bg-[#36393f]'
                                : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#36393f]'
                            }`}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={toggleDeafen}
                        disabled={!isConnected}
                        className={`p-1.5 rounded transition-colors ${!isConnected
                            ? 'text-[#4e5058] cursor-not-allowed'
                            : isDeafened
                                ? 'text-[#ed4245] hover:bg-[#36393f]'
                                : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#36393f]'
                            }`}
                        title={isDeafened ? 'Undeafen' : 'Deafen'}
                    >
                        {isDeafened ? <HeadphoneOff className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        );
    }

    // Full mode
    return (
        <div className="bg-[#232428] mt-auto">
            {/* Voice Connected Status */}
            {isConnected && currentChannel && (
                <div className="px-2 py-2 border-b border-[#1f2023]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Signal className="w-4 h-4 text-[#3ba55c]" />
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#3ba55c] rounded-full animate-pulse"></span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold text-[#3ba55c]">Voice Connected</span>
                                <span className="text-[10px] text-[#949ba4] truncate max-w-35">{currentChannel.name}</span>
                            </div>
                        </div>
                        <button
                            onClick={onDisconnect}
                            className="p-1.5 rounded hover:bg-[#36393f] text-[#949ba4] hover:text-white transition-colors"
                            title="Disconnect"
                        >
                            <PhoneOff className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Encryption indicator */}
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-[#3ba55c]">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span>RSA-2048 Encrypted</span>
                    </div>
                </div>
            )}

            {/* User Panel */}
            <div className="px-2 py-2 flex items-center gap-2">
                {/* User Avatar */}
                <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center overflow-hidden">
                        <span className="text-white text-sm font-semibold">
                            {user?.username?.charAt(0).toUpperCase() || 'U'}
                        </span>
                    </div>
                    {/* Online Status */}
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#232428] rounded-full flex items-center justify-center">
                        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-[#3ba55c]' : 'bg-[#3ba55c]'}`}></div>
                    </div>
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{user?.username || 'User'}</p>
                    <p className="text-[10px] text-[#949ba4] truncate">
                        {isConnected ? 'In Voice' : 'Online'}
                    </p>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleMute}
                        disabled={!isConnected}
                        className={`p-2 rounded transition-colors ${!isConnected
                            ? 'text-[#4e5058] cursor-not-allowed'
                            : isMuted
                                ? 'text-[#ed4245] hover:bg-[#36393f]'
                                : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#36393f]'
                            }`}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <button
                        onClick={toggleDeafen}
                        disabled={!isConnected}
                        className={`p-2 rounded transition-colors ${!isConnected
                            ? 'text-[#4e5058] cursor-not-allowed'
                            : isDeafened
                                ? 'text-[#ed4245] hover:bg-[#36393f]'
                                : 'text-[#b5bac1] hover:text-[#dbdee1] hover:bg-[#36393f]'
                            }`}
                        title={isDeafened ? 'Undeafen' : 'Deafen'}
                    >
                        {isDeafened ? <HeadphoneOff className="w-5 h-5" /> : <Headphones className="w-5 h-5" />}
                    </button>

                    <div className="relative group">
                        <button
                            onClick={logout}
                            className="p-2 rounded hover:bg-[#36393f] text-[#b5bac1] hover:text-[#ed4245] transition-colors"
                            title="Log Out"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserSettingsBar;
