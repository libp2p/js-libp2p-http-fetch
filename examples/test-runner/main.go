package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
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

	serverCmd, serverMultiaddr, err := runServer(ctx)
	if err != nil {
		return err
	}
	go func() {
		wg.Add(1)
		defer wg.Done()
		serverCmd.Wait()
	}()
	log.Println(serverMultiaddr)

	if hasProxy {
		buildProxy()
		cmd, proxyAddr, err := runProxy(ctx, serverMultiaddr)
		if err != nil {
			return err
		}
		go func() {
			wg.Add(1)
			defer wg.Done()
			cmd.Wait()
		}()

		return runClient(proxyAddr)
	}

	return runClient(serverMultiaddr)
}

func runServer(ctx context.Context) (*exec.Cmd, string, error) {
	serverCmd := exec.CommandContext(ctx, "node", "server.mjs")
	serverCmd.Stderr = os.Stderr
	serverCmd.Cancel = func() error {
		serverCmd.Process.Signal(os.Interrupt)
		return nil
	}
	stdoutPipe, err := serverCmd.StdoutPipe()
	if err != nil {
		return nil, "", err
	}

	serverCmd.Start()
	bufReader := bufio.NewReader(stdoutPipe)
	s, err := bufReader.ReadString('\n')
	if err != nil {
		return nil, "", err
	}
	return serverCmd, s, nil
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
	buildCmd.Run()
}

var r, _ = regexp.Compile("/tcp/([0-9]+)")

func runProxy(ctx context.Context, serverMultiaddr string) (*exec.Cmd, string, error) {
	matches := r.FindStringSubmatch(serverMultiaddr)
	if len(matches) != 2 {
		return nil, "", fmt.Errorf("Could not find port in server multiaddr")
	}
	port := matches[1]
	proxyCmd := exec.CommandContext(ctx, "./proxy", "-proxy-target", "http://localhost:"+port)
	proxyCmd.Cancel = func() error {
		proxyCmd.Process.Signal(os.Interrupt)
		return nil
	}
	proxyCmd.Dir = "./proxy"
	proxyCmd.Stderr = os.Stderr
	stdoutPipe, err := proxyCmd.StdoutPipe()
	if err != nil {
		log.Fatal(err)
	}

	proxyCmd.Start()
	bufReader := bufio.NewReader(stdoutPipe)
	s, err := bufReader.ReadString('\n')
	if err != nil {
		if proxyCmd.Process != nil {
			proxyCmd.Process.Signal(os.Interrupt)
		}
		log.Fatal(err)
	}
	return proxyCmd, s, nil
}
