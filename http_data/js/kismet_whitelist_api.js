(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-whitelist-api-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_whitelist_api = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {

"use strict";

var exports = {};

var STORAGE_KEY = "kismet.whitelist.devices";
var whitelistMacSet = new Set();

var local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined") {
    local_uri_prefix = KISMET_URI_PREFIX;
}

/** CSV_COLUMN mapping for legacy 5-column whitelist CSV and header aliases */
var CSV_COLUMN_MAP = {
    "kismet.device.base.macaddr": "mac",
    "kismet.device.base.name": "name",
    "kismet.device.base.manuf": "category",
    mac: "mac",
    name: "name",
    category: "category",
    notes: "notes",
    added_date: "added_date"
};

/**
 * Same first 9 columns as Devices tab exportDeviceTableCsv (kismet.ui.js); then whitelist-only fields.
 * Import accepts 9-column main CSV, 11-column whitelist export, or legacy mac,name,category,notes,added_date.
 */
var WHITELIST_DEVICE_CSV_HEADERS = [
    "kismet.device.base.key",
    "wlan.sa (IEEE 802.11 MAC)",
    "kismet.device.base.type",
    "kismet.device.base.name",
    "last_signal_dbm",
    "kismet.device.base.channel",
    "kismet.device.base.manuf",
    "kismet.device.base.last_time (unix)",
    "wireshark.display_filter",
    "added_date",
    "whitelist_notes"
];

function csvQuoteCell(val) {
    var s = (val === undefined || val === null) ? "" : String(val);
    return "\"" + s.replace(/"/g, "\"\"") + "\"";
}

function rowField(row, exactName) {
    if (!row) return "";
    if (Object.prototype.hasOwnProperty.call(row, exactName)) {
        var v0 = row[exactName];
        if (v0 !== undefined && v0 !== null && String(v0).trim() !== "") return String(v0).trim();
    }
    var want = String(exactName).replace(/^\ufeff/, "").trim().toLowerCase();
    for (var k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        var kn = String(k).replace(/^\ufeff/, "").trim().toLowerCase();
        if (kn === want) {
            var v = row[k];
            if (v !== undefined && v !== null) return String(v).trim();
        }
    }
    return "";
}

function csvFieldListHas(fields, needle) {
    if (!fields) return false;
    var n = String(needle).toLowerCase();
    for (var i = 0; i < fields.length; i++) {
        if (String(fields[i] || "").replace(/^\ufeff/, "").trim().toLowerCase() === n) return true;
    }
    return false;
}

function isMainDeviceCsvFormat(fields) {
    return csvFieldListHas(fields, "wlan.sa (IEEE 802.11 MAC)");
}

function isLegacyWhitelistCsvFormat(fields) {
    if (!fields || !fields.length) return false;
    if (isMainDeviceCsvFormat(fields)) return false;
    return csvFieldListHas(fields, "mac");
}

function buildEntryFromLegacyRow(row) {
    var mac = "";
    var name = "";
    var category = "";
    var notes = "";
    var added_date = "";
    for (var k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        var nk = CSV_COLUMN_MAP[k] || CSV_COLUMN_MAP[String(k).toLowerCase()] || k;
        if (nk === "mac") mac = row[k];
        else if (nk === "name") name = row[k];
        else if (nk === "category") category = row[k];
        else if (nk === "notes") notes = row[k];
        else if (nk === "added_date") added_date = row[k];
    }
    return {
        mac: mac,
        name: name || "",
        category: category || "",
        notes: notes || "",
        added_date: added_date || ""
    };
}

function buildEntryFromMainStyleRow(row) {
    var macRaw = rowField(row, "wlan.sa (IEEE 802.11 MAC)") ||
        rowField(row, "kismet.device.base.macaddr") ||
        rowField(row, "mac");
    var name = rowField(row, "kismet.device.base.name") || rowField(row, "name");
    var category = rowField(row, "kismet.device.base.manuf") || rowField(row, "category");
    var notes = rowField(row, "whitelist_notes") || rowField(row, "notes");
    var added_date = rowField(row, "added_date");
    return {
        mac: macRaw,
        name: name,
        category: category,
        notes: notes,
        added_date: added_date
    };
}

function rowLooksEmpty(entry) {
    return !entry || !String(entry.mac || "").trim();
}

function dispatchChanged() {
    document.dispatchEvent(new CustomEvent("kismet-whitelist-changed"));
}

function normalizeMac(mac) {
    if (!mac || typeof mac !== "string") return "";
    return mac.trim().toUpperCase().replace(/-/g, ":");
}

function validateMacFormat(mac) {
    var m = normalizeMac(mac);
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m);
}

function loadStorage() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

function saveStorage(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    rebuildCache(arr);
    dispatchChanged();
}

function rebuildCache(arr) {
    whitelistMacSet = new Set();
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].mac) {
            whitelistMacSet.add(normalizeMac(arr[i].mac));
        }
    }
}

/** Throttle repeated console.warn during Kismet restarts / network blips (same key within window). */
var syncWarnLast = {};
var SYNC_WARN_MIN_MS = 25000;

function syncWarnThrottled(warnKey, logFn) {
    var now = Date.now();
    var last = syncWarnLast[warnKey] || 0;
    if (now - last < SYNC_WARN_MIN_MS) {
        return;
    }
    syncWarnLast[warnKey] = now;
    if (typeof console !== "undefined" && console.warn) {
        logFn();
    }
}

function trySyncTags(entry) {
    if (typeof $ === "undefined") return;
    var mac = normalizeMac(entry.mac);
    $.get(local_uri_prefix + "devices/by-mac/" + encodeURIComponent(mac) + "/devices.json")
        .done(function (data) {
            if (!data || !data.length) return;
            var key = data[0]["kismet.device.base.key"];
            if (!key) return;
            var base = local_uri_prefix + "devices/by-key/" + encodeURIComponent(key) + "/set_tag.cmd";
            function postTag(tagname, tagvalue) {
                $.post(base, JSON.stringify({ tagname: tagname, tagvalue: tagvalue }))
                    .fail(function (xhr) {
                        syncWarnThrottled("set_tag:" + mac + ":" + tagname, function () {
                            console.warn("[whitelist] set_tag failed", tagname, mac, xhr && xhr.status);
                        });
                    });
            }
            postTag("whitelist", "approved");
            if (entry.category) {
                postTag("whitelist_category", entry.category);
            }
            if (entry.notes) {
                postTag("whitelist_notes", entry.notes);
            }
        })
        .fail(function (xhr) {
            syncWarnThrottled("by-mac:" + mac, function () {
                console.warn("[whitelist] by-mac lookup failed", mac, xhr && xhr.status);
            });
        });
}

(function init() {
    rebuildCache(loadStorage());
})();

exports.getWhitelist = function () {
    return loadStorage().slice();
};

exports.getWhitelistCache = function () {
    return whitelistMacSet;
};

exports.isWhitelisted = function (mac) {
    return whitelistMacSet.has(normalizeMac(mac));
};

exports.addToWhitelist = function (entry) {
    if (!entry || !entry.mac) throw new Error("mac required");
    var mac = normalizeMac(entry.mac);
    if (!validateMacFormat(mac)) throw new Error("MAC format invalid");
    var list = loadStorage();
    if (list.some(function (e) { return normalizeMac(e.mac) === mac; })) {
        throw new Error("duplicate mac");
    }
    var row = {
        mac: mac,
        name: entry.name || "",
        category: entry.category || "",
        notes: entry.notes || "",
        added_date: entry.added_date || new Date().toISOString().slice(0, 10)
    };
    list.push(row);
    saveStorage(list);
    trySyncTags(row);
    return row;
};

exports.addBulkToWhitelist = function (entries) {
    var added = 0;
    var skipped = [];
    for (var i = 0; i < entries.length; i++) {
        try {
            exports.addToWhitelist(entries[i]);
            added++;
        } catch (e) {
            skipped.push({
                mac: entries[i] && entries[i].mac,
                reason: String((e && e.message) ? e.message : e)
            });
        }
    }
    return { added: added, skipped: skipped };
};

exports.updateWhitelistEntry = function (mac, updates) {
    var m = normalizeMac(mac);
    var list = loadStorage();
    for (var i = 0; i < list.length; i++) {
        if (normalizeMac(list[i].mac) === m) {
            if (updates.name != null) list[i].name = updates.name;
            if (updates.category != null) list[i].category = updates.category;
            if (updates.notes != null) list[i].notes = updates.notes;
            saveStorage(list);
            trySyncTags(list[i]);
            return list[i];
        }
    }
    return null;
};

/**
 * Remove one MAC from the whitelist (localStorage).
 * Note: localStorage is shared across tabs. Another tab can write between load and save;
 * this path does not merge concurrent edits (single-tab / low contention is assumed).
 */
exports.removeFromWhitelist = function (mac) {
    var m = normalizeMac(mac);
    var before = loadStorage();
    var list = before.filter(function (e) { return normalizeMac(e.mac) !== m; });
    if (list.length === before.length) return false;
    saveStorage(list);
    return true;
};

exports.removeBulkFromWhitelist = function (macs) {
    var set = new Set();
    for (var i = 0; i < macs.length; i++) {
        set.add(normalizeMac(macs[i]));
    }
    var list = loadStorage().filter(function (e) { return !set.has(normalizeMac(e.mac)); });
    saveStorage(list);
};

exports.importFromCSV = function (csvString) {
    var success = 0;
    var errors = [];
    if (typeof Papa === "undefined" || !Papa.parse) {
        errors.push("PapaParse not available");
        return { success: success, errors: errors };
    }
    var parsed = Papa.parse(csvString, { header: true });
    var fields = parsed.meta && parsed.meta.fields ? parsed.meta.fields : [];
    var rows = parsed.data || [];
    var useMainStyle = isMainDeviceCsvFormat(fields);
    var useLegacy = isLegacyWhitelistCsvFormat(fields);
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        var entry;
        if (useMainStyle) {
            entry = buildEntryFromMainStyleRow(row);
        } else if (useLegacy) {
            entry = buildEntryFromLegacyRow(row);
        } else {
            entry = buildEntryFromMainStyleRow(row);
        }
        if (rowLooksEmpty(entry)) continue;
        try {
            exports.addToWhitelist({
                mac: entry.mac,
                name: entry.name,
                category: entry.category,
                notes: entry.notes,
                added_date: entry.added_date
            });
            success++;
        } catch (e) {
            errors.push(String(r + 1) + ": " + String(e.message || e));
        }
    }
    return { success: success, errors: errors };
};

exports.exportToCSV = function () {
    var list = loadStorage();
    var BOM = "\uFEFF";
    var lines = [WHITELIST_DEVICE_CSV_HEADERS.map(csvQuoteCell).join(",")];
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var macLower = String(e.mac || "").toLowerCase();
        var wdf = "";
        if (macLower && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(macLower)) {
            wdf = "wlan.addr == " + macLower;
        }
        var row = [
            "",
            macLower,
            "",
            e.name || "",
            "",
            "",
            e.category || "",
            "",
            wdf,
            e.added_date || "",
            e.notes || ""
        ];
        lines.push(row.map(csvQuoteCell).join(","));
    }
    return BOM + lines.join("\r\n");
};

return exports;

}));
