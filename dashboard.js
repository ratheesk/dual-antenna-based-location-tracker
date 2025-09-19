// Device management object to handle multiple ESP32s
const devices = {
  1: {
    ip: '',
    connected: false,
    chartCanvas: null,
    chartContext: null,
    rssiData: [],
    lastStatusUpdate: null,
  },
  2: {
    ip: '',
    connected: false,
    chartCanvas: null,
    chartContext: null,
    rssiData: [],
    lastStatusUpdate: null,
  },
};

// Initialize charts for both devices
function initChart(deviceId) {
  const device = devices[deviceId];
  device.chartCanvas = document.getElementById(`rssiChart${deviceId}`);
  device.chartContext = device.chartCanvas.getContext('2d');
  clearChart(deviceId);

  // Add mouse interaction
  device.chartCanvas.addEventListener('mousemove', (event) =>
    handleChartHover(event, deviceId)
  );
  device.chartCanvas.addEventListener('mouseleave', () =>
    hideTooltip(deviceId)
  );
}

function handleChartHover(event, deviceId) {
  const device = devices[deviceId];
  if (!device.chartCanvas.chartData) return;

  const rect = device.chartCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Find closest data point
  let closestPoint = null;
  let minDistance = Infinity;

  for (const point of device.chartCanvas.chartData) {
    const pointX = (point.angle / 180) * device.chartCanvas.width;
    const pointY =
      device.chartCanvas.height -
      ((point.rssi - device.chartCanvas.minRSSI) /
        device.chartCanvas.rssiRange) *
        device.chartCanvas.height;

    const distance = Math.sqrt(
      Math.pow(x - pointX, 2) + Math.pow(y - pointY, 2)
    );

    if (distance < minDistance && distance < 20) {
      minDistance = distance;
      closestPoint = point;
    }
  }

  if (closestPoint) {
    showTooltip(event, closestPoint, deviceId);
  } else {
    hideTooltip(deviceId);
  }
}

function showTooltip(event, point, deviceId) {
  const tooltip = document.getElementById(`chartTooltip${deviceId}`);
  tooltip.innerHTML = `Angle: ${point.angle}°<br>RSSI: ${point.rssi} dBm`;
  tooltip.style.opacity = '1';
  tooltip.style.left = event.clientX + 10 + 'px';
  tooltip.style.top = event.clientY - 10 + 'px';
}

function hideTooltip(deviceId) {
  const tooltip = document.getElementById(`chartTooltip${deviceId}`);
  tooltip.style.opacity = '0';
}

function clearChart(deviceId) {
  const device = devices[deviceId];
  if (!device.chartContext) return;

  const canvas = device.chartCanvas;
  const ctx = device.chartContext;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;

  // Vertical grid lines (every 20 degrees)
  for (let i = 0; i <= 9; i++) {
    const x = (i * canvas.width) / 9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Horizontal grid lines
  for (let i = 0; i <= 10; i++) {
    const y = (i * canvas.height) / 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Angle labels (bottom)
  ctx.fillStyle = '#888';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 9; i++) {
    const x = (i * canvas.width) / 9;
    const angle = i * 20;
    ctx.fillText(angle + '°', x, canvas.height - 5);
  }

  // RSSI label (left side)
  ctx.save();
  ctx.translate(15, canvas.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('RSSI (dBm)', 0, 0);
  ctx.restore();
}

function updateChart(data, deviceId) {
  const device = devices[deviceId];
  if (!device.chartContext) return;

  // Get results data from ESP32 if scan is complete
  if (data.complete) {
    fetchAndDisplayResults(deviceId);
    return;
  }

  // For ongoing tracking, we'll need to periodically fetch data
  if (data.tracking || data.collecting) {
    fetchCurrentData(deviceId);
  }
}

function fetchAndDisplayResults(deviceId) {
  const device = devices[deviceId];
  fetch(`http://${device.ip}/api/results`)
    .then((response) => response.json())
    .then((data) => {
      if (data.validReadings && data.validReadings.length > 0) {
        device.rssiData = data.validReadings;
        drawChart(device.rssiData, deviceId);
        document.getElementById(`chartPlaceholder${deviceId}`).style.display =
          'none';
        addLog(
          `Device ${deviceId}: Chart updated with ${data.validReadings.length} data points`,
          'success'
        );
      } else {
        addLog(
          `Device ${deviceId}: No valid RSSI data found for chart`,
          'warning'
        );
      }
    })
    .catch((error) => {
      console.log(`Device ${deviceId} results fetch error:`, error);
      addLog(`Device ${deviceId}: Failed to fetch chart data`, 'error');
    });
}

function fetchCurrentData(deviceId) {
  const device = devices[deviceId];
  fetch(`http://${device.ip}/api/data`)
    .then((response) => response.json())
    .then((data) => {
      // This endpoint returns current tracking progress
      // We can use this to show partial chart updates if needed
    })
    .catch((error) => {
      console.log(`Device ${deviceId} data fetch error:`, error);
    });
}

function drawChart(validData, deviceId) {
  const device = devices[deviceId];
  if (!device.chartContext || !validData || validData.length === 0) return;

  clearChart(deviceId);

  const canvas = device.chartCanvas;
  const ctx = device.chartContext;

  // Find min/max for scaling
  const rssiValues = validData.map((d) => d.rssi);
  const minRSSI = Math.min(...rssiValues);
  const maxRSSI = Math.max(...rssiValues);
  const rssiRange = maxRSSI - minRSSI || 1;

  // Draw RSSI scale on left axis
  ctx.fillStyle = '#888';
  ctx.font = '10px Arial';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 5; i++) {
    const rssi = minRSSI + (i * rssiRange) / 5;
    const y = canvas.height - (i * canvas.height) / 5;
    ctx.fillText(Math.round(rssi), 30, y + 3);
  }

  // Draw RSSI line
  ctx.strokeStyle = '#667eea';
  ctx.lineWidth = 2;
  ctx.beginPath();

  let firstPoint = true;
  for (const point of validData) {
    const x = (point.angle / 180) * canvas.width;
    const y =
      canvas.height - ((point.rssi - minRSSI) / rssiRange) * canvas.height;

    if (firstPoint) {
      ctx.moveTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // Draw points
  ctx.fillStyle = '#764ba2';
  for (const point of validData) {
    const x = (point.angle / 180) * canvas.width;
    const y =
      canvas.height - ((point.rssi - minRSSI) / rssiRange) * canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Store data for tooltip
  canvas.chartData = validData;
  canvas.minRSSI = minRSSI;
  canvas.rssiRange = rssiRange;
}

function connectToESP32(deviceId) {
  const device = devices[deviceId];
  device.ip = document.getElementById(`esp32IP${deviceId}`).value.trim();

  if (!device.ip) {
    alert(`Please enter ESP32 IP address for Device ${deviceId}`);
    return;
  }

  updateConnectionStatus('connecting', deviceId);
  addLog(`Device ${deviceId}: Connecting to ESP32 at ${device.ip}...`);

  // Test connection
  fetch(`http://${device.ip}/`, { method: 'GET' })
    .then((response) => {
      if (response.ok) {
        updateConnectionStatus('connected', deviceId);
        addLog(
          `Device ${deviceId}: Connected to ESP32 successfully!`,
          'success'
        );
        device.connected = true;
        updateButtons(deviceId);
        startStatusUpdates(deviceId);
      } else {
        throw new Error('Invalid response');
      }
    })
    .catch((error) => {
      updateConnectionStatus('disconnected', deviceId);
      addLog(
        `Device ${deviceId}: Connection failed: ${error.message}`,
        'error'
      );
      device.connected = false;
      updateButtons(deviceId);
      stopStatusUpdates(deviceId);
    });
}

function startStatusUpdates(deviceId) {
  // Initial status fetch only
  fetchStatus(deviceId);
}

function stopStatusUpdates(deviceId) {
  // No intervals to clear since we removed automatic polling
}

function refreshStatus(deviceId) {
  const device = devices[deviceId];
  if (!device.connected) return;

  addLog(`Device ${deviceId}: Refreshing status...`, 'info');
  fetchStatus(deviceId);
}

function fetchStatus(deviceId) {
  const device = devices[deviceId];

  fetch(`http://${device.ip}/api/status`)
    .then((response) => response.json())
    .then((data) => {
      updateStatus(data, deviceId);

      // If scan is complete, also fetch and plot the results
      if (data.complete) {
        fetchAndDisplayResults(deviceId);
      }

      // Check for status changes
      const currentStatusString = JSON.stringify(data);
      if (device.lastStatusUpdate !== currentStatusString) {
        if (data.status === 'tracking') {
          addLog(
            `Device ${deviceId}: Scanning angle ${data.currentAngle}°...`,
            'info'
          );
        } else if (
          data.complete &&
          device.lastStatusUpdate &&
          !JSON.parse(device.lastStatusUpdate).complete
        ) {
          addLog(
            `Device ${deviceId}: Scan complete! Best angle: ${data.bestAngle}°, Best RSSI: ${data.bestRSSI} dBm`,
            'success'
          );
        }
        device.lastStatusUpdate = currentStatusString;
      }
    })
    .catch((error) => {
      console.log(`Device ${deviceId} status fetch error:`, error);
      if (error.message.includes('Failed to fetch')) {
        updateConnectionStatus('disconnected', deviceId);
        device.connected = false;
        updateButtons(deviceId);
        stopStatusUpdates(deviceId);
        addLog(`Device ${deviceId}: Connection lost to ESP32`, 'error');
      }
    });
}

function updateConnectionStatus(status, deviceId) {
  const statusEl = document.getElementById(`connectionStatus${deviceId}`);

  // Remove existing classes
  statusEl.className = 'badge';

  switch (status) {
    case 'connected':
      statusEl.classList.add('bg-success');
      statusEl.textContent = 'Connected';
      break;
    case 'connecting':
      statusEl.classList.add('bg-warning');
      statusEl.textContent = 'Connecting...';
      break;
    case 'disconnected':
      statusEl.classList.add('bg-danger');
      statusEl.textContent = 'Disconnected';
      break;
  }
}

function updateStatus(data, deviceId) {
  // Update system status - handle tracking vs collecting properly
  let displayStatus = data.status;
  if (data.tracking || data.collecting) {
    displayStatus = 'scanning';
  } else if (data.complete) {
    displayStatus = 'complete';
  }

  document.getElementById(`systemStatus${deviceId}`).textContent =
    displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1);
  document.getElementById(`currentAngle${deviceId}`).textContent =
    data.currentAngle + '°';

  // Update LoRa and WiFi status
  const loraStatusEl = document.getElementById(`loraStatus${deviceId}`);
  loraStatusEl.textContent = data.loraActive ? 'Active' : 'Inactive';
  loraStatusEl.style.color = data.loraActive ? '#4CAF50' : '#f44336';

  const wifiStatusEl = document.getElementById(`wifiStatus${deviceId}`);
  wifiStatusEl.textContent = data.wifiConnected ? 'Connected' : 'Disconnected';
  wifiStatusEl.style.color = data.wifiConnected ? '#4CAF50' : '#f44336';

  // Update best results
  if (data.bestAngle >= 0) {
    document.getElementById(`bestAngle${deviceId}`).textContent =
      data.bestAngle + '°';
    document.getElementById(`bestRSSI${deviceId}`).textContent =
      data.bestRSSI + ' dBm';
  }

  updateButtons(deviceId);
}

function updateButtons(deviceId) {
  const device = devices[deviceId];
  const startBtn = document.getElementById(`startBtn${deviceId}`);
  const stopBtn = document.getElementById(`stopBtn${deviceId}`);
  const resetBtn = document.getElementById(`resetBtn${deviceId}`);
  const statusBtn = document.getElementById(`statusBtn${deviceId}`);

  const status = document
    .getElementById(`systemStatus${deviceId}`)
    .textContent.toLowerCase();

  startBtn.disabled = !device.connected || status === 'scanning';
  stopBtn.disabled = !device.connected || status !== 'scanning';
  resetBtn.disabled = !device.connected;
  statusBtn.disabled = !device.connected;
}

function startTracking(deviceId) {
  const device = devices[deviceId];
  if (!device.connected) return;

  fetch(`http://${device.ip}/api/start`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        addLog(`Device ${deviceId}: Tracking started!`, 'success');
        device.rssiData = [];
        clearChart(deviceId);
        document.getElementById(`chartPlaceholder${deviceId}`).textContent =
          'Scanning in progress...';
        document.getElementById(`chartPlaceholder${deviceId}`).style.display =
          'flex';
      } else {
        addLog(
          `Device ${deviceId}: Failed to start tracking: ${data.message}`,
          'error'
        );
      }
    })
    .catch((error) =>
      addLog(`Device ${deviceId}: Error: ${error.message}`, 'error')
    );
}

function stopTracking(deviceId) {
  const device = devices[deviceId];
  if (!device.connected) return;

  fetch(`http://${device.ip}/api/stop`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      addLog(`Device ${deviceId}: Tracking stopped`, 'warning');
    })
    .catch((error) =>
      addLog(`Device ${deviceId}: Error: ${error.message}`, 'error')
    );
}

function resetSystem(deviceId) {
  const device = devices[deviceId];
  if (!device.connected) return;

  fetch(`http://${device.ip}/api/reset`, { method: 'POST' })
    .then((response) => response.json())
    .then((data) => {
      addLog(`Device ${deviceId}: System reset`, 'info');
      device.rssiData = [];
      clearChart(deviceId);
      document.getElementById(`chartPlaceholder${deviceId}`).textContent =
        'Connect and start scanning to see RSSI data';
      document.getElementById(`chartPlaceholder${deviceId}`).style.display =
        'flex';
      // Reset displayed values
      document.getElementById(`bestAngle${deviceId}`).textContent = '-';
      document.getElementById(`bestRSSI${deviceId}`).textContent = '- dBm';
    })
    .catch((error) =>
      addLog(`Device ${deviceId}: Error: ${error.message}`, 'error')
    );
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
        <span class="timestamp" style="color: #888;">[${timestamp}]</span> 
        <span style="color: ${color}">${message}</span>
    `;

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;

  // Keep only last 100 entries
  while (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

// Distance calculation function
function calculateDistance(d, theta1, theta2) {
  // Convert degrees to radians
  const theta1Rad = theta1 * (Math.PI / 180.0);
  const theta2Rad = theta2 * (Math.PI / 180.0);

  // Calculate the distance using the provided formula
  // Note: This formula appears to have some mathematical issues with the trigonometry
  // The (180 - theta2) terms will give negative angles, which may not be intended
  const denominator =
    Math.cos(theta1Rad) +
    Math.sin(theta1Rad) /
      (Math.sin(Math.PI - theta2Rad) * Math.cos(Math.PI - theta2Rad));

  if (Math.abs(denominator) < 0.0001) {
    return null; // Avoid division by zero
  }

  return d / denominator;
}

function performDistanceCalculation() {
  const d = parseFloat(document.getElementById('baselineDistance').value);
  const device1BestAngle = devices[1].connected
    ? parseInt(
        document.getElementById('bestAngle1').textContent.replace('°', '')
      )
    : null;
  const device2BestAngle = devices[2].connected
    ? parseInt(
        document.getElementById('bestAngle2').textContent.replace('°', '')
      )
    : null;

  // Validation
  if (isNaN(d) || d <= 0) {
    document.getElementById('distanceResult').innerHTML =
      '<div class="alert alert-danger">Please enter a valid baseline distance (d > 0)</div>';
    return;
  }

  if (
    !device1BestAngle ||
    device1BestAngle === '-' ||
    !device2BestAngle ||
    device2BestAngle === '-'
  ) {
    document.getElementById('distanceResult').innerHTML =
      '<div class="alert alert-warning">Both devices must complete scanning to calculate distance</div>';
    return;
  }

  if (isNaN(device1BestAngle) || isNaN(device2BestAngle)) {
    document.getElementById('distanceResult').innerHTML =
      '<div class="alert alert-warning">Invalid angle data from devices</div>';
    return;
  }

  // Calculate distance
  const distance = calculateDistance(d, device1BestAngle, device2BestAngle);

  if (distance === null) {
    document.getElementById('distanceResult').innerHTML =
      '<div class="alert alert-danger">Mathematical error: Division by zero in calculation</div>';
    return;
  }

  if (!isFinite(distance)) {
    document.getElementById('distanceResult').innerHTML =
      '<div class="alert alert-danger">Mathematical error: Invalid result</div>';
    return;
  }

  // Display result
  document.getElementById('distanceResult').innerHTML = `
     <div class="alert alert-success" style="background-color: #1a4d3a; border-color: #4CAF50; color: #ffffff;">
            <h6 class="mb-2" style="color: #ffffff;">Distance Calculation Result:</h6>
            <div class="row text-center">
                <div class="col-4">
                    <div class="fw-bold" style="color: #aaa;">Device 1 Angle</div>
                    <div style="color: #ffffff;">${device1BestAngle}°</div>
                </div>
                <div class="col-4">
                    <div class="fw-bold" style="color: #aaa;">Device 2 Angle</div>
                    <div style="color: #ffffff;">${device2BestAngle}°</div>
                </div>
                <div class="col-4">
                    <div class="fw-bold" style="color: #aaa;">Calculated Distance</div>
                    <div class="fw-bold" style="color: #4CAF50; font-size: 1.1rem;">${distance.toFixed(
                      2
                    )} units</div>
                </div>
            </div>
        </div>
        `;

  addLog(
    `Distance calculated: ${distance.toFixed(
      2
    )} units (using angles ${device1BestAngle}° and ${device2BestAngle}°)`,
    'success'
  );
}

// Initialize
document.addEventListener('DOMContentLoaded', function () {
  // Initialize charts for both devices
  initChart(1);
  initChart(2);

  // Update buttons for both devices
  updateButtons(1);
  updateButtons(2);

  addLog(
    'Dashboard ready. Enter ESP32 IP addresses and click Connect for each device.'
  );
});

// Cleanup on page unload
window.addEventListener('beforeunload', function () {
  stopStatusUpdates(1);
  stopStatusUpdates(2);
});
