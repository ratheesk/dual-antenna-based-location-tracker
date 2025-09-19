# LoRa Antenna Tracker

Track LoRa signals using two ESP32 devices with rotating antennas.

## What It Does

- One ESP32 sends LoRa signals
- Two ESP32s scan in circles to find the strongest signal
- Web dashboard shows results and calculates distance

## Files

```md
project/
├── index.html # Web dashboard
├── dashboard.css # Styling
├── dashboard.js # Dashboard code
├── transmitter/
│ └── transmitter.ino # Sends LoRa signals
└── receiver/
└── receiver.ino # Receives and tracks signals
```

## Setup

1. Install Arduino libraries: LoRa, ESP32Servo, ArduinoJson
2. Edit WiFi settings in receiver.ino
3. Upload transmitter.ino to one ESP32
4. Upload receiver.ino to other ESP32s
5. Open index.html in web browser

## How to Use

1. Connect power to all ESP32s
2. Open dashboard in browser
3. Enter ESP32 IP addresses
4. Click "Connect" for each device
5. Click "Start Scan"
6. Wait for scanning to complete
7. Enter distance between devices
8. Click "Calculate Distance"

## What Happens

1. Transmitter sends "ping" every 500ms
2. Receivers rotate servo 0-180 degrees
3. At each angle, device measures signal strength
4. Dashboard shows charts of signal vs angle
5. System calculates distance using triangulation

## Common Problems

- "LoRa init failed" - Check wiring
- "WiFi disconnected" - Check WiFi password
- "No signal" - Make sure transmitter is on
- Dashboard won't connect - Check IP address

## Settings You Can Change

In receiver.ino:

- `MAX_WAIT_TIME = 5000` - How long to wait for signal
- `SERVO_STEP = 1` - Degrees to move each step
- WiFi name and password
