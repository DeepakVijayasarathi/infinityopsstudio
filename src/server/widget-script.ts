/**
 * The embeddable website script served at /widget.js:
 *   <script src="https://YOUR-APP/widget.js" data-key="pk_…" defer></script>
 *
 * - counts page views (no cookies; single-page apps included) and exposes InfinityOps.track("conversion")
 * - sends <form data-infinityops> submissions to Leads
 * - renders the AI chat widget inside a shadow root so the host site's CSS can't break it
 * All visitor-facing text is inserted with textContent (never innerHTML) to prevent XSS.
 */
export const WIDGET_SCRIPT = String.raw`(function () {
  "use strict";
  if (window.InfinityOps && window.InfinityOps.__loaded) return;
  var script = document.currentScript || document.querySelector('script[src*="/widget.js"][data-key]');
  if (!script) return;
  var KEY = script.getAttribute("data-key");
  var BASE = new URL(script.src).origin;
  var NO_CHAT = script.getAttribute("data-chat") === "off";
  if (!KEY) { console.warn("InfinityOps: add data-key to the widget script tag"); return; }

  function vid() {
    try {
      var v = localStorage.getItem("ios_vid");
      if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, ""); localStorage.setItem("ios_vid", v); }
      return v;
    } catch (e) { return "anon" + Math.random().toString(36).slice(2, 12); }
  }
  var VISITOR = vid();
  // Who the visitor is, once they've filled in a form — so their chats show their name.
  function contact() { try { return JSON.parse(localStorage.getItem("ios_contact") || "{}"); } catch (e) { return {}; } }
  var qs = new URLSearchParams(location.search);
  var UTM = { utmSource: qs.get("utm_source"), utmCampaign: qs.get("utm_campaign") };
  try {
    if (UTM.utmSource) sessionStorage.setItem("ios_utm", JSON.stringify(UTM));
    else UTM = JSON.parse(sessionStorage.getItem("ios_utm") || "null") || UTM;
  } catch (e) {}

  function post(path, body) {
    return fetch(BASE + "/api/public/" + path + "/" + encodeURIComponent(KEY), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true, credentials: "omit" })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.error && j.error.message) || "Request failed"); return j.data; }); });
  }

  // ── Tracking ──
  var lastUrl = "";
  function pageview() {
    if (location.href === lastUrl) return;
    var ref = lastUrl || document.referrer || null;
    lastUrl = location.href;
    post("track", { type: "pageview", url: location.href, referrer: ref, utmSource: UTM.utmSource, utmCampaign: UTM.utmCampaign, landingPageId: script.getAttribute("data-page") }).catch(function () {});
  }
  function conversion() { return post("track", { type: "conversion", url: location.href, utmSource: UTM.utmSource, utmCampaign: UTM.utmCampaign, landingPageId: script.getAttribute("data-page") }).catch(function () {}); }
  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () { var r = orig.apply(this, arguments); setTimeout(pageview, 0); return r; };
  });
  window.addEventListener("popstate", pageview);

  // ── Forms → Leads ──
  function bindForms(root) {
    (root.querySelectorAll ? root.querySelectorAll("form[data-infinityops]") : []).forEach(function (form) {
      if (form.__ios) return;
      form.__ios = true;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var get = function (n) { var v = fd.get(n); return v ? String(v) : null; };
        var btn = form.querySelector('[type="submit"]');
        if (btn) btn.disabled = true;
        post("lead", { name: get("name") || [get("first_name"), get("last_name")].filter(Boolean).join(" ") || null, email: get("email") || "", phone: get("phone"), company: get("company"), message: get("message"), website: get("website") || undefined, page: location.href, landingPageId: form.getAttribute("data-page") || script.getAttribute("data-page"), utmSource: UTM.utmSource, utmCampaign: UTM.utmCampaign })
          .then(function () {
            try { if (get("email")) localStorage.setItem("ios_contact", JSON.stringify({ name: get("name"), email: get("email") })); } catch (e) {}
            var ok = document.createElement("p");
            ok.textContent = form.getAttribute("data-success") || "Thanks! We'll be in touch shortly.";
            ok.setAttribute("role", "status");
            ok.style.cssText = "padding:12px 0;font-weight:600";
            form.replaceWith(ok);
            form.dispatchEvent(new CustomEvent("infinityops:lead", { bubbles: true }));
          })
          .catch(function (err) {
            if (btn) btn.disabled = false;
            var msg = form.querySelector("[data-infinityops-error]") || document.createElement("p");
            msg.setAttribute("data-infinityops-error", "");
            msg.setAttribute("role", "alert");
            msg.style.color = "#c62828";
            msg.textContent = err.message;
            if (!msg.parentNode) form.appendChild(msg);
          });
      });
    });
  }

  // ── Chat widget ──
  function chatWidget(cfg) {
    var host = document.createElement("div");
    host.id = "infinityops-chat";
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    var side = cfg.position === "left" ? "left" : "right";
    var accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accentColor) ? cfg.accentColor : "#1f5cf5";
    var css = document.createElement("style");
    css.textContent =
      ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".btn{position:fixed;bottom:20px;" + side + ":20px;width:56px;height:56px;border-radius:50%;border:0;background:" + accent + ";color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:2147483646;display:grid;place-items:center}" +
      ".btn svg{width:26px;height:26px}" +
      ".panel{position:fixed;bottom:88px;" + side + ":20px;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);background:#fff;color:#111827;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.22);z-index:2147483647;display:none;flex-direction:column;overflow:hidden}" +
      ".panel.open{display:flex}.head{background:" + accent + ";color:#fff;padding:14px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}" +
      ".head button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
      ".msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}" +
      ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
      ".me{align-self:flex-end;background:" + accent + ";color:#fff;border-bottom-right-radius:4px}.them{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}" +
      ".team{font-size:11px;color:#6b7280;margin:2px 4px}" +
      "form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}" +
      "input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:10px 12px;font-size:14px;outline:none;color:#111827;background:#fff}input:focus{border-color:" + accent + "}" +
      "form button{border:0;border-radius:10px;background:" + accent + ";color:#fff;padding:0 14px;font-weight:600;cursor:pointer}form button:disabled{opacity:.5}" +
      ".foot{text-align:center;font-size:10px;color:#9ca3af;padding:0 0 8px;background:#fff}.typing{font-size:12px;color:#6b7280;padding:0 4px}";
    root.appendChild(css);

    var btn = document.createElement("button");
    btn.className = "btn";
    btn.setAttribute("aria-label", "Chat with us");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat");
    var head = document.createElement("div");
    head.className = "head";
    var title = document.createElement("span");
    title.textContent = cfg.companyName || "Chat";
    var close = document.createElement("button");
    close.setAttribute("aria-label", "Close chat");
    close.textContent = "×";
    head.appendChild(title);
    head.appendChild(close);
    var msgs = document.createElement("div");
    msgs.className = "msgs";
    msgs.setAttribute("aria-live", "polite");
    var form = document.createElement("form");
    var input = document.createElement("input");
    input.placeholder = "Type your message…";
    input.setAttribute("aria-label", "Message");
    input.maxLength = 2000;
    var send = document.createElement("button");
    send.type = "submit";
    send.textContent = "Send";
    form.appendChild(input);
    form.appendChild(send);
    var foot = document.createElement("div");
    foot.className = "foot";
    foot.textContent = "AI assistant · a person can take over any time";
    panel.appendChild(head);
    panel.appendChild(msgs);
    panel.appendChild(form);
    panel.appendChild(foot);
    root.appendChild(btn);
    root.appendChild(panel);

    var seen = {};
    var lastId = null;
    var pollTimer = null;
    function add(m) {
      if (seen[m.id]) return;
      seen[m.id] = true;
      lastId = m.id;
      if (m.from === "team") { var t = document.createElement("div"); t.className = "team"; t.textContent = "Team"; msgs.appendChild(t); }
      var el = document.createElement("div");
      el.className = "m " + (m.from === "visitor" ? "me" : "them");
      el.textContent = m.body;
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
    }
    function greet() { if (!msgs.childNodes.length) add({ id: "greeting", from: "assistant", body: cfg.greeting }); }
    function poll() {
      fetch(BASE + "/api/public/chat/" + encodeURIComponent(KEY) + "?visitorId=" + encodeURIComponent(VISITOR) + (lastId && lastId !== "greeting" ? "&after=" + encodeURIComponent(lastId) : ""), { credentials: "omit" })
        .then(function (r) { return r.json(); }).then(function (j) { (j.data && j.data.messages || []).forEach(add); }).catch(function () {});
    }
    function open(state) {
      panel.classList.toggle("open", state);
      btn.setAttribute("aria-expanded", String(state));
      if (state) { greet(); poll(); input.focus(); clearInterval(pollTimer); pollTimer = setInterval(poll, 6000); }
      else clearInterval(pollTimer);
    }
    btn.addEventListener("click", function () { open(!panel.classList.contains("open")); });
    close.addEventListener("click", function () { open(false); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      send.disabled = true;
      var typing = document.createElement("div");
      typing.className = "typing";
      typing.textContent = "Typing…";
      var tempId = "tmp" + Date.now();
      add({ id: tempId, from: "visitor", body: text });
      msgs.appendChild(typing);
      post("chat", { visitorId: VISITOR, message: text, page: location.href, name: contact().name || null, email: contact().email || null })
        .then(function (d) { (d.messages || []).forEach(function (m) { if (m.from === "visitor") seen[m.id] = true; else add(m); }); })
        .catch(function (err) { add({ id: "err" + Date.now(), from: "assistant", body: err.message || "Sorry, something went wrong. Please try again." }); })
        .then(function () { typing.remove(); send.disabled = false; input.focus(); });
    });
  }

  function start() {
    pageview();
    bindForms(document);
    new MutationObserver(function (list) { list.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) bindForms(n.parentNode || n); }); }); }).observe(document.body, { childList: true, subtree: true });
    if (!NO_CHAT) {
      fetch(BASE + "/api/public/widget/" + encodeURIComponent(KEY), { credentials: "omit" })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j.data && j.data.chatEnabled) chatWidget(j.data); })
        .catch(function () {});
    }
  }

  window.InfinityOps = { __loaded: true, track: function (type) { if (type === "conversion") return conversion(); pageview(); }, visitorId: VISITOR };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
`;
