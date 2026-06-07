import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client, ClientChannel, ConnectConfig, SFTPWrapper } from "ssh2";
import { ConnectionConfig, DiskMetric, RemoteEntry, RemoteMetrics, SavedSession, TerminalSize } from "./types";

type Session = {
  id: string;
  conn: Client;
  sftp?: SFTPWrapper;
  shell?: ClientChannel;
  cwd: string;
};

const sessions = new Map<string, Session>();
let mainWindow: BrowserWindow | null = null;
let language: "ru" | "en" = "ru";

function buildMenu() {
  const isRu = language === "ru";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: isRu ? "Файл" : "File",
        submenu: [
          { role: "quit", label: isRu ? "Выход" : "Exit" }
        ]
      },
      {
        label: isRu ? "Вид" : "View",
        submenu: [
          { role: "reload", label: isRu ? "Перезагрузить" : "Reload" },
          { role: "forceReload", label: isRu ? "Полная перезагрузка" : "Force Reload" },
          { role: "toggleDevTools", label: isRu ? "Инструменты разработчика" : "Developer Tools" },
          { type: "separator" },
          { role: "resetZoom", label: isRu ? "Масштаб 100%" : "Actual Size" },
          { role: "zoomIn", label: isRu ? "Увеличить" : "Zoom In" },
          { role: "zoomOut", label: isRu ? "Уменьшить" : "Zoom Out" },
          { type: "separator" },
          { role: "togglefullscreen", label: isRu ? "Полный экран" : "Toggle Full Screen" }
        ]
      },
      {
        label: isRu ? "Язык" : "Language",
        submenu: [
          {
            label: "Русский",
            type: "radio",
            checked: language === "ru",
            click: () => {
              language = "ru";
              buildMenu();
              mainWindow?.webContents.send("language:changed", language);
            }
          },
          {
            label: "English",
            type: "radio",
            checked: language === "en",
            click: () => {
              language = "en";
              buildMenu();
              mainWindow?.webContents.send("language:changed", language);
            }
          }
        ]
      }
    ])
  );
}

function sessionsPath() {
  return path.join(app.getPath("userData"), "sessions.json");
}

async function readSavedSessions(): Promise<SavedSession[]> {
  try {
    const raw = await fs.promises.readFile(sessionsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeSavedSessions(items: SavedSession[]) {
  await fs.promises.mkdir(path.dirname(sessionsPath()), { recursive: true });
  await fs.promises.writeFile(sessionsPath(), JSON.stringify(items, null, 2), "utf8");
}

function createWindow() {
  buildMenu();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#111418",
    title: "Sessions",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.SSHROUTE_DEV === "1") {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  for (const session of sessions.values()) {
    session.conn.end();
  }
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("language:set", async (_event, nextLanguage: "ru" | "en") => {
  language = nextLanguage;
  buildMenu();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function toConnectConfig(config: ConnectionConfig): ConnectConfig {
  const base: ConnectConfig = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    readyTimeout: config.readyTimeout || 60000,
    keepaliveInterval: config.keepaliveInterval || 15000
  };

  if (config.authMode === "key") {
    if (!config.privateKeyPath) throw new Error("Path to private key is required.");
    base.privateKey = fs.readFileSync(config.privateKeyPath);
    if (config.passphrase) base.passphrase = config.passphrase;
  } else {
    base.password = config.password;
  }

  return base;
}

function getSession(id: string) {
  const session = sessions.get(id);
  if (!session) throw new Error("SSH session is not connected.");
  return session;
}

function normalizeRemotePath(currentPath: string, nextPath: string) {
  if (!nextPath || nextPath === ".") return currentPath;
  if (nextPath.startsWith("/")) return path.posix.normalize(nextPath);
  return path.posix.normalize(path.posix.join(currentPath, nextPath));
}

function modeToType(mode: number): RemoteEntry["type"] {
  const fileType = mode & 0o170000;
  if (fileType === 0o040000) return "directory";
  if (fileType === 0o100000) return "file";
  if (fileType === 0o120000) return "symlink";
  return "other";
}

function modeToPermissions(mode: number) {
  const flags = ["r", "w", "x"];
  let output = "";
  for (let shift = 8; shift >= 0; shift -= 1) {
    output += mode & (1 << shift) ? flags[(8 - shift) % 3] : "-";
  }
  return output;
}

function sftpFor(session: Session) {
  if (session.sftp) return Promise.resolve(session.sftp);

  return new Promise<SFTPWrapper>((resolve, reject) => {
    session.conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }
      session.sftp = sftp;
      resolve(sftp);
    });
  });
}

function execRemote(session: Session, command: string) {
  return new Promise<string>((resolve, reject) => {
    session.conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let output = "";
      let errorOutput = "";
      stream.on("data", (data: Buffer) => {
        output += data.toString("utf8");
      });
      stream.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString("utf8");
      });
      stream.on("close", (code: number) => {
        if (code && errorOutput.trim()) {
          reject(new Error(errorOutput.trim()));
          return;
        }
        resolve(output);
      });
    });
  });
}

function parseMetrics(raw: string): RemoteMetrics {
  const loadMatch = raw.match(/__LOAD__\s+([^\n]+)/);
  const uptimeMatch = raw.match(/__UPTIME__\s+(\d+)/);
  const memMatch = raw.match(/^Mem:\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+(\d+)/m);
  const dfBlock = raw.split("__DF__\n")[1] ?? "";

  const totalMb = Number(memMatch?.[1] ?? 0);
  const usedMb = Number(memMatch?.[2] ?? 0);
  const availableMb = Number(memMatch?.[3] ?? 0);

  const disks: DiskMetric[] = dfBlock
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const totalKb = Number(parts[1] ?? 0);
      const usedKb = Number(parts[2] ?? 0);
      const availableKb = Number(parts[3] ?? 0);
      const usedPercent = Number(String(parts[4] ?? "0").replace("%", ""));
      return {
        filesystem: parts[0] ?? "",
        totalKb,
        usedKb,
        availableKb,
        usedPercent,
        mount: parts.slice(5).join(" ") || "/"
      };
    })
    .filter((disk) => disk.totalKb > 0)
    .slice(0, 6);

  return {
    load: (loadMatch?.[1] ?? "").trim().split(/\s+/).slice(0, 3).join(" "),
    uptimeSeconds: Number(uptimeMatch?.[1] ?? 0),
    memory: {
      totalMb,
      usedMb,
      availableMb,
      usedPercent: totalMb ? Math.round((usedMb / totalMb) * 100) : 0
    },
    disks,
    sampledAt: Date.now()
  };
}

ipcMain.handle("session:connect", async (_event, config: ConnectionConfig) => {
  const id = randomUUID();
  const conn = new Client();
  const session: Session = { id, conn, cwd: "/" };
  sessions.set(id, session);

  await new Promise<void>((resolve, reject) => {
    conn
      .on("ready", () => resolve())
      .on("error", (error) => {
        sessions.delete(id);
        conn.end();
        reject(error);
      })
      .on("close", () => {
        sessions.delete(id);
        mainWindow?.webContents.send("session:closed", id);
      })
      .connect(toConnectConfig(config));
  });

  return { id };
});

ipcMain.handle("saved-sessions:list", async () => readSavedSessions());

ipcMain.handle("saved-sessions:save", async (_event, session: SavedSession) => {
  const saved = await readSavedSessions();
  const clean: SavedSession = {
    ...session,
    id: session.id || randomUUID(),
    name: session.name.trim() || `${session.username}@${session.host}`,
    port: Number(session.port) || 22,
    readyTimeout: Number(session.readyTimeout) || 60000,
    keepaliveInterval: Number(session.keepaliveInterval) || 15000,
    startPath: session.startPath || "/"
  };
  const index = saved.findIndex((item) => item.id === clean.id);
  if (index >= 0) saved[index] = clean;
  else saved.unshift(clean);
  await writeSavedSessions(saved);
  return clean;
});

ipcMain.handle("saved-sessions:delete", async (_event, id: string) => {
  const saved = await readSavedSessions();
  await writeSavedSessions(saved.filter((item) => item.id !== id));
});

ipcMain.handle("session:disconnect", async (_event, id: string) => {
  getSession(id).conn.end();
  sessions.delete(id);
});

ipcMain.handle("terminal:start", async (_event, id: string, size: TerminalSize) => {
  const session = getSession(id);

  await new Promise<void>((resolve, reject) => {
    session.conn.shell(
      {
        term: "xterm-256color",
        cols: size.cols,
        rows: size.rows
      },
      (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        session.shell = stream;
        stream.on("data", (data: Buffer) => {
          mainWindow?.webContents.send("terminal:data", id, data.toString("utf8"));
        });
        stream.stderr.on("data", (data: Buffer) => {
          mainWindow?.webContents.send("terminal:data", id, data.toString("utf8"));
        });
        stream.on("close", () => {
          mainWindow?.webContents.send("terminal:closed", id);
        });
        resolve();
      }
    );
  });
});

ipcMain.handle("terminal:write", async (_event, id: string, data: string) => {
  const shell = getSession(id).shell;
  if (!shell) throw new Error("Terminal is not started.");
  shell.write(data);
});

ipcMain.handle("terminal:resize", async (_event, id: string, size: TerminalSize) => {
  const shell = getSession(id).shell;
  if (!shell || typeof shell.setWindow !== "function") return;
  shell.setWindow(size.rows, size.cols, 0, 0);
});

ipcMain.handle("session:metrics", async (_event, id: string) => {
  const session = getSession(id);
  const raw = await execRemote(
    session,
    "printf '__LOAD__ '; cat /proc/loadavg; printf '\\n__MEM__\\n'; free -m; printf '__UPTIME__ '; awk '{print int($1)}' /proc/uptime; printf '\\n__DF__\\n'; df -P -k -x tmpfs -x devtmpfs 2>/dev/null"
  );
  return parseMetrics(raw);
});

ipcMain.handle("sftp:list", async (_event, id: string, remotePath?: string) => {
  const session = getSession(id);
  const sftp = await sftpFor(session);
  const targetPath = normalizeRemotePath(session.cwd, remotePath ?? session.cwd);

  const entries = await new Promise<RemoteEntry[]>((resolve, reject) => {
    sftp.readdir(targetPath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }

      session.cwd = targetPath;
      resolve(
        list
          .filter((item) => item.filename !== ".")
          .map((item) => {
            const itemPath =
              item.filename === ".."
                ? path.posix.dirname(targetPath)
                : path.posix.join(targetPath, item.filename);
            return {
              name: item.filename,
              path: itemPath,
              type: item.filename === ".." ? "directory" : modeToType(item.attrs.mode),
              size: item.attrs.size,
              modifiedAt: item.attrs.mtime * 1000,
              permissions: modeToPermissions(item.attrs.mode),
              owner: item.attrs.uid,
              group: item.attrs.gid
            };
          })
          .sort((a, b) => {
            if (a.name === "..") return -1;
            if (b.name === "..") return 1;
            if (a.type === "directory" && b.type !== "directory") return -1;
            if (a.type !== "directory" && b.type === "directory") return 1;
            return a.name.localeCompare(b.name);
          })
      );
    });
  });

  return { path: targetPath, entries };
});

ipcMain.handle("sftp:mkdir", async (_event, id: string, remotePath: string) => {
  const session = getSession(id);
  const sftp = await sftpFor(session);
  const targetPath = normalizeRemotePath(session.cwd, remotePath);
  await new Promise<void>((resolve, reject) => sftp.mkdir(targetPath, (err) => (err ? reject(err) : resolve())));
});

ipcMain.handle("sftp:delete", async (_event, id: string, remotePath: string, type: RemoteEntry["type"]) => {
  const sftp = await sftpFor(getSession(id));
  await new Promise<void>((resolve, reject) => {
    const done = (err?: Error | null) => (err ? reject(err) : resolve());
    if (type === "directory") sftp.rmdir(remotePath, done);
    else sftp.unlink(remotePath, done);
  });
});

ipcMain.handle("sftp:rename", async (_event, id: string, fromPath: string, toPath: string) => {
  const sftp = await sftpFor(getSession(id));
  await new Promise<void>((resolve, reject) => sftp.rename(fromPath, toPath, (err) => (err ? reject(err) : resolve())));
});

ipcMain.handle("sftp:chmod", async (_event, id: string, remotePath: string, mode: number) => {
  const sftp = await sftpFor(getSession(id));
  await new Promise<void>((resolve, reject) => sftp.chmod(remotePath, mode, (err) => (err ? reject(err) : resolve())));
});

ipcMain.handle("sftp:upload", async (_event, id: string, remoteDir: string) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showOpenDialog(win!, {
    title: "Choose files to upload",
    properties: ["openFile", "multiSelections"]
  });
  if (result.canceled) return [];

  const sftp = await sftpFor(getSession(id));
  const uploaded: string[] = [];
  for (const localPath of result.filePaths) {
    const remotePath = path.posix.join(remoteDir, path.basename(localPath));
    await new Promise<void>((resolve, reject) => sftp.fastPut(localPath, remotePath, (err) => (err ? reject(err) : resolve())));
    uploaded.push(remotePath);
  }
  return uploaded;
});

ipcMain.handle("sftp:download", async (_event, id: string, remotePath: string) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showSaveDialog(win!, {
    title: "Save remote file",
    defaultPath: path.join(os.homedir(), "Downloads", path.basename(remotePath))
  });
  if (result.canceled || !result.filePath) return null;

  const sftp = await sftpFor(getSession(id));
  await new Promise<void>((resolve, reject) => sftp.fastGet(remotePath, result.filePath!, (err) => (err ? reject(err) : resolve())));
  return result.filePath;
});

ipcMain.handle("sftp:read-file", async (_event, id: string, remotePath: string) => {
  const sftp = await sftpFor(getSession(id));
  const attrs = await new Promise<{ size: number }>((resolve, reject) =>
    sftp.stat(remotePath, (err, stats) => (err ? reject(err) : resolve(stats)))
  );
  if (attrs.size > 2 * 1024 * 1024) {
    throw new Error("File is larger than 2 MB and cannot be edited inline.");
  }

  const content = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = sftp.createReadStream(remotePath);
    stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

  if (content.includes(0)) {
    throw new Error("File looks binary and cannot be edited inline.");
  }

  return content.toString("utf8");
});

ipcMain.handle("sftp:write-file", async (_event, id: string, remotePath: string, content: string) => {
  const sftp = await sftpFor(getSession(id));
  await new Promise<void>((resolve, reject) => {
    const stream = sftp.createWriteStream(remotePath);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(Buffer.from(content, "utf8"));
  });
});

ipcMain.handle("dialog:private-key", async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showOpenDialog(win!, {
    title: "Choose private key",
    defaultPath: path.join(os.homedir(), ".ssh"),
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0];
});
