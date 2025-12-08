"""
Server package initializer: creates Flask app, SocketIO and shared state.
"""
import os
from flask import Flask
from flask_socketio import SocketIO

from workers.queue_manager import QueueManager
from workers.audio_analyzer import AudioAnalyzer
from workers.light_show_generator import LightShowGenerator

# Determine project root and set template/static folders so templates and
# static assets located at the repository root are found even though the
# Flask app is created inside the `server` package.
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_TEMPLATES = os.path.join(_ROOT, 'templates')
_STATIC = os.path.join(_ROOT, 'static')

app = Flask(__name__, template_folder=_TEMPLATES, static_folder=_STATIC, static_url_path='/static')
app.config['SECRET_KEY'] = os.environ.get('JUKEBOX_SECRET', 'jukebox-secret-key-change-this')

socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=1e9, ping_timeout=60, ping_interval=25)

# Enable debug and exception propagation while troubleshooting server errors locally.
# You can set this to False when running in production.
app.debug = True
app.config['PROPAGATE_EXCEPTIONS'] = True

# Development convenience: allow OAuth over plain HTTP when debugging locally.
# This sets OAUTHLIB_INSECURE_TRANSPORT=1 only when `app.debug` is enabled so
# oauthlib permits non-HTTPS redirect URIs (useful for localhost testing).
if app.debug:
    os.environ.setdefault('OAUTHLIB_INSECURE_TRANSPORT', '1')

# Initialize components
queue_manager = QueueManager()
audio_analyzer = AudioAnalyzer()
light_show_generator = LightShowGenerator(
    strip_configs=[
        {'id': 0, 'led_count': 150},
        {'id': 1, 'led_count': 300},
        {'id': 2, 'led_count': 300},
        {'id': 3, 'led_count': 300},
    ]
)

# Store connected clients
connected_clients = {}

# Playback state
playback_state = {
    'is_playing': False,
    'current_song_id': None,
    'current_time': 0,
    'volume': 0.7,
    'pause_time': 0,
    'song_stopped': False,
    'just_unpaused': False,
}

# Import routes and socket handlers so they're registered with the app/socketio
from . import routes  # noqa: E402,F401
from . import sockets  # noqa: E402,F401
