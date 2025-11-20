"""
HTTP route handlers for the JukeboxLED app. Uses objects exported from `server`.
"""
import os
import json
import time
import traceback
from typing import Optional

import requests
from flask import render_template, request, jsonify, send_file, send_from_directory, session, redirect, url_for
from config import OAUTH_REDIRECT_URI as DEFAULT_OAUTH_REDIRECT_URI, OAUTH_REDIRECT_BASE

from . import app, socketio, queue_manager
from auth.token_store import save_credentials, load_credentials, delete_credentials

# Google OAuth / YouTube availability check (module import may fail in some envs)
try:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    GOOGLE_OAUTH_AVAILABLE = True
except Exception:
    GOOGLE_OAUTH_AVAILABLE = False


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/audio/<song_id>')
def get_audio(song_id):
    audio_file = os.path.join('downloads', f"{song_id}.mp3")
    if os.path.exists(audio_file):
        return send_file(audio_file, mimetype='audio/mpeg')
    return jsonify({'error': 'Audio file not found'}), 404


@app.route('/api/lightshow/<song_id>')
def get_lightshow(song_id):
    lightshow_file = os.path.join('lightshows', f"{song_id}.json.gz")
    if os.path.exists(lightshow_file):
        return send_file(lightshow_file, mimetype='application/gzip')
    return jsonify({'error': 'Light show not found'}), 404


@app.route('/api/preprogram/<song_id>')
def get_preprogram(song_id):
    return jsonify({'error': 'Preprogram generation/download disabled'}), 410


@app.route('/api/queue', methods=['GET'])
def get_queue():
    return jsonify(queue_manager.get_queue())


@app.route('/api/queue/<song_id>', methods=['DELETE'])
def delete_queue_song(song_id: str):
    """Delete a song from the upcoming queue (not the currently playing song).

    This endpoint is idempotent: deleting a non-existent song still returns success.
    Emits a queue_updated event so connected clients refresh their views.
    """
    try:
        # Remove from queue; current song is stored separately and not affected here
        queue_manager.remove_song(song_id)
        socketio.emit('queue_updated', queue_manager.get_queue())
        return jsonify({'success': True, 'removed': song_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/add_song', methods=['POST'])
def add_song():
    data = request.json or {}
    song_url = data.get('url')
    added_by = data.get('added_by', 'Anonymous')
    if not song_url:
        return jsonify({'error': 'No URL provided'}), 400
    try:
        song_id = queue_manager.add_song(song_url, added_by)
        socketio.emit('queue_updated', queue_manager.get_queue())
        return jsonify({'success': True, 'song_id': song_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/search', methods=['GET'])
def search():
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'error': 'No query provided'}), 400

    # Use yt_dlp to perform a YouTube search and return lightweight metadata
    try:
        import yt_dlp
    except Exception:
        return jsonify({'error': 'yt_dlp not available on server'}), 500

    try:
        limit = int(request.args.get('limit', 10))
        offset = int(request.args.get('offset', 0))
        total_search = limit + offset
        if total_search > 50:  # cap at 50 to avoid too many
            total_search = 50
        # Use ytsearch to get results
        query = f"ytsearch{total_search}:{q}"
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            # extract_flat returns minimal metadata quickly for search
            'extract_flat': True,
        }
        results = []
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(query, download=False)
            entries = info.get('entries') or []
            # Slice to get the requested range
            sliced_entries = entries[offset:offset + limit]
            for e in sliced_entries:
                # Each entry in flat mode may include 'id' and 'title'
                vid = e.get('id') or e.get('url')
                # Build a YouTube watch URL when possible
                url = e.get('webpage_url') or (f"https://www.youtube.com/watch?v={vid}" if vid else None)
                # If yt_dlp did not provide a thumbnail, fall back to the standard YouTube thumbnail URL
                thumb = e.get('thumbnail') or (f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else '')
                results.append({
                    'title': e.get('title') or '',
                    'artist': e.get('uploader') or e.get('uploader_id') or '',
                    'duration': e.get('duration') or 0,
                    'thumbnail': thumb,
                    'url': url,
                    'video_id': vid,
                })

        return jsonify({'results': results})
    except Exception as ex:
        traceback.print_exc()
        return jsonify({'error': str(ex)}), 500


# --- YouTube / OAuth routes (kept mostly as-is) --------------------------------
def _get_client_config():
    return {
        "web": {
            "client_id": os.getenv('GOOGLE_OAUTH_CLIENT_ID'),
            "client_secret": os.getenv('GOOGLE_OAUTH_CLIENT_SECRET'),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [os.getenv('OAUTH_REDIRECT_URI', DEFAULT_OAUTH_REDIRECT_URI)]
        }
    }


def _validate_client_config(cfg):
    """Return (ok: bool, message: Optional[str]) if client_id/secret are present."""
    web = cfg.get('web') or {}
    cid = web.get('client_id')
    csec = web.get('client_secret')
    if not cid or not csec:
        return False, (
            'Missing Google OAuth client configuration. Ensure environment variables '
            '`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are set. '
            'You can inspect safe masks at /admin/oauth_config'
        )
    return True, None


@app.route('/auth/youtube/login')
def youtube_login():
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'Google OAuth libraries not installed'}), 500
    cfg = _get_client_config()
    ok, msg = _validate_client_config(cfg)
    if not ok:
        return jsonify({'error': 'oauth_misconfigured', 'details': msg}), 400
    flow = Flow.from_client_config(cfg, scopes=["https://www.googleapis.com/auth/youtube.readonly"])
    flow.redirect_uri = os.getenv('OAUTH_REDIRECT_URI', DEFAULT_OAUTH_REDIRECT_URI)
    auth_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent')
    session['oauth_state'] = state
    # Debug info to help diagnose redirect/timeouts (do not log secrets)
    try:
        print(f"[OAuth] start: auth_url={auth_url}")
        print(f"[OAuth] using redirect_uri={flow.redirect_uri}")
    except Exception:
        pass
    return redirect(auth_url)


@app.route('/auth/youtube/callback')
def youtube_callback():
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'Google OAuth libraries not installed'}), 500
    state = session.get('oauth_state')
    cfg = _get_client_config()
    ok, msg = _validate_client_config(cfg)
    if not ok:
        return jsonify({'error': 'oauth_misconfigured', 'details': msg}), 400
    flow = Flow.from_client_config(cfg, scopes=["https://www.googleapis.com/auth/youtube.readonly"], state=state)
    flow.redirect_uri = os.getenv('OAUTH_REDIRECT_URI', DEFAULT_OAUTH_REDIRECT_URI)
    try:
        # Log incoming callback info for debugging
        try:
            print(f"[OAuth] callback invoked: request.url={request.url}")
            print(f"[OAuth] expected redirect_uri={flow.redirect_uri}")
            print(f"[OAuth] session_state={state} remote_addr={request.remote_addr}")
            # show any error param returned by the provider
            if 'error' in request.args:
                print(f"[OAuth] provider returned error: {request.args.get('error')}")
        except Exception:
            pass

        flow.fetch_token(authorization_response=request.url)
    except Exception as e:
        print("⚠ OAuth token exchange failed for YouTube callback:", e)
        traceback.print_exc()
        # Common causes: incorrect client ID/secret, mismatched redirect URI, or using an OAuth client
        # type that doesn't support the requested flow. Provide actionable guidance.
        hint = (
            'Token exchange failed. Verify GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET are correct, '
            'and that the redirect URI in the Google Cloud Console exactly matches the app redirect. '
            'Check /admin/oauth_config for masked values.'
        )
        return jsonify({'error': 'OAuth token exchange failed', 'details': str(e), 'hint': hint}), 500
    creds = flow.credentials
    try:
        creds_json = creds.to_json()
        creds_dict = json.loads(creds_json)
    except Exception:
        creds_dict = {
            'token': getattr(creds, 'token', None),
            'refresh_token': getattr(creds, 'refresh_token', None),
            'token_uri': getattr(creds, 'token_uri', None),
            'client_id': getattr(creds, 'client_id', None),
            'client_secret': getattr(creds, 'client_secret', None),
            'scopes': getattr(creds, 'scopes', None),
        }

    # Try to identify user via YouTube API
    user_id = None
    try:
        svc = build('youtube', 'v3', credentials=creds, cache_discovery=False)
        ch = svc.channels().list(part='id', mine=True, maxResults=1).execute()
        items = ch.get('items', [])
        if items:
            user_id = f"yt_channel:{items[0].get('id')}"
    except Exception:
        user_id = f"yt_user:{int(time.time())}"

    try:
        save_credentials(user_id, creds_dict)
        session['youtube_user_id'] = user_id
    except Exception as e:
        print(f"⚠ Failed to save YouTube credentials: {e}")

    return redirect(url_for('index'))


def _env_prefix(flow_name: str) -> str:
    return flow_name.upper()


def _get_generic_client_config(flow_name: str):
    p = _env_prefix(flow_name)
    client_id = os.getenv(f"{p}_CLIENT_ID")
    client_secret = os.getenv(f"{p}_CLIENT_SECRET")
    auth_uri = os.getenv(f"{p}_AUTH_URI")
    token_uri = os.getenv(f"{p}_TOKEN_URI")
    redirect = os.getenv(f"{p}_REDIRECT_URI", os.getenv('OAUTH_REDIRECT_URI', f'{OAUTH_REDIRECT_BASE}/auth/{flow_name}/callback'))
    scopes = os.getenv(f"{p}_SCOPES", '')
    if not (client_id and client_secret and auth_uri and token_uri):
        return None
    scopes_list = [s.strip() for s in scopes.split(',')] if scopes else []
    return {
        'web': {
            'client_id': client_id,
            'client_secret': client_secret,
            'auth_uri': auth_uri,
            'token_uri': token_uri,
            'redirect_uris': [redirect]
        },
        'scopes': scopes_list,
        'redirect': redirect,
    }


@app.route('/auth/youtube/logout')
def youtube_logout():
    """Sign the current YouTube user out: revoke token (best-effort), delete stored credentials, clear session."""
    user_id = session.pop('youtube_user_id', None)
    if user_id:
        try:
            creds = load_credentials(user_id)
        except Exception:
            creds = None

        # Try to revoke any available token (access or refresh)
        token = None
        if creds:
            token = creds.get('refresh_token') or creds.get('token') or creds.get('access_token')
        if token:
            try:
                requests.post('https://oauth2.googleapis.com/revoke', params={'token': token}, timeout=5)
            except Exception:
                pass

        try:
            delete_credentials(user_id)
        except Exception:
            pass

    return redirect(url_for('index'))


@app.route('/auth/<flow_name>/login')
def generic_oauth_login(flow_name: str):
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'OAuth libraries not installed'}), 500
    cfg = _get_generic_client_config(flow_name)
    if not cfg:
        return jsonify({'error': f'Configuration for flow {flow_name} not found'}), 400
    scopes = cfg.get('scopes') or []
    flow = Flow.from_client_config({'web': cfg['web']}, scopes=scopes)
    flow.redirect_uri = cfg['redirect']
    auth_url, state = flow.authorization_url(access_type='offline', include_granted_scopes='true', prompt='consent')
    session[f'oauth_state_{flow_name}'] = state
    return redirect(auth_url)


@app.route('/auth/<flow_name>/callback')
def generic_oauth_callback(flow_name: str):
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'OAuth libraries not installed'}), 500
    cfg = _get_generic_client_config(flow_name)
    if not cfg:
        return jsonify({'error': f'Configuration for flow {flow_name} not found'}), 400
    state = session.get(f'oauth_state_{flow_name}')
    flow = Flow.from_client_config({'web': cfg['web']}, scopes=cfg.get('scopes', []), state=state)
    flow.redirect_uri = cfg['redirect']
    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as e:
        print(f"⚠ OAuth token exchange failed for flow {flow_name}:", e)
        traceback.print_exc()
        return jsonify({'error': 'OAuth token exchange failed', 'details': str(e)}), 500
    creds = flow.credentials
    user_id = f"{flow_name}:{int(time.time())}"
    userinfo_endpoint = os.getenv(f"{_env_prefix(flow_name)}_USERINFO_ENDPOINT")
    try:
        if userinfo_endpoint:
            headers = {'Authorization': f'Bearer {creds.token}'}
            r = requests.get(userinfo_endpoint, headers=headers, timeout=5)
            if r.ok:
                info = r.json()
                uid = info.get('sub') or info.get('id') or info.get('email')
                if uid:
                    user_id = f"{flow_name}:{uid}"
    except Exception:
        pass

    try:
        try:
            creds_json = creds.to_json()
            creds_dict = json.loads(creds_json)
        except Exception:
            creds_dict = {
                'token': getattr(creds, 'token', None),
                'refresh_token': getattr(creds, 'refresh_token', None),
                'token_uri': getattr(creds, 'token_uri', None),
                'client_id': getattr(creds, 'client_id', None),
                'client_secret': getattr(creds, 'client_secret', None),
                'scopes': getattr(creds, 'scopes', None),
            }
        save_credentials(user_id, creds_dict)
        session[f'oauth_user_{flow_name}'] = user_id
    except Exception as e:
        print(f"⚠ Failed to save credentials for {flow_name}: {e}")

    return redirect(url_for('index'))


@app.route('/auth/<flow_name>/logout')
def generic_oauth_logout(flow_name: str):
    """Generic logout for named OAuth flows. Removes stored credentials and clears session."""
    key = f'oauth_user_{flow_name}'
    user_id = session.pop(key, None)
    if user_id:
        try:
            creds = load_credentials(user_id)
        except Exception:
            creds = None

        token = None
        if creds:
            token = creds.get('refresh_token') or creds.get('token') or creds.get('access_token')
        if token:
            try:
                requests.post('https://oauth2.googleapis.com/revoke', params={'token': token}, timeout=5)
            except Exception:
                pass
        try:
            delete_credentials(user_id)
        except Exception:
            pass

    return redirect(url_for('index'))


# --- Spotify OAuth + API helper endpoints ----------------------------------
def _spotify_client_config():
    client_id = os.getenv('SPOTIFY_CLIENT_ID')
    client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
    redirect = os.getenv('SPOTIFY_REDIRECT_URI', os.getenv('OAUTH_REDIRECT_URI', f'{OAUTH_REDIRECT_BASE}/auth/spotify/callback'))
    if not (client_id and client_secret):
        return None
    return {
        'client_id': client_id,
        'client_secret': client_secret,
        'redirect': redirect,
        'auth_uri': 'https://accounts.spotify.com/authorize',
        'token_uri': 'https://accounts.spotify.com/api/token',
        'scopes': 'playlist-read-private,playlist-read-collaborative,user-read-private'
    }


@app.route('/auth/spotify/login')
def spotify_login():
    cfg = _spotify_client_config()
    if not cfg:
        return jsonify({'error': 'spotify_oauth_misconfigured'}), 400
    import secrets
    state = secrets.token_urlsafe(16)
    session['oauth_state_spotify'] = state
    params = {
        'client_id': cfg['client_id'],
        'response_type': 'code',
        'redirect_uri': cfg['redirect'],
        'scope': cfg['scopes'],
        'state': state,
        'show_dialog': 'true'
    }
    url = cfg['auth_uri'] + '?' + '&'.join([f"{k}={requests.utils.quote(v)}" for k, v in params.items()])
    return redirect(url)


@app.route('/auth/spotify/callback')
def spotify_callback():
    cfg = _spotify_client_config()
    if not cfg:
        return jsonify({'error': 'spotify_oauth_misconfigured'}), 400
    state = session.get('oauth_state_spotify')
    if not state or state != request.args.get('state'):
        # proceed but warn — state mismatch may indicate CSRF or expired session
        print('⚠ Spotify OAuth state mismatch or missing')

    code = request.args.get('code')
    if not code:
        return jsonify({'error': 'no_code_in_callback'}), 400

    # Exchange code for tokens
    token_url = cfg['token_uri']
    auth = (cfg['client_id'], cfg['client_secret'])
    data = {
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': cfg['redirect']
    }
    try:
        r = requests.post(token_url, data=data, auth=auth, timeout=10)
        r.raise_for_status()
        tok = r.json()
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'token_exchange_failed', 'details': str(e)}), 500

    # Identify user via Spotify Web API
    access = tok.get('access_token')
    if not access:
        return jsonify({'error': 'no_access_token_from_spotify'}), 500
    headers = {'Authorization': f'Bearer {access}'}
    try:
        me = requests.get('https://api.spotify.com/v1/me', headers=headers, timeout=5).json()
        uid = me.get('id') or f"spotify:{int(time.time())}"
        display_name = me.get('display_name') or me.get('id')
        user_id = f"spotify:{uid}"
    except Exception:
        user_id = f"spotify:{int(time.time())}"
        display_name = None

    # Persist tokens (store the token response dict along with obtained_at)
    tok['obtained_at'] = int(time.time())
    try:
        save_credentials(user_id, tok)
        session['spotify_user_id'] = user_id
    except Exception as e:
        print(f"⚠ Failed to save Spotify credentials: {e}")

    return redirect(url_for('index'))


@app.route('/auth/spotify/logout')
def spotify_logout():
    user_id = session.pop('spotify_user_id', None)
    if user_id:
        try:
            delete_credentials(user_id)
        except Exception:
            pass
    return redirect(url_for('index'))


def _refresh_spotify_token_if_needed(creds: dict):
    # creds: dict returned by token exchange or saved data
    token_uri = 'https://accounts.spotify.com/api/token'
    if not creds:
        return creds
    # If token has expires_in and obtained_at, check expiry
    expires_in = int(creds.get('expires_in') or 0)
    obtained = int(creds.get('obtained_at') or 0)
    refresh_token = creds.get('refresh_token')
    client_id = os.getenv('SPOTIFY_CLIENT_ID')
    client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
    if expires_in and obtained and (time.time() > (obtained + expires_in - 30)) and refresh_token:
        # refresh
        try:
            resp = requests.post(token_uri, data={'grant_type': 'refresh_token', 'refresh_token': refresh_token}, auth=(client_id, client_secret), timeout=8)
            resp.raise_for_status()
            newtok = resp.json()
            # keep refresh_token if provider didn't return a new one
            if 'refresh_token' not in newtok:
                newtok['refresh_token'] = refresh_token
            newtok['obtained_at'] = int(time.time())
            return newtok
        except Exception:
            traceback.print_exc()
            return creds
    return creds


@app.route('/api/spotify/profile', methods=['GET'])
def api_spotify_profile():
    user_id = session.get('spotify_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401
    creds = load_credentials(user_id)
    if not creds:
        return jsonify({'error': 'credentials_not_found'}), 401
    try:
        creds = _refresh_spotify_token_if_needed(creds) or creds
        # persist refreshed creds
        save_credentials(user_id, creds)
        headers = {'Authorization': f"Bearer {creds.get('access_token')}"}
        r = requests.get('https://api.spotify.com/v1/me', headers=headers, timeout=6)
        if not r.ok:
            return jsonify({'error': 'failed_to_get_profile'}), 500
        info = r.json()
        return jsonify({'displayName': info.get('display_name'), 'id': info.get('id')})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_get_profile', 'details': str(e)}), 500


@app.route('/api/spotify/playlists', methods=['GET'])
def api_spotify_playlists():
    user_id = session.get('spotify_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401
    creds = load_credentials(user_id)
    if not creds:
        return jsonify({'error': 'credentials_not_found'}), 401
    try:
        creds = _refresh_spotify_token_if_needed(creds) or creds
        save_credentials(user_id, creds)
        headers = {'Authorization': f"Bearer {creds.get('access_token')}"}
        items = []
        # Use the user's playlists endpoint (paginated); fetch first page up to 50
        r = requests.get('https://api.spotify.com/v1/me/playlists?limit=50', headers=headers, timeout=8)
        if not r.ok:
            return jsonify({'error': 'failed_to_list_playlists', 'details': r.text}), 500
        data = r.json()
        for pl in data.get('items', []):
            pid = pl.get('id')
            title = pl.get('name')
            count = (pl.get('tracks') or {}).get('total') or 0
            images = pl.get('images') or []
            thumb = images[0].get('url') if images else None
            items.append({'id': pid, 'title': title, 'count': count, 'thumbnail': thumb})
        return jsonify({'items': items})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_list_playlists', 'details': str(e)}), 500


@app.route('/api/spotify/playlist/<playlist_id>/tracks', methods=['GET'])
def api_spotify_playlist_tracks(playlist_id: str):
    user_id = session.get('spotify_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401
    creds = load_credentials(user_id)
    if not creds:
        return jsonify({'error': 'credentials_not_found'}), 401
    try:
        creds = _refresh_spotify_token_if_needed(creds) or creds
        save_credentials(user_id, creds)
        headers = {'Authorization': f"Bearer {creds.get('access_token')}"}
        r = requests.get(f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit=100', headers=headers, timeout=8)
        if not r.ok:
            return jsonify({'error': 'failed_to_load_playlist_tracks', 'details': r.text}), 500
        data = r.json()
        items = []
        for it in data.get('items', []):
            tr = it.get('track') or {}
            if not tr: continue
            tid = tr.get('id')
            name = tr.get('name')
            artists = ', '.join([a.get('name') for a in (tr.get('artists') or []) if a.get('name')])
            album = (tr.get('album') or {}).get('name')
            images = (tr.get('album') or {}).get('images') or []
            thumb = images[0].get('url') if images else None
            duration_ms = tr.get('duration_ms')
            preview = tr.get('preview_url')
            external = (tr.get('external_urls') or {}).get('spotify')
            items.append({'id': tid, 'title': name, 'artists': artists, 'album': album, 'thumbnail': thumb, 'duration_ms': duration_ms, 'preview_url': preview, 'external_url': external})
        return jsonify({'items': items})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_load_playlist_tracks', 'details': str(e)}), 500



# --- YouTube API helper endpoints used by the frontend ----------------------
@app.route('/api/youtube/playlists', methods=['GET'])
def api_youtube_playlists():
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'Google OAuth libraries not installed'}), 500
    user_id = session.get('youtube_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401

    creds_dict = load_credentials(user_id)
    if not creds_dict:
        return jsonify({'error': 'credentials_not_found'}), 401

    try:
        creds = Credentials.from_authorized_user_info(creds_dict)
        # Refresh if needed
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            # persist refreshed creds
            save_credentials(user_id, json.loads(creds.to_json()))

        svc = build('youtube', 'v3', credentials=creds, cache_discovery=False)
        # List playlists owned by the authenticated user
        resp = svc.playlists().list(part='snippet,contentDetails', mine=True, maxResults=50).execute()
        items = []
        for pl in resp.get('items', []):
            pid = pl.get('id')
            title = pl.get('snippet', {}).get('title')
            count = pl.get('contentDetails', {}).get('itemCount') or 0
            thumb = None
            thumbnails = pl.get('snippet', {}).get('thumbnails') or {}
            # Prefer high -> medium -> default
            thumb = (thumbnails.get('high') or thumbnails.get('medium') or thumbnails.get('default') or {}).get('url')
            items.append({'id': pid, 'title': title, 'count': count, 'thumbnail': thumb})
        return jsonify({'items': items})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_list_playlists', 'details': str(e)}), 500


@app.route('/api/youtube/profile', methods=['GET'])
def api_youtube_profile():
    """Return basic profile info for the authenticated YouTube user (display name).
    This helps the client show the signed-in user's name when adding songs.
    """
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'Google OAuth libraries not installed'}), 500
    user_id = session.get('youtube_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401

    creds_dict = load_credentials(user_id)
    if not creds_dict:
        return jsonify({'error': 'credentials_not_found'}), 401

    try:
        creds = Credentials.from_authorized_user_info(creds_dict)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            save_credentials(user_id, json.loads(creds.to_json()))

        svc = build('youtube', 'v3', credentials=creds, cache_discovery=False)
        # Query the authenticated user's channel and return the snippet.title as display name
        ch = svc.channels().list(part='snippet', mine=True, maxResults=1).execute()
        items = ch.get('items', [])
        if not items:
            return jsonify({'error': 'no_channel_found'}), 404
        display_name = items[0].get('snippet', {}).get('title')
        return jsonify({'displayName': display_name})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_get_profile', 'details': str(e)}), 500


@app.route('/api/youtube/playlist/<playlist_id>/items', methods=['GET'])
def api_youtube_playlist_items(playlist_id: str):
    if not GOOGLE_OAUTH_AVAILABLE:
        return jsonify({'error': 'Google OAuth libraries not installed'}), 500
    user_id = session.get('youtube_user_id')
    if not user_id:
        return jsonify({'error': 'not_authenticated'}), 401

    creds_dict = load_credentials(user_id)
    if not creds_dict:
        return jsonify({'error': 'credentials_not_found'}), 401

    try:
        creds = Credentials.from_authorized_user_info(creds_dict)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(GoogleRequest())
            save_credentials(user_id, json.loads(creds.to_json()))

        svc = build('youtube', 'v3', credentials=creds, cache_discovery=False)
        # Paginate through playlistItems (limited to 50 per request); return first page
        resp = svc.playlistItems().list(part='snippet,contentDetails', playlistId=playlist_id, maxResults=50).execute()
        items = []
        for it in resp.get('items', []):
            snip = it.get('snippet', {})
            videoId = (snip.get('resourceId') or {}).get('videoId') or (it.get('contentDetails') or {}).get('videoId')
            title = snip.get('title')
            thumbnails = snip.get('thumbnails') or {}
            thumb = (thumbnails.get('high') or thumbnails.get('medium') or thumbnails.get('default') or {}).get('url')
            items.append({'videoId': videoId, 'title': title, 'thumbnail': thumb})
        return jsonify({'items': items})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': 'failed_to_load_playlist_items', 'details': str(e)}), 500


@app.route('/admin/oauth_config', methods=['GET'])
def admin_oauth_config():
    remote = request.remote_addr or ''
    if remote not in ('127.0.0.1', '::1', 'localhost') and os.getenv('ALLOW_OAUTH_ADMIN') != '1':
        return jsonify({'error': 'forbidden'}), 403

    def mask(s: Optional[str]) -> Optional[str]:
        if not s:
            return None
        s = str(s)
        if len(s) <= 8:
            return '****'
        return '****' + s[-6:]

    google_cfg = {
        'client_id': mask(os.getenv('GOOGLE_OAUTH_CLIENT_ID')),
        'client_secret': mask(os.getenv('GOOGLE_OAUTH_CLIENT_SECRET')),
        'redirect': os.getenv('OAUTH_REDIRECT_URI') or DEFAULT_OAUTH_REDIRECT_URI
    }

    env_keys = list(os.environ.keys())
    prefixes = set()
    for k in env_keys:
        if k.endswith('_CLIENT_ID'):
            prefixes.add(k[:-10])

    flows = {}
    for p in sorted(prefixes):
        flows[p] = {
            'client_id': mask(os.getenv(f'{p}_CLIENT_ID')),
            'client_secret': mask(os.getenv(f'{p}_CLIENT_SECRET')),
            'auth_uri': os.getenv(f'{p}_AUTH_URI'),
            'token_uri': os.getenv(f'{p}_TOKEN_URI'),
            'redirect': os.getenv(f'{p}_REDIRECT_URI')
        }

    return jsonify({'remote': remote, 'google': google_cfg, 'flows': flows})


@app.route('/api/current_song', methods=['GET'])
def get_current_song():
    return jsonify(queue_manager.get_current_song())


# Serve repository-level images (so images/spotify.jpg can be used without copying)
@app.route('/images/<path:filename>')
def serve_repo_image(filename):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    images_dir = os.path.join(project_root, 'images')
    file_path = os.path.join(images_dir, filename)
    if os.path.exists(file_path):
        return send_from_directory(images_dir, filename)
    return jsonify({'error': 'Image not found'}), 404
