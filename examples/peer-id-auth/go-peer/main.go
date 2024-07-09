package main

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
	libp2phttp "github.com/libp2p/go-libp2p/p2p/http"
	httpauth "github.com/libp2p/go-libp2p/p2p/http/auth"
)

func main() {
	privKey, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		log.Fatalf("failed to generate key: %v", err)
	}

	args := os.Args[1:]
	if len(args) == 1 && args[0] == "client" {
		log.Printf("client connecting to server on localhost:8001")
		err := runClient(privKey)
		if err != nil {
			log.Fatalf("client failed: %v", err)
		}
		return
	}

	err = runServer(privKey)
	if err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func runServer(privKey crypto.PrivKey) error {
	id, err := peer.IDFromPrivateKey(privKey)
	if err != nil {
		return err
	}
	fmt.Println("Server ID:", id)

	wellKnown := &libp2phttp.WellKnownHandler{}
	http.Handle(libp2phttp.WellKnownProtocols, wellKnown)
	auth := &httpauth.ServerPeerIDAuth{PrivKey: privKey, InsecureNoTLS: true, ValidHostnames: map[string]struct{}{"localhost:8001": {}}}
	http.Handle("/auth", auth)
	wellKnown.AddProtocolMeta(httpauth.ProtocolID, libp2phttp.ProtocolMeta{Path: "/auth"})
	log.Printf("server listening on :8001")
	return http.ListenAndServe("127.0.0.1:8001", nil)
}

func runClient(privKey crypto.PrivKey) error {
	auth := httpauth.ClientPeerIDAuth{PrivKey: privKey}
	ctx := context.Background()
	serverID, err := auth.MutualAuth(ctx, http.DefaultClient, "http://localhost:8001/auth", "localhost:8001")
	if err != nil {
		return err
	}
	fmt.Println("Server ID:", serverID)
	return nil
}
