import React, { useState } from 'react';

const SettingsPanel = ({
  brokerHost,
  brokerPort,
  isConnected,
  updateBrokerConfig,
}) => {
  const [tempHost, setTempHost] = useState(brokerHost);
  const [tempPort, setTempPort] = useState(brokerPort);

  const handleSubmit = (e) => {
    e.preventDefault();
    updateBrokerConfig(tempHost, tempPort); // Simply call updateBrokerConfig, no redundant state updates
  };

  return (
    <div className="mb-4 bg-gray-800/80 rounded-xl p-4 shadow-lg border border-purple-500/30 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap gap-3 items-center"
      >
        <div className="flex-1 min-w-[150px]">
          <label className="block text-xs font-medium text-purple-300 mb-1">
            Broker Host/IP
          </label>
          <input
            type="text"
            value={tempHost}
            onChange={(e) => setTempHost(e.target.value)}
            placeholder="e.g., 10.214.162.1"
            className="w-full px-2 py-1 bg-gray-700 border border-purple-500 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isConnected}
          />
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="block text-xs font-medium text-purple-300 mb-1">
            Port
          </label>
          <input
            type="number"
            value={tempPort}
            onChange={(e) => setTempPort(e.target.value)}
            min="1"
            max="65535"
            placeholder="9002"
            className="w-full px-2 py-1 bg-gray-700 border border-purple-500 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isConnected}
          />
        </div>
        <button
          type="submit"
          disabled={isConnected || tempHost.trim() === '' || !tempPort}
          className="bg-gradient-to-r from-gray-600 to-gray-600 text-white px-4 py-1 rounded-xl font-semibold hover:from-purple-700 hover:to-violet-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg border border-purple-500/50"
        >
          {isConnected ? 'Disconnect to Update' : 'Update Config'}
        </button>
      </form>
      {isConnected && (
        <p className="text-xs text-yellow-400 mt-1">
          Disconnect to change settings.
        </p>
      )}
    </div>
  );
};

export default SettingsPanel;
