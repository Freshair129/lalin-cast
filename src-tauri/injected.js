(() => {
  // Provenance: this bridge's H5VCC DIAL surface is ported from VacuumTube
  // (see LALIN_PROVENANCE.md). Keep it intentionally narrow: it does not
  // expose shell, filesystem, process, or arbitrary network commands to the
  // remote YouTube page, and it carries no release-check surface of its own
  // (that lives entirely on the Rust side and the native window it opens).
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

  const installBridge = async () => {
    const started = Date.now();
    while (!bridge()?.event?.listen && Date.now() - started < 10000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const tauri = bridge();
    if (!tauri?.event?.listen) return;

    await tauri.event.listen("lalin-cast-dial-request", dispatchDialRequest);
    window.h5vcc = {
      dial: { DialServer },
      runtime: { initialDeepLink: null },
      system: { getVideoContainerSizeOverride: maxResolution }
    };
    syncLeanbackDeviceId();
  };

  // Surface detection: tells the shell when YouTube redirected away from
  // the TV app, or when the Leanback UI never rendered, so it can show the
  // native "status" window. See docs/plans/W2_LIVING_ROOM_PLAN.md. Emits at
  // most once per page load, and strips the query string/fragment from the
  // URL before sending (never a URL with a query string, per the no-PII
  // logging rule this bridge is held to).
  const initSurfaceDetection = () => {
    let emitted = false;

    const stripQueryAndHash = (href) => {
      try {
        const url = new URL(href);
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return String(href || "").split(/[?#]/)[0];
      }
    };

    const isYouTubeHost = (hostname) => {
      const host = String(hostname || "").toLowerCase();
      return host === "youtube.com" || host.endsWith(".youtube.com");
    };

    const hasLeanbackDom = () =>
      Boolean(document.querySelector('ytlr-app, [class*="ytlr-"], #app'));

    const checkSurface = () => {
      if (emitted) return;

      const hostname = window.location.hostname || "";
      const pathname = window.location.pathname || "";

      let kind = null;
      if (isYouTubeHost(hostname) && !pathname.startsWith("/tv")) {
        kind = "redirected";
      } else if (!hasLeanbackDom()) {
        kind = "blockedSurface";
      }
      if (!kind) return;

      const tauri = bridge();
      if (!tauri?.event?.emit) return;

      emitted = true;
      tauri.event
        .emit("lalin-cast-surface", {
          kind,
          url: stripQueryAndHash(window.location.href),
          title: String(document.title || "").slice(0, 200)
        })
        .catch(() => {});
    };

    window.addEventListener("load", checkSurface);
    window.setTimeout(checkSurface, 12000);
  };

  installBridge();
  initSurfaceDetection();
})();
