(
  typeof define === "function" ? function (m) { define("kismet-ui-js", m); } :
  typeof exports === "object" ? function (m) { module.exports = m(); } :
  function(m){ this.kismet_ui = m(); }
)(function () {

"use strict";

var local_uri_prefix = "";
if (typeof(KISMET_URI_PREFIX) !== 'undefined')
    local_uri_prefix = KISMET_URI_PREFIX;

function uiI18n(key, fallback) {
    if (typeof kismet_i18n !== "undefined" && kismet_i18n.t) {
        var s = kismet_i18n.t(key);
        if (s && s !== key) return s;
    }
    return fallback;
}

var exports = {};

exports.window_visible = true;

// Load spectrum css and js
$('<link>')
    .appendTo('head')
    .attr({
        type: 'text/css',
        rel: 'stylesheet',
        href: local_uri_prefix + 'css/spectrum.css'
    });
$('<script>')
    .appendTo('head')
    .attr({
        type: 'text/javascript',
        src: local_uri_prefix + 'js/spectrum.js'
    });


exports.last_timestamp = 0;

// Set panels to close on escape system-wide
jsPanel.closeOnEscape = true;

var device_dt = null;

var DeviceViews = [
    {
        name: "All devices",
        view: "all",
        priority: -100000,
        group: "none"
    },
];

/* Add a view option that the user can pick for the main device table;
 * view is expected to be a component of the /devices/views/ api
 */
exports.AddDeviceView = function(name, view, priority, group = 'none') {
    DeviceViews.push({name: name, view: view, priority: priority, group: group});
}

exports.BuildDeviceViewSelector = function(element) {
    var grouped_views = [];

    // Pre-sort the array so that as we build our nested stuff we do it in order
    DeviceViews.sort(function(a, b) {
        if (a.priority < b.priority)
            return -1;
        if (b.priority > a.priority)
            return 1;

        return 0;
    });

    // This isn't efficient but happens rarely, so who cares
    for (var i in DeviceViews) {
        if (DeviceViews[i]['group'] == 'none') {
            // If there's no group, immediately add it to the grouped view
            grouped_views.push(DeviceViews[i]);
        } else {
            // Otherwise look for the group already in the view
            var existing_g = -1;
            for (var g in grouped_views) {
                if (Array.isArray(grouped_views[g])) {
                    if (grouped_views[g][0]['group'] == DeviceViews[i]['group']) {
                        existing_g = g;
                        break;
                    }
                }
            }

            // Make a new sub-array if we don't exist, otherwise append to the existing array
            if (existing_g == -1) {
                grouped_views.push([DeviceViews[i]]);
            } else {
                grouped_views[existing_g].push(DeviceViews[i]);
            }
        }
    }

    var insert_selector = false;
    var selector = $('#devices_views_select', element);
    if (selector.length == 0) {
        selector = $('<select>', {
            name: 'devices_views_select',
            id: 'devices_views_select',
        });
        insert_selector = true;
    } else {
        selector.empty();
    }

    for (var i in grouped_views) {
        if (!Array.isArray(grouped_views[i])) {
            selector.append(
                $('<option>', {
                    value: grouped_views[i]['view']
                }).html(grouped_views[i]['name'])
            );
        } else {
            var optgroup =
                $('<optgroup>', {
                    label: grouped_views[i][0]['group']
                });

            for (var og in grouped_views[i]) {
                optgroup.append(
                    $('<option>', {
                        value: grouped_views[i][og]['view']
                    }).html(grouped_views[i][og]['name'])
                );
            }

            selector.append(optgroup);
        }
    }

    var selected_option = kismet.getStorage('kismet.ui.deviceview.selected', 'all');
    $('option[value="' + selected_option + '"]', selector).prop("selected", "selected");

    if (insert_selector) {
        element.append(selector);
    }

    try {
        selector.selectmenu('refresh');
    } catch (e) {
        selector.selectmenu()
            .selectmenu("menuWidget")
            .addClass("selectoroverflow");

        selector.on("selectmenuselect", function(evt, elem) {
            kismet.putStorage('kismet.ui.deviceview.selected', elem.item.value);
            ScheduleDeviceSummary();
        });
    }

}

// Local maps of views for phys and datasources we've already added
var existing_views = {};
var view_list_updater_tid = 0;

function ScheduleDeviceViewListUpdate() {
    clearTimeout(view_list_updater_tid);
    view_list_updater_tid = setTimeout(ScheduleDeviceViewListUpdate, 5000);

    if (!exports.window_visible)
        return;

    var ds_priority = -5000;
    var phy_priority = -1000;

    $.get(local_uri_prefix + "devices/views/all_views.json")
        .done(function(data) {
            var ds_promises = [];

            var f_datasource_closure = function(uuid) {
                var ds_promise = $.Deferred();

                $.get(local_uri_prefix + "datasource/by-uuid/" + uuid + "/source.json")
                .done(function(dsdata) {
                    var dsdata = kismet.sanitizeObject(dsdata);
                    var synth_view = 'seenby-' + dsdata['kismet.datasource.uuid'];

                    existing_views[synth_view] = 1;

                    exports.AddDeviceView(dsdata['kismet.datasource.name'], synth_view, ds_priority, 'Datasources');
                    ds_priority = ds_priority - 1;
                })
                .always(function() {
                    ds_promise.resolve();
                });

                return ds_promise.promise();
            };

            data = kismet.sanitizeObject(data);

            for (var v in data) {
                if (data[v]['kismet.devices.view.id'] in existing_views)
                    continue;

                if (data[v]['kismet.devices.view.indexed'] == false)
                    continue;

                if (data[v]['kismet.devices.view.id'].substr(0, 7) === 'seenby-') {
                    var uuid = data[v]['kismet.devices.view.id'].substr(7);
                    ds_promises.push(f_datasource_closure(uuid));
                    // ds_promises.push($.get(local_uri_prefix + "datasource/by-uuid/" + uuid + "/source.json"));
                }

                if (data[v]['kismet.devices.view.id'].substr(0, 4) === 'phy-') {
                    existing_views[data[v]['kismet.devices.view.id']] = 1;
                    exports.AddDeviceView(data[v]['kismet.devices.view.description'], data[v]['kismet.devices.view.id'], phy_priority, 'Phy types');
                    phy_priority = phy_priority - 1;
                }
            }

            // Complete all the DS queries
            $.when(ds_promises).then(function(pi) {
                ;
            })
            .done(function() {
                // Skip generating this round if the menu is open
                if ($("div.viewselector > .ui-selectmenu-button").hasClass("ui-selectmenu-button-open")) {
                    ;
                } else {
                    exports.BuildDeviceViewSelector($('span#device_view_holder'));
                }
            });
        });
}

ScheduleDeviceViewListUpdate();

// List of datatable columns we have available
var DeviceColumns = new Array();

// Device row highlights, consisting of fields, function, name, and color
var DeviceRowHighlights = new Array();

/* Add a column to the device list which is called by the table renderer
 *
 * The formatter should return an object, and is given the cell content and
 * row content.
 *
 * Formatters define the columns they pull - multiple fields can be added as
 * invisible helpers for the current column.
 *
 * Required options:
 * 'title': Column title
 * 'description': Description for column picker
 * 'field': Primary field (as single field or Kismet alias array)
 *
 * Optional style options:
 * 'width': Percentage of total column, or pixel width
 * 'alignment': Text alignment ('leftl', 'center', 'right')
 * 'sortable': boolean value to enable sorting on this field
 *
 * Optional functional options:
 * 'searchable': Field is included in searches
 * 'fields': Array of optional fields (as single or Kismet alias array); additional fields are used
 *           by some column renderers to process additional information or to ensure that additional
 *           fields are available; for example the 'channel' column utilizes additional fields to ensure
 *           the presence of the frequency and phyname fields required to render channels intelligently
 *           if the basic info is not available.
 * 'sortfield': Field used for sorting on this column; by default, this is the field passed
 *              as 'field'
 * 'render': Render function that accepts field data, row data, raw cell, an onrender callback
 *           for manipulating the cell once the dom has rendered, and optional parameter
 *           data, and returns a formatted result.
 * 'auxdata': Optional parameter data passed to the render function
*/

var device_columnlist2 = new Map();
var device_columnlist_hidden = new Map();

exports.AddDeviceColumn = (id, options) => {
    var coldef = {
        'kismetId': id,
        'title': options.title,
        'description': options.description,
        'field': null,
        'fields': null,
        'sortfield': null,
        'render': null,
        'auxdata': null,
        'mutate': null,
        'auxmdata': null,
        'sortable': false,
        'searchable': false,
        'width': null,
        'alignment': null,
    };

    if ('field' in options)
        coldef['field'] = options['field'];

    if ('fields' in options)
        coldef['fields'] = options['fields'];

    if ('sortfield' in options) {
        coldef['sortfield'] = options['sortfield'];
    } else {
        coldef['sortfield'] = coldef['field'];
    }

    if ('width' in options) {
        coldef['width'] = options['width'];
    }

    if ('alignment' in options) {
        coldef['alignment'] = options['alignment'];
    }

    if ('render' in options) {
        coldef['render'] = options['render'];
    } else {
        coldef['render'] = (data, rowdata, cell, auxdata) => {
            return data;
        }
    }

    if ('auxdata' in options)
        coldef['auxdata'] = options['auxdata'];

    if ('sortable' in options)
        coldef['sortable'] = options['sortable'];

    if ('titleKey' in options)
        coldef['titleKey'] = options['titleKey'];

    if ('descriptionKey' in options)
        coldef['descriptionKey'] = options['descriptionKey'];

    device_columnlist2.set(id, coldef);
}

/**
 * Wrap an existing device column render function (by kismetId, e.g. "commonname").
 * wrapperFn(data, row, cell, onrender, aux, prevRender) must return HTML string; call
 * prevRender(...) for the original output.
 */
exports.WrapDeviceColumnRender = function(columnId, wrapperFn) {
    if (typeof wrapperFn !== "function") {
        return false;
    }
    var c = device_columnlist2.get(columnId);
    if (!c || typeof c.render !== "function") {
        return false;
    }
    var prev = c.render;
    c.render = function(data, row, cell, onrender, aux) {
        return wrapperFn(data, row, cell, onrender, aux, prev);
    };
    return true;
};

/* Add a hidden device column that is used for other utility, but not specifically displayed;
 * for instance the device key column must always be present.
 *
 * Required elements in the column definition:
 * 'field': Field definition, either string, path, or Kismet simplification array
 * 'searchable': Boolean, field is included in searches
 *
 * */
exports.AddHiddenDeviceColumn = (coldef) => {
    var f;

    if (typeof(coldef['field']) === 'string') {
        var fs = coldef['field'].split("/");
        f = fs[fs.length - 1];
    } else if (Array.isArray(coldef['field'])) {
        f = coldef['field'][1];
    }

    device_columnlist_hidden.set(f, coldef);
}

/* Always add the device key */
exports.AddHiddenDeviceColumn({'field': "kismet.device.base.key"});

var devicelistIconMatch = [];

/* Add an icon matcher; return a html string for the icon (font-awesome or self-embedded svg)
 * that is used in the menu/icon column.  Return null if not matched.
 *
 * Matcher function
 */
exports.AddDeviceIcon = (matcher) => {
    devicelistIconMatch.push(matcher);
}

/* Add a row highlighter for coloring rows; expects an options dictionary containing:
 * name: Simple name
 * description: Longer description
 * priority: Priority for assigning color
 * defaultcolor: rgb default color
 * defaultenable: optional bool, should be turned on by default
 * fields: *array* of field definitions, each of which may be a single or two-element
 *  field definition/path.  A *single* field must still be represented as an array,
 *  ie, ['some.field.def'].  Multiple fields and complex fields could be represented
 *  as ['some.field.def', 'some.second.field', ['some.complex/field.path', 'field.foo']]
 * selector: function(data) returning true for color or false for ignore
 * cssClass: optional CSS class on the Tabulator row (e.g. for readable text on dark tint)
 */
exports.AddDeviceRowHighlight = function(options) {

    // Load enable preference
    var storedenable =
        kismet.getStorage('kismet.rowhighlight.enable' + options.name, 'NONE');

    if (storedenable === 'NONE') {
        if ('defaultenable' in options) {
            options['enable'] = options['defaultenable'];
        } else {
            options['enable'] = true;
        }
    } else {
        options['enable'] = storedenable;
    }

    // Load color preference
    var storedcolor =
        kismet.getStorage('kismet.rowhighlight.color' + options.name, 'NONE');

    if (storedcolor !== 'NONE') {
        options['color'] = storedcolor;
    } else {
        options['color'] = options['defaultcolor'];
    }

    DeviceRowHighlights.push(options);

    DeviceRowHighlights.sort(function(a, b) {
        if (a.priority < b.priority)
            return -1;
        if (b.priority > a.priority)
            return 1;

        return 0;
    });
}

exports.AddDetail = function(container, id, title, pos, options) {
    var settings = $.extend({
        "filter": null,
        "render": null,
        "draw": null
    }, options);

    var det = {
        id: id,
        title: title,
        position: pos,
        options: settings
    };

    container.push(det);

    container.sort(function(a, b) {
        return a.position - b.position;
    });
}

exports.DetailWindow = function(key, title, options, window_cb, close_cb) {
    // Generate a unique ID for this dialog
    var dialogid = "detaildialog" + key;
    var dialogmatch = '#' + dialogid;

    if (jsPanel.activePanels.list.indexOf(dialogid) != -1) {
        jsPanel.activePanels.getPanel(dialogid).front();
        return;
    }

    var h = $(window).height() - 5;

    // If we're on a wide-screen browser, try to split it into 3 details windows
    var w = ($(window).width() / 3) - 10;

    // If we can't, split it into 2.  This seems to look better when people
    // don't run full-size browser windows.
    if (w < 450) {
        w = ($(window).width() / 2) - 5;
    }

    // Finally make it full-width if we're still narrow
    if (w < 450) {
        w = $(window).width() - 5;
    }

    var panel = $.jsPanel({
        theme: 'dark',

        id: dialogid,
        headerTitle: title,

        headerControls: {
            iconfont: 'jsglyph',
            controls: 'closeonly',
        },

        position: {
            "my": "left-top",
            "at": "left-top",
            "of": "window",
            "offsetX": 2,
            "offsetY": 2,
            "autoposition": "RIGHT"
        },

        resizable: {
            minWidth: 450,
            minHeight: 400,
            stop: function(event, ui) {
                $('div#accordion', ui.element).accordion("refresh");
            }
        },

        onmaximized: function() {
            $('div#accordion', this.content).accordion("refresh");
        },

        onnormalized: function() {
            $('div#accordion', this.content).accordion("refresh");
        },

        onclosed: function() {
            close_cb(this, options);
        },

        callback: function() {
            window_cb(this, options);
        },
    }).resize({
        width: w,
        height: h,
        callback: function(panel) {
            $('div#accordion', this.content).accordion("refresh");
        },
    });

    // Did we creep off the screen in our autopositioning?  Put this panel in
    // the left if so (or if it's a single-panel situation like mobile, just
    // put it front and center)
    if (panel.offset().left + panel.width() > $(window).width()) {
        panel.reposition({
            "my": "left-top",
            "at": "left-top",
            "of": "window",
            "offsetX": 2,
            "offsetY": 2,
        });
    }

}

exports.DeviceDetails = new Array();

/* Register a device detail accordion panel, taking an id for the panel
 * content, a title presented to the user, a position in the list, and
 * options.  Because details are directly rendered all the time and
 * can't be moved around / saved as configs like columns can, callbacks
 * are just direct functions here.
 *
 * filter and render take one argument, the data to be shown
 * filter: function(data) {
 *  return false;
 * }
 *
 * render: function(data) {
 *  return "Some content";
 * }
 *
 * draw takes the device data and a container element as an argument:
 * draw: function(data, element) {
 *  e.append("hi");
 * }
 * */
exports.AddDeviceDetail = function(id, title, pos, options) {
    exports.AddDetail(exports.DeviceDetails, id, title, pos, options);
}

exports.GetDeviceDetails = function() {
    return exports.DeviceDetails;
}

exports.DeviceDetailWindow = function(key) {
    exports.DetailWindow(key, "Device Details",
        {
            storage: {}
        },

        function(panel, options) {
            var content = panel.content;

            panel.active = true;

            window['storage_devlist_' + key] = {};

            panel.updater = function() {
                if (exports.window_visible) {
                    $.get(local_uri_prefix + "devices/by-key/" + key + "/device.json")
                        .done(function(fulldata) {
                            if (!panel.active) {
                                return;
                            }

                            fulldata = kismet.sanitizeObject(fulldata);

                            panel.headerTitle("Device: " + kismet.censorString(fulldata['kismet.device.base.commonname']));

                            var accordion = $('div#accordion', content);

                            if (accordion.length == 0) {
                                accordion = $('<div></div>', {
                                    id: 'accordion'
                                });

                                content.append(accordion);
                            }

                            var detailslist = kismet_ui.GetDeviceDetails();

                            for (var dii in detailslist) {
                                var di = detailslist[dii];

                                // Do we skip?
                                if ('filter' in di.options &&
                                    typeof(di.options.filter) === 'function') {
                                    if (di.options.filter(fulldata) == false) {
                                        continue;
                                    }
                                }

                                var vheader = $('h3#header_' + di.id, accordion);

                                if (vheader.length == 0) {
                                    vheader = $('<h3>', {
                                        id: "header_" + di.id,
                                    })
                                        .html(di.title);

                                    accordion.append(vheader);
                                }

                                var vcontent = $('div#' + di.id, accordion);

                                if (vcontent.length == 0) {
                                    vcontent = $('<div>', {
                                        id: di.id,
                                    });
                                    accordion.append(vcontent);
                                }

                                // Do we have pre-rendered content?
                                if ('render' in di.options &&
                                    typeof(di.options.render) === 'function') {
                                    vcontent.html(di.options.render(fulldata));
                                }

                                if ('draw' in di.options &&
                                    typeof(di.options.draw) === 'function') {
                                    di.options.draw(fulldata, vcontent, options, 'storage_devlist_' + key);
                                }

                                if ('finalize' in di.options &&
                                    typeof(di.options.finalize) === 'function') {
                                    di.options.finalize(fulldata, vcontent, options, 'storage_devlist_' + key);
                                }
                            }
                            accordion.accordion({ heightStyle: 'fill' });
                        })
                        .fail(function(jqxhr, texterror) {
                            content.html("<div style=\"padding: 10px;\"><h1>Oops!</h1><p>An error occurred loading device details for key <code>" + key +
                                "</code>: HTTP code <code>" + jqxhr.status + "</code>, " + texterror + "</div>");
                        })
                        .always(function() {
                            if (panel.active) {
                                panel.timerid = setTimeout(function() { panel.updater(); }, 1000);
                            }
                        })
                } else {
                    if (panel.active) {
                        panel.timerid = setTimeout(function() { panel.updater(); }, 1000);
                    }
                }
            };

            panel.updater();

            new ClipboardJS('.copyuri');
        },

        function(panel, options) {
            clearTimeout(panel.timerid);
            panel.active = false;
            window['storage_devlist_' + key] = {};
        });

};

exports.RenderTrimmedTime = function(opts) {
    return (new Date(opts['value'] * 1000).toString()).substring(4, 25);
}

exports.RenderHumanSize = function(opts) {
    return kismet.HumanReadableSize(opts['value']);
};

// Central location to register channel conversion lists.  Conversion can
// be a function or a fixed dictionary.
exports.freq_channel_list = { };
exports.human_freq_channel_list = { };

exports.AddChannelList = function(phyname, humanname, channellist) {
    exports.freq_channel_list[phyname] = channellist;
    exports.human_freq_channel_list[humanname] = channellist;
}

// Get a list of human frequency conversions
exports.GetChannelListKeys = function() {
    return Object.keys(exports.human_freq_channel_list);
}

// Get a converted channel name, or the raw frequency if we can't help
exports.GetConvertedChannel = function(humanname, frequency) {
    if (humanname in exports.human_freq_channel_list) {
        var conv = exports.human_freq_channel_list[humanname];

        if (typeof(conv) === "function") {
            // Call the conversion function if one exists
            return conv(frequency);
        } else if (frequency in conv) {
            // Return the mapped value
            return conv[frequency];
        }
    }

    // Return the frequency if we couldn't figure out what to do
    return frequency;
}

// Get a converted channel name, or the raw frequency if we can't help
exports.GetPhyConvertedChannel = function(phyname, frequency) {
    if (phyname in exports.freq_channel_list) {
        var conv = exports.freq_channel_list[phyname];

        if (typeof(conv) === "function") {
            // Call the conversion function if one exists
            return conv(frequency);
        } else if (frequency in conv) {
            // Return the mapped value
            return conv[frequency];
        }
    }

    // Return the frequency if we couldn't figure out what to do
    return kismet.HumanReadableFrequency(frequency);
}

exports.connection_error = 0;
exports.connection_error_panel = null;

exports.HealthCheck = function() {
    var timerid;

    if (exports.window_visible) {
        $.get(local_uri_prefix + "system/status.json")
            .done(function(data) {
                data = kismet.sanitizeObject(data);

                if (exports.connection_error && exports.connection_error_panel) {
                    try {
                        exports.connection_error_panel.close();
                        exports.connection_error_panel = null;
                    } catch (e) {
                        ;
                    }
                }

                exports.connection_error = 0;

                exports.last_timestamp = data['kismet.system.timestamp.sec'];
            })
            .fail(function() {
                if (exports.connection_error >= 3 && exports.connection_error_panel == null) {
                    exports.connection_error_panel = $.jsPanel({
                        theme: 'dark',
                        id: "connection-alert",
                        headerTitle: 'Cannot Connect to Kismet',
                        headerControls: {
                            controls: 'none',
                            iconfont: 'jsglyph',
                        },
                        contentSize: "auto auto",
                        paneltype: 'modal',
                        content: '<div style="padding: 10px;"><h3><i class="fa fa-exclamation-triangle" style="color: red;"></i> Sorry!</h3><p>Cannot connect to the Kismet webserver.  Make sure Kismet is still running on this host!<p><i class="fa fa-refresh fa-spin" style="margin-right: 5px"></i> Connecting to the Kismet server...</div>',
                    });
                }

                exports.connection_error++;
            })
            .always(function() {
                if (exports.connection_error)
                    timerid = setTimeout(exports.HealthCheck, 1000);
                else
                    timerid = setTimeout(exports.HealthCheck, 5000);
            });
    } else {
        if (exports.connection_error)
            timerid = setTimeout(exports.HealthCheck, 1000);
        else
            timerid = setTimeout(exports.HealthCheck, 5000);
    }

}


exports.DegToDir = function(deg) {
    var directions = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW"
    ];

    var degrees = [
        0, 23, 45, 68,
        90, 113, 135, 158,
        180, 203, 225, 248,
        270, 293, 315, 338
    ];

    for (var p = 1; p < degrees.length; p++) {
        if (deg < degrees[p])
            return directions[p - 1];
    }

    return directions[directions.length - 1];
}

// Use our settings to make some conversion functions for distance and temperature
exports.renderDistance = function(k, precision = 5) {
    if (kismet.getStorage('kismet.base.unit.distance') === 'metric' ||
            kismet.getStorage('kismet.base.unit.distance') === '') {
        if (k < 1) {
            return (k * 1000).toFixed(precision) + ' m';
        }

        return k.toFixed(precision) + ' km';
    } else {
        var m = (k * 0.621371);

        if (m < 1) {
            return (5280 * m).toFixed(precision) + ' feet';
        }
        return (k * 0.621371).toFixed(precision) + ' miles';
    }
}

// Use our settings to make some conversion functions for distance and temperature
exports.renderHeightDistance = function(m, precision = 5) {
    if (kismet.getStorage('kismet.base.unit.distance') === 'metric' ||
            kismet.getStorage('kismet.base.unit.distance') === '') {
        if (m < 1000) {
            return m.toFixed(precision) + ' m';
        }

        return (m / 1000).toFixed(precision) + ' km';
    } else {
        var f = (m * 3.2808399);

        if (f < 5280) {
            return f.toFixed(precision) + ' feet';
        }
        return (f / 5280).toFixed(precision) + ' miles';
    }
}

exports.renderSpeed = function(kph, precision = 5) {
    if (kismet.getStorage('kismet.base.unit.speed') === 'metric' ||
            kismet.getStorage('kismet.base.unit.speed') === '') {
        return kph.toFixed(precision) + ' KPH';
    } else {
        return (kph * 0.621371).toFixed(precision) + ' MPH';
    }
}

exports.renderTemperature = function(c, precision = 5) {
    if (kismet.getStorage('kismet.base.unit.temp') === 'celsius' ||
            kismet.getStorage('kismet.base.unit.temp') === '') {
        return c.toFixed(precision) + '&deg; C';
    } else {
        return (c * (9/5) + 32).toFixed(precision) + '&deg; F';
    }
}

// Add the row highlighting
kismet_ui_settings.AddSettingsPane({
    id: 'core_device_row_highlights',
    listTitle: 'Device Row Highlighting',
    i18nKey: 'settings.pane_device_rows',
    create: function(elem) {
        elem.append(
            $('<form>', {
                id: 'form'
            })
            .append(
                $('<fieldset>', {
                    id: 'fs_devicerows'
                })
                .append(
                    $('<legend>', {})
                    .html(uiI18n('settings.device_rows_fs_legend', 'Device Row Highlights'))
                )
                .append(
                    $('<table>', {
                        id: "devicerow_table",
                        width: "100%",
                    })
                    .append(
                        $('<tr>', {})
                        .append(
                            $('<th>')
                        )
                        .append(
                            $('<th>')
                            .html(uiI18n('settings.table_name', 'Name'))
                        )
                        .append(
                            $('<th>')
                            .html(uiI18n('settings.table_color', 'Color'))
                        )
                        .append(
                            $('<th>')
                            .html(uiI18n('settings.table_description', 'Description'))
                        )
                    )
                )
            )
        );

        $('#form', elem).on('change', function() {
            kismet_ui_settings.SettingsModified();
        });

        for (var ri in DeviceRowHighlights) {
            var rh = DeviceRowHighlights[ri];

            var row =
                $('<tr>')
                .attr('hlname', rh['name'])
                .append(
                    $('<td>')
                    .append(
                        $('<input>', {
                            type: "checkbox",
                            class: "k-dt-enable",
                        })
                    )
                )
                .append(
                    $('<td>')
                    .html((function() {
                        if ('labelKey' in rh && rh['labelKey']) {
                            return uiI18n(rh['labelKey'],
                                ('label' in rh && rh['label']) ? rh['label'] : rh['name']);
                        }
                        return ('label' in rh && rh['label']) ? rh['label'] : rh['name'];
                    })())
                )
                .append(
                    $('<td>')
                    .append(
                        $('<input>', {
                            type: "text",
                            value: rh['color'],
                            class: "k-dt-colorwidget"
                        })
                    )
                )
                .append(
                    $('<td>')
                    .html((function() {
                        if ('descriptionKey' in rh && rh['descriptionKey']) {
                            return uiI18n(rh['descriptionKey'], rh['description']);
                        }
                        return rh['description'];
                    })())
                );

            $('#devicerow_table', elem).append(row);

            if (rh['enable']) {
                $('.k-dt-enable', row).prop('checked', true);
            }

            $(".k-dt-colorwidget", row).spectrum({
                showInitial: true,
                preferredFormat: "rgb",
            });

        }
    },
    save: function(elem) {
        $('tr', elem).each(function() {
            kismet.putStorage('kismet.rowhighlight.color' + $(this).attr('hlname'), $('.k-dt-colorwidget', $(this)).val());

            kismet.putStorage('kismet.rowhighlight.enable' + $(this).attr('hlname'), $('.k-dt-enable', $(this)).is(':checked'));

            for (var ri in DeviceRowHighlights) {
                if (DeviceRowHighlights[ri]['name'] === $(this).attr('hlname')) {
                    DeviceRowHighlights[ri]['color'] = $('.k-dt-colorwidget', $(this)).val();
                    DeviceRowHighlights[ri]['enable'] = $('.k-dt-enable', $(this)).is(':checked');
                }
            }
        });
    },
});

/* Generate the list of fields we request from the server */
function GenerateDeviceFieldList2() {
    var retcols = new Map();

    for (const [k, v] of device_columnlist_hidden) {
        if (typeof(v['field']) === 'string') {
            retcols.set(v, v['field']);
        } else if (Array.isArray(v['field'])) {
            retcols.set(v['field'][1], v);
        }
    };

    for (const [k, c] of device_columnlist2) {
        /*
        if (devicetable_prefs['columns'].length > 0 &&
            !devicetable_prefs['columns'].includes(c['kismetId']))
            continue;
            */

        if (c['field'] != null) {
            if (typeof(c['field']) === 'string') {
                retcols.set(c['field'], c['field']);
            } else if (Array.isArray(c['field'])) {
                retcols.set(c['field'][1], c['field']);
            }
        }

        if (c['fields'] != null) {
            for (const cf of c['fields']) {
                if (typeof(cf) === 'string') {
                    retcols.set(cf, cf);
                } else if (Array.isArray(cf)) {
                    retcols.set(cf[1], cf);
                }

            }
        }
    }

    for (var i in DeviceRowHighlights) {
        for (var f in DeviceRowHighlights[i]['fields']) {
            retcols.set(DeviceRowHighlights[i]['fields'][f],
                DeviceRowHighlights[i]['fields'][f]);
        }
    }

    var ret = [];

    for (const [k, v] of retcols) {
        ret.push(v);
    };

    return ret;
}

/* Generate a single column for the devicelist tabulator format */
function GenerateDeviceTabulatorColumn(c) {
    var resolvedTitle = c['title'];
    if (c['titleKey'] && typeof kismet_i18n !== 'undefined' && kismet_i18n.t) {
        var tr = kismet_i18n.t(c['titleKey']);
        if (tr && tr !== c['titleKey']) {
            resolvedTitle = tr;
        }
    }
    var col = {
        'field': c['kismetId'],
        'title': resolvedTitle,
        'formatter': (cell, formatterParams, onRendered) => {
            var runWhenCellInDom = function (cb) {
                if (typeof cb !== "function") {
                    return;
                }
                if (typeof onRendered === "function") {
                    onRendered(cb);
                } else {
                    setTimeout(function () {
                        try {
                            cb();
                        } catch (e2) {
                            ;
                        }
                    }, 0);
                }
            };
            try {
                return c['render'](cell.getValue(), cell.getRow().getData(), cell, runWhenCellInDom, c['auxdata']);
            } catch (e) {
                return cell.getValue();
            }
        },
        'headerSort': c['sortable'],
        'headerContextMenu':  [ {
            'label': (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ? kismet_i18n.t('common.hide_column') : 'Hide Column',
            'action': function(e, column) {
                devicetable_prefs['columns'] = devicetable_prefs['columns'].filter(c => {
                    return c !== column.getField();
                });
                SaveDeviceTablePrefs();

                deviceTabulator.deleteColumn(column.getField())
                .then(col => {
                    ScheduleDeviceSummary();
                });
            }
        }, ],
    };

    var colsettings = {};
    if (c['kismetId'] in devicetable_prefs['colsettings']) {
        colsettings = devicetable_prefs['colsettings'][c['kismetId']];
    }

    if ('width' in colsettings) {
        col['width'] = colsettings['width'];
    } else if (c['width'] != null) {
        col['width'] = c['width'];
    }

    if (c['alignment'] != null)
        col['hozAlign'] = c['alignment'];

    return col;
}

/* Generate the columns for the devicelist tabulator format */
function GenerateDeviceColumns2() {
    var columns = [];

    var columnlist = [];
    if (devicetable_prefs['columns'].length == 0) {
        for (const [k, v] of device_columnlist2) {
            columnlist.push(k);
        }
    } else {
        columnlist = devicetable_prefs['columns'];
    }

    for (const k of columnlist) {
        if (!device_columnlist2.has(k)) {
            // console.log("could not find ", k);
            continue;
        }

        const c = device_columnlist2.get(k);

        columns.push(GenerateDeviceTabulatorColumn(c));
    }

    columns.unshift({
        'title': "",
        'width': '1px',
        'headerSort': false,
        'frozen': true,
        'hozAlign': 'center',
        'formatter': (cell, params, onrender) => {
            // return c['render'](cell.getValue(), cell.getRow().getData(), cell, onrender, c['auxdata']);
            for (const i of devicelistIconMatch) {
                try {
                    var icn = i(cell.getRow().getData());
                    if (icn != null) {
                        return icn;
                    }
                } catch (e) {
                    ;
                }
            }

            return '<i class="fa fa-question"></i>';
        },
        'headerMenu': () => {
            var colsub = [];
            var columns = deviceTabulator.getColumns();
            for (const [k, v] of device_columnlist2) {
                if (columns.filter(c => { return c.getField() === k; }).length > 0) {
                    continue;
                }

                colsub.push({
                    'label': v['title'],
                    'action': () => {
                        devicetable_prefs['columns'].push(v['kismetId']);
                        SaveDeviceTablePrefs();

                        const c = device_columnlist2.get(v['kismetId']);

                        deviceTabulator.addColumn(GenerateDeviceTabulatorColumn(c))
                        .then(col => {
                            ScheduleDeviceSummary();
                        });

                    }
                });
            }

            var delsub = [];
            for (const [k, v] of device_columnlist2) {
                if (columns.filter(c => { return c.getField() === k; }).length == 0) {
                    continue;
                }

                delsub.push({
                    'label': v['title'],
                    'action': () => {
                        devicetable_prefs['columns'] = devicetable_prefs['columns'].filter(c => {
                            return c !== v['kismetId'];
                        });
                        SaveDeviceTablePrefs();

                        deviceTabulator.deleteColumn(v['kismetId'])
                            .then(col => {
                                ScheduleDeviceSummary();
                            });
                    }
                });
            }

            if (colsub.length == 0) {
                colsub.push({
                    'label': '<i>All columns visible</i>',
                    'disabled': true,
                });
            }

            return [
                {
                    'label': "Add Column",
                    menu: colsub,
                },
                {
                    'label': "Remove Column",
                    menu: delsub,
                },
            ];
        },
    });

    if (typeof kismet_whitelist_api !== "undefined") {
        columns.unshift({
            formatter: "rowSelection",
            titleFormatter: "rowSelection",
            hozAlign: "center",
            headerSort: false,
            frozen: true,
            width: 40,
            vertAlign: "middle"
        });
    }

    return columns;
}

exports.PrepDeviceTable = function(element) {
    devicetableHolder2 = element;
}

/* Create the device table */
exports.CreateDeviceTable = function(element) {
    element.ready(function() {
        exports.InitializeDeviceTable(element);
    });
}

var deviceTid2 = -1;

var devicetableHolder2 = null;
var devicetableElement2 = null;
var deviceTabulator = null;
var deviceTablePage = 0;
var deviceTableTotal = 0;
var deviceTableTotalPages = 0;
var deviceTableRefreshBlock = false;
var deviceTableRefreshing = false;

/** Minimum last signal (dBm) for device list, or null for no filter. Same semantics as unassociated (e.g. -60 means last_signal &gt;= -60). */
var deviceListMinSignal = null;

/** Device kind filter: all | unassoc | ap */
var deviceListKindFilter = 'all';

/** Rows shown after optional client-side signal filter (current page). */
var deviceTableRowsThisPage = 0;

/** device_key -> whitelist entry fields; persists across auto-refresh of the device table */
var deviceListWhitelistPick = new Map();

var deviceListWlToolbarEventsBound = false;

function deviceRowLastSignalDbm(row) {
    if (row['signal'] !== undefined && row['signal'] !== null && row['signal'] !== 0 && row['signal'] !== '0') {
        return Number(row['signal']);
    }
    var od = row['original_data'];
    if (!od)
        return null;
    if (od['device_last_signal'] !== undefined && od['device_last_signal'] !== null && od['device_last_signal'] !== 0)
        return Number(od['device_last_signal']);
    var sig = od['kismet.device.base.signal'];
    if (sig && sig['kismet.common.signal.last_signal'] != null)
        return parseFloat(sig['kismet.common.signal.last_signal']);
    if (od['kismet.common.signal.last_signal'] != null)
        return parseFloat(od['kismet.common.signal.last_signal']);
    return null;
}

function deviceRowMatchesKind(od, kind) {
    if (!kind || kind === 'all')
        return true;
    if (!od)
        return false;
    if (kind === 'ap') {
        var t = (od['kismet.device.base.type'] || '').toString();
        if (t.indexOf('Wi-Fi AP') >= 0)
            return true;
        if (t.toLowerCase().indexOf('access point') >= 0)
            return true;
        return false;
    }
    if (kind === 'unassoc') {
        if (typeof kismet_ui_unassociated_module !== 'undefined' &&
            typeof kismet_ui_unassociated_module.isUnassociatedClient === 'function') {
            return kismet_ui_unassociated_module.isUnassociatedClient(od);
        }
        return false;
    }
    return true;
}

function deviceRowToWhitelistEntry(rowData) {
    if (!rowData) {
        return null;
    }
    var od = rowData.original_data || {};
    var mac = (od["kismet.device.base.macaddr"] || "").toString().trim();
    if (!mac && rowData["kismet.device.base.macaddr"] != null) {
        mac = String(rowData["kismet.device.base.macaddr"]).trim();
    }
    if (!mac) {
        return null;
    }
    var displayName = (od["kismet.device.base.name"] || od["kismet.device.base.manuf"] || mac || "").toString();
    return {
        mac: mac,
        name: displayName,
        category: "other",
        notes: "device-list"
    };
}

/** Stable Map key for deviceListWhitelistPick (device_key, else mac: normalized). */
function deviceListWhitelistPickKey(d) {
    if (!d) {
        return "";
    }
    if (d.device_key != null && String(d.device_key) !== "") {
        return String(d.device_key);
    }
    var od = d.original_data || {};
    var mac = (od["kismet.device.base.macaddr"] || "").toString().trim();
    if (!mac) {
        return "";
    }
    return "mac:" + mac.toUpperCase().replace(/-/g, ":");
}

function syncDeviceListWhitelistPickRow(row, selected) {
    var d = row.getData();
    var key = deviceListWhitelistPickKey(d);
    if (!key) {
        return;
    }
    if (selected) {
        var e = deviceRowToWhitelistEntry(d);
        if (e && e.mac) {
            deviceListWhitelistPick.set(key, e);
        }
    } else {
        deviceListWhitelistPick.delete(key);
    }
}

/** Forwards to kismet_whitelist_api debug when LS flag set (script order: api loads after this file; OK at click time). */
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

function deviceTabulatorSelectedCount() {
    if (!deviceTabulator) {
        return { n: 0, total: 0 };
    }
    try {
        var rows = deviceTabulator.getRows();
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

/**
 * Entries for bulk whitelist register.
 * Include all visible rows when toolbar「全選択」is checked OR every row reports selected
 * (Tabulator header select-all without syncing the toolbar checkbox). Dedupe by MAC.
 * Falls back to getData() if getRows() is empty but the page select-all box is checked.
 */
function gatherDeviceListWhitelistEntriesForBulk() {
    var entries = [];
    var seenMac = {};
    function pushEntry(e) {
        if (!e || !e.mac) return;
        var m = String(e.mac).trim().toUpperCase().replace(/-/g, ":");
        if (!m || seenMac[m]) return;
        seenMac[m] = 1;
        entries.push(e);
    }
    if (!deviceTabulator) {
        deviceListWhitelistPick.forEach(function (v) {
            pushEntry(v);
        });
        wlUiDbg("device_gather_no_tabulator", { entries: entries.length });
        return entries;
    }
    var cb = document.getElementById("device-list-wl-sel-all");
    var sc = deviceTabulatorSelectedCount();
    var implicitAll = sc.total > 0 && sc.n === sc.total;
    var pageAll = (cb && cb.checked) || implicitAll;
    var i;
    var rows = [];
    try {
        rows = deviceTabulator.getRows() || [];
    } catch (eRows) {
        rows = [];
    }
    if (rows.length) {
        for (i = 0; i < rows.length; i++) {
            try {
                if (!pageAll && !rows[i].isSelected()) {
                    continue;
                }
                var e = deviceRowToWhitelistEntry(rows[i].getData());
                pushEntry(e);
                if (e && e.mac) {
                    var key = deviceListWhitelistPickKey(rows[i].getData());
                    if (key) {
                        deviceListWhitelistPick.set(key, e);
                    }
                }
            } catch (eRow) {
                ;
            }
        }
    } else if (pageAll && typeof deviceTabulator.getData === "function") {
        try {
            var flat = deviceTabulator.getData();
            if (flat && flat.length) {
                for (i = 0; i < flat.length; i++) {
                    var e2 = deviceRowToWhitelistEntry(flat[i]);
                    pushEntry(e2);
                    if (e2 && e2.mac) {
                        var k2 = deviceListWhitelistPickKey(flat[i]);
                        if (k2) {
                            deviceListWhitelistPick.set(k2, e2);
                        }
                    }
                }
            }
        } catch (eFlat) {
            ;
        }
    }
    if (!entries.length) {
        deviceListWhitelistPick.forEach(function (v) {
            pushEntry(v);
        });
    }
    var gdLen = -1;
    try {
        if (typeof deviceTabulator.getData === "function") {
            var gd = deviceTabulator.getData();
            gdLen = gd ? gd.length : 0;
        }
    } catch (eGd) {
        gdLen = -1;
    }
    var pickSz = -1;
    try {
        pickSz = deviceListWhitelistPick.size;
    } catch (ePs) {
        pickSz = -1;
    }
    wlUiDbg("device_gather", {
        entries: entries.length,
        pickSize: pickSz,
        pageAll: pageAll,
        implicitAll: implicitAll,
        nSel: sc.n,
        rowTotal: sc.total,
        getRows: rows.length,
        getDataLen: gdLen,
        cbChecked: !!(cb && cb.checked)
    });
    return entries;
}

function updateDeviceListWlToolbar() {
    var n = deviceListWhitelistPick.size;
    var el = $("#device-list-wl-count");
    if (el.length) {
        el.text((typeof kismet_i18n !== "undefined" && kismet_i18n.t) ?
            kismet_i18n.t("whitelist.selected_count", { count: n }) :
            (String(n) + " selected"));
    }
}

function updateDeviceListWlSelectAllCheckbox() {
    var cb = document.getElementById("device-list-wl-sel-all");
    if (!cb || !deviceTabulator) {
        return;
    }
    var rows = deviceTabulator.getRows();
    if (!rows.length) {
        cb.checked = false;
        cb.indeterminate = false;
        return;
    }
    var n = 0;
    rows.forEach(function (r) {
        if (r.isSelected()) {
            n++;
        }
    });
    cb.checked = n === rows.length && n > 0;
    cb.indeterminate = n > 0 && n < rows.length;
}

function restoreDeviceListWhitelistSelections() {
    if (!deviceTabulator) {
        return;
    }
    try {
        deviceTabulator.getRows().forEach(function (r) {
            var dk = deviceListWhitelistPickKey(r.getData());
            if (dk && deviceListWhitelistPick.has(dk)) {
                r.select();
            }
        });
        updateDeviceListWlSelectAllCheckbox();
    } catch (exWl) {
        ;
    }
}

function csvQuoteCell(val) {
    var s = (val === undefined || val === null) ? '' : String(val);
    return '"' + s.replace(/"/g, '""') + '"';
}

function exportDeviceTableCsv() {
    if (!deviceTabulator) {
        return;
    }
    var rows = deviceTabulator.getData();
    if (!rows || rows.length === 0) {
        var em = (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ? kismet_i18n.t('device_list.csv_empty') : 'No rows to export.';
        try { alert(em); } catch (e) { }
        return;
    }
    var hdr = [
        'kismet.device.base.key',
        'wlan.sa (IEEE 802.11 MAC)',
        'kismet.device.base.type',
        'kismet.device.base.name',
        'last_signal_dbm',
        'kismet.device.base.channel',
        'kismet.device.base.manuf',
        'kismet.device.base.last_time (unix)',
        'wireshark.display_filter'
    ];
    var lines = [hdr.map(csvQuoteCell).join(',')];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var od = r.original_data || {};
        var mac = (od['kismet.device.base.macaddr'] || '').toString().toLowerCase();
        var key = (r.device_key || od['kismet.device.base.key'] || '').toString();
        var typ = (od['kismet.device.base.type'] || '').toString();
        var nm = (od['kismet.device.base.name'] || '').toString();
        var sig = deviceRowLastSignalDbm(r);
        if (sig === null || isNaN(sig))
            sig = '';
        var ch = od['kismet.device.base.channel'];
        if (ch === undefined || ch === null)
            ch = '';
        var man = (od['kismet.device.base.manuf'] || '').toString();
        var lt = od['kismet.device.base.last_time'];
        if (lt === undefined || lt === null)
            lt = '';
        var wdf = '';
        if (mac && /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
            wdf = 'wlan.addr == ' + mac;
        }
        lines.push([
            csvQuoteCell(key),
            csvQuoteCell(mac),
            csvQuoteCell(typ),
            csvQuoteCell(nm),
            csvQuoteCell(sig),
            csvQuoteCell(ch),
            csvQuoteCell(man),
            csvQuoteCell(lt),
            csvQuoteCell(wdf)
        ].join(','));
    }
    var bom = '\uFEFF';
    var blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = 'kismet_device_export_' + ts + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 500);
}

function ScheduleDeviceSummary() {
    if (deviceTid2 != -1)
        clearTimeout(deviceTid2);

    deviceTid2 = setTimeout(ScheduleDeviceSummary, 1000);

    try {
        if (!deviceTableRefreshing && deviceTabulator != null && exports.window_visible && devicetableElement2.is(":visible")) {

            deviceTableRefreshing = true;

            var msRaw = kismet.getStorage('kismet.ui.devicelist.min_signal', '');
            if (msRaw === '' || msRaw === null) {
                deviceListMinSignal = null;
            } else {
                var msParsed = parseInt(msRaw, 10);
                deviceListMinSignal = isNaN(msParsed) ? null : msParsed;
            }

            var kfRaw = kismet.getStorage('kismet.ui.devicelist.kind_filter', '');
            if (kfRaw === 'unassoc' || kfRaw === 'ap') {
                deviceListKindFilter = kfRaw;
            } else {
                deviceListKindFilter = 'all';
            }

            var pageSize = deviceTabulator.getPageSize();
            if (pageSize == 0) {
                throw new Error("Page size 0");
            }

            if (deviceTableRefreshBlock) {
                throw new Error("refresh blocked");
            }

            var colparams = JSON.stringify({'fields': GenerateDeviceFieldList2()});

            var postdata = {
                "json": colparams,
                "page": deviceTablePage,
                "length": pageSize,
            }

            if (device_columnlist2.has(devicetable_prefs['sort']['column'])) {
                var f = device_columnlist2.get(devicetable_prefs['sort']['column']);
                if (f['sortfield'] != null) {
                    if (typeof(f['sortfield']) === 'string') {
                        postdata["sort"] = f['sortfield'];
                    } else if (Array.isArray(f['sortfield'])) {
                        postdata["sort"] = f['sortfield'][0];
                    }
                } else {
                    if (typeof(f['field']) === 'string') {
                        postdata["sort"] = f['sortfield'];
                    } else if (Array.isArray(f['field'])) {
                        postdata["sort"] = f['field'][0];
                    }
                }

                postdata["sort_dir"] = devicetable_prefs['sort']['dir'];
            }

            var searchterm = kismet.getStorage('kismet.ui.deviceview.search', "");
            if (searchterm.length > 0) {
                postdata["search"] = searchterm;
            }

            if (deviceListMinSignal !== null && deviceListMinSignal !== '') {
                postdata["min_signal"] = String(deviceListMinSignal);
            }

            var viewname = kismet.getStorage('kismet.ui.deviceview.selected', 'all');

            $.post(local_uri_prefix + `devices/views/${viewname}/devices.json`, postdata,
                function(data) {
                    if (data === undefined) {
                        return;
                    }

                    deviceTableTotal = data["last_row"];
                    deviceTableTotalPages = data["last_page"];

                    // Sanitize the data
                    if (!'data' in data) {
                        throw new Error("Missing data in response");
                    }
                    var rdata = kismet.sanitizeObject(data["data"]);

                    // Permute the data based on the field list and assign the fields to the ID names
                    var procdata = [];

                    for (const d of rdata) {
                        var md = {};

                        md['original_data'] = d;

                        md['device_key'] = d['kismet.device.base.key'];

                        for (const [k, c] of device_columnlist2) {
                            if (typeof(c['field']) === 'string') {
                                var fs = c['field'].split("/");
                                var fn = fs[fs.length - 1];
                                if (fn in d)
                                    md[c['kismetId']] = d[fn];
                            } else if (Array.isArray(c['field'])) {
                                if (c['field'][1] in d)
                                    md[c['kismetId']] = d[c['field'][1]];
                            }

                            if (c['fields'] != null) {
                                for (const cf of c['fields']) {
                                    if (typeof(cf) === 'string') {
                                        var fs = cf.split("/");
                                        var fn = fs[fs.length - 1];
                                        if (fn in d)
                                            md[fn] = d[fn];
                                    } else if (Array.isArray(cf)) {
                                        if (fn[1] in d)
                                            md[fn[1]] = d[fn[1]]
                                    }

                                }
                            }

                        }

                        procdata.push(md);
                    }

                    if (deviceListMinSignal !== null && deviceListMinSignal !== '') {
                        procdata = procdata.filter(function(row) {
                            var s = deviceRowLastSignalDbm(row);
                            if (s === null || isNaN(s))
                                return false;
                            return s >= deviceListMinSignal;
                        });
                    }
                    if (deviceListKindFilter && deviceListKindFilter !== 'all') {
                        procdata = procdata.filter(function(row) {
                            return deviceRowMatchesKind(row.original_data, deviceListKindFilter);
                        });
                    }
                    deviceTableRowsThisPage = procdata.length;

                    // deviceTabulator.replaceData(data["data"]);
                    deviceTabulator.replaceData(procdata);
                    restoreDeviceListWhitelistSelections();
                    updateDeviceListWlToolbar();

                    var paginator = $('#devices-table2 .tabulator-paginator');
                    paginator.empty();

                    var firstpage =
                        $('<button>', {
                            'class': 'tabulator-page',
                            'type': 'button',
                            'role': 'button',
                            'aria-label': 'First',
                        }).html("First")
                    .on('click', function() {
                        deviceTablePage = 0;
                        return ScheduleDeviceSummary();
                    });
                    if (deviceTablePage == 0) {
                        firstpage.attr('disabled', 'disabled');
                    }
                    paginator.append(firstpage);

                    var prevpage =
                        $('<button>', {
                            'class': 'tabulator-page',
                            'type': 'button',
                            'role': 'button',
                            'aria-label': 'Prev',
                        }).html("Prev")
                    .on('click', function() {
                        deviceTablePage = deviceTablePage - 1;
                        return ScheduleDeviceSummary();
                    });
                    if (deviceTablePage <= 0) {
                        prevpage.attr('disabled', 'disabled');
                    }
                    paginator.append(prevpage);

                    var gen_closure = (pg, pgn) => {
                        pg.on('click', () => {
                            deviceTablePage = pgn;
                            return ScheduleDeviceSummary();
                        });
                    }

                    var fp = deviceTablePage - 1;
                    if (fp <= 1)
                        fp = 1;
                    var lp = fp + 4;
                    if (lp > deviceTableTotalPages)
                        lp = deviceTableTotalPages;
                    for (let p = fp; p <= lp; p++) {
                        var ppage =
                            $('<button>', {
                                'class': 'tabulator-page',
                                'type': 'button',
                                'role': 'button',
                                'aria-label': `${p}`,
                            }).html(`${p}`);
                        gen_closure(ppage, p - 1);
                        if (deviceTablePage == p - 1) {
                            ppage.attr('disabled', 'disabled');
                        }
                        paginator.append(ppage);
                    }

                    var nextpage =
                        $('<button>', {
                            'class': 'tabulator-page',
                            'type': 'button',
                            'role': 'button',
                            'aria-label': 'Next',
                        }).html("Next")
                    .on('click', function() {
                        deviceTablePage = deviceTablePage + 1;
                        return ScheduleDeviceSummary();
                    });
                    if (deviceTablePage >= deviceTableTotalPages - 1) {
                        nextpage.attr('disabled', 'disabled');
                    }
                    paginator.append(nextpage);

                    var lastpage =
                        $('<button>', {
                            'class': 'tabulator-page',
                            'type': 'button',
                            'role': 'button',
                            'aria-label': 'Last',
                        }).html("Last")
                    .on('click', function() {
                        deviceTablePage = deviceTableTotalPages - 1;
                        return ScheduleDeviceSummary();
                    });
                    if (deviceTablePage >= deviceTableTotalPages - 1) {
                        lastpage.attr('disabled', 'disabled');
                    }
                    paginator.append(lastpage);
                },
                "json")
                .always(() => {
                    deviceTableRefreshing = false;
                });

            /*
            var dt = devicetableElement.DataTable();

            // Save the state.  We can't use proper state saving because it seems to break
            // the table position
            kismet.putStorage('kismet.base.devicetable.order', JSON.stringify(dt.order()));
            kismet.putStorage('kismet.base.devicetable.search', JSON.stringify(dt.search()));

            dt.ajax.reload(function(d) { }, false);
            */
        }

    } catch (error) {
        // console.log(error);
        deviceTableRefreshing = false;
    }

    return;
}

function CancelDeviceSummary() {
    clearTimeout(deviceTid2);
}

var devicetable_prefs = {};

function LoadDeviceTablePrefs() {
    devicetable_prefs = kismet.getStorage('kismet.ui.devicetable.prefs', {
        "columns": ["commonname", "type", "crypt", "last_time", "packet_rrd",
            "signal", "channel", "manuf", "wifi_clients", "wifi_bss_uptime",
            "wifi_qbss_usage"],
        "colsettings": {},
        "sort": {
            "column": "last_time",
            "dir": "asc",
        },
    });

    devicetable_prefs = $.extend({
        "columns": [],
        "colsettings": {},
        "sort": {
            "column": "",
            "dir": "asc",
        },
    }, devicetable_prefs);
}

function SaveDeviceTablePrefs() {
    kismet.putStorage('kismet.ui.devicetable.prefs', devicetable_prefs);
}

exports.HideDeviceTab = function() {
    $('#center-device-extras').hide();
}

exports.ShowDeviceTab = function() {
    exports.InitializeDeviceTable(devicetableHolder2);
    $('#center-device-extras').show();
}

exports.InitializeDeviceTable = function(element) {
    LoadDeviceTablePrefs();

    devicetableHolder2 = element;

    var searchterm = kismet.getStorage('kismet.ui.deviceview.search', "");

    if ($('#center-device-extras').length == 0) {
        var ph = (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ? kismet_i18n.t('common.filter_placeholder') : '\u30d5\u30a3\u30eb\u30bf\u30fc\u2026';
        var devviewmenu = $('<div id="center-device-extras" style="position: absolute; right: 10px; top: 5px; min-height: 32px; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; max-width: 92%;">');

        (function appendDeviceListSignalFilterBar(menu) {
            var ms = kismet.getStorage('kismet.ui.devicelist.min_signal', '');
            if (ms === '' || ms === null) {
                deviceListMinSignal = null;
            } else {
                var pi = parseInt(ms, 10);
                deviceListMinSignal = isNaN(pi) ? null : pi;
            }
            var host = $('<div>', { class: 'device-list-signal-filter-host' });
            var thresholds = [
                { val: -60, fb: '\u2265-60 dBm' },
                { val: -70, fb: '\u2265-70 dBm' },
                { val: -80, fb: '\u2265-80 dBm' },
                { val: null, fb: 'All' }
            ];
            thresholds.forEach(function(th) {
                var lbl = uiI18n(th.val === null ? 'signal_filter.show_all' : (
                    th.val === -60 ? 'signal_filter.above_60' : (
                        th.val === -70 ? 'signal_filter.above_70' : 'signal_filter.above_80'
                    )), th.fb);
                var isActive = (th.val === null && deviceListMinSignal === null) ||
                    (th.val !== null && deviceListMinSignal === th.val);
                var btn = $('<button>', { type: 'button', class: 'signal-filter-btn' + (isActive ? ' active' : '') })
                    .text(lbl)
                    .on('click', function() {
                        deviceListMinSignal = th.val;
                        if (th.val === null) {
                            kismet.putStorage('kismet.ui.devicelist.min_signal', '');
                        } else {
                            kismet.putStorage('kismet.ui.devicelist.min_signal', String(th.val));
                        }
                        host.find('.signal-filter-btn').removeClass('active');
                        $(this).addClass('active');
                        deviceTablePage = 0;
                        ScheduleDeviceSummary();
                    });
                host.append(btn);
            });
            menu.append(host);
        })(devviewmenu);

        (function appendDeviceListKindFilterBar(menu) {
            var kf = kismet.getStorage('kismet.ui.devicelist.kind_filter', '');
            if (kf !== 'unassoc' && kf !== 'ap') {
                kf = 'all';
            }
            deviceListKindFilter = kf;
            var host = $('<div>', {
                class: 'device-list-kind-filter-host',
                title: uiI18n('device_list.kind_group_hint', 'Filter by device role (this page)')
            });
            var opts = [
                { val: 'all', fb: 'All types', key: 'device_list.kind_all' },
                { val: 'unassoc', fb: 'Unassociated', key: 'device_list.kind_unassoc' },
                { val: 'ap', fb: 'AP only', key: 'device_list.kind_ap' }
            ];
            opts.forEach(function(o) {
                var lbl = uiI18n(o.key, o.fb);
                var isActive = (kf === o.val);
                var btn = $('<button>', { type: 'button', class: 'signal-filter-btn kind-filter-btn' + (isActive ? ' active' : '') })
                    .text(lbl)
                    .on('click', function() {
                        deviceListKindFilter = o.val;
                        kismet.putStorage('kismet.ui.devicelist.kind_filter', o.val === 'all' ? '' : o.val);
                        host.find('.kind-filter-btn').removeClass('active');
                        $(this).addClass('active');
                        deviceTablePage = 0;
                        ScheduleDeviceSummary();
                    });
                host.append(btn);
            });
            menu.append(host);
        })(devviewmenu);

        if (typeof kismet_whitelist_api !== 'undefined') {
            var wlBar = $('<div>', {
                class: 'device-list-wl-toolbar',
                css: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginRight: '8px' }
            });
            wlBar.append($('<label>', {
                css: { margin: 0, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }
            })
                .append($('<input>', { type: 'checkbox', id: 'device-list-wl-sel-all' }))
                .append($('<span>').text(uiI18n('device_list.wl_select_page', 'Select all on this page'))));
            wlBar.append($('<span>', { id: 'device-list-wl-count', class: 'device-list-wl-count' })
                .text((typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ?
                    kismet_i18n.t('whitelist.selected_count', { count: 0 }) : '0 selected'));
            wlBar.append($('<button>', {
                type: 'button',
                class: 'signal-filter-btn device-list-wl-bulk-btn',
                id: 'device-list-wl-bulk-btn'
            }).text(uiI18n('whitelist.add_bulk', 'Register selected to whitelist')));
            devviewmenu.append(wlBar);

            if (!deviceListWlToolbarEventsBound) {
                deviceListWlToolbarEventsBound = true;
                $(document).on('change.kismetWlDev', '#device-list-wl-sel-all', function () {
                    if (!deviceTabulator) {
                        wlUiDbg("device_selall_change_no_tabulator", {});
                        return;
                    }
                    var nRows = 0;
                    try {
                        nRows = deviceTabulator.getRows().length;
                    } catch (eNr) {
                        nRows = -1;
                    }
                    wlUiDbg("device_selall_change", { checked: !!this.checked, getRows: nRows, pickBefore: deviceListWhitelistPick.size });
                    if (this.checked) {
                        deviceTabulator.deselectRow();
                        deviceListWhitelistPick.clear();
                        deviceTabulator.getRows().forEach(function (r) {
                            try {
                                r.select();
                            } catch (eSel) {
                                ;
                            }
                            syncDeviceListWhitelistPickRow(r, true);
                        });
                        updateDeviceListWlToolbar();
                        setTimeout(function () {
                            updateDeviceListWlSelectAllCheckbox();
                            wlUiDbg("device_selall_after_timeout", { pick: deviceListWhitelistPick.size });
                        }, 0);
                    } else {
                        deviceTabulator.deselectRow();
                        deviceListWhitelistPick.clear();
                        updateDeviceListWlToolbar();
                        updateDeviceListWlSelectAllCheckbox();
                    }
                });
                $(document).on('click.kismetWlDev', '#device-list-wl-bulk-btn', function () {
                    if (typeof kismet_whitelist_api === 'undefined' || !deviceTabulator) {
                        wlUiDbg("device_bulk_click_skip", { api: typeof kismet_whitelist_api, tab: !!deviceTabulator });
                        return;
                    }
                    wlUiDbg("device_bulk_click_start", {});
                    var entries = gatherDeviceListWhitelistEntriesForBulk();
                    wlUiDbg("device_bulk_after_gather", { entries: entries.length });
                    if (entries.length === 0) {
                        try {
                            alert(uiI18n('common.select_rows_first', 'Select at least one row first'));
                        } catch (e0) {
                            ;
                        }
                        return;
                    }
                    var cmsg = (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ?
                        kismet_i18n.t('whitelist.confirm_bulk_register', { count: entries.length }) :
                        ('Register ' + entries.length + ' device(s) to whitelist?');
                    if (!window.confirm(cmsg)) {
                        wlUiDbg("device_bulk_confirm_cancelled", {});
                        return;
                    }
                    var res;
                    try {
                        res = kismet_whitelist_api.addBulkToWhitelist(entries);
                        wlUiDbg("device_bulk_done", { added: res.added, skipped: res.skipped ? res.skipped.length : 0 });
                    } catch (eBulk) {
                        try {
                            alert(String((eBulk && eBulk.message) ? eBulk.message : eBulk) ||
                                uiI18n("common.error", "Error"));
                        } catch (eA) {
                            ;
                        }
                        return;
                    }
                    deviceListWhitelistPick.clear();
                    deviceTabulator.deselectRow();
                    var cb = document.getElementById('device-list-wl-sel-all');
                    if (cb) {
                        cb.checked = false;
                        cb.indeterminate = false;
                    }
                    updateDeviceListWlToolbar();
                    var sum = (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ?
                        kismet_i18n.t('device_list.wl_bulk_done', {
                            added: res.added,
                            skipped: res.skipped.length
                        }) :
                        ('Added: ' + res.added + ', skipped: ' + res.skipped.length);
                    try {
                        alert(sum);
                    } catch (e1) {
                        ;
                    }
                    try {
                        deviceTabulator.redraw(true);
                    } catch (e2) {
                        ;
                    }
                });
            }
        }

        devviewmenu.append(
            $('<button>', {
                type: 'button',
                class: 'signal-filter-btn device-list-csv-btn',
                title: uiI18n('device_list.export_csv_hint', 'Export visible rows as UTF-8 CSV (RFC 4180). wireshark.display_filter is for 802.11 captures; not a PCAPNG file.')
            })
                .text(uiI18n('device_list.export_csv', 'CSV'))
                .on('click', function() { exportDeviceTableCsv(); })
        );

        devviewmenu.append(
            $('<form>', { action: '#' }).append($('<span>', { id: 'device_view_holder' })),
            $('<input>', {
                class: 'device_search',
                type: 'search',
                id: 'device_search',
                placeholder: ph,
                value: searchterm
            })
        );
        $('#centerpane-tabs').append(devviewmenu);
        exports.BuildDeviceViewSelector($('span#device_view_holder'));

        $('#device_search').on('keydown', (evt) => {
            var code = evt.charCode || evt.keyCode;
            if (code == 27) {
                $('#device_search').val('');
            }
        });

        $('#device_search').on('input change keyup copy paste cut', $.debounce(300, () => {
            var searchterm = $('#device_search').val();
            kismet.putStorage('kismet.ui.deviceview.search', searchterm);
            ScheduleDeviceSummary();
        }));
    }

    if ($('#devices-table2', element).length == 0) {
        devicetableElement2 =
            $('<div>', {
                id: 'devices-table2',
                'cell-spacing': 0,
                width: '100%',
                height: '100%',
            });

        element.append(devicetableElement2);
    }

    if (deviceTabulator) {
        wlUiDbg("device_init_skip_new_tabulator", {});
        try {
            ScheduleDeviceSummary();
        } catch (eSch) {
            ;
        }
        updateDeviceListWlToolbar();
        return;
    }

    deviceTabulator = new Tabulator('#devices-table2', {
        // This looks really bad on small screens
        // layout: 'fitColumns',

        movableColumns: true,
        // Tabulator 5.6 (bundled): use selectableRows. If Kismet upgrades Tabulator, check
        // release notes — option names and rowSelection integration changed across early 5.x.
        selectableRows: true,
        columns: GenerateDeviceColumns2(),

        // No loading animation/text
        dataLoader: false,

        // Server-side filtering and sorting
        sortMode: "remote",
        filterMode: "remote",

        // Server-side pagination
        pagination: true,
        paginationMode: "remote",

        // Override the pagination system to use our local counters, more occurs in
        // the update timer loop to replace pagination
        paginationCounter: function(pageSize, currentRow, currentPage, totalRows, totalPages) {
            if (deviceTableTotal == 0) {
                return "Loading..."
            }

            var hasSig = (deviceListMinSignal !== null && deviceListMinSignal !== '');
            var hasKind = (deviceListKindFilter && deviceListKindFilter !== 'all');
            if (hasSig || hasKind) {
                var parts = [];
                if (hasSig) {
                    parts.push((typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ?
                        kismet_i18n.t('device_list.signal_filter_tag', { thr: deviceListMinSignal }) :
                        ('≥' + deviceListMinSignal + ' dBm'));
                }
                if (hasKind) {
                    var kl = (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ? kismet_i18n.t(
                        deviceListKindFilter === 'ap' ? 'device_list.kind_ap' : 'device_list.kind_unassoc'
                    ) : deviceListKindFilter;
                    parts.push(kl);
                }
                var filt = parts.join(' · ');
                return (typeof kismet_i18n !== 'undefined' && kismet_i18n.t) ? kismet_i18n.t('device_list.active_filters_footer', {
                    count: deviceTableRowsThisPage,
                    total: deviceTableTotal,
                    filters: filt
                }) : (deviceTableRowsThisPage + ' / ' + deviceTableTotal + ' [' + filt + ']');
            }

            var frow = pageSize * deviceTablePage;
            if (frow == 0)
                frow = 1;

            var lrow = frow + pageSize;
            if (lrow > deviceTableTotal)
                lrow = deviceTableTotal;

            return `Showing rows ${frow} - ${lrow} of ${deviceTableTotal}`;
        },

        rowFormatter: function(row) {
            var el = row.getElement();
            el.classList.remove("kismet-row-whitelist-trusted");
            el.style.backgroundColor = "";
            for (const ri of DeviceRowHighlights) {
                if (!ri['enable'])
                    continue;

                try {
                    if (ri['selector'](row.getData()['original_data'])) {
                        el.style.backgroundColor = ri['color'];
                        if (ri['cssClass']) {
                            el.classList.add(ri['cssClass']);
                        }
                    }
                } catch (e) {
                    ;
                }
            }
        },

        initialSort: [{
            "column": devicetable_prefs["sort"]["column"],
            "dir": devicetable_prefs["sort"]["dir"],
        }],

    });

    // Get sort events to hijack for the custom query
    deviceTabulator.on("dataSorted", (sorters) => {
        if (sorters.length == 0)
            return;

        var mut = false;
        if (sorters[0].field != devicetable_prefs['sort']['column']) {
            devicetable_prefs['sort']['column'] = sorters[0].field;
            mut = true;
        }

        if (sorters[0].dir != devicetable_prefs['sort']['dir']) {
            devicetable_prefs['sort']['dir'] = sorters[0].dir;
            mut = true;
        }

        if (mut) {
            SaveDeviceTablePrefs();
            ScheduleDeviceSummary();
        }
    });

    // Disable refresh while a menu is open
    deviceTabulator.on("menuOpened", function(component){
        deviceTableRefreshBlock = true;
    });

    // Reenable refresh when menu is closed
    deviceTabulator.on("menuClosed", function(component){
        deviceTableRefreshBlock = false;
    });


    // Handle row clicks (ignore selection column and packet sparkline cell —
    // rowClick on sparkline steals focus from jquery.sparkline hover tooltips / interaction)
    deviceTabulator.on("rowClick", (e, row) => {
        var t = e.target;
        if (t && t.closest) {
            if (t.closest(".tabulator-row-select-checkbox") ||
                t.closest(".tabulator-row-header-select") ||
                t.closest(".tabulator-row-header-select-checkbox")) {
                return;
            }
            var cellEl = t.closest(".tabulator-cell");
            if (cellEl) {
                var fld = cellEl.getAttribute("tabulator-field");
                if (fld === "packet_rrd") {
                    return;
                }
            }
        }
        kismet_ui.DeviceDetailWindow(row.getData()['device_key']);
    });

    function deviceTabulatorRowArg(rowOrA, maybeB) {
        var a = rowOrA;
        var b = maybeB;
        if (a && typeof a.getData === "function") {
            return a;
        }
        if (b && typeof b.getData === "function") {
            return b;
        }
        return null;
    }

    deviceTabulator.on("rowSelected", function (a, b) {
        var row = deviceTabulatorRowArg(a, b);
        if (!row) {
            return;
        }
        syncDeviceListWhitelistPickRow(row, true);
        updateDeviceListWlSelectAllCheckbox();
        updateDeviceListWlToolbar();
    });
    deviceTabulator.on("rowDeselected", function (a, b) {
        var row = deviceTabulatorRowArg(a, b);
        if (!row) {
            return;
        }
        syncDeviceListWhitelistPickRow(row, false);
        updateDeviceListWlSelectAllCheckbox();
        updateDeviceListWlToolbar();
    });

    deviceTabulator.on("columnMoved", function(column, columns){
        var cols = [];

        for (const c of columns) {
            cols.push(c.getField());
        }

        devicetable_prefs['columns'] = cols;

        SaveDeviceTablePrefs();

    });

    deviceTabulator.on("columnResized", function(column){
        if (column.getField() in devicetable_prefs['colsettings']) {
            devicetable_prefs['colsettings'][column.getField()]['width'] = column.getWidth();
        } else {
            devicetable_prefs['colsettings'][column.getField()] = {
                'width': column.getWidth(),
            }
        }

        SaveDeviceTablePrefs();
    });

    deviceTabulator.on("tableBuilt", function() {
        ScheduleDeviceSummary();
    });

    if (!window.__kismetWlDeviceRedrawHook) {
        window.__kismetWlDeviceRedrawHook = true;
        document.addEventListener("kismet-whitelist-changed", function () {
            try {
                if (deviceTabulator && typeof deviceTabulator.redraw === "function") {
                    deviceTabulator.redraw(true);
                }
            } catch (re) {
                ;
            }
        });
    }

    updateDeviceListWlToolbar();
}

return exports;

});
