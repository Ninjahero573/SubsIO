"""
Queue Manager - Handles the song queue and downloads
"""
import os
import uuid
import json
import yt_dlp
import ssl
import shutil
from mutagen import File
from threading import Lock
import time
import glob


class QueueManager:
    def __init__(self):
        self.queue = []
        self.current_song = None
        self.is_playing = False
        self.lock = Lock()
        self.download_dir = 'downloads'
        os.makedirs(self.download_dir, exist_ok=True)
        self.cache_index_file = os.path.join(self.download_dir, 'cache_index.json')
        self.queue_state_file = os.path.join(self.download_dir, 'queue_state.json')
        self.cache_index = {}
        self._load_cache_index()
        self._load_queue_state()  # Load saved queue on startup
    
    def add_song(self, url, added_by='Anonymous'):
        """Add a song to the queue"""
        with self.lock:
            song_id = str(uuid.uuid4())
            
            # Get song info using yt-dlp
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                song = {
                    'id': song_id,
                    'url': url,
                    'video_id': info.get('id'),
                    'title': info.get('title', 'Unknown'),
                    'artist': info.get('artist') or info.get('uploader', 'Unknown'),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'added_by': added_by,
                    # New fields for pre-processing and UI feedback
                    'status': 'queued',      # queued, downloading, analyzing, generating, ready, playing, error
                    'progress': 0,           # 0-100 overall pre-processing progress
                    'stage': 'queued',       # human-readable stage label
                }
            
            self.queue.append(song)
            self._save_queue_state()  # Save queue after adding
            return song_id
    
    def download_song(self, song_data, progress_callback=None):
        """Download a song
        
        Args:
            song_data: Song dictionary with 'id' and 'url' keys
        """
        song_id = song_data['id']
        url = song_data['url']
        
        output_path = os.path.join(self.download_dir, f"{song_id}.mp3")
        
        # Check if already downloaded
        if os.path.exists(output_path):
            return output_path
        
        # Progress hook to report granular download progress
        def _progress_hook(d):
            try:
                status = d.get('status')
                if status == 'downloading':
                    downloaded = d.get('downloaded_bytes') or 0
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    pct = 0
                    if total and total > 0:
                        pct = int(downloaded * 100 / total)
                    if progress_callback:
                        try:
                            progress_callback(song_id, 'downloading', pct)
                        except Exception:
                            pass
                elif status == 'finished':
                    if progress_callback:
                        try:
                            progress_callback(song_id, 'buffering', 100)
                        except Exception:
                            pass
            except Exception:
                pass

        # On Windows, attempts to rename .part -> final can fail if another
        # process briefly holds a handle (antivirus, ffmpeg, etc.). Disable
        # .part usage on Windows to avoid the rename step; also add a small
        # retry loop that cleans up stale .part files between attempts.
        use_nopart = os.name == 'nt'

        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(self.download_dir, f"{song_id}.%(ext)s"),
            'quiet': True,
            'no_warnings': True,
            'progress_hooks': [_progress_hook],
        }

        if use_nopart:
            # Prevent creation of .part temporary files on Windows
            ydl_opts['nopart'] = True

        # Allow overriding ffmpeg/ffprobe location via environment variable(s).
        # Useful on Windows where ffmpeg may not be on PATH. Set one of:
        #   FFMPEG_PATH, FFMPEG_LOCATION, or FFMPEG_DIR to the folder
        # containing the ffmpeg/ffprobe executables.
        ffmpeg_env = (os.environ.get('FFMPEG_PATH') or os.environ.get('FFMPEG_LOCATION')
                      or os.environ.get('FFMPEG_DIR'))
        if ffmpeg_env:
            # yt-dlp expects the directory containing ffmpeg/ffprobe
            ydl_opts['ffmpeg_location'] = ffmpeg_env

        # Pre-check whether ffmpeg/ffprobe are available. If not, provide a
        # clear, actionable error message before yt-dlp's postprocessor runs.
        ffmpeg_on_path = shutil.which('ffmpeg') is not None
        ffprobe_on_path = shutil.which('ffprobe') is not None
        ffmpeg_configured = 'ffmpeg_location' in ydl_opts
        missing_ffmpeg = not (ffmpeg_on_path and ffprobe_on_path) and not ffmpeg_configured

        max_attempts = 5
        last_exc = None
        tried_certifi = False
        tried_insecure = False
        for attempt in range(1, max_attempts + 1):
            try:
                # If we need ffmpeg for postprocessing but it's not available,
                # raise a helpful error before yt-dlp attempts conversion.
                if missing_ffmpeg and ydl_opts.get('postprocessors'):
                    raise RuntimeError(
                        "ffmpeg/ffprobe not found. Install ffmpeg and ensure "
                        "its bin directory is on PATH, or set the environment "
                        "variable FFMPEG_PATH (or FFMPEG_LOCATION) to the folder "
                        "containing ffmpeg.exe and ffprobe.exe. Example: "
                        "setx FFMPEG_PATH \"C:\\\\tools\\\\ffmpeg\\\\bin\"\n"
                        "Or install via winget/choco: 'winget install ffmpeg' or 'choco install ffmpeg'"
                    )

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
                last_exc = None
                break
            except Exception as e:
                last_exc = e
                # If it's a permission error or a Windows file lock situation,
                # attempt a small backoff and try to remove any stale .part
                # files that may be blocking the rename.
                msg = str(e).lower()
                # Handle SSL certificate verification failures by trying
                # to point Python at the certifi CA bundle, which resolves
                # many Windows/embedded env issues where OpenSSL can't find
                # a local issuer bundle.
                if (('certificate verify failed' in msg or 'unable to get local issuer' in msg)
                        or isinstance(e, ssl.SSLError)) and not tried_certifi:
                    try:
                        import certifi
                        os.environ['SSL_CERT_FILE'] = certifi.where()
                        tried_certifi = True
                        # retry immediately (loop will continue)
                        continue
                    except Exception:
                        # If certifi isn't available or something else fails,
                        # fall through to existing handling below.
                        pass
                # If we've already tried the certifi bundle and the SSL
                # error persists, allow a single insecure retry by telling
                # yt-dlp to skip certificate checks. This is insecure and
                # should only be used as a last resort when operating in
                # a locked-down environment where proper CA bundles are
                # unavailable.
                if (('certificate verify failed' in msg or 'unable to get local issuer' in msg)
                        or isinstance(e, ssl.SSLError)) and tried_certifi and not tried_insecure:
                    try:
                        ydl_opts['nocheckcertificate'] = True
                        tried_insecure = True
                        # retry immediately with insecure option
                        continue
                    except Exception:
                        pass
                if 'permission' in msg or 'access' in msg or os.name == 'nt':
                    # try to remove any matching .part files (best-effort)
                    try:
                        pattern = os.path.join(self.download_dir, f"{song_id}.*.part")
                        for p in glob.glob(pattern):
                            try:
                                os.remove(p)
                            except Exception:
                                pass
                    except Exception:
                        pass

                    sleep_for = attempt * 0.8
                    time.sleep(sleep_for)
                    continue
                else:
                    # Non-file-lock error: re-raise immediately
                    raise

        if last_exc:
            print(f"Error downloading song after {max_attempts} attempts: {last_exc}")
            raise last_exc
        
        # Register in cache index so future adds can reuse this file
        try:
            vid = song_data.get('video_id') or None
            if vid:
                self._register_cache(vid, output_path, {'title': song_data.get('title')})
        except Exception:
            pass
        
        return output_path

    def ensure_downloaded(self, song_data, progress_callback=None):
        """Ensure a song's audio file is present on disk.

        This is a thin wrapper around download_song that first checks for
        an existing cached file. It is safe to call from a background
        prefetch thread.
        """
        song_id = song_data['id']
        output_path = os.path.join(self.download_dir, f"{song_id}.mp3")
        # If we have a cached mapping for this video's source id, reuse it
        try:
            vid = song_data.get('video_id')
            if vid:
                cached = self.get_cached_path(vid)
                if cached and os.path.exists(cached):
                    if progress_callback:
                        try:
                            progress_callback(song_data['id'], 'buffering', 100)
                        except Exception:
                            pass
                    return cached
        except Exception:
            pass

        if os.path.exists(output_path):
            # If file already exists (by song id), register it for its video id
            try:
                vid = song_data.get('video_id')
                if vid:
                    self._register_cache(vid, output_path, {'title': song_data.get('title')})
            except Exception:
                pass
            if progress_callback:
                try:
                    progress_callback(song_data['id'], 'buffering', 100)
                except Exception:
                    pass
            return output_path

        return self.download_song(song_data, progress_callback=progress_callback)
    
    def get_queue(self):
        """Get the current queue"""
        with self.lock:
            return {
                'queue': self.queue,
                'current': self.current_song,
                'is_playing': self.is_playing
            }
    
    def get_next_song(self):
        """Get the next song from the queue"""
        with self.lock:
            if self.queue:
                self.current_song = self.queue.pop(0)
                return self.current_song
            return None

    def peek_next(self):
        """Return the next song in the queue without removing it."""
        with self.lock:
            if self.queue:
                return self.queue[0]
            return None

    def pop_next(self):
        """Pop the next song from the queue and mark it as current."""
        with self.lock:
            if self.queue:
                self.current_song = self.queue.pop(0)
                return self.current_song
            return None
    
    def has_next(self):
        """Check if there are songs in the queue"""
        with self.lock:
            return len(self.queue) > 0

    # --- Cache index helpers -------------------------------------------------
    def _load_cache_index(self):
        try:
            if os.path.exists(self.cache_index_file):
                with open(self.cache_index_file, 'r', encoding='utf-8') as f:
                    self.cache_index = json.load(f)
            else:
                self.cache_index = {}
        except Exception:
            self.cache_index = {}

    def _save_cache_index(self):
        try:
            with open(self.cache_index_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache_index, f)
        except Exception:
            pass

    def _register_cache(self, video_id, filepath, metadata=None):
        try:
            self.cache_index[video_id] = {
                'path': filepath,
                'meta': metadata or {},
            }
            self._save_cache_index()
        except Exception:
            pass

    def get_cached_path(self, video_id):
        try:
            entry = self.cache_index.get(video_id)
            if not entry:
                return None
            return entry.get('path')
        except Exception:
            return None
    
    def get_current_song(self):
        """Get the currently playing song"""
        with self.lock:
            return self.current_song
    
    def set_playing(self, playing):
        """Set the playing status"""
        with self.lock:
            self.is_playing = playing

    def clear_current(self):
        """Clear the current song (used when playback finishes or is skipped)."""
        with self.lock:
            self.current_song = None
            self.is_playing = False
    
    def skip_current(self):
        """Skip the current song"""
        with self.lock:
            self.current_song = None
            self.is_playing = False
            self._save_queue_state()  # Save queue state after skip
    
    def remove_song(self, song_id):
        """Remove a song from the queue"""
        with self.lock:
            self.queue = [s for s in self.queue if s['id'] != song_id]
            self._save_queue_state()  # Save queue state after removal

    # --- Queue persistence helpers -------------------------------------------
    def _load_queue_state(self):
        """Load saved queue from disk on startup"""
        try:
            if os.path.exists(self.queue_state_file):
                with open(self.queue_state_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.queue = data.get('queue', [])
                    self.current_song = data.get('current_song')
                    self.is_playing = False  # Always start paused
                    print(f"✓ Queue state loaded: {len(self.queue)} songs")
                    if self.current_song:
                        print(f"  Current: {self.current_song.get('title', 'Unknown')}")
            else:
                self.queue = []
                self.current_song = None
        except Exception as e:
            print(f"⚠ Error loading queue state: {e}")
            self.queue = []
            self.current_song = None

    def _save_queue_state(self):
        """Save current queue to disk"""
        try:
            data = {
                'queue': self.queue,
                'current_song': self.current_song,
                'timestamp': time.time()
            }
            with open(self.queue_state_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠ Error saving queue state: {e}")

    def save_queue_if_modified(self):
        """Helper to save queue state - called after queue modifications"""
        self._save_queue_state()
