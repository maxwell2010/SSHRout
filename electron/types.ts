export type AuthMode = "password" | "key";

export type ConnectionConfig = {
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  readyTimeout?: number;
  keepaliveInterval?: number;
  startPath?: string;
};

export type SessionIcon = "server" | "terminal" | "database" | "cloud" | "folder" | "shield";

export type SavedSession = ConnectionConfig & {
  id: string;
  name: string;
  icon: SessionIcon;
  color: string;
  notes?: string;
};

export type RemoteEntry = {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  size: number;
  modifiedAt: number;
  permissions: string;
  owner: number | string;
  group: number | string;
};

export type TerminalSize = {
  cols: number;
  rows: number;
};

export type DiskMetric = {
  mount: string;
  filesystem: string;
  usedKb: number;
  availableKb: number;
  totalKb: number;
  usedPercent: number;
};

export type RemoteMetrics = {
  load: string;
  uptimeSeconds: number;
  memory: {
    totalMb: number;
    usedMb: number;
    availableMb: number;
    usedPercent: number;
  };
  disks: DiskMetric[];
  sampledAt: number;
};
