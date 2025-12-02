# CONTEXT.md — Sony CX355 Display Project Context

## 1. Project Overview
This project builds a custom external display system for the Sony CDP-CX355 300-disc CD changer using an ESP32. Its goal is to show:

- Current disc number
- Current track number
- Transport state (Play, Pause, Stop)
- Eventually CD metadata from a local database

Two CDP-CX355 units are connected (Player 1 and Player 2), each providing 300 disc slots.

## 2. Hardware Summary

### 2.1 ESP32-WROOM-32D
3.3V logic, dual-core, ideal for decoding and higher-level features.

### 2.2 S-Link Bus
- Single-wire bidirectional serial bus
- Open-collector 5V
- Idle high via internal Sony pull-up
- Data represented by pulse-width encoding

### 2.3 RX Circuit
- 2N3904 transistor
- 22k base resistor → S-Link line
- Emitter → GND
- Collector → ESP32 GPIO 34
- 10k pull-up to 3.3V

### 2.4 TX Circuit
- 2N3904 transistor
- 1k base resistor from GPIO 25
- Emitter → GND
- Collector → S-Link line

ESP32 pulls the line LOW through the transistor, never drives it HIGH.

### 2.5 Grounding
ESP32 GND must connect to the Sony chassis.

## 3. Software Architecture

```
sony-cx355-display/
  firmware/
    src/
      main.cpp
      slink_rx.cpp
      slink_tx.cpp
      decoder.cpp
    include/
```

### 3.1 RX Module
- Reads pulse widths
- Converts pulses into bits
- Assembles bytes and frames

### 3.2 Decoder Module
- Detects valid status frames
- Extracts disc & track
- Handles 1–300 disc mapping
- Handles PLAY/STOP/PAUSE

### 3.3 TX Module
Sends commands to control the CD changers via S-Link.

Device addresses for TX commands:
| Player | Discs 1-200 | Discs 201-300 |
|--------|-------------|---------------|
| 1      | 0x90        | 0x93          |
| 2      | 0x92        | 0x95 (unconfirmed) |

Command codes (second byte):
- 0x00 = Play
- 0x01 = Stop
- 0x03 = Pause (toggle)
- 0x08 = Next track
- 0x09 = Previous track
- 0x50 = Play disc/track (followed by disc byte, track byte)
- 0x2E = Power on
- 0x2F = Power off

Disc number encoding for TX:
| Range   | Encoding                    | Example                |
|---------|-----------------------------|------------------------|
| 1-99    | Standard BCD                | disc 50 → 0x50         |
| 100-200 | (disc - 100) + 0x9A         | disc 150 → 0xCC        |
| 201-300 | Raw byte (disc - 200)       | disc 250 → 0x32 (50)   |

Track encoding: Standard BCD (track 5 → 0x05, track 12 → 0x12)

## 4. Reverse-Engineering Findings

### 4.1 Frame Types

Transport:
- 41 40 00 00 → stop
- 41 40 00 04 → pause
- 41 40 00 40 → transition
- 41 04 00 55 → transition/noise

Status (12-byte extended frame):
```
41 [DEV] 11 00 [D1] [D2] [T1] [T2] [X1] [X2] [X3] [X4]
```

Device codes by player and disc range:
| Player | Discs 1-200 | Discs 201-300 |
|--------|-------------|---------------|
| 1      | 0x40        | 0x45          |
| 2      | 0x44        | 0x51          |

Note: The pattern for additional players is unclear. Player 2's low-range code
(0x44) is +4 from Player 1 (0x40), but the high-range codes don't follow an
obvious arithmetic progression.

### 4.2 Disc Number Encoding (300 discs)

#### Discs 1–99
Standard BCD-like.

#### Discs 100–199
HEX-54 scheme from old Sony docs.

#### Discs 200–300
Undocumented. Mapping derived from captured frames.

### 4.3 Track Encoding
BCD-like; reliable.

### 4.4 Transport State Codes
- 0x00 → STOP
- 0x04 → PAUSE
- 0x40 / 0x14 → loading or transitional

## 5. Known Limitations
- Extended 14-byte frames not decoded
- Track time not decoded yet
- RX decoding could be rewritten using ESP32 RMT for robustness
- Device codes for Player 3+ are unknown (would need hardware to test)
- TX timing uses simple delays; could be improved with interrupt-based approach

## 6. Next Steps
- Modularize firmware
- Add UI & display
- Create disc database in SPIFFS/SD
- Consider ESP32 web UI
- Improve TX bus behavior
- Add full 300-disc lookup table

## 7. Summary
This project reverse-engineers undocumented details of the Sony CX355 S-Link behavior, enabling an ESP32 to reliably decode disc and track numbers across the full 300-disc range. This document provides context for all future contributors.
