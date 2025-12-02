#include "SlinkDecoder.h"

// ---- Timing constants ----

// Gap between frames (µs) – if RX idle for this long, we treat it as end-of-frame
static const unsigned long FRAME_GAP_US = 10000;  // 10 ms

// S-Link mark lengths (µs)
static const unsigned long SLINK_MARK_SYNC  = 2400;  // start bit
static const unsigned long SLINK_MARK_ONE   = 1200;  // logical 1
static const unsigned long SLINK_MARK_ZERO  = 600;   // logical 0

// ---------------- Constructor / setup ----------------

SlinkDecoder::SlinkDecoder(int rxPin)
: _rxPin(rxPin) {
}

void SlinkDecoder::begin() {
    pinMode(_rxPin, INPUT);
    _lastState    = digitalRead(_rxPin);
    _lastChange   = micros();
    _lastActivity = _lastChange;
    _pulseCount   = 0;
    _haveLastSig  = false;

    _state = SlinkTrackStatus{};
}

void SlinkDecoder::onStatus(SlinkStatusCallback cb) {
    _statusCb = cb;
}

void SlinkDecoder::onTransport(SlinkTransportCallback cb) {
    _transportCb = cb;
}

void SlinkDecoder::loop() {
    _rxStep();
}

// ---------------- RX loop & frame assembly ----------------

void SlinkDecoder::_rxStep() {
    unsigned long now = micros();
    int s = digitalRead(_rxPin);

    if (s != _lastState) {
        unsigned long dt = now - _lastChange;
        _lastChange   = now;
        _lastActivity = now;

        if (_pulseCount < MAX_PULSES) {
            _pulses[_pulseCount++] = dt;
        }

        _lastState = s;
    }

    if ((now - _lastActivity) > FRAME_GAP_US && _pulseCount > 0) {
        _flushFrame();
    }
}

void SlinkDecoder::_flushFrame() {
    if (_pulseCount == 0) return;
    _decodeFrame();
    _pulseCount = 0;
}

// ---------------- Pulse classification & frame decode ----------------

char SlinkDecoder::_classifyPulse(unsigned long dt) {
    if (dt > 200000UL) return 'G';                  // huge gap (ignored)
    if (dt >= 2000UL && dt < 5000UL) return 'Y';    // sync (~2400 us)
    if (dt >= 900UL  && dt < 2000UL) return 'L';    // long (~1240 us) = 1
    if (dt < 900UL)  return 'S';                    // short (~650 us) = 0
    return '?';
}

void SlinkDecoder::_decodeFrame() {
    if (_pulseCount < 3) {
        return;
    }

    char symbols[MAX_PULSES];
    for (int i = 0; i < _pulseCount; ++i) {
        symbols[i] = _classifyPulse(_pulses[i]);
    }

    // Find sync 'Y'
    int syncIndex = -1;
    for (int i = 0; i < _pulseCount; ++i) {
        if (symbols[i] == 'Y') {
            syncIndex = i;
            break;
        }
    }
    if (syncIndex < 0) {
        return;
    }

    int bitStart = syncIndex + 1;

    uint8_t bytes[16];
    int byteCount = 0;
    uint8_t curByte = 0;
    int bitsInByte = 0;

    for (int i = bitStart; i < _pulseCount; ++i) {
        char c = symbols[i];
        if (c != 'S' && c != 'L') {
            // stop at non-bit
            break;
        }

        curByte <<= 1;
        if (c == 'L') curByte |= 1;

        bitsInByte++;
        if (bitsInByte == 8) {
            if (byteCount < (int)sizeof(bytes)) {
                bytes[byteCount++] = curByte;
            }
            curByte = 0;
            bitsInByte = 0;
        }
    }

    if (byteCount == 0) {
        return;
    }

    _handleFrame(bytes, byteCount);
}

// ---------------- Frame handlers ----------------

void SlinkDecoder::_handleFrame(const uint8_t* bytes, int len) {
    _handleTransportFrame(bytes, len);
    _handleTrackStatusFrame(bytes, len);
    _handleTimeStatusFrame(bytes, len);
    _handleExtendedStatusFrame(bytes, len);
    _handleHeartbeatFrame(bytes, len);
    _handleOtherFrame(bytes, len);
}

// Transport frames: 41 XX 00 CC (device code varies by player)
// Player 1: 0x40, Player 2: 0x44
void SlinkDecoder::_handleTransportFrame(const uint8_t* bytes, int len) {
    if (len != 4) return;
    if (bytes[0] != 0x41) return;
    // Accept transport frames from any known device (0x40=P1, 0x44=P2)
    uint8_t dev = bytes[1];
    if (dev != 0x40 && dev != 0x44) return;
    if (bytes[2] != 0x00) return;

    uint8_t code = bytes[3];

    switch (code) {
        case 0x00: // PLAY
            _state.playing = true;
            _state.paused  = false;
            _state.stopped = false;
            Serial.println(F("[STATE] PLAY"));
            break;

        case 0x04: // PAUSE
            _state.playing = false;
            _state.paused  = true;
            _state.stopped = false;
            Serial.println(F("[STATE] PAUSE"));
            break;

        case 0x01: // STOP
            _state.playing = false;
            _state.paused  = false;
            _state.stopped = true;
            Serial.println(F("[STATE] STOP"));
            break;

        default:
            Serial.print(F("[STATE] TRANSPORT code 0x"));
            if (code < 0x10) Serial.print('0');
            Serial.println(code, HEX);
            break;
    }

    if (_transportCb) {
        _transportCb(code);
    }
}

// Extended status:
// Player 1: dev=0x40 (discs 1–200) or 0x45 (discs 201–300)
// Player 2: dev=0x44 (discs 1–200) or 0x51 (discs 201–300)
// Frame format: 41 XX 11 00 [8 bytes sig]
void SlinkDecoder::_handleTrackStatusFrame(const uint8_t* bytes, int len) {
    if (len != 12) return;
    if (bytes[0] != 0x41) return;
    if (bytes[2] != 0x11 || bytes[3] != 0x00) return;

    uint8_t dev = bytes[1];

    // Log unknown device codes to help discover new player/range combinations
    if (dev != 0x40 && dev != 0x45 && dev != 0x44 && dev != 0x51) {
        Serial.print(F("[UNKNOWN DEV] 0x"));
        if (dev < 0x10) Serial.print('0');
        Serial.print(dev, HEX);
        Serial.print(F("  Frame: "));
        for (int i = 0; i < len; ++i) {
            if (bytes[i] < 0x10) Serial.print('0');
            Serial.print(bytes[i], HEX);
            if (i < len - 1) Serial.print(' ');
        }
        Serial.println();
    }

    uint8_t sig[8];
    for (int i = 0; i < 8; ++i) {
        sig[i] = bytes[4 + i];
    }

    bool changed = false;
    if (_haveLastSig) {
        for (int i = 0; i < 8; ++i) {
            if (sig[i] != _lastSig[i]) {
                changed = true;
                break;
            }
        }
    } else {
        changed = true;
    }

    for (int i = 0; i < 8; ++i) {
        _lastSig[i] = sig[i];
    }
    _haveLastSig = true;

    uint16_t discCode  = (uint16_t(sig[0]) << 8) | sig[1];
    uint16_t trackCode = (uint16_t(sig[2]) << 8) | sig[3];

    int discIndex  = _decodeIndexFromCode(discCode,  300);
    int trackIndex = _decodeIndexFromCode(trackCode, 200);

    int discNumber  = -1;
    int trackNumber = -1;
    int player = 0;

    // Determine player and decode disc number
    if (discIndex > 0) {
        if (dev == 0x40) {
            // Player 1, discs 1-200
            player = 1;
            discNumber = _decodeDiscNumber_1to200_FromIndex(discIndex);
        } else if (dev == 0x45) {
            // Player 1, discs 201-300
            player = 1;
            discNumber = _decodeDiscNumber_201to300_FromIndex(discIndex);
        } else if (dev == 0x44) {
            // Player 2, discs 1-200
            player = 2;
            discNumber = _decodeDiscNumber_1to200_FromIndex(discIndex);
        } else if (dev == 0x51) {
            // Player 2, discs 201-300
            player = 2;
            discNumber = _decodeDiscNumber_201to300_FromIndex(discIndex);
        }
    }
    if (trackIndex > 0) {
        trackNumber = _decodeTrackNumberFromIndex(trackIndex);
    }

    _state.haveStatus  = true;
    _state.player      = player;
    _state.discCode    = discCode;
    _state.trackCode   = trackCode;
    _state.discIndex   = discIndex;
    _state.trackIndex  = trackIndex;
    _state.discNumber  = discNumber;
    _state.trackNumber = trackNumber;

    if (changed) {
        Serial.print(F("[STATUS] Dev=0x"));
        if (dev < 0x10) Serial.print('0');
        Serial.print(dev, HEX);
        Serial.print(F("  Sig: "));
        for (int i = 0; i < 8; ++i) {
            if (sig[i] < 0x10) Serial.print('0');
            Serial.print(sig[i], HEX);
            if (i < 7) Serial.print(' ');
        }
        Serial.println();

        Serial.print(F("[DECODE] DiscCode=0x"));
        if (discCode < 0x1000) Serial.print('0');
        if (discCode < 0x100)  Serial.print('0');
        if (discCode < 0x10)   Serial.print('0');
        Serial.print(discCode, HEX);

        Serial.print(F("  TrackCode=0x"));
        if (trackCode < 0x1000) Serial.print('0');
        if (trackCode < 0x100)  Serial.print('0');
        if (trackCode < 0x10)   Serial.print('0');
        Serial.println(trackCode, HEX);

        Serial.print(F("[DECODE] DiscIndex="));
        Serial.print(discIndex);
        Serial.print(F("  TrackIndex="));
        Serial.println(trackIndex);

        Serial.print(F("[DECODE] Player="));
        Serial.print(player);
        Serial.print(F("  DiscNumber="));
        Serial.print(discNumber);
        Serial.print(F("  TrackNumber="));
        Serial.println(trackNumber);
    }

    Serial.print(F("[FRAME] 41 "));
    if (dev < 0x10) Serial.print('0');
    Serial.print(dev, HEX);
    Serial.print(F(" 11 00 "));
    for (int i = 4; i < len; ++i) {
        if (bytes[i] < 0x10) Serial.print('0');
        Serial.print(bytes[i], HEX);
        if (i < len - 1) Serial.print(' ');
    }
    Serial.println();

    if (_statusCb) {
        _statusCb(_state);
    }
}

// Time status frames: 12 bytes, 41 XX 11 01 ...
// These appear during playback with elapsed track time
// Frame: 41 [DEV] 11 01 [4 bytes constant?] [2 bytes time MM:SS in BCD]
// Example: 41 44 11 01 00 01 00 01 00 00 05 41 = 5:41 elapsed
void SlinkDecoder::_handleTimeStatusFrame(const uint8_t* bytes, int len) {
    if (len != 12) return;
    if (bytes[0] != 0x41) return;
    if (bytes[2] != 0x11 || bytes[3] != 0x01) return;

    uint8_t dev = bytes[1];

    // Determine player from device code
    int player = 0;
    if (dev == 0x40 || dev == 0x45) {
        player = 1;
    } else if (dev == 0x44 || dev == 0x51) {
        player = 2;
    }

    // Last two bytes are elapsed seconds, encoded using S-Link's power-of-4 scheme
    // byte[10] = tens of seconds (0-5), byte[11] = ones of seconds (0-9)
    // NOT standard BCD! Values like 00,01,04,05,10,11,14,15,40,41... = 0,1,2,3,4,5,6,7,8,9...
    uint8_t secTensCode = bytes[10];
    uint8_t secOnesCode = bytes[11];

    // Decode using power-of-4
    int secTens = _decodeTimeValue(secTensCode);
    int secOnes = _decodeTimeValue(secOnesCode);
    int seconds = secTens * 10 + secOnes;

    // Minutes might be in bytes 8-9? Check what's there
    // For now, just track seconds within the minute
    uint8_t minTensCode = bytes[8];
    uint8_t minOnesCode = bytes[9];
    int minTens = _decodeTimeValue(minTensCode);
    int minOnes = _decodeTimeValue(minOnesCode);
    int minutes = minTens * 10 + minOnes;

    // Suppress unused variable warnings - time data decoded but not logged
    (void)player;
    (void)minutes;
    (void)seconds;

    // Time frames are only available from Command Mode 3 device when playing.
    // Not useful for display since we can't get time from Mode 1 player.
    // Data is decoded above if needed in the future.
}

// Extended status frames: 14 bytes, 41 XX 15 00 ...
// These appear periodically (every few seconds) and indicate disc is loaded
// Frame: 41 [DEV] 15 00 [10 bytes payload]
// Example: 41 51 15 00 00 00 50 00 00 00 00 01 00 00 (Player 2 high-range, disc 201)
void SlinkDecoder::_handleExtendedStatusFrame(const uint8_t* bytes, int len) {
    if (len != 14) return;
    if (bytes[0] != 0x41) return;
    if (bytes[2] != 0x15 || bytes[3] != 0x00) return;

    uint8_t dev = bytes[1];

    // Determine player from device code
    int player = 0;
    bool highRange = false;

    if (dev == 0x40) {
        player = 1;
        highRange = false;
    } else if (dev == 0x45) {
        player = 1;
        highRange = true;
    } else if (dev == 0x44) {
        player = 2;
        highRange = false;
    } else if (dev == 0x51) {
        player = 2;
        highRange = true;
    }

    // Suppress unused variable warnings - data decoded but not logged
    (void)player;
    (void)highRange;

    // EXT14 frames only come from Command Mode 3 device and show its loaded disc.
    // Not useful for system-wide display. Data is decoded above if needed.
}

// Heartbeat frames: 41 04 00 55
// These appear periodically (every few seconds) from Command Mode 3 device
void SlinkDecoder::_handleHeartbeatFrame(const uint8_t* bytes, int len) {
    if (len != 4) return;
    if (bytes[0] != 0x41 || bytes[1] != 0x04 || bytes[2] != 0x00 || bytes[3] != 0x55) return;

    // Heartbeat only comes from Command Mode 3 device.
    // Could be used to detect if that player is powered on.
    // Not logging since it's frequent and not useful for display.
}

// Log all frames that don't match known patterns
void SlinkDecoder::_handleOtherFrame(const uint8_t* bytes, int len) {
    // Skip known frame types:
    // - Transport: 4 bytes, 41 40 00 XX
    // - Track status: 12 bytes, 41 XX 11 00 ...
    // - Time status: 12 bytes, 41 XX 11 01 ...
    // - Extended status: 14 bytes, 41 XX 15 00 ...
    // - Heartbeat: 4 bytes, 41 04 00 55

    bool isTransport = (len == 4 && bytes[0] == 0x41 && (bytes[1] == 0x40 || bytes[1] == 0x44) && bytes[2] == 0x00);
    bool isTrackStatus = (len == 12 && bytes[0] == 0x41 && bytes[2] == 0x11 && bytes[3] == 0x00);
    bool isTimeStatus = (len == 12 && bytes[0] == 0x41 && bytes[2] == 0x11 && bytes[3] == 0x01);
    bool isExtendedStatus = (len == 14 && bytes[0] == 0x41 && bytes[2] == 0x15 && bytes[3] == 0x00);
    bool isHeartbeat = (len == 4 && bytes[0] == 0x41 && bytes[1] == 0x04 && bytes[2] == 0x00 && bytes[3] == 0x55);

    if (!isTransport && !isTrackStatus && !isTimeStatus && !isExtendedStatus && !isHeartbeat) {
        Serial.print(F("[OTHER] len="));
        Serial.print(len);
        Serial.print(F(" data: "));
        for (int i = 0; i < len; ++i) {
            if (bytes[i] < 0x10) Serial.print('0');
            Serial.print(bytes[i], HEX);
            if (i < len - 1) Serial.print(' ');
        }
        Serial.println();
    }
}

// ---------------- Encoding/decoding helpers ----------------

// encodeIndex: given index n, compute 16-bit "power-of-4" representation we see on bus
uint16_t SlinkDecoder::_encodeIndex(uint16_t n) {
    uint16_t code = 0;
    uint16_t bitPos = 0;
    uint16_t temp = n;

    while (temp) {
        if (temp & 1) {
            uint16_t pow4 = 1;
            for (uint16_t i = 0; i < bitPos; ++i) {
                pow4 *= 4;
            }
            code += pow4;
        }
        temp >>= 1;
        bitPos++;
    }
    return code;
}

int SlinkDecoder::_decodeIndexFromCode(uint16_t code, uint16_t maxIndex) {
    for (uint16_t idx = 1; idx <= maxIndex; ++idx) {
        if (_encodeIndex(idx) == code) {
            return (int)idx;
        }
    }
    return -1;
}

// Decode time value from S-Link's power-of-4 encoding (same as index encoding)
// 0x00=0, 0x01=1, 0x04=2, 0x05=3, 0x10=4, 0x11=5, 0x14=6, 0x15=7, 0x40=8, 0x41=9, etc.
int SlinkDecoder::_decodeTimeValue(uint8_t code) {
    // Reverse the power-of-4 encoding: extract pairs of bits
    // Bit positions: 76 54 32 10 -> each pair is 0-3, representing binary digits
    int value = 0;
    value += (code & 0x03);              // bits 1:0 -> ones place (0-3)
    value += ((code >> 2) & 0x03) * 2;   // bits 3:2 -> twos place (0,2,4,6)
    value += ((code >> 4) & 0x03) * 4;   // bits 5:4 -> fours place (0,4,8,12)
    value += ((code >> 6) & 0x03) * 8;   // bits 7:6 -> eights place (0,8,16,24)
    return value;
}

// Track numbers: 1..99 with index = n + 6 * floor(n / 10)
int SlinkDecoder::_decodeTrackNumberFromIndex(int idx) {
    for (int n = 1; n <= 99; ++n) {
        if (n + 6 * (n / 10) == idx) {
            return n;
        }
    }
    return -1;
}

// Disc numbers 1..200 (dev=0x40)
//  1..99:   idx = n + 6 * floor(n / 10)
// 100..200: idx = n + 54
int SlinkDecoder::_decodeDiscNumber_1to200_FromIndex(int idx) {
    if (idx <= 153) {
        for (int n = 1; n <= 99; ++n) {
            if (n + 6 * (n / 10) == idx) {
                return n;
            }
        }
    } else {
        int n = idx - 54;
        if (n >= 100 && n <= 200) {
            return n;
        }
    }
    return -1;
}

// Disc numbers 201..300 (dev=0x45):
//  idx = 1..100, DiscNumber = idx + 200
int SlinkDecoder::_decodeDiscNumber_201to300_FromIndex(int idx) {
    if (idx >= 1 && idx <= 100) {
        return idx + 200;
    }
    return -1;
}
