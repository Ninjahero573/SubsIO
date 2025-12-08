"""
Light Show Generator - Creates LED patterns based on audio analysis
"""
import numpy as np
import colorsys


class LightShowGenerator:
    def __init__(self, strip_configs):
        """
        Initialize the light show generator
        
        Args:
            strip_configs: List of strip configurations with 'id' and 'led_count'
        """
        self.strip_configs = strip_configs
        self.total_leds = sum(strip['led_count'] for strip in strip_configs)
    
    def generate(self, analysis, duration):
        """
        Generate a light show from audio analysis
        
        Args:
            analysis: Audio analysis dictionary
            duration: Song duration in seconds
            
        Returns:
            Light show data structure
        """
        print("Generating light show patterns...")
        
        features = analysis['features']
        frame_times = analysis['frame_times']
        beat_times = analysis['beat_times']
        onset_times = analysis['onset_times']
        
        # Diagnostic: check if features are all zeros
        if len(features.get('energy', [])) > 0:
            energy_vals = features['energy'][:min(10, len(features['energy']))]
            bass_vals = features['bass'][:min(10, len(features['bass']))]
            print(f"DEBUG: First 10 energy values: {energy_vals}")
            print(f"DEBUG: First 10 bass values: {bass_vals}")
            max_energy = max(features['energy']) if features['energy'] else 0
            max_bass = max(features['bass']) if features['bass'] else 0
            print(f"DEBUG: max(energy)={max_energy}, max(bass)={max_bass}")
        else:
            print("DEBUG: WARNING - features appear to be empty or missing keys")
        
        # Downsample frames to reduce serial traffic and improve stability
        # Original: ~43 FPS | Reduced: ~11 FPS (sending every 4th frame)
        frame_skip = 4
        frame_times_ds = frame_times[::frame_skip]
        frame_indices = np.arange(len(frame_times))[::frame_skip]
        
        print(f"Frame rate: {len(frame_times_ds)} frames @ ~11 FPS (downsampled by {frame_skip}x)")
        
        # Create light show frames
        frames = []
        
        for idx, frame_idx in enumerate(frame_indices):
            timestamp = frame_times_ds[idx]
            
            # Check if we're on a beat
            is_beat = any(abs(timestamp - bt) < 0.05 for bt in beat_times)
            is_onset = any(abs(timestamp - ot) < 0.05 for ot in onset_times)
            
            # Get features for this frame
            energy = features['energy'][frame_idx] if frame_idx < len(features['energy']) else 0
            bass = features['bass'][frame_idx] if frame_idx < len(features['bass']) else 0
            mid = features['mid'][frame_idx] if frame_idx < len(features['mid']) else 0
            treble = features['treble'][frame_idx] if frame_idx < len(features['treble']) else 0
            
            # Generate colors based on frequency content
            # Bass = Red, Mid = Green, Treble = Blue
            base_color = self._mix_colors(
                (255, 0, 0, bass),      # Red for bass
                (0, 255, 0, mid),       # Green for mids
                (0, 0, 255, treble)     # Blue for treble
            )
            
            # Adjust brightness based on energy
            brightness = energy
            
            # Create beat effect (flash on beats)
            if is_beat:
                brightness = min(1.0, brightness * 1.5)
            
            # Create onset effect (color shift)
            if is_onset:
                base_color = self._shift_hue(base_color, 30)
            
            # Apply brightness
            color = tuple(int(c * brightness) for c in base_color[:3])
            
            # Generate patterns for each strip
            strip_data = []

            for strip_idx, strip_config in enumerate(self.strip_configs):
                led_count = strip_config['led_count']

                # Different patterns for different strips
                if strip_idx == 0:  # Strip 1 (150 LEDs) - Main visualization
                    pattern = self._create_spectrum_pattern(color, led_count, energy, bass, mid, treble)
                elif strip_idx == 1:  # Strip 2 (300 LEDs) - Wave effect
                    pattern = self._create_wave_pattern(color, led_count, timestamp, energy)
                elif strip_idx == 2:  # Strip 3 (300 LEDs) - Pulse effect
                    pattern = self._create_pulse_pattern(color, led_count, energy, is_beat)
                else:  # Strip 4 (300 LEDs) - Chase effect
                    pattern = self._create_chase_pattern(color, led_count, timestamp, energy)

                # Ensure pattern is a list of plain Python lists of ints (R,G,B)
                safe_pattern = []
                for px in pattern:
                    # px may be a tuple, numpy scalar, or floats; coerce and clamp
                    try:
                        r = int(px[0])
                        g = int(px[1])
                        b = int(px[2])
                    except Exception:
                        # Fallback to black
                        r, g, b = 0, 0, 0
                    # Clamp to valid 0-255
                    r = max(0, min(255, r))
                    g = max(0, min(255, g))
                    b = max(0, min(255, b))
                    safe_pattern.append([r, g, b])

                strip_data.append({
                    'strip_id': strip_config['id'],
                    'leds': safe_pattern
                })
            
            frames.append({
                'timestamp': timestamp,
                'strips': strip_data
            })
        
        light_show = {
            'duration': duration,
            'fps': 1.0 / analysis['frame_duration'],
            'strip_configs': self.strip_configs,
            'frames': frames
        }
        
        print(f"Generated {len(frames)} frames for {duration:.2f}s song")
        return light_show
    
    def _mix_colors(self, *colors):
        """Mix multiple RGBA colors"""
        total_weight = sum(c[3] for c in colors)
        if total_weight == 0:
            return (0, 0, 0)
        
        r = sum(c[0] * c[3] for c in colors) / total_weight
        g = sum(c[1] * c[3] for c in colors) / total_weight
        b = sum(c[2] * c[3] for c in colors) / total_weight
        
        return (int(r), int(g), int(b))
    
    def _shift_hue(self, color, degrees):
        """Shift the hue of a color"""
        r, g, b = color[:3]
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        h = (h + degrees/360) % 1.0
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        return (int(r*255), int(g*255), int(b*255))
    
    def _create_spectrum_pattern(self, base_color, led_count, energy, bass, mid, treble):
        """Create a spectrum analyzer pattern"""
        pattern = []
        
        # Divide LEDs into three sections for bass, mid, treble
        section_size = led_count // 3
        
        for i in range(led_count):
            if i < section_size:
                # Bass section (red) - scale up to make it visible
                intensity = (bass ** 0.5) * energy
                color = (int(255 * intensity), 0, 0)
            elif i < section_size * 2:
                # Mid section (green) - scale up to make it visible
                intensity = (mid ** 0.5) * energy
                color = (0, int(255 * intensity), 0)
            else:
                # Treble section (blue) - scale up to make it visible
                intensity = (treble ** 0.5) * energy
                color = (0, 0, int(255 * intensity))
            
            pattern.append(color)
        
        return pattern
    
    def _create_wave_pattern(self, base_color, led_count, timestamp, energy):
        """Create a wave pattern that moves along the strip"""
        pattern = []
        wave_speed = 2.0  # waves per second
        wave_length = led_count / 4
        
        for i in range(led_count):
            phase = (i / wave_length + timestamp * wave_speed) * 2 * np.pi
            # Boost energy multiplier to make waves visible
            intensity = (np.sin(phase) + 1) / 2 * (energy ** 0.5)
            color = tuple(int(c * intensity) for c in base_color)
            pattern.append(color)
        
        return pattern
    
    def _create_pulse_pattern(self, base_color, led_count, energy, is_beat):
        """Create a pulsing pattern"""
        # Scale energy up to make pulses visible (sqrt makes small values larger)
        intensity = energy ** 0.5
        if is_beat:
            intensity = min(1.0, intensity * 1.8)
        
        color = tuple(int(c * intensity) for c in base_color)
        return [color] * led_count
    
    def _create_chase_pattern(self, base_color, led_count, timestamp, energy):
        """Create a chase/running light pattern"""
        pattern = []
        chase_speed = 3.0  # position updates per second
        chase_length = 20
        
        position = int((timestamp * chase_speed * led_count) % led_count)
        
        # Scale energy up to make chase visible
        energy_scaled = energy ** 0.5
        
        for i in range(led_count):
            distance = min(abs(i - position), led_count - abs(i - position))
            if distance < chase_length:
                # Bright at the head, fading towards tail
                intensity = (1 - distance / chase_length) * energy_scaled
            else:
                # Dim tail glow (don't go completely black)
                intensity = 0.1 * energy_scaled
            color = tuple(int(c * intensity) for c in base_color)
            pattern.append(color)
        
        return pattern
