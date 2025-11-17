"""
Socket.IO event handlers for JukeboxLED.
"""
import time
import traceback

from . import socketio, connected_clients, playback_state, queue_manager
from flask import request


@socketio.on('connect')
def handle_connect():
    sid = request.sid
    user_agent = request.headers.get('User-Agent', '')
    is_bridge = 'Python' in user_agent or 'socketio' in user_agent.lower()
    connected_clients[sid] = {'is_bridge': is_bridge}
    client_type = "🤖 Bridge" if is_bridge else "🌐 Browser"
    print(f'✓ {client_type} connected: {sid}')
    bridge_count = sum(1 for c in connected_clients.values() if c.get('is_bridge'))
    browser_count = sum(1 for c in connected_clients.values() if not c.get('is_bridge'))
    print(f'  Total: {bridge_count} bridge(s), {browser_count} browser(s)')


@socketio.on('announce_bridge')
def handle_announce_bridge(data):
    sid = request.sid
    info = data or {}
    if sid not in connected_clients:
        connected_clients[sid] = {}
    connected_clients[sid]['is_bridge'] = True
    connected_clients[sid].setdefault('bridge_info', {})
    connected_clients[sid]['bridge_info'].update(info)
    print(f"✓ 🤖 Bridge announced: {sid} info={info}")
    bridge_count = sum(1 for c in connected_clients.values() if c.get('is_bridge'))
    browser_count = sum(1 for c in connected_clients.values() if not c.get('is_bridge'))
    print(f'  Total: {bridge_count} bridge(s), {browser_count} browser(s)')


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    client_info = connected_clients.pop(sid, {})
    client_type = "🤖 Bridge" if client_info.get('is_bridge') else "🌐 Browser"
    print(f'✗ {client_type} disconnected: {sid}')
    bridge_count = sum(1 for c in connected_clients.values() if c.get('is_bridge'))
    browser_count = sum(1 for c in connected_clients.values() if not c.get('is_bridge'))
    print(f'  Total: {bridge_count} bridge(s), {browser_count} browser(s)')


@socketio.on('toggle_playback')
def handle_toggle_playback(data):
    is_playing = data.get('playing', False)
    print(f"{'▶️ ' if is_playing else '⏸️ '} Playback toggled: {'playing' if is_playing else 'paused'}")
    playback_state['is_playing'] = is_playing
    if not is_playing:
        playback_state['pause_time'] = time.time()
        playback_state['just_unpaused'] = False
    else:
        playback_state['pause_time'] = 0
        playback_state['just_unpaused'] = True
    try:
        import pygame
        if hasattr(pygame, 'mixer'):
            if is_playing:
                pygame.mixer.music.unpause()
                print("  ▶️ Music unpaused")
            else:
                pygame.mixer.music.pause()
                print("  ⏸️ Music paused")
    except Exception as e:
        print(f"  ⚠ Could not control playback: {e}")
    socketio.emit('playback_state_changed', {'is_playing': is_playing})


@socketio.on('skip_song')
def handle_skip_song(data):
    direction = data.get('direction', 'next')
    print(f"⏭️  Skipping {direction}")
    if direction == 'next':
        playback_state['song_stopped'] = True
        try:
            import pygame
            if hasattr(pygame, 'mixer'):
                pygame.mixer.music.stop()
                print("  ▶️ Stopped current playback")
        except Exception as e:
            print(f"  ⚠ Could not stop playback: {e}")
        queue_manager.skip_current()
        socketio.emit('song_skipped', {'direction': 'next'})
        print("  ⏭️ Skipped to next song")


@socketio.on('seek_song')
def handle_seek_song(data):
    time_pos = data.get('time', 0)
    print(f"⏩ Seek to {time_pos:.1f}s")


@socketio.on('set_volume')
def handle_set_volume(data):
    volume = data.get('volume', 0.7)
    print(f"🔊 Volume set to {volume * 100:.0f}%")
    try:
        import pygame
        if hasattr(pygame, 'mixer'):
            pygame.mixer.music.set_volume(volume)
    except Exception:
        pass


@socketio.on('arduino_info')
def handle_arduino_info(data):
    try:
        print(f"[Bridge] Arduino info: {data}")
        socketio.emit('arduino_info', data)
    except Exception as e:
        print(f"Error forwarding arduino_info: {e}")


@socketio.on('led_levels')
def handle_led_levels(data):
    try:
        socketio.emit('led_levels', data)
    except Exception as e:
        print(f"Error forwarding led_levels: {e}")
