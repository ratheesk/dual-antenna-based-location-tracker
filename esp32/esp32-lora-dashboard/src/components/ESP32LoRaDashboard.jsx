import { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Header Component
const Header = ({ isConnected, connecting, systemData }) => (
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
      🚀 ESP32 LoRa Tracker Dashboard
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
      <span
        className={`px-4 py-2 rounded-full text-sm font-bold ${
          systemData.tracking ? 'bg-orange-500' : 'bg-gray-500'
        }`}
      >
        System: {systemData.tracking ? 'Tracking' : 'Idle'}
      </span>
      <span
        className={`px-4 py-2 rounded-full text-sm font-bold ${
          systemData.loraActive ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        LoRa: {systemData.loraActive ? 'Active' : 'Inactive'}
      </span>
    </div>
  </div>
);

// ControlPanel Component
const ControlPanel = ({
  isConnected,
  connecting,
  systemData,
  connectMQTT,
  disconnectMQTT,
  startTracking,
  stopTracking,
  resetSystem,
  toggleLED,
}) => {
  const progress = Math.round((systemData.angle / 180) * 100);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      <h3 className="text-xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-blue-500">
        🎮 Control Panel
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {!isConnected ? (
          <button
            onClick={connectMQTT}
            disabled={connecting}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg col-span-full"
          >
            {connecting ? '🔄 Connecting...' : '🔌 Connect to MQTT'}
          </button>
        ) : (
          <button
            onClick={disconnectMQTT}
            className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-gray-600 hover:to-gray-700 transform hover:-translate-y-1 transition-all duration-300 shadow-lg col-span-full"
          >
            🔌 Disconnect MQTT
          </button>
        )}

        <button
          onClick={startTracking}
          disabled={!isConnected || systemData.tracking}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
        >
          🚀 Start Tracking
        </button>
        <button
          onClick={stopTracking}
          disabled={!isConnected || !systemData.tracking}
          className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-red-600 hover:to-red-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
        >
          ⏹️ Stop Tracking
        </button>
        <button
          onClick={resetSystem}
          disabled={!isConnected}
          className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-orange-600 hover:to-orange-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
        >
          🔄 Reset System
        </button>
        <button
          onClick={toggleLED}
          disabled={!isConnected}
          className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-4 rounded-xl font-semibold hover:from-gray-600 hover:to-gray-700 transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
        >
          💡 Toggle LED
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Current Angle
          </div>
          <div className="text-xl font-bold text-gray-800">
            {systemData.angle}°
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Progress
          </div>
          <div className="text-xl font-bold text-gray-800">{progress}%</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Best Angle
          </div>
          <div className="text-xl font-bold text-gray-800">
            {systemData.bestAngle >= 0 ? `${systemData.bestAngle}°` : '-'}
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
          <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
            Best RSSI
          </div>
          <div className="text-xl font-bold text-gray-800">
            {systemData.bestRSSI > -999
              ? `${systemData.bestRSSI} dBm`
              : '- dBm'}
          </div>
        </div>
      </div>

      <div className="w-full h-5 bg-gray-200 rounded-full overflow-hidden relative">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300 ease-in-out relative"
          style={{ width: `${progress}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

// LiveChart Component
const LiveChart = ({ chartData }) => {
  const chartDataConfig = {
    labels: chartData.map((point) => point.angle + '°'),
    datasets: [
      {
        label: 'RSSI (dBm)',
        data: chartData.map((point) => point.rssi),
        borderColor: '#2196F3',
        backgroundColor: 'rgba(33, 150, 243, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#2196F3',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Angle (degrees)',
          font: { size: 14, weight: 'bold' },
        },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
      },
      y: {
        title: {
          display: true,
          text: 'RSSI (dBm)',
          font: { size: 14, weight: 'bold' },
        },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
        beginAtZero: false,
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { font: { size: 14, weight: 'bold' } },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: '#2196F3',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
      },
    },
    animation: { duration: 300, easing: 'easeInOutQuart' },
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
      <h3 className="text-xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-blue-500">
        📊 Live RSSI Chart
      </h3>
      <div className="h-80">
        <Line data={chartDataConfig} options={chartOptions} />
      </div>
    </div>
  );
};

// LiveDataSection Component
const LiveDataSection = ({ liveData, totalPackets, logs }) => (
  <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 lg:col-span-2">
    <h3 className="text-xl font-bold text-gray-800 mb-6 pb-3 border-b-2 border-blue-500">
      📡 Live LoRa Data
    </h3>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
          Last RSSI
        </div>
        <div className="text-xl font-bold text-gray-800">
          {liveData.lastRSSI !== null ? `${liveData.lastRSSI} dBm` : '- dBm'}
        </div>
      </div>
      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
          Last SNR
        </div>
        <div className="text-xl font-bold text-gray-800">
          {liveData.lastSNR !== null
            ? `${liveData.lastSNR.toFixed(1)} dB`
            : '- dB'}
        </div>
      </div>
      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
          Packets Received
        </div>
        <div className="text-xl font-bold text-gray-800">{totalPackets}</div>
      </div>
      <div className="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">
          Last Message
        </div>
        <div className="text-lg font-bold text-gray-800 truncate">
          {liveData.lastMessage}
        </div>
      </div>
    </div>

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
);

// Main Dashboard Component
const ESP32LoRaDashboard = () => {
  // MQTT Configuration
  const MQTT_BROKER = '10.214.162.1';
  const MQTT_PORT = 9002;
  const CLIENT_ID = 'dashboard_' + Math.random().toString(16).substr(2, 8);

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [ledState, setLedState] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [totalPackets, setTotalPackets] = useState(0);
  const [logs, setLogs] = useState([]);
  const [liveData, setLiveData] = useState({
    lastRSSI: null,
    lastSNR: null,
    lastMessage: '-',
  });
  const [systemData, setSystemData] = useState({
    tracking: false,
    angle: 0,
    bestAngle: -1,
    bestRSSI: -999,
    loraActive: false,
  });
  const [connecting, setConnecting] = useState(false);
  const mqttClientRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetries = 5;

  // Check for Paho MQTT library
  useEffect(() => {
    if (window.Paho) {
      addLog('MQTT library loaded. Click Connect to start.', 'info');
    } else {
      addLog('Paho MQTT library not loaded. Please check index.html.', 'error');
    }

    // Cleanup on unmount
    return () => {
      if (mqttClientRef.current && isConnected) {
        try {
          mqttClientRef.current.disconnect();
          addLog('Disconnected from MQTT broker during cleanup', 'info');
        } catch (error) {
          console.error('Error disconnecting MQTT:', error);
        }
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

      setConnecting(true);
      mqttClientRef.current = new window.Paho.MQTT.Client(
        MQTT_BROKER,
        MQTT_PORT,
        CLIENT_ID
      );

      mqttClientRef.current.onConnectionLost = onConnectionLost;
      mqttClientRef.current.onMessageArrived = onMessageArrived;

      const options = {
        timeout: 30,
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
        retryCountRef.current = 0;
      } catch (error) {
        addLog('Error disconnecting: ' + error.message, 'error');
      }
    }
  };

  const onConnect = () => {
    addLog('Connected to MQTT broker successfully!', 'info');
    setIsConnected(true);
    setConnecting(false);
    retryCountRef.current = 0;

    const topics = [
      'esp32/status',
      'esp32/lora/data',
      'esp32/angle',
      'esp32/rotation/complete',
      'esp32/stored/data',
    ];

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
      `MQTT connection failed: ${
        error.errorMessage || 'Network error or broker unavailable'
      } (Error Code: ${error.errorCode})`,
      'error'
    );
    setIsConnected(false);
    setConnecting(false);
    if (retryCountRef.current < maxRetries) {
      retryCountRef.current++;
      addLog(
        `Retrying connection (${retryCountRef.current}/${maxRetries})...`,
        'warning'
      );
      setTimeout(connectMQTT, 5000);
    } else {
      addLog('Max retry attempts reached. Please check the broker.', 'error');
    }
  };

  const onConnectionLost = (responseObject) => {
    if (responseObject.errorCode !== 0) {
      addLog(
        `MQTT connection lost: ${responseObject.errorMessage} (Error Code: ${responseObject.errorCode})`,
        'error'
      );
      setIsConnected(false);
      setConnecting(false);
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        addLog(
          `Retrying connection (${retryCountRef.current}/${maxRetries})...`,
          'warning'
        );
        setTimeout(connectMQTT, 5000);
      } else {
        addLog('Max retry attempts reached. Please check the broker.', 'error');
      }
    }
  };

  const onMessageArrived = (message) => {
    const topic = message.destinationName;
    const payload = message.payloadString;

    try {
      const data = JSON.parse(payload);
      handleMQTTMessage(topic, data);
    } catch {
      handleMQTTMessage(topic, payload);
    }
  };

  const handleMQTTMessage = (topic, data) => {
    switch (topic) {
      case 'esp32/status':
        handleStatusMessage(data);
        break;
      case 'esp32/lora/data':
        handleLoRaData(data);
        break;
      case 'esp32/angle':
        setSystemData((prev) => ({ ...prev, angle: parseInt(data) }));
        break;
      case 'esp32/rotation/complete':
        handleRotationComplete(data);
        break;
      case 'esp32/stored/data':
        handleStoredData(data);
        break;
      default:
        addLog(
          `Received message from ${topic}: ${JSON.stringify(data)}`,
          'info'
        );
    }
  };

  const handleStatusMessage = (data) => {
    if (typeof data === 'object') {
      setSystemData((prev) => ({
        ...prev,
        tracking: data.tracking || false,
        angle: data.angle || 0,
        loraActive: data.lora_active || false,
        bestRSSI:
          data.current_best_rssi && data.current_best_rssi > -999
            ? data.current_best_rssi
            : prev.bestRSSI,
      }));
      addLog(`Status: ${data.message || 'Status update'}`, 'info');
    }
  };

  const handleLoRaData = (data) => {
    if (typeof data === 'object') {
      setTotalPackets((prev) => prev + 1);

      setLiveData({
        lastRSSI: data.rssi,
        lastSNR: data.snr,
        lastMessage: data.message || '-',
      });

      if (data.angle !== undefined && data.rssi !== undefined) {
        updateChart(data.angle, data.rssi);
      }

      if (
        data.best_rssi_at_angle &&
        data.best_rssi_at_angle > systemData.bestRSSI
      ) {
        setSystemData((prev) => ({
          ...prev,
          bestRSSI: data.best_rssi_at_angle,
          bestAngle: data.angle,
        }));
      }

      addLog(
        `📦 Angle ${data.angle}° | RSSI: ${
          data.rssi
        } dBm | SNR: ${data.snr?.toFixed(1)} dB`,
        'data'
      );
    }
  };

  const handleRotationComplete = (data) => {
    if (typeof data === 'object') {
      addLog(
        `🎯 Rotation Complete! Best: ${data.best_rssi} dBm at ${data.best_angle}°`,
        'info'
      );
      setSystemData((prev) => ({
        ...prev,
        bestAngle: data.best_angle,
        bestRSSI: data.best_rssi,
        tracking: false,
      }));
    }
  };

  const handleStoredData = (data) => {
    if (typeof data === 'object') {
      addLog(
        `📊 Received stored data chunk: ${data.chunk_start}-${data.chunk_end}`,
        'info'
      );
    }
  };

  const updateChart = (angle, rssi) => {
    setChartData((prevData) => {
      const existingIndex = prevData.findIndex(
        (point) => point.angle === angle
      );
      let newData;

      if (existingIndex !== -1) {
        if (rssi > prevData[existingIndex].rssi) {
          newData = [...prevData];
          newData[existingIndex] = { angle, rssi };
        } else {
          return prevData;
        }
      } else {
        newData = [...prevData, { angle, rssi }];
      }

      return newData.sort((a, b) => a.angle - b.angle);
    });
  };

  const publishMessage = (topic, message) => {
    if (!isConnected || !mqttClientRef.current) {
      addLog('Cannot publish: MQTT not connected', 'error');
      return;
    }

    try {
      const msg = new window.Paho.MQTT.Message(message);
      msg.destinationName = topic;
      mqttClientRef.current.send(msg);
      addLog(`Published to ${topic}: ${message}`, 'info');
    } catch (error) {
      addLog('Failed to publish message: ' + error.message, 'error');
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

  const startTracking = () => {
    if (!isConnected) {
      addLog('Cannot start tracking: MQTT not connected', 'warning');
      return;
    }
    publishMessage('esp32/start', '1');
    addLog('🚀 Starting tracking...', 'info');
  };

  const stopTracking = () => {
    if (!isConnected) {
      addLog('Cannot stop tracking: MQTT not connected', 'warning');
      return;
    }
    publishMessage('esp32/stop', '1');
    addLog('⏹️ Stopping tracking...', 'info');
  };

  const resetSystem = () => {
    if (!isConnected) {
      addLog('Cannot reset: MQTT not connected', 'warning');
      return;
    }
    publishMessage('esp32/reset', '1');
    addLog('🔄 Resetting system...', 'info');
    setChartData([]);
    setTotalPackets(0);
    setSystemData((prev) => ({
      ...prev,
      bestAngle: -1,
      bestRSSI: -999,
      angle: 0,
    }));
    setLiveData({
      lastRSSI: null,
      lastSNR: null,
      lastMessage: '-',
    });
  };

  const toggleLED = () => {
    if (!isConnected) {
      addLog('Cannot toggle LED: MQTT not connected', 'warning');
      return;
    }
    const newLedState = !ledState;
    setLedState(newLedState);
    publishMessage('esp32/led', newLedState ? 'ON' : 'OFF');
    addLog(`💡 LED turned ${newLedState ? 'ON' : 'OFF'}`, 'info');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-5">
      <div className="max-w-7xl mx-auto bg-white/95 rounded-3xl shadow-2xl backdrop-blur-lg overflow-hidden">
        <Header
          isConnected={isConnected}
          connecting={connecting}
          systemData={systemData}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-8">
          <ControlPanel
            isConnected={isConnected}
            connecting={connecting}
            systemData={systemData}
            connectMQTT={connectMQTT}
            disconnectMQTT={disconnectMQTT}
            startTracking={startTracking}
            stopTracking={stopTracking}
            resetSystem={resetSystem}
            toggleLED={toggleLED}
          />
          <LiveChart chartData={chartData} />
          <LiveDataSection
            liveData={liveData}
            totalPackets={totalPackets}
            logs={logs}
          />
        </div>
      </div>
    </div>
  );
};

export default ESP32LoRaDashboard;
