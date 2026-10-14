const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");

let mainWindow = null;
let serverProcess = null;
let serverPort = 0;

// The packaged app files live next to this "electron" folder (resources/app),
// and in development __dirname is <project>/electron, so ".." resolves in both.
const appDir = path.join(__dirname, "..");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    const dir = app.getPath("userData");
    fs.appendFileSync(path.join(dir, "startup.log"), line + "\n");
  } catch {
    // logging must never crash startup
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

function pingServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingServer(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function startServer() {
  const port = await getFreePort();
  serverPort = port;

  const nextBin = require.resolve("next/dist/bin/next", { paths: [appDir] });
  log(`Starting Next server: ${nextBin} on 127.0.0.1:${port}`);

  serverProcess = spawn(
    process.execPath,
    [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  serverProcess.stdout.on("data", (d) => log(`[next] ${String(d).trim()}`));
  serverProcess.stderr.on("data", (d) => log(`[next:err] ${String(d).trim()}`));
  serverProcess.on("error", (err) => log(`Next process error: ${err && err.message ? err.message : String(err)}`));
  serverProcess.on("exit", (code) => log(`Next process exited with code ${code}`));

  const ready = await waitForServer(port, 60000);
  if (!ready) {
    throw new Error(
      "The app's internal server did not start within 60s. See the startup log for details:\n" +
        path.join(app.getPath("userData"), "startup.log")
    );
  }
  log("Next server is ready");
  return port;
}

function loadingHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Resilient Research App</title>
  <style>html,body{height:100%;margin:0;background:#0a1a3a;color:#dbeafe;font-family:system-ui,Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}
  .ring{width:44px;height:44px;border:4px solid #1e3a8a;border-top-color:#facc15;border-radius:50%;animation:spin 0.9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head>
  <body><div class="ring"></div><div>Starting Resilient Research App…</div></body></html>`;
}

function errorHtml(message) {
  const safe = String(message).replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Startup error</title>
  <style>html,body{height:100%;margin:0;background:#0a1a3a;color:#fee2e2;font-family:system-ui,Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:32px}
  .box{max-width:760px}pre{white-space:pre-wrap;background:#111c33;border:1px solid #334155;border-radius:8px;padding:16px;color:#e2e8f0}</style></head>
  <body><div class="box"><h1>Resilient Research App could not start</h1><pre>${safe}</pre></div></body></html>`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0a1a3a",
    title: "Resilient Research App",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(loadingHtml()));
  return mainWindow;
}

function shutdownServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill();
    } catch {
      // ignore
    }
    serverProcess = null;
  }
}

process.on("uncaughtException", (err) => {
  log(`Uncaught exception: ${(err && err.stack) || err}`);
  try {
    dialog.showErrorBox("Resilient Research App error", (err && err.stack) || String(err));
  } catch {
    // ignore
  }
});

process.on("unhandledRejection", (reason) => {
  log(`Unhandled rejection: ${(reason && reason.stack) || reason}`);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    createWindow();
    try {
      const port = await startServer();
      if (mainWindow) {
        await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
      }
    } catch (err) {
      const message = (err && err.stack) || String(err);
      log(`Failed to start: ${message}`);
      if (mainWindow) {
        await mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(errorHtml(message)));
      }
      dialog.showErrorBox("Resilient Research App could not start", message);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        if (serverPort) mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
      }
    });
  });
}

app.on("window-all-closed", () => {
  shutdownServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", shutdownServer);
