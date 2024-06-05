package main

import (
	"bufio"
	"context"
	"flag"
	"log"
	"os"
	"os/exec"
	"regexp"
)

func main() {
	hasProxy := flag.Bool("hasProxy", false, "Does this test have a proxy server?")
	flag.Parse()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	serverMaCh := make(chan string, 1)
	go runServer(ctx, serverMaCh)
	serverMultiaddr := <-serverMaCh

	if *hasProxy {
		buildProxy()
		go runProxy(ctx, serverMultiaddr)
	}

	if err := runTest(serverMultiaddr); err != nil {
		cancel()
		log.Fatal(err)
	}
}

func runServer(ctx context.Context, serverStdoutCh chan<- string) {
	serverCmd := exec.CommandContext(ctx, "node", "server.mjs")
	serverCmd.Stderr = os.Stderr
	serverCmd.Cancel = func() error {
		serverCmd.Process.Signal(os.Interrupt)
		return nil
	}
	stdoutPipe, err := serverCmd.StdoutPipe()
	if err != nil {
		log.Fatal(err)
	}

	serverCmd.Start()
	bufReader := bufio.NewReader(stdoutPipe)
	s, err := bufReader.ReadString('\n')
	if err != nil {
		serverCmd.Process.Signal(os.Interrupt)
		log.Fatal(err)
	}
	serverStdoutCh <- s
	serverCmd.Wait()
}

func runTest(serverMultiaddr string) error {
	clientCmd := exec.Command("node", "client.mjs", serverMultiaddr)
	clientCmd.Stderr = os.Stderr
	return clientCmd.Run()
}

func buildProxy() {
	buildCmd := exec.Command("go", "build", "-o", "proxy", "main.go")
	buildCmd.Dir = "./proxy"
	buildCmd.Stderr = os.Stderr
	buildCmd.Stdout = os.Stdout
}

var r, _ = regexp.Compile("/tcp/([0-9]+)")

func runProxy(ctx context.Context, serverMultiaddr string) {
	port := r.FindString(serverMultiaddr)
	proxyCmd := exec.CommandContext(ctx, "./proxy", "-proxy-target", "http://localhost:"+port)
	proxyCmd.Cancel = func() error {
		proxyCmd.Process.Signal(os.Interrupt)
		return nil
	}
	proxyCmd.Dir = "./proxy"
	proxyCmd.Stderr = os.Stderr
	proxyCmd.Stdout = os.Stdout
	proxyCmd.Run()
}
