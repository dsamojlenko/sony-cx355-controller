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

### 2.6 Command Mode Switch
The CDP-CX355 has a 3-position "Command Mode" switch on the back panel. This switch
controls the device's S-Link address and broadcasting behavior.

| Mode | Low-Range Code | High-Range Code | Notes                    |
|------|----------------|-----------------|--------------------------|
| 1    | 0x40           | 0x45            | Default single-player    |
| 2    | 0x41           | 0x46 (assumed)  | Multi-player middle      |
| 3    | 0x44           | 0x51            | Multi-player secondary   |

**Important Discovery**: Only the device set to **Command Mode 3** broadcasts:
- Heartbeat frames (41 04 00 55) — sent periodically regardless of which player is active
- Extended status frames (14-byte EXT14) — shows Mode 3's own loaded disc, not system-wide
- Time status frames — **only when the Mode 3 device itself is playing**

Devices in Command Mode 1 or 2 only send track status frames when their state changes.

**Recommended Configuration** (per Sony manual for two players):
- Player 1: Command Mode 1 (device 0x40/0x45)
- Player 2: Command Mode 3 (device 0x44/0x51)

**Limitation**: Time frames are only available when the Mode 3 device is playing. In a
two-player setup, elapsed time cannot be obtained when the Mode 1 device is playing.
This makes time display impractical for multi-player configurations.

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
| 2      | 0x92        | 0x95          |

Command codes (second byte):
- 0x00 = Play
- 0x01 = Stop
- 0x03 = Pause (toggle)
- 0x08 = Next track
- 0x09 = Previous track
- 0x50 = Play disc/track (followed by disc byte, track byte)
- 0x2E = Power on
- 0x2F = Power off

Additional commands (partially tested):
- 0x10 = Seek forward (confirmed - audible fast playback)
- 0x11 = Seek backward (confirmed)
- 0x12 = Seek forward (confirmed)
- 0x13 = Seek backward (confirmed)

Untested commands (from other S-Link implementations, needs verification):
- 0x0A = Seek forward (?)
- 0x0B = Seek backward (?)
- 0x34 = Disc skip forward (?)
- 0x35 = Disc skip backward (?)

Disc number encoding for TX:
| Range   | Encoding                    | Example                |
|---------|-----------------------------|------------------------|
| 1-99    | Standard BCD                | disc 50 → 0x50         |
| 100-200 | (disc - 100) + 0x9A         | disc 150 → 0xCC        |
| 201-300 | Raw byte (disc - 200)       | disc 250 → 0x32 (50)   |

Track encoding: Standard BCD (track 5 → 0x05, track 12 → 0x12)

## 4. Reverse-Engineering Findings

### 4.1 Frame Types

Transport (4-byte frame):
```
41 [DEV] 00 [CODE]
```
Device codes: 0x40 (Mode 1), 0x44 (Mode 3) — see section 2.6 for Command Mode mapping

Transport codes:
- 0x00 → play
- 0x01 → stop (also in 4.4 below)
- 0x04 → pause
- 0x40 → transition/loading
- 0x50 → near end of track (~30 seconds before track ends)

Heartbeat:
- 41 04 00 55 → periodic heartbeat from Mode 3 device (every few seconds)

Unknown 4-byte frames (need investigation):
- 41 04 04 11 → observed from Mode 3 device during playback, purpose unknown

Status (12-byte frame):
```
41 [DEV] 11 00 [D1] [D2] [T1] [T2] [X1] [X2] [X3] [X4]
```

Device codes by Command Mode and disc range (see section 2.6):
| Mode | Discs 1-200 | Discs 201-300 |
|------|-------------|---------------|
| 1    | 0x40        | 0x45          |
| 2    | 0x41        | 0x46 (assumed)|
| 3    | 0x44        | 0x51          |

Note: The "Player 1" and "Player 2" terminology in Sony documentation refers to
Command Mode settings, not physical device identity. Any CDP-CX355 unit can use
any Command Mode.

Extended Status (14-byte frame):
```
41 [DEV] 15 00 [10 bytes payload]
```
Example: `41 51 15 00 00 00 50 00 00 00 00 01 00 00` (Mode 3, disc 201)

These frames appear periodically (every few seconds) and indicate a disc is LOADED
in the player, not necessarily that it's playing. **Only devices in Command Mode 3
send these frames** (see section 2.6). They use the same device codes as the 12-byte
status frames.

Observed payload structure for high-range discs (201-300):
- Byte 11 contains raw disc offset (disc 201 = 0x01, disc 250 = 0x32)
- Byte 6 value 0x50 observed (purpose TBD - possibly track or time related)
- Low-range devices (1-200) do NOT appear to send 14-byte frames (needs confirmation)

Time Status (12-byte frame):
```
41 [DEV] 11 01 [4] [5] [6] [7] [MT] [MO] [ST] [SO]
```
- Bytes 4-7: Constant/unknown (observed: 00 01 00 01)
- Byte 8 (MT): Minutes tens digit
- Byte 9 (MO): Minutes ones digit
- Byte 10 (ST): Seconds tens digit
- Byte 11 (SO): Seconds ones digit

Each digit is encoded using S-Link's power-of-4 scheme (NOT standard BCD):
- 0x00=0, 0x01=1, 0x04=2, 0x05=3, 0x10=4, 0x11=5, 0x14=6, 0x15=7, 0x40=8, 0x41=9

Example: `41 44 11 01 00 01 00 01 00 01 04 05` = Mode 3 device at 1:23 elapsed
- MT=0x00 (0), MO=0x01 (1) → 01 minutes
- ST=0x04 (2), SO=0x05 (3) → 23 seconds

**Only devices in Command Mode 3 send time frames, and only when that device is playing**
(see section 2.6). These frames stream continuously during playback with elapsed track
time. The device code is always the low-range code (0x44 for Mode 3) regardless of which
disc number is being played.

**Practical limitation**: In a two-player setup, time frames are unavailable when the
Mode 1 device is playing. This makes elapsed time display unreliable for multi-player
configurations.

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
- **No status request command exists**: Scanned command codes 0x02-0x5F without finding any
  command that triggers a status response. The device only broadcasts status on state changes.
  Workaround: Track state from received frames; on startup, assume unknown state until first
  status frame is received (or trigger a state change like pause/unpause).
- 14-byte extended status frames: disc decoding works for high-range (201-300), low-range encoding TBD
- RX decoding could be rewritten using ESP32 RMT for robustness
- Command Mode 2 high-range device code (0x46) is assumed but not confirmed
- TX timing uses simple delays; could be improved with interrupt-based approach
- Time/heartbeat/EXT14 frames only come from Command Mode 3 device; if no device is in
  Mode 3, these frames won't be available on the bus

## 6. Next Steps
- Modularize firmware
- Add UI & display
- Create disc database in SPIFFS/SD
- Consider ESP32 web UI
- Improve TX bus behavior
- Add full 300-disc lookup table

## 7. Summary
This project reverse-engineers undocumented details of the Sony CX355 S-Link behavior, enabling an ESP32 to reliably decode disc and track numbers across the full 300-disc range. This document provides context for all future contributors.
