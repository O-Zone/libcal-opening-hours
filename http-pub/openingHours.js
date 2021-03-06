/*global window, console, $, google*/

// polyfill forEach
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function (fn, context) {
        context = context || window;
        for (var i = 0; i < this.length; i += 1) {
            fn.call(context, this[i], i, this);
        }
    }; 
}

// get the browser specific transitionEnd event name (https://gist.github.com/O-Zone/7230245)
(function(c){var d={MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd",transition:"transitionEnd",MSTransition:"msTransitionEnd",OTransition:"oTransitionEnd"},b=c.document.createElement("div");for(var a in d){if(b.style[a]!==undefined){c.transitionEnd=d[a];break}}})(window);

function loadAdditionalJavascript(url, callback) { // TODO: We might wanna shovel this into window.OpeningHours to avoid cluttering windows?
    var script = document.createElement('script');
    script.async = true;
    script.src = url;
    var entry = document.getElementsByTagName('script')[0];
    entry.parentNode.insertBefore(script, entry);
    script.onload = script.onreadystatechange = function () {
        var rdyState = script.readyState;
        if (!rdyState || /complete|loaded/.test(rdyState)) {
            if (callback) {
                callback();
            }
            // avoid IE memoryleak http://mng.bz/W8fx
            script.onload = null;
        }
    };
}

var OpeningHours = (function (document) {
    'use strict';

    var version = '1.1.0';

    //import stylesheet // TODO: Make sure loading this sheet does not block for anything else
    var newCssLinkElement = document.createElement('link');
    newCssLinkElement.rel = 'stylesheet';
    newCssLinkElement.href = 'http://localhost:8002/openingHoursStyles.css';
    document.getElementsByTagName('head')[0].appendChild(newCssLinkElement);

// ===== [ private helper functions ] =====
    var ugedage = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'],
        weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        weekdayToUgedagHash = [],
        libraryIndex = []; // index in locations for the different libraries

    ugedage.forEach(function (ugedag, index) {
        weekdayToUgedagHash[weekdays[index]] = ugedag;
    });

    function setAttribute(elem, attr, value) {
        attr = document.createAttribute(attr);
        attr.value = value;
        elem.attributes.setNamedItem(attr);
    }

    function createNewDiv(config) {
        var newDiv = document.createElement('div');
        for (var i in config) {
            if (config.hasOwnProperty(i)) {
                setAttribute(newDiv, i, config[i]);
            }
        }

        return newDiv;
    }

    /**
     * Transforms a Date.getDay() number into an english dayname
     * @param dayIndex Optional If not specified today will be used
     */
    function getDayName(dayIndex) {
        return weekdays[dayIndex || new Date().getDay()];
    }

    function getTdTextContent(content) {
        var str = content;        
        if (typeof content === 'object' && content !== null) {
            if (content.text) {
                str = content.text;
            }
            if (content.href) {
                str = '<a href="' + content.href + '"' + (content.target ? ' target="' + content.target + '"' : '') + '>' + str + '</a>';
            }
        }
        return str;
    }

    /**
     * Creates a table row - all but the very first row is set to class="timeField" (=centered no-wrap)
     * Makes all params to cells in a table row, and returns the row (as a string)
     * each parameter can be a string or an object. If string the string is the text inside the td
     * if object, it expects it to be of the form: { text : 'textnodeString', href : 'url-to-where-the-text-should-link-on-click' }
     */
    function getTr() {
        var str = '<tr>';
        for (var i = 0; i < arguments.length; i += 1) {
            if ((typeof arguments[i] === 'string') || (arguments[i] instanceof String)) {
                str += '<td' + (i > 0 ? ' class="timeField"' : '') + '>' + arguments[i] + '</td>'; // All cells that are not the very first in the row gets timeField (nowrap + center style)
            } else { // TODO: If needed, this could be done more elegantly, shoveling all sorts of attributes in the html element.
                if ((typeof arguments[i] === 'object') && (arguments[i] !== null)) {
                    str += '<td>';
                    str += arguments[i].href ? '<a href="' + arguments[i].href + '">' : '';
                    str += arguments[i].text ? arguments[i].text : '';
                    str += arguments[i].href ? '</a>' : '';
                } else {
                    str += '<td></td>';
                }
            }
        }
        return str + '</tr>';
    }

// ===== [ NotInitializedError ] =====
    function NotInitializedError(msg) {
        this.name = "NotInitializedError";
        this.message = msg || 'Object not initialized';
    }
    NotInitializedError.prototype = Error.prototype;

// ===== [ OpeningHours Object ] =====
    var OpeningHours = function (data, targetElement, modalDialog) {
        this.openingHours = data;
        this.targetElement = targetElement;
        this.modalDialog = modalDialog;
        this.viewCache = {};
    };

    OpeningHours.prototype = {
        version : version,
        init : function (config) {
            if (!this.openingHours) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            var that = this;
            this.config = config || OpeningHours.config;
            for (var i=0; i < that.openingHours.locations.length; i += 1) {
                libraryIndex[that.openingHours.locations[i].name] = i;
            }
            var librariesThatsNotInTheResult = '';
            // testing whether all libraries is in the libcal response, and warning about missing libraries (possibly typos)
            // TODO: Performance: Might be dropped, but I think it is nice to get an errormessage when there is a typo?
            if (OpeningHours.config.library.indexOf(',') >= 0) {
                OpeningHours.config.library.split(/\s*,\s*/).forEach(function (library) {
                    if ('undefined' === typeof libraryIndex[library]) {
                        librariesThatsNotInTheResult += ', "' + library + '"';
                    }
                });
            } else {
                OpeningHours.config.libraryWhitelist.forEach(function (library) {
                    if ('undefined' === typeof libraryIndex[library]) {
                        librariesThatsNotInTheResult += ', "' + library + '"';
                    }
                });
            }
            if (librariesThatsNotInTheResult.length) {
                if ('undefined' !== window.console) {
                    console.warn('No data recieved on: ' + librariesThatsNotInTheResult.substr(2) + '. This might be about misspelling?');
                }
            }
            //inject modal dialog DOM
            that.modalDialog.innerHTML = '<div class="modal-header"><button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button><h3 id="openingHoursModalLabel">OpeningHours</h3></div><div id="openingHoursModalInfobox"></div><div class="modal-body"></div>';
            that.modalHeader = document.getElementById('openingHoursModalLabel');
            that.modalInfobox = document.getElementById('openingHoursModalInfobox');
            that.modalBody = that.modalDialog.lastChild;
            // Set up transitionEnd event handler that turns off the modal dialog after ended fade up transition in browsers that supports transitions
            if (window.transitionEnd && window.addEventListener) { // TODO: If browsers have transitionEnd, but not addEventListener, they will not close their modalDialog (but I don't know any browsers like that?) 
                ['webkitTransitionEnd','oTransitionEnd', 'otransitionend', 'transitionend'].forEach(function (eventName) { // NOTE: it ought to be enough with an eventlistener for whatever is in window.transitionEnd, but it seems that it misses out on IE10, so I have just kept the bulk listening.
                    //that.modalDialog.addEventListener(window.transitionEnd, function (e) {
                    that.modalDialog.addEventListener(eventName, function (e) {
                        if (e.target === that.modalDialog && e.propertyName === 'top'){ // only do trigger if it is the top transition of the modalDialog that has ended
                            if (that.modalDialogIsVisible) {
                                if (that.currentTimespan === 'map' && that.gmap) {
                                    google.maps.event.trigger(that.gmap, 'resize');
                                    that.gmap.setCenter(that.currentLib.latLng);
                                }
                            } else {
                                that.modalDialog.style.display = 'none';
                            }
                            e.stopPropagation();
                        }
                    });
                });
            }

            // initialize the view requested in the snippet
            this.setView({
                library : this.config.library,
                timespan : this.config.timespan
            });
            // set modalWidth
            that.resizeModalWidth();
            // set window.resize event
            if (window.addEventListener) {
                window.addEventListener('resize', that.resizeWindow);
            } else {
                // IE8 - set up a modalDialog resize on window.resize
                window.attachEvent('onresize', that.resizeWindow);
            }
        },

        /**
         * Sets display:none on all generated views, effectively turning them off
         */
        turnOffAllViews : function () {
            if (!this.targetElement) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            var that = this;
            Array.prototype.forEach.call(that.targetElement.childNodes, function (view) {
                if ((!view.style) && (typeof console !== 'undefined')) { // FIXME: is this even possible? I think we could safely remove this clause?
                    console.log('openingHours: View has no style? ', view);
                }
                view.style.display = 'none';
            });
        },

        turnOffAllModals : function () {
            if (!this.targetElement) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            var that = this;
            Array.prototype.forEach.call(that.modalBody.childNodes, function (dialog) {
                dialog.style.display = 'none';
            });
        },

        animStep : function (config) {
            if (!config.stepLeft && config.cb) {
                config.cb.call(config.that);
            } else {
                config.that.modalDialog.style.top = config.top.shift();
                var opac = config.opacity.shift();
                config.that.modalDialog.style.opacity = opac;
                config.that.modalDialog.style.filter = 'alpha(opacity=' + 100 * opac + ')'; // lex IE8 
                config.stepLeft -= 1;
                setTimeout(function () {
                    config.that.animStep(config);
                }, config.stepTime);
            }
        },

        // Method for animating the modal dialog in browsers that do not support CSS3 transitions (IE8 + IE9)
        animateModal : function (show, cb) {
            var that = this;
            if (show) {
                //show modalDialog
                that.animStep({
                    that : that,
                    stepLeft : 6,
                    stepTime : 40,
                    top : ['-25%','-23%','-18%','-11%','1%','10%'],
                    opacity : ['0','.2','.4','.6','.8','1'],
                    cb : cb
                });
            } else {
                // hide modalDialog
                that.animStep({
                    that : that,
                    stepLeft : 6,
                    stepTime : 40,
                    top : ['10%','1%','-11%','-18%','-23%','-25%'],
                    opacity : ['1','.8','.6','.4','.2','0'],
                    cb : cb
                });
            }
        },

        showModal : function () {
            var that = this,
                modalDiv = (typeof $ === 'function') && $('#openingHoursModalDiv') || document.getElementById('openingHoursModalDiv');
//            if (modalDiv && modalDiv.modal) { // After finetuning my own show/hide dialog, I found out it was broken using bootstrap/jQuery, so for now it is just //'ed
//                modalDiv.modal('show');
//            } else {
                modalDiv = modalDiv.nodeType === 1 ? modalDiv : modalDiv[0];
                if (!that.overlay) { // NOTE: This is the first time the modal is set up by hand
                    that.overlay = document.createElement('div');
                    that.overlay.className = 'openingHoursOverlay';
                    if (!document.getElementsByClassName) { // IE8
                        var closeButton = modalDiv.querySelector ? modalDiv.querySelectorAll('.close')[0] : modalDiv.firstChild; // if DocMode IE7 or quirksmode, fallback to asserting that the closeButton is the firstChild :(
                        closeButton.attachEvent('onclick', function () {
                            that.hideModal.call(that);
                        });
                    } else { // every other browser in the world *sigh
                        modalDiv.getElementsByClassName('close')[0].addEventListener('click', function () { // attach an eventhandler for the close button
                            that.hideModal.call(that);
                        });
                    }
                    // click on overlay => close modal dialog
                    if (that.overlay.addEventListener) {
                        that.overlay.addEventListener('click', function () {
                            that.hideModal.call(that);
                        });
                    } else {
                        if (that.overlay.attachEvent) {
                            that.overlay.attachEvent('onclick', function () {
                                that.hideModal.call(that);
                            });
                        }
                    }
                    document.body.appendChild(this.overlay);
                } 
                modalDiv.style.marginTop = that.getScrollTop() + 'px'; // if scrolled y down, show the dialog y down
                modalDiv.style.marginLeft = ((-1 * Math.round(that.modalWidth / 2) - 16) + that.getScrollLeft()) + 'px'; // if scrolled x left, show 50% -½ width + x
                modalDiv.style.display = 'block';
                window.setTimeout(function () { // NOTE: If they are executed in a row, the transitions does not happen (Chrome 28) since they are invoked while still hidden
                    if (window.transitionEnd) {
                        modalDiv.style.opacity = 1;
                        modalDiv.style.top = '10%';
                    } else {
                        that.animateModal(true, function () {
                            if (that.currentLib && that.gmap) { // NOTE: Only resize map if it IS a map (and there is a map IE8) - if there is no currentLib, it is the all libs all week modal!
                                google.maps.event.trigger(that.gmap, 'resize');
                                that.gmap.setCenter(that.currentLib.latLng);
                            }
                        });
                    }
                }, 50);
                that.overlay.style.display = 'block';
//            }
            that.modalDialogIsVisible = true;
        },

        hideModal : function () {
            var that = this,
                modalDiv = (typeof $ === 'function') && $('#openingHoursModalDiv') || document.getElementById('openingHoursModalDiv');
 //           if (modalDiv && modalDiv.modal) { // After finetuning my own show/hide dialog, I found out it was broken using bootstrap/jQuery, so for now it is just //'ed
 //               modalDiv.modal('hide');
 //           } else {
                modalDiv = modalDiv.nodeType === 1 ? modalDiv : modalDiv[0];
                modalDiv.style.opacity = 0;
                modalDiv.style.top = '-25%';
                that.overlay.style.display = 'none';
                if (!window.transitionEnd) { 
                    that.animateModal(false, function () {
                        modalDiv.style.display = 'none';
                    });
                }
 //           }
            that.modalDialogIsVisible = false;
        },

        /**
         * Set view to a desired view. Any other views will be turned off but cached for later use.
         * If a view isn't rendered yet, this method initiates a render of the chosen view.
         * @param config {Object} Config object containing zero, one or two of the following parameters:
         *  - library {String} Optional A string representation of the library that is requested. Needs to be the same as defined in libCal.Hours, or 'all' for all libraries.
         *  - timespan {String} Optional The timespan to view. Either 'day', 'week' or 'map'. (map shows a modal dialog with the map)
         * if one (or more) of the parameters is not set, it will fall back on the current state of that parameter (set in this.config)
         * if nothing is set, it will fall back on 'all', 'day'
         */
        setView : function (config) {
            if (!this.viewCache) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            config = config || {};
            config.library = config.library || this.config.library || 'all';
            if (config.library.indexOf(',') >= 0) {
                this.config.libraryWhitelist = config.library.split(/\s*,\s*/); // The library is a list of libraries. We transform the list into a whitelist
                config.library = config.timespan === 'week' ? this.config.libraryWhitelist[0] : 'all'; // if timespan=week show the first library in the whitelist else show list of whitelisted libraries
            }
            config.timespan = config.timespan || this.config.timespan || 'day';
            var that = this,
                viewId = ((config.timespan !== 'map') ? // we only want one google.map view in the cache (and just pans it around and sets/removes markers as we go along)!
                    config.library + ':' + config.timespan :
                    'map');

            that.currentLib = config.library !== 'all' ? that.getLibrary(config.library) : null; // NOTE: that.currentLib = the library object unless 'all' -> currentLib = null
            that.currentTimespan = config.timespan;

            if (viewId === 'map' || viewId === 'all:week') {
                // This is a modal dialog
                if (that.viewCache[viewId]) {
                    // We do have this one rendered in the viewCache already
                    that.turnOffAllModals();
                    that.viewCache[viewId].style.display = 'block';
                    if (viewId === 'map'){
                        // set the headline
                        that.modalHeader.innerHTML = that.getLibraryName(that.currentLib.name);
                        // set infobox
                        that.modalInfobox.style.display = 'block';
                        Array.prototype.forEach.call(that.modalInfobox.children, function (infobox) { // TODO: There is no logic in show/hiding the views and remove/append the infobox
                            that.modalInfobox.removeChild(infobox);
                        });
                        that.modalInfobox.appendChild(that.getInfobox(that.currentLib));
                        if (that.gmap) {
                            // prepare the map
                            that.gmap.setMapTypeId(google.maps.MapTypeId.ROADMAP);
                            that.gmap.setZoom(15);
                            that.gmap.setCenter(that.currentLib.latLng); // NOTE: On the very first rendering this center is placed in 0,0 - but it doesnt matter since the map is resized/centered
                            that.gmapMarker.setPosition(that.currentLib.latLng);
                            that.gmapMarker.setAnimation(google.maps.Animation.DROP);
                        }
                    } else {
                        // set the headline
                        that.modalHeader.innerHTML = that.config.i18n.openHour;
                        // hide the infobox
                        that.modalInfobox.style.display = 'none';
                    }
                    that.showModal();
                } else {
                    // view has to be rendered
                    try {
                        that.renderView(
                            config.library,
                            config.timespan,
                            function (){
                                that.setView(config);
                            }
                        );
                    } catch (e) {
                        if (e instanceof ReferenceError) {
                            console.warn(e.message);
                        } else {
                            throw e;
                        }
                    }
                }
            } else {
                // This is a plain view
                if (that.viewCache[viewId]) {
                    // We do have this one rendered in the viewCache already
                    that.config.library = config.library;
                    that.config.timespan = config.timespan;
                    that.turnOffAllViews();
                    that.viewCache[viewId].style.display = 'block';
                } else {
                    try{
                        that.renderView(
                            config.library, 
                            config.timespan,
                            function () {
                                that.setView(config);
                            }
                        );
                    } catch (e) {
                        if (e instanceof ReferenceError) {
                            console.warn(e.message);
                        } else {
                            throw e;
                        }
                    }
                }
            }
        },

        renderView : function (library, timespan, cb) {
            if (!this.openingHours) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            var that = this,
                innerHTML,
                newDiv;
            if (timespan === 'map') {
                newDiv = document.createElement('div');
                if (!document.querySelector || document.getElementsByClassName) { // !IE8
                    if (that.openingHours.hasNoLatLngCoordsYet) { // first time a map is rendered, all library coordinates are translated to google.maps.LatLng
                        // generating google.maps.LatLng positions for all libraries with lat:long attributes
                        that.openingHours.locations.forEach(function (location) {
                            if (location.lat.length && location.long.length) {
                                location.latLng = new google.maps.LatLng(location.lat, location.long);
                            }
                        });
                        delete that.openingHours.hasNoLatLngCoordsYet;
                    }
                    // render map
                    newDiv.style.height = '300px';
                    var mapOptions =  {
                            center: that.currentLib.latLng,
                            zoom: 8,
                            streetViewControl: false,
                            mapTypeId: google.maps.MapTypeId.ROADMAP
                        },
                        map = new google.maps.Map(newDiv, mapOptions);
                    that.gmap = map;
                    that.gmapMarker = new google.maps.Marker({
                        position : that.currentLib.latLng,
                        animation : google.maps.Animation.DROP,
                        map : that.gmap
                    });
                    that.modalBody.appendChild(newDiv);
                    that.viewCache['map'] = newDiv;
                } else {
                    that.viewCache['map'] = document.createElement('span'); // if IE8, just create an invisible bogus element to satisfy the map logic elswhere! (quick'n'dirty fix)
                }
                if (cb) {
                    cb();
                }
            } else {
                innerHTML = that.assembleView(library, timespan);
                newDiv = document.createElement('div');
                newDiv.className = 'openingHoursView';
                newDiv.innerHTML = innerHTML;
                newDiv.style.display = 'none';
                if (library === 'all' && timespan === 'week') {
                    that.modalBody.appendChild(newDiv);
                } else {
                    that.targetElement.appendChild(newDiv);
                }
                that.viewCache[library + ':' + timespan] = newDiv;
                if (cb) {
                    cb(); // NOTE: rendering all:week recalls setView after rendering in a callback 
                }
            }
        },

/*jshint scripturl:true*/
        /**
         * Assemble an innerHTML string for a specific view.
         * @param library {String} A string representation of the library that is requested. Needs to be the same as defined in libCal.Hours, or 'all' for all libraries.
         * @param timespan {String} The timespan to view. Either 'day' or 'week'.
         * @return String an innerHTML string that contains the requested table.
         */
        assembleView : function (library, timespan) {
            if (!this.openingHours) {
                throw new NotInitializedError('Object hasn\'t been initialized yet.');
            }
            var that = this,
                contentStr,
                today;
            // build the view for library_timespan
            contentStr = '';
            if (!(timespan==='week' || timespan === 'day' || timespan === 'map')) {
                throw new ReferenceError('Requested timespan "' + timespan + '" is illegal. Try "day" or "week".', 'openingHours');
            }
            if (library === 'all') {
                if (timespan === 'week') {
                    // --- [ all week ] ---
                    contentStr += '<table>' + that.getThead(
                        that.config.i18n.library,
                        that.config.i18n.weekdaysAbbr[0], // this looks like something that ought to be an array instead?
                        that.config.i18n.weekdaysAbbr[1],
                        that.config.i18n.weekdaysAbbr[2],
                        that.config.i18n.weekdaysAbbr[3],
                        that.config.i18n.weekdaysAbbr[4],
                        that.config.i18n.weekdaysAbbr[5],
                        that.config.i18n.weekdaysAbbr[6]
                        ) + '<tbody>';
                    that.openingHours.locations.forEach(function (location) {
                        if ((!openingHours.config.libraryWhitelist) || (openingHours.config.libraryWhitelist.indexOf(location.name) >= 0)) {
                            contentStr += getTr(
                                that.getLibraryName(location.name),
                                that.timesToStr(location.weeks[0].Monday.times),
                                that.timesToStr(location.weeks[0].Tuesday.times),
                                that.timesToStr(location.weeks[0].Wednesday.times),
                                that.timesToStr(location.weeks[0].Thursday.times),
                                that.timesToStr(location.weeks[0].Friday.times),
                                that.timesToStr(location.weeks[0].Saturday.times),
                                that.timesToStr(location.weeks[0].Sunday.times)
                            );
                        }
                    });
                    contentStr += '</tbody></table>';
                } else {
                    // --- [ all day ] ---
                    contentStr += '<table>' + that.getThead(that.config.i18n.library, that.config.i18n.openHourToday) + '<tbody>';
                    today = getDayName(); // TODO: We could check for dates too, to invalidate these?
                    that.openingHours.locations.forEach(function (location) {
                        if ((!openingHours.config.libraryWhitelist) || (openingHours.config.libraryWhitelist.indexOf(location.name) >= 0)) {
                            contentStr += getTr(
                                {
                                    href: 'javascript: openingHours.setView({library: \'' + location.name + '\',timespan: \'week\' });',
                                    text: that.getLibraryName(location.name)
                                },
                                that.timesToStr(location.weeks[0][today].times)
                            );
                        }
                    });
                    contentStr += '</tbody>';
                    contentStr += that.getTfoot(
                        {
                            text : that.config.i18n.allWeek,
                            href : 'javascript: openingHours.setView({timespan:\'week\'});'
                        }
                    );
                }
            } else {
                var libraryHours;
                try {
                    libraryHours = that.getLibraryHours(that.currentLib);
                } catch (e) {
                    if (e instanceof ReferenceError) {
                        throw e;
                    }
                }
                switch (timespan) {
                case 'day' :
                    // --- [ lib day ] ---
                    contentStr += '<table>' + that.getThead({
                        text : that.config.i18n.library,
                        href : 'javascript: openingHours.setView({library: \'all\',timespan: \'' + timespan + '\' });'
                    }, that.config.i18n.openHourToday) + '<tbody>';
                    today = getDayName();
                    contentStr += getTr(that.getLibraryName(library), that.timesToStr(libraryHours[today].times));
                    contentStr += '</tbody>';
                    contentStr += that.getTfoot(
                        {
                            text : that.config.i18n.allWeek,
                            href : 'javascript:openingHours.setView({timespan:\'week\'});'
                        }, (that.currentLib.lat && that.currentLib.long ? {
                            text : that.config.i18n.info,
                            href : 'javascript:openingHours.setView({timespan:\'map\'});'
                        } : undefined)
                    );
                    break;
                case 'week' :
                    // --- [ lib week ] ---
                    contentStr += '<table>' + that.getThead(that.getLibraryName(library), that.config.i18n.openHour) + '<tbody>';
                    that.config.i18n.weekdays.forEach(function (weekday, index) {
                        contentStr += getTr(weekday, that.timesToStr(libraryHours[weekdays[(index + 1) % 7]].times));
                    });
                    contentStr += '</tbody>';
                    contentStr += that.getTfoot(
                        {
                            text : that.config.i18n.allLibraries,
                            href : 'javascript:openingHours.setView({library:\'all\', timespan: \'day\'});'
                        }, (that.currentLib.lat && that.currentLib.long ? {
                            text : that.config.i18n.info,
                            href : 'javascript:openingHours.setView({timespan:\'map\'});'
                        } : undefined)
                    );
                    break;
                }
            } 
            return contentStr;
        },
/*jshint scripturl:false*/

        getInfobox : function (library) {
            var that = this,
                infoboxId = 'info:' + library.name;
            if (that.viewCache[infoboxId]) {
                // infobox already exists
                return that.viewCache[infoboxId];
            } else {
                // infobox does not exist - go create one
                var newDiv = document.createElement('div'),
                    tmpElem;
                newDiv.className = 'openingHoursInfobox';
                if (library.contact.length) {
                    tmpElem = document.createElement('div');
                    tmpElem.className = 'openingHoursContactDiv';
                    tmpElem.innerHTML = library.contact;
                    newDiv.appendChild(tmpElem);
                }
                if (library.url.length) {
                    tmpElem = document.createElement('p');
                    tmpElem.className = 'openingHoursLinkP';
                    tmpElem.innerHTML = '<a href="' + library.url + '" target="_blank">' + library.url + '</a>';
                    newDiv.appendChild(tmpElem);
                }
                if (library.desc.length) {
                    tmpElem = document.createElement('div');
                    tmpElem.className = 'openingHoursDescDiv';
                    tmpElem.innerHTML = library.desc;
                    newDiv.appendChild(tmpElem);
                }
                if (library.contact.length > 0) {
                    tmpElem = document.createElement('div');
                    tmpElem.className = 'clearRght';
                    newDiv.appendChild(tmpElem);
                }
                if (document.querySelector && !document.getElementsByClassName) { // IE8
                    var mapLink = document.createElement('a'),
                        mapImage = document.createElement('img');
                    mapLink.href='https://maps.google.com/maps?q=' + that.currentLib.lat + ',' + that.currentLib.long + '&t=m&z=14';
                    mapImage.src = 'https://maps.googleapis.com/maps/api/staticmap?center=' + that.currentLib.lat + ',' + that.currentLib.long + '&zoom=14&size=' + (that.modalWidth - 32 || '730') + 'x300&maptype=roadmap&markers=color:red%7C' + that.currentLib.lat + ',' + that.currentLib.long + '&sensor=false'; // FIXME: Hardcoded map size values (IE8 only)! -32 = 2x16 padding (box-sizing=border-box)
                    mapLink.target = '_blank';
                    mapLink.appendChild(mapImage);
                    newDiv.appendChild(mapLink);
                }
                that.viewCache[infoboxId] = newDiv;
                return that.getInfobox(library);
            }
        },

        // --- helper functions
        getLibrary : function (library) {
            var that = this;
            for (var i = 0; i < that.openingHours.locations.length; i += 1) {
                if (that.openingHours.locations[i].name === library) {
                    return that.openingHours.locations[i];
                }
            }
            throw new ReferenceError('Requested library "' + library + '" does not exist in libCal.', 'openingHours');
        },

        /**
         * Get library hours split up in weekdays for a single library.
         * @param library {string|Object} If string, the opening hours of the library with that name is returned. If Object, that librarys openingHours is returned.
         * @return {Object} Object with all opening hours for each weekday
         */
        getLibraryHours : function (library) {
            if ((typeof library === 'string') || (library instanceof String)) {
                library = this.getLibrary(library);
            }
            return library.weeks[0];
        },

        ampmTo24 : function (str) { // FIXME: I don't think this need to be a member variable?
            var hours = parseInt(str, 10).toString(),
                minuttes;
            if (str.indexOf('am') >= 0) {
                minuttes = parseInt(str.substr(str.indexOf(hours) + hours.length + 1), 10);
                return hours + (isNaN(minuttes) ? '' : ':' + minuttes);
            }
            if (str.indexOf('pm') >= 0) {
                minuttes = parseInt(str.substr(str.indexOf(hours) + hours.length + 1), 10);
                return (parseInt(hours) + 12) + (isNaN(minuttes) ? '' : ':' + minuttes);
            }
            return str;
        },

        timesToStr : function (times) {
            if (times.status === 'ByApp') {
                return this.config.i18n.byAppointment;
            }
            if (times.status === '24hours') {
                return this.config.i18n.allDay || '24 hours'; // FIXME: Make a translate function that returns either the string or the last part of the variable name (so it defaults to en)
            }
            if (times.status !== 'open') {
                return this.config.i18n.closed;
            }
            var str = '';
            for (var i = 0; i < times.hours.length; i += 1) {
                if (this.config.i18n.ampm) {
                    str += times.hours[i].from + ' - ' + times.hours[i].to;
                } else {
                    str += this.ampmTo24(times.hours[i].from) + ' - ' + this.ampmTo24(times.hours[i].to);
                }
                if (i !== times.hours.length - 1) {
                    str += ', ';
                }
            }
            return str;
        },

        /**
         * Returns a html string where all arguments are wrapped in.
         * Format: '<thead><tr><th>arg1</th><th>arg2</th>...</tr></thead>'
         * Also adds class first and last to the first and last header
         */
        getThead : function () {
            var overruleLibCol = ''; // as default use standard colorScheme
            if (this.config.allLibraryColor && this.config.allLibraryColor.length) { // NOTE: if there is a allLibraryColor defined use that instead of stdColors
                overruleLibCol = ' style="background-color:' + this.config.allLibraryColor + '"';
            }
            if (this.config.useLibraryColors && this.currentLib && this.currentLib.color.length) { // NOTE: if this is a library and it has its own color use that
                overruleLibCol = ' style="background-color:' + this.currentLib.color + '"';
            }
            var str = '<thead><tr class="' + (this.config.colorScheme || 'standard') + '">';
            if (arguments.length < 2) {
                return str + '<th class="first last"' + overruleLibCol + '>' + (getTdTextContent(arguments[0]) || '') + '</th></tr></thead>';
            } else {
                str += '<th class="first"' + overruleLibCol + '>' + getTdTextContent(arguments[0]) + '</th>';
                for (var i = 1; i < arguments.length - 1; i += 1) {
                    str += '<th' + overruleLibCol + '>' + getTdTextContent(arguments[i]) + '</th>';
                }
                return str + '<th class="last"' + overruleLibCol + '>' + getTdTextContent(arguments[arguments.length-1]) + '</th></tr></thead>';
            }
        },

        /**
         * Returns a html string with one or two links in the bottom of the table.
         * Format: '<tfoot><tr><td colspan="2"><div class="floatright"><a href="arg1.href">arg1.text</a></div>[<div class="floatleft"><a href="arg2.href">arg2.text</a></div>]</td></tr></tfoot>'
         * Also adds class first and last to the first and last header
         */
        getTfoot : function (rightLink, leftLink) {
            var str = '<tfoot><tr><td colspan="2">';
            str += '<div class="floatright clearnone"><a href="' + rightLink.href + '">' + rightLink.text + '</a></div>';
            if (leftLink) {
                str += '<div class="floatleft clearnone"><a href="' + leftLink.href + '">' + leftLink.text + '</a></div>';
            }
            return str + '</td></tr></tfoot>';
        },

        // snatched from http://stackoverflow.com/questions/871399/cross-browser-method-for-detecting-the-scrolltop-of-the-browser-window
        getScrollTop : function () {
        if (typeof pageYOffset !== 'undefined') {
            //most browsers except IE before #9
            return parseInt(pageYOffset);
        } else {
                var B = document.body, //IE 'quirks'
                    D = document.documentElement; //IE with doctype
                D = D.clientHeight ? D : B;
                return parseInt(D.scrollTop, 10);
            }
        },
    
        getScrollLeft : function () {
        if (typeof pageXOffset !== 'undefined') {
            //most browsers except IE before #9
            return parseInt(pageXOffset, 10);
        } else {
                var B = document.body, //IE 'quirks'
                    D = document.documentElement; //IE with doctype
                D = D.clientWidth ? D : B;
                return parseInt(D.scrollLeft);
            }
        },
    
        resizeModalWidth : function () {
            var that = this,
                modalWidth = Math.round(document.body.clientWidth * 0.8);
            that.modalWidth = modalWidth > 730 ? 730 : modalWidth; // NOTE: Maxwidth = 730 else 80% of window.body width
            that.modalDialog.style.width = that.modalWidth + 'px';
            that.modalDialog.style.marginLeft = ((-1 * Math.round(that.modalWidth / 2) - 16) + that.getScrollLeft()) + 'px'; // TODO: OPTIMIZATION: This is set every time modalShow is called, so if it is set properly on init, it does not need to be set here too (but IE9 fails first time modalDialog is shown, if it isn't set initially?)
        },

        resizeWindow : function () {
            var that = window.openingHours;
            that.resizeModalWidth();
        },

        getLibraryName : function (library) {
            return window.openingHours.config.i18n[library] || library;
        },

    };

// ===== [ preparing DOM ] =====
    // create the two divs needed for the openingHours GUI (table and modalDialog)
    var openingHoursContainer = document.getElementById('openingHoursContainer'),
        targetElement = createNewDiv({
            'id' : 'openingHoursTargetDiv'
        }),
        modalDialog = createNewDiv({
            'id' : 'openingHoursModalDiv',
            'tabindex' : '-1',
            'role' : 'dialog',
            'aria-labelledby' : 'openingHoursModalLabel',
            'aria-hidden' : true
        });
    // hide modalDialog by hand in case bootstrap is not around
    modalDialog.style.opacity = 0;
    modalDialog.style.top = '-25%';
    // inject them just before the scripts
    document.body.appendChild(modalDialog); // appending modal dialog to body to avoid getting trapped inside some position:relative/absolute container.
    openingHoursContainer.insertBefore(targetElement, openingHoursContainer.firstChild);

    // this is needed for google.maps to be loaded correctly asynchronously
    OpeningHours.initializeGMaps = function () {};

    OpeningHours.loadOpeningHours = function (data) {
        window.openingHours = new OpeningHours(data, targetElement, modalDialog);
        window.openingHours.openingHours.hasNoLatLngCoordsYet = true; // flag to first time renderView renders a map
        // setting up default config, if something is missing
        OpeningHours.config = OpeningHours.config || {};
        OpeningHours.config.library = OpeningHours.config.library || 'all';
        OpeningHours.config.timespan = OpeningHours.config.timespan || 'day';
        // NOTE: These names are hardcoded as they are in libcal right now. If KUBIS changes the names in libcal, they will disappear from the list (since the new name isn't here)
        OpeningHours.config.libraryWhitelist = OpeningHours.config.libraryWhitelist || 
          (data.locations && data.locations.map(function(location) {return location.name})) || 
          ['Den Sorte Diamant', 'Diamantens læsesale', 'FARMA','HUM','JUR','KUB Nord','KUB Frederiksberg','SAMF','TEOL','IVA'];
        OpeningHours.config.allLibraryColor = OpeningHours.config.allLibraryColor || '#000';
        OpeningHours.config.useLibraryColors = OpeningHours.config.useLibraryColors !== undefined ? OpeningHours.config.useLibraryColors : false;
        var stdI18n = {
            library: 'Bibliotek',
            openHourToday: 'Dagens Åbningstid',
            openHour: 'Åbningstid',
            closed: 'Lukket',
            byAppointment: 'Efter aftale',
            weekdays: ['Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag','Søndag'],
            weekdaysAbbr: ['man','tirs','ons','tors','fre','lør','søn'],
            info: 'Info',
            map: 'Kort',
            allWeek: 'Hele ugen',
            allLibraries: 'Alle biblioteker',
            ampm: false
        };
        OpeningHours.config.i18n = OpeningHours.config && OpeningHours.config.i18n || stdI18n;
        for (var key in stdI18n) {
            if (stdI18n.hasOwnProperty(key)) {
                OpeningHours.config.i18n[key] = OpeningHours.config.i18n[key] || stdI18n[key];
            }
        }

        window.openingHours.init(OpeningHours.config);
    };

    return OpeningHours;
})(window.document);

// load google.maps if they are not present
if (!window.google || !window.google.maps) {
    loadAdditionalJavascript('//maps.googleapis.com/maps/api/js?sensor=false&v=3.exp&callback=OpeningHours.initializeGMaps&key=AIzaSyDFxu8aPIl2RM5UBHupA-ryqdbsudkwU9I');
}
