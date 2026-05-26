/// <reference types="vite/client" />

import type { ConnectionConfig, RemoteEntry, RemoteMetrics, SavedSession, TerminalSize } from "../electron/types";

type DirectoryListing = {
  path: string;
  entries: RemoteEntry[];
};

declare global {
  interface Window {
    sshRoute: {
      connect(config: ConnectionConfig): Promise<{ id: string }>;
      disconnect(id: string): Promise<void>;
      listSavedSessions(): Promise<SavedSession[]>;
      saveSession(session: SavedSession): Promise<SavedSession>;
      deleteSavedSession(id: string): Promise<void>;
      startTerminal(id: string, size: TerminalSize): Promise<void>;
      writeTerminal(id: string, data: string): Promise<void>;
      resizeTerminal(id: string, size: TerminalSize): Promise<void>;
      getMetrics(id: string): Promise<RemoteMetrics>;
      listDirectory(id: string, remotePath?: string): Promise<DirectoryListing>;
      makeDirectory(id: string, remotePath: string): Promise<void>;
      deletePath(id: string, remotePath: string, type: RemoteEntry["type"]): Promise<void>;
      renamePath(id: string, fromPath: string, toPath: string): Promise<void>;
      chmodPath(id: string, remotePath: string, mode: number): Promise<void>;
      uploadFiles(id: string, remoteDir: string): Promise<string[]>;
      downloadFile(id: string, remotePath: string): Promise<string | null>;
      choosePrivateKey(): Promise<string | null>;
      readClipboardText(): string;
      writeClipboardText(text: string): void;
      setLanguage(language: "ru" | "en"): Promise<void>;
      onLanguageChanged(callback: (language: "ru" | "en") => void): () => void;
      onTerminalData(callback: (id: string, data: string) => void): () => void;
      onSessionClosed(callback: (id: string) => void): () => void;
    };
  }
}
