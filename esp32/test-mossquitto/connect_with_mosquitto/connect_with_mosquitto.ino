#include <WiFi.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>   // MQTT library

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
// Pins
// -----------------
const int ledPin = 21;

// -----------------
// Reconnect function for MQTT
// -----------------
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("connected");
      client.subscribe("esp32/led");   // subscribe to LED control topic
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// -----------------
// Callback when MQTT message arrives
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

  if (String(topic) == "esp32/led") {
    if (msg == "ON") {
      digitalWrite(ledPin, HIGH);
    } else if (msg == "OFF") {
      digitalWrite(ledPin, LOW);
    }
  }
}

void setup() {
  Serial.begin(115200);
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

  // MQTT setup
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  ArduinoOTA.handle();      // OTA service
  if (!client.connected()) {
    reconnectMQTT();        // Ensure MQTT stays connected
  }
  client.loop();            // Handle MQTT messages

  // Publish a status message every 5 seconds
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 5000) {
    lastMsg = millis();
    client.publish("esp32/status", "ESP32 is alive");
  }
}
