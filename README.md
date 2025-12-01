# sony-cx355-display

Firmware and decoding logic for interfacing an ESP32 with Sony CDP‑CX355 CD changers via S‑Link / Control‑A1.

This project listens to S‑Link frames, decodes disc/track information, and will eventually drive an external display.

## Features
- Reads and decodes S‑Link frames
- Extracts disc/track codes and converts to usable numbers
- Supports chained changers (Player 1 + Player 2)
- Sends S‑Link commands (Play/Stop/Status Request)
- ESP32‑optimized pulse decoder

## Requirements
- ESP32 Dev Module  
- 2× 2N3904 transistors (RX + TX)
- RX: 47k pull‑up, 22k base  
- TX: 22k base resistor  
- Shared ground with CD player

## Build (PlatformIO)
```
pio run -t upload
```

If uploading fails, reduce speed in `platformio.ini`:
```
upload_speed = 115200
```

See CONTEXT.md for detailed protocol documentation.
