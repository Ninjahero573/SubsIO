"""
Socket.IO event handlers for JukeboxLED.
"""
import time
import traceback

from . import socketio, connected_clients, playback_state, queue_manager
from flask import request
from flask_login import current_user


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
    # No user announced yet; clients may announce their username separately.
    # If the connecting socket has an authenticated Flask user, record it so
    # the presence list reflects logged-in users across devices.
    try:
        if current_user and getattr(current_user, 'is_authenticated', False):
            name = getattr(current_user, 'display_name', None) or getattr(current_user, 'email', None) or ''
            connected_clients[sid]['user'] = {'name': name, 'user_id': getattr(current_user, 'id', None)}
            print(f"🔐 Associated authenticated user for {sid}: {name}")
            # Broadcast updated user list to everyone so presence reflects this immediately
            try:
                users = []
                for s, info in connected_clients.items():
                    if info.get('is_bridge'):
                        continue
                    u = info.get('user') or {}
                    short_id = (s[:8] + '..') if isinstance(s, str) and len(s) > 8 else s
                    users.append({'id': short_id, 'name': u.get('name') or 'Anonymous'})
                socketio.emit('user_list', {'users': users})
            except Exception:
                pass
    except Exception:
        pass


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


@socketio.on('announce_user')
def handle_announce_user(data):
    """Client announces its user info (e.g. display name). Stored per-socket.

    Expected payload: { 'name': 'Alice' }
    """
    sid = request.sid
    info = data or {}
    name = info.get('name') or ''
    if sid not in connected_clients:
        connected_clients[sid] = {}
    connected_clients[sid]['user'] = {'name': name}
    print(f"👥 User announced for {sid}: {name}")
    # Broadcast updated user list to all connected browsers so everyone sees the change
    try:
        users = []
        for s, info in connected_clients.items():
            if info.get('is_bridge'):
                continue
            u = info.get('user') or {}
            short_id = (s[:8] + '..') if isinstance(s, str) and len(s) > 8 else s
            users.append({'id': short_id, 'name': u.get('name') or 'Anonymous'})
        socketio.emit('user_list', {'users': users})
    except Exception:
        pass


@socketio.on('request_user_list')
def handle_request_user_list():
    """Send the list of connected browser users to the requesting socket."""
    sid = request.sid
    try:
        users = []
        for s, info in connected_clients.items():
            # Only include browser clients (not bridge/hardware)
            if info.get('is_bridge'):
                continue
            u = info.get('user') or {}
            # For anonymity, don't include raw socket id; include a short id
            short_id = (s[:8] + '..') if isinstance(s, str) and len(s) > 8 else s
            users.append({'id': short_id, 'name': u.get('name') or 'Anonymous'})
        socketio.emit('user_list', {'users': users}, room=sid)
        print(f"Sent user list to {sid}, {len(users)} users")
    except Exception as e:
        print(f"Error building user list: {e}")


@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    client_info = connected_clients.pop(sid, {})
    client_type = "🤖 Bridge" if client_info.get('is_bridge') else "🌐 Browser"
    print(f'✗ {client_type} disconnected: {sid}')
    bridge_count = sum(1 for c in connected_clients.values() if c.get('is_bridge'))
    browser_count = sum(1 for c in connected_clients.values() if not c.get('is_bridge'))
    print(f'  Total: {bridge_count} bridge(s), {browser_count} browser(s)')
    # Broadcast updated user list to everyone so presence reflects disconnects
    try:
        users = []
        for s, info in connected_clients.items():
            if info.get('is_bridge'):
                continue
            u = info.get('user') or {}
            short_id = (s[:8] + '..') if isinstance(s, str) and len(s) > 8 else s
            users.append({'id': short_id, 'name': u.get('name') or 'Anonymous'})
        socketio.emit('user_list', {'users': users})
    except Exception:
        pass


@socketio.on('request_current_state')
def handle_request_current_state():
    """Client requests current playback state. Send back current song, play status, etc."""
    from flask_socketio import emit
    current_song = queue_manager.get_current_song()
    state = {
        'current_song': current_song,
        'is_playing': playback_state.get('is_playing', False),
        'current_time': playback_state.get('current_time', 0),
        'queue_length': len(queue_manager.get_queue()),
    }
    emit('current_state', state)


@socketio.on('request_queue')
def handle_request_queue():
    """Client requests the queue. Send back full queue."""
    from flask_socketio import emit
    queue_data = queue_manager.get_queue()
    # queue_data is a dict with 'queue', 'current', 'is_playing'
    # Extract just the queue list
    queue_list = queue_data.get('queue', []) if isinstance(queue_data, dict) else queue_data
    emit('queue_updated', {'queue': queue_list})


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


@socketio.on('remove_from_queue')
def handle_remove_from_queue(data):
    """Remove a song from the queue by index"""
    index = data.get('index')
    if index is not None:
        queue_data = queue_manager.get_queue()
        queue = queue_data.get('queue', [])
        
        if 0 <= index < len(queue):
            removed_song = queue.pop(index)
            print(f"🗑️  Removed from queue: {removed_song.get('title', 'Unknown')} (index {index})")
            
            # Save the modified queue
            queue_manager._save_queue_state()
            
            # Notify all clients of the updated queue
            from flask_socketio import emit
            updated_queue = queue_data.get('queue', [])
            socketio.emit('queue_updated', {'queue': updated_queue})
        else:
            print(f"⚠ Invalid queue index: {index}")


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
