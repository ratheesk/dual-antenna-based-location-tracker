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
const char* ssid = "GTCY";
const char* password = "GladToConnectYou";

// -----------------
// MQTT broker setup
// -----------------
const char* mqtt_server = "10.214.162.1";  // <-- replace with your PC Mosquitto broker IP
const int mqtt_port = 1883;                 // default Mosquitto port
const char* mqtt_user = "";                 // leave empty if no username
const char* mqtt_pass = "";                 // leave empty if no password

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
const int ANGLE_WAIT_TIME = 2000;  // 2 seconds per angle
unsigned long angleStartTime = 0;
unsigned long lastStatusTime = 0;
unsigned long lastSignalTime = 0;

// -----------------
// MQTT Topics
// -----------------
const char* TOPIC_LED = "esp32/led";
const char* TOPIC_START = "esp32/start";
const char* TOPIC_STOP = "esp32/stop";
const char* TOPIC_RESET = "esp32/reset";
const char* TOPIC_STATUS = "esp32/status";
const char* TOPIC_LORA_DATA = "esp32/lora/data";
const char* TOPIC_ANGLE = "esp32/angle";

// -----------------
// Reconnect function for MQTT
// -----------------
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32LoRaTracker", mqtt_user, mqtt_pass)) {
      Serial.println("connected");
      
      // Subscribe to control topics
      client.subscribe(TOPIC_LED);
      client.subscribe(TOPIC_START);
      client.subscribe(TOPIC_STOP);
      client.subscribe(TOPIC_RESET);
      
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
  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  Serial.println(msg);
  
  if (String(topic) == TOPIC_LED) {
    if (msg == "ON") {
      digitalWrite(ledPin, HIGH);
    } else if (msg == "OFF") {
      digitalWrite(ledPin, LOW);
    }
  }
  else if (String(topic) == TOPIC_START) {
    startTracking();
  }
  else if (String(topic) == TOPIC_STOP) {
    stopTracking();
  }
  else if (String(topic) == TOPIC_RESET) {
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
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    // Publish to MQTT
    client.publish(TOPIC_LORA_DATA, jsonString.c_str());
    
    Serial.printf("📦 Angle %d° | RSSI: %d dBm | SNR: %.2f | Data: %s\n", 
                  currentAngle, rssi, snr, message.c_str());
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
  client.publish(TOPIC_ANGLE, String(currentAngle).c_str());
  
  delay(500);  // Allow servo to move
}

void handleServoTracking() {
  if (!isTracking) return;
  
  // Check if it's time to move to next angle
  if (millis() - angleStartTime >= ANGLE_WAIT_TIME) {
    currentAngle += SERVO_STEP;
    
    if (currentAngle > MAX_ANGLE) {
      // Completed full rotation
      stopTracking();
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
  
  isTracking = true;
  currentAngle = 0;
  moveServoToAngle(currentAngle);
  angleStartTime = millis();
  
  publishStatus("Tracking started");
  Serial.println("🚀 Tracking started - Beginning antenna scan");
}

void stopTracking() {
  if (!isTracking) {
    publishStatus("Not currently tracking");
    return;
  }
  
  isTracking = false;
  publishStatus("Tracking stopped");
  Serial.println("⏹️ Tracking stopped");
}

void resetSystem() {
  stopTracking();
  currentAngle = 0;
  moveServoToAngle(0);
  publishStatus("System reset - Antenna at 0°");
  Serial.println("🔄 System reset - Servo returned to 0°");
}

// -----------------
// Status Functions
// -----------------
void publishStatus(String message) {
  DynamicJsonDocument doc(256);
  doc["message"] = message;
  doc["tracking"] = isTracking;
  doc["angle"] = currentAngle;
  doc["lora_active"] = loraInitialized;
  doc["wifi_connected"] = WiFi.status() == WL_CONNECTED;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  client.publish(TOPIC_STATUS, jsonString.c_str());
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
  moveServoToAngle(0);  // Start at 0 degrees
  
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
  
  Serial.println("🌟 ESP32 LoRa MQTT Tracker Ready!");
  Serial.println("📡 MQTT Topics:");
  Serial.println("  • esp32/start - Start tracking");
  Serial.println("  • esp32/stop - Stop tracking");
  Serial.println("  • esp32/reset - Reset to 0°");
  Serial.println("  • esp32/led - Control LED (ON/OFF)");
  Serial.println("  • esp32/status - Status updates");
  Serial.println("  • esp32/lora/data - Live LoRa data");
  Serial.println("  • esp32/angle - Current angle");
}

void loop() {
  // Handle OTA
  ArduinoOTA.handle();
  
  // Ensure MQTT stays connected
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // Handle servo tracking
  handleServoTracking();
  
  // Handle LoRa reception
  handleLoRaReception();
  
  // Turn off signal LED after delay
  if (millis() - lastSignalTime > 200) {
    digitalWrite(SIGNAL_RECEIVED_LED, LOW);
  }
  
  // Publish periodic status (every 10 seconds)
  if (millis() - lastStatusTime > 10000) {
    lastStatusTime = millis();
    if (!isTracking) {  // Don't spam during tracking
      publishStatus("System alive");
    }
  }
}