import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  Cloud,
  Archive,
  Database,
  Download,
  File,
  FileCode,
  FileImage,
  FileText,
  Folder,
  FolderPlus,
  HardDrive,
  KeyRound,
  Menu,
  Plus,
  Plug,
  RefreshCw,
  Save,
  Server,
  Shield,
  TerminalSquare,
  Trash2,
  Upload,
  X
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { ensurePlatformApi } from "./platform";
import type { AuthMode, ConnectionConfig, RemoteEntry, SavedSession, SessionIcon } from "../electron/types";
import type { RemoteMetrics } from "../electron/types";

ensurePlatformApi();

type ConnectionState = "idle" | "connecting" | "connected";
type Language = "ru" | "en";
type MobileView = "servers" | "files" | "terminal";

type ContextMenuState = {
  entry: RemoteEntry;
  x: number;
  y: number;
} | null;

type FormState = {
  id: string;
  name: string;
  icon: SessionIcon;
  color: string;
  host: string;
  port: string;
  username: string;
  authMode: AuthMode;
  password: string;
  privateKeyPath: string;
  passphrase: string;
  readyTimeout: string;
  keepaliveInterval: string;
  startPath: string;
  notes: string;
};

type OpenConnection = {
  sessionId: string;
  form: FormState;
  savedId: string;
  remotePath: string;
  entries: RemoteEntry[];
  selectedEntry: RemoteEntry | null;
  terminalText: string;
  metrics: RemoteMetrics | null;
};

const iconOptions: SessionIcon[] = ["server", "terminal", "database", "cloud", "folder", "shield"];
const colorOptions = ["#63e6be", "#38bdf8", "#f59e0b", "#f97316", "#a78bfa", "#f43f5e"];

const translations = {
  ru: {
    sessions: "Сессии",
    new: "Новая",
    newSession: "Новая сессия",
    noActiveServer: "Нет активного сервера",
    sessionName: "Название сессии",
    host: "Хост",
    port: "Порт",
    user: "Пользователь",
    password: "Пароль",
    key: "Ключ",
    privateKeyPath: "Путь к приватному ключу",
    chooseKeyFile: "Выбрать файл ключа",
    passphrase: "Фраза ключа",
    timeout: "Таймаут",
    keepalive: "Keepalive",
    startPath: "Стартовая папка",
    connect: "Подключить",
    connecting: "Подключение",
    connected: "Подключено",
    disconnect: "Отключить",
    save: "Сохранить",
    delete: "Удалить",
    servers: "Серверы",
    files: "Файлы",
    terminal: "Терминал",
    ready: "Готово",
    name: "Имя",
    rights: "Права",
    size: "Размер",
    modified: "Изменен",
    openPath: "Открыть путь",
    upload: "Загрузить",
    download: "Скачать",
    newFolder: "Новая папка",
    rename: "Переименовать",
    permissions: "Права",
    openFolder: "Открыть папку",
    selectFile: "Выбрать файл",
    folderName: "Имя папки",
    newName: "Новое имя",
    permissionsPrompt: "Права доступа (octal, например 755 или 644)",
    permissionsInvalid: "Права должны быть octal, например 755 или 644",
    deleteSaved: "Удалить сохраненную сессию",
    deletePath: "Удалить",
    savedSession: "Сессия сохранена",
    sessionDeleted: "Сессия удалена",
    selected: "Выбрана",
    connectionClosed: "Соединение закрыто",
    disconnected: "Отключено",
    itemsIn: "элементов в",
    ram: "ОЗУ",
    disk: "Диск",
    uptime: "Аптайм",
    load: "Load",
    close: "Закрыть",
    duplicateLimit: "Уже открыто максимум 2 одинаковые сессии",
    handshakeTimeout:
      "Таймаут SSH handshake: проверь хост/порт, запущен ли sshd на сервере, не блокирует ли firewall/VPN, и увеличь таймаут в настройках сессии.",
    language: "Язык"
  },
  en: {
    sessions: "Sessions",
    new: "New",
    newSession: "New session",
    noActiveServer: "No active server",
    sessionName: "Session name",
    host: "Host",
    port: "Port",
    user: "User",
    password: "Password",
    key: "Key",
    privateKeyPath: "Private key path",
    chooseKeyFile: "Choose key file",
    passphrase: "Passphrase",
    timeout: "Timeout",
    keepalive: "Keepalive",
    startPath: "Start path",
    connect: "Connect",
    connecting: "Connecting",
    connected: "Connected",
    disconnect: "Disconnect",
    save: "Save",
    delete: "Delete",
    servers: "Servers",
    files: "Files",
    terminal: "Terminal",
    ready: "Ready",
    name: "Name",
    rights: "Rights",
    size: "Size",
    modified: "Modified",
    openPath: "Open path",
    upload: "Upload",
    download: "Download",
    newFolder: "New folder",
    rename: "Rename",
    permissions: "Permissions",
    openFolder: "Open folder",
    selectFile: "Select file",
    folderName: "Folder name",
    newName: "New name",
    permissionsPrompt: "Permissions (octal, for example 755 or 644)",
    permissionsInvalid: "Permissions must be octal, for example 755 or 644",
    deleteSaved: "Delete saved session",
    deletePath: "Delete",
    savedSession: "Saved session",
    sessionDeleted: "Session deleted",
    selected: "Selected",
    connectionClosed: "Connection closed",
    disconnected: "Disconnected",
    itemsIn: "items in",
    ram: "RAM",
    disk: "Disk",
    uptime: "Uptime",
    load: "Load",
    close: "Close",
    duplicateLimit: "Maximum 2 duplicate sessions are already open",
    handshakeTimeout:
      "SSH handshake timeout: check host/port, sshd, firewall/VPN, and increase session timeout.",
    language: "Language"
  }
} satisfies Record<Language, Record<string, string>>;

const iconMap = {
  server: Server,
  terminal: TerminalSquare,
  database: Database,
  cloud: Cloud,
  folder: Folder,
  shield: Shield
};

const initialForm: FormState = {
  id: "",
  name: "New session",
  icon: "server",
  color: "#63e6be",
  host: "",
  port: "22",
  username: "",
  authMode: "password",
  password: "",
  privateKeyPath: "",
  passphrase: "",
  readyTimeout: "60000",
  keepaliveInterval: "15000",
  startPath: "/",
  notes: ""
};

function toForm(session: SavedSession): FormState {
  return {
    ...initialForm,
    ...session,
    port: String(session.port || 22),
    readyTimeout: String(session.readyTimeout || 60000),
    keepaliveInterval: String(session.keepaliveInterval || 15000),
    startPath: session.startPath || "/",
    password: session.password || "",
    privateKeyPath: session.privateKeyPath || "",
    passphrase: session.passphrase || "",
    notes: session.notes || ""
  };
}

function toSavedSession(form: FormState): SavedSession {
  return {
    id: form.id,
    name: form.name.trim(),
    icon: form.icon,
    color: form.color,
    host: form.host.trim(),
    port: Number(form.port) || 22,
    username: form.username.trim(),
    authMode: form.authMode,
    password: form.password,
    privateKeyPath: form.privateKeyPath.trim(),
    passphrase: form.passphrase,
    readyTimeout: Number(form.readyTimeout) || 60000,
    keepaliveInterval: Number(form.keepaliveInterval) || 15000,
    startPath: form.startPath || "/",
    notes: form.notes
  };
}

function toConnectionConfig(form: FormState): ConnectionConfig {
  const saved = toSavedSession(form);
  return {
    host: saved.host,
    port: saved.port,
    username: saved.username,
    authMode: saved.authMode,
    password: saved.password,
    privateKeyPath: saved.privateKeyPath,
    passphrase: saved.passphrase,
    readyTimeout: saved.readyTimeout,
    keepaliveInterval: saved.keepaliveInterval,
    startPath: saved.startPath
  };
}

function formatSize(size: number) {
  if (!Number.isFinite(size)) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatMb(value: number) {
  if (value >= 1024) return `${(value / 1024).toFixed(value >= 10240 ? 0 : 1)} GB`;
  return `${Math.round(value)} MB`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function formatDiskKb(kb: number) {
  return formatMb(kb / 1024);
}

function fileVisual(entry: RemoteEntry) {
  if (entry.type === "directory") return { Icon: Folder, className: "file-type-folder" };
  const name = entry.name.toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(name)) return { Icon: FileImage, className: "file-type-image" };
  if (/\.(zip|tar|gz|tgz|rar|7z)$/.test(name)) return { Icon: Archive, className: "file-type-archive" };
  if (/\.(js|jsx|ts|tsx|py|go|rs|php|java|c|cpp|h|sh|ps1|json|yaml|yml)$/.test(name)) {
    return { Icon: FileCode, className: "file-type-code" };
  }
  if (/\.(txt|md|log|env|ini|conf|cfg|service)$/.test(name) || name.startsWith(".")) {
    return { Icon: FileText, className: "file-type-text" };
  }
  return { Icon: File, className: "file-type-file" };
}

function App() {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("sshroute-language");
    return saved === "en" ? "en" : "ru";
  });
  const [form, setForm] = useState<FormState>(initialForm);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [activeSavedId, setActiveSavedId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [serverRailOpen, setServerRailOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("servers");
  const [openConnections, setOpenConnections] = useState<OpenConnection[]>([]);
  const [connectingSavedIds, setConnectingSavedIds] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionState>("idle");
  const [remotePath, setRemotePath] = useState("/");
  const [entries, setEntries] = useState<RemoteEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<RemoteEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [message, setMessage] = useState(translations.ru.ready);
  const [error, setError] = useState<string | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);

  const connected = status === "connected" && sessionId;
  const ActiveIcon = iconMap[form.icon];
  const t = translations[language];
  const layoutClassBase = editorOpen
    ? "app-shell setup-mode editor-open"
    : connected
      ? serverRailOpen
        ? "app-shell work-mode rail-open"
        : "app-shell work-mode rail-closed"
      : "app-shell setup-mode editor-closed";
  const layoutClass = `${layoutClassBase} mobile-view-${mobileView}`;

  const patchForm = useCallback((patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  }, []);

  const connectionTitle = useMemo(() => {
    if (!form.host) return t.noActiveServer;
    return `${form.username || "user"}@${form.host}:${form.port || "22"}`;
  }, [form.host, form.port, form.username, t.noActiveServer]);

  const activeMetrics = useMemo(
    () => openConnections.find((item) => item.sessionId === sessionId)?.metrics ?? null,
    [openConnections, sessionId]
  );

  const openConnectionsRef = useRef<OpenConnection[]>([]);
  const connectingSavedIdsRef = useRef<string[]>([]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    localStorage.setItem("sshroute-language", nextLanguage);
    void window.sshRoute.setLanguage(nextLanguage);
  }, []);

  const updateOpenConnection = useCallback((id: string, patch: Partial<OpenConnection>) => {
    setOpenConnections((current) => current.map((item) => (item.sessionId === id ? { ...item, ...patch } : item)));
  }, []);

  const withActiveSnapshot = useCallback(
    (connections: OpenConnection[]) =>
      connections.map((item) =>
        item.sessionId === sessionId
          ? {
              ...item,
              form,
              remotePath,
              entries,
              selectedEntry
            }
          : item
      ),
    [entries, form, remotePath, selectedEntry, sessionId]
  );

  const switchOpenConnection = useCallback(
    (connection: OpenConnection, snapshotCurrent = true) => {
      if (snapshotCurrent) setOpenConnections((current) => withActiveSnapshot(current));
      setForm(connection.form);
      setActiveSavedId(connection.savedId);
      setSessionId(connection.sessionId);
      setRemotePath(connection.remotePath);
      setEntries(connection.entries);
      setSelectedEntry(connection.selectedEntry);
      setStatus("connected");
      setEditorOpen(false);
      setContextMenu(null);
      setMobileView("files");
      setMessage(connection.metrics ? `${connection.metrics.memory.usedPercent}% RAM` : t.ready);
      terminalRef.current?.clear();
      if (connection.terminalText) terminalRef.current?.write(connection.terminalText);
      window.setTimeout(() => fitAddonRef.current?.fit(), 20);
    },
    [t.ready, withActiveSnapshot]
  );

  const showError = useCallback((value: unknown) => {
    const rawText = value instanceof Error ? value.message : String(value);
    const text = rawText.includes("Timed out while waiting for handshake")
      ? t.handshakeTimeout
      : rawText.replace("Error invoking remote method 'session:connect': Error: ", "");
    setError(text);
    setMessage(text);
  }, [t.handshakeTimeout]);

  const refreshSavedSessions = useCallback(async () => {
    const sessions = await window.sshRoute.listSavedSessions();
    setSavedSessions(sessions);
  }, []);

  useEffect(() => {
    void refreshSavedSessions();
  }, [refreshSavedSessions]);

  useEffect(() => {
    void window.sshRoute.setLanguage(language);
    const offLanguage = window.sshRoute.onLanguageChanged((nextLanguage) => setLanguage(nextLanguage));
    return offLanguage;
  }, [language, setLanguage]);

  useEffect(() => {
    activeSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    openConnectionsRef.current = openConnections;
  }, [openConnections]);

  useEffect(() => {
    connectingSavedIdsRef.current = connectingSavedIds;
  }, [connectingSavedIds]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  const loadDirectory = useCallback(
    async (path?: string) => {
      if (!sessionId) return;
      try {
        const listing = await window.sshRoute.listDirectory(sessionId, path);
        setRemotePath(listing.path);
        setEntries(listing.entries);
        setSelectedEntry(null);
        setContextMenu(null);
        updateOpenConnection(sessionId, {
          remotePath: listing.path,
          entries: listing.entries,
          selectedEntry: null
        });
        setMessage(`${listing.entries.length} ${t.itemsIn} ${listing.path}`);
      } catch (err) {
        showError(err);
      }
    },
    [sessionId, showError, updateOpenConnection, t.itemsIn]
  );

  useEffect(() => {
    const offData = window.sshRoute.onTerminalData((id, data) => {
      setOpenConnections((current) =>
        current.map((item) =>
          item.sessionId === id
            ? { ...item, terminalText: `${item.terminalText}${data}`.slice(-120000) }
            : item
        )
      );
      if (id === activeSessionIdRef.current) terminalRef.current?.write(data);
    });
    const offClosed = window.sshRoute.onSessionClosed((id) => {
      if (id === activeSessionIdRef.current) {
        setStatus("idle");
        setSessionId(null);
        setMessage(t.connectionClosed);
      }
    });
    return () => {
      offData();
      offClosed();
    };
  }, [t.connectionClosed]);

  useEffect(() => {
    if (!terminalHostRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      fontSize: 14,
      theme: {
        background: "#0e1116",
        foreground: "#dce3ec",
        cursor: "#63e6be",
        selectionBackground: "#2f7dd3"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHostRef.current);
    fitAddon.fit();
    terminal.onData((data) => {
      if (activeSessionIdRef.current) void window.sshRoute.writeTerminal(activeSessionIdRef.current, data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (activeSessionIdRef.current) {
        void window.sshRoute.resizeTerminal(activeSessionIdRef.current, {
          cols: terminal.cols,
          rows: terminal.rows
        });
      }
    });
    resizeObserver.observe(terminalHostRef.current);

    return () => {
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.setTimeout(() => fitAddonRef.current?.fit(), 40);
  }, [connected, editorOpen, mobileView]);

  useEffect(() => {
    if (!sessionId || !connected) return;
    let cancelled = false;

    const refreshMetrics = async () => {
      try {
        const metrics = await window.sshRoute.getMetrics(sessionId);
        if (cancelled) return;
        updateOpenConnection(sessionId, { metrics });
      } catch {
        // Monitoring must never interrupt the terminal or file manager.
      }
    };

    void refreshMetrics();
    const timer = window.setInterval(refreshMetrics, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connected, sessionId, updateOpenConnection]);

  async function saveCurrentSession() {
    setError(null);
    const saved = await window.sshRoute.saveSession(toSavedSession(form));
    setForm(toForm(saved));
    setActiveSavedId(saved.id);
    await refreshSavedSessions();
    setMessage(`${t.savedSession}: ${saved.name}`);
  }

  async function deleteCurrentSession() {
    if (!activeSavedId) return;
    const ok = window.confirm(`${t.deleteSaved} "${form.name}"?`);
    if (!ok) return;
    await window.sshRoute.deleteSavedSession(activeSavedId);
    setForm(initialForm);
    setActiveSavedId("");
    await refreshSavedSessions();
    setMessage(t.sessionDeleted);
  }

  function newSession() {
    setForm({ ...initialForm, name: t.newSession });
    setActiveSavedId("");
    setEditorOpen(true);
    setServerRailOpen(false);
    setMobileView("servers");
    setSelectedEntry(null);
    setContextMenu(null);
    setMessage(t.newSession);
  }

  function selectSavedSession(session: SavedSession) {
    setForm(toForm(session));
    setActiveSavedId(session.id);
    setEditorOpen(true);
    setServerRailOpen(false);
    setMobileView("servers");
    setError(null);
    setMessage(`${t.selected}: ${session.name}`);
  }

  function useSavedSession(session: SavedSession, forceDuplicate = false) {
    const snapshotConnections = withActiveSnapshot(openConnectionsRef.current);
    setOpenConnections(snapshotConnections);
    const matchingOpen = snapshotConnections.filter((item) => item.savedId === session.id);
    const alreadyOpen = matchingOpen[0];
    if (alreadyOpen && !forceDuplicate) {
      switchOpenConnection(alreadyOpen);
      setServerRailOpen(false);
      return;
    }
    if (matchingOpen.length >= 2) {
      switchOpenConnection(matchingOpen[0]);
      setMessage(t.duplicateLimit);
      return;
    }
    if (connectingSavedIdsRef.current.includes(session.id)) {
      setMessage(`${t.connecting}...`);
      return;
    }
    if (connected) {
      const selectedForm = toForm(session);
      setForm(selectedForm);
      setActiveSavedId(session.id);
      void connect(undefined, selectedForm, forceDuplicate);
      return;
    }
    selectSavedSession(session);
  }

  async function connect(event?: FormEvent, sourceForm: FormState = form, forceDuplicate = false) {
    event?.preventDefault();
    setError(null);
    if (sourceForm.id) {
      const matchingOpen = openConnectionsRef.current.filter((item) => item.savedId === sourceForm.id);
      const alreadyOpen = matchingOpen[0];
      if (alreadyOpen && !forceDuplicate) {
        switchOpenConnection(alreadyOpen);
        return;
      }
      if (matchingOpen.length >= 2) {
        switchOpenConnection(matchingOpen[0]);
        setMessage(t.duplicateLimit);
        return;
      }
      if (connectingSavedIdsRef.current.includes(sourceForm.id)) {
        setMessage(`${t.connecting}...`);
        return;
      }
      setConnectingSavedIds((current) => (current.includes(sourceForm.id) ? current : [...current, sourceForm.id]));
    }
    setStatus("connecting");
    setMessage(`${t.connecting}...`);

    try {
      const result = await window.sshRoute.connect(toConnectionConfig(sourceForm));
      setSessionId(result.id);
      setStatus("connected");
      setMessage(t.connected);
      terminalRef.current?.clear();
      fitAddonRef.current?.fit();
      await window.sshRoute.startTerminal(result.id, {
        cols: terminalRef.current?.cols ?? 100,
        rows: terminalRef.current?.rows ?? 30
      });
      const startPath = sourceForm.startPath || "/";
      const listing = await window.sshRoute.listDirectory(result.id, startPath);
      setRemotePath(listing.path);
      setEntries(listing.entries);
      const opened: OpenConnection = {
        sessionId: result.id,
        form: sourceForm,
        savedId: sourceForm.id,
        remotePath: listing.path,
        entries: listing.entries,
        selectedEntry: null,
        terminalText: "",
        metrics: null
      };
      setOpenConnections((current) => [opened, ...current]);
      setEditorOpen(false);
      setServerRailOpen(false);
      setMobileView("files");
    } catch (err) {
      setStatus("idle");
      showError(err);
    } finally {
      if (sourceForm.id) {
        setConnectingSavedIds((current) => current.filter((id) => id !== sourceForm.id));
      }
    }
  }

  async function disconnect() {
    if (!sessionId) return;
    await closeOpenConnection(sessionId);
  }

  async function closeOpenConnection(connectionId: string) {
    const isActive = connectionId === sessionId;
    await window.sshRoute.disconnect(connectionId);
    const remaining = withActiveSnapshot(openConnections).filter((item) => item.sessionId !== connectionId);
    setOpenConnections(remaining);

    if (!isActive) return;

    const next = remaining[0];
    if (next) {
      switchOpenConnection(next, false);
      setMessage(t.disconnected);
      return;
    }

    setSessionId(null);
    setStatus("idle");
    setEntries([]);
    setSelectedEntry(null);
    setEditorOpen(Boolean(activeSavedId));
    setMessage(t.disconnected);
  }

  async function openEntry(entry: RemoteEntry) {
    if (sessionId) updateOpenConnection(sessionId, { selectedEntry: entry });
    if (entry.type === "directory") {
      await loadDirectory(entry.path);
      return;
    }
    setSelectedEntry(entry);
  }

  async function makeDirectory() {
    if (!sessionId) return;
    const name = window.prompt(t.folderName);
    if (!name) return;
    await window.sshRoute.makeDirectory(sessionId, name);
    await loadDirectory(remotePath);
  }

  async function chmodSelected(entry = selectedEntry) {
    if (!sessionId || !entry || entry.name === "..") return;
    const current = permissionsToOctal(entry.permissions);
    const value = window.prompt(t.permissionsPrompt, current);
    if (!value) return;
    const normalized = value.trim();
    if (!/^[0-7]{3,4}$/.test(normalized)) {
      setMessage(t.permissionsInvalid);
      return;
    }
    await window.sshRoute.chmodPath(sessionId, entry.path, parseInt(normalized, 8));
    await loadDirectory(remotePath);
  }

  async function deleteSelected(entry = selectedEntry) {
    if (!sessionId || !entry || entry.name === "..") return;
    const ok = window.confirm(`${t.deletePath} ${entry.path}?`);
    if (!ok) return;
    await window.sshRoute.deletePath(sessionId, entry.path, entry.type);
    await loadDirectory(remotePath);
  }

  async function renameSelected(entry = selectedEntry) {
    if (!sessionId || !entry || entry.name === "..") return;
    const name = window.prompt(t.newName, entry.name);
    if (!name || name === entry.name) return;
    const target = `${remotePath.replace(/\/$/, "")}/${name}`;
    await window.sshRoute.renamePath(sessionId, entry.path, target);
    await loadDirectory(remotePath);
  }

  async function uploadFiles() {
    if (!sessionId) return;
    await window.sshRoute.uploadFiles(sessionId, remotePath);
    await loadDirectory(remotePath);
  }

  async function downloadSelected(entry = selectedEntry) {
    if (!sessionId || !entry || entry.type !== "file") return;
    await window.sshRoute.downloadFile(sessionId, entry.path);
  }

  async function choosePrivateKey() {
    const privateKeyPath = await window.sshRoute.choosePrivateKey();
    if (privateKeyPath) patchForm({ privateKeyPath });
  }

  function permissionsToOctal(permissions: string) {
    const triplets = [permissions.slice(0, 3), permissions.slice(3, 6), permissions.slice(6, 9)];
    return triplets
      .map((part) => {
        let value = 0;
        if (part[0] === "r") value += 4;
        if (part[1] === "w") value += 2;
        if (part[2] === "x") value += 1;
        return value;
      })
      .join("");
  }

  function openContextMenu(event: React.MouseEvent, entry: RemoteEntry) {
    event.preventDefault();
    setSelectedEntry(entry);
    if (sessionId) updateOpenConnection(sessionId, { selectedEntry: entry });
    setContextMenu({ entry, x: event.clientX, y: event.clientY });
  }

  return (
    <main className={layoutClass}>
      <aside className="sessions-rail">
        <div className="rail-title">
          <HardDrive size={20} />
          <span>{t.sessions}</span>
        </div>
        <button className="new-session-button" type="button" onClick={newSession}>
          <Plus size={16} />
          {t.new}
        </button>
        <div className="saved-session-list">
          {savedSessions.map((session) => {
            const SessionIconView = iconMap[session.icon] || Server;
            return (
              <button
                key={session.id}
                className={activeSavedId === session.id ? "saved-session active" : "saved-session"}
                type="button"
                onClick={() => useSavedSession(session)}
                onDoubleClick={() => {
                  const selectedForm = toForm(session);
                  setForm(selectedForm);
                  setActiveSavedId(session.id);
                  void connect(undefined, selectedForm, true);
                }}
                disabled={connectingSavedIds.includes(session.id)}
              >
                <span className="session-icon" style={{ backgroundColor: session.color }}>
                  <SessionIconView size={17} />
                </span>
                <span>
                  <strong>{session.name}</strong>
                  <small>{session.username}@{session.host}</small>
                </span>
                {connected ? (
                  <span className="session-actions">
                    <button
                      type="button"
                      title="+1"
                      onClick={(event) => {
                        event.stopPropagation();
                        useSavedSession(session, true);
                      }}
                    >
                      +1
                    </button>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" style={{ backgroundColor: form.color }}>
            <ActiveIcon size={20} />
          </div>
          <div>
            <h1>{form.name || t.newSession}</h1>
            <p>{connectionTitle}</p>
          </div>
        </div>

        <form className="connection-form" onSubmit={connect}>
          <label>
            {t.sessionName}
            <input
              value={form.name}
              spellCheck={false}
              onInput={(event) => patchForm({ name: event.currentTarget.value })}
              onChange={(event) => patchForm({ name: event.target.value })}
            />
          </label>

          <div className="session-style-row">
            <div className="icon-picker">
              {iconOptions.map((icon) => {
                const Icon = iconMap[icon];
                return (
                  <button
                    key={icon}
                    type="button"
                    title={icon}
                    className={form.icon === icon ? "active" : ""}
                    onClick={() => patchForm({ icon })}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
            <div className="color-picker">
              {colorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  className={form.color === color ? "active" : ""}
                  style={{ backgroundColor: color }}
                  onClick={() => patchForm({ color })}
                />
              ))}
            </div>
          </div>

          <label>
            {t.host}
            <input
              required
              value={form.host}
              placeholder="192.168.1.20"
              onChange={(event) => patchForm({ host: event.target.value })}
            />
          </label>
          <div className="form-grid">
            <label>
              {t.port}
              <input value={form.port} onChange={(event) => patchForm({ port: event.target.value })} />
            </label>
            <label>
              {t.user}
              <input
                required
                value={form.username}
                onChange={(event) => patchForm({ username: event.target.value })}
              />
            </label>
          </div>

          <div className="segmented" role="tablist">
            <button
              type="button"
              className={form.authMode === "password" ? "active" : ""}
              onClick={() => patchForm({ authMode: "password" })}
            >
              {t.password}
            </button>
            <button
              type="button"
              className={form.authMode === "key" ? "active" : ""}
              onClick={() => patchForm({ authMode: "key" })}
            >
              {t.key}
            </button>
          </div>

          {form.authMode === "password" ? (
            <label>
              {t.password}
              <input
                type="password"
                value={form.password}
                onChange={(event) => patchForm({ password: event.target.value })}
              />
            </label>
          ) : (
            <>
              <label>
                {t.privateKeyPath}
                <div className="key-path-row">
                  <input
                    value={form.privateKeyPath}
                    placeholder="C:\\Users\\you\\.ssh\\id_rsa"
                    onChange={(event) => patchForm({ privateKeyPath: event.target.value })}
                  />
                  <button type="button" title={t.chooseKeyFile} onClick={choosePrivateKey}>
                    <Folder size={16} />
                  </button>
                </div>
              </label>
              <label>
                {t.passphrase}
                <input
                  type="password"
                  value={form.passphrase}
                  onChange={(event) => patchForm({ passphrase: event.target.value })}
                />
              </label>
            </>
          )}

          <div className="form-grid">
            <label>
              {t.timeout}
              <input value={form.readyTimeout} onChange={(event) => patchForm({ readyTimeout: event.target.value })} />
            </label>
            <label>
              {t.keepalive}
              <input
                value={form.keepaliveInterval}
                onChange={(event) => patchForm({ keepaliveInterval: event.target.value })}
              />
            </label>
          </div>

          <label>
            {t.startPath}
            <input value={form.startPath} onChange={(event) => patchForm({ startPath: event.target.value })} />
          </label>

          <div className="form-actions">
            <button className="primary" type="submit" disabled={status === "connecting"}>
              <Plug size={16} />
              {status === "connecting" ? t.connecting : t.connect}
            </button>
            <button type="button" onClick={saveCurrentSession}>
              <Save size={16} />
              {t.save}
            </button>
            <button type="button" disabled={!connected} onClick={disconnect}>
              {t.disconnect}
            </button>
            <button type="button" disabled={!activeSavedId} onClick={deleteCurrentSession}>
              {t.delete}
            </button>
          </div>
        </form>

        {connected ? (
          <section className="work-header">
            <div className="work-session">
              <span className="session-icon" style={{ backgroundColor: form.color }}>
                <ActiveIcon size={17} />
              </span>
              <span>
                <strong>{form.name || t.connected}</strong>
                <small>{connectionTitle}</small>
              </span>
            </div>
            <button type="button" onClick={() => setServerRailOpen((value) => !value)}>
              <Menu size={16} />
              {t.servers}
            </button>
            <button type="button" onClick={disconnect}>
              {t.disconnect}
            </button>
          </section>
        ) : null}

        <section className="file-tools">
          <div className="path-row">
            <input value={remotePath} disabled={!connected} onChange={(event) => setRemotePath(event.target.value)} />
            <button title={t.openPath} disabled={!connected} onClick={() => loadDirectory(remotePath)}>
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="toolbar">
            <button title={t.upload} disabled={!connected} onClick={uploadFiles}>
              <Upload size={16} />
            </button>
            <button title={t.download} disabled={!selectedEntry || selectedEntry.type !== "file"} onClick={() => downloadSelected()}>
              <Download size={16} />
            </button>
            <button title={t.newFolder} disabled={!connected} onClick={makeDirectory}>
              <FolderPlus size={16} />
            </button>
            <button title={t.rename} disabled={!selectedEntry || selectedEntry.name === ".."} onClick={() => renameSelected()}>
              <KeyRound size={16} />
            </button>
            <button title={t.delete} disabled={!selectedEntry || selectedEntry.name === ".."} onClick={() => deleteSelected()}>
              <Trash2 size={16} />
            </button>
          </div>
        </section>

        <section className="file-list" aria-label="Remote files">
          <div className="file-head">
            <span>{t.name}</span>
            <span>{t.rights}</span>
            <span>{t.size}</span>
            <span>{t.modified}</span>
          </div>
          <div className="file-scroll">
            {entries.map((entry) => {
              const visual = fileVisual(entry);
              const VisualIcon = visual.Icon;
              return (
                <button
                  key={`${entry.path}-${entry.name}`}
                  className={selectedEntry?.path === entry.path ? "file-row selected" : "file-row"}
                  onClick={() => {
                    setSelectedEntry(entry);
                    if (sessionId) updateOpenConnection(sessionId, { selectedEntry: entry });
                  }}
                  onDoubleClick={() => openEntry(entry)}
                  onContextMenu={(event) => openContextMenu(event, entry)}
                >
                  <span className={`file-name ${visual.className}`}>
                    <VisualIcon size={16} />
                    {entry.name}
                  </span>
                  <span className="permissions">{entry.name === ".." ? "" : entry.permissions}</span>
                  <span>{entry.type === "directory" ? "" : formatSize(entry.size)}</span>
                  <span>{entry.name === ".." ? "" : new Date(entry.modifiedAt).toLocaleDateString()}</span>
                </button>
              );
            })}
          </div>
          {contextMenu ? (
            <div
              className="context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button type="button" onClick={() => openEntry(contextMenu.entry)}>
                {contextMenu.entry.type === "directory" ? t.openFolder : t.selectFile}
              </button>
              <button
                type="button"
                disabled={contextMenu.entry.type !== "file"}
                onClick={() => downloadSelected(contextMenu.entry)}
              >
                {t.download}
              </button>
              <button type="button" disabled={contextMenu.entry.name === ".."} onClick={() => renameSelected(contextMenu.entry)}>
                {t.rename}
              </button>
              <button type="button" disabled={contextMenu.entry.name === ".."} onClick={() => chmodSelected(contextMenu.entry)}>
                {t.permissions}
              </button>
              <button type="button" disabled={contextMenu.entry.name === ".."} className="danger" onClick={() => deleteSelected(contextMenu.entry)}>
                {t.delete}
              </button>
            </div>
          ) : null}
        </section>
      </aside>

      <section className="terminal-pane">
        <header className="terminal-header">
          <div className="terminal-title-group">
            <Server size={18} />
            {openConnections.length > 0 ? (
              <div className="open-session-tabs">
                {openConnections.map((connection) => {
                  const TabIcon = iconMap[connection.form.icon] || Server;
                  return (
                    <div
                      key={connection.sessionId}
                      className={connection.sessionId === sessionId ? "session-tab active" : "session-tab"}
                      role="button"
                      tabIndex={0}
                      onClick={() => switchOpenConnection(connection)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") switchOpenConnection(connection);
                      }}
                      title={`${connection.form.name} (${connection.form.username}@${connection.form.host})`}
                    >
                      <span className="tab-icon" style={{ backgroundColor: connection.form.color }}>
                        <TabIcon size={13} />
                      </span>
                      <span>{connection.form.name || connection.form.host}</span>
                      <button
                        className="tab-close"
                        type="button"
                        title={t.close}
                        onClick={(event) => {
                          event.stopPropagation();
                          void closeOpenConnection(connection.sessionId);
                        }}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span>{t.terminal}</span>
            )}
          </div>
          <div>
            <TerminalSquare size={18} />
            <span className={error ? "status error" : "status"}>{message}</span>
          </div>
        </header>
        <div className="terminal-host" ref={terminalHostRef} />
      </section>
      <nav className="mobile-nav" aria-label="Mobile sections">
        <button
          type="button"
          className={mobileView === "servers" ? "active" : ""}
          onClick={() => setMobileView("servers")}
        >
          <Server size={18} />
          <span>{t.servers}</span>
        </button>
        <button
          type="button"
          className={mobileView === "files" ? "active" : ""}
          disabled={!connected}
          onClick={() => setMobileView("files")}
        >
          <Folder size={18} />
          <span>{t.files}</span>
        </button>
        <button
          type="button"
          className={mobileView === "terminal" ? "active" : ""}
          disabled={!connected}
          onClick={() => setMobileView("terminal")}
        >
          <TerminalSquare size={18} />
          <span>{t.terminal}</span>
        </button>
      </nav>
      {connected ? (
        <footer className="metrics-bar">
          <span className="metric-pill">
            <span className="metric-icon">CPU</span>
            {t.load}: {activeMetrics?.load || "..."}
          </span>
          <span className="metric-pill">
            <span className="metric-icon">RAM</span>
            {activeMetrics
              ? `${t.ram}: ${activeMetrics.memory.usedPercent}% (${formatMb(activeMetrics.memory.usedMb)} / ${formatMb(activeMetrics.memory.totalMb)})`
              : `${t.ram}: ...`}
          </span>
          <span className="metric-pill">
            <span className="metric-icon">UP</span>
            {t.uptime}: {activeMetrics ? formatUptime(activeMetrics.uptimeSeconds) : "..."}
          </span>
          {activeMetrics?.disks.slice(0, 3).map((disk) => (
            <span className="metric-pill" key={`${disk.filesystem}-${disk.mount}`}>
              <span className="metric-icon">HD</span>
              {disk.mount}: {disk.usedPercent}% ({formatDiskKb(disk.usedKb)} / {formatDiskKb(disk.totalKb)})
            </span>
          ))}
        </footer>
      ) : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
