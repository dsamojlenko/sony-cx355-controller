#include <Arduino.h>
#include "SlinkDecoder.h"

const int SLINK_RX_PIN = 34;

SlinkDecoder slink(SLINK_RX_PIN);

// simple callback: prints a concise "Now playing" line when disc/track changes
void onStatus(const SlinkTrackStatus& st) {
    if (!st.haveStatus) return;

    Serial.print(F("[NOW] Player="));
    Serial.print(st.player);
    Serial.print(F(" Disc="));
    Serial.print(st.discNumber);
    Serial.print(F(" Track="));
    Serial.print(st.trackNumber);
    Serial.print(F("  (DiscIdx="));
    Serial.print(st.discIndex);
    Serial.print(F(" TrackIdx="));
    Serial.print(st.trackIndex);
    Serial.println(F(")"));
}

// optional: react to transport codes
void onTransport(uint8_t code) {
    // Already logged by the decoder, but you could:
    // - Drive LEDs
    // - Update UI state
    (void)code; // silence unused warning for now
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println(F("=== Sony CX355 display - PlatformIO RX-only ==="));
    Serial.print(F("RX pin: GPIO "));
    Serial.println(SLINK_RX_PIN);
    Serial.println();

    slink.begin();
    slink.onStatus(onStatus);
    slink.onTransport(onTransport);
}

void loop() {
    slink.loop();
}
