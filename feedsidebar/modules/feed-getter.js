Components.utils.import("resource://feedbar-modules/treeview.js");
Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
Components.utils.import("resource://gre/modules/Promise.jsm");

var FEED_GETTER = {
	strings : {
		_backup : null,
		_main : null,
		
		initStrings : function () {
			if (!this._backup) { this._backup = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://feedbar-default-locale/content/locale.properties"); }
			if (!this._main) { this._main = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://feedbar/locale/locale.properties"); }
		},
		
		getString : function (key) {
			this.initStrings();
			
			var rv = "";
			
			try {
				rv = this._main.GetStringFromName(key);
			} catch (e) {
			}
			
			if (!rv) {
				try {
					rv = this._backup.GetStringFromName(key);
				} catch (e) {
				}
			}
			
			return rv;
		},
		
		getFormattedString : function (key, args) {
			this.initStrings();
			
			var rv = "";
			
			try {
				rv = this._main.formatStringFromName(key, args, args.length);
			} catch (e) {
			}
			
			if (!rv) {
				try {
					rv = this._backup.formatStringFromName(key, args, args.length);
				} catch (e) {
				}
			}
			
			return rv;
		}
	},
	
	get feedWindows() { 
		var sidebars = [];
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		
		var enumerator = wm.getEnumerator("navigator:browser");
		
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			
			try {
				var sidebar = win.document.getElementById("sidebar-box");
			
				if (!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar'){
					sidebars.push(win.document.getElementById("sidebar").contentWindow);
				}
			} catch (e) {
				FEED_GETTER.log("ERROR IN get feedWindow: " + e);
			}
		}
		
		return sidebars;
	},
	
	get windows() {
		var windows = [];
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		
		var enumerator = wm.getEnumerator("navigator:browser");
		
		while (enumerator.hasMoreElements()) {
			windows.push(enumerator.getNext());
		}
		
		return windows;
	},
	
	get window() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		return wm.getMostRecentWindow("navigator:browser");
	},
	
	sidebarIsOpen : function () {
		var wins = FEED_GETTER.feedWindows;
		
		if (wins.length >= 1) {
			return true;
		}
		
		return false;
	},
	
	prefs : null,
	missedUpdate : false,
	
	newItemCountPre : 0,
	
	loadTimer : null,
	feedData : { },
	currentRequest : null,
	
	consecutiveFailures : 0,
	
	loadStack : 0,
	
	load : function () {
		FEED_GETTER.loadStack++;
		
		if (FEED_GETTER.loadStack == 1) {
			FEED_GETTER.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
			FEED_GETTER.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
			FEED_GETTER.prefs.addObserver("", FEED_GETTER, false);
			
			var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			bmsvc.addObserver(FEED_GETTER, false);
			
			FEED_GETTER.startFetchingFeeds();
		}
	},
	
	unload : function () {
		FEED_GETTER.loadStack--;
		
		if (FEED_GETTER.loadStack == 0) {
			FEED_GETTER.killCurrentRequest();
			FEED_GETTER.prefs.removeObserver("", FEED_GETTER);
			
			var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			bmsvc.removeObserver(FEED_GETTER);
			
			FEED_GETTER.closeDB();
		}
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "updateFrequency":
				FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
			break;
		}
	},
	
	setTimeout : function (callback, timeout, arg1, arg2, arg3, arg4) {
		var cb = {
			notify : function (timer) {
				callback(arg1, arg2, arg3, arg4);
			}
		};
		
		var timer = Components.classes["@mozilla.org/timer;1"]
		            .createInstance(Components.interfaces.nsITimer);
		timer.initWithCallback(cb, timeout, timer.TYPE_ONE_SHOT);
		return timer;
	},
	
	clearTimeout : function (timer) {
		if (timer) {
			timer.cancel();
		}
	},
	
	feedUpdateTimeout : null,
	statusTextTimeout : null,
	feedsToFetch : [],
	feedIndex : 0,
	secondsBetweenFeeds : 1,
	
	startFetchingFeeds : function () {
		FEED_GETTER.feedsToFetch = [];
		FEED_GETTER.feedIndex = 0;
		
		var livemarkIds = PlacesUtils.annotations.getItemsWithAnnotation("livemark/feedURI", {});

		FEED_GETTER.getLivemarks(livemarkIds).then(function (livemarks) {
			for (var i = 0; i < livemarks.length; i++) {
				FEED_GETTER.feedsToFetch.push({ name : livemarks[i].title, feed : livemarks[i].feedURI.spec });
				FEED_GETTER.feedData[livemarks[i].feedURI.spec.toLowerCase()] = { name : livemarks[i].title, bookmarkId : livemarks[i].id, uri : livemarks[i].feedURI.spec };
			}
			
			if (FEED_GETTER.feedsToFetch.length == 0) {
				FEED_GETTER.notifyNoFeeds();
			}

			FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
		}, function (err) {
			FEED_GETTER.log(err);
		});
		
	},
	
	removeAFeed : function (livemarkId) {
		for (feedURL in FEED_GETTER.feedData) {
			var feed = FEED_GETTER.feedData[feedURL];
			
			if (feed.bookmarkId == livemarkId) {
				delete FEED_GETTER.feedData[feedURL];
				
				feedURL = feedURL.toLowerCase();
				
				for (var i = 0; i < FEED_GETTER.feedsToFetch.length; i++) {
					if (FEED_GETTER.feedsToFetch[i].feed.toLowerCase() == feedURL) {
						FEED_GETTER.feedsToFetch.splice(i, 1);
						return true;
					}
				}
				
				break;
			}
		}
		
		return false;
	},
	
	rapidUpdate : 0,
	
	setStatusText : function (label, tooltiptext, url) {
		if (!label) label = "";
		
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			var statusText = win.document.getElementById("feedbar-loading-text")
			
			if (statusText) {
				statusText.setAttribute("value", label);
				statusText.setAttribute("tooltiptext", tooltiptext);
				statusText.setAttribute("url", url);
			}
		}
	},
	
	clearStatusText : function () {
		FEED_GETTER.setStatusText();
	},
	
	updateAFeed : function (indexOverride) {
		function setTimeoutForNext() {
			if (FEED_GETTER.rapidUpdate) {
				var interval = 0.5;
			}
			else {
				if (FEED_GETTER.secondsBetweenFeeds == 0) {
					var interval = 60;
					
					FEED_GETTER.clearStatusText();
				}
				else {
					var interval = FEED_GETTER.secondsBetweenFeeds;
				}
			}
			
			FEED_GETTER.feedUpdateTimeout = FEED_GETTER.setTimeout(FEED_GETTER.updateAFeed, interval * 1000);
		}
		
		FEED_GETTER.clearTimeout(FEED_GETTER.feedUpdateTimeout);
		FEED_GETTER.clearTimeout(FEED_GETTER.statusTextTimeout);
		
		var win = FEED_GETTER.window;
		
		if (!win) var online = false;
		else var online = win.navigator.onLine;
		
		if (!online || 
			FEED_GETTER.feedsToFetch.length == 0 ||
			(!FEED_GETTER.rapidUpdate && FEED_GETTER.secondsBetweenFeeds == 0) ||
			(FEED_GETTER.prefs.getBoolPref("runInSidebar") && !FEED_GETTER.sidebarIsOpen())
			){
			if (!indexOverride) {
				FEED_GETTER.clearStatusText();
			
				if (!online) {
					FEED_GETTER.setStatusText(FEED_GETTER.strings.getString("feedbar.workingOffline"));
				}
			
				setTimeoutForNext();
			
				return;
			}
		}
		
		if (FEED_GETTER.rapidUpdate > 0) {
			FEED_GETTER.rapidUpdate--;
			
			if (FEED_GETTER.rapidUpdate <= 0) {
				FEED_GETTER.stopUpdate();
			}
		}
		
		if (FEED_GETTER.feedIndex >= FEED_GETTER.feedsToFetch.length) {
			FEED_GETTER.feedIndex = 0;
		}
		
		var wins = FEED_GETTER.getWindows;
		FEED_GETTER.newItemCountPre = FEEDBAR.numUnreadItems();
		
		var feedIndex = FEED_GETTER.feedIndex;
		
		if (typeof indexOverride != "undefined") {
			feedIndex = indexOverride;
		}
		else {
			++FEED_GETTER.feedIndex;
		}
		
		if (feedIndex == 0) {
			FEED_GETTER.prefs.setCharPref("lastMSUpdate", (new Date().getTime()));
		}
		
		var feed = FEED_GETTER.feedsToFetch[feedIndex];
		
		var url = feed.feed;
		
		FEED_GETTER.setStatusText(FEED_GETTER.strings.getFormattedString("feedbar.statusText", [ (feedIndex+1), FEED_GETTER.feedsToFetch.length, feed.name ]), url, url);
		
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
		                    .createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.parent = FEED_GETTER;
		
		// req.overrideMimeType("application/xml");
		
		FEED_GETTER.currentRequest = req;
		
		try {
			req.open("GET", url, true);
			req.overrideMimeType('text/plain; charset=x-user-defined');
			
			req.onreadystatechange = function (event) {
				if (req.readyState == 4) {
					FEED_GETTER.clearTimeout(FEED_GETTER.loadTimer);
					FEED_GETTER.statusTextTimeout = FEED_GETTER.setTimeout(FEED_GETTER.clearStatusText, 5000);
					
					FEED_GETTER.currentRequest = null;
					setTimeoutForNext();
					
					try {
						if (req.status == 200){
							FEED_GETTER.consecutiveFailures = 0;
							
							var feedOb = null;
							
							try {
								var data = req.responseText;
								
								var encoding_matches = data.match(/<?xml[^>]+encoding=['"]([^"']+)["']/i); // "
								
								if (!encoding_matches) {
									encoding_matches = [null, "UTF-8"];
								}
								
								var converter = Components.classes['@mozilla.org/intl/scriptableunicodeconverter'].getService(Components.interfaces.nsIScriptableUnicodeConverter);
								
								try {
									converter.charset = encoding_matches[1];
									data = converter.ConvertToUnicode(data);
								} catch (e) {
									FEED_GETTER.log(e);
								}
								
								FEED_GETTER.queueForParsing(data.replace(/^\s\s*/, '').replace(/\s\s*$/, ''), url);
							} catch (e) {
								// Parse error
								FEED_GETTER.addError(feed.name, url, e.message, 5);
							}
						}
						else {
							++FEED_GETTER.consecutiveFailures;
							
							if (req.status == 404) {
								FEED_GETTER.addError(feed.name, url, FEED_GETTER.strings.getString("feedbar.errors.404"), 5);
							}
						}
					}
					catch (e) {
						FEED_GETTER.log(e);
						
						++FEED_GETTER.consecutiveFailures;
						
						if (e.name == "NS_ERROR_NOT_AVAILABLE"){
							FEED_GETTER.addError(feed.name, url, FEED_GETTER.strings.getString("feedbar.errors.unavailable"), 3);
						}
					}
				}
			};
			
			req.send(null);
			FEED_GETTER.loadTimer = FEED_GETTER.setTimeout(FEED_GETTER.killCurrentRequest, 1000 * 15);
		}
		catch (e) {
			FEED_GETTER.addError(feed.name, url, e.name, 3);
			setTimeoutForNext();
		}
	},
	
	sidebarPing : function () {
		if (FEED_GETTER.rapidUpdate) {
			var wins = FEED_GETTER.feedWindows;
			
			for (var i = 0; i < wins.length; i++) {
				var win = wins[i];
	
				if (win && win.FEEDSIDEBAR) {
					win.document.getElementById("feedbar-stop-button").setAttribute("disabled","false");
					win.document.getElementById("feedbar-frequency-button").setAttribute("disabled","true");
				}
			}
		}
	},
	
	sidebarPung : function () {
		if (FEED_GETTER.prefs.getBoolPref("runInSidebar")) {
			FEED_GETTER.stopUpdate();
		}
	},
	
	updateAllFeeds : function () {
		FEED_GETTER.rapidUpdate = FEED_GETTER.feedsToFetch.length;
		FEED_GETTER.updateAFeed();
		
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
		
			if (win && win.FEEDSIDEBAR) {
				win.document.getElementById("feedbar-stop-button").setAttribute("disabled","false");
				win.document.getElementById("feedbar-frequency-button").setAttribute("disabled","true");
			}
		}
	},
	
	updateSingleFeed : function (livemarkId) {
		PlacesUtils.livemarks.getLivemark({ id : livemarkId }).then(function (livemark) {
			FEED_GETTER.feedsToFetch.push({ name : livemark.title, feed : livemark.feedURI.spec });
			FEED_GETTER.feedData[livemark.feedURI.spec.toLowerCase()] = { name : livemark.title, bookmarkId : livemark.id, uri : livemark.feedURI.spec };

			FEED_GETTER.updateAFeed(FEED_GETTER.feedsToFetch.length - 1);
		}, function (err) {
			FEED_GETTER.log(err);
		});
	},
	
	stopUpdate : function () {
		// If the interval is set to 1 second right now, reset that.
		FEED_GETTER.rapidUpdate = 0;
		
		FEED_GETTER.killCurrentRequest();
		
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			if (win && win.FEEDSIDEBAR) {
				win.document.getElementById("feedbar-stop-button").setAttribute("disabled","true");
				win.document.getElementById("feedbar-frequency-button").setAttribute("disabled","false");
			}
		}
	},
	
	searchTimeout : null,
	
	queueForParsing : function (feedText, feedURL) {
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
						.getService(Components.interfaces.nsIIOService);

		var data = feedText.replace(/(<\/?)(merch):([^>]*>)/g, "$1$2_$3");
		
		var uri = ioService.newURI(feedURL, null, null);

		if (data.length) {
			var parser = Components.classes["@mozilla.org/feed-processor;1"]
							.createInstance(Components.interfaces.nsIFeedProcessor);
			var listener = new FeedbarParseListener();

			try {
				parser.listener = listener;
				parser.parseFromString(data, uri);
			} catch (e) {
				throw (e);
			}
		}
		else {
			throw({ message : FEED_GETTER.strings.getString("feedbar.noContent") });
		}

		return FEED_GETTER;
	},
	
	setDisplayPeriod : function (days) {
		FEED_GETTER.prefs.setIntPref("displayPeriod", days);
	},
	
	setUpdateFrequency : function (minutes) {
		FEED_GETTER.prefs.setIntPref("updateFrequency",minutes);
	},
	
	setReloadInterval : function (interval) {
		interval = Math.max(0, interval);
		
		FEED_GETTER.clearTimeout(FEED_GETTER.feedUpdateTimeout);
		
		var numFeeds = FEED_GETTER.feedsToFetch.length;
		
		if (numFeeds == 0) {
			// This ensures that secondsBetweenFeeds = 60 so that we'll be checking for
			// a new feed every minute.
			numFeeds = interval;
		}
		
		FEED_GETTER.secondsBetweenFeeds = Math.ceil((interval * 60) / numFeeds);
		
		if (interval == 0) {
			// Auto-update is disabled.
			return;
		}
		
		// Check if it's been more than X minutes since the last full update.
		var lastUpdate = FEED_GETTER.prefs.getCharPref("lastMSUpdate"); 
		var now = new Date().getTime();
		
		var msSince = now - lastUpdate;
		var minutesSince = Math.floor(msSince / 1000 / 60);
		
		if (minutesSince > interval) {
			// The browser or sidebar has been closed longer than a full round of updates takes.
			FEED_GETTER.updateAllFeeds();
		}
		else {
			FEED_GETTER.updateAFeed();
		}
	},
	
	history : {
		isVisitedURL : function(url, guid){
			var db = FEED_GETTER.getDB();
			var visited = false;
			
			try {
				var select = db.createStatement("SELECT id FROM history WHERE id=?1");
				select.bindStringParameter(0, guid);
				
				try {
					while (select.executeStep()) {
						visited = true;
						break;
					}
				} catch (e) {
					FEED_GETTER.log(e);
				} finally {	
					select.reset();
				}
				
				select.finalize();
				
				return visited;
			} catch (e) {
				// Malformed URI, probably
				FEED_GETTER.log(e);
				return false;
			}
		}
	},

	online : function () {
		FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
	},

	offline : function () {
		FEED_GETTER.stopUpdate();
	},
	
	killCurrentRequest : function () {
		try { FEED_GETTER.currentRequest.abort(); } catch (noCurrentRequest) { }
	},
	
	addError : function (feedName, feedUrl, error, priority) {
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			if (win && win.FEEDSIDEBAR) {
				win.FEEDSIDEBAR.addError(feedName, feedUrl, error, priority);
			}
		}
	},
	
	notifyNoFeeds : function () {
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			if (win && win.FEEDSIDEBAR) {
				win.FEEDSIDEBAR.notifyNoFeeds();
			}
		}
	},
	
	noFeedsFoundCallback : function () {
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
		
			if (win && win.FEEDSIDEBAR) {
				win.FEEDSIDEBAR.noFeedsFoundCallback();
			}
		}
	},
	
	clearNotify : function () {
		var wins = FEED_GETTER.feedWindows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			if (win && win.FEEDSIDEBAR) {
				win.FEEDSIDEBAR.clearNotify();
			}
		}
	},
	
	theFile : null,
	theDB : null,
	
	getDB : function () {
		if (!FEED_GETTER.theFile) {
			FEED_GETTER.theFile = Components.classes["@mozilla.org/file/directory_service;1"]
							 .getService(Components.interfaces.nsIProperties)
							 .get("ProfD", Components.interfaces.nsIFile);
			FEED_GETTER.theFile.append("feedbar.sqlite");
		}
		
		if (!FEED_GETTER.theDB) {
			FEED_GETTER.theDB = Components.classes["@mozilla.org/storage/service;1"]
						 .getService(Components.interfaces.mozIStorageService).openDatabase(FEED_GETTER.theFile);
		}
		
		return FEED_GETTER.theDB;
	},
	
	closeDB : function () {
		if (FEED_GETTER.theDB) {
			FEED_GETTER.theDB.close();
			delete FEED_GETTER.theDB;
			FEED_GETTER.theDB = null;
		}
	},
	
	decodeEntities : function (aStr) {
		var	formatConverter = Components.classes["@mozilla.org/widget/htmlformatconverter;1"].createInstance(Components.interfaces.nsIFormatConverter);
		var fromStr = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
		fromStr.data = aStr;
		var toStr = { value: null };

		try {
			formatConverter.convert("text/html", fromStr, fromStr.toString().length, "text/unicode", toStr, {});
		} catch(e) {
			return aStr;
		}

		if(toStr.value) {
			toStr = toStr.value.QueryInterface(Components.interfaces.nsISupportsString);
			return toStr.toString();
		}

		return aStr;
	},

	growl : function (title, text, image) {
		if (FEED_GETTER.prefs.getBoolPref("runInSidebar") && !FEED_GETTER.sidebarIsOpen()) {
			return;
		}
		
		var listener = {
			observe : function (subject, topic, data) {
				// Subject is null
				if (topic == "alertclickcallback") {
					var win = FEED_GETTER.window;
					
					if (win) {
						win.focus();
						
						var sidebar = win.document.getElementById("sidebar-box");
						
						if (!(!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar')){
							win.toggleSidebar('feedbar');
						}
					}
				}
			}
		};
		
		try {
			if (!image) image = "chrome://feedbar/skin/icons/feed-icon-notify-32.png";

			var alertsService = Components.classes["@mozilla.org/alerts-service;1"]
				.getService(Components.interfaces.nsIAlertsService);
			alertsService.showAlertNotification(
				image, 
				title,
				text,
				true, 
				"", 
				listener);
		} catch (notAvailable) { }
	},
	
	log : function (m) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("FEEDBAR: " + m);
	},
	
	/**
	 * @return Promise
	 */
	getLivemarks : function (livemarkIds) {
		var livemarkRequests = [];
		
		livemarkIds.forEach(function (livemarkId) {
			livemarkRequests.push( PlacesUtils.livemarks.getLivemark( { id : livemarkIds.shift() } ) );
		} );
		
		return Promise.all( livemarkRequests );
	},
	
	/* Bookmark Observer Functions */
	onBeforeItemRemoved : function () { },
	onBeginUpdateBatch: function() { },
	onEndUpdateBatch: function() { },
	onItemVisited: function(id, visitID, time) { },
	onItemMoved: function(id, oldParent, oldIndex, newParent, newIndex) { },
	onItemAdded: function(id, folder, index) { /* Handled by onItemChanged */ },

	onItemRemoved: function(id, folder, index) {
		FEED_GETTER.removeAFeed(id);
	},

	onItemChanged: function(id, property, isAnnotationProperty, value) {
		if (property == "livemark/feedURI") {
			FEED_GETTER.removeAFeed(id);
			FEED_GETTER.updateSingleFeed(id);
		}
	},
	
	QueryInterface: function(iid) {
		if (iid.equals(Components.interfaces.nsINavBookmarkObserver) ||
			iid.equals(Components.interfaces.nsISupports)) {
			return this;
		}
		
		throw Cr.NS_ERROR_NO_INTERFACE;
	}
};

function FeedbarParseListener() {
	return this;
}

FeedbarParseListener.prototype = {
	handleResult: function(result) {
		var resolvedUri = result.uri.resolve("");
		var feedDataKey = resolvedUri.toLowerCase();
		
		if (result.bozo) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.parseError"), 5);
			return;
		}
		
		var feed = result.doc;
		
		if (!feed) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.invalidUrl"), 5);
			return;
		}
		
		try {
			feed.QueryInterface(Components.interfaces.nsIFeed);
		} catch (e) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.invalidFeed"), 5);
			return;
		}
		
		var feedObject = {
			label : "",
			image : "",
			description : "",
			uri : "",
			siteUri : "",
			items : [],
			id : "",
			livemarkId : ""
		};
		
		feedObject.id = resolvedUri;
		feedObject.uri = resolvedUri;
		
		feedObject.livemarkId = FEED_GETTER.feedData[feedObject.uri.toLowerCase()].bookmarkId;
		
		try {
			feedObject.siteUri = feed.link.resolve("");
		} catch (e) {
			feedObject.siteUri = feedObject.uri;
		}
		
		try {
			feedObject.label = FEED_GETTER.feedData[feedDataKey].name;
		} catch (e) {
			feedObject.label = feed.title.plainText();
		}
		
		if (!feedObject.label) {
			feedObject.label = feed.title.plainText();
		}
		
		if (feed.summary && feed.summary.text) {
			feedObject.description = feed.summary.text;//plainText();
		}
		else if (feed.content && feed.content.text) {
			feedObject.description = feed.content.text;//plainText();
		}
		else if (feed.subtitle && feed.subtitle.text) {
			feedObject.description = feed.subtitle.text;
		}
		else {
			feedObject.description = FEED_GETTER.strings.getString("feedbar.noSummary");
		}
		
		feedObject.image = feedObject.siteUri.substr(0, (feedObject.siteUri.indexOf("/", 9) + 1)) + "favicon.ico";
		
		var numItems = feed.items.length;
		
		for (var i = 0; i < numItems; i++) {
			var item = feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
			
			var itemObject = {
				uri : "",
				published : "",
				label : "",
				description : "",
				image : "",
				id : "",
				merch : {}
			};
			
			try {
				itemObject.id = item.id;
				
				itemObject.uri = item.link.resolve("");
				
				if (itemObject.uri.match(/\/\/news\.google\.com\/.*\?/)){
					try {
						itemObject.uri = decodeURIComponent(itemObject.uri.match(/url=(https?%3A%2F%2F[^&]+)(&.*)?$/i)[1]);
					} catch (googleChangedTheirURLs) {
						FEED_GETTER.log(":( "+googleChangedTheirURLs);
					}
				}
				
				if (!itemObject.id) itemObject.id = itemObject.uri;
				
				if (!itemObject.uri.match(/\/~r\//i)) {
					if (itemObject.uri.match(/\/\/news\.google\.com\//)){
						// Google news
						try {
							var root = itemObject.uri.match(/url=(https?%3A%2F%2F[a-z0-9\-\.]+%2F)/i)[1];
							itemObject.image = decodeURIComponent(root) + "favicon.ico";
						} catch (e) {
							itemObject.image = itemObject.uri.substr(0, (itemObject.uri.indexOf("/", 9) + 1)) + "favicon.ico";
						}
					}
					else {
						itemObject.image = itemObject.uri.substr(0, (itemObject.uri.indexOf("/", 9) + 1)) + "favicon.ico";
					}
				}
				else {
					// Feedburner
					itemObject.image = feedObject.siteUri.substr(0, (feedObject.siteUri.indexOf("/", 9) + 1)) + "favicon.ico";
				}
				
				if ("trackingUri" in item) {
					itemObject.image = item.trackingUri;
				}
			
				itemObject.published = Date.parse(item.updated);
				
				if (!itemObject.published) {
					itemObject.published = new Date();
				}
				
				
				if (item.title) {
					itemObject.label = FEED_GETTER.decodeEntities(item.title.plainText());
				}
				else {
					itemObject.label = item.updated;
				}
				
				itemObject.label = itemObject.label.replace(/\s+/, " ");
				
				if (item.summary && item.summary.text) {
					itemObject.description = item.summary.text;
				}
				else if (item.content && item.content.text) {
					itemObject.description = item.content.text;
				}
				else {
					itemObject.description = FEED_GETTER.strings.getString("feedbar.noSummary");
				}
				
				if (item.enclosures && item.enclosures.length > 0) {
					var len = item.enclosures.length;
					var imgs = "";
					
					for (var j = 0; j < len; j++) {
						var enc = item.enclosures.queryElementAt(j, Components.interfaces.nsIWritablePropertyBag2);
						
						if (enc.hasKey("type") && enc.get("type").indexOf("image") != 0) {
							imgs += '<br /><a href="' + enc.get("url") + '">'+FEED_GETTER.strings.getString("feedbar.download")+'</a>';
						}
						else if (enc.hasKey("url")) {
							imgs += '<br /><img src="' + enc.get("url") + '" />';
						}
					}
					
					itemObject.description = itemObject.description + imgs;
					
					delete len;
					delete imgs;
				}
				
				itemObject.description = itemObject.description.replace(/<script[^>]*>[\s\S]+<\/script>/gim, "");
				
				itemObject.visited = FEED_GETTER.history.isVisitedURL(itemObject.uri, itemObject.id);
				
				feedObject.items.push(itemObject);
			} catch (e) {
				// FEED_GETTER.addError(FEED_GETTER.feedData[feedObject.link].name, feedObject.link, e, 5);
				// Don't show a notification here, since they can become legion.
				FEED_GETTER.log(e);
			}
			
			delete item;
			delete itemObject;
		}
		
		FEEDBAR.push(feedObject);
		
		var unread = FEEDBAR.numUnreadItems();
		
		if (unread > FEED_GETTER.newItemCountPre) {
			if (FEED_GETTER.prefs.getBoolPref("notify")) {
				var newItems = unread - FEED_GETTER.newItemCountPre;
				
				if (newItems == 1) {
					var titleString = feedObject.label;
					var bodyString = feedObject.items[0].label;
//					var bodyString = FEED_GETTER.strings.getString("feedbar.newItemBody");
				}
				else {
					var titleString = feedObject.label;
					var bodyString = FEED_GETTER.strings.getFormattedString("feedbar.newItemsBody", [ newItems ]);
				}
					
				FEED_GETTER.growl(titleString, bodyString, feedObject.image);
			}
		}
	
		delete unread;
		delete feedObject;
		delete resolvedUri;
		delete feedDataKey;
		delete feed;
		delete numItems;
		delete result;
		
		return;
	}
};

var EXPORTED_SYMBOLS = ["FEED_GETTER"];