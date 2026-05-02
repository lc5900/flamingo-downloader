# Privacy Notes

- The local API and browser bridge only bind to `127.0.0.1`.
- Requests require the configured token unless the extension-origin shortcut is explicitly allowed for `/add`.
- Operation logs redact sensitive token-like substrings before export.
- Debug bundle export is user-initiated and intended for manual support exchange.
- Flamingo does not bypass DRM systems such as Widevine, FairPlay, or PlayReady.
- Media URLs captured from browsers can contain short-lived signed parameters or auth headers; users should treat exported diagnostics as sensitive.
