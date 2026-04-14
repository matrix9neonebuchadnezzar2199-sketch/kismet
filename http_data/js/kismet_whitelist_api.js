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

/** CSV_COLUMN mapping for Kismet export headers and simple aliases */
var CSV_COLUMN_MAP = {
    "kismet.device.base.macaddr": "mac",
    "kismet.device.base.name": "name",
    "kismet.device.base.manuf": "category",
    mac: "mac",
    name: "name",
    category: "category",
    notes: "notes"
};

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
    var rows = parsed.data || [];
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        var mac = "";
        var name = "";
        var category = "";
        var notes = "";
        for (var k in row) {
            if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
            var nk = CSV_COLUMN_MAP[k] || CSV_COLUMN_MAP[k.toLowerCase()] || k;
            if (nk === "mac") mac = row[k];
            else if (nk === "name") name = row[k];
            else if (nk === "category") category = row[k];
            else if (nk === "notes") notes = row[k];
        }
        try {
            exports.addToWhitelist({ mac: mac, name: name, category: category, notes: notes });
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
    var header = "mac,name,category,notes,added_date";
    var lines = [header];
    for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var row = [
            e.mac,
            e.name || "",
            e.category || "",
            (e.notes || "").replace(/"/g, "\"\""),
            e.added_date || ""
        ].map(function (cell) {
            if (cell.indexOf(",") >= 0 || cell.indexOf("\n") >= 0) {
                return "\"" + cell + "\"";
            }
            return cell;
        });
        lines.push(row.join(","));
    }
    return BOM + lines.join("\n");
};

return exports;

}));
