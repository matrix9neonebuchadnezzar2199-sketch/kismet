(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-ui-treeview-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_ui_treeview_module = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {

"use strict";

var exports = {};

var local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined") {
    local_uri_prefix = KISMET_URI_PREFIX;
}

var REFRESH_INTERVAL = 10000;
var TREE_JSPANEL_REF = "__kismetTreeViewJspanel";

var treePanel = null;
var treeRefreshTimer = null;
var treeMode = "band";
var treeContainer = null;
var treeStatusEl = null;
/** MAC (normalized) -> last device snapshot; entries are never removed while the tree panel is open. */
var treeDeviceCache = null;

var TREE_FIELDS = [
    "kismet.device.base.key",
    "kismet.device.base.macaddr",
    "kismet.device.base.type",
    "kismet.device.base.name",
    "kismet.device.base.manuf",
    "kismet.device.base.channel",
    "kismet.device.base.frequency",
    "kismet.device.base.signal",
    "dot11.device"
];

function t(key) {
    if (typeof kismet_i18n !== "undefined" && kismet_i18n.t) {
        var tr = kismet_i18n.t(key);
        if (tr && tr !== key) {
            return tr;
        }
    }
    return key;
}

function lsCollapseKey(kind, id) {
    return "kismet.treeview.collapse." + kind + "." + String(id).replace(/[^a-zA-Z0-9._:-]/g, "_");
}

function readCollapsed(kind, id, defaultCollapsed) {
    try {
        if (typeof localStorage === "undefined") {
            return defaultCollapsed;
        }
        var v = localStorage.getItem(lsCollapseKey(kind, id));
        if (v === "1") {
            return true;
        }
        if (v === "0") {
            return false;
        }
    } catch (e) {
        /* ignore */
    }
    return defaultCollapsed;
}

function writeCollapsed(kind, id, collapsed) {
    try {
        if (typeof localStorage === "undefined") {
            return;
        }
        localStorage.setItem(lsCollapseKey(kind, id), collapsed ? "1" : "0");
    } catch (e) {
        /* ignore */
    }
}

function normalizeMac(m) {
    if (m == null || m === "") {
        return "";
    }
    return String(m).trim().toUpperCase().replace(/-/g, ":");
}

function getDot11(dev) {
    return dev && dev["dot11.device"] ? dev["dot11.device"] : {};
}

function getLastBssid(dev) {
    var d11 = getDot11(dev);
    var b = d11["dot11.device.last_bssid"] || dev["dot11.device.last_bssid"] || "";
    return normalizeMac(b);
}

function getApSsid(dev) {
    var d11 = getDot11(dev);
    var rec = d11["dot11.device.last_beaconed_ssid_record"] || {};
    var adv = rec["dot11.advertisedssid"] || {};
    var ssid = adv["dot11.advertisedssid.ssid"] || adv["ssid"];
    if (ssid != null && String(ssid).trim() !== "") {
        return String(ssid).trim();
    }
    return "";
}

function extractDbm(dev) {
    if (!dev) {
        return null;
    }
    var v = dev["kismet.common.signal.last_signal"];
    if (v != null) {
        return parseFloat(v);
    }
    var sig = dev["kismet.device.base.signal"];
    if (typeof sig === "number") {
        return parseFloat(sig);
    }
    if (sig && typeof sig === "object" && sig["kismet.common.signal.last_signal"] != null) {
        return parseFloat(sig["kismet.common.signal.last_signal"]);
    }
    return null;
}

function signalClass(dbm) {
    if (dbm == null || isNaN(dbm)) {
        return "";
    }
    if (dbm >= -50) {
        return "signal-green";
    }
    if (dbm >= -70) {
        return "signal-yellow";
    }
    return "signal-red";
}

function formatDbm(dbm) {
    if (dbm == null || isNaN(dbm)) {
        return "--";
    }
    return String(Math.round(dbm)) + "dBm";
}

function getBand(frequency) {
    var f = parseInt(frequency, 10) || 0;
    if (f >= 5925000) {
        return "802.11ax (6GHz)";
    }
    if (f >= 5000000) {
        return "802.11a/ac (5GHz)";
    }
    if (f >= 2400000) {
        return "802.11b/g/n (2.4GHz)";
    }
    return t("treeview.unknown_band");
}

function getBandId(frequency) {
    var f = parseInt(frequency, 10) || 0;
    if (f >= 5925000) {
        return "6g";
    }
    if (f >= 5000000) {
        return "5g";
    }
    if (f >= 2400000) {
        return "24g";
    }
    return "unknown";
}

function isAp(dev) {
    return (dev["kismet.device.base.type"] || "") === "Wi-Fi AP";
}

function isClientLike(dev) {
    var typ = dev["kismet.device.base.type"] || "";
    return typ === "Wi-Fi Client" || typ === "Wi-Fi Bridged";
}

function isZeroBssid(b) {
    return !b || b === "00:00:00:00:00:00";
}

function parseDeviceListResponse(data) {
    if (!data) {
        return [];
    }
    if (Array.isArray(data)) {
        return data;
    }
    if (data.data && Array.isArray(data.data)) {
        return data.data;
    }
    return [];
}

function fetchTreeDevices(cb) {
    var url = local_uri_prefix + "devices/views/phy-IEEE802.11/devices.json";
    var payload = { fields: TREE_FIELDS };
    $.ajax({
        url: url,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        data: "json=" + encodeURIComponent(JSON.stringify(payload)) + "&page=0&length=50000",
        success: function (data) {
            var raw = parseDeviceListResponse(data);
            if (typeof kismet !== "undefined" && kismet.sanitizeObject) {
                raw = kismet.sanitizeObject(raw);
            }
            cb(null, raw);
        },
        error: function (xhr, st, err) {
            cb(st || err || "error", []);
        }
    });
}

function buildApClientModel(devices) {
    var apByMac = {};
    var aps = [];
    var clients = [];
    var i;
    for (i = 0; i < devices.length; i++) {
        var d = devices[i];
        if (!d) {
            continue;
        }
        if (isAp(d)) {
            var mac = normalizeMac(d["kismet.device.base.macaddr"] || "");
            if (!mac) {
                continue;
            }
            var apNode = {
                dev: d,
                mac: mac,
                children: []
            };
            apByMac[mac] = apNode;
            aps.push(apNode);
        } else if (isClientLike(d)) {
            clients.push(d);
        }
    }
    var unassoc = [];
    for (i = 0; i < clients.length; i++) {
        var c = clients[i];
        var lb = getLastBssid(c);
        if (isZeroBssid(lb)) {
            unassoc.push(c);
            continue;
        }
        var parent = apByMac[lb];
        if (parent) {
            parent.children.push(c);
        } else {
            unassoc.push(c);
        }
    }
    return { aps: aps, unassoc: unassoc, apByMac: apByMac };
}

function apClientCount(apNode) {
    var d11 = getDot11(apNode.dev);
    var n = d11["dot11.device.num_associated_clients"];
    if (n != null && !isNaN(parseInt(n, 10))) {
        return parseInt(n, 10);
    }
    return apNode.children.length;
}

function openMonitorForDev(dev) {
    if (typeof kismet_ui_signal_monitor === "undefined" || !kismet_ui_signal_monitor.OpenSignalMonitor) {
        return;
    }
    var key = dev["kismet.device.base.key"] || "";
    var mac = normalizeMac(dev["kismet.device.base.macaddr"] || "");
    var name = (dev["kismet.device.base.name"] || dev["kismet.device.base.commonname"] || "").toString();
    var manuf = (dev["kismet.device.base.manuf"] || "").toString();
    kismet_ui_signal_monitor.OpenSignalMonitor(key, mac, name, manuf);
}

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function resetTreeDeviceCache() {
    treeDeviceCache = {};
}

function mergeTreeDevicesFromFetch(freshList) {
    if (!treeDeviceCache) {
        treeDeviceCache = {};
    }
    var i;
    for (i = 0; i < freshList.length; i++) {
        var d = freshList[i];
        if (!d) {
            continue;
        }
        var mac = normalizeMac(d["kismet.device.base.macaddr"] || "");
        if (!mac) {
            continue;
        }
        treeDeviceCache[mac] = d;
    }
}

function getMergedDeviceList() {
    if (!treeDeviceCache) {
        return [];
    }
    var out = [];
    var k;
    for (k in treeDeviceCache) {
        if (Object.prototype.hasOwnProperty.call(treeDeviceCache, k)) {
            out.push(treeDeviceCache[k]);
        }
    }
    return out;
}

function isMacWhitelisted(mac) {
    if (typeof kismet_whitelist_api === "undefined" || !kismet_whitelist_api.isWhitelisted) {
        return false;
    }
    return kismet_whitelist_api.isWhitelisted(mac);
}

function renderWhitelistBadgeHtml(mac) {
    if (!isMacWhitelisted(mac)) {
        return "";
    }
    return "<span class=\"tree-wl-badge\" title=\"" + esc(t("whitelist.safe_tag_title")) + "\">" +
        "<i class=\"fa fa-shield\"></i> " + esc(t("whitelist.safe_tag")) + "</span>";
}

function renderMonitorBtn(dev) {
    return "<button type=\"button\" class=\"btn btn-xs tree-btn-monitor\" data-device-mac=\"" +
        esc(normalizeMac(dev["kismet.device.base.macaddr"])) + "\">" +
        esc(t("treeview.monitor")) + "</button>";
}

function renderClientRow(dev) {
    var mac = normalizeMac(dev["kismet.device.base.macaddr"] || "");
    var manuf = (dev["kismet.device.base.manuf"] || "").toString();
    var dbm = extractDbm(dev);
    var sc = signalClass(dbm);
    var sigSpan = "<span class=\"" + esc(sc) + "\">" + esc(formatDbm(dbm)) + "</span>";
    var wl = renderWhitelistBadgeHtml(mac);
    var rowCls = "tree-client" + (isMacWhitelisted(mac) ? " tree-client--wl" : "");
    return $("<div>", { class: rowCls, "data-mac": mac }).html(
        "<span class=\"tree-client-label\"><i class=\"fa fa-mobile\"></i> " +
        esc(mac) + (manuf ? " (" + esc(manuf) + ")" : "") + "</span> " +
        wl + " " + sigSpan + " " + renderMonitorBtn(dev)
    );
}

function renderApBlock(apNode, bandId) {
    var dev = apNode.dev;
    var mac = apNode.mac;
    var ssid = getApSsid(dev);
    if (!ssid) {
        ssid = t("treeview.no_ssid");
    }
    var dbm = extractDbm(dev);
    var sc = signalClass(dbm);
    var nChild = apClientCount(apNode);
    var apId = (bandId ? bandId + "." : "s.") + mac;
    var apCollapsed = readCollapsed("ap", apId, false);
    var wrap = $("<div>", { class: "tree-ap-wrap", "data-ap-mac": mac });
    var apCls = "tree-ap" + (isMacWhitelisted(mac) ? " tree-ap--wl" : "");
    var head = $("<div>", { class: apCls, tabindex: 0 });
    var toggle = $("<span>", {
        class: "tree-toggle",
        text: apCollapsed ? "\u25b6" : "\u25bc"
    });
    var wlAp = renderWhitelistBadgeHtml(mac);
    var title = $("<span>", { class: "tree-ap-title" }).html(
        "<i class=\"fa fa-wifi\"></i> " + esc(ssid) + " <span class=\"tree-mac\">(" + esc(mac) + ")</span>" +
        " <span class=\"tree-meta\">[" + esc(t("treeview.clients")) + ": " + nChild + "]</span> " +
        wlAp + " " +
        "<span class=\"" + esc(sc) + "\">" + esc(formatDbm(dbm)) + "</span> " +
        renderMonitorBtn(dev)
    );
    head.append(toggle).append(title);
    var body = $("<div>", { class: "tree-ap-children" });
    if (apCollapsed) {
        body.hide();
    }
    var j;
    for (j = 0; j < apNode.children.length; j++) {
        body.append(renderClientRow(apNode.children[j]));
    }
    head.on("click", function (ev) {
        if ($(ev.target).closest(".tree-btn-monitor").length) {
            return;
        }
        body.slideToggle(120);
        var nowHidden = !body.is(":visible");
        toggle.text(nowHidden ? "\u25b6" : "\u25bc");
        writeCollapsed("ap", apId, nowHidden);
    });
    wrap.append(head).append(body);
    return wrap;
}

function renderUnassocSection(rows) {
    var sec = $("<div>", { class: "tree-unassoc-wrap" });
    var head = $("<div>", { class: "tree-band-header tree-unassoc-header" });
    var uCollapsed = readCollapsed("unassoc", "global", false);
    var toggle = $("<span>", { class: "tree-toggle", text: uCollapsed ? "\u25b6" : "\u25bc" });
    head.append(toggle).append($("<span>").text(t("treeview.unassociated")));
    var body = $("<div>", { class: "tree-unassoc-body" });
    if (uCollapsed) {
        body.hide();
    }
    head.on("click", function () {
        body.slideToggle(120);
        var nowHidden = !body.is(":visible");
        toggle.text(nowHidden ? "\u25b6" : "\u25bc");
        writeCollapsed("unassoc", "global", nowHidden);
    });
    var i;
    for (i = 0; i < rows.length; i++) {
        body.append(renderClientRow(rows[i]));
    }
    sec.append(head).append(body);
    return sec;
}

function renderBandMode(model) {
    var root = $("<div>", { class: "tree-container" });
    var bands = {};
    var order = ["6g", "5g", "24g", "unknown"];
    var bi;
    for (bi = 0; bi < model.aps.length; bi++) {
        var apn = model.aps[bi];
        var freq = apn.dev["kismet.device.base.frequency"] || 0;
        var bid = getBandId(freq);
        if (!bands[bid]) {
            bands[bid] = { label: getBand(freq), aps: [] };
        }
        bands[bid].aps.push(apn);
    }
    var oi;
    for (oi = 0; oi < order.length; oi++) {
        var id = order[oi];
        if (!bands[id]) {
            continue;
        }
        var b = bands[id];
        var bCollapsed = readCollapsed("band", id, false);
        var bandWrap = $("<div>", { class: "tree-band", "data-band": id });
        var bhead = $("<div>", { class: "tree-band-header" });
        var btog = $("<span>", { class: "tree-toggle", text: bCollapsed ? "\u25b6" : "\u25bc" });
        bhead.append(btog).append($("<span>").text(b.label));
        var bbody = $("<div>", { class: "tree-band-body" });
        if (bCollapsed) {
            bbody.hide();
        }
        var ai;
        for (ai = 0; ai < b.aps.length; ai++) {
            bbody.append(renderApBlock(b.aps[ai], id));
        }
        bhead.on("click", function (bw, bb, tg) {
            return function () {
                bb.slideToggle(120);
                var nh = !bb.is(":visible");
                tg.text(nh ? "\u25b6" : "\u25bc");
                writeCollapsed("band", bw.attr("data-band"), nh);
            };
        }(bandWrap, bbody, btog));
        bandWrap.append(bhead).append(bbody);
        root.append(bandWrap);
    }
    root.append(renderUnassocSection(model.unassoc));
    return root;
}

function renderSimpleMode(model) {
    var root = $("<div>", { class: "tree-container" });
    var i;
    for (i = 0; i < model.aps.length; i++) {
        root.append(renderApBlock(model.aps[i], ""));
    }
    var sep = $("<div>", { class: "tree-simple-unassoc-sep" }).text(t("treeview.unassociated"));
    root.append(sep);
    var j;
    for (j = 0; j < model.unassoc.length; j++) {
        root.append(renderClientRow(model.unassoc[j]));
    }
    return root;
}

function bindMonitorButtons($root, devices) {
    var byMac = {};
    var i;
    for (i = 0; i < devices.length; i++) {
        var d = devices[i];
        if (!d) {
            continue;
        }
        var m = normalizeMac(d["kismet.device.base.macaddr"] || "");
        if (m) {
            byMac[m] = d;
        }
    }
    $root.find(".tree-btn-monitor").off("click").on("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var mac = normalizeMac($(this).attr("data-device-mac") || "");
        var dev = byMac[mac];
        if (dev) {
            openMonitorForDev(dev);
        }
    });
}

function renderTreeIntoContainer(model) {
    if (!treeContainer || !treeContainer.length) {
        return;
    }
    treeContainer.empty();
    if (treeMode === "band") {
        treeContainer.append(renderBandMode(model));
    } else {
        treeContainer.append(renderSimpleMode(model));
    }
    bindMonitorButtons(treeContainer, getMergedDeviceList());
}

function rerenderTreeFromCacheOnly() {
    if (!treeContainer || !treeContainer.length || !treeDeviceCache) {
        return;
    }
    var model = buildApClientModel(getMergedDeviceList());
    renderTreeIntoContainer(model);
}

function refreshTreeUi() {
    if (!treeContainer || !treeContainer.length) {
        return;
    }
    fetchTreeDevices(function (err, list) {
        var mergedLen = treeDeviceCache ? Object.keys(treeDeviceCache).length : 0;
        if (treeStatusEl && treeStatusEl.length) {
            if (err) {
                treeStatusEl.text(String(err));
            } else {
                treeStatusEl.text(t("treeview.status_poll", {
                    live: list.length,
                    total: mergedLen
                }));
            }
        }
        if (err) {
            treeContainer.empty().append($("<div>", { class: "tree-error" }).text(String(err)));
            return;
        }
        mergeTreeDevicesFromFetch(list);
        mergedLen = Object.keys(treeDeviceCache).length;
        if (treeStatusEl && treeStatusEl.length) {
            treeStatusEl.text(t("treeview.status_poll", {
                live: list.length,
                total: mergedLen
            }));
        }
        var model = buildApClientModel(getMergedDeviceList());
        renderTreeIntoContainer(model);
    });
}

function OpenTreeViewPanel() {
    var existing = (typeof window !== "undefined") ? window[TREE_JSPANEL_REF] : null;
    if (existing && typeof existing.front === "function") {
        try {
            existing.front();
            return;
        } catch (e0) {
            /* continue */
        }
    }

    resetTreeDeviceCache();

    var root = $("<div>", { class: "treeview-panel-root" });
    var toolbar = $("<div>", { class: "treeview-toolbar" });
    var btnBand = $("<button>", { type: "button", class: "btn tree-mode-btn" }).text(t("treeview.band_mode"));
    var btnSimple = $("<button>", { type: "button", class: "btn tree-mode-btn" }).text(t("treeview.simple_mode"));
    toolbar.append(btnBand).append(btnSimple);
    treeStatusEl = $("<span>", { class: "treeview-status" });
    toolbar.append(treeStatusEl);
    root.append(toolbar);

    treeContainer = $("<div>", { class: "tree-scroll-host" });
    root.append(treeContainer);

    function setMode(mode) {
        treeMode = mode;
        btnBand.toggleClass("active", mode === "band");
        btnSimple.toggleClass("active", mode === "simple");
        refreshTreeUi();
    }
    btnBand.on("click", function () { setMode("band"); });
    btnSimple.on("click", function () { setMode("simple"); });
    setMode(treeMode);

    var panelOpts = {
        headerTitle: "<i class=\"fa fa-sitemap\"></i> " + t("treeview.title"),
        content: root,
        theme: "dark",
        onclosed: function () {
            if (treeRefreshTimer) {
                clearInterval(treeRefreshTimer);
                treeRefreshTimer = null;
            }
            if (typeof window !== "undefined") {
                window[TREE_JSPANEL_REF] = null;
            }
            treeDeviceCache = null;
            treePanel = null;
            treeContainer = null;
            treeStatusEl = null;
        }
    };

    if (typeof $.jsPanel === "function") {
        panelOpts.width = Math.min($(window).width() * 0.92, 1100);
        panelOpts.height = $(window).height() * 0.85;
        treePanel = $.jsPanel(panelOpts);
    } else if (typeof jsPanel !== "undefined" && jsPanel.create) {
        panelOpts.panelSize = {
            width: Math.min($(window).width() * 0.92, 1100),
            height: $(window).height() * 0.85
        };
        treePanel = jsPanel.create(panelOpts);
    } else {
        treePanel = null;
        return;
    }
    if (typeof window !== "undefined" && treePanel) {
        window[TREE_JSPANEL_REF] = treePanel;
    }

    treeRefreshTimer = setInterval(refreshTreeUi, REFRESH_INTERVAL);
}

exports.registerSidebar = function () {
    if (typeof kismet_ui_sidebar === "undefined") {
        return;
    }
    kismet_ui_sidebar.AddSidebarItem({
        id: "tree_view",
        listTitle: "<i class=\"fa fa-sitemap\"></i> " + t("sidebar.tree_view"),
        priority: -7,
        clickCallback: OpenTreeViewPanel
    });
};

exports.getBand = getBand;
exports.REFRESH_INTERVAL = REFRESH_INTERVAL;

var treeWhitelistListenerAttached = false;
(function attachWhitelistTreeListener() {
    if (typeof document === "undefined" || treeWhitelistListenerAttached) {
        return;
    }
    try {
        treeWhitelistListenerAttached = true;
        document.addEventListener("kismet-whitelist-changed", function () {
            rerenderTreeFromCacheOnly();
        });
    } catch (eAtt) {
        treeWhitelistListenerAttached = false;
    }
})();

return exports;

}));
