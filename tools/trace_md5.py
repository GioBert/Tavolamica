import argparse
import hashlib
from pathlib import Path
import sys

import frida


DEVICE_ID = "emulator-5554"
PACKAGE = "it.mobika.tavolamica"
SHOW_SENSITIVE = False


def on_message(message, _data):
    if message.get("type") == "send":
        payload = message.get("payload", {})
        if payload.get("kind") == "ready":
            print(f"[READY] {payload.get('message')}", flush=True)
        elif payload.get("kind") == "md5-input":
            value = str(payload.get("value", ""))
            fingerprint = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
            suffix = f" input={value}" if SHOW_SENSITIVE else " input=<nascosto>"
            print(f"[MD5] lunghezza={payload.get('length')} sha256={fingerprint}{suffix}", flush=True)
    else:
        print(f"[FRIDA] {message}", flush=True)


def main():
    global SHOW_SENSITIVE
    parser = argparse.ArgumentParser(description="Osserva le chiamate MD5 dell'app sul proprio emulatore.")
    parser.add_argument(
        "--show-sensitive",
        action="store_true",
        help="mostra l'input completo: può contenere valori da non condividere",
    )
    SHOW_SENSITIVE = parser.parse_args().show_sensitive
    source = (
        Path(__file__).with_name("frida-agent") / "_agent.js"
    ).read_text(encoding="utf-8")
    device = frida.get_device(DEVICE_ID, timeout=10)
    application = next(
        (app for app in device.enumerate_applications() if app.identifier == PACKAGE),
        None,
    )
    if application is None or application.pid == 0:
        raise RuntimeError(
            "Tavolamica non e in esecuzione nell'emulatore. Aprila e riprova."
        )
    print(f"Tavolamica rilevata, PID {application.pid}.", flush=True)
    session = device.attach(application.pid)
    script = session.create_script(source)
    script.on("message", on_message)
    script.load()
    print("Trace attivo. Premi Ctrl+C per terminare.", flush=True)
    try:
        sys.stdin.read()
    except KeyboardInterrupt:
        pass
    finally:
        session.detach()


if __name__ == "__main__":
    main()
