package main

import (
	"bufio"
	"context"
	"flag"
	"log"
	"os"
	"os/exec"
	"regexp"
	"sync"
)

func main() {
	hasProxy := flag.Bool("hasProxy", false, "Does this test have a proxy server?")
	flag.Parse()
	if err := runTest(*hasProxy); err != nil {
		log.Fatal(err)
	}
}

func runTest(hasProxy bool) error {
	var wg sync.WaitGroup
	defer wg.Wait()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	serverMaCh := make(chan string, 1)
	go func() {
		wg.Add(1)
		defer wg.Done()
		runServer(ctx, serverMaCh)
	}()
	serverMultiaddr := <-serverMaCh

	if hasProxy {
		buildProxy()
		go func() {
			wg.Add(1)
			defer wg.Done()
			runProxy(ctx, serverMultiaddr)
		}()
	}

	return runClient(serverMultiaddr)
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

func runClient(serverMultiaddr string) error {
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
