#pragma once

#include <Arduino.h>

// Device addresses for sending commands
// Player 1
#define SLINK_DEV_CDP1_LO  0x90  // Player 1, discs 1-200
#define SLINK_DEV_CDP1_HI  0x93  // Player 1, discs 201-300

// Player 2
#define SLINK_DEV_CDP2_LO  0x92  // Player 2, discs 1-200
#define SLINK_DEV_CDP2_HI  0x95  // Player 2, discs 201-300

// Command codes (second byte)
#define SLINK_CMD_PLAY          0x00
#define SLINK_CMD_STOP          0x01
#define SLINK_CMD_PAUSE         0x03
#define SLINK_CMD_NEXT_TRACK    0x08
#define SLINK_CMD_PREV_TRACK    0x09
#define SLINK_CMD_PLAY_DISC     0x50  // Followed by disc and track bytes
#define SLINK_CMD_POWER_ON      0x2E
#define SLINK_CMD_POWER_OFF     0x2F

class SlinkTx {
public:
    explicit SlinkTx(int txPin);

    void begin();

    // Basic transport commands (affect currently selected player/disc)
    void play();
    void stop();
    void pause();
    void nextTrack();
    void prevTrack();
    void powerOn();
    void powerOff();

    // Play specific disc/track on specific player
    // player: 1 or 2
    // disc: 1-300
    // track: 1-99 (0 = first track)
    void playDisc(int player, int disc, int track = 0);

    // Low-level: send arbitrary command
    void sendCommand(uint8_t device, uint8_t cmd);
    void sendCommand(uint8_t device, uint8_t cmd, uint8_t param1);
    void sendCommand(uint8_t device, uint8_t cmd, uint8_t param1, uint8_t param2);

private:
    int _txPin;

    // Timing constants (microseconds)
    static const unsigned long SYNC_PULSE_US  = 2400;
    static const unsigned long BIT_ONE_US     = 1200;
    static const unsigned long BIT_ZERO_US    = 600;
    static const unsigned long DELIMITER_US   = 600;
    static const unsigned long LINE_READY_US  = 3000;  // Bus must be idle this long

    void _waitForBus();
    void _writeSync();
    void _writeByte(uint8_t b);
    void _writeBit(bool bit);

    // Disc number encoding for commands
    uint8_t _encodeDiscBCD(int disc);
};
