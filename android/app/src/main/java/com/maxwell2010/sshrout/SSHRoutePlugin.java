package com.maxwell2010.sshrout;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jcraft.jsch.Channel;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.ChannelShell;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.Vector;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "SSHRoute")
public class SSHRoutePlugin extends Plugin {
    private static final String PREFS_NAME = "sshroute";
    private static final String SESSIONS_KEY = "sessions_json";
    private final Map<String, AndroidSshSession> sessions = new ConcurrentHashMap<>();

    @PluginMethod
    public void listSavedSessions(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("sessions", new JSArray(loadSavedSessions().toString()));
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void saveSession(PluginCall call) {
        try {
            JSONObject session = new JSONObject(call.getData().toString());
            if (!session.has("id") || session.optString("id").isEmpty()) {
                session.put("id", UUID.randomUUID().toString());
            }

            JSONArray sessions = loadSavedSessions();
            boolean updated = false;
            for (int index = 0; index < sessions.length(); index++) {
                JSONObject current = sessions.getJSONObject(index);
                if (session.optString("id").equals(current.optString("id"))) {
                    sessions.put(index, session);
                    updated = true;
                    break;
                }
            }
            if (!updated) sessions.put(session);

            saveSavedSessions(sessions);
            call.resolve(JSObject.fromJSONObject(session));
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void deleteSavedSession(PluginCall call) {
        try {
            String id = call.getString("id", "");
            JSONArray sessions = loadSavedSessions();
            JSONArray next = new JSONArray();
            for (int index = 0; index < sessions.length(); index++) {
                JSONObject current = sessions.getJSONObject(index);
                if (!id.equals(current.optString("id"))) next.put(current);
            }
            saveSavedSessions(next);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        new Thread(() -> {
            try {
                JSONObject config = new JSONObject(call.getData().toString());
                String id = UUID.randomUUID().toString();
                JSch jsch = new JSch();
                String privateKeyPath = config.optString("privateKeyPath", "");
                if (!privateKeyPath.isEmpty()) {
                    String passphrase = config.optString("passphrase", "");
                    if (passphrase.isEmpty()) {
                        jsch.addIdentity(privateKeyPath);
                    } else {
                        jsch.addIdentity(privateKeyPath, passphrase);
                    }
                }

                Session ssh = jsch.getSession(
                    config.optString("username"),
                    config.optString("host"),
                    config.optInt("port", 22)
                );
                if ("password".equals(config.optString("authMode", "password"))) {
                    ssh.setPassword(config.optString("password", ""));
                }

                Properties properties = new Properties();
                properties.put("StrictHostKeyChecking", "no");
                properties.put("PreferredAuthentications", "publickey,password,keyboard-interactive");
                ssh.setConfig(properties);
                ssh.setServerAliveInterval(config.optInt("keepaliveInterval", 15000));
                ssh.connect(config.optInt("readyTimeout", 60000));

                sessions.put(id, new AndroidSshSession(ssh));
                JSObject result = new JSObject();
                result.put("id", id);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String id = call.getString("id", "");
        AndroidSshSession session = sessions.remove(id);
        if (session != null) session.close();
        call.resolve();
    }

    @PluginMethod
    public void startTerminal(PluginCall call) {
        new Thread(() -> {
            try {
                String id = call.getString("id", "");
                AndroidSshSession session = requireSession(id);
                if (session.shell != null && session.shell.isConnected()) {
                    call.resolve();
                    return;
                }

                ChannelShell shell = (ChannelShell) session.ssh.openChannel("shell");
                shell.setPty(true);
                shell.setPtyType("xterm-256color");
                shell.connect();
                session.shell = shell;
                session.terminalInput = shell.getOutputStream();

                InputStream output = shell.getInputStream();
                new Thread(() -> readTerminal(id, output, shell)).start();
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void writeTerminal(PluginCall call) {
        try {
            AndroidSshSession session = requireSession(call.getString("id", ""));
            if (session.terminalInput != null) {
                session.terminalInput.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
                session.terminalInput.flush();
            }
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void resizeTerminal(PluginCall call) {
        try {
            AndroidSshSession session = requireSession(call.getString("id", ""));
            if (session.shell != null) {
                session.shell.setPtySize(call.getInt("cols", 80), call.getInt("rows", 24), 0, 0);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        new Thread(() -> {
            ChannelSftp sftp = null;
            try {
                AndroidSshSession session = requireSession(call.getString("id", ""));
                String remotePath = call.getString("remotePath", "/");
                sftp = openSftp(session);
                Vector<ChannelSftp.LsEntry> files = sftp.ls(remotePath);
                JSArray entries = new JSArray();
                for (ChannelSftp.LsEntry file : files) {
                    String name = file.getFilename();
                    if (".".equals(name) || "..".equals(name)) continue;
                    SftpATTRS attrs = file.getAttrs();
                    JSObject entry = new JSObject();
                    entry.put("name", name);
                    entry.put("path", joinPath(remotePath, name));
                    entry.put("type", attrs.isDir() ? "directory" : attrs.isLink() ? "symlink" : "file");
                    entry.put("size", attrs.getSize());
                    entry.put("modifiedAt", ((long) attrs.getMTime()) * 1000L);
                    entry.put("permissions", permissionsToString(attrs.getPermissions()));
                    entry.put("owner", attrs.getUId());
                    entry.put("group", attrs.getGId());
                    entries.put(entry);
                }
                JSObject result = new JSObject();
                result.put("path", remotePath);
                result.put("entries", entries);
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            } finally {
                if (sftp != null) sftp.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void makeDirectory(PluginCall call) {
        withSftp(call, sftp -> sftp.mkdir(call.getString("remotePath", "/")));
    }

    @PluginMethod
    public void deletePath(PluginCall call) {
        withSftp(call, sftp -> {
            String type = call.getString("type", "file");
            String path = call.getString("remotePath", "");
            if ("directory".equals(type)) sftp.rmdir(path);
            else sftp.rm(path);
        });
    }

    @PluginMethod
    public void renamePath(PluginCall call) {
        withSftp(call, sftp -> sftp.rename(call.getString("fromPath", ""), call.getString("toPath", "")));
    }

    @PluginMethod
    public void chmodPath(PluginCall call) {
        withSftp(call, sftp -> sftp.chmod(call.getInt("mode", 0644), call.getString("remotePath", "")));
    }

    @PluginMethod
    public void getMetrics(PluginCall call) {
        new Thread(() -> {
            try {
                AndroidSshSession session = requireSession(call.getString("id", ""));
                String output = exec(session, "cat /proc/loadavg; free -m; df -kP / 2>/dev/null | tail -n +2; cat /proc/uptime");
                JSObject result = new JSObject();
                result.put("sampledAt", System.currentTimeMillis());
                result.put("load", output.split("\\n", 2)[0]);
                result.put("uptimeSeconds", 0);
                JSObject memory = new JSObject();
                memory.put("totalMb", 0);
                memory.put("usedMb", 0);
                memory.put("availableMb", 0);
                memory.put("usedPercent", 0);
                result.put("memory", memory);
                result.put("disks", new JSArray());
                call.resolve(result);
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void choosePrivateKey(PluginCall call) {
        JSObject result = new JSObject();
        result.put("path", JSONObject.NULL);
        call.resolve(result);
    }

    @PluginMethod
    public void setLanguage(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void uploadFiles(PluginCall call) {
        call.reject("File upload is not implemented on Android yet.");
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        call.reject("File download is not implemented on Android yet.");
    }

    private JSONArray loadSavedSessions() throws Exception {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return new JSONArray(prefs.getString(SESSIONS_KEY, "[]"));
    }

    private void saveSavedSessions(JSONArray sessions) {
        getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(SESSIONS_KEY, sessions.toString())
            .apply();
    }

    private AndroidSshSession requireSession(String id) throws Exception {
        AndroidSshSession session = sessions.get(id);
        if (session == null || !session.ssh.isConnected()) throw new Exception("SSH session is not connected.");
        return session;
    }

    private ChannelSftp openSftp(AndroidSshSession session) throws Exception {
        ChannelSftp sftp = (ChannelSftp) session.ssh.openChannel("sftp");
        sftp.connect();
        return sftp;
    }

    private void withSftp(PluginCall call, SftpAction action) {
        new Thread(() -> {
            ChannelSftp sftp = null;
            try {
                sftp = openSftp(requireSession(call.getString("id", "")));
                action.run(sftp);
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage(), error);
            } finally {
                if (sftp != null) sftp.disconnect();
            }
        }).start();
    }

    private void readTerminal(String id, InputStream output, ChannelShell shell) {
        byte[] buffer = new byte[8192];
        try {
            int length;
            while ((length = output.read(buffer)) >= 0) {
                if (length == 0) continue;
                JSObject data = new JSObject();
                data.put("id", id);
                data.put("data", new String(buffer, 0, length, StandardCharsets.UTF_8));
                notifyListeners("terminalData", data);
            }
        } catch (Exception ignored) {
        } finally {
            JSObject data = new JSObject();
            data.put("id", id);
            notifyListeners("sessionClosed", data);
            AndroidSshSession session = sessions.remove(id);
            if (session != null) session.close();
            shell.disconnect();
        }
    }

    private String exec(AndroidSshSession session, String command) throws Exception {
        ChannelExec channel = (ChannelExec) session.ssh.openChannel("exec");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        channel.setCommand(command);
        channel.setInputStream(null);
        channel.setErrStream(output);
        InputStream input = channel.getInputStream();
        channel.connect();
        byte[] buffer = new byte[4096];
        int length;
        while ((length = input.read(buffer)) >= 0) output.write(buffer, 0, length);
        channel.disconnect();
        return output.toString(StandardCharsets.UTF_8.name());
    }

    private String joinPath(String parent, String name) {
        if (parent == null || parent.isEmpty() || "/".equals(parent)) return "/" + name;
        return parent.endsWith("/") ? parent + name : parent + "/" + name;
    }

    private String permissionsToString(int mode) {
        StringBuilder result = new StringBuilder();
        int[] masks = {0400, 0200, 0100, 0040, 0020, 0010, 0004, 0002, 0001};
        char[] chars = {'r', 'w', 'x', 'r', 'w', 'x', 'r', 'w', 'x'};
        for (int index = 0; index < masks.length; index++) {
            result.append((mode & masks[index]) != 0 ? chars[index] : '-');
        }
        return result.toString();
    }

    private interface SftpAction {
        void run(ChannelSftp sftp) throws Exception;
    }

    private static class AndroidSshSession {
        final Session ssh;
        ChannelShell shell;
        OutputStream terminalInput;

        AndroidSshSession(Session ssh) {
            this.ssh = ssh;
        }

        void close() {
            try {
                if (shell != null) shell.disconnect();
            } catch (Exception ignored) {
            }
            try {
                ssh.disconnect();
            } catch (Exception ignored) {
            }
        }
    }
}
