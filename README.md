# JukeboxLED 🎵💡

A web-based jukebox system that allows anyone to add songs to a queue and generates synchronized LED light shows for WS2812B LED strips.

## Features

- 🌐 **Web Interface** - Anyone on your network can add songs
- 🎵 **YouTube Support** - Add songs from YouTube and other platforms
- 🎨 **Audio Analysis** - Automatically analyzes songs for beat, frequency, and energy
- 💡 **LED Light Shows** - Generates synchronized light patterns for 4 LED strips
- 🔊 **Audio Playback** - Plays audio through Raspberry Pi's aux port
- 📱 **Real-time Updates** - Queue updates in real-time via WebSockets

## Hardware Options

You can drive the LEDs with either of these setups:

**1) Arduino Due (Recommended)**
- Arduino Due connected via Native USB to the Windows server
- 4 WS2812B LED Strips totaling 1050 LEDs (150 + 300 + 300 + 300) on separate data pins
- Pins: 6, 7, 8, 9 (configurable)
- 5V Power Supply (20–30A recommended; 63A theoretical max for full brightness)
- Level Shifter (74AHCT125 or similar: 3.3V→5V for each data line)
- USB Serial Bridge (python script) streams frames in real-time at 2,000,000 baud

**2) Raspberry Pi 3 (Legacy)**
- 4 WS2812B LED Strips totaling 1050 LEDs (150 + 300 + 300 + 300)
- 5V Power Supply (20–30A recommended)
- Level Shifter (3.3V→5V for data)
- rpi_ws281x library for LED control
- Audio via Windows PC (recommended) or Pi aux output

## Software Architecture

### Main Server (Windows/Linux PC)
- **Flask Web Server** - Hosts the jukebox interface
- **Queue Manager** - Handles song queue and downloads
- **Audio Analyzer** - Analyzes songs using librosa
- **Light Show Generator** - Creates LED patterns based on audio analysis

### Raspberry Pi Client
- LED Controller - Controls WS2812B strips via rpi_ws281x
- Audio Player - Plays audio via pygame
- WebSocket Client - Receives light shows from server

### Arduino Due Client (via Serial Bridge)
- Arduino sketch receives frames over high-speed USB serial (2,000,000 baud)
- Python serial bridge subscribes to server light_frame events and streams to Arduino

## Installation

### Main Server Setup (Windows PC)

1. **Install FFmpeg** (required for audio processing):
   - Download from https://ffmpeg.org/download.html
   - Add to PATH environment variable

2. **Install Python dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Run the server:**
   ```powershell
   python app.py
   ```

4. **Access the web interface:**
   - Open browser to `http://localhost:5000`
   - Other devices on network: `http://YOUR_PC_IP:5000`

### Raspberry Pi Setup (option A)

1. **Update system:**
   ```bash
   sudo apt-get update
   sudo apt-get upgrade
   ```

2. **Install system dependencies:**
   ```bash
   sudo apt-get install python3-pip python3-dev
   sudo apt-get install libatlas-base-dev
   sudo apt-get install portaudio19-dev
   ```

3. **Install Python dependencies:**
   ```bash
   pip3 install -r requirements_pi.txt
   ```

4. **Enable SPI (required for WS2812B):**
   ```bash
   sudo raspi-config
   # Navigate to: Interface Options -> SPI -> Enable
   ```

5. **Audio Configuration:**
   ```bash
   # Test audio output
   speaker-test -c2
   
   # Set default audio to aux/headphone jack
   sudo raspi-config
   # Navigate to: System Options -> Audio -> Headphones
   ```

6. **Run the Pi client:**
   ```bash
   sudo python3 pi_client.py http://YOUR_SERVER_IP:5000
   ```
   
   Note: `sudo` is required for GPIO access.

### Arduino Due Setup (Recommended)

#### Hardware Wiring

Each strip has its own data pin with a dedicated 74AHCT125 level shifter channel:

| Strip | Due Pin | Shifter Channel | LED Segment |
|-------|---------|-----------------|-------------|
| 1     | 6       | 1               | 150 LEDs    |
| 2     | 7       | 2               | 300 LEDs    |
| 3     | 8       | 3               | 300 LEDs    |
| 4     | 9       | 4               | 300 LEDs    |

**Level Shifter (74AHCT125) Wiring:**
- Pin 1 (1OE): GND (always enabled)
- Pin 8: GND
- Pin 16: 5V
- Each channel (1A→1Y, 2A→2Y, etc.): Due pin → shifter input, shifter output → LED data

**Power:**
- 5V Supply: LED strips + 74AHCT125 VCC
- GND: Common ground (Due, LEDs, and shifter)

#### Arduino Firmware

Choose one:

**Option A: Adafruit_NeoPixel (Simpler, works on any Arduino)**
```powershell
# In Arduino IDE Library Manager: install "Adafruit NeoPixel"
# Open: arduino/ArduinoDue_Jukebox/ArduinoDue_Jukebox_NeoPixel.ino
# Board: Arduino Due (Native USB Port)
# Upload
```

**Option B: FastLED (If you want to use the original firmware)**
- Install: FastLED library version 3.5.x (avoid newer versions with alignment issues on Due)
- Open: `arduino/ArduinoDue_Jukebox/ArduinoDue_Jukebox.ino`
- Board: Arduino Due (Native USB Port)
- Upload

#### Python Bridge (Windows/PC)

1. Install dependencies:
```powershell
pip install pyserial python-socketio requests websocket-client
```

2. Start the Flask server (Terminal 1):
```powershell
cd "path/to/JukeboxLED"
py -3.11 app.py
```

3. Find Arduino COM port:
   - Device Manager → Ports (COM & LPT)
   - Look for "Arduino Due (COM#)"

4. Start the bridge with monitor (Terminal 2):
```powershell
py -3.11 arduino/arduino_bridge.py --port COM4 --baud 2000000 --segments 150,300,300,300 --monitor
```

You should see:
- `✓ Serial connected`
- `✓ Connected to server`
- `[Arduino] Arduino Due Jukebox...` (startup message)

#### Test & Play

1. Open browser: `http://localhost:5000` (or `http://jukebox.local:5000` if mDNS enabled)
2. Add a song URL
3. Watch the light show sync with the music

#### Troubleshooting

**"PermissionError: Access is denied" on COM port:**
- Close Arduino IDE Serial Monitor or other tools using the port

**Arduino not uploading:**
- Try Native USB port (not Programming port)
- Check Board selection = Arduino Due (Native USB Port)

**LEDs not lighting:**
- Verify power supply is 5V and delivering adequate current
- Test level shifter with a multimeter (should output ~5V on data pins)
- Confirm Arduino pin 6/7/8/9 are not in use by other libraries

#### Advanced Options

Run bridge without monitor (cleaner logs):
```powershell
py -3.11 arduino/arduino_bridge.py --port COM4 --baud 2000000 --segments 150,300,300,300
```

Use different baud rate (1M if serial noise issues):
```powershell
py -3.11 arduino/arduino_bridge.py --port COM4 --baud 1000000 --segments 150,300,300,300 --monitor
```

## Wiring Diagram

### LED Strip Connections

```
Raspberry Pi 3          WS2812B Strips
-----------------      -----------------
GPIO 18 (Pin 12) ----> Strip 1 Data In (150 LEDs)
GPIO 13 (Pin 33) ----> Strip 2 Data In (300 LEDs)
GPIO 19 (Pin 35) ----> Strip 3 Data In (300 LEDs)
GPIO 21 (Pin 40) ----> Strip 4 Data In (300 LEDs)

GND (Pin 6,9,14...) -> Strip GND (all strips)
```

**Important Notes:**
- Use a **level shifter** to convert 3.3V GPIO to 5V for LED data lines
- Power strips directly from **5V power supply** (NOT from Pi)
- Common ground between Pi and power supply
- Calculate power requirements: 1050 LEDs × 60mA = ~63A max (use quality PSU)
- In practice, LEDs rarely all at max brightness, 20-30A PSU should suffice

### Audio Connection
- Connect speakers/audio system to Pi's 3.5mm aux jack

## Usage

### Adding Songs

1. **Via Web Interface:**
   - Open the jukebox in your browser
   - Paste a YouTube URL (or supported platform)
   - Optionally add your name
   - Click "Add to Queue"

2. **Supported Platforms:**
   - YouTube
   - SoundCloud
   - Vimeo
   - Many others (via yt-dlp)

### Light Show Patterns

The system generates 4 different patterns for each strip:

1. **Strip 1 (150 LEDs)** - Spectrum Analyzer
   - Visualizes bass (red), mids (green), treble (blue)
   
2. **Strip 2 (300 LEDs)** - Wave Pattern
   - Moving wave that responds to energy

3. **Strip 3 (300 LEDs)** - Pulse Pattern
   - Synchronized pulsing with beats

4. **Strip 4 (300 LEDs)** - Chase Pattern
   - Running lights that respond to music

## Configuration

### Adjust LED Brightness

Edit `pi_client.py`, line 32:
```python
LED_BRIGHTNESS = 255  # 0-255 (reduce if too bright)
```

### Change GPIO Pins

Edit `pi_client.py`, line 39:
```python
gpio_pins = [18, 13, 19, 21]  # Adjust as needed
```

### Customize Light Patterns

Edit `light_show_generator.py` to create your own patterns in:
- `_create_spectrum_pattern()`
- `_create_wave_pattern()`
- `_create_pulse_pattern()`
- `_create_chase_pattern()`

## Troubleshooting

### Server Issues

**"Module not found" errors:**
```powershell
pip install -r requirements.txt --upgrade
```

**FFmpeg not found:**
- Ensure FFmpeg is installed and in PATH
- Restart terminal after installation

### Raspberry Pi Issues

**"Permission denied" when running pi_client.py:**
```bash
sudo python3 pi_client.py http://SERVER_IP:5000
```

**LEDs not lighting up:**
- Check wiring (especially data line connections)
- Verify 5V power supply is connected
- Check GPIO pins in code match your wiring
- Try reducing LED_BRIGHTNESS
- Ensure SPI is enabled in raspi-config

**No audio output:**
```bash
# Test audio
speaker-test -c2

# Configure audio output
sudo raspi-config
# System Options -> Audio -> Headphones
```

**Connection errors:**
- Ensure server is running and accessible
- Check firewall settings on server
- Verify correct IP address and port

## File Structure

```
JukeboxLED/
├── app.py                    # Main Flask application
├── queue_manager.py          # Song queue management
├── audio_analyzer.py         # Audio feature extraction
├── light_show_generator.py   # LED pattern generation
├── pi_client.py              # Raspberry Pi client
├── requirements.txt          # Python dependencies (server)
├── requirements_pi.txt       # Python dependencies (Pi)
├── templates/
│   └── index.html           # Web interface
├── static/
│   ├── style.css            # Styles
│   └── app.js               # Client-side JavaScript
├── downloads/               # Downloaded songs (created automatically)
└── lightshows/              # Generated light shows (created automatically)
```

## Performance Tips

1. **Server Performance:**
   - Processing time: ~10-30 seconds per song
   - Songs are analyzed before playback starts
   - Close other intensive applications during processing

2. **Raspberry Pi Performance:**
   - Pi 3 can handle 1050 LEDs at ~40-45 FPS
   - Reduce LED_BRIGHTNESS to reduce power/processing
   - Use quality power supply for stable operation

3. **Network:**
   - Use wired Ethernet for Pi connection if possible
   - Server and Pi should be on same local network

## Advanced Features

### Multiple Raspberry Pis

You can connect multiple Pis to the same server:

```bash
# On Pi 1
sudo python3 pi_client.py http://SERVER_IP:5000 pi-1

# On Pi 2
sudo python3 pi_client.py http://SERVER_IP:5000 pi-2
```

### Custom Analysis Parameters

Edit `audio_analyzer.py` to adjust:
- Sample rate (default: 22050 Hz)
- Frequency band ranges
- Beat detection sensitivity
- Frame duration for LED updates

## Safety Warnings

⚠️ **Electrical Safety:**
- WS2812B strips can draw significant current
- Use appropriate gauge wire for power connections
- Never exceed power supply ratings
- Keep connections secure and insulated
- Consider adding fuses for protection

⚠️ **Seizure Warning:**
- Flashing lights may trigger seizures in photosensitive individuals
- Provide warning if using in public spaces

## Credits

Built with:
- Flask & SocketIO - Web server
- librosa - Audio analysis
- rpi_ws281x - LED control
- yt-dlp - Media downloads
- pygame - Audio playback

## License

This project is open source. Use and modify as you wish!

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify all dependencies are installed
3. Check wiring and connections
4. Review error messages in terminal

Enjoy your JukeboxLED! 🎵💡🎉
