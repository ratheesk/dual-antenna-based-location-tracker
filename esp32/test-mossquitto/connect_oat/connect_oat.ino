#include <WiFi.h>
#include <ArduinoOTA.h>

const char* ssid = "";
const char* password = "";

const int ledPin = 21; // LED connected to pin 21

void setup() {
  Serial.begin(115200);
  
  // Configure LED pin
  pinMode(ledPin, OUTPUT);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // // Configure OTA
  // ArduinoOTA.setHostname("ESP32-OTA");
  // ArduinoOTA.setPassword("admin"); // Change this if you used a different password
  
  ArduinoOTA.onStart([]() {
    String type;
    if (ArduinoOTA.getCommand() == U_FLASH) {
      type = "sketch";
    } else {
      type = "filesystem";
    }
    Serial.println("Start updating " + type);
  });
  
  ArduinoOTA.onEnd([]() {
    Serial.println("\nEnd");
  });
  
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR) {
      Serial.println("Auth Failed");
    } else if (error == OTA_BEGIN_ERROR) {
      Serial.println("Begin Failed");
    } else if (error == OTA_CONNECT_ERROR) {
      Serial.println("Connect Failed");
    } else if (error == OTA_RECEIVE_ERROR) {
      Serial.println("Receive Failed");
    } else if (error == OTA_END_ERROR) {
      Serial.println("End Failed");
    }
  });

  ArduinoOTA.begin();
  Serial.println("OTA Ready");
  Serial.println("LED on pin 21 will start blinking");
}

void loop() {
  ArduinoOTA.handle(); // Handle OTA updates
  
  // Blink LED on pin 21
  digitalWrite(ledPin, HIGH);  // Turn LED on
  delay(1000);                  // Wait 500ms
  digitalWrite(ledPin, LOW);   // Turn LED off
  delay(1000);                  // Wait 500ms
}