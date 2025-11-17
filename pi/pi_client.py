"""
Raspberry Pi Client - Receives light shows and controls LEDs + audio playback
Run this on the Raspberry Pi 3
"""
import time
import json
import os
import socketio
import threading
from queue import Queue
import numpy as np
import base64
import gzip
import requests
import urllib.parse

# Try to import Raspberry Pi LED library
LED_AVAILABLE = False
try:
    from rpi_ws281x import PixelStrip, Color
    LED_AVAILABLE = True
except ImportError:
    print("WARNING: rpi_ws281x not available - LED control disabled")

# Try to import audio library
AUDIO_AVAILABLE = False
try:
    import pygame.mixer as mixer
    AUDIO_AVAILABLE = True
except ImportError:
    print("WARNING: pygame.mixer not available - audio disabled")
    try:
        # Fallback: try using alsaaudio
        import alsaaudio
        AUDIO_AVAILABLE = True
        print("Using alsaaudio for audio playback")
    except ImportError:
        print("WARNING: No audio library available")


class LEDController:
    def __init__(self, strip_configs):
        """
        Initialize LED controller
        
        Args:
            strip_configs: List of strip configurations
        """
        self.strip_configs = strip_configs
        self.strips = []
        
        if LED_AVAILABLE:
            # LED strip configuration:
            LED_FREQ_HZ = 800000  # LED signal frequency in hertz
            LED_DMA = 10          # DMA channel
            LED_BRIGHTNESS = 255  # Set to 0 for darkest and 255 for brightest
            LED_INVERT = False    # True to invert the signal
            
            # For WS2812B on Raspberry Pi 3, we can only reliably use GPIO 18 with PWM
            # GPIO 18 supports hardware PWM which is required for WS2812B
            # Alternative: Use GPIO 12 (but 18 is more common)
            gpio_pin = 18  # Use GPIO 18 for all strips (will be daisy-chained)
            
            try:
                # Create a single strip that combines all LEDs
                total_leds = sum(config['led_count'] for config in strip_configs)
                print(f"Creating combined LED strip with {total_leds} total LEDs on GPIO {gpio_pin}")
                
                strip = PixelStrip(
                    total_leds,
                    gpio_pin,
                    LED_FREQ_HZ,
                    LED_DMA,
                    LED_INVERT,
                    LED_BRIGHTNESS,
                    0  # Channel
                )
                strip.begin()
                self.strips = [strip]
                print(f"✓ LED strip initialized successfully on GPIO {gpio_pin}")
            except Exception as e:
                print(f"✗ Error initializing LED strip: {e}")
                print("Note: LEDs may not be properly wired or SPI not enabled")
                print("Run: sudo raspi-config → Interface Options → SPI → Yes")
                self.strips = []
        else:
            print("LED simulation mode - no actual LEDs will be controlled")
    
    def set_strip_leds(self, strip_id, led_colors):
        """Set colors for all LEDs in a strip"""
        if not self.strips or not LED_AVAILABLE:
            return
        
        # Calculate offset based on strip_id
        offset = 0
        for i in range(strip_id):
            if i < len(self.strip_configs):
                offset += self.strip_configs[i]['led_count']
        
        # Set colors on the combined strip
        strip = self.strips[0]
        for i, color in enumerate(led_colors):
            led_idx = offset + i
            if led_idx < strip.numPixels():
                r, g, b = color
                strip.setPixelColor(led_idx, Color(r, g, b))
        
        strip.show()
    
    def clear_all(self):
        """Turn off all LEDs"""
        if LED_AVAILABLE:
            for strip in self.strips:
                for i in range(strip.numPixels()):
                    strip.setPixelColor(i, Color(0, 0, 0))
                strip.show()


class AudioPlayer:
    def __init__(self):
        """Initialize audio player"""
        self.playing = False
        self.audio_file = None
        self.use_pygame = False
        
        if AUDIO_AVAILABLE:
            try:
                if 'mixer' in globals():  # pygame.mixer was imported
                    mixer.init()
                    self.use_pygame = True
                    print("✓ Audio player initialized with pygame")
                else:
                    print("⚠ No suitable audio library available")
            except Exception as e:
                print(f"⚠ Error initializing audio: {e}")
    
    def play(self, audio_file):
        """Play an audio file"""
        if not os.path.exists(audio_file):
            print(f"✗ Audio file not found: {audio_file}")
            return
        
        print(f"Playing audio: {audio_file}")
        
        if self.use_pygame:
            try:
                mixer.music.load(audio_file)
                mixer.music.play()
                self.playing = True
                self.audio_file = audio_file
                print(f"✓ Audio playing")
            except Exception as e:
                print(f"✗ Error playing audio with pygame: {e}")
                import traceback
                traceback.print_exc()
        else:
            # Fallback: use command line player
            try:
                print("Attempting to play with aplay...")
                os.system(f"aplay '{audio_file}' &")
                self.playing = True
                print("✓ Audio started via aplay")
            except Exception as e:
                print(f"✗ Error playing audio with aplay: {e}")
    
    def stop(self):
        """Stop audio playback"""
        if self.use_pygame:
            try:
                mixer.music.stop()
            except:
                pass
        self.playing = False
    
    def is_playing(self):
        """Check if audio is currently playing"""
        if self.use_pygame:
            try:
                return mixer.music.get_busy()
            except:
                pass
        return self.playing


class PiClient:
    def __init__(self, server_url, pi_id='pi-1'):
        """
        Initialize Raspberry Pi client
        
        Args:
            server_url: URL of the jukebox server
            pi_id: Unique identifier for this Pi
        """
        self.server_url = server_url
        self.pi_id = pi_id
        self.sio = socketio.Client(reconnection=True, reconnection_attempts=0, reconnection_delay=1)
        self.led_controller = None
        self.light_show = None
        self.current_song_id = None
        self.playback_start_time = None
        self.running = False
        
        # Setup event handlers
        self.setup_handlers()
    
    def setup_handlers(self):
        """Setup SocketIO event handlers"""
        
        @self.sio.on('connect')
        def on_connect():
            print(f"✓ Connected to server: {self.server_url}")
            self.sio.emit('register_pi', {'pi_id': self.pi_id})
        
        @self.sio.on('disconnect')
        def on_disconnect():
            print("⚠ Disconnected from server")
        
        @self.sio.on('registration_confirmed')
        def on_registration(data):
            print(f"✓ Registration confirmed: {data['pi_id']}")
        
        @self.sio.on('play_song')
        def on_play_song(data):
            try:
                print(f"✓ Received play_song event from server")
                print(f"  Song: {data['song']['title']}")
                print(f"  Has light_show_compressed: {'light_show_compressed' in data}")
                self.prepare_light_show(data)
            except Exception as e:
                print(f"✗ Error handling play_song: {e}")
                import traceback
                traceback.print_exc()
        
        @self.sio.on('light_frame')
        def on_light_frame(data):
            try:
                if self.led_controller and self.led_controller.strips:
                    # Update LED strips with frame data
                    for strip_data in data['strips']:
                        self.led_controller.set_strip_leds(strip_data['strip_id'], strip_data['leds'])
                else:
                    pass  # Silently ignore in simulation mode or if no strips
            except Exception as e:
                print(f"✗ Error updating LEDs: {e}")
    
    def connect(self):
        """Connect to the server"""
        try:
            self.sio.connect(self.server_url)
            print(f"Attempting to connect to {self.server_url}")
        except Exception as e:
            print(f"Connection error: {e}")
    
    def prepare_light_show(self, data):
        """Prepare light show for playback - download via HTTP"""
        song = data['song']
        lightshow_url = data.get('lightshow_url')
        
        print(f"✓ Received play_song event")
        print(f"  Song: {song['title']}")
        
        if not lightshow_url:
            print("✗ No lightshow_url provided!")
            return
        
        # Build full URL
        if not lightshow_url.startswith('http'):
            base_url = self.server_url.rstrip('/')
            lightshow_url = f"{base_url}{lightshow_url}"
        
        # Download light show via HTTP
        print(f"Downloading light show from: {lightshow_url}")
        try:
            response = requests.get(lightshow_url, timeout=300)  # 5 minute timeout
            response.raise_for_status()
            
            print(f"✓ Downloaded {len(response.content) / 1024 / 1024:.2f} MB")
            
            # Decompress
            print("Decompressing...")
            light_show_json = gzip.decompress(response.content).decode('utf-8')
            self.light_show = json.loads(light_show_json)
            
            print(f"✓ Decompressed successfully ({len(self.light_show['frames'])} frames)")
        except Exception as e:
            print(f"✗ Error downloading/decompressing light show: {e}")
            import traceback
            traceback.print_exc()
            return
        
        # Initialize LED controller if not already done
        if self.led_controller is None:
            self.led_controller = LEDController(self.light_show.get('strip_configs', []))
        
        self.current_song_id = song['id']
        self.playback_start_time = time.time()
        
        print(f"✓ Light show ready. Signaling server...")
        try:
            self.sio.emit('pi_ready', {'song_id': self.current_song_id})
            print(f"✓ Emitted pi_ready signal to server")
        except Exception as e:
            print(f"✗ Error emitting pi_ready: {e}")
        
        print(f"✓ Waiting for frame updates from server...")
    
    def run(self):
        """Run the client"""
        self.running = True
        self.connect()
        
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
        finally:
            if self.led_controller:
                self.led_controller.clear_all()
            self.audio_player.stop()
            self.sio.disconnect()


if __name__ == '__main__':
    import sys
    
    # Get server URL from command line or use default
    server_url = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5000'
    pi_id = sys.argv[2] if len(sys.argv) > 2 else 'pi-1'
    
    print(f"Starting Raspberry Pi Client")
    print(f"Server: {server_url}")
    print(f"Pi ID: {pi_id}")
    print("-" * 50)
    
    client = PiClient(server_url, pi_id)
    client.run()
