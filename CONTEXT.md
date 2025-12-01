# CONTEXT.md — Sony CX355 Display Project Context

## 1. Project Overview
This project builds a custom external display system for the Sony CDP-CX355 300-disc CD changer using an ESP32. Its goal is to show:

- Current disc number
- Current track number
- Transport state (Play, Pause, Stop)
- Eventually CD metadata from a local database

Only Player 1 (the 300-disc unit) is used. Player 2 is disconnected.

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
Minimal so far; sends:
- 0x90 0x00 (play)
- 0x90 0x01 (stop)
- 0x90 0x25 (status request)

## 4. Reverse-Engineering Findings

### 4.1 Frame Types

Transport:
- 41 40 00 00 → stop
- 41 40 00 04 → pause
- 41 40 00 40 → transition
- 41 04 00 55 → transition/noise

Status:
```
41 40 11 00 [D1] [D2] [T1] [T2] [X1] [X2] [X3] [X4]
```

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
- Player 2 required for proper bus bias (current hardware setup)
- Extended 14-byte frames not decoded
- Track time not decoded yet
- RX decoding could be rewritten using ESP32 RMT for robustness

## 6. Next Steps
- Modularize firmware
- Add UI & display
- Create disc database in SPIFFS/SD
- Consider ESP32 web UI
- Improve TX bus behavior
- Add full 300-disc lookup table

## 7. Summary
This project reverse-engineers undocumented details of the Sony CX355 S-Link behavior, enabling an ESP32 to reliably decode disc and track numbers across the full 300-disc range. This document provides context for all future contributors.
