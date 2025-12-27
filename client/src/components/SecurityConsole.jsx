import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, Key, Lock, Unlock, RefreshCw, CheckCircle, AlertCircle, X, ChevronDown, ChevronUp } from 'lucide-react';

const SecurityConsole = ({
    isOpen,
    onClose,
    events = [],
    cryptoReady,
    isConnected,
    connectedPeers = 0
}) => {
    const [isMinimized, setIsMinimized] = useState(false);

    if (!isOpen) return null;

    const getEventIcon = (type) => {
        switch (type) {
            case 'rsa-init':
                return <Key className="w-4 h-4 text-blue-400" />;
            case 'rsa-complete':
                return <ShieldCheck className="w-4 h-4 text-green-400" />;
            case 'rsa-ready':
                return <Lock className="w-4 h-4 text-purple-400" />;
            case 'handshake-complete':
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'error':
                return <AlertCircle className="w-4 h-4 text-red-400" />;
            default:
                return <Shield className="w-4 h-4 text-gray-400" />;
        }
    };

    const getEventColor = (type) => {
        switch (type) {
            case 'rsa-complete':
            case 'handshake-complete':
                return 'text-green-400';
            case 'rsa-ready':
                return 'text-purple-400';
            case 'error':
                return 'text-red-400';
            default:
                return 'text-gray-400';
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 w-80 animate-fade-in">
            <div className="bg-[#1e1f22] border border-[#2d2f34] rounded-lg shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#232428] border-b border-[#2d2f34]">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${cryptoReady ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                        <span className="font-semibold text-white text-sm">Security Console</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsMinimized(!isMinimized)}
                            className="p-1 hover:bg-[#36393f] rounded text-gray-400 hover:text-white transition-colors"
                        >
                            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-[#36393f] rounded text-gray-400 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {!isMinimized && (
                    <>
                        {/* Status Overview */}
                        <div className="p-4 border-b border-[#2d2f34]">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#232428] rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        {cryptoReady ? (
                                            <ShieldCheck className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <Shield className="w-4 h-4 text-yellow-400" />
                                        )}
                                        <span className="text-xs text-gray-400">Encryption</span>
                                    </div>
                                    <p className={`text-sm font-semibold ${cryptoReady ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {cryptoReady ? 'Active' : 'Initializing'}
                                    </p>
                                </div>

                                <div className="bg-[#232428] rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Lock className="w-4 h-4 text-cyan-400" />
                                        <span className="text-xs text-gray-400">Algorithm</span>
                                    </div>
                                    <p className="text-sm font-semibold text-cyan-400">RSA-OAEP</p>
                                </div>

                                <div className="bg-[#232428] rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Key className="w-4 h-4 text-blue-400" />
                                        <span className="text-xs text-gray-400">Key Size</span>
                                    </div>
                                    <p className="text-sm font-semibold text-blue-400">RSA-2048</p>
                                </div>
                            </div>
                        </div>

                        {/* Event Log */}
                        <div className="p-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                                Security Events
                            </h4>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                {events.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-4">No events yet</p>
                                ) : (
                                    events.slice(-10).reverse().map((event, index) => (
                                        <div
                                            key={index}
                                            className="flex items-start gap-2 p-2 rounded bg-[#232428] hover:bg-[#2a2c31] transition-colors"
                                        >
                                            {getEventIcon(event.type)}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-xs font-medium ${getEventColor(event.type)}`}>
                                                    {event.message}
                                                </p>
                                                <p className="text-[10px] text-gray-500 mt-0.5">
                                                    {event.timestamp}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 bg-[#232428] border-t border-[#2d2f34]">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                    {connectedPeers} encrypted connection{connectedPeers !== 1 ? 's' : ''}
                                </span>
                                <span className={isConnected ? 'text-green-400' : 'text-gray-500'}>
                                    {isConnected ? '● Connected' : '○ Disconnected'}
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SecurityConsole;
