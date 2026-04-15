(function (root, factory) {
    var api = factory();
    if (typeof define === "function" && define.amd) {
        define("kismet-ui-whitelist-js", [], function () { return api; });
    }
    if (typeof module === "object" && module.exports) {
        module.exports = api;
    }
    root.kismet_ui_whitelist_module = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {

"use strict";

var exports = {};

function t(k, o) {
    return (typeof kismet_i18n !== "undefined" && kismet_i18n.t) ? kismet_i18n.t(k, o) : k;
}

var tabulator = null;
/** jQuery wrapper root of the open whitelist panel (toolbar + table); cleared on panel close */
var whitelistPanelWrap = null;
var WHITELIST_JSPANEL_REF = "__kismetWhitelistJspanel";

function wlUiDbg(msg, detail) {
    try {
        var g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : null);
        if (g && typeof g.kismetWhitelistUiDebugLog === "function") {
            g.kismetWhitelistUiDebugLog(msg, detail);
        }
    } catch (e) {
        /* ignore */
    }
}

function closeWhitelistPanelIfOpen() {
    if (typeof window === "undefined") {
        return;
    }
    var p = window[WHITELIST_JSPANEL_REF];
    if (p && typeof p.close === "function") {
        try {
            p.close();
        } catch (e0) {
            /* ignore */
        }
    }
    window[WHITELIST_JSPANEL_REF] = null;
}

function getWlSelectedRowDatas() {
    if (!tabulator) return [];
    try {
        if (typeof tabulator.getSelectedRows === "function") {
            var rw = tabulator.getSelectedRows();
            if (rw && rw.length) {
                return rw.map(function (r) {
                    return r.getData();
                });
            }
        }
    } catch (eRows) {
        /* ignore */
    }
    try {
        if (typeof tabulator.getSelectedData === "function") {
            var d = tabulator.getSelectedData();
            if (d && d.length) return d;
        }
    } catch (eData) {
        /* ignore */
    }
    return [];
}

/** Selected row count and total rows (per-row try; survives odd Tabulator states). */
function wlSelectedStats() {
    if (!tabulator) {
        return { n: 0, total: 0 };
    }
    try {
        var rows = tabulator.getRows();
        var total = rows.length;
        var n = 0;
        var i;
        for (i = 0; i < total; i++) {
            try {
                if (rows[i].isSelected()) {
                    n++;
                }
            } catch (eR) {
                ;
            }
        }
        return { n: n, total: total };
    } catch (e0) {
        return { n: 0, total: 0 };
    }
}

function countWlSelectedRows() {
    return wlSelectedStats().n;
}

function pushMacDedup(seen, macs, m) {
    var s = String(m || "").trim();
    if (!s) return;
    var u = s.toUpperCase().replace(/-/g, ":");
    if (!seen[u]) {
        seen[u] = 1;
        macs.push(s);
    }
}

/** MAC string from a Tabulator row (getData and mac column cell fallback). */
function rowMacFromTabulatorRow(r) {
    if (!r) return "";
    try {
        var d = r.getData();
        if (d && d.mac != null && String(d.mac).trim()) {
            return String(d.mac).trim();
        }
    } catch (e0) {
        /* ignore */
    }
    try {
        if (typeof r.getCell === "function") {
            var c = r.getCell("mac");
            if (c && c.getValue() != null && String(c.getValue()).trim()) {
                return String(c.getValue()).trim();
            }
        }
    } catch (e1) {
        /* ignore */
    }
    return "";
}

/**
 * MACs for bulk delete. If toolbar「全選択」is checked, trust all table rows (avoids Tabulator
 * selection desync after replaceData); else selected rows + getSelected* APIs.
 */
function collectWlBulkDeleteMacs() {
    var seen = {};
    var macs = [];
    if (!tabulator) return macs;

    var st = wlSelectedStats();
    var implicitAll = st.total > 0 && st.n === st.total;
    var pageAll = (whitelistPanelWrap && whitelistPanelWrap.length &&
        whitelistPanelWrap.find(".js-wl-sel-all").prop("checked")) || implicitAll;
    var i;
    var rows = [];
    try {
        rows = tabulator.getRows() || [];
    } catch (eGr) {
        rows = [];
    }
    if (pageAll) {
        if (rows.length) {
            for (i = 0; i < rows.length; i++) {
                try {
                    pushMacDedup(seen, macs, rowMacFromTabulatorRow(rows[i]));
                } catch (e1) {
                    ;
                }
            }
        } else if (typeof tabulator.getData === "function") {
            try {
                var flat = tabulator.getData();
                if (flat && flat.length) {
                    for (i = 0; i < flat.length; i++) {
                        pushMacDedup(seen, macs, flat[i] && flat[i].mac);
                    }
                }
            } catch (eFlat) {
                ;
            }
        }
        if (macs.length) {
            return macs;
        }
    }

    try {
        for (i = 0; i < rows.length; i++) {
            try {
                if (rows[i].isSelected()) {
                    pushMacDedup(seen, macs, rowMacFromTabulatorRow(rows[i]));
                }
            } catch (eR) {
                ;
            }
        }
    } catch (eSel) {
        /* ignore */
    }

    getWlSelectedRowDatas().forEach(function (row) {
        pushMacDedup(seen, macs, row && row.mac);
    });

    wlUiDbg("wl_collect_delete", {
        macs: macs.length,
        pageAll: pageAll,
        implicitAll: implicitAll,
        nSel: st.n,
        rowTotal: st.total,
        getRows: rows.length
    });
    return macs;
}

function categoryOptions() {
    return [
        { v: "pc", l: t("whitelist.categories.pc") },
        { v: "mobile", l: t("whitelist.categories.mobile") },
        { v: "iot", l: t("whitelist.categories.iot") },
        { v: "printer", l: t("whitelist.categories.printer") },
        { v: "network", l: t("whitelist.categories.network") },
        { v: "other", l: t("whitelist.categories.other") }
    ];
}

function buildCategorySelect(val, domId) {
    var attrs = {};
    if (domId) attrs.id = domId;
    var sel = $("<select>", attrs);
    var opts = categoryOptions();
    for (var i = 0; i < opts.length; i++) {
        sel.append($("<option>", { value: opts[i].v }).text(opts[i].l));
    }
    if (val) sel.val(val);
    return sel;
}

function wlFieldSuffix() {
    return String(Math.floor(Math.random() * 1e9));
}

/** Dark theme sets body text to light colors; modal is white — force contrast (beats most !important rules). */
function wlModalStyleImportant(jqOrEl, prop, value) {
    try {
        var el = jqOrEl && jqOrEl.jquery ? jqOrEl[0] : jqOrEl;
        if (el && el.style && typeof el.style.setProperty === "function") {
            el.style.setProperty(prop, value, "important");
        }
    } catch (e) {
        /* ignore */
    }
}

function appendFieldRow(container, labelKey, control) {
    var row = $("<div>", { class: "whitelist-field-row" });
    var cid = control.attr("id");
    var lab = $("<label>", cid ? { for: cid } : {}).text(t(labelKey));
    wlModalStyleImportant(lab, "color", "#212121");
    wlModalStyleImportant(lab, "font-size", "13px");
    wlModalStyleImportant(lab, "font-weight", "600");
    row.append(lab);
    row.append(control);
    container.append(row);
}

function showModal(title, body, onOk) {
    var overlay = $("<div>", { class: "kismet-modal-overlay" });
    wlModalStyleImportant(overlay, "z-index", "999999");
    var modal = $("<div>", { class: "kismet-modal" });
    wlModalStyleImportant(modal, "color", "#1a1a1a");
    var hdr = $("<div>", { class: "kismet-modal-header" }).text(title);
    wlModalStyleImportant(hdr, "color", "#111111");
    modal.append(hdr);
    var dlg = $("<div>", { class: "whitelist-dialog" });
    wlModalStyleImportant(dlg, "color", "#212121");
    dlg.append(body);
    modal.append(dlg);
    var foot = $("<div>", { class: "kismet-modal-footer" });
    foot.append($("<button>", { type: "button", class: "kismet-modal-btn kismet-modal-btn--secondary" })
        .text(t("common.cancel")).on("click", function () {
        overlay.remove();
    }));
    foot.append($("<button>", { type: "button", class: "kismet-modal-btn kismet-modal-btn--primary" })
        .text(t("common.ok")).on("click", function () {
        onOk(function () { overlay.remove(); });
    }));
    modal.append(foot);
    overlay.append(modal);
    $("body").append(overlay);
}

function showConfirmModal(title, message, onYes, onCancel) {
    var overlay = $("<div>", { class: "kismet-modal-overlay" });
    wlModalStyleImportant(overlay, "z-index", "999999");
    var modal = $("<div>", { class: "kismet-modal" });
    wlModalStyleImportant(modal, "color", "#1a1a1a");
    var hdr2 = $("<div>", { class: "kismet-modal-header" }).text(title);
    wlModalStyleImportant(hdr2, "color", "#111111");
    modal.append(hdr2);
    var dlg2 = $("<div>", { class: "whitelist-dialog" });
    wlModalStyleImportant(dlg2, "color", "#212121");
    var msgP = $("<p>", { class: "kismet-modal-message" });
    msgP.text(message);
    wlModalStyleImportant(msgP, "color", "#1a1a1a");
    wlModalStyleImportant(msgP, "background-color", "#f5f5f5");
    wlModalStyleImportant(msgP, "border", "1px solid #cccccc");
    wlModalStyleImportant(msgP, "padding", "12px");
    wlModalStyleImportant(msgP, "border-radius", "4px");
    wlModalStyleImportant(msgP, "max-height", "50vh");
    wlModalStyleImportant(msgP, "overflow-y", "auto");
    wlModalStyleImportant(msgP, "white-space", "pre-wrap");
    wlModalStyleImportant(msgP, "word-break", "break-word");
    wlModalStyleImportant(msgP, "margin", "0 0 8px 0");
    dlg2.append(msgP);
    modal.append(dlg2);
    var foot = $("<div>", { class: "kismet-modal-footer" });
    foot.append($("<button>", { type: "button", class: "kismet-modal-btn kismet-modal-btn--secondary" })
        .text(t("common.cancel")).on("click", function () {
        overlay.remove();
        if (onCancel) {
            onCancel();
        }
    }));
    foot.append($("<button>", { type: "button", class: "kismet-modal-btn kismet-modal-btn--primary" })
        .text(t("common.yes")).on("click", function () {
        overlay.remove();
        onYes();
    }));
    modal.append(foot);
    overlay.append(modal);
    $("body").append(overlay);
}

function validateMac(m) {
    var x = String(m || "").trim().toUpperCase().replace(/-/g, ":");
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(x);
}

function updateWlBulkSelectionUi() {
    if (!whitelistPanelWrap || !whitelistPanelWrap.length) return;
    var n = countWlSelectedRows();
    whitelistPanelWrap.find(".js-wl-selected-count").text(t("whitelist.selected_count", { count: n }));
    var nRows = 0;
    if (tabulator) {
        try {
            nRows = tabulator.getRows().length;
        } catch (eNr) {
            nRows = 0;
        }
    }
    whitelistPanelWrap.find(".js-wl-delete-selected").prop("disabled", nRows === 0);
    var cb = whitelistPanelWrap.find(".js-wl-sel-all")[0];
    if (!cb || !tabulator) return;
    var rows = tabulator.getRows();
    if (!rows.length) {
        cb.checked = false;
        cb.indeterminate = false;
        return;
    }
    var sel = 0;
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].isSelected()) sel++;
    }
    cb.checked = sel === rows.length && sel > 0;
    cb.indeterminate = sel > 0 && sel < rows.length;
}

function refreshTable() {
    if (!tabulator) return;
    var p = tabulator.replaceData(kismet_whitelist_api.getWhitelist());
    if (p && typeof p.then === "function") {
        p.then(function () { updateWlBulkSelectionUi(); });
    } else {
        updateWlBulkSelectionUi();
    }
}

function OpenWhitelistPanel() {
    closeWhitelistPanelIfOpen();

    var wrap = $("<div>", { class: "kismet-whitelist-panel-wrap" });
    var thisWrap = wrap;
    whitelistPanelWrap = wrap;
    var tableHostId = "whitelist-table-h-" + Date.now();
    var myTabulator = null;
    var toolbar = $("<div>", { class: "whitelist-toolbar" });
    toolbar.append($("<button>", {
        type: "button",
        class: "btn btn-primary wl-toolbar-add-btn"
    }).text(t("whitelist.add_single")));
    var fileInput = $("<input>", { type: "file", accept: ".csv", css: { display: "none" } });
    fileInput.attr("data-import", "import_csv");
    toolbar.append($("<button>", { type: "button", class: "btn btn-success" }).text(t("whitelist.import_csv")).on("click", function () {
        fileInput.click();
    }));
    toolbar.append(fileInput);
    toolbar.append($("<button>", { type: "button", class: "btn btn-warning" }).text(t("whitelist.export_csv")).on("click", function () {
        var csv = kismet_whitelist_api.exportToCSV();
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "whitelist.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    }));
    var search = $("<input>", { type: "search", placeholder: t("common.search") }).on("keyup", function () {
        if (!tabulator) return;
        var term = $(this).val().toLowerCase();
        tabulator.setFilter(function (data) {
            if (!term) return true;
            return String(data.mac + data.name + data.category + data.notes + (data.last_seen_unix || "") +
                (data.capture_location || ""))
                .toLowerCase().indexOf(term) >= 0;
        });
    });
    toolbar.append(search);
    wrap.append(toolbar);
    /* Delegated click: survives jsPanel/Tabulator focus quirks better than a raw DOM listener on the button. */
    wrap.on("click", ".wl-toolbar-add-btn", function (e) {
        e.preventDefault();
        e.stopPropagation();
        try {
            openEditDialog(null);
        } catch (exAdd) {
            wlUiDbg("wl_toolbar_add_err", { err: String(exAdd) });
            alert(t("common.error"));
        }
    });

    var tableHost = $("<div>", { id: tableHostId });
    wrap.append(tableHost);

    var bulk = $("<div>", { class: "whitelist-toolbar whitelist-bulk-toolbar" });
    bulk.append($("<label>", { class: "whitelist-sel-all-wrap" }).append(
        $("<input>", { type: "checkbox", class: "js-wl-sel-all" })
    ).append($("<span>").text(" " + t("whitelist.select_all"))));
    bulk.append($("<span>", { class: "js-wl-selected-count wl-selected-count" })
        .text(t("whitelist.selected_count", { count: 0 })));
    bulk.append($("<button>", {
        type: "button",
        class: "btn js-wl-delete-selected"
    }).text(t("whitelist.delete_selected")).prop("disabled", true).on("click", function () {
        wlUiDbg("wl_bulk_delete_click", {});
        showConfirmModal(t("common.confirm"), t("whitelist.confirm_delete"), function onWlBulkYes() {
            if (!tabulator) {
                wlUiDbg("wl_bulk_delete_no_tabulator", {});
                alert(t("common.error"));
                return;
            }
            var macs = collectWlBulkDeleteMacs();
            wlUiDbg("wl_bulk_delete_macs", { count: macs.length });
            if (!macs.length) {
                alert(t("common.select_rows_first"));
                return;
            }
            try {
                kismet_whitelist_api.removeBulkFromWhitelist(macs);
                if (whitelistPanelWrap && whitelistPanelWrap.length) {
                    whitelistPanelWrap.find(".js-wl-sel-all").prop("checked", false).prop("indeterminate", false);
                }
                refreshTable();
            } catch (eDel) {
                alert(String((eDel && eDel.message) ? eDel.message : eDel) || t("common.error"));
            }
        }, function onWlBulkCancel() {
            wlUiDbg("wl_bulk_delete_modal_cancel", {});
        });
    }));
    wrap.append(bulk);

    fileInput.on("change", function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            var text = reader.result;
            var full = String(text);
            var preview = full;
            if (preview.length > 2800) {
                preview = preview.slice(0, 2800) + "\n…";
            }
            var msg = preview + "\n\n" + t("whitelist.import_csv_confirm");
            showConfirmModal(t("whitelist.import_csv"), msg, function onImportYes() {
                var res = kismet_whitelist_api.importFromCSV(full);
                alert(t("whitelist.import_success", { count: res.success }));
                if (res.errors.length) {
                    alert(res.errors.join("\n"));
                }
                refreshTable();
                fileInput.val("");
            }, function onImportCancel() {
                fileInput.val("");
            });
        };
        reader.readAsText(f);
    });

    wrap.on("change", ".js-wl-sel-all", function () {
        if (!tabulator) {
            wlUiDbg("wl_selall_no_tabulator", {});
            return;
        }
        var nR = 0;
        try {
            nR = tabulator.getRows().length;
        } catch (eNr) {
            nR = -1;
        }
        wlUiDbg("wl_selall_change", { on: !!$(this).prop("checked"), getRows: nR });
        var on = $(this).prop("checked");
        if (on) {
            tabulator.deselectRow();
            tabulator.getRows().forEach(function (r) {
                try {
                    r.select();
                } catch (eS) {
                    ;
                }
            });
        } else {
            tabulator.deselectRow();
        }
        updateWlBulkSelectionUi();
    });

    var panel = $.jsPanel({
        headerTitle: t("whitelist.title"),
        content: wrap,
        theme: "dark",
        width: $(window).width() * 0.85,
        height: $(window).height() * 0.75,
        onclosed: function () {
            if (myTabulator) {
                try {
                    myTabulator.destroy();
                } catch (eD) {
                    /* ignore */
                }
                if (tabulator === myTabulator) {
                    tabulator = null;
                }
                myTabulator = null;
            }
            if (whitelistPanelWrap && whitelistPanelWrap.length && thisWrap.length &&
                whitelistPanelWrap[0] === thisWrap[0]) {
                whitelistPanelWrap = null;
            }
            if (typeof window !== "undefined" && window[WHITELIST_JSPANEL_REF] === panel) {
                window[WHITELIST_JSPANEL_REF] = null;
            }
        },
        callback: function () {
            myTabulator = new Tabulator("#" + tableHostId, {
                data: kismet_whitelist_api.getWhitelist(),
                layout: "fitColumns",
                selectableRows: true,
                columns: [
                    {
                        formatter: "rowSelection",
                        titleFormatter: "rowSelection",
                        hozAlign: "center",
                        headerSort: false,
                        width: 40,
                        vertAlign: "middle"
                    },
                    { field: "mac", title: t("device_list.mac_address"), headerSort: true },
                    { field: "name", title: t("device_list.name") },
                    { field: "category", title: t("device_list.manufacturer") },
                    {
                        field: "last_seen_unix",
                        title: t("device_list.last_seen"),
                        formatter: function (cell) {
                            var v = cell.getValue();
                            if (v == null || String(v).trim() === "") {
                                return "";
                            }
                            var n = parseFloat(String(v));
                            if (!isNaN(n) && n > 1e6) {
                                try {
                                    return (new Date(n * 1000)).toISOString().replace("T", " ").slice(0, 19);
                                } catch (ex) {
                                    return String(v);
                                }
                            }
                            return String(v);
                        }
                    },
                    { field: "capture_location", title: t("device_list.csv_location") },
                    { field: "notes", title: t("whitelist.notes") },
                    { field: "added_date", title: t("whitelist.added_date") },
                    {
                        title: t("whitelist.edit"),
                        hozAlign: "center",
                        vertAlign: "middle",
                        formatter: function (cell) {
                            /* Snapshot at render time: Tabulator's cell component can be invalid on later click. */
                            var rowSnap = {};
                            try {
                                var rd = cell.getRow().getData();
                                if (rd && typeof rd === "object") {
                                    rowSnap = Object.assign({}, rd);
                                }
                            } catch (eSnap) {
                                rowSnap = {};
                            }
                            var btn = document.createElement("button");
                            btn.type = "button";
                            btn.className = "btn btn-primary wl-row-edit-btn";
                            btn.textContent = t("whitelist.edit");
                            btn.addEventListener("click", function (ev) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                if (typeof ev.stopImmediatePropagation === "function") {
                                    ev.stopImmediatePropagation();
                                }
                                var hasMac = rowSnap && String(rowSnap.mac || "").trim();
                                openEditDialog(hasMac ? rowSnap : null);
                            });
                            return btn;
                        }
                    },
                    {
                        title: t("whitelist.delete"),
                        hozAlign: "center",
                        vertAlign: "middle",
                        formatter: function (cell) {
                            var macSnap = "";
                            try {
                                var dr = cell.getRow().getData();
                                if (dr && dr.mac != null) {
                                    macSnap = String(dr.mac).trim();
                                }
                            } catch (eMac) {
                                macSnap = "";
                            }
                            var btn = document.createElement("button");
                            btn.type = "button";
                            btn.className = "btn wl-row-delete-btn";
                            btn.textContent = t("whitelist.delete");
                            btn.addEventListener("click", function (ev) {
                                ev.preventDefault();
                                ev.stopPropagation();
                                if (typeof ev.stopImmediatePropagation === "function") {
                                    ev.stopImmediatePropagation();
                                }
                                var mac = macSnap;
                                if (!mac) {
                                    alert(t("common.error"));
                                    return;
                                }
                                showConfirmModal(t("common.confirm"), t("whitelist.confirm_delete"), function () {
                                    try {
                                        kismet_whitelist_api.removeFromWhitelist(mac);
                                        refreshTable();
                                    } catch (eRm) {
                                        alert(String((eRm && eRm.message) ? eRm.message : eRm) || t("common.error"));
                                    }
                                }, function () {
                                    wlUiDbg("wl_row_delete_modal_cancel", {});
                                });
                            });
                            return btn;
                        }
                    }
                ]
            });
            tabulator = myTabulator;
            tabulator.on("rowSelected", updateWlBulkSelectionUi);
            tabulator.on("rowDeselected", updateWlBulkSelectionUi);
            tabulator.on("tableBuilt", updateWlBulkSelectionUi);
        }
    });
    if (typeof window !== "undefined") {
        window[WHITELIST_JSPANEL_REF] = panel;
    }
}

function openEditDialog(existing) {
    var suf = wlFieldSuffix();
    var macInput = $("<input>", {
        type: "text",
        id: "wl-mac-" + suf,
        placeholder: t("whitelist.mac_placeholder")
    }).val(existing ? existing.mac : "");
    macInput.attr("autocomplete", "off");
    if (existing) macInput.prop("disabled", true);
    var nameInput = $("<input>", {
        type: "text",
        id: "wl-name-" + suf,
        placeholder: t("whitelist.name_placeholder")
    }).val(existing ? existing.name : "");
    nameInput.attr("autocomplete", "off");
    var catSel = buildCategorySelect(existing ? existing.category : "pc", "wl-cat-" + suf);
    var locInput = $("<input>", {
        type: "text",
        id: "wl-loc-" + suf,
        placeholder: t("device_list.csv_location_placeholder")
    }).val(existing && existing.capture_location ? existing.capture_location : "");
    locInput.attr("autocomplete", "off");
    var notes = $("<textarea>", {
        id: "wl-notes-" + suf,
        rows: 4,
        placeholder: t("whitelist.notes_placeholder")
    }).val(existing ? existing.notes : "");
    [macInput, nameInput, catSel, locInput, notes].forEach(function (ctrl) {
        wlModalStyleImportant(ctrl, "background-color", "#ffffff");
        wlModalStyleImportant(ctrl, "color", "#212121");
        wlModalStyleImportant(ctrl, "border", "1px solid #bdbdbd");
    });
    var box = $("<div>", { class: "whitelist-form-inner" });
    wlModalStyleImportant(box, "color", "#212121");
    appendFieldRow(box, "whitelist.mac_address", macInput);
    appendFieldRow(box, "whitelist.device_name", nameInput);
    appendFieldRow(box, "whitelist.category", catSel);
    appendFieldRow(box, "device_list.csv_location", locInput);
    appendFieldRow(box, "whitelist.notes", notes);
    showModal(existing ? t("whitelist.edit_title") : t("whitelist.add_title"), box, function (done) {
        var macNorm = String(macInput.val() || "").trim().toUpperCase().replace(/-/g, ":");
        if (!validateMac(macInput.val())) {
            alert(t("whitelist.mac_invalid"));
            return;
        }
        try {
            if (existing) {
                kismet_whitelist_api.updateWhitelistEntry(macNorm, {
                    name: nameInput.val(),
                    category: catSel.val(),
                    notes: notes.val(),
                    capture_location: String(locInput.val() || "").trim()
                });
            } else {
                kismet_whitelist_api.addToWhitelist({
                    mac: macNorm,
                    name: nameInput.val(),
                    category: catSel.val(),
                    notes: notes.val(),
                    capture_location: String(locInput.val() || "").trim()
                });
            }
        } catch (e) {
            var msg = String((e && e.message) ? e.message : e);
            if (msg.toLowerCase().indexOf("duplicate") >= 0) {
                alert(t("whitelist.duplicate_mac"));
            } else {
                alert(msg || t("common.error"));
            }
            return;
        }
        refreshTable();
        done();
    });
}

exports.registerSidebar = function () {
    if (typeof kismet_ui_sidebar === "undefined") return;
    kismet_ui_sidebar.AddSidebarItem({
        id: "whitelist_manage",
        listTitle: "<i class=\"fa fa-shield\"></i> " + t("sidebar.whitelist_manage"),
        priority: -8,
        clickCallback: OpenWhitelistPanel
    });
};

return exports;

}));
