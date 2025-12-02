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
    _handleOtherFrame(bytes, len);
}

// Transport frames: 41 40 00 CC
void SlinkDecoder::_handleTransportFrame(const uint8_t* bytes, int len) {
    if (len != 4) return;
    if (bytes[0] != 0x41 || bytes[1] != 0x40 || bytes[2] != 0x00) return;

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

// Helpful OTHER dump (e.g. 41 40 11 10/40/04 etc.)
void SlinkDecoder::_handleOtherFrame(const uint8_t* bytes, int len) {
    if (len >= 4 && bytes[0] == 0x41 && bytes[1] == 0x40 && bytes[2] == 0x11 && bytes[3] != 0x00) {
        Serial.print(F("[OTHER] 41 40 11 "));
        for (int i = 3; i < len; ++i) {
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
