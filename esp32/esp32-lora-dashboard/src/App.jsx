import { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const ESP32LoRaDashboard = () => {
  // MQTT Configuration - matches your ESP32 setup
  const MQTT_BROKER = '10.214.162.1'; // Update with your broker IP
  const MQTT_PORT = 9002; // WebSocket port
  const CLIENT_ID = 'dashboard_' + Math.random().toString(16).substr(2, 8);

  // Board configuration - matches your ESP32 BOARD_ID
  const BOARDS = ['board1', 'board2']; // Changed to match your ESP32 code

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [mqttReady, setMqttReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [ledState, setLedState] = useState({
    board1: false,
    board2: false,
  });
  const [chartData, setChartData] = useState({
    board1: [],
    board2: [],
  });
  const [totalPackets, setTotalPackets] = useState({
    board1: 0,
    board2: 0,
  });
  const [logs, setLogs] = useState([]);
  const [liveData, setLiveData] = useState({
    board1: { lastRSSI: null, lastSNR: null, lastMessage: '-' },
    board2: { lastRSSI: null, lastSNR: null, lastMessage: '-' },
  });
  const [systemData, setSystemData] = useState({
    board1: {
      tracking: false,
      angle: 0,
      bestAngle: -1,
      bestRSSI: -999,
      loraActive: false,
    },
    board2: {
      tracking: false,
      angle: 0,
      bestAngle: -1,
      bestRSSI: -999,
      loraActive: false,
    },
  });

  const mqttClientRef = useRef(null);

  // Load MQTT library only
  useEffect(() => {
    const script = document.createElement('script');
    script.src =
      'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js';
    script.onload = () => {
      setMqttReady(true);
      addLog('MQTT library loaded. Click Connect to start.', 'info');
    };
    script.onerror = () => {
      addLog('Failed to load MQTT library', 'error');
    };
    document.head.appendChild(script);

    // Cleanup
    return () => {
      if (mqttClientRef.current && isConnected) {
        try {
          mqttClientRef.current.disconnect();
        } catch (error) {
          console.error('Error disconnecting MQTT:', error);
        }
      }
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const connectMQTT = () => {
    if (connecting || isConnected) return;

    try {
      if (!window.Paho) {
        addLog('Paho MQTT library not loaded', 'error');
        return;
      }

      if (!mqttReady) {
        addLog('MQTT library not ready yet', 'warning');
        return;
      }

      setConnecting(true);
      mqttClientRef.current = new window.Paho.MQTT.Client(
        MQTT_BROKER,
        MQTT_PORT,
        CLIENT_ID
      );

      mqttClientRef.current.onConnectionLost = onConnectionLost;
      mqttClientRef.current.onMessageArrived = onMessageArrived;

      const options = {
        timeout: 10,
        onSuccess: onConnect,
        onFailure: onConnectFailure,
      };

      addLog(
        `Connecting to MQTT broker at ${MQTT_BROKER}:${MQTT_PORT}...`,
        'info'
      );
      mqttClientRef.current.connect(options);
    } catch (error) {
      addLog('MQTT connection error: ' + error.message, 'error');
      setConnecting(false);
    }
  };

  const disconnectMQTT = () => {
    if (mqttClientRef.current && isConnected) {
      try {
        mqttClientRef.current.disconnect();
        addLog('Disconnected from MQTT broker', 'info');
        setIsConnected(false);
        setConnecting(false);
      } catch (error) {
        addLog('Error disconnecting: ' + error.message, 'error');
      }
    }
  };

  const onConnect = () => {
    addLog('Connected to MQTT broker successfully!', 'info');
    setIsConnected(true);
    setConnecting(false);

    // Subscribe to topics for all boards - matches your ESP32 topic structure
    const topics = [];
    BOARDS.forEach((boardId) => {
      topics.push(`esp32/${boardId}/status`);
      topics.push(`esp32/${boardId}/lora/data`); // This is the key topic for chart data
      topics.push(`esp32/${boardId}/angle`);
      topics.push(`esp32/${boardId}/rotation/complete`);
      topics.push(`esp32/${boardId}/stored/data`);
    });

    topics.forEach((topic) => {
      try {
        mqttClientRef.current.subscribe(topic);
        addLog(`Subscribed to ${topic}`, 'info');
      } catch (error) {
        addLog(`Failed to subscribe to ${topic}: ${error.message}`, 'error');
      }
    });
  };

  const onConnectFailure = (error) => {
    addLog(
      'MQTT connection failed: ' +
        (error.errorMessage || 'Network error or broker unavailable'),
      'error'
    );
    setIsConnected(false);
    setConnecting(false);
  };

  const onConnectionLost = (responseObject) => {
    if (responseObject.errorCode !== 0) {
      addLog('MQTT connection lost: ' + responseObject.errorMessage, 'error');
      setIsConnected(false);
      setConnecting(false);
    }
  };

  const onMessageArrived = (message) => {
    const topic = message.destinationName;
    const payload = message.payloadString;

    // Extract board ID from topic (esp32/board1/... or esp32/board2/...)
    const topicParts = topic.split('/');
    const boardId = topicParts[1]; // board1 or board2

    if (!BOARDS.includes(boardId)) {
      addLog(`Received message from unknown board: ${boardId}`, 'warning');
      return;
    }

    try {
      const data = JSON.parse(payload);
      handleMQTTMessage(boardId, topic, data);
    } catch (error) {
      // If JSON parsing fails, treat as plain text
      handleMQTTMessage(boardId, topic, payload);
    }
  };

  const handleMQTTMessage = (boardId, topic, data) => {
    if (topic.includes('/status')) {
      handleStatusMessage(boardId, data);
    } else if (topic.includes('/lora/data')) {
      handleLoRaData(boardId, data);
    } else if (topic.includes('/angle')) {
      setSystemData((prev) => ({
        ...prev,
        [boardId]: { ...prev[boardId], angle: parseInt(data) },
      }));
    } else if (topic.includes('/rotation/complete')) {
      handleRotationComplete(boardId, data);
    } else if (topic.includes('/stored/data')) {
      handleStoredData(boardId, data);
    } else {
      addLog(
        `[${boardId}] Received from ${topic}: ${JSON.stringify(data)}`,
        'info'
      );
    }
  };

  const handleStatusMessage = (boardId, data) => {
    if (typeof data === 'object') {
      setSystemData((prev) => ({
        ...prev,
        [boardId]: {
          ...prev[boardId],
          tracking: data.tracking || false,
          angle: data.angle || 0,
          loraActive: data.lora_active || false,
          bestRSSI:
            data.current_best_rssi && data.current_best_rssi > -999
              ? data.current_best_rssi
              : prev[boardId].bestRSSI,
        },
      }));
      addLog(`[${boardId}] Status: ${data.message || 'Status update'}`, 'info');
    }
  };

  const handleLoRaData = (boardId, data) => {
    if (typeof data === 'object') {
      setTotalPackets((prev) => ({ ...prev, [boardId]: prev[boardId] + 1 }));

      setLiveData((prev) => ({
        ...prev,
        [boardId]: {
          lastRSSI: data.rssi,
          lastSNR: data.snr,
          lastMessage: data.message || '-',
        },
      }));

      // Update chart data - this is the critical part
      if (data.angle !== undefined && data.rssi !== undefined) {
        updateChart(boardId, data.angle, data.rssi);
      }

      // Update best values
      if (
        data.best_rssi_at_angle &&
        data.best_rssi_at_angle > systemData[boardId].bestRSSI
      ) {
        setSystemData((prev) => ({
          ...prev,
          [boardId]: {
            ...prev[boardId],
            bestRSSI: data.best_rssi_at_angle,
            bestAngle: data.angle,
          },
        }));
      }

      addLog(
        `[${boardId}] Angle ${data.angle}° | RSSI: ${
          data.rssi
        } dBm | SNR: ${data.snr?.toFixed(1)} dB`,
        'data'
      );
    }
  };

  const handleRotationComplete = (boardId, data) => {
    if (typeof data === 'object') {
      addLog(
        `[${boardId}] Rotation Complete! Best: ${data.best_rssi} dBm at ${data.best_angle}°`,
        'info'
      );
      setSystemData((prev) => ({
        ...prev,
        [boardId]: {
          ...prev[boardId],
          bestAngle: data.best_angle,
          bestRSSI: data.best_rssi,
          tracking: false,
        },
      }));
    }
  };

  const handleStoredData = (boardId, data) => {
    if (typeof data === 'object') {
      addLog(
        `[${boardId}] Best angle data: Angle ${data.angle}°, RSSI ${data.rssi} dBm`,
        'info'
      );
    }
  };

  const updateChart = (boardId, angle, rssi) => {
    setChartData((prevData) => {
      const prevBoardData = prevData[boardId] || [];
      const existingIndex = prevBoardData.findIndex(
        (point) => point.angle === angle
      );
      let newBoardData;

      if (existingIndex !== -1) {
        // Update if this is a better RSSI for the same angle
        if (rssi > prevBoardData[existingIndex].rssi) {
          newBoardData = [...prevBoardData];
          newBoardData[existingIndex] = { angle, rssi };
        } else {
          return prevData; // No change needed
        }
      } else {
        // Add new data point
        newBoardData = [...prevBoardData, { angle, rssi }];
      }

      return {
        ...prevData,
        [boardId]: newBoardData.sort((a, b) => a.angle - b.angle),
      };
    });
  };

  const publishMessage = (boardId, topicSuffix, message) => {
    if (!isConnected || !mqttClientRef.current) {
      addLog(`[${boardId}] Cannot publish: MQTT not connected`, 'error');
      return;
    }

    const topic = `esp32/${boardId}/${topicSuffix}`;
    try {
      const msg = new window.Paho.MQTT.Message(message);
      msg.destinationName = topic;
      mqttClientRef.current.send(msg);
      addLog(`[${boardId}] Published to ${topic}: ${message}`, 'info');
    } catch (error) {
      addLog(
        `[${boardId}] Failed to publish message: ${error.message}`,
        'error'
      );
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = {
      id: Date.now() + Math.random(),
      timestamp,
      message,
      type,
    };

    setLogs((prevLogs) => {
      const updatedLogs = [...prevLogs, newLog];
      return updatedLogs.slice(-100); // Keep only last 100 entries
    });
  };

  // Control functions
  const startTracking = (boardId) => {
    if (!isConnected) {
      addLog(
        `[${boardId}] Cannot start tracking: MQTT not connected`,
        'warning'
      );
      return;
    }
    publishMessage(boardId, 'start', '1');
    addLog(`[${boardId}] Starting tracking...`, 'info');
  };

  const stopTracking = (boardId) => {
    if (!isConnected) {
      addLog(
        `[${boardId}] Cannot stop tracking: MQTT not connected`,
        'warning'
      );
      return;
    }
    publishMessage(boardId, 'stop', '1');
    addLog(`[${boardId}] Stopping tracking...`, 'info');
  };

  const resetSystem = (boardId) => {
    if (!isConnected) {
      addLog(`[${boardId}] Cannot reset: MQTT not connected`, 'warning');
      return;
    }
    publishMessage(boardId, 'reset', '1');
    addLog(`[${boardId}] Resetting system...`, 'info');

    // Clear local data
    setChartData((prev) => ({ ...prev, [boardId]: [] }));
    setTotalPackets((prev) => ({ ...prev, [boardId]: 0 }));
    setSystemData((prev) => ({
      ...prev,
      [boardId]: {
        ...prev[boardId],
        bestAngle: -1,
        bestRSSI: -999,
        angle: 0,
      },
    }));
    setLiveData((prev) => ({
      ...prev,
      [boardId]: { lastRSSI: null, lastSNR: null, lastMessage: '-' },
    }));
  };

  const toggleLED = (boardId) => {
    if (!isConnected) {
      addLog(`[${boardId}] Cannot toggle LED: MQTT not connected`, 'warning');
      return;
    }
    const newLedState = !ledState[boardId];
    setLedState((prev) => ({ ...prev, [boardId]: newLedState }));
    publishMessage(boardId, 'led', newLedState ? 'ON' : 'OFF');
    addLog(`[${boardId}] LED turned ${newLedState ? 'ON' : 'OFF'}`, 'info');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-5">
      <div className="max-w-7xl mx-auto bg-white/95 rounded-3xl shadow-2xl backdrop-blur-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-30">
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
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#grid)" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold mb-4 relative z-10">
            ESP32 LoRa Tracker Dashboard
          </h1>

          <div className="absolute top-5 right-5 z-10">
            <span
              className={`px-4 py-2 rounded-full text-sm font-bold ${
                connecting
                  ? 'bg-yellow-500'
                  : isConnected
                  ? 'bg-green-500'
                  : 'bg-red-500'
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
            <span
              className={`px-4 py-2 rounded-full text-sm font-bold ${
                connecting
                  ? 'bg-yellow-500'
                  : isConnected
                  ? 'bg-green-500'
                  : 'bg-red-500'
              }`}
            >
              MQTT:{' '}
              {connecting
                ? 'Connecting...'
                : isConnected
                ? 'Connected'
                : 'Disconnected'}
            </span>

            {BOARDS.map((boardId) => (
              <div key={boardId} className="flex gap-2">
                <span
                  className={`px-4 py-2 rounded-full text-sm font-bold ${
                    systemData[boardId].tracking
                      ? 'bg-orange-500'
                      : 'bg-gray-500'
                  }`}
                >
                  {boardId}:{' '}
                  {systemData[boardId].tracking ? 'Tracking' : 'Idle'}
                </span>
                <span
                  className={`px-4 py-2 rounded-full text-sm font-bold ${
                    systemData[boardId].loraActive
                      ? 'bg-green-500'
                      : 'bg-red-500'
                  }`}
                >
                  LoRa: {systemData[boardId].loraActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-8">
          {/* Connection Control */}
          <div className="mb-8 text-center">
            {!isConnected ? (
              <button
                onClick={connectMQTT}
                disabled={!mqttReady || connecting}
                className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
              >
                {connecting ? 'Connecting...' : 'Connect to MQTT'}
              </button>
            ) : (
              <button
                onClick={disconnectMQTT}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transform hover:-translate-y-1 transition-all duration-300 shadow-lg"
              >
                Disconnect MQTT
              </button>
            )}
          </div>

          {/* Board Controls and Charts */}
          {BOARDS.map((boardId) => {
            const progress = Math.round(
              (systemData[boardId].angle / 180) * 100
            );

            return (
              <div
                key={boardId}
                className="mb-12 bg-white rounded-2xl p-6 shadow-lg border border-gray-100"
              >
                <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center border-b-2 border-blue-500 pb-3">
                  Board: {boardId.toUpperCase()}
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Control Panel */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-bold text-gray-800">
                      Control Panel
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => startTracking(boardId)}
                        disabled={!isConnected || systemData[boardId].tracking}
                        className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                      >
                        Start Tracking
                      </button>
                      <button
                        onClick={() => stopTracking(boardId)}
                        disabled={!isConnected || !systemData[boardId].tracking}
                        className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                      >
                        Stop Tracking
                      </button>
                      <button
                        onClick={() => resetSystem(boardId)}
                        disabled={!isConnected}
                        className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-orange-600 hover:to-orange-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                      >
                        Reset System
                      </button>
                      <button
                        onClick={() => toggleLED(boardId)}
                        disabled={!isConnected}
                        className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-gray-600 hover:to-gray-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                      >
                        Toggle LED
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                          Current Angle
                        </div>
                        <div className="text-xl font-bold text-gray-800">
                          {systemData[boardId].angle}°
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                          Progress
                        </div>
                        <div className="text-xl font-bold text-gray-800">
                          {progress}%
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                          Best Angle
                        </div>
                        <div className="text-xl font-bold text-gray-800">
                          {systemData[boardId].bestAngle >= 0
                            ? `${systemData[boardId].bestAngle}°`
                            : '-'}
                        </div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                          Best RSSI
                        </div>
                        <div className="text-xl font-bold text-gray-800">
                          {systemData[boardId].bestRSSI > -999
                            ? `${systemData[boardId].bestRSSI} dBm`
                            : '- dBm'}
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300 ease-in-out"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Live Chart */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-800">
                      Live RSSI Chart
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData[boardId]}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#e0e0e0"
                          />
                          <XAxis
                            dataKey="angle"
                            label={{
                              value: 'Angle (degrees)',
                              position: 'insideBottom',
                              offset: -10,
                            }}
                            stroke="#666"
                          />
                          <YAxis
                            label={{
                              value: 'RSSI (dBm)',
                              angle: -90,
                              position: 'insideLeft',
                            }}
                            stroke="#666"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'rgba(0, 0, 0, 0.8)',
                              color: 'white',
                              border: '1px solid #2196F3',
                              borderRadius: '8px',
                            }}
                            formatter={(value) => [`${value} dBm`, 'RSSI']}
                            labelFormatter={(label) => `Angle: ${label}°`}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="rssi"
                            stroke={
                              boardId === 'board1' ? '#2196F3' : '#f44336'
                            }
                            strokeWidth={3}
                            dot={{
                              fill:
                                boardId === 'board1' ? '#2196F3' : '#f44336',
                              strokeWidth: 2,
                              r: 4,
                            }}
                            activeDot={{
                              r: 6,
                              stroke:
                                boardId === 'board1' ? '#2196F3' : '#f44336',
                              strokeWidth: 2,
                            }}
                            name="RSSI (dBm)"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Live Data */}
                <div className="mt-8">
                  <h3 className="text-xl font-bold text-gray-800 mb-4">
                    Live LoRa Data
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                      <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                        Last RSSI
                      </div>
                      <div className="text-xl font-bold text-gray-800">
                        {liveData[boardId].lastRSSI !== null
                          ? `${liveData[boardId].lastRSSI} dBm`
                          : '- dBm'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                      <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                        Last SNR
                      </div>
                      <div className="text-xl font-bold text-gray-800">
                        {liveData[boardId].lastSNR !== null
                          ? `${liveData[boardId].lastSNR.toFixed(1)} dB`
                          : '- dB'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                      <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                        Packets Received
                      </div>
                      <div className="text-xl font-bold text-gray-800">
                        {totalPackets[boardId]}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
                      <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
                        Last Message
                      </div>
                      <div className="text-lg font-bold text-gray-800 truncate">
                        {liveData[boardId].lastMessage}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* System Logs */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-blue-500">
              System Logs
            </h3>
            <div className="bg-black rounded-xl p-5 h-72 overflow-y-auto font-mono text-sm">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`mb-1 p-1 rounded ${
                    log.type === 'error'
                      ? 'text-red-400 bg-red-400/10'
                      : log.type === 'warning'
                      ? 'text-yellow-400 bg-yellow-400/10'
                      : log.type === 'data'
                      ? 'text-cyan-400'
                      : 'text-green-400'
                  }`}
                >
                  [{log.timestamp}] {log.message}
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-gray-500 text-center py-8">
                  Waiting for system logs...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ESP32LoRaDashboard;
