# Sony CX355 S‑Link Reverse Engineering — Technical Notes

## 1. S‑Link Overview
Sony Control‑A1 is a bidirectional serial bus using pulse‑width modulation:
- Sync: ~2400 µs low
- “1” bit: ~1200 µs low
- “0” bit: ~600 µs low
- Each bit ends with a ~600 µs high delimiter.

Frames begin with:
```
41 40 …
```

## 2. Frame Types
### Transport (4 bytes)
Examples:
```
41 40 00 00   idle
41 40 00 40   STOP
41 40 00 04   PAUSE toggle
```

### Status (12 bytes)
```
41 40 11 00  [DiscHi] [DiscLo] [TrackHi] [TrackLo] [A] [B] [C] [D]
```

A/B/C/D vary with track position but do **not** encode disc/track.

## 3. Disc/Track Decoding

### Discs 1–199 (Player 1)
DiscCode maps linearly:
```
DiscNumber = DiscCode
```

### Disc 200
DiscCode:
```
55 54 → 200
```

### Discs 201–300 (Player 2)
When Player 2 is disconnected, these discs emit NO frames.
With Player 2 connected, DiscCodes follow a second lookup pattern.

Decoder must track which unit emitted the frame.

## 4. Track Decoding
TrackCode = TrackNumber  
Confirmed reliable up to at least track 99.

## 5. Hardware Architecture
### RX Path
- 2N3904 transistor inverts + level shifts S‑Link
- Collector → ESP32 GPIO34 → 47k → 3.3V

### TX Path
- ESP32 drives 2N3904 to pull line low
- Collector connected to S‑Link pin

## 6. Firmware Architecture
- Pulse ISR decoder  
- Frame parser  
- Disc/track extraction  
- Player‑number inference  
- Event hooks for UI/display

## 7. Findings
✔ Full decoding for discs 1–199  
✔ Decoding for 200–300 when Player 2 is present  
✔ Reliable TX/RX when both players are connected  
✔ Verified against Ircama’s Sony_SLink reference implementation  

