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

// Guard flag to prevent double initialization
var _enhancedInitialized = false;

window.kismet_enhanced_run_async = function () {
    if (_enhancedInitialized) {
        console.log("[enhanced] already initialized, skipping duplicate call");
        return Promise.resolve();
    }
    _enhancedInitialized = true;

    if (typeof kismet_i18n === "undefined" || !kismet_i18n.initI18n) {
        console.error("kismet_enhanced_loader: kismet_i18n missing");
        return Promise.resolve();
    }
    return kismet_i18n.initI18n()
        .then(function () {
            console.log("[enhanced] i18n initialized, lang=" +
                (window.i18next ? window.i18next.language : "?"));
            try {
                if (typeof kismet_ui_unassociated_module !== "undefined" &&
                    kismet_ui_unassociated_module.registerSidebar) {
                    kismet_ui_unassociated_module.registerSidebar();
                    console.log("[enhanced] unassociated sidebar registered");
                }
            } catch (e) { console.error("unassociated sidebar", e); }
            try {
                if (typeof kismet_ui_whitelist_module !== "undefined" &&
                    kismet_ui_whitelist_module.registerSidebar) {
                    kismet_ui_whitelist_module.registerSidebar();
                    console.log("[enhanced] whitelist sidebar registered");
                }
            } catch (e) { console.error("whitelist sidebar", e); }
            try {
                if (typeof kismet_ui_enhanced_module !== "undefined" &&
                    kismet_ui_enhanced_module.registerEnhanced) {
                    kismet_ui_enhanced_module.registerEnhanced();
                    console.log("[enhanced] enhanced UI registered");
                }
            } catch (e) { console.error("enhanced ui", e); }
            document.dispatchEvent(new CustomEvent("kismet-enhanced-ready"));
        })
        .catch(function (err) {
            console.error("kismet_enhanced_loader init failed", err);
        });
};

// AUTO-INVOKE (scripts: kismet_i18n, kismet_whitelist_api, kismet_ui_signal_filter,
// kismet_ui_signal_monitor, kismet_ui_export, kismet_ui_whitelist, kismet_ui_unassociated, kismet_ui_enhanced)
function autoStart() {
    if (typeof kismet_ui_sidebar === "undefined" ||
        typeof kismet_ui === "undefined" ||
        typeof $ === "undefined") {
        setTimeout(autoStart, 500);
        return;
    }
    console.log("[enhanced] Kismet core ready, starting enhanced UI...");
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
