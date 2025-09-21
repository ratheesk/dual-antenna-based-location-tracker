import React from 'react';

const SystemLogs = ({ logs }) => {
  return (
    <div className="bg-gray-800/80 rounded-2xl p-6 shadow-lg border border-purple-500/30 backdrop-blur-sm">
      <h3 className="text-xl font-bold text-purple-300 mb-6 pb-3 border-b-2 border-purple-500">
        System Logs
      </h3>
      <div className="bg-black/80 rounded-xl p-5 h-72 overflow-y-auto font-mono text-sm border border-purple-500/30">
        {logs.map((log) => (
          <div
            key={log.id}
            className={`mb-1 p-2 rounded ${
              log.type === 'error'
                ? 'text-red-400 bg-red-900/20 border-l-2 border-red-500'
                : log.type === 'warning'
                ? 'text-yellow-400 bg-yellow-900/20 border-l-2 border-yellow-500'
                : log.type === 'data'
                ? 'text-cyan-400 bg-cyan-900/20 border-l-2 border-cyan-500'
                : 'text-green-400 bg-green-900/20 border-l-2 border-green-500'
            }`}
          >
            <span className="text-purple-300">[{log.timestamp}]</span>{' '}
            {log.message}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-500 text-center py-8">
            <div className="animate-pulse">
              <div className="text-purple-400">⚡</div>
              <div className="mt-2">Waiting for system logs...</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemLogs;
