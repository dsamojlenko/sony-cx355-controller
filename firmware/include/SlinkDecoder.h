#pragma once

#include <Arduino.h>

struct SlinkTrackStatus {
    bool   playing = false;
    bool   paused  = false;
    bool   stopped = false;

    bool   haveStatus = false;

    uint16_t discCode   = 0;
    uint16_t trackCode  = 0;
    int      discIndex  = -1;
    int      trackIndex = -1;
    int      discNumber = -1;   // 1–300
    int      trackNumber = -1;  // 1–99
    int      player = 0;        // 1 or 2 (0 = unknown)
};

typedef void (*SlinkStatusCallback)(const SlinkTrackStatus& status);
typedef void (*SlinkTransportCallback)(uint8_t code);

class SlinkDecoder {
public:
    explicit SlinkDecoder(int rxPin);

    void begin();
    void loop();

    void onStatus(SlinkStatusCallback cb);
    void onTransport(SlinkTransportCallback cb);

private:
    // config
    int _rxPin;

    // RX pulse buffer
    static const int    MAX_PULSES = 128;
    unsigned long       _pulses[MAX_PULSES];
    int                 _pulseCount = 0;

    int                 _lastState = HIGH;
    unsigned long       _lastChange = 0;
    unsigned long       _lastActivity = 0;

    // last track signature
    uint8_t             _lastSig[8];
    bool                _haveLastSig = false;

    // last logged time (to avoid duplicate logs)
    int                 _lastLoggedMinutes = -1;
    int                 _lastLoggedSeconds = -1;

    // state
    SlinkTrackStatus    _state;

    // callbacks
    SlinkStatusCallback    _statusCb = nullptr;
    SlinkTransportCallback _transportCb = nullptr;

    // low-level helpers
    void   _rxStep();
    void   _flushFrame();
    void   _decodeFrame();
    char   _classifyPulse(unsigned long dt);

    // frame handlers
    void   _handleFrame(const uint8_t* bytes, int len);
    void   _handleTransportFrame(const uint8_t* bytes, int len);
    void   _handleTrackStatusFrame(const uint8_t* bytes, int len);
    void   _handleTimeStatusFrame(const uint8_t* bytes, int len);
    void   _handleExtendedStatusFrame(const uint8_t* bytes, int len);
    void   _handleHeartbeatFrame(const uint8_t* bytes, int len);
    void   _handleOtherFrame(const uint8_t* bytes, int len);

    // encoding/decoding helpers
    uint16_t _encodeIndex(uint16_t n);
    int      _decodeIndexFromCode(uint16_t code, uint16_t maxIndex);
    int      _decodeTimeValue(uint8_t code);
    int      _decodeTrackNumberFromIndex(int idx);
    int      _decodeDiscNumber_1to200_FromIndex(int idx);
    int      _decodeDiscNumber_201to300_FromIndex(int idx);
};
