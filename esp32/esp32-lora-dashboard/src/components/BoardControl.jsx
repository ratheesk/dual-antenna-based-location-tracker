import React from 'react';

const BoardControl = ({
  boardId,
  isConnected,
  systemData,
  startTracking,
  stopTracking,
  resetSystem,
  toggleLED,
}) => {
  const progress = Math.round((systemData[boardId].angle / 180) * 100);

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-purple-300">Control Panel</h3>
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => startTracking(boardId)}
          disabled={!isConnected || systemData[boardId].tracking}
          className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-emerald-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-green-500/50"
        >
          Start Tracking
        </button>
        <button
          onClick={() => stopTracking(boardId)}
          disabled={!isConnected || !systemData[boardId].tracking}
          className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-red-700 hover:to-pink-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-red-500/50"
        >
          Stop Tracking
        </button>
        <button
          onClick={() => resetSystem(boardId)}
          disabled={!isConnected}
          className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-orange-700 hover:to-amber-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-orange-500/50"
        >
          Reset System
        </button>
        <button
          onClick={() => toggleLED(boardId)}
          disabled={!isConnected}
          className="bg-gradient-to-r from-gray-600 to-slate-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-gray-700 hover:to-slate-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-gray-500/50"
        >
          Toggle LED
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Current Angle
          </div>
          <div className="text-xl font-bold text-white">
            {systemData[boardId].angle}°
          </div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Progress
          </div>
          <div className="text-xl font-bold text-white">{progress}%</div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Best Angle
          </div>
          <div className="text-xl font-bold text-white">
            {systemData[boardId].bestAngle >= 0
              ? `${systemData[boardId].bestAngle}°`
              : '-'}
          </div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Best RSSI
          </div>
          <div className="text-xl font-bold text-white">
            {systemData[boardId].bestRSSI > -999
              ? `${systemData[boardId].bestRSSI} dBm`
              : '- dBm'}
          </div>
        </div>
      </div>
      <div className="w-full h-5 bg-gray-700 rounded-full overflow-hidden border border-purple-500/30">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-violet-500 transition-all duration-300 ease-in-out"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
};

export default BoardControl;
