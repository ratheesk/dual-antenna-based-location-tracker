#include <WiFi.h>
#include <ArduinoOTA.h>
#include <AsyncMqttClient.h>
#include <SPI.h>
#include <LoRa.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// -----------------
// WiFi credentials
// -----------------
const char* ssid = "GTCY";
const char* password = "GladToConnectYou";

// -----------------
// MQTT broker setup
// -----------------
const char* MQTT_BROKER = "10.214.162.1";  // Default MQTT broker IP
const int MQTT_PORT = 9002;                 // WebSocket port
const char* BOARD_ID = "board1";            // Change to "board2" for second board

AsyncMqttClient mqttClient;
WiFiClient wifiClient;

// -----------------
// Pin Definitions
// -----------------
const int ledPin = 21;
const int servoPin = 33;
const int LORA_ACTIVE_LED = 22;
const int SIGNAL_RECEIVED_LED = 23;

// -----------------
// Hardware Objects
// -----------------
Servo myservo;

// -----------------
// System Variables
// -----------------
bool isTracking = false;
bool loraInitialized = false;
int currentAngle = 0;
const int MAX_ANGLE = 180;
const int SERVO_STEP = 1;
const int ANGLE_WAIT_TIME = 2000;  // 2 seconds per angle
unsigned long angleStartTime = 0;
unsigned long lastStatusTime = 0;
unsigned long lastSignalTime = 0;

// -----------------
// Data Storage for Safety
// -----------------
int bestRSSI[MAX_ANGLE + 1];  // Store best RSSI for each angle (0-180)
int packetCount[MAX_ANGLE + 1];  // Count packets received at each angle
bool rotationComplete = false;

// -----------------
// MQTT Topics
// -----------------
String TOPIC_LED = String("esp32/") + BOARD_ID + "/led";
String TOPIC_START = String("esp32/") + BOARD_ID + "/start";
String TOPIC_STOP = String("esp32/") + BOARD_ID + "/stop";
String TOPIC_RESET = String("esp32/") + BOARD_ID + "/reset";
String TOPIC_STATUS = String("esp32/") + BOARD_ID + "/status";
String TOPIC_LORA_DATA = String("esp32/") + BOARD_ID + "/lora/data";
String TOPIC_ANGLE = String("esp32/") + BOARD_ID + "/angle";
String TOPIC_ROTATION_COMPLETE = String("esp32/") + BOARD_ID + "/rotation/complete";
String TOPIC_STORED_DATA = String("esp32/") + BOARD_ID + "/stored/data";

// -----------------
// MQTT Functions
// -----------------
void connectToMqtt() {
  Serial.println("Connecting to MQTT...");
  mqttClient.connect();
}

void onMqttConnect(bool sessionPresent) {
  Serial.println("Connected to MQTT.");
  publishStatus("Connected and ready");

  // Subscribe to control topics
  mqttClient.subscribe(TOPIC_LED.c_str(), 1);
  mqttClient.subscribe(TOPIC_START.c_str(), 1);
  mqttClient.subscribe(TOPIC_STOP.c_str(), 1);
  mqttClient.subscribe(TOPIC_RESET.c_str(), 1);
}

void onMqttDisconnect(AsyncMqttClientDisconnectReason reason) {
  Serial.printf("Disconnected from MQTT: %u. Reconnecting...\n", (uint8_t)reason);
  if (WiFi.status() == WL_CONNECTED) {
    connectToMqtt();
  }
}

void onMqttMessage(char* topic, char* payload, AsyncMqttClientMessageProperties properties, size_t len, size_t index, size_t total) {
  String msg = String(payload).substring(0, len);
  Serial.printf("Message arrived [%s] %s\n", topic, msg.c_str());

  if (String(topic) == TOPIC_LED) {
    if (msg == "ON") {
      digitalWrite(ledPin, HIGH);
    } else if (msg == "OFF") {
      digitalWrite(ledPin, LOW);
    }
  } else if (String(topic) == TOPIC_START) {
    startTracking();
  } else if (String(topic) == TOPIC_STOP) {
    stopTracking();
  } else if (String(topic) == TOPIC_RESET) {
    resetSystem();
  }
}

// -----------------
// LoRa Functions
// -----------------
void initializeLoRa() {
  LoRa.setPins(5, 14, 2);  // SS, reset, DIO0
  if (!LoRa.begin(418E6)) {
    Serial.println("❌ LoRa init failed!");
    loraInitialized = false;
    digitalWrite(LORA_ACTIVE_LED, LOW);
    publishStatus("LoRa initialization failed");
  } else {
    Serial.println("✅ LoRa initialized successfully");
    loraInitialized = true;
    digitalWrite(LORA_ACTIVE_LED, HIGH);
    publishStatus("LoRa ready");
  }
}

void handleLoRaReception() {
  if (!loraInitialized) return;

  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String message = "";
    while (LoRa.available()) {
      message += (char)LoRa.read();
    }

    int rssi = LoRa.packetRssi();
    float snr = LoRa.packetSnr();

    // Update stored data if this is a better reading for current angle
    if (currentAngle >= 0 && currentAngle <= MAX_ANGLE) {
      if (rssi > bestRSSI[currentAngle] || bestRSSI[currentAngle] == -999) {
        bestRSSI[currentAngle] = rssi;
      }
      packetCount[currentAngle]++;
    }

    // Light up signal LED
    digitalWrite(SIGNAL_RECEIVED_LED, HIGH);
    lastSignalTime = millis();

    // Create JSON payload for MQTT
    DynamicJsonDocument doc(256);
    doc["angle"] = currentAngle;
    doc["rssi"] = rssi;
    doc["snr"] = snr;
    doc["message"] = message;
    doc["timestamp"] = millis();
    doc["tracking"] = isTracking;
    doc["best_rssi_at_angle"] = bestRSSI[currentAngle];
    doc["packet_count_at_angle"] = packetCount[currentAngle];

    String jsonString;
    serializeJson(doc, jsonString);
    mqttClient.publish(TOPIC_LORA_DATA.c_str(), 1, false, jsonString.c_str());

    Serial.printf("📦 Angle %d° | RSSI: %d dBm | Best: %d dBm | SNR: %.2f | Packets: %d | Data: %s\n",
                  currentAngle, rssi, bestRSSI[currentAngle], snr, packetCount[currentAngle], message.c_str());
  }
}

// -----------------
// Servo Functions
// -----------------
void moveServoToAngle(int targetAngle) {
  if (targetAngle < 0) targetAngle = 0;
  if (targetAngle > MAX_ANGLE) targetAngle = MAX_ANGLE;

  Serial.printf("🔄 Moving servo to %d°\n", targetAngle);
  myservo.write(targetAngle);
  currentAngle = targetAngle;

  // Publish current angle
  mqttClient.publish(TOPIC_ANGLE.c_str(), 1, false, String(currentAngle).c_str());
  delay(500);  // Allow servo to move
}

void handleServoTracking() {
  if (!isTracking) return;

  if (millis() - angleStartTime >= ANGLE_WAIT_TIME) {
    currentAngle += SERVO_STEP;

    if (currentAngle > MAX_ANGLE) {
      stopTracking();
      publishRotationComplete();
      publishStoredData();
      publishStatus("Tracking completed - Full rotation finished");
      return;
    }

    moveServoToAngle(currentAngle);
    angleStartTime = millis();
    Serial.printf("📍 Now scanning at angle: %d°\n", currentAngle);
  }
}

// -----------------
// Control Functions
// -----------------
void startTracking() {
  if (isTracking) {
    publishStatus("Already tracking");
    return;
  }

  if (!loraInitialized) {
    publishStatus("Cannot start - LoRa not initialized");
    return;
  }

  // Initialize data arrays
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;
    packetCount[i] = 0;
  }

  isTracking = true;
  rotationComplete = false;
  currentAngle = 0;
  moveServoToAngle(currentAngle);
  angleStartTime = millis();

  publishStatus("Tracking started - Data arrays initialized");
  Serial.println("🚀 Tracking started - Beginning antenna scan with data storage");
}

void stopTracking() {
  if (!isTracking) {
    publishStatus("Not currently tracking");
    return;
  }

  isTracking = false;
  rotationComplete = (currentAngle > MAX_ANGLE);

  if (rotationComplete) {
    publishRotationComplete();
    publishStoredData();
  }

  publishStatus("Tracking stopped");
  Serial.println("⏹️ Tracking stopped");
}

void resetSystem() {
  stopTracking();
  currentAngle = 0;
  moveServoToAngle(0);
  rotationComplete = false;

  // Clear stored data
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;
    packetCount[i] = 0;
  }

  publishStatus("System reset - Antenna at 0° - Data cleared");
  Serial.println("🔄 System reset - Servo returned to 0° - Stored data cleared");
}

// -----------------
// Data Publishing Functions
// -----------------
void publishRotationComplete() {
  DynamicJsonDocument doc(256);
  doc["message"] = "Full rotation completed";
  doc["total_angles"] = MAX_ANGLE + 1;
  doc["timestamp"] = millis();

  // Calculate statistics
  int validReadings = 0;
  int bestOverallAngle = -1;
  int bestOverallRSSI = -999;

  for (int i = 0; i <= MAX_ANGLE; i++) {
    if (bestRSSI[i] > -999) {
      validReadings++;
      if (bestRSSI[i] > bestOverallRSSI) {
        bestOverallRSSI = bestRSSI[i];
        bestOverallAngle = i;
      }
    }
  }

  doc["valid_readings"] = validReadings;
  doc["best_angle"] = bestOverallAngle;
  doc["best_rssi"] = bestOverallRSSI;

  String jsonString;
  serializeJson(doc, jsonString);
  mqttClient.publish(TOPIC_ROTATION_COMPLETE.c_str(), 1, false, jsonString.c_str());
  Serial.printf("🎯 Rotation Complete! Best signal: %d dBm at %d°\n", bestOverallRSSI, bestOverallAngle);
}

void publishStoredData() {
  const int CHUNK_SIZE = 20;  // Send 20 angles at a time
  for (int chunk = 0; chunk <= MAX_ANGLE; chunk += CHUNK_SIZE) {
    DynamicJsonDocument doc(1024);
    doc["chunk_start"] = chunk;
    doc["chunk_end"] = min(chunk + CHUNK_SIZE - 1, MAX_ANGLE);
    doc["total_angles"] = MAX_ANGLE + 1;
    doc["timestamp"] = millis();

    JsonArray angles = doc.createNestedArray("angles");
    JsonArray rssi_values = doc.createNestedArray("rssi_values");
    JsonArray packet_counts = doc.createNestedArray("packet_counts");

    for (int i = chunk; i <= min(chunk + CHUNK_SIZE - 1, MAX_ANGLE); i++) {
      angles.add(i);
      rssi_values.add(bestRSSI[i]);
      packet_counts.add(packetCount[i]);
    }

    String jsonString;
    serializeJson(doc, jsonString);
    mqttClient.publish(TOPIC_STORED_DATA.c_str(), 1, false, jsonString.c_str());
    delay(100);  // Small delay between chunks
  }
  Serial.println("📊 All stored data published via MQTT");
}

// -----------------
// Status Functions
// -----------------
void publishStatus(String message) {
  DynamicJsonDocument doc(512);
  doc["message"] = message;
  doc["tracking"] = isTracking;
  doc["angle"] = currentAngle;
  doc["lora_active"] = loraInitialized;
  doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  doc["rotation_complete"] = rotationComplete;
  doc["timestamp"] = millis();

  if (currentAngle >= 0 && currentAngle <= MAX_ANGLE) {
    doc["current_best_rssi"] = bestRSSI[currentAngle];
    doc["current_packet_count"] = packetCount[currentAngle];
  }

  String jsonString;
  serializeJson(doc, jsonString);
  mqttClient.publish(TOPIC_STATUS.c_str(), 1, false, jsonString.c_str());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize pins
  pinMode(ledPin, OUTPUT);
  pinMode(LORA_ACTIVE_LED, OUTPUT);
  pinMode(SIGNAL_RECEIVED_LED, OUTPUT);

  // Initialize servo
  myservo.attach(servoPin);
  moveServoToAngle(0);

  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // OTA setup
  ArduinoOTA.onStart([]() {
    String type = (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem";
    Serial.println("Start updating " + type);
  });
  ArduinoOTA.onEnd([]() { Serial.println("\nEnd"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]\n", error);
  });
  ArduinoOTA.begin();
  Serial.println("OTA Ready");

  // Initialize LoRa
  initializeLoRa();

  // MQTT setup
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setClientId(String("ESP32LoRaTracker_") + BOARD_ID);
  mqttClient.onConnect(onMqttConnect);
  mqttClient.onDisconnect(onMqttDisconnect);
  mqttClient.onMessage(onMqttMessage);
  connectToMqtt();

  // Initialize data storage arrays
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;
    packetCount[i] = 0;
  }
  rotationComplete = false;

  Serial.println("🌟 ESP32 LoRa MQTT Tracker Ready!");
  Serial.println("📡 MQTT Topics:");
  Serial.println("  • " + TOPIC_START + " - Start tracking");
  Serial.println("  • " + TOPIC_STOP + " - Stop tracking");
  Serial.println("  • " + TOPIC_RESET + " - Reset to 0°");
  Serial.println("  • " + TOPIC_LED + " - Control LED (ON/OFF)");
  Serial.println("  • " + TOPIC_STATUS + " - Status updates");
  Serial.println("  • " + TOPIC_LORA_DATA + " - Live LoRa data");
  Serial.println("  • " + TOPIC_ANGLE + " - Current angle");
  Serial.println("  • " + TOPIC_ROTATION_COMPLETE + " - Rotation summary");
  Serial.println("  • " + TOPIC_STORED_DATA + " - Stored RSSI data");
}

void loop() {
  ArduinoOTA.handle();
  handleServoTracking();
  handleLoRaReception();

  if (millis() - lastSignalTime > 200) {
    digitalWrite(SIGNAL_RECEIVED_LED, LOW);
  }

  if (millis() - lastStatusTime > 10000) {
    lastStatusTime = millis();
    if (!isTracking) {
      publishStatus("System alive");
    }
  }
}