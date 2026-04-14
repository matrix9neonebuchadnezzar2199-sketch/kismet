(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-ui-unassociated-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_ui_unassociated_module = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
"use strict";

var exports = {};
var local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined") {
    local_uri_prefix = KISMET_URI_PREFIX;
}

function t(k, o) {
    if (typeof kismet_i18n !== "undefined" && kismet_i18n.t) return kismet_i18n.t(k, o);
    var ja = {
        "sidebar.unassociated_clients": "\u672a\u63a5\u7d9a\u30af\u30e9\u30a4\u30a2\u30f3\u30c8",
        "unassociated.title": "\u672a\u63a5\u7d9a\u30af\u30e9\u30a4\u30a2\u30f3\u30c8\uff08Probing Only\uff09",
        "whitelist.status": "\u627f\u8a8d\u72b6\u614b",
        "whitelist.select_all": "\u5168\u9078\u629e",
        "whitelist.selected_count": o && o.count != null ? o.count + "\u4ef6\u9078\u629e\u4e2d" : "0\u4ef6\u9078\u629e\u4e2d",
        "whitelist.add_bulk": "\u9078\u629e\u6a5f\u5668\u3092\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8\u306b\u767b\u9332",
        "whitelist.confirm_bulk_register": o && o.count != null ? o.count + "\u4ef6\u306e\u30c7\u30d0\u30a4\u30b9\u3092\u30db\u30ef\u30a4\u30c8\u30ea\u30b9\u30c8\u306b\u767b\u9332\u3057\u307e\u3059\u304b\uff1f" : "",
        "device_list.mac_address": "MAC\u30a2\u30c9\u30ec\u30b9",
        "device_list.manufacturer": "\u30e1\u30fc\u30ab\u30fc",
        "unassociated.probed_ssids": "\u63a2\u7d22\u4e2d\u306eSSID",
        "unassociated.signal_strength": "\u96fb\u6ce2\u5f37\u5ea6 (dBm)",
        "device_list.channel": "\u30c1\u30e3\u30f3\u30cd\u30eb",
        "device_list.last_seen": "\u6700\u7d42\u691c\u51fa",
        "device_list.packets": "\u30d1\u30b1\u30c3\u30c8\u6570",
        "signal_filter.device_count": (o&&o.visible||0)+" / "+(o&&o.total||0)+" \u4ef6\u8868\u793a\u4e2d",
        "signal_filter.show_all": "\u5168\u8868\u793a",
        "unassociated.no_devices": "\u672a\u63a5\u7d9a\u30af\u30e9\u30a4\u30a2\u30f3\u30c8\u306f\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f",
        "common.search": "\u691c\u7d22",
        "common.close": "\u9589\u3058\u308b",
        "common.yes": "\u306f\u3044",
        "common.no": "\u3044\u3044\u3048",
        "common.jspdf_missing": "jsPDF\u304c\u8aad\u307f\u8fbc\u307e\u308c\u3066\u3044\u307e\u305b\u3093\u3002",
        "common.select_rows_first": "\u4e00\u89a7\u304b\u30891\u4ef6\u4ee5\u4e0a\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
        "export.csv": "CSV\u51fa\u529b",
        "export.pdf": "PDF\u51fa\u529b",
        "settings.lang_en": "\u82f1\u8a9e",
        "settings.lang_ja": "\u65e5\u672c\u8a9e",
        "unassociated.auto_refresh_interval": "15\u79d2\u3054\u3068\u306b\u66f4\u65b0",
        "unassociated.broadcast_label": "\uff08\u30d6\u30ed\u30fc\u30c9\u30ad\u30e3\u30b9\u30c8\uff09",
        "unassociated.pdf_heading": "Kismet \u672a\u63a5\u7d9a\u30af\u30e9\u30a4\u30a2\u30f3\u30c8",
        "unassociated.export_signal_hdr": "\u96fb\u6ce2(dBm)",
        "signal_filter.above_60": "\u2267-60dBm\uff08\u540c\u5ba4\u76f8\u5f53\uff09",
        "signal_filter.above_70": "\u2267-70dBm",
        "signal_filter.above_80": "\u2267-80dBm"
    };
    return ja[k] || k;
}

var unassocPanel = null;
var unassocTable = null;
var allRows = [];
var refreshTimer = null;
var REFRESH_INTERVAL = 15000;

function isUnassociatedClient(dev) {
    var devType = dev["kismet.device.base.type"] || "";
    // Kismet labels this as "Wi-Fi Client"; also accept other *client* / ad-hoc types
    var isClientType = (devType === "Wi-Fi Client") ||
        devType.toLowerCase().indexOf("client") >= 0 ||
        devType.toLowerCase().indexOf("ad-hoc") >= 0;
    if (!isClientType) {
        return false;
    }
    var lastBssid = "";
    var dot11 = dev["dot11.device"];
    if (dot11) {
        lastBssid = dot11["dot11.device.last_bssid"] || "";
    }
    if (!lastBssid) lastBssid = dev["dot11.device.last_bssid"] || "";
    var isUnassoc = (!lastBssid || lastBssid === "00:00:00:00:00:00");
    var numAps = 0;
    if (dot11) numAps = dot11["dot11.device.num_client_aps"] || 0;
    if (!numAps) numAps = dev["dot11.device.num_client_aps"] || 0;
    return isUnassoc || numAps === 0;
}

function extractSignal(dev) {
    var sig = dev["kismet.device.base.signal"];
    if (sig && sig["kismet.common.signal.last_signal"] != null) {
        return parseFloat(sig["kismet.common.signal.last_signal"]);
    }
    if (dev["kismet.common.signal.last_signal"] != null) {
        return parseFloat(dev["kismet.common.signal.last_signal"]);
    }
    return null;
}

function extractProbedSsids(dev) {
    var dot11 = dev["dot11.device"] || dev;
    var m = dot11["dot11.device.probed_ssid_map"];
    if (!m) return t("unassociated.broadcast_label");
    var ssids = [];
    if (Array.isArray(m)) {
        for (var i = 0; i < m.length; i++) {
            var s = m[i]["dot11.probedssid.ssid"];
            if (s) ssids.push(s);
        }
    } else if (typeof m === "object") {
        var keys = Object.keys(m);
        for (var j = 0; j < keys.length; j++) {
            var entry = m[keys[j]];
            if (typeof entry === "object" && entry["dot11.probedssid.ssid"]) {
                ssids.push(entry["dot11.probedssid.ssid"]);
            } else if (typeof entry === "string") {
                ssids.push(entry);
            } else {
                ssids.push(keys[j]);
            }
        }
    }
    return ssids.length > 0 ? ssids.join(", ") : t("unassociated.broadcast_label");
}

function formatTime(epoch) {
    if (!epoch) return "";
    var d = new Date(epoch * 1000);
    return d.toLocaleString("ja-JP");
}

function mapRow(dev) {
    var mac = dev["kismet.device.base.macaddr"] || "";
    var wl = (typeof kismet_whitelist_api !== "undefined" && kismet_whitelist_api.isWhitelisted(mac));
    return {
        original_data: dev,
        device_key: dev["kismet.device.base.key"] || "",
        mac: mac,
        manuf: dev["kismet.device.base.manuf"] || "",
        probed: extractProbedSsids(dev),
        signal_dbm: extractSignal(dev),
        channel: dev["kismet.device.base.channel"] || "",
        last_seen: dev["kismet.device.base.last_time"] || 0,
        last_seen_fmt: formatTime(dev["kismet.device.base.last_time"]),
        packets: 0,
        approved: wl
    };
}

function fetchDevices() {
    return new Promise(function(resolve) {
        $.ajax({
            url: local_uri_prefix + "devices/views/phy-IEEE802.11/devices.json",
            method: "POST",
            contentType: "application/x-www-form-urlencoded",
            data: "json=" + encodeURIComponent(JSON.stringify({
                fields: [
                    "kismet.device.base.key",
                    "kismet.device.base.macaddr",
                    "kismet.device.base.name",
                    "kismet.device.base.manuf",
                    "kismet.device.base.type",
                    "kismet.device.base.last_time",
                    "kismet.device.base.first_time",
                    "kismet.device.base.signal",
                    "kismet.device.base.channel",
                    "kismet.device.base.frequency",
                    "dot11.device"
                ]
            })),
            success: function(data) {
                var raw = [];
                if (data && Array.isArray(data)) raw = data;
                else if (data && data.data && Array.isArray(data.data)) raw = data.data;
                else if (data && typeof data === "object") {
                    try { if (JSON.stringify(data).length > 2) raw = [data]; } catch(e) {}
                }
                if (typeof kismet !== "undefined" && kismet.sanitizeObject) {
                    raw = kismet.sanitizeObject(raw);
                }
                var out = [];
                for (var i = 0; i < raw.length; i++) {
                    if (isUnassociatedClient(raw[i])) out.push(raw[i]);
                }
                console.log("[unassociated] fetched " + raw.length +
                            " IEEE802.11 devices, " + out.length + " unassociated");
                resolve(out);
            },
            error: function(xhr, status, err) {
                console.warn("[unassociated] fetch failed:", status, err, "- trying fallback");
                $.ajax({
                    url: local_uri_prefix + "devices/views/all/devices.json",
                    method: "POST",
                    contentType: "application/x-www-form-urlencoded",
                    data: "json=" + encodeURIComponent(JSON.stringify({
                        fields: [
                            "kismet.device.base.key",
                            "kismet.device.base.macaddr",
                            "kismet.device.base.name",
                            "kismet.device.base.manuf",
                            "kismet.device.base.type",
                            "kismet.device.base.last_time",
                            "kismet.device.base.signal",
                            "kismet.device.base.channel",
                            "dot11.device"
                        ]
                    })),
                    success: function(data2) {
                        var raw2 = data2 && data2.data ? data2.data :
                                   (Array.isArray(data2) ? data2 : []);
                        if (typeof kismet !== "undefined" && kismet.sanitizeObject) {
                            raw2 = kismet.sanitizeObject(raw2);
                        }
                        var out2 = [];
                        for (var j = 0; j < raw2.length; j++) {
                            if (isUnassociatedClient(raw2[j])) out2.push(raw2[j]);
                        }
                        console.log("[unassociated] fallback: " + raw2.length +
                                    " total, " + out2.length + " unassociated");
                        resolve(out2);
                    },
                    error: function() {
                        console.error("[unassociated] all fetch attempts failed");
                        resolve([]);
                    }
                });
            }
        });
    });
}

var currentThreshold = null;

function createFilterBar(container) {
    var bar = $("<div>", { class: "signal-filter-bar" });
    var thresholds = [
        { val: -60, label: t("signal_filter.above_60") },
        { val: -70, label: t("signal_filter.above_70") },
        { val: -80, label: t("signal_filter.above_80") },
        { val: null, label: t("signal_filter.show_all") }
    ];
    thresholds.forEach(function(th) {
        var btn = $("<button>", {
            type: "button",
            class: "signal-filter-btn" + (th.val === currentThreshold ? " active" : "")
        }).text(th.label).on("click", function() {
            currentThreshold = th.val;
            bar.find(".signal-filter-btn").removeClass("active");
            $(this).addClass("active");
            applyFilter();
        });
        bar.append(btn);
    });
    container.append(bar);
}

function applyFilter() {
    if (!unassocTable) return;
    if (currentThreshold === null) {
        unassocTable.clearFilter();
    } else {
        unassocTable.setFilter(function(data) {
            return data.signal_dbm != null && data.signal_dbm >= currentThreshold;
        });
    }
    updateStatusBar();
}

function updateStatusBar() {
    if (!unassocTable) return;
    var total = allRows.length;
    var visible = unassocTable.getDataCount("active");
    $("#unassoc-status-bar").text(t("signal_filter.device_count", {
        visible: visible, total: total
    }));
}

function exportCSV() {
    if (!unassocTable) return;
    var data = unassocTable.getData("active");
    var BOM = "\uFEFF";
    var headers = [
        t("device_list.mac_address"),
        t("device_list.manufacturer"),
        t("unassociated.probed_ssids"),
        t("unassociated.export_signal_hdr"),
        t("device_list.channel"),
        t("device_list.last_seen"),
        t("whitelist.status")
    ];
    var lines = [BOM + headers.join(",")];
    data.forEach(function(r) {
        lines.push([
            r.mac, '"' + (r.manuf||"") + '"', '"' + (r.probed||"") + '"',
            r.signal_dbm || "", r.channel, r.last_seen_fmt || "",
            r.approved ? t("common.yes") : t("common.no")
        ].join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "unassociated_clients_" + Date.now() + ".csv";
    a.click();
}

function exportPDF() {
    if (typeof jspdf === "undefined" && typeof jsPDF === "undefined" &&
        typeof window.jspdf === "undefined") {
        alert(t("common.jspdf_missing"));
        return;
    }
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    var doc = new JsPDF();
    doc.setFontSize(14);
    doc.text(t("unassociated.pdf_heading"), 14, 20);
    doc.setFontSize(10);
    doc.text(new Date().toLocaleString("ja-JP"), 14, 28);
    var data = unassocTable ? unassocTable.getData("active") : [];
    var rows = data.map(function(r) {
        return [r.mac, r.manuf, r.probed, r.signal_dbm || "", r.channel,
                r.last_seen_fmt || "", r.approved ? t("common.yes") : t("common.no")];
    });
    if (typeof doc.autoTable === "function") {
        doc.autoTable({
            startY: 35,
            head: [[
                t("device_list.mac_address"),
                t("device_list.manufacturer"),
                t("unassociated.probed_ssids"),
                t("unassociated.export_signal_hdr"),
                t("device_list.channel"),
                t("device_list.last_seen"),
                t("whitelist.status")
            ]],
            body: rows,
            styles: { fontSize: 7 }
        });
    }
    doc.save("unassociated_clients_" + Date.now() + ".pdf");
}

function OpenUnassociatedPanel() {
    if (unassocPanel && typeof unassocPanel.front === "function") {
        try { unassocPanel.front(); return; } catch(e) {}
    }

    var root = $("<div>", { class: "unassoc-panel-root" });
    root.append($("<h3>", { class: "unassoc-title" }).text(t("unassociated.title")));

    var filterHost = $("<div>", { class: "unassoc-filter-host" });
    createFilterBar(filterHost);
    root.append(filterHost);

    var toolbar = $("<div>", { class: "unassoc-toolbar" });
    var searchInput = $("<input>", {
        type: "search", placeholder: t("common.search"), class: "unassoc-search"
    });
    toolbar.append(searchInput);
    toolbar.append($("<button>", { type: "button", class: "btn btn-export" }).text(t("export.csv")).on("click", exportCSV));
    toolbar.append($("<button>", { type: "button", class: "btn btn-export" }).text(t("export.pdf")).on("click", exportPDF));
    toolbar.append($("<span>", { class: "auto-refresh-indicator" })
        .text("\u21bb " + t("unassociated.auto_refresh_interval", { sec: 15 })));
    root.append(toolbar);

    root.append($("<div>", { id: "unassoc-status-bar", class: "unassoc-status" })
        .text(t("signal_filter.device_count", { visible: 0, total: 0 })));

    var tableDiv = $("<div>", { id: "unassoc-table-" + Date.now() });
    root.append(tableDiv);

    var bulkBar = $("<div>", { class: "unassoc-bulk-bar" });
    bulkBar.append($("<label>").append(
        $("<input>", { type: "checkbox", class: "unassoc-sel-all" })
    ).append($("<span>").text(" " + t("whitelist.select_all"))));
    bulkBar.append($("<span>", { class: "unassoc-sel-count" })
        .text(t("whitelist.selected_count", { count: 0 })));
    bulkBar.append($("<button>", { type: "button", class: "btn btn-register" })
        .text(t("whitelist.add_bulk")));
    root.append(bulkBar);

    var panelOpts = {
        headerTitle: "<i class='fa fa-wifi'></i> " + t("sidebar.unassociated_clients"),
        content: root,
        theme: "dark",
        onclosed: function() {
            if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
            unassocPanel = null;
            unassocTable = null;
        }
    };

    if (typeof $.jsPanel === "function") {
        panelOpts.width = Math.min($(window).width() * 0.92, 1200);
        panelOpts.height = $(window).height() * 0.85;
        unassocPanel = $.jsPanel(panelOpts);
    } else if (typeof jsPanel !== "undefined" && jsPanel.create) {
        panelOpts.panelSize = {
            width: Math.min($(window).width() * 0.92, 1200),
            height: $(window).height() * 0.85
        };
        unassocPanel = jsPanel.create(panelOpts);
    } else {
        var fallback = $("<div>", {
            class: "unassoc-fallback-panel",
            css: {
                position: "fixed", top: "5%", left: "4%",
                width: "92%", height: "85%",
                background: "#1a1a2e", color: "#eee",
                zIndex: 9999, overflow: "auto",
                borderRadius: "8px", padding: "20px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
            }
        });
        var closeBtn = $("<button>", {
            css: { position:"absolute", top:"10px", right:"10px",
                   background:"#e74c3c", color:"#fff", border:"none",
                   padding:"5px 12px", cursor:"pointer", borderRadius:"4px" }
        }).text(t("common.close")).on("click", function() {
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = null;
            fallback.remove();
            unassocPanel = null;
            unassocTable = null;
        });
        fallback.append(closeBtn).append(root);
        $("body").append(fallback);
        unassocPanel = fallback;
    }

    var tableId = tableDiv.attr("id");
    setTimeout(function() {
        function openUnassocSignalMonitorRow(row) {
            if (!row || typeof kismet_ui_signal_monitor === "undefined") {
                return;
            }
            var d = row.getData();
            kismet_ui_signal_monitor.OpenSignalMonitor(
                d.device_key, d.mac,
                (d.original_data && d.original_data["kismet.device.base.name"]) || "",
                d.manuf
            );
        }

        if (typeof Tabulator !== "undefined") {
            unassocTable = new Tabulator("#" + tableId, {
                layout: "fitColumns",
                selectable: true,
                placeholder: t("unassociated.no_devices"),
                columns: [
                    {
                        field: "approved", title: t("whitelist.status"), width: 80,
                        hozAlign: "center",
                        formatter: function(cell) {
                            return cell.getValue()
                                ? "<span style='color:#27ae60'><b>\u2713</b></span>"
                                : "<span style='color:#e67e22'><b>\u26a0</b></span>";
                        }
                    },
                    { field: "mac", title: t("device_list.mac_address"), width: 160 },
                    { field: "manuf", title: t("device_list.manufacturer"), width: 140 },
                    { field: "probed", title: t("unassociated.probed_ssids") },
                    {
                        field: "signal_dbm", title: t("unassociated.signal_strength"), width: 120,
                        hozAlign: "center",
                        formatter: function(cell) {
                            var v = cell.getValue();
                            if (v == null) return "--";
                            var color = v >= -50 ? "#27ae60" : (v >= -70 ? "#f1c40f" : "#e74c3c");
                            return "<span style='color:" + color + ";font-weight:bold'>" + v + "</span>";
                        }
                    },
                    { field: "channel", title: t("device_list.channel"), width: 80, hozAlign: "center" },
                    { field: "last_seen_fmt", title: t("device_list.last_seen"), width: 170 },
                    {
                        title: "\u96fb\u6ce2\u30e2\u30cb\u30bf\u30fc",
                        width: 100,
                        hozAlign: "center",
                        headerSort: false,
                        formatter: function () {
                            return "<button type=\"button\" class=\"btn btn-monitor\" style=\"padding:2px 8px;background:#3498db;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px\">\u25b6 \u76e3\u8996</button>";
                        },
                        cellClick: function (e, cell) {
                            e.stopPropagation();
                            var d = cell.getRow().getData();
                            console.log("[unassociated] monitor button clicked:", d.mac);
                            if (typeof kismet_ui_signal_monitor !== "undefined") {
                                openUnassocSignalMonitorRow(cell.getRow());
                            } else {
                                console.error("[unassociated] kismet_ui_signal_monitor not available");
                            }
                        }
                    }
                ]
            });
            // Tabulator 5: rowClick on constructor is unreliable; bind here (see docs/fork/2026-04-13開発LOG.md §4).
            unassocTable.on("rowClick", function (e, row) {
                var t = e.target;
                if (t && t.closest) {
                    if (t.closest(".btn-monitor") ||
                        t.closest("input[type='checkbox']") ||
                        t.closest(".tabulator-row-select-checkbox") ||
                        t.closest(".tabulator-row-header-select") ||
                        t.closest(".tabulator-row-header-select-checkbox")) {
                        return;
                    }
                }
                if (typeof kismet_ui_signal_monitor === "undefined") {
                    console.error("[unassociated] kismet_ui_signal_monitor not available");
                    return;
                }
                openUnassocSignalMonitorRow(row);
            });
        } else {
            console.warn("[unassociated] Tabulator not found, using HTML table");
            var ht = $("<table>", {
                id: "unassoc-html-table",
                css: { width: "100%", color: "#eee", borderCollapse: "collapse" }
            });
            var hr = $("<tr>");
            hr.append($("<th>").text(t("whitelist.status")));
            hr.append($("<th>").text(t("device_list.mac_address")));
            hr.append($("<th>").text(t("device_list.manufacturer")));
            hr.append($("<th>").text(t("unassociated.probed_ssids")));
            hr.append($("<th>").text(t("unassociated.export_signal_hdr")));
            hr.append($("<th>").text(t("device_list.channel")));
            hr.append($("<th>").text(t("device_list.last_seen")));
            ht.append($("<thead>").append(hr)).append($("<tbody>"));
            $("#" + tableId).append(ht);
        }

        searchInput.on("keyup", function() {
            var term = $(this).val().toLowerCase();
            if (unassocTable && unassocTable.setFilter) {
                if (!term) { applyFilter(); }
                else {
                    unassocTable.setFilter(function(data) {
                        var match = (data.mac + data.manuf + data.probed).toLowerCase().indexOf(term) >= 0;
                        if (currentThreshold !== null) {
                            return match && data.signal_dbm != null && data.signal_dbm >= currentThreshold;
                        }
                        return match;
                    });
                }
            }
        });

        bulkBar.find(".unassoc-sel-all").on("change", function() {
            if (!unassocTable) return;
            if (this.checked) unassocTable.selectRow();
            else unassocTable.deselectRow();
        });

        if (unassocTable) {
            unassocTable.on("rowSelected rowDeselected", function() {
                var n = unassocTable.getSelectedRows().length;
                bulkBar.find(".unassoc-sel-count")
                    .text(t("whitelist.selected_count", { count: n }));
            });
        }

        bulkBar.find(".btn-register").on("click", function() {
            if (!unassocTable) return;
            var sel = unassocTable.getSelectedData();
            if (!sel.length) { alert(t("common.select_rows_first")); return; }
            if (!confirm(t("whitelist.confirm_bulk_register", { count: sel.length }))) return;
            if (typeof kismet_whitelist_api !== "undefined") {
                var odList = sel.map(function (r) {
                    var od = r.original_data || {};
                    return {
                        mac: r.mac,
                        name: (od["kismet.device.base.name"] || r.manuf || r.mac || "").toString(),
                        category: "other",
                        notes: "unassociated-panel"
                    };
                });
                var res = kismet_whitelist_api.addBulkToWhitelist(odList);
                var msg = (typeof kismet_i18n !== "undefined" && kismet_i18n.t) ?
                    kismet_i18n.t("device_list.wl_bulk_done", {
                        added: res.added,
                        skipped: res.skipped.length
                    }) :
                    ("Added: " + res.added + ", skipped: " + res.skipped.length);
                try { alert(msg); } catch (eAl) { }
            }
            refreshData();
        });

        refreshData();
        refreshTimer = setInterval(function() {
            console.log("[unassociated] auto-refresh...");
            refreshData();
        }, REFRESH_INTERVAL);

    }, 300);
}

function refreshData() {
    fetchDevices().then(function(list) {
        allRows = list.map(mapRow);
        if (unassocTable && unassocTable.replaceData) {
            unassocTable.replaceData(allRows).then(function() { applyFilter(); });
        } else if (unassocTable && unassocTable.setData) {
            unassocTable.setData(allRows);
            applyFilter();
        } else {
            renderHtmlTable(allRows);
        }
        updateStatusBar();
    });
}

function renderHtmlTable(rows) {
    var tbody = $("#unassoc-html-table tbody");
    if (!tbody.length) return;
    tbody.empty();
    rows.forEach(function(r) {
        if (currentThreshold !== null && (r.signal_dbm == null || r.signal_dbm < currentThreshold)) return;
        var tr = $("<tr>", { css: { borderBottom: "1px solid #333" } });
        tr.append($("<td>").html(r.approved ? "\u2713" : "\u26a0"));
        tr.append($("<td>").text(r.mac));
        tr.append($("<td>").text(r.manuf));
        tr.append($("<td>").text(r.probed));
        tr.append($("<td>").text(r.signal_dbm || "--"));
        tr.append($("<td>").text(r.channel));
        tr.append($("<td>").text(r.last_seen_fmt));
        tr.css("cursor", "pointer").on("click", function () {
            if (typeof kismet_ui_signal_monitor !== "undefined") {
                kismet_ui_signal_monitor.OpenSignalMonitor(
                    r.device_key, r.mac,
                    r.original_data["kismet.device.base.name"] || "",
                    r.manuf
                );
            }
        });
        tbody.append(tr);
    });
}

/** Used by main device list kind filter (sidebar entry removed). */
exports.isUnassociatedClient = isUnassociatedClient;

exports.registerSidebar = function () {
    /* Unassociated clients are filtered on the main Devices tab; no separate sidebar item. */
};

return exports;
}));
