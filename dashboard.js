let esp32IP = '';
let connected = false;
let chartCanvas = null;
let chartContext = null;
let updateInterval = null;
let rssiData = [];
let lastStatusUpdate = null;

// Initialize chart
function initChart() {
  chartCanvas = document.getElementById('rssiChart');
  chartContext = chartCanvas.getContext('2d');
  clearChart();

  // Add mouse interaction
  chartCanvas.addEventListener('mousemove', handleChartHover);
  chartCanvas.addEventListener('mouseleave', hideTooltip);
}

function handleChartHover(event) {
  if (!chartCanvas.chartData) return;

  const rect = chartCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Find closest data point
  let closestPoint = null;
  let minDistance = Infinity;

  for (const point of chartCanvas.chartData) {
    const pointX = (point.angle / 180) * chartCanvas.width;
    const pointY =
      chartCanvas.height -
      ((point.rssi - chartCanvas.minRSSI) / chartCanvas.rssiRange) *
        chartCanvas.height;

    const distance = Math.sqrt(
      Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2)
    );

    if (distance < minDistance && distance < 20) {
      // 20px threshold
      minDistance = distance;
      closestPoint = point;
    }
  }

  if (closestPoint) {
    showTooltip(event, closestPoint);
  } else {
    hideTooltip();
  }
}

function showTooltip(event, point) {
  const tooltip = document.getElementById('chartTooltip');
  tooltip.innerHTML = `Angle: ${point.angle}°<br>RSSI: ${point.rssi} dBm`;
  tooltip.style.opacity = '1';
  tooltip.style.left = event.clientX + 10 + 'px';
  tooltip.style.top = event.clientY - 10 + 'px';
}

function hideTooltip() {
  const tooltip = document.getElementById('chartTooltip');
  tooltip.style.opacity = '0';
}

function clearChart() {
  if (!chartContext) return;

  chartContext.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

  // Draw grid
  chartContext.strokeStyle = '#e0e0e0';
  chartContext.lineWidth = 1;

  // Vertical grid lines (every 20 degrees)
  for (let i = 0; i <= 9; i++) {
    const x = (i * chartCanvas.width) / 9;
    chartContext.beginPath();
    chartContext.moveTo(x, 0);
    chartContext.lineTo(x, chartCanvas.height);
    chartContext.stroke();
  }

  // Horizontal grid lines
  for (let i = 0; i <= 10; i++) {
    const y = (i * chartCanvas.height) / 10;
    chartContext.beginPath();
    chartContext.moveTo(0, y);
    chartContext.lineTo(chartCanvas.width, y);
    chartContext.stroke();
  }

  // Angle labels (bottom)
  chartContext.fillStyle = '#666';
  chartContext.font = '10px Arial';
  chartContext.textAlign = 'center';
  for (let i = 0; i <= 9; i++) {
    const x = (i * chartCanvas.width) / 9;
    const angle = i * 20;
    chartContext.fillText(angle + '°', x, chartCanvas.height - 5);
  }

  // RSSI label (left side)
  chartContext.save();
  chartContext.translate(15, chartCanvas.height / 2);
  chartContext.rotate(-Math.PI / 2);
  chartContext.textAlign = 'center';
  chartContext.fillText('RSSI (dBm)', 0, 0);
  chartContext.restore();
}

function updateChart(data) {
  if (!chartContext) return;

  // Get results data from ESP32 if scan is complete
  if (data.complete) {
    fetchAndDisplayResults();
    return;
  }

  // For ongoing tracking, we'll need to periodically fetch data
  if (data.tracking || data.collecting) {
    fetchCurrentData();
  }
}

function fetchAndDisplayResults() {
  fetch(`http://${esp32IP}/api/results`)
    .then((response) => response.json())
    .then((data) => {
      if (data.validReadings && data.validReadings.length > 0) {
        rssiData = data.validReadings;
        drawChart(rssiData);
        document.getElementById('chartPlaceholder').style.display = 'none';
        addLog(
          `Chart updated with ${data.validReadings.length} data points`,
          'success'
        );
      } else {
        addLog('No valid RSSI data found for chart', 'warning');
      }
    })
    .catch((error) => {
      console.log('Results fetch error:', error);
      addLog('Failed to fetch chart data', 'error');
    });
}

function fetchCurrentData() {
  fetch(`http://${esp32IP}/api/data`)
    .then((response) => response.json())
    .then((data) => {
      // This endpoint returns current tracking progress
      // We can use this to show partial chart updates if needed
    })
    .catch((error) => {
      console.log('Data fetch error:', error);
    });
}

function drawChart(validData) {
  if (!chartContext || !validData || validData.length === 0) return;

  clearChart();

  // Find min/max for scaling
  const rssiValues = validData.map((d) => d.rssi);
  const minRSSI = Math.min(...rssiValues);
  const maxRSSI = Math.max(...rssiValues);
  const rssiRange = maxRSSI - minRSSI || 1;

  // Draw RSSI scale on left axis
  chartContext.fillStyle = '#666';
  chartContext.font = '10px Arial';
  chartContext.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const rssi = minRSSI + (i * rssiRange) / 5;
    const y = chartCanvas.height - (i * chartCanvas.height) / 5;
    chartContext.fillText(Math.round(rssi), 30, y + 3);
  }

  // Draw RSSI line
  chartContext.strokeStyle = '#667eea';
  chartContext.lineWidth = 2;
  chartContext.beginPath();

  let firstPoint = true;
  for (const point of validData) {
    const x = (point.angle / 180) * chartCanvas.width;
    const y =
      chartCanvas.height -
      ((point.rssi - minRSSI) / rssiRange) * chartCanvas.height;

    if (firstPoint) {
      chartContext.moveTo(x, y);
      firstPoint = false;
    } else {
      chartContext.lineTo(x, y);
    }
  }
  chartContext.stroke();

  // Draw points
  chartContext.fillStyle = '#764ba2';
  for (const point of validData) {
    const x = (point.angle / 180) * chartCanvas.width;
    const y =
      chartCanvas.height -
      ((point.rssi - minRSSI) / rssiRange) * chartCanvas.height;

    chartContext.beginPath();
    chartContext.arc(x, y, 4, 0, 2 * Math.PI);
    chartContext.fill();
  }

  // Store data for tooltip
  chartCanvas.chartData = validData;
  chartCanvas.minRSSI = minRSSI;
  chartCanvas.rssiRange = rssiRange;
}

function connectToESP32() {
  esp32IP = document.getElementById('esp32IP').value.trim();
  if (!esp32IP) {
    alert('Please enter ESP32 IP address');
    return;
  }

  updateConnectionStatus('connecting');
  addLog('Connecting to ESP32 at ' + esp32IP + '...');

  // Test connection
  fetch(`http://${esp32IP}/`, { method: 'GET', timeout: 5000 })
    .then((response) => {
      if (response.ok) {
        updateConnectionStatus('connected');
        addLog('Connected to ESP32 successfully!', 'success');
        connected = true;
        updateButtons();
        startStatusUpdates();
      } else {
        throw new Error('Invalid response');
      }
    })
    .catch((error) => {
      updateConnectionStatus('disconnected');
      addLog('Connection failed: ' + error.message, 'error');
      connected = false;
      updateButtons();
      stopStatusUpdates();
    });
}

function startStatusUpdates() {
  // Remove automatic polling - user will manually refresh status
  // Initial status fetch only
  fetchStatus();
}

function stopStatusUpdates() {
  // No intervals to clear since we removed automatic polling
}

function refreshStatus() {
  if (!connected) return;

  addLog('Refreshing status...', 'info');
  fetchStatus();
}

function fetchStatus() {
  const indicator = document.getElementById('updateIndicator');
  indicator.classList.add('active');

  fetch(`http://${esp32IP}/api/status`)
    .then((response) => response.json())
    .then((data) => {
      updateStatus(data);

      // If scan is complete, also fetch and plot the results
      if (data.complete) {
        fetchAndDisplayResults();
      }

      // Check for status changes
      const currentStatusString = JSON.stringify(data);
      if (lastStatusUpdate !== currentStatusString) {
        if (data.status === 'tracking') {
          addLog(`Scanning angle ${data.currentAngle}°...`, 'info');
        } else if (
          data.complete &&
          lastStatusUpdate &&
          !JSON.parse(lastStatusUpdate).complete
        ) {
          addLog(
            `Scan complete! Best angle: ${data.bestAngle}°, Best RSSI: ${data.bestRSSI} dBm`,
            'success'
          );
        }
        lastStatusUpdate = currentStatusString;
      }

      setTimeout(() => {
        indicator.classList.remove('active');
      }, 200);
    })
    .catch((error) => {
      console.log('Status fetch error:', error);
      if (error.message.includes('Failed to fetch')) {
        updateConnectionStatus('disconnected');
        connected = false;
        updateButtons();
        stopStatusUpdates();
        addLog('Connection lost to ESP32', 'error');
      }
      indicator.classList.remove('active');
    });
}

function updateConnectionStatus(status) {
  const statusEl = document.getElementById('connectionStatus');
  statusEl.className = 'connection-status ' + status;

  switch (status) {
    case 'connected':
      statusEl.textContent = 'Connected';
      break;
    case 'connecting':
      statusEl.textContent = 'Connecting...';
      statusEl.classList.add('pulse');
      break;
    case 'disconnected':
      statusEl.textContent = 'Disconnected';
      statusEl.classList.remove('pulse');
      break;
  }
}

function updateStatus(data) {
  // Update system status - handle tracking vs collecting properly
  let displayStatus = data.status;
  if (data.tracking || data.collecting) {
    displayStatus = 'scanning';
  } else if (data.complete) {
    displayStatus = 'complete';
  }

  document.getElementById('systemStatus').textContent =
    displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
  document.getElementById('currentAngle').textContent = data.currentAngle + '°';

  // Update LoRa and WiFi status
  document.getElementById('loraStatus').textContent = data.loraActive
    ? 'Active'
    : 'Inactive';
  document.getElementById('loraStatus').style.color = data.loraActive
    ? '#4CAF50'
    : '#f44336';

  document.getElementById('wifiStatus').textContent = data.wifiConnected
    ? 'Connected'
    : 'Disconnected';
  document.getElementById('wifiStatus').style.color = data.wifiConnected
    ? '#4CAF50'
    : '#f44336';

  // Update best results
  if (data.bestAngle >= 0) {
    document.getElementById('bestAngle').textContent = data.bestAngle + '°';
    document.getElementById('bestRSSI').textContent = data.bestRSSI + ' dBm';
  }

  updateProgress(data.progress, data.maxAngle);
  updateButtons();

  // Update servo slider to match current angle
  document.getElementById('angleSlider').value = data.currentAngle;
  document.getElementById('angleDisplay').textContent = data.currentAngle + '°';
}

function updateProgress(current, max) {
  const percentage = (current / max) * 100;
  document.getElementById('progressFill').style.width = percentage + '%';
  document.getElementById('progressText').textContent = current + ' / ' + max;
}

function updateButtons() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resetBtn = document.getElementById('resetBtn');
  const statusBtn = document.getElementById('statusBtn');

  const status = document
    .getElementById('systemStatus')
    .textContent.toLowerCase();

  startBtn.disabled = !connected || status === 'tracking';
  stopBtn.disabled = !connected || status !== 'tracking';
  resetBtn.disabled = !connected;
  statusBtn.disabled = !connected;
}

function startTracking() {
  if (!connected) return;

  fetch(`http://${esp32IP}/api/start`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        addLog('Tracking started!', 'success');
        // Show instructions
        document.getElementById('instructions').style.display = 'block';
        rssiData = [];
        clearChart();
        document.getElementById('chartPlaceholder').textContent =
          'Scanning in progress...';
        document.getElementById('chartPlaceholder').style.display = 'flex';
      } else {
        addLog('Failed to start tracking: ' + data.message, 'error');
      }
    })
    .catch((error) => addLog('Error: ' + error.message, 'error'));
}

function stopTracking() {
  if (!connected) return;

  fetch(`http://${esp32IP}/api/stop`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      addLog('Tracking stopped', 'warning');
    })
    .catch((error) => addLog('Error: ' + error.message, 'error'));
}

function resetSystem() {
  if (!connected) return;

  fetch(`http://${esp32IP}/api/reset`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      addLog('System reset', 'info');
      rssiData = [];
      clearChart();
      document.getElementById('chartPlaceholder').textContent =
        'Connect to ESP32 and start scanning to see RSSI data';
      document.getElementById('chartPlaceholder').style.display = 'flex';
      // Reset displayed values
      document.getElementById('bestAngle').textContent = '-';
      document.getElementById('bestRSSI').textContent = '- dBm';
    })
    .catch((error) => addLog('Error: ' + error.message, 'error'));
}

function updateAngleDisplay() {
  const angle = document.getElementById('angleSlider').value;
  document.getElementById('angleDisplay').textContent = angle + '°';
}

function moveServo() {
  if (!connected) return;

  const angle = parseInt(document.getElementById('angleSlider').value);

  fetch(`http://${esp32IP}/api/servo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ angle: angle }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        addLog(`Servo moved to ${angle}°`, 'info');
      } else {
        addLog('Servo move failed: ' + data.message, 'error');
      }
    })
    .catch((error) => addLog('Error: ' + error.message, 'error'));
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';

  const timestamp = new Date().toLocaleTimeString();

  let color = '#fff';
  switch (type) {
    case 'success':
      color = '#4CAF50';
      break;
    case 'error':
      color = '#f44336';
      break;
    case 'warning':
      color = '#FF9800';
      break;
    case 'info':
      color = '#2196F3';
      break;
  }

  logEntry.innerHTML = `
                <span class="timestamp">${timestamp}</span> 
                <span style="color: ${color}">${message}</span>
            `;

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
  initChart();
  updateButtons();
  addLog('Dashboard ready. Enter ESP32 IP and click Connect.');
});

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
  stopStatusUpdates();
});
