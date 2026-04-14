(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-i18n-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_i18n = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {

"use strict";

var exports = {};

var local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined") {
    local_uri_prefix = KISMET_URI_PREFIX;
}

function uriForLocale(lng) {
    return local_uri_prefix + "locales/" + lng + "/translation.json";
}

exports.initI18n = function () {
    return new Promise(function (resolve, reject) {
        var detected = "ja";
        try {
            if (localStorage.getItem("i18nextLng")) {
                detected = localStorage.getItem("i18nextLng");
            } else if (navigator.language) {
                detected = navigator.language.split("-")[0];
            }
        } catch (e) {
            detected = "ja";
        }

        function loadJson(url) {
            return fetch(url, { credentials: "same-origin" }).then(function (r) {
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
            });
        }

        Promise.all([
            loadJson(uriForLocale("en")).catch(function () { return {}; }),
            loadJson(uriForLocale("ja")).catch(function () { return {}; })
        ]).then(function (bundles) {
            var enTr = bundles[0];
            var jaTr = bundles[1];
            var lng = detected;
            if (lng !== "en" && lng !== "ja") {
                lng = "ja";
            }
            var resources = {
                en: { translation: enTr },
                ja: { translation: jaTr }
            };
            if (!window.i18next || !window.i18next.init) {
                reject(new Error("i18next not loaded"));
                return;
            }
            return window.i18next.init({
                lng: lng,
                fallbackLng: "en",
                resources: resources
            }, function () {
                try {
                    localStorage.setItem("i18nextLng", lng);
                } catch (e2) { /* ignore */ }
                document.dispatchEvent(new CustomEvent("kismet-i18n-ready", { detail: { lng: lng } }));
                resolve();
            });
        }).catch(function (err) {
            reject(err);
        });
    });
};

function preinitUiString(key) {
    var lng = "ja";
    try {
        if (localStorage.getItem("i18nextLng")) {
            lng = localStorage.getItem("i18nextLng");
        }
    } catch (e) { /* ignore */ }
    var en = {
        "common.minimize": "Minimize",
        "common.filter_placeholder": "Filter…"
    };
    var ja = {
        "common.minimize": "\u6700\u5c0f\u5316",
        "common.filter_placeholder": "\u30d5\u30a3\u30eb\u30bf\u30fc\u2026"
    };
    var m = (lng === "en") ? en : ja;
    return m[key];
}

exports.t = function (key, opts) {
    var pre = preinitUiString(key);
    if (window.i18next && typeof window.i18next.t === "function") {
        // Before init, or when i18next leaves isInitialized undefined, avoid returning raw keys.
        if (!window.i18next.isInitialized) {
            return pre !== undefined ? pre : key;
        }
        var tr = window.i18next.t(key, opts);
        if ((tr === key || tr === "") && pre !== undefined) {
            return pre;
        }
        return tr;
    }
    return pre !== undefined ? pre : key;
};

exports.changeLanguage = function (lng) {
    if (window.i18next && typeof window.i18next.changeLanguage === "function") {
        return window.i18next.changeLanguage(lng).then(function () {
            try {
                localStorage.setItem("i18nextLng", lng);
            } catch (e) { /* ignore */ }
            window.location.reload();
        });
    }
    return Promise.resolve();
};

exports.getCurrentLanguage = function () {
    if (window.i18next && window.i18next.language) {
        return window.i18next.language;
    }
    try {
        return localStorage.getItem("i18nextLng") || "ja";
    } catch (e) {
        return "ja";
    }
};

return exports;

}));
