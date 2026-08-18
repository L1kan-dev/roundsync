import os
from cryptography.fernet import Fernet

def get_cipher():
    key = os.getenv("ENCRYPTION_KEY")
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as e:
        print(f"⚠️ Encryption key initialization error: {e}")
        return None

def encrypt_value(value: str) -> str:
    """Encrypts a string value using Fernet if ENCRYPTION_KEY is configured."""
    if not value:
        return value
    cipher = get_cipher()
    if not cipher:
        return value  # Return as-is if no key set (backwards compatible)
    return cipher.encrypt(value.encode()).decode()

def decrypt_value(encrypted_value: str) -> str:
    """Decrypts a string value using Fernet if ENCRYPTION_KEY is configured."""
    if not encrypted_value:
        return encrypted_value
    cipher = get_cipher()
    if not cipher:
        return encrypted_value  # Return as-is if no key set
    try:
        return cipher.decrypt(encrypted_value.encode()).decode()
    except Exception:
        # Fallback for unencrypted legacy codes
        return encrypted_value
