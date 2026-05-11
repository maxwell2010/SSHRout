import type { RemoteEntry } from "../electron/types";

const unsupported = () =>
  Promise.reject(new Error("Android SSH/SFTP bridge is not implemented in this preview build."));

export function ensurePlatformApi() {
  if (window.sshRoute) return;

  window.sshRoute = {
    connect: unsupported,
    disconnect: unsupported,
    listSavedSessions: async () => [],
    saveSession: async (session) => session,
    deleteSavedSession: async () => undefined,
    startTerminal: unsupported,
    writeTerminal: unsupported,
    resizeTerminal: unsupported,
    getMetrics: unsupported,
    listDirectory: async () => ({ path: "/", entries: [] as RemoteEntry[] }),
    makeDirectory: unsupported,
    deletePath: unsupported,
    renamePath: unsupported,
    chmodPath: unsupported,
    uploadFiles: async () => [],
    downloadFile: async () => null,
    choosePrivateKey: async () => null,
    setLanguage: async () => undefined,
    onLanguageChanged: () => () => undefined,
    onTerminalData: () => () => undefined,
    onSessionClosed: () => () => undefined
  };
}
