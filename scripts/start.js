const { spawn } = require("child_process");
const net = require("net");

function isPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(true));
    tester.once("listening", () => {
      tester.close();
      resolve(false);
    });
    tester.listen(port);
  });
}

async function findAvailablePort(startPort = 4000) {
  let port = startPort;
  while (await isPortInUse(port)) {
    port += 1;
  }
  return port;
}

async function main() {
  const port = await findAvailablePort(4000);
  console.log(`Starting Next.js on port ${port}...`);

  const child = spawn("next", ["dev", "-p", String(port)], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("error", (err) => {
    console.error("Failed to start Next.js:", err.message);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    child.kill("SIGINT");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
    process.exit(0);
  });
}

main();
