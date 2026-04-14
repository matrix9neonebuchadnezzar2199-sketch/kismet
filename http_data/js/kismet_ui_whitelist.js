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

function appendFieldRow(container, labelKey, control) {
    var row = $("<div>", { class: "whitelist-field-row" });
    var cid = control.attr("id");
    row.append($("<label>", cid ? { for: cid } : {}).text(t(labelKey)));
    row.append(control);
    container.append(row);
}

function showModal(title, body, onOk) {
    var overlay = $("<div>", { class: "kismet-modal-overlay" });
    var modal = $("<div>", { class: "kismet-modal" });
    modal.append($("<div>", { class: "kismet-modal-header" }).text(title));
    modal.append($("<div>", { class: "whitelist-dialog" }).append(body));
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

function validateMac(m) {
    var x = String(m || "").trim().toUpperCase().replace(/-/g, ":");
    return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(x);
}

function updateWlBulkSelectionUi() {
    var n = tabulator ? tabulator.getSelectedData().length : 0;
    var lbl = $("#wl-selected-label");
    if (lbl.length) {
        lbl.text(t("whitelist.selected_count", { count: n }));
    }
    $("#wl-delete-selected-btn").prop("disabled", n === 0);
    var cb = document.getElementById("wl-sel-all-page");
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
    var wrap = $("<div>");
    var toolbar = $("<div>", { class: "whitelist-toolbar" });
    toolbar.append($("<button>", { type: "button", class: "btn btn-primary" }).text(t("whitelist.add_single")).on("click", function () {
        openEditDialog(null);
    }));
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
        var term = $(this).val().toLowerCase();
        tabulator.setFilter(function (data) {
            if (!term) return true;
            return String(data.mac + data.name + data.category + data.notes).toLowerCase().indexOf(term) >= 0;
        });
    });
    toolbar.append(search);
    wrap.append(toolbar);

    var tableHost = $("<div>", { id: "whitelist-table-host" });
    wrap.append(tableHost);

    var bulk = $("<div>", { class: "whitelist-toolbar whitelist-bulk-toolbar" });
    bulk.append($("<label>", { class: "whitelist-sel-all-wrap" }).append(
        $("<input>", { type: "checkbox", id: "wl-sel-all-page" })
    ).append($("<span>").text(" " + t("whitelist.select_all"))));
    bulk.append($("<span>", { id: "wl-selected-label", class: "wl-selected-count" })
        .text(t("whitelist.selected_count", { count: 0 })));
    bulk.append($("<button>", {
        type: "button",
        class: "btn",
        id: "wl-delete-selected-btn"
    }).text(t("whitelist.delete_selected")).prop("disabled", true).on("click", function () {
        if (!confirm(t("whitelist.confirm_delete"))) return;
        var rows = tabulator.getSelectedData();
        var macs = rows.map(function (r) { return r.mac; });
        kismet_whitelist_api.removeBulkFromWhitelist(macs);
        refreshTable();
    }));
    wrap.append(bulk);

    fileInput.on("change", function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            var text = reader.result;
            var preview = String(text).split("\n").slice(0, 6).join("\n");
            var prevBox = $("<pre>").text(preview);
            showModal(t("whitelist.import_csv"), prevBox, function (done) {
                var res = kismet_whitelist_api.importFromCSV(String(text));
                alert(t("whitelist.import_success", { count: res.success }));
                if (res.errors.length) {
                    alert(res.errors.join("\n"));
                }
                refreshTable();
                done();
            });
        };
        reader.readAsText(f);
    });

    $.jsPanel({
        headerTitle: t("whitelist.title"),
        content: wrap,
        theme: "dark",
        width: $(window).width() * 0.85,
        height: $(window).height() * 0.75,
        callback: function () {
            tabulator = new Tabulator("#whitelist-table-host", {
                data: kismet_whitelist_api.getWhitelist(),
                layout: "fitColumns",
                selectableRows: true,
                columns: [
                    {
                        formatter: "rowSelection",
                        titleFormatter: "rowSelection",
                        hozAlign: "center",
                        headerSort: false,
                        frozen: true,
                        width: 40,
                        vertAlign: "middle"
                    },
                    { field: "mac", title: t("whitelist.mac_address"), headerSort: true },
                    { field: "name", title: t("whitelist.device_name") },
                    { field: "category", title: t("whitelist.category") },
                    { field: "notes", title: t("whitelist.notes") },
                    { field: "added_date", title: t("whitelist.added_date") },
                    {
                        title: t("whitelist.edit"),
                        formatter: function () {
                            return "<button class='btn btn-primary'>" + t("whitelist.edit") + "</button>";
                        },
                        cellClick: function (e, cell) {
                            e.stopPropagation();
                            openEditDialog(cell.getRow().getData());
                        }
                    },
                    {
                        title: t("whitelist.delete"),
                        formatter: function () {
                            return "<button type=\"button\" class=\"btn wl-row-delete-btn\">" + t("whitelist.delete") + "</button>";
                        },
                        cellClick: function (e, cell) {
                            e.stopPropagation();
                            if (confirm(t("whitelist.confirm_delete"))) {
                                kismet_whitelist_api.removeFromWhitelist(cell.getRow().getData().mac);
                                refreshTable();
                            }
                        }
                    }
                ]
            });
            $(document).off("change.wlSelAll", "#wl-sel-all-page").on("change.wlSelAll", "#wl-sel-all-page", function () {
                if (!tabulator) return;
                var on = $(this).prop("checked");
                tabulator.getRows().forEach(function (r) {
                    if (on) r.select(); else r.deselect();
                });
                updateWlBulkSelectionUi();
            });
            tabulator.on("rowSelected", updateWlBulkSelectionUi);
            tabulator.on("rowDeselected", updateWlBulkSelectionUi);
            tabulator.on("tableBuilt", updateWlBulkSelectionUi);
        }
    });
}

function openEditDialog(existing) {
    var suf = wlFieldSuffix();
    var macInput = $("<input>", {
        type: "text",
        id: "wl-mac-" + suf,
        autocomplete: "off",
        placeholder: t("whitelist.mac_placeholder")
    }).val(existing ? existing.mac : "");
    if (existing) macInput.prop("disabled", true);
    var nameInput = $("<input>", {
        type: "text",
        id: "wl-name-" + suf,
        autocomplete: "off",
        placeholder: t("whitelist.name_placeholder")
    }).val(existing ? existing.name : "");
    var catSel = buildCategorySelect(existing ? existing.category : "pc", "wl-cat-" + suf);
    var notes = $("<textarea>", {
        id: "wl-notes-" + suf,
        rows: 4,
        placeholder: t("whitelist.notes_placeholder")
    }).val(existing ? existing.notes : "");
    var box = $("<div>", { class: "whitelist-form-inner" });
    appendFieldRow(box, "whitelist.mac_address", macInput);
    appendFieldRow(box, "whitelist.device_name", nameInput);
    appendFieldRow(box, "whitelist.category", catSel);
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
                    notes: notes.val()
                });
            } else {
                kismet_whitelist_api.addToWhitelist({
                    mac: macNorm,
                    name: nameInput.val(),
                    category: catSel.val(),
                    notes: notes.val()
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
