# Mosquitto MQTT Broker Setup with ESP32 on Windows

This guide will help you set up a Mosquitto MQTT broker on Windows and connect it with an ESP32 device for IoT communication.

## Prerequisites

- Windows 10/11
- ESP32 development board
- Arduino IDE or PlatformIO
- WiFi network access

## Step 1: Install Mosquitto on Windows

1. **Download Mosquitto**

   - Visit [mosquitto.org/download](https://mosquitto.org/download/)
   - Download the Windows installer (64-bit recommended)
   - Run the installer as administrator

2. **Add Mosquitto to System PATH**
   - Open System Properties → Advanced → Environment Variables
   - Add `C:\Program Files\mosquitto` to your PATH variable

## Step 2: Create Required Directories

Create the following directories for Mosquitto data and logs:

```cmd
mkdir C:\mosquitto\data
mkdir C:\mosquitto\log
```

## Step 3: Configure Mosquitto

1. Navigate to `C:\Program Files\mosquitto`
2. Open `mosquitto.conf` file (create if it doesn't exist)
3. Add the following configuration at the end of the file:

```conf
# Allow anonymous connections
allow_anonymous true

# Plain MQTT (ESP32, MQTT clients)
listener 1883
protocol mqtt

# WebSockets (browser dashboard)
listener 9002
protocol websockets

# Persistence & logging
persistence true
persistence_location C:\mosquitto\data\
log_dest file C:\mosquitto\log\mosquitto.log
```

## Step 4: Start Mosquitto Service

Open Command Prompt as administrator and run:

```cmd
net start mosquitto
```

Expected output:

```
The Mosquitto Broker service is starting.
The Mosquitto Broker service was started successfully.
```

## Step 5: Find Your PC's IP Address

Open Command Prompt and run:

```cmd
ipconfig
```

Note your IPv4 address (e.g., `10.214.162.1`)

## Step 6: ESP32 Setup

1. Create a new Arduino sketch named `connect_with_mosquitto.ino`
2. Update the following variables in the code:
   - `ssid`: Your WiFi network name
   - `password`: Your WiFi password
   - `mqtt_server`: Your PC's IP address (from Step 5)

## Step 7: Testing the Connection

### Monitor ESP32 Status

Open Command Prompt and run:

```cmd
mosquitto_sub -h 10.214.162.1 -t "esp32/status"
```

You should see the message: `ESP32 is alive`

### Control ESP32 LED

**Turn LED ON:**

```cmd
mosquitto_pub -h 10.214.162.1 -t "esp32/led" -m "ON"
```

**Turn LED OFF:**

```cmd
mosquitto_pub -h 10.214.162.1 -t "esp32/led" -m "OFF"
```

## Command Breakdown

### mosquitto_sub Command

```cmd
mosquitto_sub -h 10.214.162.1 -t "esp32/status"
```

- `-h 10.214.162.1`: Specifies the MQTT broker's IP address
- `-t "esp32/status"`: Subscribes to the topic "esp32/status"

### mosquitto_pub Commands

```cmd
mosquitto_pub -h 10.214.162.1 -t "esp32/led" -m "ON"
```

- `-h 10.214.162.1`: Specifies the MQTT broker's IP address
- `-t "esp32/led"`: Sets the topic to "esp32/led"
- `-m "ON"`: Sends the message "ON" to the topic

```cmd
mosquitto_pub -h 10.214.162.1 -t "esp32/led" -m "OFF"
```

- `-h 10.214.162.1`: Specifies the MQTT broker's IP address
- `-t "esp32/led"`: Sets the topic to "esp32/led"
- `-m "OFF"`: Sends the message "OFF" to the topic

**Usage:** Use these commands to control the LED connected to the ESP32 via MQTT.

## Troubleshooting

### Common Issues

1. **Service won't start:**

   - Check if port 1883 is already in use
   - Run Command Prompt as administrator
   - Verify configuration file syntax

2. **ESP32 can't connect:**

   - Ensure ESP32 and PC are on the same network
   - Check Windows Firewall settings (allow port 1883)
   - Verify the IP address is correct
   - Make sure Mosquitto service is running

3. **No messages received:**
   - Check topic names match exactly (case-sensitive)
   - Verify IP address in commands
   - Ensure ESP32 is connected to WiFi

### Firewall Configuration

If connection fails, allow Mosquitto through Windows Firewall:

1. Open Windows Defender Firewall
2. Click "Allow an app or feature through Windows Defender Firewall"
3. Add `mosquitto.exe` and allow both private and public networks

## File Structure

```
C:\Program Files\mosquitto\
├── mosquitto.conf          # Configuration file
├── mosquitto.exe          # Main executable
└── ...

C:\mosquitto\
├── data\                  # Persistence data
└── log\                   # Log files
    └── mosquitto.log
```

## Additional Commands

### Stop Mosquitto Service

```cmd
net stop mosquitto
```

### View Mosquitto Logs

```cmd
type C:\mosquitto\log\mosquitto.log
```

## Security Notes

This configuration allows anonymous connections for testing purposes. For production use, consider:

- Setting up username/password authentication
- Using SSL/TLS encryption
- Configuring proper access control lists
- Disabling anonymous access

## License

This setup guide is provided as-is for educational and development purposes.
