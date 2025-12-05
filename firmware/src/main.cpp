#include <Arduino.h>
#include "SlinkDecoder.h"
#include "SlinkTx.h"
#include "BackendClient.h"

const int SLINK_RX_PIN = 34;
const int SLINK_TX_PIN = 25;

SlinkDecoder slink(SLINK_RX_PIN);
SlinkTx slinkTx(SLINK_TX_PIN);
BackendClient backend;

// Track current state for backend updates
SlinkTrackStatus currentState;

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

    // Update current state for backend
    currentState = st;

    // Send to backend
    if (backend.isBackendConnected()) {
        PlayerState ps;
        ps.player = st.player;
        ps.disc = st.discNumber;
        ps.track = st.trackNumber;
        ps.state = st.playing ? "play" : (st.paused ? "pause" : "stop");
        backend.sendState(ps);
    }
}

// React to transport codes (play/pause/stop) and update backend
void onTransport(uint8_t code) {
    // Update our local state based on transport code
    switch (code) {
        case 0x00: // PLAY
            currentState.playing = true;
            currentState.paused = false;
            currentState.stopped = false;
            break;
        case 0x04: // PAUSE
            currentState.playing = false;
            currentState.paused = true;
            currentState.stopped = false;
            break;
        case 0x01: // STOP
            currentState.playing = false;
            currentState.paused = false;
            currentState.stopped = true;
            break;
        default:
            return; // Don't send update for unknown codes
    }

    // Send updated state to backend (if we have disc/track info)
    if (backend.isBackendConnected() && currentState.haveStatus) {
        PlayerState ps;
        ps.player = currentState.player;
        ps.disc = currentState.discNumber;
        ps.track = currentState.trackNumber;
        ps.state = currentState.playing ? "play" : (currentState.paused ? "pause" : "stop");
        backend.sendState(ps);
    }
}

// Parse hex byte from string, returns -1 on error
int parseHexByte(const char* str) {
    if (!str[0] || !str[1]) return -1;  // Need at least 2 chars

    int val = 0;
    for (int i = 0; i < 2; i++) {
        val <<= 4;
        char c = str[i];
        if (c >= '0' && c <= '9') val |= (c - '0');
        else if (c >= 'a' && c <= 'f') val |= (c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') val |= (c - 'A' + 10);
        else return -1;
    }
    return val;
}

void printHelp() {
    Serial.println(F("=== S-Link TX Commands ==="));
    Serial.println(F("  p  - Play"));
    Serial.println(F("  s  - Stop"));
    Serial.println(F("  a  - Pause (toggle)"));
    Serial.println(F("  n  - Next track"));
    Serial.println(F("  b  - Previous track (back)"));
    Serial.println(F("  +  - Power on"));
    Serial.println(F("  -  - Power off"));
    Serial.println(F("  d<num>        - Play disc (e.g., d125)"));
    Serial.println(F("  d<num>t<num>  - Play disc & track (e.g., d125t5)"));
    Serial.println(F("  2d<num>       - Play disc on Player 2 (e.g., 2d50)"));
    Serial.println(F("  x<DD><CC>[<P1><P2>] - Raw hex: dev, cmd, params (e.g., x9050FE01)"));
    Serial.println(F("  scan<HH>-<HH> - Scan device addresses with PLAY cmd (e.g., scan90-9F)"));
    Serial.println(F("  cmdscan<DD>,<HH>-<HH> - Scan cmd codes to device (e.g., cmdscan90,20-2F)"));
    Serial.println(F("  h  - Show this help"));
    Serial.println();
}

void handleSerialCommand() {
    static char cmdBuf[32];
    static int cmdLen = 0;

    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') {
            if (cmdLen > 0) {
                cmdBuf[cmdLen] = '\0';

                // Parse command
                int player = 1;
                int idx = 0;

                // Check for player prefix (e.g., "2d50")
                if (cmdBuf[0] == '2') {
                    player = 2;
                    idx = 1;
                }

                // Check for multi-character commands first
                if (strncmp(&cmdBuf[idx], "scan", 4) == 0) {
                    // Parse scan<start>-<end> e.g., scan90-9F
                    int i = idx + 4;

                    int startAddr = parseHexByte(&cmdBuf[i]);
                    if (startAddr < 0) {
                        Serial.println(F("[ERR] Invalid start address"));
                        cmdLen = 0;
                        return;
                    }
                    i += 2;
                    if (cmdBuf[i] != '-') {
                        Serial.println(F("[ERR] Expected '-' between addresses"));
                        cmdLen = 0;
                        return;
                    }
                    i++;
                    int endAddr = parseHexByte(&cmdBuf[i]);
                    if (endAddr < 0) {
                        Serial.println(F("[ERR] Invalid end address"));
                        cmdLen = 0;
                        return;
                    }

                    Serial.print(F("[SCAN] Sending PLAY (0x00) to devices 0x"));
                    Serial.print(startAddr, HEX);
                    Serial.print(F(" - 0x"));
                    Serial.println(endAddr, HEX);
                    Serial.println(F("Watch for player response..."));

                    for (int addr = startAddr; addr <= endAddr; addr++) {
                        Serial.print(F("  Trying 0x"));
                        Serial.println(addr, HEX);
                        slinkTx.sendCommand(addr, SLINK_CMD_PLAY);
                        delay(500);  // Wait between attempts to see response
                    }
                    Serial.println(F("[SCAN] Done"));
                    cmdLen = 0;
                    return;
                }

                // Check for cmdscan command: cmdscan<dev>,<start>-<end>
                if (strncmp(&cmdBuf[idx], "cmdscan", 7) == 0) {
                    int i = idx + 7;

                    int devAddr = parseHexByte(&cmdBuf[i]);
                    if (devAddr < 0) {
                        Serial.println(F("[ERR] Invalid device address"));
                        cmdLen = 0;
                        return;
                    }
                    i += 2;
                    if (cmdBuf[i] != ',') {
                        Serial.println(F("[ERR] Expected ',' after device address"));
                        cmdLen = 0;
                        return;
                    }
                    i++;
                    int startCmd = parseHexByte(&cmdBuf[i]);
                    if (startCmd < 0) {
                        Serial.println(F("[ERR] Invalid start command"));
                        cmdLen = 0;
                        return;
                    }
                    i += 2;
                    if (cmdBuf[i] != '-') {
                        Serial.println(F("[ERR] Expected '-' between command codes"));
                        cmdLen = 0;
                        return;
                    }
                    i++;
                    int endCmd = parseHexByte(&cmdBuf[i]);
                    if (endCmd < 0) {
                        Serial.println(F("[ERR] Invalid end command"));
                        cmdLen = 0;
                        return;
                    }

                    Serial.print(F("[CMDSCAN] Sending cmds 0x"));
                    Serial.print(startCmd, HEX);
                    Serial.print(F(" - 0x"));
                    Serial.print(endCmd, HEX);
                    Serial.print(F(" to device 0x"));
                    Serial.println(devAddr, HEX);
                    Serial.println(F("Watch for status response frames..."));
                    Serial.println(F("(2 second delay between commands)"));

                    for (int cmdCode = startCmd; cmdCode <= endCmd; cmdCode++) {
                        Serial.print(F("  >> 0x"));
                        Serial.print(devAddr, HEX);
                        Serial.print(F(" 0x"));
                        Serial.println(cmdCode, HEX);
                        slinkTx.sendCommand(devAddr, cmdCode);
                        // Longer delay to watch for responses
                        delay(2000);
                    }
                    Serial.println(F("[CMDSCAN] Done"));
                    cmdLen = 0;
                    return;
                }

                char cmd = cmdBuf[idx];

                switch (cmd) {
                    case 'p':
                        Serial.println(F("[CMD] Play"));
                        slinkTx.play();
                        break;
                    case 's':
                        Serial.println(F("[CMD] Stop"));
                        slinkTx.stop();
                        break;
                    case 'a':
                        Serial.println(F("[CMD] Pause"));
                        slinkTx.pause();
                        break;
                    case 'n':
                        Serial.println(F("[CMD] Next track"));
                        slinkTx.nextTrack();
                        break;
                    case 'b':
                        Serial.println(F("[CMD] Previous track"));
                        slinkTx.prevTrack();
                        break;
                    case '+':
                        Serial.println(F("[CMD] Power on"));
                        slinkTx.powerOn();
                        break;
                    case '-':
                        Serial.println(F("[CMD] Power off"));
                        slinkTx.powerOff();
                        break;
                    case 'd': {
                        // Parse disc number and optional track
                        int disc = 0;
                        int track = 0;
                        int i = idx + 1;

                        // Parse disc number
                        while (cmdBuf[i] >= '0' && cmdBuf[i] <= '9') {
                            disc = disc * 10 + (cmdBuf[i] - '0');
                            i++;
                        }

                        // Check for 't' followed by track number
                        if (cmdBuf[i] == 't') {
                            i++;
                            while (cmdBuf[i] >= '0' && cmdBuf[i] <= '9') {
                                track = track * 10 + (cmdBuf[i] - '0');
                                i++;
                            }
                        }

                        if (disc > 0) {
                            Serial.print(F("[CMD] Play Player "));
                            Serial.print(player);
                            Serial.print(F(" Disc "));
                            Serial.print(disc);
                            if (track > 0) {
                                Serial.print(F(" Track "));
                                Serial.print(track);
                            }
                            Serial.println();
                            slinkTx.playDisc(player, disc, track);
                        } else {
                            Serial.println(F("[ERR] Invalid disc number"));
                        }
                        break;
                    }
                    case 'x': {
                        // Raw hex command: x<dev><cmd>[<p1><p2>]
                        // e.g., x9050FE01 = dev 0x90, cmd 0x50, p1 0xFE, p2 0x01
                        int i = idx + 1;
                        int dev = parseHexByte(&cmdBuf[i]);
                        if (dev < 0) {
                            Serial.println(F("[ERR] Invalid device hex"));
                            break;
                        }
                        i += 2;
                        int cmd = parseHexByte(&cmdBuf[i]);
                        if (cmd < 0) {
                            Serial.println(F("[ERR] Invalid command hex"));
                            break;
                        }
                        i += 2;

                        Serial.print(F("[RAW] dev=0x"));
                        Serial.print(dev, HEX);
                        Serial.print(F(" cmd=0x"));
                        Serial.print(cmd, HEX);

                        // Check for optional params
                        int p1 = parseHexByte(&cmdBuf[i]);
                        if (p1 >= 0) {
                            i += 2;
                            int p2 = parseHexByte(&cmdBuf[i]);
                            if (p2 >= 0) {
                                Serial.print(F(" p1=0x"));
                                Serial.print(p1, HEX);
                                Serial.print(F(" p2=0x"));
                                Serial.println(p2, HEX);
                                slinkTx.sendCommand(dev, cmd, p1, p2);
                            } else {
                                Serial.print(F(" p1=0x"));
                                Serial.println(p1, HEX);
                                slinkTx.sendCommand(dev, cmd, p1);
                            }
                        } else {
                            Serial.println();
                            slinkTx.sendCommand(dev, cmd);
                        }
                        break;
                    }
                    case 'h':
                    case '?':
                        printHelp();
                        break;
                    default:
                        Serial.print(F("[ERR] Unknown command: "));
                        Serial.println(cmdBuf);
                        printHelp();
                        break;
                }

                cmdLen = 0;
            }
        } else if (cmdLen < (int)sizeof(cmdBuf) - 1) {
            cmdBuf[cmdLen++] = c;
        }
    }
}

// Helper to send current state to backend
void sendStateToBackend(const char* newState) {
    if (backend.isBackendConnected() && currentState.haveStatus) {
        PlayerState ps;
        ps.player = currentState.player;
        ps.disc = currentState.discNumber;
        ps.track = currentState.trackNumber;
        ps.state = newState;
        backend.sendState(ps);
    }
}

// Process commands received from backend
void processBackendCommand() {
    if (!backend.hasCommand()) return;

    BackendCommand cmd = backend.getCommand();
    if (!cmd.valid) return;

    Serial.print(F("[Backend] Executing: "));
    Serial.println(cmd.action);

    if (strcmp(cmd.action, "play") == 0) {
        if (cmd.player > 0 && cmd.disc > 0) {
            // Play specific disc/track on specific player
            slinkTx.playDisc(cmd.player, cmd.disc, cmd.track > 0 ? cmd.track : 1);
        } else {
            slinkTx.play();
        }
        // Update local state and notify backend
        currentState.playing = true;
        currentState.paused = false;
        currentState.stopped = false;
        sendStateToBackend("play");
    } else if (strcmp(cmd.action, "pause") == 0) {
        slinkTx.pause();
        // Pause is a toggle - flip between play and pause
        if (currentState.paused) {
            // Was paused, now playing
            currentState.playing = true;
            currentState.paused = false;
            sendStateToBackend("play");
        } else {
            // Was playing, now paused
            currentState.playing = false;
            currentState.paused = true;
            sendStateToBackend("pause");
        }
    } else if (strcmp(cmd.action, "stop") == 0) {
        slinkTx.stop();
        currentState.playing = false;
        currentState.paused = false;
        currentState.stopped = true;
        sendStateToBackend("stop");
    } else if (strcmp(cmd.action, "next") == 0) {
        slinkTx.nextTrack();
        // Don't update state - wait for actual track change from CD player
    } else if (strcmp(cmd.action, "previous") == 0) {
        slinkTx.prevTrack();
        // Don't update state - wait for actual track change from CD player
    }

    // Acknowledge the command
    if (cmd.id[0] != '\0') {
        backend.acknowledgeCommand(cmd.id);
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println(F("=== Sony CX355 S-Link Controller ==="));
    Serial.print(F("RX pin: GPIO "));
    Serial.print(SLINK_RX_PIN);
    Serial.print(F("  TX pin: GPIO "));
    Serial.println(SLINK_TX_PIN);
    Serial.println();

    slink.begin();
    slink.onStatus(onStatus);
    slink.onTransport(onTransport);

    slinkTx.begin();

    // Connect to WiFi and find backend
    Serial.println(F("\n--- WiFi Setup ---"));
    if (backend.begin()) {
        if (backend.isBackendConnected()) {
            Serial.print(F("[Backend] Connected to: "));
            Serial.print(backend.getBackendHost());
            Serial.print(F(":"));
            Serial.println(backend.getBackendPort());
        }
    }
    Serial.println();

    printHelp();
}

void loop() {
    slink.loop();
    handleSerialCommand();
    backend.loop();
    processBackendCommand();
}
