import React from 'react';

const ConnectionControl = ({
  isConnected,
  mqttReady,
  connecting,
  connectMQTT,
  disconnectMQTT,
}) => {
  return (
    <div className="mb-8 text-center">
      {!isConnected ? (
        <button
          onClick={connectMQTT}
          disabled={!mqttReady || connecting}
          className="bg-gradient-to-r from-purple-600 to-violet-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-purple-700 hover:to-violet-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-purple-500/50"
        >
          {connecting ? 'Connecting...' : 'Connect to MQTT'}
        </button>
      ) : (
        <button
          onClick={disconnectMQTT}
          className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-red-700 hover:to-pink-700 transform hover:-translate-y-1 transition-all duration-300 shadow-lg border border-red-500/50"
        >
          Disconnect MQTT
        </button>
      )}
    </div>
  );
};

export default ConnectionControl;
