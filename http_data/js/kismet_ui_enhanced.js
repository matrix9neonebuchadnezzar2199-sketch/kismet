(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-ui-enhanced-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_ui_enhanced_module = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {

"use strict";

var exports = {};

function t(k, o) {
    return (typeof kismet_i18n !== "undefined" && kismet_i18n.t) ? kismet_i18n.t(k, o) : k;
}

exports.registerEnhanced = function () {
    if (typeof kismet_ui === "undefined") return;

    kismet_ui.AddDeviceColumn("column_whitelist_status", {
        title: t("whitelist.status"),
        description: t("settings.whitelist_column_desc"),
        field: "kismet.device.base.macaddr",
        sortable: true,
        searchable: false,
        render: function (data, row, cell, onrender, aux) {
            var mac = data;
            if (typeof kismet_whitelist_api !== "undefined" && kismet_whitelist_api.isWhitelisted(mac)) {
                return "<span class=\"whitelist-status-icon whitelist-approved\"><i class=\"fa fa-check\"></i></span>";
            }
            return "<span class=\"whitelist-status-icon whitelist-unknown\"><i class=\"fa fa-exclamation-triangle\"></i></span>";
        }
    });

    kismet_ui.AddDeviceRowHighlight({
        name: "Unassociated Probing Client",
        labelKey: "highlight.unassociated_probing",
        descriptionKey: "unassociated.description",
        description: "Devices sending probe requests without being connected to any AP",
        priority: 20,
        defaultcolor: "#FFA500",
        defaultenable: true,
        fields: ["dot11.device/dot11.device.type_set", "dot11.device/dot11.device.associated_client_map"],
        selector: function (data) {
            var ts = data["dot11.device.type_set"];
            if (ts == null && data["dot11.device"] && data["dot11.device"]["dot11.device.type_set"]) {
                ts = data["dot11.device"]["dot11.device.type_set"];
            }
            var hasProbing = false;
            if (Array.isArray(ts)) hasProbing = ts.indexOf("probing") >= 0;
            else if (typeof ts === "string") hasProbing = ts.indexOf("probing") >= 0;
            var assoc = data["dot11.device.associated_client_map"];
            if (!assoc && data["dot11.device"]) {
                assoc = data["dot11.device"]["dot11.device.associated_client_map"];
            }
            var emptyAssoc = !assoc || (typeof assoc === "object" && Object.keys(assoc).length === 0);
            return hasProbing && emptyAssoc;
        }
    });

    kismet_ui.AddDeviceRowHighlight({
        name: "Unknown Device (Not Whitelisted)",
        labelKey: "highlight.unknown_not_whitelisted",
        descriptionKey: "whitelist.unknown",
        description: "Unregistered device",
        priority: 15,
        defaultcolor: "#FFCCCC",
        defaultenable: false,
        fields: ["kismet.device.base.macaddr"],
        selector: function (data) {
            var mac = data["kismet.device.base.macaddr"];
            if (!mac || typeof kismet_whitelist_api === "undefined") return false;
            return !kismet_whitelist_api.isWhitelisted(mac);
        }
    });

    kismet_ui.AddDeviceRowHighlight({
        name: "Whitelisted device (trusted)",
        labelKey: "highlight.whitelisted_trusted",
        descriptionKey: "highlight.whitelisted_trusted_desc",
        description: "MAC is on the local whitelist",
        priority: 30,
        defaultcolor: "#1b4332",
        defaultenable: true,
        cssClass: "kismet-row-whitelist-trusted",
        fields: ["kismet.device.base.macaddr"],
        selector: function (data) {
            var mac = data["kismet.device.base.macaddr"];
            if (!mac || typeof kismet_whitelist_api === "undefined") return false;
            return kismet_whitelist_api.isWhitelisted(mac);
        }
    });

    function escAttr(s) {
        return String(s || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function applyWhitelistNameBadge() {
        if (window.__kismetWlCommonnameWrap) return;
        if (typeof kismet_ui.WrapDeviceColumnRender !== "function") return;
        var ok = kismet_ui.WrapDeviceColumnRender("commonname", function (data, row, cell, onrender, aux, prev) {
            var inner = prev(data, row, cell, onrender, aux);
            var od = row && row.original_data;
            var mac = od && od["kismet.device.base.macaddr"];
            if (typeof kismet_whitelist_api !== "undefined" && mac && kismet_whitelist_api.isWhitelisted(mac)) {
                var lab = t("whitelist.safe_tag");
                var title = t("whitelist.safe_tag_title");
                return "<span class=\"device-name-wl-cell\"><span class=\"device-name-wl-safe\" title=\"" +
                    escAttr(title) + "\">" + escAttr(lab) + "</span><span class=\"device-name-wl-text\">" +
                    inner + "</span></span>";
            }
            return inner;
        });
        if (ok) window.__kismetWlCommonnameWrap = true;
    }
    applyWhitelistNameBadge();
    if (!window.__kismetWlCommonnameWrap) {
        setTimeout(applyWhitelistNameBadge, 0);
    }

    if (typeof kismet_ui_settings !== "undefined") {
        kismet_ui_settings.AddSettingsPane({
            id: "language_settings",
            listTitle: t("settings.language"),
            windowTitle: t("settings.language"),
            create: function (content) {
                content.empty();
                var p = $("<p>").text(t("settings.language_desc"));
                var sel = $("<select>", { id: "kismet-lang-select" });
                sel.append($("<option>", { value: "en" }).text(t("settings.lang_en")));
                sel.append($("<option>", { value: "ja" }).text(t("settings.lang_ja")));
                sel.val(kismet_i18n.getCurrentLanguage());
                content.append(p).append(sel);
            },
            save: function () {
                var v = $("#kismet-lang-select").val();
                return kismet_i18n.changeLanguage(v);
            },
            priority: -10
        });
    }
};

return exports;

}));
