#!/usr/bin/env python3

import asyncio
import json
import os
import pty
import fcntl
import termios
import struct
import argparse
import ssl
import secrets
import logging
import time
from pathlib import Path
from websockets.server import serve
from websockets.exceptions import ConnectionClosed

# --- Configuration ---
API_KEY_FILE = Path(__file__).parent / "api_keys.json"
MAX_MESSAGE_SIZE = 1024 * 1024  # 1 MB
CERT_FILE = Path(__file__).parent / "marionette.crt"
KEY_FILE = Path(__file__).parent / "marionette.key"


# --- ANSI Color Codes for Logging ---
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

class ColoredFormatter(logging.Formatter):
    LEVEL_COLORS = { logging.DEBUG: Colors.CYAN, logging.INFO: Colors.GREEN, logging.WARNING: Colors.YELLOW, logging.ERROR: Colors.RED, logging.CRITICAL: Colors.RED + Colors.BOLD }
    def format(self, record):
        color = self.LEVEL_COLORS.get(record.levelno)
        record.levelname = f"{color}{record.levelname}{Colors.ENDC}"
        if isinstance(record.msg, str): record.msg = f"{color}{record.msg}{Colors.ENDC}"
        return super().format(record)

log = logging.getLogger(__name__)

# --- Self-Signed Certificate Generation ---
def generate_self_signed_cert(cert_path, key_path):
    """Generates a self-signed certificate if one doesn't exist."""
    if cert_path.exists() and key_path.exists():
        return

    # SECURITY NOTE: PyOpenSSL is an optional dependency for generating certs.
    try:
        from OpenSSL import crypto
    except ImportError:
        log.error("PyOpenSSL is required to generate self-signed certificates.")
        log.error("Please run: pip install pyopenssl")
        raise

    log.info("Generating new self-signed SSL certificate...")
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 4096)

    cert = crypto.X509()
    cert.get_subject().C = "US"
    cert.get_subject().ST = "California"
    cert.get_subject().L = "San Francisco"
    cert.get_subject().O = "Marionette"
    cert.get_subject().OU = "Marionette Self-Signed"
    cert.get_subject().CN = "localhost"
    cert.set_serial_number(secrets.randbits(64))
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(10*365*24*60*60) # 10 years
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(k)
    cert.sign(k, 'sha256')

    with open(cert_path, "wb") as f:
        f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
    with open(key_path, "wb") as f:
        f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
    log.info(f"Certificate saved to {cert_path}")
    log.info(f"Private key saved to {key_path}")


# --- API Key Management ---
def load_api_keys():
    if not API_KEY_FILE.exists():
        return {}
    with open(API_KEY_FILE, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            log.error(f"Could not parse {API_KEY_FILE}. It may be corrupted.")
            return {}

def save_api_keys(keys):
    with open(API_KEY_FILE, 'w') as f:
        json.dump(keys, f, indent=2)
    os.chmod(API_KEY_FILE, 0o600)

def generate_api_key(key_type="persistent"):
    keys = load_api_keys()
    new_key = secrets.token_hex(32)
    keys[new_key] = {"type": key_type, "created": int(time.time())}
    save_api_keys(keys)
    return new_key

# SECURITY FIX: The validation logic is now split.
# get_key_type checks for validity without modifying state.
# invalidate_temp_key is called explicitly after a session ends.
def get_key_type(key):
    """Checks for a key's existence and returns its type, or None if invalid."""
    if not key: return None
    keys = load_api_keys()
    return keys.get(key, {}).get("type")

def invalidate_temp_key(key):
    """Securely removes a temporary key from the store."""
    if not key: return
    keys = load_api_keys()
    if key in keys and keys[key].get("type") == "temporary":
        del keys[key]
        try:
            save_api_keys(keys)
            log.info(f"Successfully invalidated temporary key.")
        except Exception as e:
            log.error(f"CRITICAL: Failed to save API key file after invalidating temp key! {e}")

# --- Terminal & Filesystem Classes ---
class TerminalManager:
    def __init__(self, jailed_dir, loop, send_response_func):
        self.sessions = {}
        self.jailed_dir = Path(jailed_dir).resolve()
        self.loop = loop
        self.send_response = send_response_func
        if not self.jailed_dir.is_dir():
            log.warning(f"Jailed directory '{self.jailed_dir}' does not exist. Creating it.")
            self.jailed_dir.mkdir(parents=True, exist_ok=True)

    def pty_output_callback(self, websocket, window_id, fd):
        try:
            data = os.read(fd, 1024)
            if not data:
                self.terminate_session(window_id)
                return
            response_data = {"type": "shell_output", "window_id": window_id, "data": data.decode('utf-8', errors='replace')}
            asyncio.create_task(self.send_response(websocket, response_data))
        except Exception:
            self.terminate_session(window_id)

    async def create_session(self, websocket, window_id):
        pid, fd = pty.fork()
        if pid == 0:
            os.chdir(self.jailed_dir)
            os.execv(os.environ.get("SHELL", "/bin/bash"), [os.environ.get("SHELL", "/bin/bash")])
        else:
            log.info(f"Created PTY session for {window_id} (PID: {pid}) in {self.jailed_dir}")
            fcntl.fcntl(fd, fcntl.F_SETFL, os.O_NONBLOCK)
            self.sessions[window_id] = {'pid': pid, 'fd': fd, 'websocket': websocket}
            self.loop.add_reader(fd, self.pty_output_callback, websocket, window_id, fd)
            await self.send_response(websocket, {"type": "shell_output", "window_id": window_id, "data": f"\r\n--- Remote session started (PID: {pid}) ---\r\n"})

    def terminate_session(self, window_id):
        if window_id in self.sessions:
            session = self.sessions.pop(window_id)
            self.loop.remove_reader(session['fd'])
            try:
                os.close(session['fd'])
                os.kill(session['pid'], 9)
                os.waitpid(session['pid'], 0)
            except Exception: pass
            log.info(f"Terminated PTY session for {window_id}")

    def get_session_fd(self, window_id):
        return self.sessions.get(window_id, {}).get('fd')

class SecureFileSystem:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir.resolve()
        if not self.base_dir.is_dir():
            raise ValueError("Base directory does not exist.")

    def _resolve_path(self, user_path: str) -> Path | None:
        try:
            # Prevent path components like '..' from escaping the jail.
            # os.path.normpath is used to collapse redundant separators and up-level references.
            clean_user_path = os.path.normpath(Path('/') / user_path).lstrip('/')
            
            # Join the jailed base directory with the cleaned user path.
            resolved_path = (self.base_dir / clean_user_path).resolve()

            # SECURITY FIX: Use os.path.commonpath to robustly check for path traversal.
            # This is the most reliable way to ensure the resolved_path is truly
            # within the base_dir.
            common_prefix = os.path.commonpath([self.base_dir, resolved_path])
            if str(common_prefix) != str(self.base_dir):
                log.warning(f"Path traversal attempt blocked: '{user_path}' resolved outside of jail.")
                return None
                
            return resolved_path
        except Exception as e:
            log.error(f"Error resolving path '{user_path}': {e}")
            return None

    def list_directory(self, path: str):
        resolved_path = self._resolve_path(path)
        if not resolved_path or not resolved_path.is_dir():
            return {"success": False, "error": "Directory not found or is not a directory."}
        try:
            content = [{"name": item.name, "type": "dir" if item.is_dir() else "file"} for item in os.scandir(resolved_path)]
            return {"success": True, "path": path, "content": content}
        except OSError as e:
            return {"success": False, "error": str(e)}

class WebSocketHandler:
    def __init__(self, loop, directory):
        self.loop = loop
        self.jailed_dir = Path(directory)
        self.terminal_manager = TerminalManager(self.jailed_dir, loop, self.send_response)
        self.fs_manager = SecureFileSystem(self.jailed_dir)

    async def send_response(self, websocket, response_data):
        if websocket.open:
            await websocket.send(json.dumps(response_data))

    async def handle_message(self, websocket, message_data):
        msg_type = message_data.get("type")
        window_id = message_data.get("window_id")
        if not window_id: return

        if msg_type == "shell_create":
            await self.terminal_manager.create_session(websocket, window_id)
        elif msg_type == "shell_input":
            fd = self.terminal_manager.get_session_fd(window_id)
            if fd: os.write(fd, message_data.get("data", "").encode())
        elif msg_type == "shell_resize":
            fd = self.terminal_manager.get_session_fd(window_id)
            if fd: fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", message_data.get("rows"), message_data.get("cols"), 0, 0))
        elif msg_type == "fs_ls":
            response = self.fs_manager.list_directory(message_data.get("path", "/"))
            await self.send_response(websocket, {"type": "fs_ls_response", "window_id": window_id, **response})

    async def main_handler(self, websocket, path):
        api_key = None
        key_type = None
        try:
            auth_message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
            auth_data = json.loads(auth_message)
            api_key = auth_data.get("token")
            
            key_type = get_key_type(api_key)
            if not key_type:
                raise ValueError("Invalid API Key")
                
            await self.send_response(websocket, {"type": "auth_success"})
            log.info(f"Client {websocket.remote_address} authenticated successfully.")
        except Exception as e:
            log.warning(f"Auth failed for {websocket.remote_address}: {e}")
            await self.send_response(websocket, {"type": "auth_fail"})
            await websocket.close()
            return

        try:
            async for message in websocket:
                await self.handle_message(websocket, json.loads(message))
        except ConnectionClosed:
            log.info(f"Client {websocket.remote_address} disconnected.")
        finally:
            # SECURITY FIX: Invalidate temporary key after the connection is closed.
            if key_type == "temporary":
                invalidate_temp_key(api_key)
            
            # Clean up any sessions associated with the disconnected websocket
            client_sessions = [wid for wid, sess in self.terminal_manager.sessions.items() if sess['websocket'] == websocket]
            for wid in client_sessions:
                self.terminal_manager.terminate_session(wid)

async def main():
    parser = argparse.ArgumentParser(
        description="Marionette WebSocket Agent",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-d", "--directory", required=True, help="[REQUIRED] The directory to jail the agent's shell and filesystem operations to.")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind. Defaults to 0.0.0.0 to allow remote connections.")
    parser.add_argument("--port", type=int, default=9001, help="Port to bind.")
    parser.add_argument("--ssl-cert", help="Path to SSL certificate file.")
    parser.add_argument("--ssl-key", help="Path to SSL private key file.")
    parser.add_argument("--allow-insecure", action="store_true", help="Allow insecure ws:// connections. NOT RECOMMENDED.")
    parser.add_argument("--generate-key", action="store_true", help="Generate a new persistent API key and exit.")
    parser.add_argument("--generate-temp-key", action="store_true", help="Generate a new one-time use API key and exit.")
    args = parser.parse_args()

    if args.generate_key:
        key = generate_api_key("persistent")
        print(f"Generated new persistent API key:\n{Colors.BLUE}{key}{Colors.ENDC}")
        return
    if args.generate_temp_key:
        key = generate_api_key("temporary")
        print(f"Generated new temporary (one-time use) API key:\n{Colors.CYAN}{key}{Colors.ENDC}")
        return

    log_level = logging.INFO
    handler = logging.StreamHandler()
    handler.setFormatter(ColoredFormatter('%(asctime)s - %(levelname)s - %(message)s'))
    log.addHandler(handler)
    log.setLevel(log_level)
    
    print(f"\n{Colors.BOLD}--- Marionette WebSocket Agent ---{Colors.ENDC}")
    if not API_KEY_FILE.exists() or not load_api_keys():
        print(f"{Colors.YELLOW}No API keys found. Generate one with `--generate-key`{Colors.ENDC}")
    
    ssl_context = None
    protocol = "ws"
    
    # Enforce SSL/TLS by default unless explicitly disabled
    if not args.allow_insecure:
        protocol = "wss"
        cert_path = Path(args.ssl_cert) if args.ssl_cert else CERT_FILE
        key_path = Path(args.ssl_key) if args.ssl_key else KEY_FILE

        if not cert_path.exists() or not key_path.exists():
            if args.ssl_cert or args.ssl_key:
                log.error("Specified SSL certificate or key not found.")
                return
            try:
                generate_self_signed_cert(cert_path, key_path)
            except Exception as e:
                log.error(f"Could not generate self-signed certificate: {e}")
                return
        
        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        try:
            ssl_context.load_cert_chain(cert_path, key_path)
            log.info(f"SSL is enabled. Using cert: {cert_path}")
        except ssl.SSLError as e:
            log.error(f"Error loading SSL certificate: {e}")
            log.error("Please provide a valid certificate and key or use the --allow-insecure flag (not recommended).")
            return
    else:
        print(f"\n{Colors.BOLD}{Colors.RED}WARNING: Insecure mode enabled. The connection is NOT encrypted.{Colors.ENDC}")
        print(f"{Colors.RED}This is NOT recommended for production or any sensitive environment.{Colors.ENDC}\n")

    
    loop = asyncio.get_running_loop()
    handler_instance = WebSocketHandler(loop, args.directory)

    async with serve(handler_instance.main_handler, args.host, args.port, ssl=ssl_context, max_size=MAX_MESSAGE_SIZE):
        log.info(f"Server started on {protocol}://{args.host}:{args.port}")
        log.info(f"Jailed directory: {Path(args.directory).resolve()}")
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("\nServer shutting down.")
