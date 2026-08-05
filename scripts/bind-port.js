const http = require("http");

function createServer(port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`Server is running on port ${server.address().port}`);
    });

    server.on("error", reject);
    server.listen(port, () => {
      const address = server.address();
      console.log(`Server bound successfully on port ${address.port}`);
      resolve({ server, port: address.port });
    });
  });
}

async function main() {
  const portArg = process.argv[2];
  const requestedPort = portArg ? parseInt(portArg, 10) : 4000;

  try {
    const { server, port } = await createServer(requestedPort);
    console.log(`Assigned port: ${port}`);

    server.on("close", () => {
      console.log("Server closed");
    });

    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
  } catch (err) {
    if (err.code === "EADDRINUSE") {
      console.error(`Port ${requestedPort} is already in use`);
    } else if (err.code === "EACCES") {
      console.error(`Permission denied for port ${requestedPort}`);
    } else {
      console.error(`Failed to bind: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
