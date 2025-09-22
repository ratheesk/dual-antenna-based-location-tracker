#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <LoRa.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// -----------------
// WiFi credentials
// -----------------
const char* ssid = "@Nari Kooddam";
const char* password = "Naaddamillai";

// -----------------
// MQTT broker setup
// -----------------
const char* mqtt_server = "10.214.162.1";  // MQTT broker IP
const int mqtt_port = 1883;                // TCP MQTT port
const char* BOARD_ID = "board1";           // Change to "board2" for second board

WiFiClient espClient;
PubSubClient client(espClient);

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
unsigned long angleStartTime = 0;
unsigned long lastStatusTime = 0;
unsigned long lastSignalTime = 0;
const int NO_SIGNAL_WAIT = 500;  // Wait 500ms at each angle if no packet received

// -----------------
// Data Storage for All Angles (0-180 = 181 points)
// -----------------
int bestRSSI[MAX_ANGLE + 1];     // Store best RSSI for each angle (0-180), -999 if no signal
int packetCount[MAX_ANGLE + 1];  // Count packets received at each angle
float bestSNR[MAX_ANGLE + 1];    // Store best SNR for each angle
bool angleHasData[MAX_ANGLE + 1]; // Track which angles have valid data
bool rotationComplete = false;

// -----------------
// MQTT Topics (Board-Specific)
// -----------------
const char* TOPIC_LED = "esp32/%s/led";
const char* TOPIC_START = "esp32/%s/start";
const char* TOPIC_STOP = "esp32/%s/stop";
const char* TOPIC_RESET = "esp32/%s/reset";
const char* TOPIC_STATUS = "esp32/%s/status";
const char* TOPIC_LORA_DATA = "esp32/%s/lora/data";
const char* TOPIC_ANGLE = "esp32/%s/angle";
const char* TOPIC_ROTATION_COMPLETE = "esp32/%s/rotation/complete";
const char* TOPIC_STORED_DATA = "esp32/%s/stored/data";
const char* TOPIC_ALL_ANGLES_DATA = "esp32/%s/all/angles";  // New topic for all 181 points

// Helper to format topics with BOARD_ID
char topicBuffer[128];
void formatTopic(const char* format, const char* id) {
  snprintf(topicBuffer, sizeof(topicBuffer), format, id);
}

#define GET_TOPIC(FORMAT) (formatTopic((FORMAT), BOARD_ID), topicBuffer)

// -----------------
// Reconnect function for MQTT
// -----------------
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = String("ESP32LoRaTracker_") + BOARD_ID;
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");

      // Subscribe to control topics
      client.subscribe(GET_TOPIC(TOPIC_LED));
      client.subscribe(GET_TOPIC(TOPIC_START));
      client.subscribe(GET_TOPIC(TOPIC_STOP));
      client.subscribe(GET_TOPIC(TOPIC_RESET));

      // Publish connection status
      publishStatus("Connected and ready");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// -----------------
// MQTT Callback
// -----------------
void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  Serial.printf("Message arrived [%s] %s\n", topic, msg.c_str());

  if (String(topic) == String(GET_TOPIC(TOPIC_LED))) {
    if (msg == "ON") {
      digitalWrite(ledPin, HIGH);
    } else if (msg == "OFF") {
      digitalWrite(ledPin, LOW);
    }
  } else if (String(topic) == String(GET_TOPIC(TOPIC_START))) {
    startTracking();
  } else if (String(topic) == String(GET_TOPIC(TOPIC_STOP))) {
    stopTracking();
  } else if (String(topic) == String(GET_TOPIC(TOPIC_RESET))) {
    resetSystem();
  }
}

// -----------------
// LoRa Functions
// -----------------
void initializeLoRa() {
  LoRa.setPins(5, 14, 2);  // SS, reset, DIO0
  if (!LoRa.begin(420.5E6)) {
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
        bestSNR[currentAngle] = snr;  // Store SNR with best RSSI
      }
      packetCount[currentAngle]++;
      angleHasData[currentAngle] = true;  // Mark this angle as having data
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
    doc["best_snr_at_angle"] = bestSNR[currentAngle];
    doc["packet_count_at_angle"] = packetCount[currentAngle];

    String jsonString;
    serializeJson(doc, jsonString);
    client.publish(GET_TOPIC(TOPIC_LORA_DATA), jsonString.c_str());

    Serial.printf("📦 Angle %d° | RSSI: %d dBm | Best: %d dBm | SNR: %.2f | Best SNR: %.2f | Packets: %d | Data: %s\n",
                  currentAngle, rssi, bestRSSI[currentAngle], snr, bestSNR[currentAngle], packetCount[currentAngle], message.c_str());

    // Move to next angle immediately after receiving a packet
    if (isTracking) {
      moveToNextAngle();
    }
  }
}

// -----------------
// Servo Functions
// -----------------
void moveServoToAngle(int targetAngle) {
  if (targetAngle < 0) targetAngle = 0;
  if (targetAngle > MAX_ANGLE) targetAngle = MAX_ANGLE;

  // For small movements (during tracking), use direct movement
  if (abs(targetAngle - currentAngle) <= 5) {
    Serial.printf("🔄 Moving servo to %d°\n", targetAngle);
    myservo.write(targetAngle);
    currentAngle = targetAngle;
    client.publish(GET_TOPIC(TOPIC_ANGLE), String(currentAngle).c_str());
    delay(500);  // Allow servo to move
  } else {
    // For larger movements, use smooth movement
    smoothMoveToAngle(targetAngle);
  }
}

void moveToNextAngle() {
  currentAngle += SERVO_STEP;

  if (currentAngle > MAX_ANGLE) {
    stopTracking();
    publishRotationComplete();
    publishStoredData();
    publishAllAnglesData();  // Publish only angles with data and their best RSSI
    publishStatus("Tracking completed - Full rotation finished - Valid angle data published");
    return;
  }

  moveServoToAngle(currentAngle);
  angleStartTime = millis();
  Serial.printf("📍 Now scanning at angle: %d°\n", currentAngle);
}

void handleServoTracking() {
  if (!isTracking) return;

  // If no packet received after NO_SIGNAL_WAIT, move to next angle
  if (millis() - angleStartTime >= NO_SIGNAL_WAIT) {
    moveToNextAngle();
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

  // Initialize data arrays for all 181 angles (0-180)
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;        // -999 indicates no signal
    packetCount[i] = 0;
    bestSNR[i] = -999.0;       // Initialize SNR
    angleHasData[i] = false;   // No data yet
  }

  isTracking = true;
  rotationComplete = false;
  currentAngle = 0;
  moveServoToAngle(currentAngle);
  angleStartTime = millis();

  publishStatus("Tracking started - Data arrays initialized for signal detection");
  Serial.println("🚀 Tracking started - Ready to collect signal data at each angle");
}

void stopTracking() {
  if (!isTracking) {
    publishStatus("Not currently tracking");
    return;
  }

  isTracking = false;
  rotationComplete = (currentAngle >= MAX_ANGLE);

  if (rotationComplete) {
    publishRotationComplete();
    publishStoredData();
    publishAllAnglesData();  // Publish only angles with data
  }

  publishStatus("Tracking stopped");
  Serial.println("⏹️ Tracking stopped");
}

void resetSystem() {
  stopTracking();
  
  // Smooth movement to 0° instead of jumping directly
  smoothMoveToAngle(0);
  
  rotationComplete = false;

  // Clear stored data for all angles
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;
    packetCount[i] = 0;
    bestSNR[i] = -999.0;
    angleHasData[i] = false;
  }

  publishStatus("System reset - Antenna smoothly moved to 0° - Data arrays cleared");
  Serial.println("🔄 System reset - Servo smoothly returned to 0° - Stored data cleared");
}

void smoothMoveToAngle(int targetAngle) {
  if (targetAngle < 0) targetAngle = 0;
  if (targetAngle > MAX_ANGLE) targetAngle = MAX_ANGLE;

  Serial.printf("🔄 Smoothly moving servo from %d° to %d°\n", currentAngle, targetAngle);
  
  // Determine direction and step size
  int direction = (targetAngle > currentAngle) ? 1 : -1;
  int step = 2; // Move in 2-degree steps for smooth motion
  
  // Move gradually to target angle
  while (currentAngle != targetAngle) {
    if (abs(targetAngle - currentAngle) <= step) {
      // Close to target, move directly
      currentAngle = targetAngle;
    } else {
      // Move by step amount
      currentAngle += (direction * step);
    }
    
    myservo.write(currentAngle);
    delay(50); // Small delay between steps for smooth motion
    
    // Publish angle updates during smooth movement
    client.publish(GET_TOPIC(TOPIC_ANGLE), String(currentAngle).c_str());
  }
  
  Serial.printf("✅ Servo smoothly positioned at %d°\n", currentAngle);
  delay(200); // Final settling delay
}

// -----------------
// Data Publishing Functions
// -----------------
void publishRotationComplete() {
  DynamicJsonDocument doc(256);
  doc["message"] = "Full rotation completed";
  doc["total_angles"] = MAX_ANGLE + 1;  // 181 angles (0-180)
  doc["timestamp"] = millis();

  // Calculate statistics
  int validReadings = 0;
  int bestOverallAngle = -1;
  int bestOverallRSSI = -999;

  for (int i = 0; i <= MAX_ANGLE; i++) {
    if (angleHasData[i]) {
      validReadings++;
      if (bestRSSI[i] > bestOverallRSSI) {
        bestOverallRSSI = bestRSSI[i];
        bestOverallAngle = i;
      }
    }
  }

  doc["valid_readings"] = validReadings;
  doc["angles_with_no_data"] = (MAX_ANGLE + 1) - validReadings;
  doc["best_angle"] = bestOverallAngle;
  doc["best_rssi"] = bestOverallRSSI;

  String jsonString;
  serializeJson(doc, jsonString);
  client.publish(GET_TOPIC(TOPIC_ROTATION_COMPLETE), jsonString.c_str());
  Serial.printf("🎯 Rotation Complete! Best signal: %d dBm at %d° | Valid readings: %d/181\n", 
                bestOverallRSSI, bestOverallAngle, validReadings);
}

void publishStoredData() {
  // Find the best angle and RSSI (unchanged - still publishes best single point)
  int bestAngle = -1;
  int bestRSSIValue = -999;
  int packetCountAtBest = 0;
  float bestSNRValue = -999.0;

  for (int i = 0; i <= MAX_ANGLE; i++) {
    if (angleHasData[i] && bestRSSI[i] > bestRSSIValue) {
      bestRSSIValue = bestRSSI[i];
      bestAngle = i;
      packetCountAtBest = packetCount[i];
      bestSNRValue = bestSNR[i];
    }
  }

  // Publish only the best angle data
  DynamicJsonDocument doc(256);
  doc["message"] = "Best angle data";
  doc["timestamp"] = millis();
  if (bestAngle >= 0) {
    doc["angle"] = bestAngle;
    doc["rssi"] = bestRSSIValue;
    doc["snr"] = bestSNRValue;
    doc["packet_count"] = packetCountAtBest;
  } else {
    doc["angle"] = nullptr;
    doc["rssi"] = nullptr;
    doc["snr"] = nullptr;
    doc["packet_count"] = 0;
  }

  String jsonString;
  serializeJson(doc, jsonString);
  client.publish(GET_TOPIC(TOPIC_STORED_DATA), jsonString.c_str());
  Serial.printf("📊 Published best angle data: Angle %d°, RSSI %d dBm, SNR %.2f, Packets %d\n",
                bestAngle, bestRSSIValue, bestSNRValue, packetCountAtBest);
}

// -----------------
// NEW FUNCTION: Publish Only Angles With Data and Their Best RSSI
// -----------------
void publishAllAnglesData() {
  Serial.println("📡 Publishing angles with data and their best RSSI values...");
  
  DynamicJsonDocument doc(4096);  // Smaller size since we're only publishing valid data
  
  doc["message"] = "Angles with signal data and best RSSI values";
  doc["board_id"] = BOARD_ID;
  doc["timestamp"] = millis();
  doc["scan_range"] = "0-180 degrees";
  
  // Create arrays for only angles that have data
  JsonArray angles = doc.createNestedArray("angles");
  JsonArray rssi_values = doc.createNestedArray("rssi");
  
  int validPoints = 0;
  
  // Only include angles that have data
  for (int i = 0; i <= MAX_ANGLE; i++) {
    if (angleHasData[i]) {
      angles.add(i);
      rssi_values.add(bestRSSI[i]);
      validPoints++;
    }
  }
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Publish complete dataset (should be much smaller now)
  bool published = client.publish(GET_TOPIC(TOPIC_ALL_ANGLES_DATA), jsonString.c_str());
  if (published) {
    Serial.printf("✅ Published angle data: %d angles with signals (%d bytes)\n", 
                  validPoints, jsonString.length());
    Serial.printf("📊 Data points: ");
    for (int i = 0; i <= MAX_ANGLE; i++) {
      if (angleHasData[i]) {
        Serial.printf("%d°:%ddBm ", i, bestRSSI[i]);
      }
    }
    Serial.println();
  } else {
    Serial.printf("❌ Failed to publish angle data\n");
  }
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
    doc["current_best_snr"] = bestSNR[currentAngle];
    doc["current_packet_count"] = packetCount[currentAngle];
    doc["current_has_data"] = angleHasData[currentAngle];
  } else {
    doc["current_best_rssi"] = nullptr;
    doc["current_best_snr"] = nullptr;
    doc["current_packet_count"] = 0;
    doc["current_has_data"] = false;
  }

  String jsonString;
  serializeJson(doc, jsonString);
  client.publish(GET_TOPIC(TOPIC_STATUS), jsonString.c_str());
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 5000);
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
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // Initialize data storage arrays for all 181 angles
  for (int i = 0; i <= MAX_ANGLE; i++) {
    bestRSSI[i] = -999;        // -999 indicates no signal
    packetCount[i] = 0;
    bestSNR[i] = -999.0;
    angleHasData[i] = false;
  }
  rotationComplete = false;

  Serial.println("🌟 ESP32 LoRa MQTT Tracker Ready!");
  Serial.printf("📡 Board ID: %s\n", BOARD_ID);
  Serial.println("📡 MQTT Topics:");
  Serial.printf("  • %s - Start tracking\n", GET_TOPIC(TOPIC_START));
  Serial.printf("  • %s - Stop tracking\n", GET_TOPIC(TOPIC_STOP));
  Serial.printf("  • %s - Reset to 0°\n", GET_TOPIC(TOPIC_RESET));
  Serial.printf("  • %s - Control LED (ON/OFF)\n", GET_TOPIC(TOPIC_LED));
  Serial.printf("  • %s - Status updates\n", GET_TOPIC(TOPIC_STATUS));
  Serial.printf("  • %s - Live LoRa data\n", GET_TOPIC(TOPIC_LORA_DATA));
  Serial.printf("  • %s - Current angle\n", GET_TOPIC(TOPIC_ANGLE));
  Serial.printf("  • %s - Rotation summary\n", GET_TOPIC(TOPIC_ROTATION_COMPLETE));
  Serial.printf("  • %s - Best angle data\n", GET_TOPIC(TOPIC_STORED_DATA));
  Serial.printf("  • %s - Angles with signal data\n", GET_TOPIC(TOPIC_ALL_ANGLES_DATA));
  Serial.println("📊 Ready to scan 0°-180° and report angles with detected signals");
}

void loop() {
  ArduinoOTA.handle();

  // Ensure MQTT stays connected
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

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