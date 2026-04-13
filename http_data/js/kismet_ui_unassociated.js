(
    typeof define === "function" ? function (m) { define("kismet-ui-unassociated-js", m); } :
    typeof exports === "object" ? function (m) { module.exports = m(); } :
    function (m) { this.kismet_ui_unassociated_module = m(); }
)(function () {
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
        "common.search": "\u691c\u7d22"
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
    if (!m) return "(broadcast)";
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
    return ssids.length > 0 ? ssids.join(", ") : "(broadcast)";
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
        { val: -60, label: "\u2265-60dBm" },
        { val: -70, label: "\u2265-70dBm" },
        { val: -80, label: "\u2265-80dBm" },
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
    var headers = ["MAC","Manufacturer","Probed SSIDs","Signal(dBm)","Channel","Last Seen","Whitelist"];
    var lines = [BOM + headers.join(",")];
    data.forEach(function(r) {
        lines.push([
            r.mac, '"' + (r.manuf||"") + '"', '"' + (r.probed||"") + '"',
            r.signal_dbm || "", r.channel, r.last_seen_fmt || "",
            r.approved ? "Yes" : "No"
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
        alert("jsPDF not loaded");
        return;
    }
    var JsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    var doc = new JsPDF();
    doc.setFontSize(14);
    doc.text("Kismet - " + t("unassociated.title"), 14, 20);
    doc.setFontSize(10);
    doc.text(new Date().toLocaleString("ja-JP"), 14, 28);
    var data = unassocTable ? unassocTable.getData("active") : [];
    var rows = data.map(function(r) {
        return [r.mac, r.manuf, r.probed, r.signal_dbm || "", r.channel,
                r.last_seen_fmt || "", r.approved ? "O" : "X"];
    });
    if (typeof doc.autoTable === "function") {
        doc.autoTable({
            startY: 35,
            head: [["MAC","Manufacturer","Probed SSIDs","Signal","CH","Last Seen","WL"]],
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
    toolbar.append($("<button>", { type: "button", class: "btn btn-export" }).text("CSV").on("click", exportCSV));
    toolbar.append($("<button>", { type: "button", class: "btn btn-export" }).text("PDF").on("click", exportPDF));
    toolbar.append($("<span>", { class: "auto-refresh-indicator" }).html("&#x21bb; 15s"));
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
        }).text("X").on("click", function() {
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
                    { field: "last_seen_fmt", title: t("device_list.last_seen"), width: 170 }
                ],
                rowClick: function(e, row) {
                    if ($(e.target).is("input")) return;
                    var d = row.getData();
                    if (typeof kismet_ui_signal_monitor !== "undefined") {
                        kismet_ui_signal_monitor.OpenSignalMonitor(
                            d.device_key, d.mac,
                            d.original_data["kismet.device.base.name"] || "",
                            d.manuf
                        );
                    }
                }
            });
        } else {
            console.warn("[unassociated] Tabulator not found, using HTML table");
            $("#" + tableId).html("<table id='unassoc-html-table' style='width:100%;color:#eee;border-collapse:collapse'>" +
                "<thead><tr><th>WL</th><th>MAC</th><th>Manufacturer</th><th>Probed SSIDs</th>" +
                "<th>Signal</th><th>CH</th><th>Last Seen</th></tr></thead><tbody></tbody></table>");
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
            if (!sel.length) { alert(t("whitelist.select_all")); return; }
            if (!confirm(t("whitelist.confirm_bulk_register", { count: sel.length }))) return;
            if (typeof kismet_whitelist_api !== "undefined") {
                kismet_whitelist_api.addBulkToWhitelist(sel.map(function (r) {
                    return {
                        mac: r.mac,
                        name: r.manuf,
                        category: "other",
                        notes: "auto-registered"
                    };
                }));
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
        tbody.append(tr);
    });
}

exports.registerSidebar = function () {
    if (typeof kismet_ui_sidebar === "undefined") {
        console.warn("[unassociated] kismet_ui_sidebar not available");
        return;
    }
    kismet_ui_sidebar.AddSidebarItem({
        id: "unassociated_clients",
        listTitle: "<i class=\"fa fa-wifi\"></i> " + t("sidebar.unassociated_clients"),
        priority: -10,
        clickCallback: function() { OpenUnassociatedPanel(); }
    });
    console.log("[unassociated] sidebar item registered: " + t("sidebar.unassociated_clients"));
};

return exports;
});
