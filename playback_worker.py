"""Original combined queue processing and playback logic.

This is restored from before the experimental preprocessing split so that
"Now Playing" and progress behavior match the known-good version.
"""

import json
import os
import time
import threading
from typing import Any, Dict, List

import pygame

from flask_socketio import SocketIO

from queue_manager import QueueManager
from audio_analyzer import AudioAnalyzer
from light_show_generator import LightShowGenerator


def play_audio_with_sync(
    socketio: SocketIO,
    connected_clients: Dict[str, Dict[str, Any]],
    playback_state: Dict[str, Any],
    audio_file: str,
    song_id: str,
    duration: float,
    light_show: Dict[str, Any] | None,
) -> bool:
    """Play audio on server and (optionally) stream light show frames.

    If ``light_show`` is None or has no frames, this will just handle
    audio playback and periodic time updates without emitting LED frames.
    """

    print("🎵 Starting playback (streaming to Arduino Due in real-time)...")

    # Optional: only bother checking for a bridge if we actually have frames
    if light_show and light_show.get("frames"):
        connected_bridge_count = sum(
            1 for client in connected_clients.values() if client.get("is_bridge")
        )
        if connected_bridge_count == 0:
            print("⚠ WARNING: No Arduino bridge connected! Lights won't show.")
            print(
                "  Start the bridge with: "
                "py -3.11 arduino/arduino_bridge.py --port COM7 --baud 2000000"
            )
        else:
            print(f"✓ {connected_bridge_count} bridge(s) connected")

    socketio.emit(
        "song_progress", {"song_id": song_id, "stage": "playing", "progress": 100}
    )

    try:
        # Initialize pygame mixer for audio playback
        pygame.mixer.init()
        pygame.mixer.music.load(audio_file)
        pygame.mixer.music.play()
        print("▶ Playing audio on server")

        # Reset stopped flag for this song
        playback_state["song_stopped"] = False
        playback_state["pause_time"] = 0
        playback_state["just_unpaused"] = False

        # Get frame data and organize by timestamp (if present)
        frames_by_time: Dict[float, Any] = {}
        frame_times: List[float] = []
        if light_show and light_show.get("frames"):
            for frame in light_show["frames"]:
                frames_by_time[frame["timestamp"]] = frame["strips"]

            frame_times = sorted(frames_by_time.keys())
            print(
                f"🎨 Light show has {len(frame_times)} frames, "
                f"duration {frame_times[-1]:.1f}s"
            )

        # Stream frames with sync timing; if there are no frames, we
        # still loop until the audio finishes (using get_busy()).
        start_time = time.time()
        pause_offset = 0.0
        frame_idx = 0
        frames_sent = 0
        last_frame_time = -1.0

        print("🎨 Streaming frames to Arduino Due...")
        last_busy_state = False

        # When there is no light_show, frame_times will be empty; we
        # handle that by looping until pygame reports the audio ended.
        while True:
            if playback_state.get("song_stopped"):
                print("  Song was stopped")
                break

            is_paused = playback_state.get("pause_time", 0) > 0
            current_busy = pygame.mixer.music.get_busy()

            if playback_state.get("just_unpaused"):
                playback_state["just_unpaused"] = False
                last_busy_state = False
            elif not is_paused and last_busy_state and not current_busy:
                print("  Music ended naturally")
                break
            elif not is_paused and current_busy:
                last_busy_state = True

            current_time = time.time()
            if is_paused:
                elapsed = playback_state.get("current_time", 0.0)
                pause_offset += current_time - playback_state.get(
                    "pause_time", current_time
                )
                playback_state["pause_time"] = current_time
            else:
                elapsed = (current_time - start_time) - pause_offset

            playback_state["current_time"] = elapsed

            socketio.emit(
                "playback_time_update",
                {"song_id": song_id, "current_time": elapsed, "duration": duration},
            )

            # If we have lightshow frames, stream those in sync
            while frame_idx < len(frame_times) and frame_times[frame_idx] <= elapsed:
                frame_time = frame_times[frame_idx]

                if frame_time > last_frame_time:
                    strips_data = frames_by_time[frame_time]
                    try:
                        socketio.emit(
                            "light_frame",
                            {
                                "song_id": song_id,
                                "timestamp": frame_time,
                                "strips": strips_data,
                            },
                        )
                        frames_sent += 1
                        if frames_sent == 1:
                            print(f"  ✓ First frame sent at {frame_time:.2f}s")
                        elif frames_sent % 10 == 0:
                            print(
                                f"  ✓ Sent {frames_sent} frames "
                                f"({frame_time:.1f}s)"
                            )
                    except Exception as e:
                        print(f"  ✗ ERROR emitting frame: {e}")

                frame_idx += 1

            time.sleep(0.01)

        pygame.mixer.music.stop()
        playback_state["is_playing"] = False
        playback_state["pause_time"] = 0
        print(f"✓ Audio playback finished (sent {frames_sent} total frames)")
        return True

    except Exception as e:
        print(f"✗ Error playing audio: {e}")
        import traceback

        traceback.print_exc()
        return False


def process_and_play_queue(
    socketio: SocketIO,
    queue_manager: QueueManager,
    audio_analyzer: AudioAnalyzer,
    light_show_generator: LightShowGenerator,
    playback_state: Dict[str, Any],
    connected_clients: Dict[str, Dict[str, Any]],
) -> None:
    """Background thread to process the queue and play songs sequentially.

    Lightshow analysis/generation is currently disabled; this worker
    downloads each song (if needed), then plays audio only.
    """

    while True:
        if queue_manager.has_next() and not queue_manager.is_playing:
            # Peek the next song but do not remove it from the queue yet.
            next_song = queue_manager.peek_next()

            if next_song:
                print(f"Preparing next song (kept in queue until ready): {next_song['title']}")

                # Mark status on the queued song so clients show it's being prepared
                try:
                    next_song['status'] = 'downloading'
                    next_song['progress'] = 0
                    next_song['stage'] = 'downloading'
                except Exception:
                    pass
                socketio.emit(
                    "song_progress",
                    {"song_id": next_song["id"], "stage": "downloading", "progress": 0},
                )

                try:
                    # Download (or reuse cached file) for the *next* song while it
                    # remains visible in the queue.
                    print("⏳ Downloading next queued song (will remain in queue until ready)...")
                    socketio.emit(
                        "song_progress",
                        {
                            "song_id": next_song["id"],
                            "stage": "downloading",
                            "progress": 0,
                        },
                    )
                    # Provide a progress callback so clients see granular download progress
                    def _next_progress_cb(sid, stage, pct, s=next_song):
                        try:
                            s['status'] = stage
                            s['progress'] = pct
                            s['stage'] = stage
                        except Exception:
                            pass
                        try:
                            socketio.emit('song_progress', {'song_id': sid, 'stage': stage, 'progress': pct})
                        except Exception:
                            pass

                    audio_file = queue_manager.ensure_downloaded(next_song, progress_callback=_next_progress_cb)

                    # Mark as buffered/ready while still in queue
                    socketio.emit(
                        "song_progress",
                        {
                            "song_id": next_song["id"],
                            "stage": "buffering",
                            "progress": 100,
                        },
                    )

                    # Now that the file is ready, pop the song out of the queue
                    # and begin playback.
                    song = queue_manager.pop_next()
                    if not song:
                        # Could not pop (race or removed) — skip this cycle
                        print("⚠ Next song disappeared from queue before it could be popped")
                        continue

                    print(f"Processing song: {song['title']}")
                    queue_manager.set_playing(True)
                    # Notify clients that the queue changed (we popped the next song)
                    try:
                        socketio.emit('queue_updated', queue_manager.get_queue())
                    except Exception:
                        pass

                    # Announce start and mark playing
                    try:
                        song['status'] = 'playing'
                        song['progress'] = 100
                        song['stage'] = 'playing'
                    except Exception:
                        pass
                    socketio.emit("song_started", song)
                    socketio.emit(
                        "song_progress",
                        {"song_id": song["id"], "stage": "playing", "progress": 100},
                    )

                    # Ensure clients refresh queue view for current state
                    try:
                        socketio.emit('queue_updated', queue_manager.get_queue())
                    except Exception:
                        pass

                    # Kick off a background prefetch for the *next* song so it
                    # is ready by the time this one finishes.
                    def _prefetch_next() -> None:
                        try:
                            qs = queue_manager.get_queue()
                            upcoming = qs.get("queue") or []
                            if not upcoming:
                                return

                            next_song = upcoming[0]
                            next_id = next_song["id"]
                            print(f"⏭ Prefetching next song: {next_song['title']}")

                            # Update the queued item's status so a freshly
                            # connected client will see it's being prepared.
                            try:
                                next_song['status'] = 'downloading'
                                next_song['progress'] = 0
                                next_song['stage'] = 'downloading'
                            except Exception:
                                pass

                            # Let the UI know we're starting to prepare this
                            # queued song; we don't have fine-grained bytes
                            # downloaded, but coarse stages are still useful.
                            socketio.emit(
                                "song_progress",
                                {
                                    "song_id": next_id,
                                    "stage": "downloading",
                                    "progress": 0,
                                },
                            )
                            # Also broadcast the updated queue so clients refresh
                            try:
                                socketio.emit('queue_updated', queue_manager.get_queue())
                            except Exception:
                                pass

                            # Mid-way bump for visual feedback while the
                            # download runs.
                            socketio.emit(
                                "song_progress",
                                {
                                    "song_id": next_id,
                                    "stage": "downloading",
                                    "progress": 50,
                                },
                            )

                            # Provide a progress callback for the prefetch so UI shows percent
                            def _prefetch_progress_cb(sid, stage, pct, s=next_song):
                                try:
                                    s['status'] = stage
                                    s['progress'] = pct
                                    s['stage'] = stage
                                except Exception:
                                    pass
                                try:
                                    socketio.emit('song_progress', {'song_id': sid, 'stage': stage, 'progress': pct})
                                except Exception:
                                    pass

                            queue_manager.ensure_downloaded(next_song, progress_callback=_prefetch_progress_cb)

                            # Mark as ready/buffered in the queue so clients
                            # can show that the next item is prepared.
                            try:
                                next_song['status'] = 'buffering'
                                next_song['progress'] = 100
                                next_song['stage'] = 'buffering'
                            except Exception:
                                pass
                            socketio.emit(
                                "song_progress",
                                {
                                    "song_id": next_id,
                                    "stage": "buffering",
                                    "progress": 100,
                                },
                            )
                            try:
                                socketio.emit('queue_updated', queue_manager.get_queue())
                            except Exception:
                                pass
                            print(f"✓ Next song ready: {next_song['title']}")
                        except Exception as e:
                            print(f"Could not prefetch next song: {e}")
                            try:
                                socketio.emit(
                                    "song_progress",
                                    {
                                        "song_id": next_song.get("id")
                                        if "next_song" in locals()
                                        else "",
                                        "stage": "error",
                                        "progress": 0,
                                    },
                                )
                            except Exception:
                                pass

                    threading.Thread(target=_prefetch_next, daemon=True).start()

                    play_audio_with_sync(
                        socketio=socketio,
                        connected_clients=connected_clients,
                        playback_state=playback_state,
                        audio_file=audio_file,
                        song_id=song["id"],
                        duration=song["duration"],
                        light_show=None,
                    )

                except Exception as e:
                    print(f"✗ Error processing song: {e}")
                    import traceback

                    traceback.print_exc()
                    socketio.emit(
                        "song_error", {"song": song, "error": str(e)},
                    )
                    socketio.emit(
                        "song_progress",
                        {
                            "song_id": song["id"],
                            "stage": "error",
                            "progress": 0,
                        },
                    )

                    try:
                        song['status'] = 'error'
                        song['progress'] = 0
                        song['stage'] = 'error'
                    except Exception:
                        pass

                finally:
                    # Clear current song and let clients know the queue changed
                    try:
                        queue_manager.clear_current()
                    except Exception:
                        # Best-effort: fall back to set_playing(False)
                        try:
                            queue_manager.set_playing(False)
                        except Exception:
                            pass
                    try:
                        socketio.emit('queue_updated', queue_manager.get_queue())
                    except Exception:
                        pass
                    socketio.emit("song_finished", song)

        time.sleep(1)


def prefetch_queue_worker(
    socketio: SocketIO,
    queue_manager: QueueManager,
) -> None:
    """Background worker that pre-downloads upcoming songs.

    Runs independently of playback so that while one track is playing,
    upcoming items in the queue can move from "Waiting" to
    "Downloading"/"Preparing" in the UI.
    """

    checked: set[str] = set()

    while True:
        try:
            state = queue_manager.get_queue()
            queue = state.get("queue") or []

            for song in queue:
                song_id = song.get("id")
                if not song_id or song_id in checked:
                    continue

                # Mark so we don't repeatedly kick progress for the same song
                checked.add(song_id)

                # Update the in-memory queue item so freshly connected
                # clients see its processing state when they fetch /api/queue.
                try:
                    song['status'] = 'downloading'
                    song['progress'] = 0
                    song['stage'] = 'downloading'
                except Exception:
                    pass
                socketio.emit(
                    "song_progress",
                    {
                        "song_id": song_id,
                        "stage": "downloading",
                        "progress": 0,
                    },
                )

                try:
                    # Use a progress callback here as well so UI shows live percent
                    def _pf_cb(sid, stage, pct, s=song):
                        try:
                            s['status'] = stage
                            s['progress'] = pct
                            s['stage'] = stage
                        except Exception:
                            pass
                        try:
                            socketio.emit('song_progress', {'song_id': sid, 'stage': stage, 'progress': pct})
                        except Exception:
                            pass

                    queue_manager.ensure_downloaded(song, progress_callback=_pf_cb)
                    try:
                        # Decide whether this downloaded item is the immediate
                        # next in queue (prepare label) or just a downloaded
                        # item sitting in the queue. Query the current queue
                        # to make this decision robust to reordering/removals.
                        state = queue_manager.get_queue()
                        upcoming = state.get('queue') or []
                        # Find the position of this song in the current queue
                        pos = next((i for i, s in enumerate(upcoming) if s.get('id') == song_id), None)
                        if pos == 0:
                            # Immediate next: preparing
                            song['status'] = 'buffering'
                            song['progress'] = 100
                            song['stage'] = 'buffering'
                            emit_stage = 'buffering'
                        else:
                            # Downloaded and waiting in queue
                            song['status'] = 'downloaded'
                            song['progress'] = 100
                            song['stage'] = 'downloaded'
                            emit_stage = 'downloaded'
                    except Exception:
                        pass
                    socketio.emit(
                        "song_progress",
                        {
                            "song_id": song_id,
                            "stage": emit_stage,
                            "progress": 100,
                        },
                    )
                except Exception as e:
                    print(f"Prefetch error for {song.get('title')}: {e}")
                    socketio.emit(
                        "song_progress",
                        {
                            "song_id": song_id,
                            "stage": "error",
                            "progress": 0,
                        },
                    )

        except Exception as e:
            print(f"Prefetch worker loop error: {e}")

        time.sleep(2)
