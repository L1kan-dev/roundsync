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

def decrypt_value(encrypted_value: str) -> str:
    """Decrypts a string value using Fernet if ENCRYPTION_KEY is configured."""
    if not encrypted_value:
        return encrypted_value
    cipher = get_cipher()
    if not cipher:
        return encrypted_value  # Return as-is if no key set
    try:
        return cipher.decrypt(encrypted_value.encode()).decode()
    except Exception as e:
        # Fallback for unencrypted legacy codes — but this same broad catch also
        # swallows a genuine decryption failure (wrong/rotated key, corrupted
        # ciphertext), so log it instead of failing completely silently.
        print(f"⚠️ decrypt_value: could not decrypt (legacy plaintext, or a real failure: {e})")
        return encrypted_value
