(
    typeof define === "function" ? function (m) { define("kismet-enhanced-loader-js", m); } :
    typeof exports === "object" ? function (m) { module.exports = m(); } :
    function (m) { this.kismet_enhanced_loader = m(); }
)(function () {
"use strict";

var exports = {};
var local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined") {
    local_uri_prefix = KISMET_URI_PREFIX;
}

// Load enhanced CSS
$("<link>").appendTo("head").attr({
    type: "text/css", rel: "stylesheet",
    href: local_uri_prefix + "css/kismet_enhanced.css"
});

// Set default language to Japanese if not yet configured
try {
    if (!localStorage.getItem("i18nextLng")) {
        localStorage.setItem("i18nextLng", "ja");
    }
} catch(e) {}

/** Single shared init promise so autoStart + index.html both await the same i18n chain. */
var _enhancedInitPromise = null;

window.kismet_enhanced_run_async = function () {
    if (_enhancedInitPromise !== null) {
        return _enhancedInitPromise;
    }
    if (typeof kismet_i18n === "undefined" || !kismet_i18n.initI18n) {
        console.error("kismet_enhanced_loader: kismet_i18n missing");
        _enhancedInitPromise = Promise.resolve();
        return _enhancedInitPromise;
    }
    _enhancedInitPromise = kismet_i18n.initI18n()
        .then(function () {
            if (typeof console !== "undefined" && console.debug) {
                console.debug("[enhanced] i18n initialized, lang=" +
                    (window.i18next ? window.i18next.language : "?"));
            }
            try {
                if (typeof kismet_ui_whitelist_module !== "undefined" &&
                    kismet_ui_whitelist_module.registerSidebar) {
                    kismet_ui_whitelist_module.registerSidebar();
                    if (typeof console !== "undefined" && console.debug) {
                        console.debug("[enhanced] whitelist sidebar registered");
                    }
                } else {
                    console.warn("[enhanced] kismet_ui_whitelist_module missing; sidebar item not added");
                }
            } catch (e) { console.error("whitelist sidebar", e); }
            try {
                if (typeof kismet_ui_treeview_module !== "undefined" &&
                    kismet_ui_treeview_module.registerSidebar) {
                    kismet_ui_treeview_module.registerSidebar();
                    if (typeof console !== "undefined" && console.debug) {
                        console.debug("[enhanced] tree view sidebar registered");
                    }
                } else {
                    console.warn("[enhanced] kismet_ui_treeview_module missing; tree view sidebar not added");
                }
            } catch (eTv) { console.error("tree view sidebar", eTv); }
            try {
                if (typeof kismet_ui_enhanced_module !== "undefined" &&
                    kismet_ui_enhanced_module.registerEnhanced) {
                    kismet_ui_enhanced_module.registerEnhanced();
                    if (typeof console !== "undefined" && console.debug) {
                        console.debug("[enhanced] enhanced UI registered");
                    }
                }
            } catch (e) { console.error("enhanced ui", e); }
            try {
                var ds = document.getElementById("device_search");
                if (ds && typeof kismet_i18n !== "undefined" && kismet_i18n.t) {
                    var ph = kismet_i18n.t("common.filter_placeholder");
                    if (ph && ph !== "common.filter_placeholder") {
                        ds.setAttribute("placeholder", ph);
                    }
                }
            } catch (ePh) { /* ignore */ }
            document.dispatchEvent(new CustomEvent("kismet-enhanced-ready"));
        })
        .catch(function (err) {
            console.error("kismet_enhanced_loader init failed", err);
        });
    return _enhancedInitPromise;
};

// AUTO-INVOKE (scripts: kismet_i18n, kismet_whitelist_api, kismet_ui_signal_filter,
// kismet_ui_signal_monitor, kismet_ui_export, kismet_ui_whitelist, kismet_ui_unassociated, kismet_ui_enhanced, kismet_ui_treeview)
function autoStart() {
    if (typeof kismet_ui_sidebar === "undefined" ||
        typeof kismet_ui === "undefined" ||
        typeof $ === "undefined") {
        setTimeout(autoStart, 500);
        return;
    }
    if (typeof console !== "undefined" && console.debug) {
        console.debug("[enhanced] Kismet core ready, starting enhanced UI...");
    }
    kismet_enhanced_run_async();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
        setTimeout(autoStart, 1000);
    });
} else {
    setTimeout(autoStart, 1000);
}

return exports;
});
