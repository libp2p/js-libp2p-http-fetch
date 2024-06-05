package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"time"

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
		"/ip4/127.0.0.1/tcp/15567",
	))
	if err != nil {
		log.Fatal(err)
	}
	defer h.Close()

	log.Println("Listening on:")
	for _, a := range h.Addrs() {
		fmt.Println(a.Encapsulate(multiaddr.StringCast("/p2p/" + h.ID().String())))
	}
	fmt.Println("")

	targetUrl, err := url.Parse(*proxyTarget)
	if err != nil {
		log.Fatal(err)
	}

	// reverse proxy
	// proxy := httputil.NewSingleHostReverseProxy(targetUrl)
	// proxy.Director = func(req *http.Request) {
	// 	fmt.Println("Request URL:", req.URL.String())
	// 	fmt.Println("Request host:", req.Host)
	// 	fmt.Println("remote addr:", req.RemoteAddr)
	// 	fmt.Println(req)
	// 	req.RemoteAddr = ""

	// 	req.URL.Scheme = targetUrl.Scheme
	// 	req.URL.Host = targetUrl.Host
	// 	req.Host = targetUrl.Host
	// 	fmt.Println("Request URL:", req.URL.String())
	// 	fmt.Println("req host", req.Host)
	// }
	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(targetUrl)
			r.Out.Host = r.In.Host // if desired
		},
		// ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
		// 	panic(err)
		// },
	}
	_ = proxy

	httpHost := libp2phttp.Host{
		StreamHost:        h,
		ListenAddrs:       []multiaddr.Multiaddr{multiaddr.StringCast("/ip4/127.0.0.1/tcp/6677/http")},
		InsecureAllowHTTP: true,
	}

	// httpHost.SetHTTPHandlerAtPath("/http-proxy/0.0.1", "/", proxy)
	httpHost.SetHTTPHandlerAtPath("/http-proxy/0.0.1", "/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ch := w.(http.CloseNotifier).CloseNotify()
		select {
		case <-ch:
			fmt.Println("Connection closed???")
		case <-time.After(time.Second):
		}

		fmt.Println("Request URL:", r.URL.String())
		req := http.Request{
			Method: r.Method,
			// Host:   "localhost:55776",
			URL: targetUrl,
			// Header: r.Header,
			// Body:   r.Body,
			// Proto:            r.Proto,
			// ProtoMajor:       r.ProtoMajor,
			// ProtoMinor:       r.ProtoMinor,
			// ContentLength:    r.ContentLength,
			// TransferEncoding: r.TransferEncoding,
			// GetBody:          r.GetBody,
			// Close:            r.Close,
			// Host:             r.Host,
			// Form:             r.Form,
			// PostForm:         r.PostForm,
			// MultipartForm:    r.MultipartForm,
			// Trailer:          r.Trailer,
			// RemoteAddr:       r.RemoteAddr,
			// RequestURI:       r.RequestURI,
			// TLS:              r.TLS,
			// Cancel:           r.Cancel,
			// Response:         r.Response,
		}
		proxy.ServeHTTP(w, &req)
		// proxy.ServeHTTP(w, r.WithContext(context.Background()))
		// w.Write([]byte("Hello, World!"))
	}))
	go httpHost.Serve()

	// Wait for interrupt signal to stop
	intSig := make(chan os.Signal, 1)
	signal.Notify(intSig, os.Interrupt)
	<-intSig
	log.Println("Interrupt signal received, closing host")
}
