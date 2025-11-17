# Quick Start - JukeboxLED

## Before You Begin

**Important:** This project requires:
- Python 3.7 or higher (3.8+ recommended)
- FFmpeg for audio processing
- About 500MB of free disk space

## Installation Steps

### 1. Install Python 3.11 (Recommended)

If you have Python 3.7, I recommend upgrading:
- Download from: https://www.python.org/downloads/
- During installation, check "Add Python to PATH"

Or use your current Python 3.7 (may have compatibility issues).

### 2. Install FFmpeg

**Windows:**
1. Download from: https://www.gyan.dev/ffmpeg/builds/
2. Choose "ffmpeg-release-essentials.zip"
3. Extract to `C:\ffmpeg`
4. Add to PATH:
   - Search "Environment Variables" in Windows
   - Edit "Path" under System Variables
   - Add: `C:\ffmpeg\bin`
   - Click OK
   - **Restart PowerShell**

**Verify FFmpeg:**
```powershell
ffmpeg -version
```

### 3. Install Python Dependencies

Open PowerShell in the project folder:

```powershell
cd "c:\Users\Cory\Documents\Vibecoding projects\JukeboxLED"

# Upgrade pip first
python -m pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt
```

This will take a few minutes. Don't worry about warnings.

### 4. Test the Installation

```powershell
python test_setup.py
```

You should see all ✓ checkmarks.

### 5. Run the Server

```powershell
python app.py
```

You should see:
```
Starting JukeboxLED server...
Access the jukebox at: http://localhost:5000
```

### 6. Test the Web Interface

Open your browser to: http://localhost:5000

Try adding a YouTube song!

## Troubleshooting Quick Fixes

### Error: "No module named 'flask'"
```powershell
pip install flask flask-socketio
```

### Error: "FFmpeg not found"
- Make sure you added `C:\ffmpeg\bin` to PATH
- **Restart PowerShell** after changing PATH
- Test with: `ffmpeg -version`

### Error: Python version too old
- Download Python 3.11: https://www.python.org/downloads/
- Reinstall, check "Add to PATH"
- Use `py -3.11` instead of `python` in commands

### Error: SSL/Certificate errors
```powershell
pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
```

### Error: "Failed to download song"
- Check your internet connection
- Try a different YouTube video
- Update yt-dlp:
  ```powershell
  pip install -U yt-dlp
  ```

## What's Next?

Once the server is running:

1. **Local Testing:**
   - Open http://localhost:5000
   - Add YouTube songs
   - Watch them appear in the queue

2. **Network Access:**
   - Find your PC's IP: `ipconfig` (look for IPv4)
   - On other devices: http://YOUR_IP:5000
   - May need to allow port 5000 in Windows Firewall

3. **Raspberry Pi Setup:**
   - See SETUP.md for full Pi instructions
   - Transfer `pi_client.py` and `requirements_pi.txt` to Pi
   - Install dependencies on Pi
   - Wire up the LEDs
   - Run the client

## Need Help?

1. Run the test script: `python test_setup.py`
2. Check README.md for detailed info
3. Check SETUP.md for step-by-step guide

## Common Questions

**Q: Can I run this without a Raspberry Pi?**
A: Yes! The web interface and song queue work without the Pi. You just won't see the LED light shows.

**Q: Can I test without LEDs?**
A: Yes! Run the Pi client in simulation mode (without actual LED hardware connected).

**Q: How long does song processing take?**
A: Usually 10-30 seconds per song to download and analyze.

**Q: What video sites are supported?**
A: YouTube, SoundCloud, Vimeo, and many others via yt-dlp.

**Q: How much power do the LEDs need?**
A: 1050 LEDs can draw up to 63A at max brightness. In practice, 20-30A is typical. See README.md for details.

Enjoy! 🎵💡
