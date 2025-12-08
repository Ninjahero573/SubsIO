"""
Audio Analyzer - Analyzes audio files to extract features for light show generation
"""
import librosa
import numpy as np
from scipy import signal


class AudioAnalyzer:
    def __init__(self, sr=22050):
        """
        Initialize the audio analyzer
        
        Args:
            sr: Sample rate for audio processing
        """
        self.sr = sr
    
    def analyze(self, audio_file):
        """
        Analyze an audio file and extract features
        
        Args:
            audio_file: Path to the audio file
            
        Returns:
            Dictionary containing audio features
        """
        print(f"Loading audio file: {audio_file}")
        y, sr = librosa.load(audio_file, sr=self.sr)
        
        # Get tempo and beat frames
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        
        # Get onset strength (for detecting musical events)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        
        # Get spectral features
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        
        # Get RMS energy (volume/amplitude)
        rms = librosa.feature.rms(y=y)[0]
        
        # Get chroma features (pitch class)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        
        # Get MFCC (timbre)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        
        # Segment the audio into time frames (100ms resolution)
        hop_length = 512
        frame_duration = hop_length / sr
        
        # Create time-aligned features
        n_frames = len(rms)
        frame_times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=hop_length)
        
        # Normalize features to 0-1 range
        spectral_centroids_norm = self._normalize(spectral_centroids)
        spectral_rolloff_norm = self._normalize(spectral_rolloff)
        rms_norm = self._normalize(rms)
        
        # Get frequency bands (bass, mid, treble)
        stft = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        
        # Define frequency ranges
        bass_range = (20, 250)
        mid_range = (250, 2000)
        treble_range = (2000, 8000)
        
        bass_energy = self._get_frequency_energy(stft, freqs, bass_range)
        mid_energy = self._get_frequency_energy(stft, freqs, mid_range)
        treble_energy = self._get_frequency_energy(stft, freqs, treble_range)
        
        analysis = {
            'duration': len(y) / sr,
            'tempo': float(tempo),
            'beat_times': beat_times.tolist(),
            'onset_times': onset_times.tolist(),
            'frame_duration': frame_duration,
            'frame_times': frame_times.tolist(),
            'features': {
                'energy': rms_norm.tolist(),
                'spectral_centroid': spectral_centroids_norm.tolist(),
                'spectral_rolloff': spectral_rolloff_norm.tolist(),
                'bass': self._normalize(bass_energy).tolist(),
                'mid': self._normalize(mid_energy).tolist(),
                'treble': self._normalize(treble_energy).tolist(),
                'chroma': chroma.tolist(),
                'mfcc': mfcc.tolist()
            }
        }
        
        return analysis
    
    def _normalize(self, data):
        """Normalize data to 0-1 range"""
        data = np.array(data)
        min_val = np.min(data)
        max_val = np.max(data)
        if max_val - min_val == 0:
            return np.zeros_like(data)
        return (data - min_val) / (max_val - min_val)
    
    def _get_frequency_energy(self, stft, freqs, freq_range):
        """Get energy in a specific frequency range"""
        freq_mask = (freqs >= freq_range[0]) & (freqs <= freq_range[1])
        return np.sum(stft[freq_mask, :], axis=0)
