#include "BackendClient.h"
#include "secrets.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

BackendClient::BackendClient()
    : _wifiConnected(false)
    , _lastWifiCheck(0)
    , _backendFound(false)
    , _backendPort(BACKEND_PORT)
    , _lastPoll(0)
    , _hasPendingCommand(false)
    , _lastPlayer(-1)
    , _lastDisc(-1)
    , _lastTrack(-1)
    , _lastState(nullptr)
{
    _backendHost[0] = '\0';
    memset(&_pendingCommand, 0, sizeof(_pendingCommand));
}

bool BackendClient::begin() {
    Serial.println(F("[WiFi] Connecting..."));
    Serial.print(F("[WiFi] SSID: "));
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // Wait for connection (with timeout)
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        _wifiConnected = true;
        Serial.print(F("[WiFi] Connected! IP: "));
        Serial.println(WiFi.localIP());

        // Initialize mDNS for discovery
        if (!MDNS.begin("esp32-slink")) {
            Serial.println(F("[mDNS] Failed to start mDNS"));
        } else {
            Serial.println(F("[mDNS] Started as esp32-slink.local"));
        }

        // Try to find backend
        if (!_discoverBackend()) {
            Serial.println(F("[Backend] Not found via mDNS, will retry later"));
        }

        return true;
    } else {
        Serial.println(F("[WiFi] Connection failed!"));
        return false;
    }
}

void BackendClient::loop() {
    unsigned long now = millis();

    // Check WiFi connection periodically
    if (now - _lastWifiCheck > WIFI_CHECK_INTERVAL) {
        _lastWifiCheck = now;

        if (WiFi.status() != WL_CONNECTED) {
            if (_wifiConnected) {
                Serial.println(F("[WiFi] Disconnected, reconnecting..."));
                _wifiConnected = false;
                _backendFound = false;
            }
            WiFi.reconnect();
        } else if (!_wifiConnected) {
            _wifiConnected = true;
            Serial.print(F("[WiFi] Reconnected! IP: "));
            Serial.println(WiFi.localIP());
        }

        // Try to find backend if not found
        if (_wifiConnected && !_backendFound) {
            _discoverBackend();
        }
    }

    // Poll for commands if backend is connected
    if (_backendFound && now - _lastPoll > POLL_INTERVAL) {
        _lastPoll = now;

        if (!_hasPendingCommand) {
            char response[256];
            if (_httpGet("/api/esp32/poll", response, sizeof(response))) {
                // Parse JSON response
                JsonDocument doc;
                DeserializationError error = deserializeJson(doc, response);

                if (!error && doc["action"].is<const char*>()) {
                    // We have a command!
                    _hasPendingCommand = true;
                    strncpy(_pendingCommand.action, doc["action"] | "", sizeof(_pendingCommand.action) - 1);
                    _pendingCommand.player = doc["player"] | 0;
                    _pendingCommand.disc = doc["disc"] | 0;
                    _pendingCommand.track = doc["track"] | 0;
                    strncpy(_pendingCommand.id, doc["id"] | "", sizeof(_pendingCommand.id) - 1);
                    _pendingCommand.valid = true;

                    Serial.print(F("[Backend] Command received: "));
                    Serial.print(_pendingCommand.action);
                    if (_pendingCommand.player > 0) {
                        Serial.print(F(" player="));
                        Serial.print(_pendingCommand.player);
                    }
                    if (_pendingCommand.disc > 0) {
                        Serial.print(F(" disc="));
                        Serial.print(_pendingCommand.disc);
                    }
                    if (_pendingCommand.track > 0) {
                        Serial.print(F(" track="));
                        Serial.print(_pendingCommand.track);
                    }
                    Serial.println();
                }
            }
        }
    }
}

bool BackendClient::_discoverBackend() {
    // First check if we have a hardcoded address
    if (strlen(BACKEND_HOST) > 0) {
        strncpy(_backendHost, BACKEND_HOST, sizeof(_backendHost) - 1);
        _backendPort = BACKEND_PORT;
        _backendFound = true;
        Serial.print(F("[Backend] Using hardcoded address: "));
        Serial.print(_backendHost);
        Serial.print(F(":"));
        Serial.println(_backendPort);
        return true;
    }

    // Get our own IP to validate discovered IPs are on same subnet
    IPAddress myIP = WiFi.localIP();
    Serial.print(F("[mDNS] Our IP: "));
    Serial.println(myIP);

    // Try mDNS discovery
    Serial.println(F("[mDNS] Searching for _cdjukebox._tcp service..."));

    int n = MDNS.queryService("cdjukebox", "tcp");

    if (n > 0) {
        // Use IP address directly (hostname resolution is unreliable)
        IPAddress ip = MDNS.IP(0);

        Serial.print(F("[mDNS] Raw result: "));
        Serial.print(ip);
        Serial.print(F(":"));
        Serial.println(MDNS.port(0));

        // Validate the IP looks reasonable (same first 3 octets as us, not .0 or .255)
        if (ip[0] == myIP[0] && ip[1] == myIP[1] && ip[2] == myIP[2] &&
            ip[3] != 0 && ip[3] != 255) {
            snprintf(_backendHost, sizeof(_backendHost), "%d.%d.%d.%d",
                     ip[0], ip[1], ip[2], ip[3]);
            _backendPort = MDNS.port(0);
            _backendFound = true;

            Serial.print(F("[mDNS] Found backend: "));
            Serial.print(_backendHost);
            Serial.print(F(":"));
            Serial.println(_backendPort);

            return true;
        } else {
            Serial.println(F("[mDNS] Invalid IP returned (wrong subnet or broadcast), ignoring"));
        }
    }

    // Try fallback hostname
    Serial.println(F("[mDNS] Service not found, trying cdjukebox.local..."));

    IPAddress ip = MDNS.queryHost("cdjukebox", 2000);
    if (ip != INADDR_NONE && ip[0] != 0) {
        Serial.print(F("[mDNS] Host query result: "));
        Serial.println(ip);

        // Validate the IP
        if (ip[0] == myIP[0] && ip[1] == myIP[1] && ip[2] == myIP[2] &&
            ip[3] != 0 && ip[3] != 255) {
            snprintf(_backendHost, sizeof(_backendHost), "%d.%d.%d.%d",
                     ip[0], ip[1], ip[2], ip[3]);
            _backendPort = BACKEND_PORT;
            _backendFound = true;

            Serial.print(F("[mDNS] Found via hostname: "));
            Serial.print(_backendHost);
            Serial.print(F(":"));
            Serial.println(_backendPort);

            return true;
        } else {
            Serial.println(F("[mDNS] Invalid IP returned, ignoring"));
        }
    }

    Serial.println(F("[mDNS] Backend not found"));
    return false;
}

bool BackendClient::sendState(const PlayerState& state) {
    if (!_backendFound) {
        return false;
    }

    // Avoid sending duplicate states
    if (state.player == _lastPlayer && state.disc == _lastDisc &&
        state.track == _lastTrack && state.state == _lastState) {
        return true;  // Already sent this state
    }

    // Build JSON
    char json[128];
    snprintf(json, sizeof(json),
             "{\"player\":%d,\"disc\":%d,\"track\":%d,\"state\":\"%s\"}",
             state.player, state.disc, state.track, state.state);

    Serial.print(F("[Backend] Sending state: "));
    Serial.println(json);

    if (_httpPost("/api/state", json)) {
        _lastPlayer = state.player;
        _lastDisc = state.disc;
        _lastTrack = state.track;
        _lastState = state.state;
        return true;
    }

    return false;
}

bool BackendClient::hasCommand() {
    return _hasPendingCommand;
}

BackendCommand BackendClient::getCommand() {
    BackendCommand cmd = _pendingCommand;
    _hasPendingCommand = false;
    memset(&_pendingCommand, 0, sizeof(_pendingCommand));
    return cmd;
}

bool BackendClient::acknowledgeCommand(const char* commandId) {
    if (!_backendFound || !commandId || commandId[0] == '\0') {
        return false;
    }

    char json[64];
    snprintf(json, sizeof(json), "{\"id\":\"%s\",\"success\":true}", commandId);

    return _httpPost("/api/esp32/ack", json);
}

bool BackendClient::isWifiConnected() {
    return _wifiConnected && WiFi.status() == WL_CONNECTED;
}

bool BackendClient::isBackendConnected() {
    return _backendFound;
}

const char* BackendClient::getBackendHost() {
    return _backendHost;
}

int BackendClient::getBackendPort() {
    return _backendPort;
}

bool BackendClient::_httpPost(const char* path, const char* json) {
    if (!_wifiConnected || !_backendFound) {
        return false;
    }

    HTTPClient http;

    char url[128];
    snprintf(url, sizeof(url), "http://%s:%d%s", _backendHost, _backendPort, path);

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(10000);  // 10 second timeout

    int httpCode = http.POST(json);
    http.end();

    if (httpCode == HTTP_CODE_OK) {
        return true;
    } else {
        Serial.print(F("[HTTP] POST failed: "));
        Serial.print(httpCode);
        // Print human-readable error for negative codes
        if (httpCode < 0) {
            Serial.print(F(" ("));
            switch (httpCode) {
                case -1: Serial.print(F("CONNECTION_REFUSED")); break;
                case -2: Serial.print(F("SEND_HEADER_FAILED")); break;
                case -3: Serial.print(F("SEND_PAYLOAD_FAILED")); break;
                case -4: Serial.print(F("NOT_CONNECTED")); break;
                case -5: Serial.print(F("CONNECTION_LOST")); break;
                case -6: Serial.print(F("NO_STREAM")); break;
                case -7: Serial.print(F("NO_HTTP_SERVER")); break;
                case -8: Serial.print(F("TOO_LESS_RAM")); break;
                case -9: Serial.print(F("ENCODING")); break;
                case -10: Serial.print(F("STREAM_WRITE")); break;
                case -11: Serial.print(F("READ_TIMEOUT")); break;
                default: Serial.print(F("UNKNOWN")); break;
            }
            Serial.print(F(")"));
        }
        Serial.println();
        return false;
    }
}

bool BackendClient::_httpGet(const char* path, char* response, size_t maxLen) {
    if (!_wifiConnected || !_backendFound) {
        return false;
    }

    HTTPClient http;

    char url[128];
    snprintf(url, sizeof(url), "http://%s:%d%s", _backendHost, _backendPort, path);

    http.begin(url);
    http.setTimeout(10000);  // 10 second timeout

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();
        strncpy(response, payload.c_str(), maxLen - 1);
        response[maxLen - 1] = '\0';
        http.end();
        return true;
    } else {
        Serial.print(F("[HTTP] GET failed: "));
        Serial.print(httpCode);
        if (httpCode < 0) {
            Serial.print(F(" ("));
            switch (httpCode) {
                case -1: Serial.print(F("CONNECTION_REFUSED")); break;
                case -2: Serial.print(F("SEND_HEADER_FAILED")); break;
                case -3: Serial.print(F("SEND_PAYLOAD_FAILED")); break;
                case -4: Serial.print(F("NOT_CONNECTED")); break;
                case -5: Serial.print(F("CONNECTION_LOST")); break;
                case -6: Serial.print(F("NO_STREAM")); break;
                case -7: Serial.print(F("NO_HTTP_SERVER")); break;
                case -8: Serial.print(F("TOO_LESS_RAM")); break;
                case -9: Serial.print(F("ENCODING")); break;
                case -10: Serial.print(F("STREAM_WRITE")); break;
                case -11: Serial.print(F("READ_TIMEOUT")); break;
                default: Serial.print(F("UNKNOWN")); break;
            }
            Serial.print(F(")"));
        }
        Serial.println();
        http.end();
        return false;
    }
}
