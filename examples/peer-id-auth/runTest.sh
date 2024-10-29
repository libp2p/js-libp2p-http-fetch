#!/usr/bin/env bash
set -euo pipefail

# A simple script that runs the auth flow using both Go and NodeJS servers and clients.
# The server prints its peer ID to stdout.
# The client prints the server's peer ID to stdout.
# If both stdout match, the test passes. If they differ the test fails.
# Exit code 0 indicates success.

# Function to cleanup temporary directory
cleanup() {
    rm -rf "$TMPDIR"
}

stop_server() {
    local pid=$1
    kill "$pid"
    wait "$pid" > /dev/null  2>&1  || true
}

TMPDIR=$(mktemp -d)
trap cleanup EXIT

# Build Go code
(cd go-peer && go build -o ../go-node main.go)

GO_SERVER="./go-node"
GO_CLIENT="./go-node client"

NODE_SERVER="node node.js"
NODE_CLIENT="node node.js client"

# Define server arrays
SERVERS=("$GO_SERVER" "$NODE_SERVER")
CLIENTS=("$GO_CLIENT" "$NODE_CLIENT")

for server in "${SERVERS[@]}"; do
    for client in "${CLIENTS[@]}"; do
        echo "Running server='$server' client='$client'"
        $server > "$TMPDIR/server.out" &
        SERVER_PID=$!
        sleep 1
        eval $client > "$TMPDIR/client.out"
        stop_server "$SERVER_PID"

        if ! diff "$TMPDIR/server.out" "$TMPDIR/client.out"; then
            echo "Outputs differ"
            echo "Server:"
            cat "$TMPDIR/server.out"
            echo "Client:"
            cat "$TMPDIR/client.out"
            echo "Diff:"
            diff -u "$TMPDIR/server.out" "$TMPDIR/client.out"
            exit 1
        fi
    done
done

exit 0
