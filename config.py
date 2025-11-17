"""
Configuration file for JukeboxLED
Customize your setup here
"""

# ====================================
# Server Configuration
# ====================================

# Server host and port
HOST = '0.0.0.0'  # Listen on all network interfaces
PORT = 5000

# Secret key for Flask (change this for production)
SECRET_KEY = 'jukebox-secret-key-change-this-for-production'

# ====================================
# LED Strip Configuration
# ====================================

# Define your LED strips
# Each strip needs an 'id' and 'led_count'
STRIP_CONFIGS = [
    {'id': 0, 'led_count': 150, 'name': 'Main Strip'},
    {'id': 1, 'led_count': 300, 'name': 'Left Strip'},
    {'id': 2, 'led_count': 300, 'name': 'Right Strip'},
    {'id': 3, 'led_count': 300, 'name': 'Back Strip'},
]

# ====================================
# Audio Analysis Configuration
# ====================================

# Sample rate for audio processing (Hz)
# Lower = faster processing, less accurate
# Higher = slower processing, more accurate
AUDIO_SAMPLE_RATE = 22050

# Frame duration for LED updates (seconds)
# Smaller = smoother but more data
# Larger = less smooth but smaller files
LED_FRAME_DURATION = 0.023  # ~43 FPS

# ====================================
# Download Configuration
# ====================================

# Directory to store downloaded songs
DOWNLOAD_DIR = 'downloads'

# Directory to store generated light shows
LIGHTSHOW_DIR = 'lightshows'

# Audio quality for downloads
AUDIO_QUALITY = '320'  # kbps

# Maximum song duration (seconds)
# Set to 0 for no limit
MAX_SONG_DURATION = 600  # 10 minutes


# ====================================
# Light Show Pattern Configuration
# ====================================

# Pattern types for each strip
# Options: 'spectrum', 'wave', 'pulse', 'chase', 'rainbow', 'strobe'
STRIP_PATTERNS = [
    'spectrum',  # Strip 0
    'wave',      # Strip 1
    'pulse',     # Strip 2
    'chase',     # Strip 3
]

# Beat effect multiplier (how much brighter on beats)
BEAT_BRIGHTNESS_MULTIPLIER = 1.5

# Color scheme
# Options: 'frequency' (bass=red, mid=green, treble=blue)
#          'rainbow' (cycle through colors)
#          'energy' (brightness based on energy)
COLOR_SCHEME = 'frequency'

# ====================================
# Performance Configuration
# ====================================

# Enable debug mode
DEBUG = True

# Number of worker threads
WORKER_THREADS = 4

# Enable verbose logging
VERBOSE = True

# ====================================
# Advanced Configuration
# ====================================

# Frequency ranges for spectrum analysis (Hz)
FREQ_RANGES = {
    'bass': (20, 250),
    'mid': (250, 2000),
    'treble': (2000, 8000)
}

# Beat detection sensitivity (0.0 - 1.0)
BEAT_SENSITIVITY = 0.3

# Onset detection sensitivity (0.0 - 1.0)
ONSET_SENSITIVITY = 0.5

# ====================================
# Arduino upload configuration
# ====================================
# Path to arduino-cli executable (must be installed and on PATH)
ARDUINO_CLI_PATH = 'arduino-cli'
# Fully-qualified board name (FQBN) for your board. For Arduino Due a common
# value is 'arduino:sam:arduino_due_x' but confirm with `arduino-cli board list`.
ARDUINO_FQBN = 'arduino:sam:arduino_due_x'
# Serial port to upload to (Windows COM port like COM4)
ARDUINO_UPLOAD_PORT = 'COM4'
