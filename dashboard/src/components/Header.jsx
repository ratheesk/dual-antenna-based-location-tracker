import React from 'react';

const Header = ({ isConnected, connecting, systemData, boards }) => {
  return (
    <div className="bg-gradient-to-r from-purple-600 to-violet-600 text-white p-8 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <defs>
            <pattern
              id="grid"
              width="10"
              height="10"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      <h1 className="text-4xl font-bold mb-4 relative z-10 text-white">
        Dual Directional Antenna Based Localization
      </h1>

      <div className="absolute top-5 right-5 z-10">
        <span
          className={`px-4 py-2 rounded-full text-sm font-bold ${
            connecting
              ? 'bg-yellow-500 text-black'
              : isConnected
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}
        >
          {connecting
            ? 'MQTT Connecting...'
            : isConnected
            ? 'MQTT Connected'
            : 'MQTT Disconnected'}
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-3 relative z-10">
        {boards.map((boardId) => (
          <div key={boardId} className="flex gap-2">
            <span
              className={`px-4 py-2 rounded-full text-sm font-bold ${
                systemData[boardId].tracking
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-600 text-gray-200'
              }`}
            >
              {boardId}: {systemData[boardId].tracking ? 'Tracking' : 'Idle'}
            </span>
            <span
              className={`px-4 py-2 rounded-full text-sm font-bold ${
                systemData[boardId].loraActive
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              }`}
            >
              LoRa: {systemData[boardId].loraActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Header;
