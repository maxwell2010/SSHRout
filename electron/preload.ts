import { clipboard, contextBridge, ipcRenderer } from "electron";
import { ConnectionConfig, RemoteEntry, SavedSession, TerminalSize } from "./types";

const api = {
  connect: (config: ConnectionConfig) => ipcRenderer.invoke("session:connect", config),
  disconnect: (id: string) => ipcRenderer.invoke("session:disconnect", id),
  listSavedSessions: () => ipcRenderer.invoke("saved-sessions:list"),
  saveSession: (session: SavedSession) => ipcRenderer.invoke("saved-sessions:save", session),
  deleteSavedSession: (id: string) => ipcRenderer.invoke("saved-sessions:delete", id),
  startTerminal: (id: string, size: TerminalSize) => ipcRenderer.invoke("terminal:start", id, size),
  writeTerminal: (id: string, data: string) => ipcRenderer.invoke("terminal:write", id, data),
  resizeTerminal: (id: string, size: TerminalSize) => ipcRenderer.invoke("terminal:resize", id, size),
  getMetrics: (id: string) => ipcRenderer.invoke("session:metrics", id),
  listDirectory: (id: string, remotePath?: string) => ipcRenderer.invoke("sftp:list", id, remotePath),
  makeDirectory: (id: string, remotePath: string) => ipcRenderer.invoke("sftp:mkdir", id, remotePath),
  deletePath: (id: string, remotePath: string, type: RemoteEntry["type"]) =>
    ipcRenderer.invoke("sftp:delete", id, remotePath, type),
  renamePath: (id: string, fromPath: string, toPath: string) => ipcRenderer.invoke("sftp:rename", id, fromPath, toPath),
  chmodPath: (id: string, remotePath: string, mode: number) => ipcRenderer.invoke("sftp:chmod", id, remotePath, mode),
  uploadFiles: (id: string, remoteDir: string) => ipcRenderer.invoke("sftp:upload", id, remoteDir),
  downloadFile: (id: string, remotePath: string) => ipcRenderer.invoke("sftp:download", id, remotePath),
  readRemoteFile: (id: string, remotePath: string) => ipcRenderer.invoke("sftp:read-file", id, remotePath),
  writeRemoteFile: (id: string, remotePath: string, content: string) =>
    ipcRenderer.invoke("sftp:write-file", id, remotePath, content),
  choosePrivateKey: () => ipcRenderer.invoke("dialog:private-key"),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text: string) => clipboard.writeText(text),
  setLanguage: (language: "ru" | "en") => ipcRenderer.invoke("language:set", language),
  onLanguageChanged: (callback: (language: "ru" | "en") => void) => {
    const listener = (_event: Electron.IpcRendererEvent, language: "ru" | "en") => callback(language);
    ipcRenderer.on("language:changed", listener);
    return () => ipcRenderer.removeListener("language:changed", listener);
  },
  onTerminalData: (callback: (id: string, data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onSessionClosed: (callback: (id: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on("session:closed", listener);
    return () => ipcRenderer.removeListener("session:closed", listener);
  }
};

contextBridge.exposeInMainWorld("sshRoute", api);
