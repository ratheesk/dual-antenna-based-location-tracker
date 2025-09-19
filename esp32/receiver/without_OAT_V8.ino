#include <WiFi.h>
#include <SPI.h>
#include <LoRa.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ------------------------
// WiFi Configuration
// ------------------------
const char* ssid = "";
const char* password = "";
WiFiServer server(80);

// ------------------------
// Pin Definitions
// ------------------------
#define LORA_ACTIVE_LED 21
#define SIGNAL_RECEIVED_LED 22
Servo myservo;
int servoPin = 33;
int angle = 0;
int dir = 1;
const int SERVO_STEP = 1;
const int MAX_WAIT_TIME = 5000; // 5 seconds for faster scanning

// ------------------------
// System State Variables
// ------------------------
bool isTracking = false;
bool servoRotating = false;
bool collecting = false;
bool trackingComplete = false;
bool minimumDetected = false;
bool loraInitialized = false;

// ------------------------
// Data Collection
// ------------------------
const int MAX_THETA = 180;
int rssiValues[MAX_THETA];
int angleData[MAX_THETA];
int dataIndex = 0;
int bestAngle = -1;
int bestRSSI = -999;
int middleMinIndex = -1;

// Connection monitoring
unsigned long previousMillis = 0;
const long interval = 30000;
int clientCount = 0;
unsigned long lastSignalTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize hardware
  myservo.attach(servoPin);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(LORA_ACTIVE_LED, OUTPUT);
  pinMode(SIGNAL_RECEIVED_LED, OUTPUT);

  // Connect to WiFi
  connectToWiFi();
  
  // Start web server
  server.begin();
  Serial.println("✅ API Server Started");
  printServerInfo();

  // Initialize LoRa
  LoRa.setPins(5, 14, 2);
  if (!LoRa.begin(418E6)) {
    Serial.println("❌ LoRa init failed!");
    loraInitialized = false;
    digitalWrite(LORA_ACTIVE_LED, LOW);
    // Don't halt - continue without LoRa
  } else {
    Serial.println("✅ LoRa RX Ready");
    loraInitialized = true;
    digitalWrite(LORA_ACTIVE_LED, HIGH);
  }

  // Initialize servo to 0 degrees
  myservo.write(0);
  delay(1000);
}

void loop() {
  // Monitor WiFi connection
  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("⚠️ WiFi disconnected! Reconnecting...");
      connectToWiFi();
    } else {
      digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    }
  }

  // Handle API requests
  WiFiClient client = server.available();
  if (client) {
    clientCount++;
    handleApiRequest(client);
  }

  // Handle antenna tracking logic
  handleAntennaTracking();

  // Handle LoRa signal reception
  handleLoRaReception();

  // Turn off signal LED after delay
  if (millis() - lastSignalTime > 200) {
    digitalWrite(SIGNAL_RECEIVED_LED, LOW);
  }
}

void handleApiRequest(WiFiClient client) {
  String currentLine = "";
  String request = "";
  String method = "";
  String path = "";
  String body = "";
  bool isPost = false;
  int contentLength = 0;
  
  unsigned long requestStartTime = millis();
  const unsigned long requestTimeout = 5000;

  // Read request headers
  while (client.connected() && (millis() - requestStartTime) < requestTimeout) {
    if (client.available()) {
      char c = client.read();
      if (c == '\n') {
        if (currentLine.length() == 0) {
          // Headers complete, read body if POST
          if (isPost && contentLength > 0) {
            for (int i = 0; i < contentLength && client.available(); i++) {
              body += (char)client.read();
            }
          }
          break;
        } else {
          // Parse first line for method and path
          if (request == "") {
            request = currentLine;
            int firstSpace = request.indexOf(' ');
            int secondSpace = request.indexOf(' ', firstSpace + 1);
            if (firstSpace > 0 && secondSpace > firstSpace) {
              method = request.substring(0, firstSpace);
              path = request.substring(firstSpace + 1, secondSpace);
              isPost = (method == "POST");
            }
          }
          // Check for Content-Length
          if (currentLine.startsWith("Content-Length: ")) {
            contentLength = currentLine.substring(16).toInt();
          }
          currentLine = "";
        }
      } else if (c != '\r') {
        currentLine += c;
      }
    }
  }

  // Route the request
  routeApiRequest(client, method, path, body);
  client.stop();
}

void routeApiRequest(WiFiClient client, String method, String path, String body) {
  // Set CORS headers for all responses
  String corsHeaders = "HTTP/1.1 200 OK\r\n";
  corsHeaders += "Content-Type: application/json\r\n";
  corsHeaders += "Access-Control-Allow-Origin: *\r\n";
  corsHeaders += "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n";
  corsHeaders += "Access-Control-Allow-Headers: Content-Type, Authorization\r\n";
  corsHeaders += "Connection: close\r\n\r\n";

  // Handle OPTIONS requests (CORS preflight)
  if (method == "OPTIONS") {
    client.print(corsHeaders);
    return;
  }

  // Essential API Routes for Dashboard
  if (path == "/" || path == "/ping") {
    client.print("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\npong");
  }
  else if (path == "/api/status") {
    client.print(corsHeaders);
    sendStatusResponse(client);
  }
  else if (path == "/api/start") {
    client.print(corsHeaders);
    if (method == "POST") {
      handleStartCommand(client, body);
    } else {
      sendError(client, "Method not allowed", 405);
    }
  }
  else if (path == "/api/stop") {
    client.print(corsHeaders);
    if (method == "POST") {
      handleStopCommand(client);
    } else {
      sendError(client, "Method not allowed", 405);
    }
  }
  else if (path == "/api/reset") {
    client.print(corsHeaders);
    if (method == "POST") {
      handleResetCommand(client);
    } else {
      sendError(client, "Method not allowed", 405);
    }
  }
  else if (path == "/api/results") {
    client.print(corsHeaders);
    sendResultsResponse(client);
  }
  else {
    client.print(corsHeaders);
    sendError(client, "Endpoint not found", 404);
  }
}

void sendStatusResponse(WiFiClient client) {
  DynamicJsonDocument doc(512);
  
  doc["status"] = getSystemStatus();
  doc["tracking"] = isTracking;
  doc["collecting"] = collecting;
  doc["complete"] = trackingComplete;
  doc["currentAngle"] = angle;
  doc["progress"] = collecting ? angle : (trackingComplete ? MAX_THETA : 0);
  doc["maxAngle"] = MAX_THETA;
  doc["bestAngle"] = middleMinIndex;
  doc["bestRSSI"] = (middleMinIndex >= 0) ? rssiValues[middleMinIndex] : -999;
  doc["loraActive"] = loraInitialized;
  doc["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
  doc["clientCount"] = clientCount;
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void sendResultsResponse(WiFiClient client) {
  DynamicJsonDocument doc(2048);
  
  doc["complete"] = trackingComplete;
  doc["bestAngle"] = middleMinIndex;
  doc["bestRSSI"] = (middleMinIndex >= 0) ? rssiValues[middleMinIndex] : -999;
  
  // Add full RSSI array
  JsonArray rssiArray = doc.createNestedArray("rssiData");
  for (int i = 0; i < MAX_THETA; i++) {
    rssiArray.add(rssiValues[i]);
  }
  
  // Add only valid readings for cleaner data
  JsonArray validData = doc.createNestedArray("validReadings");
  for (int i = 0; i < MAX_THETA; i++) {
    if (rssiValues[i] != -999) {
      JsonObject reading = validData.createNestedObject();
      reading["angle"] = i;
      reading["rssi"] = rssiValues[i];
    }
  }
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void handleStartCommand(WiFiClient client, String body) {
  DynamicJsonDocument doc(256);
  
  if (!loraInitialized) {
    doc["success"] = false;
    doc["message"] = "Cannot start tracking - LoRa not initialized";
    doc["status"] = getSystemStatus();
  } else if (!isTracking) {
    startTracking();
    doc["success"] = true;
    doc["message"] = "Antenna tracking started";
    doc["status"] = "tracking";
  } else {
    doc["success"] = false;
    doc["message"] = "Tracking already in progress";
    doc["status"] = getSystemStatus();
  }
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void handleStopCommand(WiFiClient client) {
  DynamicJsonDocument doc(256);
  
  stopTracking();
  doc["success"] = true;
  doc["message"] = "Tracking stopped";
  doc["status"] = getSystemStatus();
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void handleResetCommand(WiFiClient client) {
  DynamicJsonDocument doc(256);
  
  resetSystem();
  doc["success"] = true;
  doc["message"] = "System reset";
  doc["status"] = getSystemStatus();
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void sendError(WiFiClient client, String message, int code) {
  DynamicJsonDocument doc(128);
  doc["error"] = true;
  doc["message"] = message;
  doc["code"] = code;
  
  String response;
  serializeJson(doc, response);
  client.print(response);
}

void handleAntennaTracking() {
  // Start tracking sequence
  if (isTracking && !collecting && !trackingComplete) {
    // Start collection immediately
    collecting = true;
    dataIndex = 0;
    servoRotating = true;
    trackingComplete = false;
    angle = 0; // Start from 0 degrees
    myservo.write(angle);
    Serial.println("🔴 Tracking initiated - Starting antenna scan...");
    
    // Initialize data arrays
    for (int i = 0; i < MAX_THETA; i++) {
      rssiValues[i] = -999;
      angleData[i] = i;
    }
  }

  // Perform rotation and data collection
  if (collecting && servoRotating && angle < MAX_THETA) {
    myservo.write(angle);
    Serial.print("📍 Angle " + String(angle) + "° - Waiting for LoRa signal...");
    
    // Wait until we receive a valid packet or timeout
    unsigned long startTime = millis();
    bool packetReceived = false;
    int bestRSSIAtAngle = -999;
    int packetCount = 0;
    
    while (!packetReceived && (millis() - startTime < MAX_WAIT_TIME)) {
      if (loraInitialized) {
        int packetSize = LoRa.parsePacket();
        if (packetSize) {
          String message = "";
          while (LoRa.available()) {
            message += (char)LoRa.read();
          }
          
          int rssi = LoRa.packetRssi();
          packetCount++;
          
          // Keep the best (strongest) RSSI at this angle
          if (rssi > bestRSSIAtAngle) {
            bestRSSIAtAngle = rssi;
          }
          
          // Light up signal LED
          digitalWrite(SIGNAL_RECEIVED_LED, HIGH);
          lastSignalTime = millis();
          
          // Mark as received - we can move to next angle
          packetReceived = true;
          
          Serial.println(" ✅ Received! RSSI: " + String(rssi) + " dBm");
        }
      } else {
        // If LoRa not initialized, break out immediately
        Serial.println(" ❌ LoRa not initialized!");
        break;
      }
      
      // Small delay to prevent overwhelming the system
      delay(50);
      
      // Print a dot every 2 seconds to show we're still waiting
      if ((millis() - startTime) % 2000 == 0) {
        Serial.print(".");
      }
    }
    
    // Store the result
    if (packetReceived) {
      rssiValues[angle] = bestRSSIAtAngle;
      Serial.println("📊 Angle " + String(angle) + "°: RSSI " + String(bestRSSIAtAngle) + " dBm (after " + String(packetCount) + " packets)");
    } else {
      rssiValues[angle] = -999; // Timeout occurred
      Serial.println(" ⏰ TIMEOUT - No signal received after " + String(MAX_WAIT_TIME/1000) + " seconds");
    }
    
    // Move to next angle
    angle += SERVO_STEP;
    if (angle >= MAX_THETA) {
      Serial.println("✅ Scan complete, processing results...");
      processTrackingResults();
    }
    
    // Reduced delay for faster movement
    delay(100);
  }
}

void handleLoRaReception() {
  // Only handle signals when not actively collecting data
  if (!collecting && loraInitialized) {
    int packetSize = LoRa.parsePacket();
    if (packetSize) {
      String message = "";
      while (LoRa.available()) {
        message += (char)LoRa.read();
      }
      
      int rssi = LoRa.packetRssi();
      Serial.println("📦 Received: " + message + " | RSSI: " + String(rssi) + " dBm");
      
      // Light up signal LED
      digitalWrite(SIGNAL_RECEIVED_LED, HIGH);
      lastSignalTime = millis();
    }
  }
}

void processTrackingResults() {
  collecting = false;
  servoRotating = false;
  trackingComplete = true;

  // Count valid readings
  int validReadings = 0;
  for (int i = 0; i < MAX_THETA; i++) {
    if (rssiValues[i] != -999) {
      validReadings++;
    }
  }
  
  Serial.println("\n📊 === TRACKING COMPLETE ===");
  Serial.println("Valid readings: " + String(validReadings) + "/" + String(MAX_THETA));

  // Find the best angle (middle of minimum values - strongest signal)
  middleMinIndex = findMiddleIndexOfMin(rssiValues, MAX_THETA);
  
  if (middleMinIndex >= 0) {
    Serial.println("Final Results:");
    Serial.print("Best Angle: ");
    Serial.print(middleMinIndex);
    Serial.println("°");
    Serial.print("Best RSSI: ");
    Serial.print(rssiValues[middleMinIndex]);
    Serial.println(" dBm");
    
    // Keep antenna at final position (180°)
    Serial.println("🎯 Scan complete! Antenna remains at 180° position.");
  } else {
    Serial.println("❌ No valid readings found - cannot determine best angle");
  }
  
  // Print complete array (only non-999 values for cleaner output)
  Serial.println("\nComplete RSSI Array (Valid readings only):");
  Serial.print("[");
  bool first = true;
  for (int i = 0; i < MAX_THETA; i++) {
    if (rssiValues[i] != -999) {
      if (!first) Serial.print(",");
      Serial.print("(" + String(i) + "°:" + String(rssiValues[i]) + ")");
      first = false;
    }
  }
  Serial.println("]");
  Serial.println("Middle Index: " + String(middleMinIndex));
}

void moveServoToAngle(int targetAngle) {
  int currentAngle = angle;
  int stepDir = (targetAngle > currentAngle) ? 1 : -1;
  
  while (currentAngle != targetAngle) {
    currentAngle += stepDir;
    myservo.write(currentAngle);
    delay(100);
  }
  angle = targetAngle;
}

int findMiddleIndexOfMin(int arr[], int length) {
  int maxVal = -999;
  
  // Find maximum RSSI (strongest signal) - ignore -999 values
  for (int i = 0; i < length; i++) {
    if (arr[i] != -999 && arr[i] > maxVal) {
      maxVal = arr[i];
    }
  }
  
  if (maxVal == -999) {
    Serial.println("⚠️ No valid RSSI readings found!");
    return -1;
  }

  // Find all indices with max value
  int maxIndices[MAX_THETA];
  int maxCount = 0;
  for (int i = 0; i < length; i++) {
    if (arr[i] == maxVal) {
      maxIndices[maxCount++] = i;
    }
  }

  Serial.println("Found " + String(maxCount) + " angles with best RSSI (" + String(maxVal) + " dBm)");
  
  // Return middle index
  return maxIndices[maxCount / 2];
}

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi: " + String(ssid));
  
  unsigned long startTime = millis();
  const unsigned long timeout = 20000;
  
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < timeout) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected!");
    digitalWrite(LED_BUILTIN, HIGH);
  } else {
    Serial.println("\n❌ Wi-Fi Connection Failed!");
    delay(5000);
    connectToWiFi();
  }
}

void startTracking() {
  isTracking = true;
  collecting = false;
  trackingComplete = false;
  minimumDetected = false;
  angle = 0;
  dataIndex = 0;
  middleMinIndex = -1;
  Serial.println("🚀 Tracking initiated!");
}

void stopTracking() {
  isTracking = false;
  collecting = false;
  servoRotating = false;
  Serial.println("⏹️ Tracking stopped by user");
}

void resetSystem() {
  stopTracking();
  trackingComplete = false;
  
  // Smoothly return to 0 degrees on reset
  Serial.println("🔄 System reset - Moving antenna to 0°...");
  moveServoToAngle(0);
  angle = 0;
  
  dataIndex = 0;
  middleMinIndex = -1;
  
  // Clear data arrays
  for (int i = 0; i < MAX_THETA; i++) {
    rssiValues[i] = -999;
  }
  Serial.println("✅ System reset complete");
}

String getSystemStatus() {
  if (trackingComplete) return "complete";
  if (isTracking) return "tracking";
  return "idle";
}

void printServerInfo() {
  Serial.println("🌍 LoRa Tracker API Server at:");
  Serial.println(" http://" + WiFi.localIP().toString() + "/");
  Serial.println("📡 Essential API endpoints:");
  Serial.println(" • GET  /api/status    - Get system status");
  Serial.println(" • POST /api/start     - Start tracking");
  Serial.println(" • POST /api/stop      - Stop tracking");
  Serial.println(" • POST /api/reset     - Reset system");
  Serial.println(" • GET  /api/results   - Get tracking results");
  Serial.println(" • GET  /ping          - Health check");
  Serial.println();
}