import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header.jsx';
import ConnectionControl from './components/ConnectionControl.jsx';
import BoardControl from './components/BoardControl.jsx';
import LiveChart from './components/LiveChart.jsx';
import LiveDataDisplay from './components/LiveDataDisplay.jsx';
// import SystemLogs from './components/SystemLogs.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import TriangulationCalculator from './components/TriangulationCalculator.jsx';

const App = () => {
  const [brokerHost, setBrokerHost] = useState(() => {
    return localStorage.getItem('mqttHost') || '192.168.8.127';
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
  const [finalData, setFinalData] = useState({
    board1: null,
    board2: null,
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
      sourceMaxAngle: -1,
      sourceMaxRSSI: -999,
      peakAngle: -1,
      peakRSSI: -999,
      loraActive: false,
    },
    board2: {
      tracking: false,
      angle: 0,
      sourceMaxAngle: -1,
      sourceMaxRSSI: -999,
      peakAngle: -1,
      peakRSSI: -999,
      loraActive: false,
    },
  });

  const [chartUpdateLocked, setChartUpdateLocked] = useState({
    board1: false,
    board2: false,
  });

  // Performance optimization: Message queue for batch processing
  const messageQueueRef = useRef([]);
  const processingRef = useRef(false);

  const mqttClientRef = useRef(null);

  // Debounced chart update to prevent excessive re-renders
  const chartUpdateTimeoutRef = useRef({});

  // Memoized callback for peak angle updates - store fitted results
  const handlePeakAngleUpdate = useCallback((boardId, peakData) => {
    setSystemData((prev) => ({
      ...prev,
      [boardId]: {
        ...prev[boardId],
        peakAngle: peakData.angle,
        peakRSSI: peakData.rssi,
      },
    }));
    addLog(
      `[${boardId}] Fitted peak: ${peakData.angle.toFixed(
        1
      )}°, Power: ${peakData.rssi.toFixed(1)} dBm`,
      'info'
    );
  }, []);

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

  // PERFORMANCE FIX: Batch process messages to avoid blocking UI
  const processMessageQueue = useCallback(() => {
    if (processingRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    processingRef.current = true;

    // Process messages in batches
    const batchSize = 5;
    const batch = messageQueueRef.current.splice(0, batchSize);

    batch.forEach(({ boardId, topic, data }) => {
      handleMQTTMessageSync(boardId, topic, data);
    });

    processingRef.current = false;

    // Continue processing if more messages are queued
    if (messageQueueRef.current.length > 0) {
      requestAnimationFrame(processMessageQueue);
    }
  }, []);

  // PERFORMANCE FIX: Optimized message handler that queues messages
  const onMessageArrived = useCallback(
    (message) => {
      const topic = message.destinationName;
      const topicParts = topic.split('/');
      const boardId = topicParts[1];

      if (!BOARDS.includes(boardId)) {
        return;
      }

      let payload;
      try {
        payload = message.payloadString;
      } catch {
        payload = message.payloadBytes;
      }

      try {
        const data =
          typeof payload === 'string' ? JSON.parse(payload) : payload;

        // Queue the message for batch processing
        messageQueueRef.current.push({ boardId, topic, data });

        // Start processing if not already running
        if (!processingRef.current) {
          requestAnimationFrame(processMessageQueue);
        }
      } catch {
        // Handle non-JSON string payloads
        messageQueueRef.current.push({ boardId, topic, data: payload });
        if (!processingRef.current) {
          requestAnimationFrame(processMessageQueue);
        }
      }
    },
    [processMessageQueue, BOARDS]
  );

  // Synchronous message handler (renamed from handleMQTTMessage)
  const handleMQTTMessageSync = useCallback((boardId, topic, data) => {
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
    } else if (topic.includes('/rotation/complete')) {
      handleRotationComplete(boardId, data);
    } else if (topic.includes('/stored/data')) {
      handleStoredData(boardId, data);
    } else if (topic.includes('/all/angles')) {
      handleFinalAngleData(boardId, data);
    } else {
      if (
        typeof data === 'object' &&
        (data.rssi !== undefined || data.RSSI !== undefined)
      ) {
        handleLoRaData(boardId, data);
      }
    }
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
      topics.push(`esp32/${boardId}/all/angles`);
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

  const handleStatusMessage = useCallback((boardId, data) => {
    if (typeof data === 'object') {
      setSystemData((prev) => ({
        ...prev,
        [boardId]: {
          ...prev[boardId],
          tracking: data.tracking || false,
          angle: data.angle || 0,
          loraActive: data.lora_active || false,
          sourceMaxRSSI:
            data.current_best_rssi && data.current_best_rssi > -999
              ? data.current_best_rssi
              : prev[boardId].sourceMaxRSSI,
        },
      }));
      addLog(`[${boardId}] Status: ${data.message || 'Status update'}`, 'info');
    }
  }, []);

  // PERFORMANCE FIX: Debounced chart update
  const debouncedUpdateChart = useCallback((boardId, angle, rssi) => {
    // Clear existing timeout for this board
    if (chartUpdateTimeoutRef.current[boardId]) {
      clearTimeout(chartUpdateTimeoutRef.current[boardId]);
    }

    // Set new timeout to batch updates
    chartUpdateTimeoutRef.current[boardId] = setTimeout(() => {
      updateChart(boardId, angle, rssi);
    }, 50); // 50ms debounce
  }, []);

  const handleLoRaData = useCallback(
    (boardId, data) => {
      if (typeof data === 'object') {
        // Batch state updates
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
          // Use debounced update for better performance
          debouncedUpdateChart(boardId, angle, rssi);
        }

        const bestRSSI =
          data.best_rssi_at_angle || data.best_rssi || data.bestRSSI;
        if (bestRSSI && bestRSSI > systemData[boardId]?.sourceMaxRSSI) {
          setSystemData((prev) => ({
            ...prev,
            [boardId]: {
              ...prev[boardId],
              sourceMaxRSSI: bestRSSI,
              sourceMaxAngle: angle || prev[boardId].sourceMaxAngle,
            },
          }));
        }

        // Reduce log frequency for performance
        if (Math.random() < 0.1) {
          // Only log 10% of data messages
          addLog(
            `[${boardId}] ${angle ? `Angle ${angle}°` : ''} | RSSI: ${
              rssi || 'N/A'
            } dBm | SNR: ${data.snr ? data.snr.toFixed(1) : 'N/A'} dB`,
            'data'
          );
        }
      }
    },
    [systemData, debouncedUpdateChart]
  );

  const handleRotationComplete = useCallback((boardId, data) => {
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
  }, []);

  const handleStoredData = useCallback((boardId, data) => {
    if (typeof data === 'object') {
      addLog(
        `[${boardId}] Best angle data: Angle ${data.angle}°, RSSI ${data.rssi} dBm`,
        'info'
      );
    }
  }, []);

  const handleFinalAngleData = useCallback((boardId, data) => {
    if (typeof data === 'object' && data.angles && data.rssi) {
      setFinalData((prev) => ({
        ...prev,
        [boardId]: data,
      }));

      const finalChartData = [];
      for (let i = 0; i < data.angles.length; i++) {
        finalChartData.push({
          angle: data.angles[i],
          rssi: data.rssi[i],
        });
      }

      setChartData((prev) => ({
        ...prev,
        [boardId]: finalChartData.sort((a, b) => a.angle - b.angle),
      }));

      setChartUpdateLocked((prev) => ({
        ...prev,
        [boardId]: true,
      }));

      let bestAngle = -1;
      let bestRSSI = -999;
      for (let i = 0; i < data.rssi.length; i++) {
        if (data.rssi[i] > bestRSSI) {
          bestRSSI = data.rssi[i];
          bestAngle = data.angles[i];
        }
      }

      if (bestAngle >= 0) {
        setSystemData((prev) => ({
          ...prev,
          [boardId]: {
            ...prev[boardId],
            sourceMaxAngle: bestAngle,
            sourceMaxRSSI: bestRSSI,
          },
        }));
      }

      addLog(
        `[${boardId}] Final angle data received: ${data.angles.length} angles with signals`,
        'success'
      );
    }
  }, []);

  const updateChart = useCallback(
    (boardId, angle, rssi) => {
      // Don't add new data points if updates are locked
      if (chartUpdateLocked[boardId]) {
        return;
      }

      setChartData((prevData) => {
        const prevBoardData = prevData[boardId] || [];
        const existingIndex = prevBoardData.findIndex(
          (point) => point.angle === angle
        );
        let newBoardData;

        if (existingIndex !== -1) {
          newBoardData = [...prevBoardData];
          newBoardData[existingIndex] = { angle, rssi };
        } else {
          newBoardData = [...prevBoardData, { angle, rssi }];
        }

        const sortedData = newBoardData.sort((a, b) => a.angle - b.angle);

        // Check if we've reached 180 or 181 degrees after adding the data
        if (angle >= 180) {
          // Lock further updates after this point
          setTimeout(() => {
            setChartUpdateLocked((prev) => ({
              ...prev,
              [boardId]: true,
            }));
            addLog(
              `[${boardId}] Scan complete at ${angle}° - Data collection finished`,
              'info'
            );
          }, 0);
        }

        return {
          ...prevData,
          [boardId]: sortedData,
        };
      });
    },
    [chartUpdateLocked]
  );

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

  // PERFORMANCE FIX: Throttled logging to prevent excessive re-renders
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = {
      id: Date.now() + Math.random(),
      timestamp,
      message,
      type,
    };
    setLogs((prevLogs) => {
      const updatedLogs = [...prevLogs, newLog];
      return updatedLogs.slice(-50); // Reduced from 100 to 50 for better performance
    });
  }, []);

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

    // Clear all timeouts for this board
    if (chartUpdateTimeoutRef.current[boardId]) {
      clearTimeout(chartUpdateTimeoutRef.current[boardId]);
    }

    setChartData((prev) => ({ ...prev, [boardId]: [] }));
    setFinalData((prev) => ({ ...prev, [boardId]: null }));
    setTotalPackets((prev) => ({ ...prev, [boardId]: 0 }));
    setChartUpdateLocked((prev) => ({ ...prev, [boardId]: false }));

    setSystemData((prev) => ({
      ...prev,
      [boardId]: {
        ...prev[boardId],
        sourceMaxAngle: -1,
        sourceMaxRSSI: -999,
        peakAngle: -1,
        peakRSSI: -999,
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
      <div className="max-w-8xl mx-auto bg-gray-800/95 rounded-2xl shadow-xl backdrop-blur-lg overflow-hidden border border-purple-500/30">
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
          {/* <SystemLogs logs={logs} /> */}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {BOARDS.map((boardId) => (
              <div
                key={boardId}
                className=" bg-gray-800/80 rounded-xl p-4 shadow-lg border border-purple-500/30 backdrop-blur-sm"
              >
                <h2 className="text-xl font-bold text-purple-300 mb-4 text-center border-b border-purple-500/50 pb-2">
                  Board: {boardId.toUpperCase()}
                  {chartUpdateLocked[boardId] && (
                    <span className="ml-2 text-sm text-green-400">
                      (Scan Complete - Curve Fitting Available)
                    </span>
                  )}
                </h2>
                {finalData[boardId] && (
                  <div className="mb-4 p-3 bg-green-900/30 border border-green-500/50 rounded-lg">
                    <h3 className="text-green-400 font-semibold mb-2">
                      Final Scan Results:
                    </h3>
                    <p className="text-green-200 text-sm">
                      Detected signals at {finalData[boardId].angles.length}{' '}
                      angles:{' '}
                      {finalData[boardId].angles.map((angle, i) => (
                        <span key={i} className="inline-block mr-2">
                          {angle}°({finalData[boardId].rssi[i]}dBm)
                        </span>
                      ))}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1  gap-4">
                  <BoardControl
                    boardId={boardId}
                    isConnected={isConnected}
                    systemData={systemData}
                    chartUpdateLocked={chartUpdateLocked[boardId]} // Pass lock status
                    startTracking={startTracking}
                    stopTracking={stopTracking}
                    resetSystem={resetSystem}
                    toggleLED={toggleLED}
                  />
                  <LiveChart
                    boardId={boardId}
                    chartData={chartData[boardId]}
                    finalData={finalData[boardId]}
                    isTracking={systemData[boardId].tracking}
                    showDetails={true}
                    onBestAngleUpdate={handlePeakAngleUpdate}
                    // Chart remains interactive, only data updates are controlled
                  />
                </div>
                <LiveDataDisplay
                  boardId={boardId}
                  liveData={liveData}
                  totalPackets={totalPackets}
                />
              </div>
            ))}
          </div>
          <TriangulationCalculator systemData={systemData} />
        </div>
      </div>
    </div>
  );
};

export default App;
