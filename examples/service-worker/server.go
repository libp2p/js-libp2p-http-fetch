package main

import (
	"flag"
	"fmt"
	"net/http"
)

func main() {
	// Read port from flags
	port := flag.String("port", "10181", "Port to listen on")
	flag.Parse()

	addr := "127.0.0.1:" + *port
	fmt.Println("Serving ", "http://"+addr)
	err := http.ListenAndServe(addr, http.FileServer(http.Dir(".")))
	fmt.Println(err)
}
