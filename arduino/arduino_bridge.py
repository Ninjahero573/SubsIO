"""Arduino Bridge

Listens to Socket.IO light_frame events from the Flask server and streams LED
frames to an attached Arduino Due over high‑speed serial.

Usage:
  py -3.11 arduino/arduino_bridge.py --port COM7 --baud 2000000

Requirements:
  pip install pyserial python-socketio requests
"""
import argparse
import socketio
import serial
import struct
import time
import sys
import threading

# Socket.IO client
sio = socketio.Client(reconnection=True, reconnection_attempts=0)

HEADER = b"\xAA\x55"

class ArduinoStreamer:
    def __init__(self, port: str, baud: int, total_leds: int, segments: list[int]):
        self.port_name = port
        self.baud = baud
        self.segments = segments[:]  # e.g., [150,300,300,300]
        self.total_leds = total_leds if total_leds else sum(self.segments)
        # Precompute segment offsets per strip_id
        self.offsets = {}
        running = 0
        for sid, seg_len in enumerate(self.segments):
            self.offsets[sid] = (running, seg_len)
            running += seg_len
        self.ser = None
        self.last_send_time = 0
        self._last_warn = 0.0
        self._monitor = False
        self._monitor_thread = None
        self._frame_interval = 0.050  # Minimum 50ms between frames (20 FPS max) - increased from 20ms for stability
        # Chunking and ACK settings
        self._chunk_size = 512        # bytes per write chunk (tune if needed)
        self._chunk_delay = 0.02      # seconds to wait between chunks
        self._ack_timeout = 2.0       # seconds to wait for Arduino to confirm frame processed
        self._last_frame_processed_ts = 0.0  # timestamp when monitor observed frame confirmation
        # Event to signal when Arduino confirms frame processing (set by monitor thread)
        self._ack_event = threading.Event()
        self.connect_serial()

    def connect_serial(self):
        while True:
            try:
                print(f"[Bridge] Connecting to Arduino on {self.port_name} @ {self.baud} baud...")
                # Close any existing port first
                if self.ser:
                    try:
                        self.ser.close()
                    except:
                        pass
                # Open with write timeout of 2 seconds
                self.ser = serial.Serial(self.port_name, self.baud, timeout=1, write_timeout=2)
                print(f"[Bridge] Port opened, starting monitor thread BEFORE clearing buffers...")
                # ALWAYS start monitor thread to capture Arduino startup and frame confirmations
                # This runs regardless of --monitor flag - we need it to capture startup messages!
                if self._monitor_thread is None or not self._monitor_thread.is_alive():
                    self._start_monitor_thread()
                # Now clear buffers after monitor thread is ready and listening
                time.sleep(0.2)
                self.ser.reset_input_buffer()
                self.ser.reset_output_buffer()
                # Give Arduino time to complete startup sequence (2.5 seconds)
                print(f"[Bridge] Waiting for Arduino startup (2.5s)...")
                time.sleep(2.5)
                print("[Bridge] ✓ Serial connected and ready")
                break
            except Exception as e:
                print(f"[Bridge] ✗ Serial connect failed: {e}")
                print(f"[Bridge] Troubleshooting: Check COM port exists, Arduino is powered, and baud rate is {self.baud}")
                print(f"[Bridge] Retrying in 3s...")
                self.ser = None
                time.sleep(3)

    def enable_monitor(self):
        self._monitor = True
        if self.ser and (self._monitor_thread is None or not self._monitor_thread.is_alive()):
            self._start_monitor_thread()

    def _start_monitor_thread(self):
        def _reader():
            print("[Monitor] Thread started, listening for Arduino messages...")
            buf = bytearray()
            while True:
                try:
                    if not self.ser:
                        time.sleep(0.1)
                        continue
                    data = self.ser.read(256)
                    if not data:
                        time.sleep(0.05)
                        continue
                    buf.extend(data)
                    # Process complete lines
                    while b"\n" in buf:
                        line, _, rest = buf.partition(b"\n")
                        buf = bytearray(rest)
                        try:
                            decoded = line.decode(errors='replace').strip()
                            print(f"[Arduino] {decoded}")
                            # Extract helpful metadata lines and forward to server
                            if decoded.startswith('TOTAL_LEDS=') or decoded.startswith('STRIP_SEGMENTS=') or decoded.startswith('DATA_PINS=') or decoded.startswith('Arduino'):
                                info = {}
                                if 'TOTAL_LEDS=' in decoded:
                                    try:
                                        info['total_leds'] = int(decoded.split('TOTAL_LEDS=')[1])
                                    except Exception:
                                        pass
                                if 'STRIP_SEGMENTS=' in decoded:
                                    try:
                                        segs = decoded.split('STRIP_SEGMENTS=')[1]
                                        info['segments'] = [int(x) for x in segs.split(',') if x.strip()]
                                    except Exception:
                                        pass
                                if 'DATA_PINS=' in decoded:
                                    try:
                                        pins = decoded.split('DATA_PINS=')[1]
                                        info['data_pins'] = [int(x) for x in pins.split(',') if x.strip()]
                                    except Exception:
                                        pass
                                info.setdefault('raw', decoded)
                                try:
                                    sio.emit('arduino_info', info)
                                except Exception:
                                    pass

                            # Track frame confirmations so send_frame can wait for them
                            if 'Frame OK' in decoded or '✓ Frame OK' in decoded or 'Checksum error' in decoded:
                                try:
                                    self._last_frame_processed_ts = time.time()
                                    try:
                                        self._ack_event.set()
                                    except Exception:
                                        pass
                                except Exception:
                                    pass
                        except Exception:
                            # Fallback raw
                            print(f"[Arduino RAW] {line!r}")
                except Exception as e:
                    # Likely disconnect; attempt reconnection
                    print(f"[Monitor] Error: {e}")
                    time.sleep(1.0)

        self._monitor_thread = threading.Thread(target=_reader, daemon=True)
        self._monitor_thread.start()
        time.sleep(0.1)  # Give monitor thread a moment to start listening

    def send_frame(self, strips):
        # Expect list of {strip_id, leds:[ [r,g,b], ... ]}
        # Reconnect if port is dead
        if not self.ser or not self.ser.is_open:
            self.connect_serial()
        
        # Throttle frame rate to prevent buffer overflow on Arduino
        now = time.time()
        elapsed = now - self.last_send_time
        if elapsed < self._frame_interval:
            time.sleep(self._frame_interval - elapsed)
            now = time.time()
        self.last_send_time = now
        
        # Build a full buffer by placing each strip into its configured segment
        led_buffer = bytearray(self.total_leds * 3)
        now = time.time()
        for s in strips:
            sid = s.get('strip_id')
            colors = s.get('leds', [])
            if sid not in self.offsets:
                continue
            seg_offset, seg_len = self.offsets[sid]
            if len(colors) != seg_len and (now - self._last_warn) > 5.0:
                print(f"Note: strip_id={sid} provided {len(colors)} pixels, expected {seg_len}. Filling available; rest remain previous/black.")
                self._last_warn = now
            max_len = min(len(colors), seg_len)
            for i in range(max_len):
                r, g, b = colors[i]
                idx = seg_offset + i
                base = idx * 3
                # Arduino uses NEO_GRB color order, so send as G,R,B not R,G,B
                led_buffer[base] = g & 0xFF
                led_buffer[base + 1] = r & 0xFF
                led_buffer[base + 2] = b & 0xFF
        frame_leds = self.total_leds
        payload = led_buffer
        checksum = sum(payload) & 0xFFFF
        packet = HEADER + struct.pack('<H', frame_leds) + payload + struct.pack('<H', checksum)
        
        # Debug: Print frame info
        print(f"[Bridge] Sending frame: {len(packet)} bytes (header=2, leds={frame_leds}*3={frame_leds*3}, checksum=2), checksum=0x{checksum:04X}")
        
        # Check if port is open before trying to write
        if not self.ser or not self.ser.is_open:
            return  # Skip this frame if port not ready, next one will trigger reconnect
        
        try:
            # Chunked write: send packet in chunks and give Arduino time to consume
            total_len = len(packet)
            bytes_written = 0
            start_ts = time.time()
            expected_ack_ts = self._last_frame_processed_ts
            # clear previous ACK state and prepare to wait for a new confirmation
            try:
                self._ack_event.clear()
            except Exception:
                pass
            for off in range(0, total_len, self._chunk_size):
                end = min(off + self._chunk_size, total_len)
                chunk = packet[off:end]
                wrote = self.ser.write(chunk)
                bytes_written += wrote
                try:
                    self.ser.flush()
                except:
                    pass
                # Small pause to avoid overflowing Arduino RX buffer
                time.sleep(self._chunk_delay)

            if bytes_written != total_len:
                print(f"[Bridge] ✗ Incomplete write: {bytes_written}/{total_len} bytes sent - port unresponsive")
                try:
                    self.ser.close()
                except:
                    pass
                self.ser = None
                return

            print(f"[Bridge] → Frame bytes written: {bytes_written} bytes, waiting for Arduino confirmation (timeout={self._ack_timeout}s)")

            # Wait for Arduino to report that it processed the frame (monitor thread sets the event)
            try:
                got = self._ack_event.wait(timeout=self._ack_timeout)
                if got and self._last_frame_processed_ts > expected_ack_ts:
                    print(f"[Bridge] ✓ Frame confirmed by Arduino (ts={self._last_frame_processed_ts})")
                    return
            except Exception:
                got = False

            # Timed out waiting for frame confirmation
            print(f"[Bridge] ⚠ No frame confirmation received within {self._ack_timeout}s; proceeding but consider reducing frame rate or chunk_size")

        except serial.SerialTimeoutException as e:
            print(f"[Bridge] ✗ Serial write timeout: {e}")
            try:
                self.ser.close()
            except:
                pass
            self.ser = None
        except serial.SerialException as e:
            print(f"[Bridge] ✗ Serial exception: {e}")
            try:
                self.ser.close()
            except:
                pass
            self.ser = None
        except Exception as e:
            print(f"[Bridge] ✗ Unexpected error: {e}")

streamer: ArduinoStreamer | None = None
_last_levels_emit = 0.0

@sio.on('light_frame')
def on_light_frame(data):
    global streamer
    if not streamer:
        return
    
    # Debug: Track frame reception
    strips = data.get('strips', [])
    print(f"[Bridge] Received light_frame event with {len(strips)} strips")
    
    # If port is dead, try to reconnect once per batch
    if not streamer.ser or not streamer.ser.is_open:
        print(f"[Bridge] Port not open, attempting reconnect...")
        streamer.connect_serial()
        # If still not open, skip this frame
        if not streamer.ser or not streamer.ser.is_open:
            print(f"[Bridge] Reconnection failed, skipping frame")
            return
    
    # Sanitize incoming frame data to plain Python lists of ints and provide
    # helpful debug output when monitor mode is enabled.
    sanitized = []
    try:
        for s in strips:
            sid = int(s.get('strip_id', 0))
            leds = s.get('leds', []) or []
            clean_leds = []
            # Coerce to int and clamp each pixel
            for px in leds:
                try:
                    r = int(px[0])
                    g = int(px[1])
                    b = int(px[2])
                except Exception:
                    # If invalid, set pixel to black
                    r, g, b = 0, 0, 0
                # Clamp
                r = max(0, min(255, r))
                g = max(0, min(255, g))
                b = max(0, min(255, b))
                clean_leds.append([r, g, b])
            sanitized.append({'strip_id': sid, 'leds': clean_leds})
    except Exception:
        # If sanitization fails, fall back to original data
        sanitized = strips

    # If monitor enabled, print a short summary of the incoming frame
    if streamer and streamer._monitor:
        try:
            total_pixels = sum(len(s.get('leds', [])) for s in sanitized)
            print(f"[Bridge] <- Received light_frame: strips={len(sanitized)} total_pixels={total_pixels}")
            for s in sanitized:
                sid = s.get('strip_id')
                leds = s.get('leds', [])
                sample = leds[:3]
                print(f"  strip {sid}: count={len(leds)} sample={sample}")
        except Exception:
            pass
    # Compute per-strip brightness levels (0.0 - 1.0) and emit to server at a limited rate
    try:
        global _last_levels_emit
        now = time.time()
        levels = {}
        for s in strips:
            sid = s.get('strip_id')
            leds = s.get('leds', [])
            if not leds:
                levels[sid] = 0.0
                continue
            tot = 0.0
            cnt = 0
            for px in leds:
                try:
                    r, g, b = px
                except Exception:
                    continue
                tot += (int(r) + int(g) + int(b)) / 3.0
                cnt += 1
            levels[sid] = (tot / (cnt * 255.0)) if cnt > 0 else 0.0
        # Normalize into ordered list matching configured segments if streamer is available
        if streamer:
            ordered = [levels.get(i, 0.0) for i in range(len(streamer.segments))]
        else:
            ordered = [levels.get(k, 0.0) for k in sorted(levels.keys())]

        # Throttle emissions to avoid flooding (emit at ~20 Hz max)
        if now - _last_levels_emit > 0.05:
            try:
                sio.emit('led_levels', {'levels': ordered, 'ts': now})
                _last_levels_emit = now
            except Exception:
                pass
    except Exception:
        # Don't let level computation break streaming
        pass
    
    # Send frame to Arduino
    streamer.send_frame(sanitized)
    print(f"[Bridge] Frame processing complete")

@sio.on('connect')
def on_connect():
    print("✓ [Socket.IO] Connected to server")
    # Announce to server that this client is the Arduino bridge and include basic info
    try:
        info = {'is_bridge': True}
        if streamer:
            info.update({
                'total_leds': streamer.total_leds,
                'segments': streamer.segments,
                'port': streamer.port_name,
            })
        sio.emit('announce_bridge', info)
        print(f"[Bridge] Announced bridge to server: {info}")
    except Exception as e:
        print(f"[Bridge] Warning: could not announce bridge: {e}")

@sio.on('disconnect')
def on_disconnect():
    print("⚠ [Socket.IO] Disconnected from server - attempting reconnect...")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--server', default='http://localhost:5000', help='Flask server base URL')
    parser.add_argument('--port', required=True, help='Serial COM port (e.g., COM7 or /dev/ttyACM0)')
    parser.add_argument('--baud', type=int, default=115200, help='Serial baud rate')
    parser.add_argument('--leds', type=int, default=0, help='Total number of LEDs (optional, overrides --segments sum)')
    parser.add_argument('--segments', default='150,300,300,300', help='Comma-separated per-strip lengths in strip_id order')
    parser.add_argument('--monitor', action='store_true', help='Print Arduino Serial output to console')
    args = parser.parse_args()

    # Parse segments
    try:
        segments = [int(x.strip()) for x in args.segments.split(',') if x.strip()]
    except Exception:
        print('Invalid --segments value. Expected like: 150,300,300,300')
        sys.exit(1)

    total_leds = args.leds if args.leds > 0 else sum(segments)
    if args.leds and args.leds != sum(segments):
        print(f"Warning: --leds ({args.leds}) != sum(--segments) ({sum(segments)}). Using --leds for frame size but mapping by segments.")

    global streamer
    streamer = ArduinoStreamer(args.port, args.baud, total_leds, segments)
    # Enable monitor by default so we get Arduino startup lines and frame confirmations
    streamer.enable_monitor()

    print(f"Connecting to Socket.IO server: {args.server}")
    try:
        sio.connect(args.server)
    except Exception as e:
        print(f"✗ Could not connect to server: {e}")
        sys.exit(1)

    print("Bridge running. Streaming frames to Arduino.")
    try:
        sio.wait()
    except KeyboardInterrupt:
        print("Exiting...")

if __name__ == '__main__':
    main()
