import http from 'http';

const port = 55776;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' }); 
  res.end('Hello, World!');
});

server.listen(port, () => {
  console.error(`Server running at: http://localhost:${port}/`);
  // Print multiaddr on stdout for test
  console.error("Server's multiaddr is:")
  console.log(`/dns4/localhost/tcp/${port}/http`)
  console.log("") // Empty line to signal we have no more addresses (for test runner)
});
