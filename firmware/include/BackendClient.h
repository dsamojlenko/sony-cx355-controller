#pragma once

#include <Arduino.h>

// State to send to backend
struct PlayerState {
    int player;      // 1 or 2
    int disc;        // 1-300
    int track;       // 1-99
    const char* state;  // "play", "pause", "stop"
};

// Command received from backend
struct BackendCommand {
    bool valid;
    char action[16];  // "play", "pause", "stop", "next", "previous"
    int player;       // For "play" command (1 or 2)
    int disc;         // For "play" command
    int track;        // For "play" command
    char id[32];      // Command ID for acknowledgment
};

class BackendClient {
public:
    BackendClient();

    // Initialize WiFi and discover backend
    // Returns true if connected successfully
    bool begin();

    // Call in loop() - handles reconnection and polling
    void loop();

    // Send current player state to backend
    // Returns true if sent successfully
    bool sendState(const PlayerState& state);

    // Check if there's a pending command from backend
    // Returns true if command available
    bool hasCommand();

    // Get the pending command (clears it)
    BackendCommand getCommand();

    // Acknowledge a command was executed
    bool acknowledgeCommand(const char* commandId);

    // Status getters
    bool isWifiConnected();
    bool isBackendConnected();
    const char* getBackendHost();
    int getBackendPort();

private:
    // WiFi state
    bool _wifiConnected;
    unsigned long _lastWifiCheck;
    static const unsigned long WIFI_CHECK_INTERVAL = 10000;  // 10 seconds

    // Backend discovery
    bool _backendFound;
    char _backendHost[64];
    int _backendPort;

    // mDNS discovery
    bool _discoverBackend();

    // Command polling
    unsigned long _lastPoll;
    static const unsigned long POLL_INTERVAL = 500;  // 500ms
    BackendCommand _pendingCommand;
    bool _hasPendingCommand;

    // HTTP helpers
    bool _httpPost(const char* path, const char* json);
    bool _httpGet(const char* path, char* response, size_t maxLen);

    // State tracking to avoid duplicate sends
    int _lastPlayer;
    int _lastDisc;
    int _lastTrack;
    const char* _lastState;
};
