const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const http = require("http");
const net = require("net");
const { parse } = require("url");

let mainWindow = null;
let httpServer = null;
let serverPort = 0;

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

// The packaged app files live next to this "electron" folder (resources/app),
// and in development __dirname is <project>/electron, so ".." resolves in both.
function resolveAppDir() {
  return path.join(__dirname, "..");
}

async function startNextServer(appDir) {
  process.env.NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";

  const nextModule = await import("next");
  const next = nextModule.default || nextModule;

  const port = await getFreePort();
  const nextApp = next({ dev: false, dir: appDir, hostname: "127.0.0.1", port });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  httpServer = http.createServer((req, res) => {
    handle(req, res, parse(req.url || "/", true));
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", resolve);
  });

  serverPort = port;
  return port;
}

function createWindow(port) {
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

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

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
    try {
      const port = await startNextServer(resolveAppDir());
      createWindow(port);
    } catch (err) {
      dialog.showErrorBox(
        "Failed to start Resilient Research App",
        (err && err.stack) || String(err)
      );
      app.quit();
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
        createWindow(serverPort);
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (httpServer) {
    try {
      httpServer.close();
    } catch {
      // ignore shutdown errors
    }
  }
});
