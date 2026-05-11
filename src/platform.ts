import type { RemoteEntry } from "../electron/types";
import { registerPlugin } from "@capacitor/core";

const unsupported = () =>
  Promise.reject(new Error("Android SSH/SFTP bridge is not implemented in this preview build."));

type ListenerHandle = {
  remove: () => Promise<void>;
};

type SSHRouteNativePlugin = {
  connect(config: Record<string, unknown>): Promise<{ id: string }>;
  disconnect(options: { id: string }): Promise<void>;
  listSavedSessions(): Promise<{ sessions: unknown[] }>;
  saveSession(session: Record<string, unknown>): Promise<unknown>;
  deleteSavedSession(options: { id: string }): Promise<void>;
  startTerminal(options: Record<string, unknown>): Promise<void>;
  writeTerminal(options: Record<string, unknown>): Promise<void>;
  resizeTerminal(options: Record<string, unknown>): Promise<void>;
  getMetrics(options: { id: string }): Promise<unknown>;
  listDirectory(options: Record<string, unknown>): Promise<{ path: string; entries: RemoteEntry[] }>;
  makeDirectory(options: Record<string, unknown>): Promise<void>;
  deletePath(options: Record<string, unknown>): Promise<void>;
  renamePath(options: Record<string, unknown>): Promise<void>;
  chmodPath(options: Record<string, unknown>): Promise<void>;
  choosePrivateKey(): Promise<{ path: string | null }>;
  setLanguage(options: { language: "ru" | "en" }): Promise<void>;
  uploadFiles(options: Record<string, unknown>): Promise<{ paths?: string[] }>;
  downloadFile(options: Record<string, unknown>): Promise<{ path?: string | null }>;
  addListener(
    eventName: "terminalData",
    listenerFunc: (event: { id: string; data: string }) => void
  ): Promise<ListenerHandle>;
  addListener(eventName: "sessionClosed", listenerFunc: (event: { id: string }) => void): Promise<ListenerHandle>;
};

const native = registerPlugin<SSHRouteNativePlugin>("SSHRoute");

function removeNativeListener(handlePromise: Promise<ListenerHandle>) {
  void handlePromise.then((handle) => handle.remove());
}

export function ensurePlatformApi() {
  if (window.sshRoute) return;

  window.sshRoute = {
    connect: (config) => native.connect(config),
    disconnect: (id) => native.disconnect({ id }),
    listSavedSessions: async () => {
      const result = await native.listSavedSessions();
      return result.sessions as never;
    },
    saveSession: async (session) => native.saveSession(session as never) as never,
    deleteSavedSession: (id) => native.deleteSavedSession({ id }),
    startTerminal: (id, size) => native.startTerminal({ id, ...size }),
    writeTerminal: (id, data) => native.writeTerminal({ id, data }),
    resizeTerminal: (id, size) => native.resizeTerminal({ id, ...size }),
    getMetrics: async (id) => native.getMetrics({ id }) as never,
    listDirectory: (id, remotePath = "/") => native.listDirectory({ id, remotePath }),
    makeDirectory: (id, remotePath) => native.makeDirectory({ id, remotePath }),
    deletePath: (id, remotePath, type) => native.deletePath({ id, remotePath, type }),
    renamePath: (id, fromPath, toPath) => native.renamePath({ id, fromPath, toPath }),
    chmodPath: (id, remotePath, mode) => native.chmodPath({ id, remotePath, mode }),
    uploadFiles: async (id, remoteDir) => {
      const result = await native.uploadFiles({ id, remoteDir });
      return result.paths || [];
    },
    downloadFile: async (id, remotePath) => {
      const result = await native.downloadFile({ id, remotePath });
      return result.path || null;
    },
    choosePrivateKey: async () => {
      const result = await native.choosePrivateKey();
      return result.path || null;
    },
    setLanguage: (language) => native.setLanguage({ language }),
    onLanguageChanged: () => () => undefined,
    onTerminalData: (callback) => {
      const handle = native.addListener("terminalData", (event) => callback(event.id, event.data));
      return () => removeNativeListener(handle);
    },
    onSessionClosed: (callback) => {
      const handle = native.addListener("sessionClosed", (event) => callback(event.id));
      return () => removeNativeListener(handle);
    }
  };
}
