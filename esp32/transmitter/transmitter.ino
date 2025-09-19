// ------------------------
// Libraries
// ------------------------
#include <SPI.h>      // Required for LoRa communication (handles SPI protocol)
#include <LoRa.h>     // LoRa library to manage LoRa operations

// ------------------------
// Pin Definitions
// ------------------------
#define LORA_ACTIVE_LED 22     // LED pin used to indicate LoRa is active

// ------------------------
// Setup Function
// ------------------------
void setup() {
  Serial.begin(115200);           // Start serial communication for debugging
  LoRa.setPins(5, 14, 2);         // Set LoRa module pins: NSS = 5, RESET = 14, DIO0 = 2
  pinMode(LORA_ACTIVE_LED, OUTPUT);       // Set the LED pin as output

  // Initialize LoRa at 418 MHz
  if (!LoRa.begin(418E6)) {
    Serial.println("❌ LoRa init failed!");
    digitalWrite(LORA_ACTIVE_LED, LOW); 
    while (1); // Stay here forever if LoRa fails
  }

  Serial.println("✅ LoRa TX Ready");
  digitalWrite(LORA_ACTIVE_LED, HIGH);    // Turn on LED to indicate LoRa setup was successful
}

// ------------------------
// Main Loop
// ------------------------
void loop() {
  // Start a new LoRa packet
  LoRa.beginPacket();
  LoRa.print("ping");           // Send the message "ping"
  LoRa.endPacket();             // Finish and transmit the packet

  Serial.println("📤 Sent ping");
  delay(500);                   // Wait 500 milliseconds before sending again
}
