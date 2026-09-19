(() => {
  // Keep this bridge intentionally narrow. It mirrors only the VacuumTube
  // H5VCC DIAL surface; it does not expose shell, filesystem, process, or
  // arbitrary network commands to the remote YouTube page.
  const mark = () => {
    if (document.documentElement) {
      document.documentElement.dataset.lalinCast = "true";
    }
  };

  mark();
  new MutationObserver(mark).observe(document, { childList: true, subtree: true });

  const maxResolution = () => {
    const resolutions = [
      [256, 144], [426, 240], [640, 360], [854, 480], [1280, 720],
      [1920, 1080], [2560, 1440], [3840, 2160], [7680, 4320]
    ];
    const width = Math.max(window.screen.width, window.screen.height);
    const height = Math.min(window.screen.width, window.screen.height);
    const match = resolutions.find(([x, y]) => width <= x && height <= y);
    return match ? `${match[0]}x${match[1]}` : `${window.screen.width}x${window.screen.height}`;
  };

  const normalizePath = (path) => {
    const value = String(path || "");
    return value.replace(/\/+$/, "") || "/";
  };

  const bridge = () => window.__TAURI__;
  const invoke = (command, args) => {
    const tauri = bridge();
    if (!tauri?.core?.invoke) return Promise.reject(new Error("Lalin Cast bridge unavailable"));
    return tauri.core.invoke(command, args);
  };

  class DialServer {
    constructor(appName) {
      this.appName = String(appName || "");
      this.basePath = `/apps/${this.appName}`;
      this.handlers = new Map();
      DialServer.instances.add(this);
    }

    fullPath(path) {
      return normalizePath(`${this.basePath}${path || ""}`);
    }

    register(method, path, callback) {
      if (typeof callback !== "function") return;
      this.handlers.set(`${method} ${this.fullPath(path)}`, callback);
    }

    onGet(path, callback) { this.register("GET", path, callback); }
    onPost(path, callback) { this.register("POST", path, callback); }
    onDelete(path, callback) { this.register("DELETE", path, callback); }
  }

  DialServer.instances = new Set();

  const dispatchDialRequest = async (event) => {
    const request = event?.payload || event;
    if (!request?.requestId) return;
    let callback;
    for (const server of DialServer.instances) {
      callback = server.handlers.get(`${request.method} ${normalizePath(request.path)}`);
      if (callback) break;
    }

    const headers = [];
    const response = {
      responseCode: 200,
      mimeType: null,
      body: null,
      addHeader: (key, value) => headers.push([String(key), String(value)])
    };

    if (!callback) {
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: 404,
        headers: [],
        body: null
      }).catch(() => {});
      return;
    }

    try {
      const accepted = await callback({
        host: request.host,
        path: normalizePath(request.path),
        body: request.body || ""
      }, response);
      if (!accepted) {
        await invoke("dial_respond", {
          requestId: request.requestId,
          status: 400,
          headers: [],
          body: null
        }).catch(() => {});
        return;
      }
      if (response.mimeType) headers.push(["Content-Type", String(response.mimeType)]);
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: Number(response.responseCode) || 200,
        headers,
        body: response.body == null ? null : String(response.body)
      });
    } catch {
      await invoke("dial_respond", {
        requestId: request.requestId,
        status: 500,
        headers: [],
        body: null
      }).catch(() => {});
    }
  };

  const syncLeanbackDeviceId = async () => {
    let lastDeviceId = null;
    const sync = async () => {
      try {
        const raw = localStorage.getItem("yt.leanback.default::mdx-device-id");
        const deviceId = JSON.parse(raw || "null")?.data;
        if (
          typeof deviceId === "string" &&
          deviceId.length > 0 &&
          deviceId.length <= 128 &&
          deviceId !== lastDeviceId
        ) {
          await invoke("dial_set_device_id", { deviceId });
          lastDeviceId = deviceId;
        }
      } catch {
        // Leanback may initialize localStorage after the document script.
      }
    };

    await sync();
    window.setInterval(sync, 2000);
  };

  const removeUpdateNotice = () => {
    document.getElementById("lalin-cast-update-notice")?.remove();
  };

  const showUpdateNotice = (update) => {
    removeUpdateNotice();
    const notice = document.createElement("aside");
    notice.id = "lalin-cast-update-notice";
    notice.style.cssText = [
      "position:fixed", "top:24px", "right:24px", "z-index:2147483647",
      "width:360px", "padding:18px", "border-radius:14px",
      "background:#171717", "color:#fff", "font:16px Arial,sans-serif",
      "box-shadow:0 8px 32px rgba(0,0,0,.45)"
    ].join(";");

    const title = document.createElement("strong");
    title.textContent = `Lalin Cast ${update?.version || ""} พร้อมอัปเดต`;
    title.style.display = "block";
    title.style.marginBottom = "8px";
    const notes = document.createElement("p");
    notes.textContent = update?.notes || "มีเวอร์ชันใหม่พร้อมติดตั้ง";
    notes.style.margin = "0 0 14px";
    notes.style.whiteSpace = "pre-wrap";
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    const install = document.createElement("button");
    install.type = "button";
    install.textContent = "ติดตั้งและเปิดใหม่";
    install.style.cssText = "border:0;border-radius:8px;padding:8px 12px;background:#3ea6ff;color:#001018;font-weight:700;cursor:pointer";
    install.addEventListener("click", async () => {
      install.disabled = true;
      install.textContent = "กำลังติดตั้ง…";
      try {
        await invoke("cast_update_install");
      } catch (error) {
        install.disabled = false;
        install.textContent = "ลองอีกครั้ง";
        notes.textContent = `ติดตั้งไม่สำเร็จ: ${String(error)}`;
      }
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "ไว้ภายหลัง";
    dismiss.style.cssText = "border:1px solid #777;border-radius:8px;padding:8px 12px;background:transparent;color:#fff;cursor:pointer";
    dismiss.addEventListener("click", removeUpdateNotice);
    actions.append(install, dismiss);
    notice.append(title, notes, actions);
    (document.body || document.documentElement).append(notice);
  };

  const showUpdateStatus = (message, error = false) => {
    removeUpdateNotice();
    const notice = document.createElement("aside");
    notice.id = "lalin-cast-update-notice";
    notice.textContent = message;
    notice.style.cssText = [
      "position:fixed", "top:24px", "right:24px", "z-index:2147483647",
      "padding:12px 16px", "border-radius:10px", "background:#171717",
      `color:${error ? "#ff9b9b" : "#fff"}`, "font:15px Arial,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.35)"
    ].join(";");
    (document.body || document.documentElement).append(notice);
    window.setTimeout(removeUpdateNotice, 5000);
  };

  const checkForUpdates = async (manual = false) => {
    try {
      const update = await invoke("cast_update_check");
      if (update) {
        showUpdateNotice(update);
      } else if (manual) {
        showUpdateStatus("Lalin Cast เป็นเวอร์ชันล่าสุด");
      }
    } catch (error) {
      if (manual) showUpdateStatus(`ตรวจสอบการอัปเดตไม่สำเร็จ: ${String(error)}`, true);
    }
  };

  const installBridge = async () => {
    const started = Date.now();
    while (!bridge()?.event?.listen && Date.now() - started < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const tauri = bridge();
    if (!tauri?.event?.listen) return;

    await tauri.event.listen("lalin-cast-update-check", () => checkForUpdates(true));
    await tauri.event.listen("lalin-cast-dial-request", dispatchDialRequest);
    window.h5vcc = {
      dial: { DialServer },
      runtime: { initialDeepLink: null },
      system: { getVideoContainerSizeOverride: maxResolution }
    };
    syncLeanbackDeviceId();
    window.setTimeout(() => checkForUpdates(false), 8000);
  };

  installBridge();
})();
