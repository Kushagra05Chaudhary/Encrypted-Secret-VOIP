import { useState, useEffect, useRef } from 'react';
import { MicOff, WifiOff, ShieldAlert, RefreshCw, X, AlertTriangle, Info } from 'lucide-react';

const ErrorOverlay = ({ error, onDismiss, onRetry }) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (error) {
            setIsVisible(true);
        }
    }, [error]);

    if (!error || !isVisible) return null;

    const getErrorConfig = (errorType) => {
        switch (errorType) {
            case 'microphone-denied':
                return {
                    icon: <MicOff className="w-12 h-12 text-red-400" />,
                    title: 'Microphone Access Denied',
                    message: 'Please allow microphone access in your browser settings to join voice channels.',
                    color: 'red',
                    showRetry: true,
                    instructions: [
                        'Click the lock/camera icon in the address bar',
                        'Find "Microphone" in the permissions',
                        'Change it to "Allow"',
                        'Refresh the page and try again'
                    ]
                };
            case 'connection-lost':
                return {
                    icon: <WifiOff className="w-12 h-12 text-yellow-400" />,
                    title: 'Connection Lost',
                    message: 'Your connection to the voice server was interrupted. This may be due to network issues.',
                    color: 'yellow',
                    showRetry: true,
                    instructions: [
                        'Check your internet connection',
                        'Try moving closer to your router',
                        'Disable VPN if enabled',
                        'Click "Reconnect" to try again'
                    ]
                };
            case 'encryption-failed':
                return {
                    icon: <ShieldAlert className="w-12 h-12 text-red-400" />,
                    title: 'Encryption Error',
                    message: 'Failed to establish a secure connection. Your keys may need to be regenerated.',
                    color: 'red',
                    showRetry: true,
                    instructions: [
                        'Clear your browser data for this site',
                        'Log out and log back in',
                        'This will generate new encryption keys'
                    ]
                };
            case 'peer-disconnected':
                return {
                    icon: <WifiOff className="w-12 h-12 text-orange-400" />,
                    title: 'Peer Disconnected',
                    message: 'A participant has disconnected from the call.',
                    color: 'orange',
                    showRetry: false,
                    instructions: []
                };
            default:
                return {
                    icon: <AlertTriangle className="w-12 h-12 text-red-400" />,
                    title: 'Something Went Wrong',
                    message: error.message || 'An unexpected error occurred.',
                    color: 'red',
                    showRetry: true,
                    instructions: []
                };
        }
    };

    const config = getErrorConfig(error.type);
    const colorClasses = {
        red: {
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
            button: 'bg-red-500 hover:bg-red-600'
        },
        yellow: {
            bg: 'bg-yellow-500/10',
            border: 'border-yellow-500/30',
            button: 'bg-yellow-500 hover:bg-yellow-600'
        },
        orange: {
            bg: 'bg-orange-500/10',
            border: 'border-orange-500/30',
            button: 'bg-orange-500 hover:bg-orange-600'
        }
    };

    const colors = colorClasses[config.color] || colorClasses.red;

    const handleDismiss = () => {
        setIsVisible(false);
        setTimeout(() => onDismiss?.(), 300);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className={`bg-[#1e1f22] rounded-xl shadow-2xl max-w-md w-full overflow-hidden border ${colors.border}`}>
                {/* Header */}
                <div className={`p-6 ${colors.bg} flex flex-col items-center text-center`}>
                    <div className="mb-4 p-4 rounded-full bg-[#232428]">
                        {config.icon}
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">{config.title}</h2>
                    <p className="text-sm text-gray-400">{config.message}</p>
                </div>

                {/* Instructions */}
                {config.instructions.length > 0 && (
                    <div className="p-6 border-t border-[#2d2f34]">
                        <div className="flex items-center gap-2 mb-3">
                            <Info className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-white">How to fix this:</span>
                        </div>
                        <ol className="space-y-2">
                            {config.instructions.map((instruction, index) => (
                                <li key={index} className="flex items-start gap-3 text-sm text-gray-400">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#36393f] flex items-center justify-center text-xs font-medium text-white">
                                        {index + 1}
                                    </span>
                                    {instruction}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {/* Actions */}
                <div className="p-4 bg-[#232428] flex gap-3">
                    <button
                        onClick={handleDismiss}
                        className="flex-1 py-2.5 rounded-lg bg-[#36393f] hover:bg-[#404249] text-white font-medium transition-colors"
                    >
                        Dismiss
                    </button>
                    {config.showRetry && (
                        <button
                            onClick={() => {
                                handleDismiss();
                                onRetry?.();
                            }}
                            className={`flex-1 py-2.5 rounded-lg ${colors.button} text-white font-medium transition-colors flex items-center justify-center gap-2`}
                        >
                            <RefreshCw className="w-4 h-4" />
                            {error.type === 'connection-lost' ? 'Reconnect' : 'Retry'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ErrorOverlay;
