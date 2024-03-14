/* global L, interact, toastr */

$(function () {

    ko.options.deferUpdates = true;
    var MIN_FILTER_LENGTH = 1;
    var EMPTY_LAYER = {title: '', descr: '', URL: ''};
    var MIN_VISIBLE_WIDTH = 65;
    var DEFAULT_BACKGROUND = {provider: 'Esri.WorldGrayCanvas'}; //Hydda.Base   Esri.WorldGrayCanvas
    var ZOOM_WHEEL_DELAY = 1000; // esperar ZOOM_WHEEL_DELAY ms antes de activar el zoom con la rueda
    var RESET_CLICKTOPLAY_INTERVAL = 10000; // esperar RESET_CLICKTOPLAY_INTERVAL ms antes de volver a mostrar el overlay

    //---------------------------------------------------------------------
    //Viewmodel
    //---------------------------------------------------------------------
    var viewmodel = {
        finishedLoading: ko.observable(false),
        fatalError: ko.observable(false),
        error: ko.observable('').extend({notify: 'always'}),
        warning: ko.observable('').extend({notify: 'always'}),
        message: ko.observable('').extend({notify: 'always'}),
        loading: ko.observable(true),
        mode: ko.observable(''),
        AOIs: ko.observableArray([]),
        layers: ko.observableArray([]),
        bookmarks: ko.observableArray([]),
        selectedAOI: ko.observable(-1),
        layer1Index: ko.observable(-1),
        layer2Index: ko.observable(-1),
        selectedBookmark: ko.observable(-1),
        isVisibleAoiSelector: ko.observable(false),
        isVisibleLayer1Selector: ko.observable(false),
        isVisibleLayer2Selector: ko.observable(false),
        isVisibleLayer1Info: ko.observable(false),
        isVisibleLayer2Info: ko.observable(false),
        isVisibleSharePopup: ko.observable(false),
        isVisibleBookmarkSelector: ko.observable(false),
        filterTextAOIs: ko.observable('').extend({rateLimit: 500}),
        filterTextBookmarks: ko.observable('').extend({rateLimit: 500}),
        lonmin: ko.observable(-180),
        lonmax: ko.observable(180),
        latmin: ko.observable(-90),
        latmax: ko.observable(90)
    };
    viewmodel.layers1 = ko.computed(function () {
        return viewmodel.layers().filter(function (service) {
            return service.group === 'B' || service.group === 'L';
        });
    });
    viewmodel.layers2 = ko.computed(function () {
        return viewmodel.layers().filter(function (service) {
            return service.group === 'B' || service.group === 'R';
        });
    });
    viewmodel.layer1 = ko.computed(function () {
        return viewmodel.layers()[viewmodel.layer1Index()] || EMPTY_LAYER;
    });
    viewmodel.layer2 = ko.computed(function () {
        return viewmodel.layers()[viewmodel.layer2Index()] || EMPTY_LAYER;
    });
    viewmodel.title1 = ko.computed(function () {
        return viewmodel.layer1().title;
    });
    viewmodel.title2 = ko.computed(function () {
        return viewmodel.layer2().title;
    });
    function buildUrlFromStatus() {
        /* esto primero para generar las dependencias */
        var lonmin = viewmodel.lonmin();
        var lonmax = viewmodel.lonmax();
        var latmin = viewmodel.latmin();
        var latmax = viewmodel.latmax();
        var lyr1 = viewmodel.layer1Index();
        var lyr2 = viewmodel.layer2Index();
        /* y esto después */
        if (!params)
            return '';
        var aois = encodeURIComponent(params.aois);
        var lyrs = encodeURIComponent(params.lyrs);
        var bgLyr = params.bgLyr;
        var url = location.origin + location.pathname + '?' +
                '&aois=' + aois + '&lyrs=' + lyrs +
                '&lyr1=' + lyr1 + '&lyr2=' + lyr2 + '&bgLyr=' + bgLyr +
                '&lonmin=' + lonmin + '&lonmax=' + lonmax + '&latmin=' + latmin + '&latmax=' + latmax;
        return url;
    }
    viewmodel.url = ko.computed(function () {
        return buildUrlFromStatus();
    });
    viewmodel.shareText = ko.computed(function () {
        var shareText = 'Comparador de cartografía';
        //Para que durante la carga no se muestre '/' como título
        if (viewmodel.title1().length && viewmodel.title2().length)
            shareText = viewmodel.title1() + ' / ' + viewmodel.title2();
        return shareText;
    });
    viewmodel.getCapabilitiesFromWmsUrl = function (url) {
        url = (url || '').toString();
        if (!url.length)
            return '';
        //que acabe en ?
        url = '?' === url[url.length - 1] ? url : url + '?';
        url = url + '&service=wms&request=getcapabilities';
        return url;
    };
    viewmodel.addBookmark = function () {
        var title = viewmodel.filterTextBookmarks();
        if (title.length >= MIN_FILTER_LENGTH) {
            addBookmark(title);
            viewmodel.filterTextBookmarks('');
            saveBookmarks();
        } else {
            if (title === '')
                viewmodel.message('El nombre no puede estar en blanco');
            else
                viewmodel.message('El nombre es demasiado corto');
        }
    };
    viewmodel.deleteBookmark = function () {
        deleteBookmark(this);
        saveBookmarks();
    };
    viewmodel.isVisibleSharePopup.subscribe(function () {
        updateShareButtons();
    });
    //creamos un computable para construir los mensajes de aviso
    ko.computed(function () {
        var warnings = [];
        //si son los dos -1 no pasa nada, es que estamos en el inicio
        if (viewmodel.layer1Index() >= 0) {
            if (viewmodel.layer1Index() === viewmodel.layer2Index()) {
                warnings.push('¡Las dos capas seleccionadas son iguales!');
            }
        }
        if (!viewmodel.layers().length) {
            warnings.push('¡No hay capas!');
        }
        if (!viewmodel.layers1().length) {
            warnings.push('¡No hay capas en el mapa superior!');
        }
        if (!viewmodel.layers2().length) {
            warnings.push('¡No hay capas en el mapa inferior!');
        }
        var warningMsg = warnings.join('\n\r');
        viewmodel.warning(warningMsg);
    });
    viewmodel.getIcon = function (obj) {
        return 'fa-' + obj.icon;
    };
    viewmodel.matchAOIFilter = function (aoi) {
        return matchFilter(aoi, this.filterTextAOIs());
    };
    viewmodel.matchBookmarkFilter = function (bkm) {
        return matchFilter(bkm, this.filterTextBookmarks());
    };
    viewmodel.toggleMode = function () {
        viewmodel.mode(viewmodel.mode() === '' ? 'clon' : '');
        setTimeout(function () {
            mapA.invalidateSize({pan: false});
            var center = mapA.getCenter();
            mapB.invalidateSize({pan: false});
            mapB.panTo(center, {animate: false});
        }, 300);
        //var evt = document.createEvent("HTMLEvents");
        //evt.initEvent('resize', true, false);
        //window.dispatchEvent(evt);
    };
    ko.applyBindings(viewmodel, document.getElementById("html")); //para aplicarlo también al <title>
    //---------------------------------------------------------------------


    //---------------------------------------------------------------------
    //Mensajes
    //---------------------------------------------------------------------
    toastr.options = {
        "closeButton": true,
        "debug": false,
        "newestOnTop": true,
        "progressBar": true,
        "positionClass": "toast-top-center",
        "preventDuplicates": true,
        "onclick": null,
        "showDuration": "600",
        "hideDuration": "1000",
        "timeOut": "5000",
        "extendedTimeOut": "2500",
        "showEasing": "swing",
        "hideEasing": "linear",
        "showMethod": "fadeIn",
        "hideMethod": "fadeOut"
    };
    function showMessage(type, title, message) {
        if (message.length)
            toastr[type](message, title);
    }
    function showWarning(message) {
        showMessage('warning', 'Atención', message);
    }
    function showInfo(message) {
        showMessage('info', 'Información', message);
    }
    function showError(message) {
        showMessage('error', 'Error', message);
    }
//---------------------------------------------------------------------




//---------------------------------------------------------------------
//Parámetros URL
//---------------------------------------------------------------------
//parámetros realmente pasados en la URL
    var params = {};
    // parámetros que admite en la URL y valores por defecto:
    var urlParamDefaults = {
        //¡AHORA ES aois! topoJSON json con los topónimos y extensiones (%2F = /)
        aois: 'json/toponimos.json',
        //¡AHORA ES lyrs! servJSON json con los servicios (%2F = /)
        lyrs: 'json/servicios.json',
        //extensión seleccionada
        //¡AHORA ES aoi! selExtIndex: 0,
        aoi: undefined,
        //servicios seleccionados inicialmente
        //es el índice (empezando por cero) en
        //el orden que tienen en el archivo servJSON
        //¡AHORA ES lyr1! selWMS1Index: 0,
        //¡AHORA ES lyr2! selWMS2Index: 1,
        lyr1: -1,
        lyr2: -1,
        //WMS de fondo
        //¡AHORA ES bglyr! backWMSIndex: -1, //ninguno
        bglyr: -1, //ninguno
        //extensión inicial
        lonmin: undefined,
        latmin: undefined,
        lonmax: undefined,
        latmax: undefined,
        //modo de funcionamiento
        mode: '', //'clon',
        //¿geolocalizar inicialmente?
        geoloc: true,
        //¿mostrar el botón de compartir?
        social: true,
        //¿mostrar un div con un botón para interactuar cuando está embebido en otra página?
        clicktoplay: false,
        //¿qué botones mostrar?
        buttons: "11111111"
    };
    //Obtener parámetros del URL
    function getUrlParams() {
        var vars = {};
        window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function (m, key, value) {
            if (value.length) { //si es "" lo ignoramos (siempre es una cadena)
                value = decodeURIComponent(value);
                vars[key] = value;
                vars[key] = value.toLowerCase() === 'true' ? true : vars[key];
                vars[key] = value.toLowerCase() === 'false' ? false : vars[key];
                vars[key] = isFinite(value) ? parseFloat(value) : vars[key];
            }
        });
        //backward compatibility
        vars.aoi = vars.aoi === 0 ? 0 : vars.aoi || vars.selExtIndex;
        vars.lyr1 = vars.lyr1 === 0 ? 0 : vars.lyr1 || vars.selWMS1Index;
        vars.lyr2 = vars.lyr2 === 0 ? 0 : vars.lyr2 || vars.selWMS2Index;
        vars.bgLyr = vars.bgLyr === 0 ? 0 : vars.bgLyr || vars.backWMSIndex;
        vars.aois = vars.hasOwnProperty('aois') ? vars.aois : vars.topoJSON;
        vars.lyrs = vars.hasOwnProperty('lyrs') ? vars.lyrs : vars.servJSON;
        return $.extend({}, urlParamDefaults, vars);
    }

    //estos valores corresponden al número de orden en el parámetro 'buttons'
    //empezando por el último dígito
    var BUTTONS = {
        LAYER_A: 1,
        LAYER_B: 2,
        FULLSCREEN: 3,
        LOCATE: 4,
        SOCIAL: 5,
        AOIS: 6,
        BOOKMARKS: 7,
        MODE: 8
    };
    function isButtonToBeShown(button) {
        return !!parseInt(params.buttons.toString()[params.buttons.toString().length - button]);
    }
    //---------------------------------------------------------------------




    //---------------------------------------------------------------------
    //Búsqueda
    //---------------------------------------------------------------------
    function objToSearchText(obj, properties) {
        properties = properties || [];
        var values = [];
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                if (!properties.length || (properties.indexOf(i) > -1)) {
                    values.push(obj[i]);
                }
            }
        }
        return values.join(' ').trim();
    }
    var looseSearchStringRegex = /á|é|í|ó|ú|ü|ñ/gi;
    var looseSearchStringConversions = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u", "ñ": "n",
        "Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U", "Ñ": "N"
    };
    function toLooseSearchString(str) {
        return str.replace(looseSearchStringRegex, function (c) {
            return looseSearchStringConversions[c] || c;
        });
    }

    var searchText = '';
    var looseSearchText = '';
    function matchFilter(obj, text) {
        text = text || '';
        if (text.length < MIN_FILTER_LENGTH)
            return true;
        if (text !== searchText) {
            searchText = text.toLowerCase();
            looseSearchText = toLooseSearchString(text).toLowerCase();
        }
        obj._looseSearchText = obj._looseSearchText || toLooseSearchString(objToSearchText(obj)).toLowerCase();
        return -1 < obj._looseSearchText.indexOf(looseSearchText);
    }
    ;
    //---------------------------------------------------------------------




    //---------------------------------------------------------------------
    //Carga de AOIs y del listado de capas
    //---------------------------------------------------------------------
    function extentText(obj) {
        return obj.lonmin + ', ' + obj.latmin + ', ' + obj.lonmax + ', ' + obj.latmax;
    }
    function loadAois() {
        if (!params.aois) //no cargamos nada
            return $.Deferred().resolve();
        return $.getJSON(params.aois, function (json) {
            var AOIs = json && json.extents || [];
            $.each(AOIs, function (index, objAOI) {
                objAOI.index = index;
                objAOI.type = objAOI.type || 'general';
                objAOI.icon = 'map-pin';
                objAOI.descr = objAOI.descr || '';
                objAOI.extent = extentText(objAOI);
                viewmodel.AOIs.push(objAOI);
            });
        });
    }

    function loadLayers() {
        return $.getJSON(params.lyrs, function (json) {
            var layers = json && json.layers || [];
            $.each(layers, function (index, objWMS) {
                objWMS.index = index;
                objWMS.icon = 'map';
                objWMS.descr = objWMS.descr || objWMS.Descr || ''; //backward compatibility
                objWMS.url = objWMS.url || objWMS.URL || ''; //backward compatibility
                viewmodel.layers.push(objWMS);
            });
        });
    }
    //---------------------------------------------------------------------



    //---------------------------------------------------------------------
    //Geolocalización
    //---------------------------------------------------------------------
    function goToCurrentLocation() {
        mapA.locate({setView: true, maxZoom: 14});
    }
    function addMarkerToMap(lat, lon, radius, map) {
        var mrk = L.marker([lat, lon]).addTo(map);
        var rad = L.circle([lat, lon], radius).addTo(map);
        setTimeout(function () {
            map.removeLayer(mrk).removeLayer(rad);
        }, 10000);
    }
    function addMarker(lat, lon, radius) {
        addMarkerToMap(lat, lon, radius, mapA);
        addMarkerToMap(lat, lon, radius, mapB);
    }
    function onLocationFound(e) {
        var radius = e.accuracy / 2;
        addMarker(e.latlng.lat, e.latlng.lng, radius);
    }
    //Errores de geolocalización
    //PERMISSION_DENIED = 1;
    //POSITION_UNAVAILABLE = 2;
    //TIMEOUT = 3;
    function onLocationError(e) {
        if (e.code === 1)
            viewmodel.message('Se denegó la posición');
        else if (e.code === 2)
            viewmodel.warning('La posición no está disponible');
        else if (e.code === 3)
            viewmodel.warning('La posición no está disponible (tiempo de espera agotado)');
        else
            viewmodel.warning(e.message);
    }
    //---------------------------------------------------------------------



    //---------------------------------------------------------------------
    //Gestión de marcadores
    //---------------------------------------------------------------------
    function saveBookmarks() {
        var bookmarksJSON = JSON.stringify(viewmodel.bookmarks());
        try {  //en un iframe puede dar error
            localStorage.setItem("bookmarks", bookmarksJSON);
        } catch (e) {
            // ignoramos el error
        }
    }
    function loadBookmarks() {
        try {  //en un iframe puede dar error
            var bookmarksJSON = localStorage.getItem("bookmarks");
        } catch (e) {
            bookmarksJSON = "[]";
        }
        var bookmarks = bookmarksJSON ? JSON.parse(bookmarksJSON) : [];
        viewmodel.bookmarks(bookmarks);
    }
    function addBookmark(title) {
        var lonmin = viewmodel.lonmin();
        var lonmax = viewmodel.lonmax();
        var latmin = viewmodel.latmin();
        var latmax = viewmodel.latmax();
        var bookmark = {title: title, lonmin: lonmin, lonmax: lonmax, latmin: latmin, latmax: latmax};
        bookmark.icon = 'bookmark';
        bookmark.extent = extentText(bookmark);
        viewmodel.bookmarks.push(bookmark);
    }
    function deleteBookmark(bookmark) {
        viewmodel.bookmarks.remove(bookmark);
    }
    //---------------------------------------------------------------------



    //---------------------------------------------------------------------
    //Gestión del mapa
    //---------------------------------------------------------------------
    var mapOptions = {
        inertia: true,
        zoomControl: false,
        attributionControl: false,
        doubleClickZoom: false,
        zoomSnap: 0.2 //1 por niveles, 0 desactivado
    };
    var mapA;
    var mapB;
    function createMap(mapId) {
        return L.map(mapId, mapOptions);
    }

    //Creación de capas
    function createLayer(lyrDef) {
        if (lyrDef.provider)
            return L.tileLayer.provider(lyrDef.provider);
        if (lyrDef.tiled)
            return L.tileLayer.wmts(lyrDef.url, {
                layer: lyrDef.layer,
                tilematrixSet: lyrDef.tilematrixSet || 'EPSG:3857',
                format: lyrDef.format || 'image/png',
                attribution: lyrDef.title
            });
        return L.tileLayer.wms(lyrDef.url, {
            layers: lyrDef.layers,
            format: lyrDef.format || 'image/png',
            transparent: true,
            attribution: lyrDef.title
        });
    }

    //Desplazamiento en el mapa
    function goToAOI(AOI) {
        goToExtent(AOI.lonmin, AOI.latmin, AOI.lonmax, AOI.latmax);
    }
    // Número: 35.865
    // Grados, minutos, segundos: -7º12'34'' / -7º12'34" / -7d12m34s / -7d 12m 34s  / -7D 12m 34s
    function parseDMS(coord) {
        if (typeof coord === 'string') {
            var tokens = coord
                    .replace("D", 'º').replace("d", 'º').replace("m", "'").replace('s', '"')
                    .replace("''", '"')
                    .replace('º', '|').replace("'", '|').replace('"', '|')
                    .split('|')
                    .map(function (tk) {
                        return tk.trim();
                    });
            var deg = parseFloat(tokens[0])
            var sign = Math.sign(deg) || 1;
            coord = deg + sign * parseFloat(tokens[1]) / 60 + sign * parseFloat(tokens[2]) / 3600;
        }
        return coord;
    }
    function goToExtent(lonmin, latmin, lonmax, latmax) {
        //el orden es al reves porque son pares lat,long en vez de x,y
        mapA.fitBounds([[parseDMS(latmin), parseDMS(lonmin)], [parseDMS(latmax), parseDMS(lonmax)]], {maxZoom: 15});
    }

    //Carga de capas en respuesta a cambios en el modelo
    var layer1;
    viewmodel.layer1Index.subscribe(function (selLyr) {
        if (layer1)
            mapA.removeLayer(layer1);
        layer1 = createLayer(viewmodel.layers()[selLyr]);
        mapA.addLayer(layer1);
        closeDialogs();
    });
    var layer2;
    viewmodel.layer2Index.subscribe(function (selLyr) {
        if (layer2)
            mapB.removeLayer(layer2);
        layer2 = createLayer(viewmodel.layers()[selLyr]);
        mapB.addLayer(layer2);
        closeDialogs();
    });
    //Cambio de extensión en respuesta a cambios en el modelo
    viewmodel.selectedAOI.subscribe(function (selAOI) {
        var AOI = viewmodel.AOIs()[selAOI];
        if (AOI)
            goToAOI(AOI);
        closeDialogs();
    });
    viewmodel.selectedBookmark.subscribe(function (selBookmark) {
        var bookmark = viewmodel.bookmarks()[selBookmark];
        if (bookmark)
            goToAOI(bookmark);
        closeDialogs();
    });
    //Configuración del mapa
    function setupMap(map, layers) {
        map.fitWorld();
        layers = layers || [];
        for (var i in layers)
            layers[i].addTo(map);
        map.on('locationfound', onLocationFound);
        map.on('locationerror', onLocationError);
        L.control.mapCenterCoord({
            icon: false,
            onMove: true,
            latlngFormat: 'DMS',
            template: '<span class="fa fa-arrows-v" aria-hidden="true"></span> {y} <br> <span class="fa fa-arrows-h" aria-hidden="true"></span> {x}',
            latlngDesignators: true
        }).addTo(map);
        L.control.scale({imperial: false}).addTo(map);
    }

    function enableWheelZoom() {
        mapA.scrollWheelZoom.enable();
        mapB.scrollWheelZoom.enable();
    }
    function disableWheelZoom() {
        mapA.scrollWheelZoom.disable();
        mapB.scrollWheelZoom.disable();
    }
    //---------------------------------------------------------------------


    //---------------------------------------------------------------------
    //Gestión de la IU
    //---------------------------------------------------------------------
    //Movimiento de la cortinilla
    function setOverlap(overlapPx) {
        if (canChangeOverlap()) {
            var fullWidth = $('body').width();
            /* esto es necesario porque en IE se desplaza la cortina con los clics en los botones 
             * de esta manera evitamos ese problema, ya que no se moverá la cortina cuando se 
             * pulse cerca del borde, que es donde están los botones */
            if (overlapPx < MIN_VISIBLE_WIDTH)
                return;
            if (overlapPx > fullWidth - MIN_VISIBLE_WIDTH)
                return;
            var newSize = (100 * overlapPx / fullWidth) + '%';
            $('#map-a-wrapper').width(newSize);
        }
    }

    function canChangeOverlap() {
        return viewmodel.mode() !== 'clon';
    }

    //Fullscreen
    function toggleFullscreen() {
        var elem = document.getElementById("global-wrapper");
        //Aseguramos la misma API para todos los navegadores
        elem._requestFullscreen = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
        document._exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        document._fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
        if (!document._fullscreenElement) {
            if (elem._requestFullscreen) {
                elem._requestFullscreen();
            }
        } else {
            if (document._exitFullscreen) {
                document._exitFullscreen();
            }
        }
    }
    function isFullscreenAllowed() {
        var fullscreenEnabled = document.fullscreenEnabled || document.webkitFullscreenEnabled || document.mozFullScreenEnabled;
        if (fullscreenEnabled === undefined)
            if (isEmbedded()) {
                try {
                    if (window.frameElement)
                        return window.frameElement.hasAttribute("allowFullScreen") ||
                                window.frameElement.hasAttribute("webkitAllowFullScreen") ||
                                window.frameElement.hasAttribute("mozallowfullscreen");
                    return window.parent.hasAttribute("allowFullScreen") ||
                            window.parent.hasAttribute("webkitAllowFullScreen") ||
                            window.parent.hasAttribute("mozallowfullscreen");
                } catch (e) {
                    return true; //puede que no funcione, pero damos la oportunidad para ello
                }
            } else {
                return true; //puede que no funcione, pero damos la oportunidad para ello
            }
        return fullscreenEnabled;
    }

    //Detectar si está incrustado en otra página
    function isEmbedded() {
        //usamos window.frameElement
        try {
            if (window.frameElement)
                return true;
            else
                //si window.frameElement no está disponible (es undefined)
                //puede que no esté incrustado o que lo esté en un documento
                //con un origen diferente
                return window.self !== window.top;
        } catch (e) {
            return false;
        }
    }

    function closeDialogs() {
        viewmodel.isVisibleSharePopup(false);
        viewmodel.isVisibleAoiSelector(false);
        viewmodel.isVisibleLayer1Selector(false);
        viewmodel.isVisibleLayer2Selector(false);
        viewmodel.isVisibleLayer1Info(false);
        viewmodel.isVisibleLayer2Info(false);
        viewmodel.isVisibleBookmarkSelector(false);
        viewmodel.selectedAOI(-1);
        viewmodel.selectedBookmark(-1);
    }

    function addClickToPlay() {
        $('body').addClass('embedded');
    }
    function removeClickToPlay() {
        $('body').removeClass('embedded');
    }

    function updateShareButtons() {
        $("#share-buttons").jsSocials({
            url: viewmodel.url(),
            text: viewmodel.shareText(),
            showCount: false,
            showLabel: true,
            shares: [
                "email",
                "twitter",
                "facebook",
                "googleplus",
                "linkedin",
                {share: "pinterest", label: "Pin this"},
                "whatsapp"
            ]
        });
    }
    //destacamos los carateres buscados en los resultados 
    var markOptions = {separateWordSearch: false};
    viewmodel.filterTextAOIs.subscribe(function (text) {
        $(".aoi-listitem").unmark().mark(text, markOptions);
    });
    viewmodel.filterTextBookmarks.subscribe(function (text) {
        $(".bookmark-listitem").unmark().mark(text, markOptions);
    });

    //Intentamos detectar los zums con la rueda no intencionados
    var enableWheelZoomTimeout;
    var addClickToPlayTimeout;
    function preventUnintendedZoom() {
        //cuando entre el ratón, tras una breve pausa activamos
        //el zum con la rueda
        $('#global-wrapper').on('mouseenter', function () {
            //dejamos de contar para volver a mostrar el overlay
            clearTimeout(addClickToPlayTimeout);
            //empezamos a contar para activar el zoom con la rueda
            clearTimeout(enableWheelZoomTimeout);
            enableWheelZoomTimeout = setTimeout(enableWheelZoom, ZOOM_WHEEL_DELAY);
        });
        //cuando salga el ratón desactivamos el zum con la rueda
        $('#global-wrapper').on('mouseleave', function () {
            clearTimeout(enableWheelZoomTimeout);
            disableWheelZoom();
            //empezamos a contar para volver a mostrar el overlay
            if (params.clicktoplay)
                addClickToPlayTimeout = setTimeout(addClickToPlay, RESET_CLICKTOPLAY_INTERVAL);
        });
        //mientras continúe usando la rueda sobre el mapa reseteamos el tiempo de espera
        //para activar el zoom
        $('#map-wrapper').on('wheel', function () {
            clearTimeout(enableWheelZoomTimeout);
            enableWheelZoomTimeout = setTimeout(enableWheelZoom, ZOOM_WHEEL_DELAY);
        });
        //Añadir un overlay para bloquear las interacciones
        if (params.clicktoplay) {
            $('#embedded-overlay').on('click', function () {
                enableWheelZoom();
                removeClickToPlay();
            });
            addClickToPlay();
        }
        disableWheelZoom();
    }
    //---------------------------------------------------------------------





    //---------------------------------------------------------------------
    //Inicialización de la aplicación
    //---------------------------------------------------------------------
    function initializeUI() {
        //botones
        //mostramos los selectores de capas, siempre que haya más de dos capas
        if (isButtonToBeShown(BUTTONS.LAYER_A) && viewmodel.layers().length > 2)
            L.easyButton({states: [{
                        icon: 'fa-map',
                        title: 'Seleccionar cartografía',
                        onClick: viewmodel.isVisibleLayer1Selector
                    }]}).addTo(mapA);
        if (isButtonToBeShown(BUTTONS.LAYER_B) && viewmodel.layers().length > 2)
            L.easyButton({states: [{
                        icon: 'fa-map',
                        title: 'Seleccionar cartografía',
                        onClick: viewmodel.isVisibleLayer2Selector
                    }]}).setPosition('topright').addTo(mapB);
        //botones de zoom (se muestran siempre)
        L.control.zoom({zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar'}).addTo(mapA);
        //botón para controlar el modo de funcionamiento
        if (isButtonToBeShown(BUTTONS.MODE))
            L.easyButton({states: [{
                        icon: 'fa-eye',
                        title: 'Modo clonado/continuo',
                        onClick: viewmodel.toggleMode
                    }]}).addTo(mapA);
        //mostramos el selector de áreas de interés, siempre que haya alguna
        if (isButtonToBeShown(BUTTONS.AOIS) && viewmodel.AOIs().length)
            L.easyButton({states: [{
                        icon: 'fa-map-pin',
                        title: 'Ir a...',
                        onClick: viewmodel.isVisibleAoiSelector
                    }]}).setPosition('topright').addTo(mapB);
        //mostramos el selector de marcadores
        if (isButtonToBeShown(BUTTONS.BOOKMARKS))
            L.easyButton({states: [{
                        icon: 'fa-bookmark',
                        title: 'Marcadores',
                        onClick: viewmodel.isVisibleBookmarkSelector
                    }]}).setPosition('topright').addTo(mapB);
        //mostramos el botón de compartir
        if (isButtonToBeShown(BUTTONS.SOCIAL) && params.social)
            L.easyButton({states: [{
                        icon: 'fa-share-alt',
                        title: 'Compartir',
                        onClick: viewmodel.isVisibleSharePopup
                    }]}).setPosition('topright').addTo(mapB);
        //mostramos el botón de pantalla completa, pero sólo si es posible pasar a pantalla completa
        if (isButtonToBeShown(BUTTONS.FULLSCREEN) && isFullscreenAllowed())
            L.easyButton({states: [{
                        icon: 'fa-expand',
                        title: 'Pantalla completa',
                        onClick: toggleFullscreen
                    }]}).setPosition('bottomright').addTo(mapB);
        if (isButtonToBeShown(BUTTONS.LOCATE))
            L.easyButton({states: [{
                        icon: 'fa-map-marker',
                        title: 'Ir a mi ubicación',
                        onClick: goToCurrentLocation
                    }]}).setPosition('bottomright').addTo(mapB);
        //Interacciones con la IU
        var slideInteraction = interact('#map-a-wrapper');
        slideInteraction.resizable({
            enabled: canChangeOverlap(),
            preserveAspectRatio: true,
            edges: {right: true}
        }).on('resizestart', function () {
            $('body').addClass('resizing');
        }).on('resizeend', function () {
            $('body').removeClass('resizing');
        }).on('resizemove', function (event) {
            setOverlap(event.rect.width);
        });
        //cuando cambia el modo revisamos si se puede deslizar
        viewmodel.mode.subscribe(function () {
            slideInteraction.resizable({
                enabled: canChangeOverlap()
            });
            $('#map-a-wrapper').css('width', '');
            $('.leaflet-control-mapcentercoord-icon').css('transform', '');
        });
        $('#map-a-wrapper, #map-b-wrapper').hammer().on("tap", function (event) {
            setOverlap(event.gesture.center.x || 0);
        });
        $('#overlay').on('click', function () {
            closeDialogs();
        });
        //Si está insertado en una página intentamos evitar los zums no deseados
        if (isEmbedded()) {
            preventUnintendedZoom();
        }
    }

    function getInitialLayerIndexes() {
        //determinamos las capas que hay que utilizar inicialmente
        //lista de capas general, a la izquierda y a la derecha
        var layers = viewmodel.layers();
        var layers1 = viewmodel.layers1();
        var layers2 = viewmodel.layers2();
        //si nos han indicado algo en el URL, usamos eso
        var candidateLayer1 = layers.indexOf(layers1[params.lyr1]);
        var candidateLayer2 = layers.indexOf(layers2[params.lyr2]);
        //si no se ha indicado nada, usamos las primeras
        if (candidateLayer1 === -1) {
            //no nos han indicado nada en el URL
            candidateLayer1 = 0; //de momento la primera de la lista izquierda
            if (layers1.length) {
                candidateLayer1 = layers.indexOf(layers1[0]);
            }
        }
        if (candidateLayer2 === -1) {
            //no nos han indicado nada en el URL
            candidateLayer2 = 0; //de momento la primera de la lista derecha
            var layers = viewmodel.layers();
            if (layers2.length) {
                candidateLayer2 = layers.indexOf(layers2[0]);
            }
        }
        //si son la misma y no se había indicado capa a la derecha
        if (candidateLayer1 === candidateLayer2 && params.lyr2 === -1 && layers2.length > 1) {
            //usamos la siguiente a la derecha
            candidateLayer2 = layers.indexOf(layers2[1]);
        }
        //si son la misma y no se había indicado capa a la izquierda
        if (candidateLayer1 === candidateLayer2 && params.lyr1 === -1 && layers1.length > 1) {
            //usamos la siguiente a la izquierda
            candidateLayer1 = layers.indexOf(layers1[1]);
        }
        //si son la misma
        if (candidateLayer1 === candidateLayer2 && layers2.length > 1) {
            //usamos la primera a la derecha
            candidateLayer2 = layers.indexOf(layers2[0]);
        }
        //si son la misma
        if (candidateLayer1 === candidateLayer2 && layers1.length > 1) {
            //usamos la siguiente a la derecha
            candidateLayer2 = layers.indexOf(layers2[1]);
        }
        return [candidateLayer1, candidateLayer2];
    }

    function initializeMap() {
        //Sincronización con el viewmodel
        mapA.on('moveend', function () {
            var mapextent = mapA.getBounds();
            viewmodel.lonmin(mapextent.getEast());
            viewmodel.lonmax(mapextent.getWest());
            viewmodel.latmin(mapextent.getSouth());
            viewmodel.latmax(mapextent.getNorth());
        });
        if (!viewmodel.layers().length)
            //así no se puede continuar
            return viewmodel.fatalError('¡El listado de servicios está vacío!');
        var backLayerDef = viewmodel.layers()[params.bgLyr] || DEFAULT_BACKGROUND;
        setupMap(mapA, [createLayer(backLayerDef)]);
        setupMap(mapB, [createLayer(backLayerDef)]);
        //buscamos la capa que hay que utilizar si no nos han indicado ninguna
        layerIndexes = getInitialLayerIndexes();
        params.lyr1 = layerIndexes[0];
        params.lyr2 = layerIndexes[1];
        viewmodel.layer1Index(params.lyr1);
        viewmodel.layer2Index(params.lyr2);
        //Sincronización de los dos mapas
        var syncOptions = {
            syncCursor: true,
            syncCursorMarkerOptions: {
                radius: 6,
                weight: 2,
                fillOpacity: 0,
                color: '#ff0'
            }
        };
        mapA.sync(mapB, syncOptions);
        mapB.sync(mapA, syncOptions);
        //mostramos andalucía
        goToExtent(-7.53041, 35.69869, -1.50326, 38.78516);
        //vamos a la extensión inicial
        if (params.lonmin && params.latmin && params.lonmax && params.latmax)
            goToExtent(params.lonmin, params.latmin, params.lonmax, params.latmax);
        else if (params.lon && params.lat)
            goToExtent(params.lon, params.lat, params.lon, params.lat);
        else if ($.isNumeric(params.aoi) && viewmodel.AOIs()[params.aoi])
            //vamos a la AOI indicada
            goToAOI(viewmodel.AOIs()[params.aoi]);
        else
        //o buscamos la ubicación salvo que no lo quieran así
        if (params.geoloc)
            goToCurrentLocation();
    }

    function initialize() {
        initializeUI();
        initializeMap();
        viewmodel.finishedLoading(true);
    }
    //---------------------------------------------------------------------






    //---------------------------------------------------------------------
    //Obtenemos los parámetros
    params = getUrlParams();
    //modo de funcionamiento
    viewmodel.mode(params.mode.toString().toLowerCase());
    //creación de los mapas
    mapA = createMap('map-a');
    mapB = createMap('map-b');
    //cargamos los marcadores
    loadBookmarks();
    viewmodel.error.subscribe(showError);
    viewmodel.warning.subscribe(showWarning);
    viewmodel.message.subscribe(showInfo);
    //Estas funciones devuelven sendas promesas
    var loadTopoPromise = loadAois();
    var loadServicesPromise = loadLayers();
    loadTopoPromise.fail(function () {
        //Esto no es un error crítico
        viewmodel.error('¡Se ha producido un error al cargar el listado de lugares de interés!');
    });
    $.when(loadTopoPromise, loadServicesPromise).done(initialize).fail(function () {
        //probamos con los servicios sólo
        loadServicesPromise.done(initialize).fail(function () {
            viewmodel.error('¡Se ha producido un error al cargar el listado de servicios!');
            //esto es un error crítico
            viewmodel.fatalError('¡Se ha producido un error al cargar el listado de servicios!');
        });
    });
    //---------------------------------------------------------------------
});