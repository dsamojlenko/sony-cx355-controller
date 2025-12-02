#include "SlinkTx.h"

SlinkTx::SlinkTx(int txPin)
    : _txPin(txPin) {
}

void SlinkTx::begin() {
    pinMode(_txPin, OUTPUT);
    digitalWrite(_txPin, LOW);  // Idle state - transistor off, line floats high
}

// ---- Basic transport commands ----

void SlinkTx::play() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_PLAY);
}

void SlinkTx::stop() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_STOP);
}

void SlinkTx::pause() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_PAUSE);
}

void SlinkTx::nextTrack() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_NEXT_TRACK);
}

void SlinkTx::prevTrack() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_PREV_TRACK);
}

void SlinkTx::powerOn() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_POWER_ON);
}

void SlinkTx::powerOff() {
    sendCommand(SLINK_DEV_CDP1_LO, SLINK_CMD_POWER_OFF);
}

// ---- Play specific disc/track ----

void SlinkTx::playDisc(int player, int disc, int track) {
    uint8_t device;

    // Select device address based on player and disc range
    if (player == 2) {
        device = (disc > 200) ? SLINK_DEV_CDP2_HI : SLINK_DEV_CDP2_LO;
    } else {
        device = (disc > 200) ? SLINK_DEV_CDP1_HI : SLINK_DEV_CDP1_LO;
    }

    // Encode disc number
    uint8_t discByte = _encodeDiscBCD(disc);

    // Encode track as BCD
    uint8_t trackByte = 0;
    if (track > 0 && track <= 99) {
        trackByte = ((track / 10) << 4) | (track % 10);
    }

    Serial.print(F("[TX] playDisc player="));
    Serial.print(player);
    Serial.print(F(" disc="));
    Serial.print(disc);
    Serial.print(F(" track="));
    Serial.print(track);
    Serial.print(F(" -> dev=0x"));
    Serial.print(device, HEX);
    Serial.print(F(" discByte=0x"));
    Serial.print(discByte, HEX);
    Serial.print(F(" trackByte=0x"));
    Serial.println(trackByte, HEX);

    sendCommand(device, SLINK_CMD_PLAY_DISC, discByte, trackByte);
}

// ---- Low-level send functions ----

void SlinkTx::sendCommand(uint8_t device, uint8_t cmd) {
    _waitForBus();
    _writeSync();
    _writeByte(device);
    _writeByte(cmd);
    delay(2);  // Post-command delay
}

void SlinkTx::sendCommand(uint8_t device, uint8_t cmd, uint8_t param1) {
    _waitForBus();
    _writeSync();
    _writeByte(device);
    _writeByte(cmd);
    _writeByte(param1);
    delay(2);
}

void SlinkTx::sendCommand(uint8_t device, uint8_t cmd, uint8_t param1, uint8_t param2) {
    _waitForBus();
    _writeSync();
    _writeByte(device);
    _writeByte(cmd);
    _writeByte(param1);
    _writeByte(param2);
    delay(2);
}

// ---- Private helpers ----

void SlinkTx::_waitForBus() {
    // For now, just a small delay
    // A proper implementation would monitor the RX pin for idle
    delay(5);
}

void SlinkTx::_writeSync() {
    // Sync pulse: drive line LOW for 2400us, then release for 600us
    digitalWrite(_txPin, HIGH);  // Transistor ON = pull line LOW
    delayMicroseconds(SYNC_PULSE_US);
    digitalWrite(_txPin, LOW);   // Transistor OFF = line floats HIGH
    delayMicroseconds(DELIMITER_US);
}

void SlinkTx::_writeByte(uint8_t b) {
    // MSB first
    for (int i = 7; i >= 0; i--) {
        _writeBit((b >> i) & 1);
    }
}

void SlinkTx::_writeBit(bool bit) {
    // Drive line LOW for bit duration, then release
    digitalWrite(_txPin, HIGH);  // Transistor ON = pull line LOW
    if (bit) {
        delayMicroseconds(BIT_ONE_US);
    } else {
        delayMicroseconds(BIT_ZERO_US);
    }
    digitalWrite(_txPin, LOW);   // Transistor OFF = line floats HIGH
    delayMicroseconds(DELIMITER_US);
}

uint8_t SlinkTx::_encodeDiscBCD(int disc) {
    // Disc encoding for S-Link TX commands:
    // 1-99:    Standard BCD (confirmed working)
    // 100-200: (disc - 100) + 0x9A  (disc 100=0x9A, disc 200=0xFE)
    // 201-300: Raw value (disc - 200) as single byte
    //          Device interprets as: disc = 200 + byte_value

    if (disc <= 0) {
        return 0x00;
    } else if (disc <= 99) {
        // Standard BCD: disc 1 = 0x01, disc 99 = 0x99
        return ((disc / 10) << 4) | (disc % 10);
    } else if (disc <= 200) {
        // 100-200: offset encoding
        // disc 100 = 0x9A, disc 150 = 0xCC, disc 200 = 0xFE
        return (disc - 100) + 0x9A;
    } else if (disc <= 300) {
        // 201-300: raw byte value
        // disc 201 → 0x01 (1)
        // disc 210 → 0x0A (10)
        // disc 250 → 0x32 (50)
        // disc 300 → 0x64 (100)
        return (uint8_t)(disc - 200);
    }

    return 0x00;
}
