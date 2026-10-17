#!/bin/sh
# Starts the local Firestore emulator on :8181 (needs the gcloud CLI, its cloud-firestore-emulator component, and Java 21+).
[ -d /opt/homebrew/opt/openjdk@21/bin ] && PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
exec gcloud emulators firestore start --host-port=127.0.0.1:8181
