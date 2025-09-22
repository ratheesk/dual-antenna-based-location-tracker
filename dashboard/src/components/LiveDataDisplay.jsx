import React from 'react';

const LiveDataDisplay = ({ boardId, liveData, totalPackets }) => {
  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold text-purple-300 mb-4">Live LoRa Data</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Last RSSI
          </div>
          <div className="text-xl font-bold text-white">
            {liveData[boardId].lastRSSI !== null
              ? `${liveData[boardId].lastRSSI} dBm`
              : '- dBm'}
          </div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Last SNR
          </div>
          <div className="text-xl font-bold text-white">
            {liveData[boardId].lastSNR !== null
              ? `${liveData[boardId].lastSNR.toFixed(1)} dB`
              : '- dB'}
          </div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Packets Received
          </div>
          <div className="text-xl font-bold text-white">
            {totalPackets[boardId]}
          </div>
        </div>
        <div className="bg-gray-700/50 p-4 rounded-xl border-l-4 border-purple-500 backdrop-blur-sm">
          <div className="text-xs text-purple-300 uppercase tracking-wide mb-1">
            Last Message
          </div>
          <div className="text-lg font-bold text-white truncate">
            {liveData[boardId].lastMessage}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveDataDisplay;
