import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import ConnectionControl from './components/ConnectionControl.jsx';
import BoardControl from './components/BoardControl.jsx';
import LiveChart from './components/LiveChart.jsx';
import LiveDataDisplay from './components/LiveDataDisplay.jsx';
import SystemLogs from './components/SystemLogs.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';

const App = () => {
  const [brokerHost, setBrokerHost] = useState(() => {
    return localStorage.getItem('mqttHost') || '10.214.162.1';
  });
  const [brokerPort, setBrokerPort] = useState(() => {
    return localStorage.getItem('mqttPort') || 9002;
  });

  const CLIENT_ID = 'dashboard_' + Math.random().toString(16).substr(2, 8);
  const BOARDS = ['board1', 'board2'];

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

  // Handle best angle updates from LiveChart
  const handleBestAngleUpdate = (boardId, bestAngle) => {
    setSystemData((prev) => ({
      ...prev,
      [boardId]: {
        ...prev[boardId],
        bestAngle: bestAngle.angle,
        bestRSSI: bestAngle.rssi,
      },
    }));
    addLog(
      `[${boardId}] Updated best angle: ${bestAngle.angle.toFixed(
        1
      )}°, RSSI: ${bestAngle.rssi.toFixed(1)} dBm`,
      'info'
    );
  };

  const mqttClientRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('mqttHost', brokerHost);
    localStorage.setItem('mqttPort', brokerPort);
  }, [brokerHost, brokerPort]);

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
        brokerHost,
        Number(brokerPort),
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
        `Connecting to MQTT broker at ${brokerHost}:${brokerPort}...`,
        'info'
      );
      mqttClientRef.current.connect(options);
    } catch (error) {
      addLog('MQTT connection error: ' + error.message, 'error');
      setConnecting(false);
    }
  };

  const updateBrokerConfig = (newHost, newPort) => {
    if (isConnected) {
      if (
        !confirm(
          'You are currently connected. Changing the broker config will disconnect you. Continue?'
        )
      ) {
        return false;
      }
      disconnectMQTT();
    }

    if (!newHost || newHost.trim() === '') {
      addLog('Broker host cannot be empty', 'error');
      return false;
    }
    const portNum = parseInt(newPort);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      addLog('Port must be a number between 1 and 65535', 'error');
      return false;
    }

    setBrokerHost(newHost);
    setBrokerPort(portNum);
    addLog(`Updated broker config to ${newHost}:${newPort}`, 'info');
    return true;
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

    const topics = [];
    BOARDS.forEach((boardId) => {
      topics.push(`esp32/${boardId}/status`);
      topics.push(`esp32/${boardId}/lora/data`);
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
    const topicParts = topic.split('/');
    const boardId = topicParts[1];

    if (!BOARDS.includes(boardId)) {
      addLog(`Received message from unknown board: ${boardId}`, 'warning');
      return;
    }

    let payload;
    try {
      // Try to decode as UTF-8 string
      payload = message.payloadString;
    } catch {
      // Fallback to raw bytes
      payload = message.payloadBytes;
    }

    try {
      // If payload is a string, try JSON parse
      if (typeof payload === 'string') {
        const data = JSON.parse(payload);
        handleMQTTMessage(boardId, topic, data);
      } else {
        // Binary payload → handle as Uint8Array
        handleMQTTMessage(boardId, topic, payload);
      }
    } catch {
      // Not JSON, but still valid UTF-8 string
      handleMQTTMessage(boardId, topic, payload);
    }
  };

  const handleMQTTMessage = (boardId, topic, data) => {
    console.log(`[${boardId}] Received from ${topic}:`, data);

    if (topic.includes('/status')) {
      handleStatusMessage(boardId, data);
    } else if (topic.includes('/lora/data') || topic.includes('/data')) {
      handleLoRaData(boardId, data);
    } else if (topic.includes('/angle')) {
      const angleValue = typeof data === 'object' ? data.angle : parseInt(data);
      setSystemData((prev) => ({
        ...prev,
        [boardId]: { ...prev[boardId], angle: angleValue },
      }));
      console.log(`[${boardId}] Angle updated to: ${angleValue}°`);
    } else if (topic.includes('/rotation/complete')) {
      handleRotationComplete(boardId, data);
    } else if (topic.includes('/stored/data')) {
      handleStoredData(boardId, data);
    } else {
      if (
        typeof data === 'object' &&
        (data.rssi !== undefined || data.RSSI !== undefined)
      ) {
        handleLoRaData(boardId, data);
      } else {
        addLog(
          `[${boardId}] Received from ${topic}: ${JSON.stringify(data)}`,
          'info'
        );
      }
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
          lastRSSI: data.rssi || data.RSSI || null,
          lastSNR: data.snr || data.SNR || null,
          lastMessage: data.message || data.msg || '-',
        },
      }));

      const angle = data.angle || data.current_angle || data.servo_angle;
      const rssi = data.rssi || data.RSSI || data.signal_strength;

      if (angle !== undefined && rssi !== undefined) {
        console.log(
          `[${boardId}] Updating chart: Angle ${angle}°, RSSI ${rssi} dBm`
        );
        updateChart(boardId, angle, rssi);
      }

      const bestRSSI =
        data.best_rssi_at_angle || data.best_rssi || data.bestRSSI;
      if (bestRSSI && bestRSSI > systemData[boardId].bestRSSI) {
        setSystemData((prev) => ({
          ...prev,
          [boardId]: {
            ...prev[boardId],
            bestRSSI: bestRSSI,
            bestAngle: angle || prev[boardId].bestAngle,
          },
        }));
      }

      addLog(
        `[${boardId}] ${angle ? `Angle ${angle}°` : ''} | RSSI: ${
          rssi || 'N/A'
        } dBm | SNR: ${data.snr ? data.snr.toFixed(1) : 'N/A'} dB`,
        'data'
      );
    } else {
      addLog(`[${boardId}] Raw data: ${data}`, 'data');
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
    console.log(`Updating chart for ${boardId}: angle=${angle}, rssi=${rssi}`);
    setChartData((prevData) => {
      const prevBoardData = prevData[boardId] || [];
      const existingIndex = prevBoardData.findIndex(
        (point) => point.angle === angle
      );
      let newBoardData;

      if (existingIndex !== -1) {
        newBoardData = [...prevBoardData];
        newBoardData[existingIndex] = { angle, rssi };
        console.log(`Updated existing point at angle ${angle}: ${rssi} dBm`);
      } else {
        newBoardData = [...prevBoardData, { angle, rssi }];
        console.log(`Added new point at angle ${angle}: ${rssi} dBm`);
      }

      const sortedData = newBoardData.sort((a, b) => a.angle - b.angle);
      console.log(`${boardId} chart now has ${sortedData.length} points`);

      return {
        ...prevData,
        [boardId]: sortedData,
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
      return updatedLogs.slice(-100);
    });
  };

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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-800 p-4">
      <div className="max-w-6xl mx-auto bg-gray-800/95 rounded-2xl shadow-xl backdrop-blur-lg overflow-hidden border border-purple-500/30">
        <Header
          isConnected={isConnected}
          connecting={connecting}
          systemData={systemData}
          boards={BOARDS}
        />
        <div className="p-6">
          <SettingsPanel
            brokerHost={brokerHost}
            brokerPort={brokerPort}
            isConnected={isConnected}
            updateBrokerConfig={updateBrokerConfig}
            addLog={addLog}
          />
          <ConnectionControl
            isConnected={isConnected}
            mqttReady={mqttReady}
            connecting={connecting}
            connectMQTT={connectMQTT}
            disconnectMQTT={disconnectMQTT}
          />
          {BOARDS.map((boardId) => (
            <div
              key={boardId}
              className="mb-8 bg-gray-800/80 rounded-xl p-4 shadow-lg border border-purple-500/30 backdrop-blur-sm"
            >
              <h2 className="text-xl font-bold text-purple-300 mb-4 text-center border-b border-purple-500/50 pb-2">
                Board: {boardId.toUpperCase()}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BoardControl
                  boardId={boardId}
                  isConnected={isConnected}
                  systemData={systemData}
                  startTracking={startTracking}
                  stopTracking={stopTracking}
                  resetSystem={resetSystem}
                  toggleLED={toggleLED}
                />
                <LiveChart
                  boardId={boardId}
                  chartData={chartData[boardId]}
                  showDetails={true} // Enable to show detailed parameters if needed
                  onBestAngleUpdate={handleBestAngleUpdate}
                />
              </div>
              <LiveDataDisplay
                boardId={boardId}
                liveData={liveData}
                totalPackets={totalPackets}
              />
            </div>
          ))}
          <SystemLogs logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default App;
