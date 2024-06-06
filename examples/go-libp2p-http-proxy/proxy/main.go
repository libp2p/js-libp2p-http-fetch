package main

import (
	"flag"
	"fmt"
	"log"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"

	"github.com/libp2p/go-libp2p"
	libp2phttp "github.com/libp2p/go-libp2p/p2p/http"
	"github.com/multiformats/go-multiaddr"
)

func main() {
	proxyTarget := flag.String("proxy-target", "", "target http server to proxy to")
	flag.Parse()
	if *proxyTarget == "" {
		log.Fatal("proxy-target must be set")
	}

	h, err := libp2p.New(libp2p.ListenAddrStrings(
		"/ip4/127.0.0.1/tcp/0",
	))
	if err != nil {
		log.Fatal(err)
	}
	defer h.Close()

	log.Println("Listening on:")
	for _, a := range h.Addrs() {
		fmt.Println(a.Encapsulate(multiaddr.StringCast("/p2p/" + h.ID().String())))
	}

	targetUrl, err := url.Parse(*proxyTarget)
	if err != nil {
		log.Fatal(err)
	}

	// reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetUrl)

	httpHost := libp2phttp.Host{StreamHost: h}

	httpHost.SetHTTPHandlerAtPath("/http-proxy/0.0.1", "/", proxy)
	go httpHost.Serve()

	// Wait for interrupt signal to stop
	intSig := make(chan os.Signal, 1)
	signal.Notify(intSig, os.Interrupt)
	<-intSig
	log.Println("Interrupt signal received, closing host")
}
