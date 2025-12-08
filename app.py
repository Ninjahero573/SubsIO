"""
Launcher for JukeboxLED application.

This file keeps runtime startup responsibilities concise: it starts
background workers and runs the Flask + Socket.IO server. HTTP routes
and socket handlers live in the `server` package to keep concerns separated.
"""
import os
import threading
from server import app, socketio, queue_manager, audio_analyzer, light_show_generator, playback_state, connected_clients
from workers.playback_worker import process_and_play_queue, prefetch_queue_worker


def ensure_dirs():
    os.makedirs('downloads', exist_ok=True)
    os.makedirs('lightshows', exist_ok=True)


def start_workers():
    queue_thread = threading.Thread(
        target=process_and_play_queue,
        args=(
            socketio,
            queue_manager,
            audio_analyzer,
            light_show_generator,
            playback_state,
            connected_clients,
        ),
        daemon=True,
    )
    queue_thread.start()

    prefetch_thread = threading.Thread(
        target=prefetch_queue_worker,
        args=(socketio, queue_manager),
        daemon=True,
    )
    prefetch_thread.start()


if __name__ == '__main__':
    ensure_dirs()
    start_workers()

    try:
        socketio.run(
            app,
            host='0.0.0.0',
            port=80,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )
    except OSError as e:
        print(f"✗ Server OSError: {e}")
    except Exception as e:
        print(f"✗ Server exception: {e}")
    finally:
        print("Server exiting")
