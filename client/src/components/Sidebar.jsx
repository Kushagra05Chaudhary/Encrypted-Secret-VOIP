import { useState } from 'react';
import { Hash, Volume2, ChevronDown, ChevronRight, Plus, Settings, Users, Lock, Trash2 } from 'lucide-react';

const Sidebar = ({ servers, channels = [], selectedChannel, onSelectChannel, onCreateChannel, onDeleteChannel, channelListVisible = true, onToggleChannelList }) => {
    const [expandedServers, setExpandedServers] = useState({ 'voice-channels': true, 'text-channels': true });
    const [selectedServer, setSelectedServer] = useState(0);

    const toggleServer = (serverId) => {
        setExpandedServers(prev => ({
            ...prev,
            [serverId]: !prev[serverId]
        }));
    };

    const toggleChannelList = () => {
        onToggleChannelList?.();
    };

    // All channels from API are voice channels
    const voiceChannels = channels;

    return (
        <div className="flex h-full">
            {/* Server List - Narrow strip */}
            <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2">
                {/* Home Server */}
                <div className="relative group">
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-white transition-all duration-200 ${selectedServer === 0 ? 'h-10' : 'h-0 group-hover:h-5'}`}></div>
                    <button
                        onClick={() => {
                            setSelectedServer(0);
                            if (!channelListVisible) {
                                onToggleChannelList?.();
                            }
                        }}
                        className={`w-12 h-12 rounded-[24px] bg-[#5865f2] flex items-center justify-center text-white font-bold transition-all duration-300 hover:rounded-[16px] ${selectedServer === 0 ? 'rounded-[16px]' : ''}`}
                    >
                        <Volume2 className="w-6 h-6" />
                    </button>
                    {/* Tooltip */}
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-2 bg-[#18191c] rounded-md text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                        SecureVOIP Server
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#18191c] rotate-45"></div>
                    </div>
                </div>

                {/* Divider */}
                <div className="w-8 h-0.5 bg-[#35363c] rounded-full my-1"></div>

                {/* Server Icons - Coming Soon */}
                {servers.map((server, index) => (
                    <div key={server.id} className="relative group">
                        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-white transition-all duration-200 ${selectedServer === index + 1 ? 'h-10' : 'h-0 group-hover:h-5'}`}></div>
                        <button
                            onClick={() => alert('Multiple servers coming soon!')}
                            className="w-12 h-12 rounded-[24px] bg-[#36393f] flex items-center justify-center text-white font-semibold transition-all duration-300 hover:rounded-[16px] hover:bg-[#5865f2] opacity-50 cursor-not-allowed"
                        >
                            {server.name.charAt(0).toUpperCase()}
                        </button>
                        {/* Tooltip */}
                        <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-2 bg-[#18191c] rounded-md text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                            {server.name} <span className="text-[#faa61a]">(Coming Soon)</span>
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#18191c] rotate-45"></div>
                        </div>
                    </div>
                ))}

                {/* Add Server Button - Coming Soon */}
                <div className="relative group">
                    <button
                        onClick={() => alert('Create server feature coming soon!')}
                        className="w-12 h-12 rounded-[24px] bg-[#36393f] flex items-center justify-center text-[#3ba55c] transition-all duration-300 hover:rounded-[16px] hover:bg-[#3ba55c] hover:text-white opacity-50 cursor-not-allowed"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-2 bg-[#18191c] rounded-md text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                        Add Server <span className="text-[#faa61a]">(Coming Soon)</span>
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-[#18191c] rotate-45"></div>
                    </div>
                </div>
            </div>

            {/* Channel List - Toggleable */}
            {channelListVisible && (
                <div className="w-60 bg-[#2b2d31] flex flex-col shrink-0 max-md:absolute max-md:left-[72px] max-md:top-0 max-md:bottom-0 max-md:z-10 max-md:shadow-xl">
                    {/* Server Header */}
                    <div
                        onClick={toggleChannelList}
                        className="h-12 px-4 flex items-center justify-between border-b border-[#1f2023] shadow-sm cursor-pointer hover:bg-[#35373c] transition-colors"
                    >
                        <span className="font-semibold text-white truncate">SecureVOIP Server</span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>

                    {/* Channels */}
                    <div className="flex-1 overflow-y-auto pt-4 px-2">
                        {/* Voice Channels Category */}
                        <div className="mb-4">
                            <div className="flex items-center gap-1 px-1 text-xs font-semibold text-[#949ba4] uppercase tracking-wide hover:text-[#dbdee1] transition-colors w-full group">
                                <button
                                    onClick={() => toggleServer('voice-channels')}
                                    className="flex items-center gap-1 flex-1"
                                >
                                    {expandedServers['voice-channels'] ? (
                                        <ChevronDown className="w-3 h-3" />
                                    ) : (
                                        <ChevronRight className="w-3 h-3" />
                                    )}
                                    Voice Channels
                                </button>
                                <button
                                    onClick={() => onCreateChannel?.()}
                                    className="p-1 rounded hover:bg-[#404249] opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Create Voice Channel"
                                >
                                    <Plus className="w-4 h-4 hover:text-white" />
                                </button>
                            </div>

                            {expandedServers['voice-channels'] && (
                                <div className="mt-1 space-y-0.5">
                                    {voiceChannels.map(channel => (
                                        <div
                                            key={channel.id}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c] transition-colors group/channel ${selectedChannel?.id === channel.id ? 'bg-[#404249] text-white' : ''}`}
                                        >
                                            <button
                                                onClick={() => onSelectChannel(channel)}
                                                className="flex items-center gap-2 flex-1 min-w-0"
                                            >
                                                <Volume2 className="w-5 h-5 shrink-0 text-[#949ba4]" />
                                                <span className="truncate text-sm flex-1 text-left">{channel.name}</span>
                                            </button>
                                            <Lock className="w-3 h-3 text-[#3ba55c] shrink-0" title="Encrypted" />
                                            {channel.participants?.length > 0 && (
                                                <span className="text-xs text-[#949ba4] flex items-center gap-1">
                                                    <Users className="w-3 h-3" />
                                                    {channel.participants.length}
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm(`Delete "${channel.name}"?`)) {
                                                        onDeleteChannel?.(channel.id);
                                                    }
                                                }}
                                                className="p-1 rounded hover:bg-[#ed4245] text-[#949ba4] hover:text-white opacity-0 group-hover/channel:opacity-100 transition-all"
                                                title="Delete Channel"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}

                                    {voiceChannels.length === 0 && (
                                        <div className="text-xs text-[#949ba4] px-2 py-3 text-center">
                                            <p>No voice channels</p>
                                            <button
                                                onClick={() => onCreateChannel?.()}
                                                className="mt-2 text-[#5865f2] hover:underline"
                                            >
                                                Create one
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Text Channels Category (Demo - Not functional) */}
                        <div className="mb-4">
                            <button
                                onClick={() => toggleServer('text-channels')}
                                className="flex items-center gap-1 px-1 text-xs font-semibold text-[#949ba4] uppercase tracking-wide hover:text-[#dbdee1] transition-colors w-full"
                            >
                                {expandedServers['text-channels'] ? (
                                    <ChevronDown className="w-3 h-3" />
                                ) : (
                                    <ChevronRight className="w-3 h-3" />
                                )}
                                Text Channels
                            </button>

                            {expandedServers['text-channels'] && (
                                <div className="mt-1 space-y-0.5">
                                    <button
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c] transition-colors opacity-50 cursor-not-allowed"
                                        disabled
                                        title="Text channels coming soon"
                                    >
                                        <Hash className="w-5 h-5 shrink-0" />
                                        <span className="truncate text-sm">general</span>
                                        <span className="text-[10px] bg-[#5865f2] px-1 rounded">Soon</span>
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[#949ba4] hover:text-[#dbdee1] hover:bg-[#35373c] transition-colors opacity-50 cursor-not-allowed"
                                        disabled
                                        title="Text channels coming soon"
                                    >
                                        <Hash className="w-5 h-5 shrink-0" />
                                        <span className="truncate text-sm">random</span>
                                        <span className="text-[10px] bg-[#5865f2] px-1 rounded">Soon</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sidebar;
