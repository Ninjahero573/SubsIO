"""
Test script to verify JukeboxLED setup
Run this to check if all dependencies are installed correctly
"""
import sys

def check_module(module_name, package_name=None):
    """Check if a module can be imported"""
    if package_name is None:
        package_name = module_name
    
    try:
        __import__(module_name)
        print(f"✓ {package_name} is installed")
        return True
    except ImportError:
        print(f"✗ {package_name} is NOT installed")
        return False

def check_ffmpeg():
    """Check if FFmpeg is available"""
    import subprocess
    try:
        result = subprocess.run(['ffmpeg', '-version'], 
                              capture_output=True, 
                              text=True,
                              timeout=5)
        if result.returncode == 0:
            print(f"✓ FFmpeg is installed")
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    print(f"✗ FFmpeg is NOT installed or not in PATH")
    return False

def main():
    print("="*60)
    print("JukeboxLED Dependency Check")
    print("="*60)
    print()
    
    print("Checking Python version...")
    version = sys.version_info
    print(f"Python {version.major}.{version.minor}.{version.micro}")
    if version.major >= 3 and version.minor >= 8:
        print("✓ Python version is compatible")
    else:
        print("✗ Python 3.8 or higher is required")
    print()
    
    print("Checking required packages...")
    modules = [
        ('flask', 'Flask'),
        ('flask_socketio', 'Flask-SocketIO'),
        ('socketio', 'python-socketio'),
        ('librosa', 'librosa'),
        ('numpy', 'numpy'),
        ('scipy', 'scipy'),
        ('pydub', 'pydub'),
        ('requests', 'requests'),
        ('yt_dlp', 'yt-dlp'),
        ('mutagen', 'mutagen'),
    ]
    
    results = []
    for module, name in modules:
        results.append(check_module(module, name))
    print()
    
    print("Checking FFmpeg...")
    ffmpeg_ok = check_ffmpeg()
    print()
    
    print("="*60)
    if all(results) and ffmpeg_ok:
        print("✓ All dependencies are installed!")
        print("You're ready to run: python app.py")
    else:
        print("✗ Some dependencies are missing")
        print("Run: pip install -r requirements.txt")
        if not ffmpeg_ok:
            print("Install FFmpeg: https://ffmpeg.org/download.html")
    print("="*60)

if __name__ == '__main__':
    main()
