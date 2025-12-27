const RoomCard = ({ room, onJoin }) => {
    const participantCount = room.participants?.length || 0;

    return (
        <div className="card group cursor-pointer" onClick={() => onJoin(room)}>
            <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-linear-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center group-hover:from-indigo-500/30 group-hover:to-purple-500/30 transition-all">
                    <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                </div>

                {/* Live indicator */}
                {participantCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-xs font-medium text-green-400">Live</span>
                    </div>
                )}
            </div>

            <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">
                {room.name}
            </h3>

            <p className="text-sm text-slate-400 mb-4">
                Created by {room.createdByUsername}
            </p>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span className="text-sm">{participantCount} participants</span>
                </div>

                <button className="px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-sm font-medium hover:bg-indigo-500/30 transition-all group-hover:bg-indigo-500 group-hover:text-white">
                    Join Room
                </button>
            </div>
        </div>
    );
};

export default RoomCard;
