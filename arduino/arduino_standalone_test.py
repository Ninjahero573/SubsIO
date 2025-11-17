"""
Standalone Arduino LED test - sends a full frame directly without the bridge.
This opens the serial port, sends one bright frame, and reads Arduino output.
Usage:
  py -3 arduino_standalone_test.py --port COM3 --baud 115200
"""
import argparse
import serial
import struct
import time

HDR = b"\xAA\x55"

def make_packet(frame_leds: int, payload: bytes) -> bytes:
    checksum = sum(payload) & 0xFFFF
    return HDR + struct.pack('<H', frame_leds) + payload + struct.pack('<H', checksum)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True)
    parser.add_argument('--baud', type=int, default=115200)
    parser.add_argument('--segments', default='150,300,300,300')
    args = parser.parse_args()

    segments = [int(x.strip()) for x in args.segments.split(',') if x.strip()]
    total = sum(segments)
    print(f"Total LEDs: {total} (segments: {segments})")

    # Build a full buffer with bright colors per strip
    payload = bytearray(total * 3)

    # Colors for each strip (bright)
    colors = [ (255,0,0), (0,255,0), (0,0,255), (255,255,0) ]

    offset = 0
    for sid, seg in enumerate(segments):
        if seg <= 0:
            continue
        r, g, b = colors[sid % len(colors)]
        for i in range(seg):
            idx = offset + i
            base = idx * 3
            payload[base] = r & 0xFF
            payload[base + 1] = g & 0xFF
            payload[base + 2] = b & 0xFF
        offset += seg

    packet = make_packet(total, payload)
    print(f"Packet size: {len(packet)} bytes")

    print(f"\nOpening serial {args.port} @ {args.baud}...")
    try:
        ser = serial.Serial(args.port, args.baud, timeout=2)
    except Exception as e:
        print(f"Failed to open port: {e}")
        return

    print("Waiting 1s for Arduino to initialize...")
    time.sleep(1.0)

    # Read any startup messages from Arduino
    print("\n--- Arduino startup output ---")
    while True:
        try:
            data = ser.read(256)
            if data:
                text = data.decode(errors='replace')
                print(text, end='')
            else:
                break
        except Exception:
            break

    print("\n\n--- Sending frame ---")
    try:
        ser.write(packet)
        ser.flush()
        print("✓ Frame sent")
    except Exception as e:
        print(f"✗ Write error: {e}")
        ser.close()
        return

    print("\n--- Arduino response (waiting 2s) ---")
    time.sleep(2.0)
    output = b""
    while True:
        try:
            data = ser.read(256)
            if data:
                output += data
            else:
                break
        except Exception:
            break

    if output:
        print(output.decode(errors='replace'))
    else:
        print("(no response from Arduino)")

    # Check payload sample
    print(f"\n--- Payload sample ---")
    print(f"First strip (RED):  pixels 0-2 = {list(payload[0:9])}")
    print(f"Second strip (GRN): pixels 150-152 = {list(payload[450:459])}")
    print(f"Third strip (BLU):  pixels 450-452 = {list(payload[1350:1359])}")

    ser.close()
    print("\nDone.")

if __name__ == '__main__':
    main()
