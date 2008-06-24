var FEED_GETTER = {
	get progressText() { return document.getElementById("feedbar-loading-text"); },
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get nextUpdateDisplay() { return document.getElementById("feedbar-nextupdate-text"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	get displayPeriod() { return FEED_GETTER.prefs.getIntPref("displayPeriod"); },
	get feedWindow() { 
		try {
			var sidebar = document.getElementById("sidebar-box");
			
			if (!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar'){
				return document.getElementById("sidebar").contentWindow;
			}
			
			return null;
		} catch (e) {
			logFeedbarMsg("ERROR IN get feedWindow: " + e);
		}
	},
	
	prefs : null,
	
	feedsToLoad : 0,
	feedsLoaded : 0,
	
	updateTimer : null,
	loadTimer : null,
	req : null,
	
	feeds : [],
	
	feedData : { },
	textarea : null,
	
	currentRequest : null,
	
	get lastUpdate() { 
		// Stored as the number of seconds since the epoch
		// Should reveal this value as a JavaScript Date object
		
		var secondsBetween, timestamp = 0;
		var updateObj = new Date();
		
		try {
			timestamp = FEED_GETTER.prefs.getIntPref("lastUpdate");
		} catch (e) {
			secondsBetween = FEED_GETTER.prefs.getIntPref("updateFrequency") * 60;
			timestamp = Math.round(updateObj.getTime() / 1000);
			timestamp -= secondsBetween;
		}
		
		updateObj.setTime(timestamp * 1000);
		
		return updateObj;
	},
	
	set lastUpdate(dateOb) {
		var timestamp = Math.round(dateOb.getTime() / 1000);
		FEED_GETTER.prefs.setIntPref("lastUpdate", timestamp);
	},
	
	get nextUpdate() { 
		var lastUpdate = FEED_GETTER.lastUpdate;
		var milliBetween = FEED_GETTER.prefs.getIntPref("updateFrequency") * 60 * 1000;
		var lastMilli = lastUpdate.getTime();
		var nextUpdate = new Date();
		nextUpdate.setTime(lastUpdate.getTime() + milliBetween);
		
		return nextUpdate;
	},
	
	init : function () {
		FEED_GETTER.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		FEED_GETTER.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		FEED_GETTER.prefs.addObserver("", FEED_GETTER, false);
		
		FEED_GETTER.ta = document.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
		
		FEED_GETTER.updateLoadProgress(0,0);
		setTimeout(FEED_GETTER.updateFeeds, 2500);
	},
	
	unload : function () {
		try { FEED_GETTER.currentRequest.abort(); } catch (noNeed) { }
		FEED_GETTER.prefs.removeObserver("", FEED_GETTER);
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "updateFrequency":
				if (FEED_GETTER.prefs.getIntPref("updateFrequency") < 1) {
					FEED_GETTER.prefs.setIntPref("updateFrequency", 1);
				}
				else {
					FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
				}
			break;
			case "24HourTime":
				FEED_GETTER.updateLoadProgress(0,0);
			break;
		}
	},
	
	sidebarPing : function () {
		if (FEED_GETTER.feeds.length > 0) {
			FEED_GETTER.updateLoadProgress(FEED_GETTER.feedsToLoad - FEED_GETTER.feeds.length, FEED_GETTER.feedsToLoad);
		}
		else {
			FEED_GETTER.updateLoadProgress(0,0);
		}
	},
	
	updateFeeds : function () {
		if (FEED_GETTER.updateTimer) {
			window.clearTimeout(FEED_GETTER.updateTimer);
		}
		
		FEED_GETTER.findFeeds();
		FEED_GETTER.loadFeeds();
		FEED_GETTER.updateTimer = setTimeout(FEED_GETTER.updateFeeds, FEED_GETTER.prefs.getIntPref("updateFrequency") * 60 * 1000);
	},
	
	stopUpdate : function () {
		FEED_GETTER.feeds.length = 0;
		FEED_GETTER.loadNextFeed();
	},
	
	searchTimeout : null,
	
	findFeeds : function () {
		FEED_GETTER.feedData.length = 0;
		
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"];
		
		if (livemarkService) {
			// Firefox 3+
			livemarkService = livemarkService.getService(Components.interfaces.nsILivemarkService);
			var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			var anno = Components.classes["@mozilla.org/browser/annotation-service;1"].getService(Components.interfaces.nsIAnnotationService);
			var livemarkIds = anno.getItemsWithAnnotation("livemark/feedURI", {});
			
			for (var i = 0; i < livemarkIds.length; i++){
				var feedURL = livemarkService.getFeedURI(livemarkIds[i]).spec;
				var feedName = bookmarkService.getItemTitle(livemarkIds[i]);
				FEED_GETTER.feeds.push({ name : feedName, feed : feedURL });
				FEED_GETTER.feedData[feedURL.toLowerCase()] = { name : feedName, bookmarkId : livemarkIds[i], uri : feedURL };
			}
		}
		else {
			// Firefox 2-
			if (!RDF) initServices();
			if (!BMSVC) initBMService();
		
			var root = RDF.GetResource("NC:BookmarksRoot");
			var feedURLArc = RDF.GetResource("http://home.netscape.com/NC-rdf#FeedURL");
			var nameArc = RDF.GetResource("http://home.netscape.com/NC-rdf#Name");
		
			var folders = [ root ];
		
			FEED_GETTER.feeds.length = 0;
		
			while (folders.length > 0){
				RDFC.Init(BMDS, folders.shift());
		
				var elements = RDFC.GetElements();
		
				while(elements.hasMoreElements()) {
					var element = elements.getNext();
					element.QueryInterface(Components.interfaces.nsIRDFResource);
		
					var type = BookmarksUtils.resolveType(element);
				
					if ((type == "Folder") || (type == "PersonalToolbarFolder")){
						folders.push(element);
					}
					else if (type == 'Livemark') {
						var res = RDF.GetResource(element.Value);
						var target = BMDS.GetTarget(res, feedURLArc, true);
					
						if (target) {
							var feedURL = target.QueryInterface(kRDFLITIID).Value;
												
							var target = BMDS.GetTarget(res, nameArc, true);
						
							if (target) {
								var feedName = target.QueryInterface(kRDFLITIID).Value;
							}
							else {
								var feedName = feedURL;
							}
						
							FEED_GETTER.feeds.push({ name : feedName, feed : feedURL });
							FEED_GETTER.feedData[feedURL.toLowerCase()] = { name : feedName, bookmarkId : -1, uri : feedURL };
						}
					}
				}
			}
		}
		
		FEED_GETTER.feedsToLoad = FEED_GETTER.feeds.length;
		FEED_GETTER.feedsLoaded = 0;
	},
	
	loadFeeds : function () {
		FEED_GETTER.lastUpdate = new Date();
		
		FEED_GETTER.clearNotify();
		
		if (FEED_GETTER.feedsToLoad == 0){
			FEED_GETTER.notifyNoFeeds();
		}
		
		FEED_GETTER.updateLoadProgress(0, FEED_GETTER.feedsToLoad);
		FEED_GETTER.loadNextFeed();
	},
	
	loadNextFeed : function () {
//		setTimeout(FEED_GETTER.doLoadNextFeed, 300);
		FEED_GETTER.doLoadNextFeed();
	},
	
	doLoadNextFeed : function () {
		var feed = FEED_GETTER.feeds.shift();
		
		if (feed){
			var url = feed.feed;
			
			var win = FEED_GETTER.feedWindow;
			
			if (win && win.FEEDSIDEBAR) {
				try { win.FEEDSIDEBAR.progressText.setAttribute("tooltiptext",url); } catch (sidebarClosed) { }
			}
			
			var req = new XMLHttpRequest();
			FEED_GETTER.currentRequest = req;
			
			try {
				req.open("GET", url, true);
				
				req.onreadystatechange = function (event) {
					if (req.readyState == 4) {
						clearTimeout(FEED_GETTER.loadTimer);
						
						try {
							if (req.status == 200){
								var feedOb = null;
								
								try {
									// Trim it.
									FEED_GETTER.queueForParsing(req.responseText.replace(/^\s\s*/, '').replace(/\s\s*$/, ''), url);
								} catch (e) {
									// Parse error
									FEED_GETTER.addError(feed.name, url, e.message, 5);
								}
							}
						}
						catch (e) {
							if (e.name == "NS_ERROR_NOT_AVAILABLE"){
								FEED_GETTER.addError(feed.name, url, FEED_GETTER.strings.getString("feedbar.errors.unavailable"), 3);
							}
						}
						
						FEED_GETTER.updateLoadProgress(++FEED_GETTER.feedsLoaded, FEED_GETTER.feedsToLoad);
						FEED_GETTER.loadNextFeed();
					}
				};
				
				req.send(null);
				FEED_GETTER.loadTimer = setTimeout(FEED_GETTER.killCurrentRequest, 1000 * 15);
			}
			catch (e) {
				FEED_GETTER.addError(feed.name, url, e.name, 3);
				FEED_GETTER.updateLoadProgress(++FEED_GETTER.feedsLoaded, FEED_GETTER.feedsToLoad);
				FEED_GETTER.loadNextFeed();
			}
		}
		else {
			FEED_GETTER.updateLoadProgress(0, 0);
		}
	},
	
	queueForParsing : function (feedText, feedURL) {
		var ioService = Components.classes["@mozilla.org/network/io-service;1"]
						.getService(Components.interfaces.nsIIOService);

		var data = feedText;
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
			throw({ message : "Feed has no content." });
		}

		return this;
	},
	
	setDisplayPeriod : function (days) {
		FEED_GETTER.prefs.setIntPref("displayPeriod", days);
	},
	
	setUpdateFrequency : function (minutes) {
		FEED_GETTER.prefs.setIntPref("updateFrequency",minutes);
	},
	
	setReloadInterval : function (minutes) {
		var lastUpdate = FEED_GETTER.lastUpdate;
		
		clearTimeout(FEED_GETTER.updateTimer);
		
		var newMSBetween = minutes * 60 * 1000;
		
		var newNextUpdateTime = new Date();
		newNextUpdateTime.setTime(lastUpdate.getTime() + newMSBetween);
		
		var now = new Date();
		
		if (newNextUpdateTime.getTime() <= now.getTime()) {
			FEED_GETTER.updateFeeds();
		}
		else {
			var msUntil = newNextUpdateTime.getTime() - now.getTime();
			FEED_GETTER.nextUpdate = newNextUpdateTime;
			FEED_GETTER.updateLoadProgress(0, 0);
			FEED_GETTER.updateTimer = setTimeout(FEED_GETTER.updateFeeds, msUntil);
		}
	},
	
	history : {
		hService : Components.classes["@mozilla.org/browser/global-history;2"].getService(Components.interfaces.nsIGlobalHistory2),
		ioService : Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService),
		
		URI : null,
		
		isVisitedURL : function(url, guid){
			try {
				FEED_GETTER.history.URI = this.ioService.newURI(url, null, null);
				var visited = FEED_GETTER.history.hService.isVisited(FEED_GETTER.history.URI);
				
				if (!visited) {
					var db = FEED_GETTER.getDB();

					var select = db.createStatement("SELECT id FROM history WHERE id=?1");
					select.bindStringParameter(0, guid);

					try {
						while (select.executeStep()) {
							visited = true;
							break;
						}
					} catch (e) {
						logFeedbarMsg(e);
					} finally {	
						select.reset();
					}
					
					try { db.close(); } catch (e) {}					
				}
				else {
					// Add to DB
					var db = FEED_GETTER.getDB();

					var insert = db.createStatement("INSERT INTO history (id, date) VALUES (?1, ?2)");
					insert.bindUTF8StringParameter(0, guid);
					insert.bindInt64Parameter(1, (new Date().getTime()));
					
					try { insert.execute(); } catch (alreadyExists) { }

					try { db.close(); } catch (e) { }
				}
				
				return visited;
			} catch (e) {
				// Malformed URI, probably
				logFeedbarMsg(e);
				return false;
			}
		}
	},

	updateLoadProgress : function (done, total) {
		var win = FEED_GETTER.feedWindow; 
		
		if (win && win.FEEDSIDEBAR) {
			var nextUpdateTime = FEED_GETTER.nextUpdate;
			win.FEEDSIDEBAR.updateLoadProgress(done, total, nextUpdateTime);
		}
	},
	
	killCurrentRequest : function () {
		FEED_GETTER.currentRequest.abort();
	},
	
	addError : function (feedName, feedUrl, error, priority) {
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.FEEDSIDEBAR.addError(feedName, feedUrl, error, priority);
		}
	},
	
	notifyNoFeeds : function () {
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.FEEDSIDEBAR.notifyNoFeeds();
		}
	},
	
	noFeedsFoundCallback : function () {
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.FEEDSIDEBAR.noFeedsFoundCallback();
		}
	},
	
	clearNotify : function () {
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.FEEDSIDEBAR.clearNotify();
		}
	},
	
	getDB : function () {
		var file = Components.classes["@mozilla.org/file/directory_service;1"]
		                     .getService(Components.interfaces.nsIProperties)
		                     .get("ProfD", Components.interfaces.nsIFile);
		file.append("feedbar.sqlite");

		var storageService = Components.classes["@mozilla.org/storage/service;1"]
		                        .getService(Components.interfaces.mozIStorageService);
		var mDBConn = storageService.openDatabase(file);
		
		return mDBConn;
	},
	
	decodeEntities : function (str) {
		str = str.replace(/&([^\s;]*)\s/g, "&amp;$1 ");
		str = str.replace(/&\s/g, "&amp; ");
		
		try {
			FEED_GETTER.ta.innerHTML = str.replace(/</g,"&lt;").replace(/>/g,"&gt;");
		} catch (e) {
			return str;
		}
		
		return FEED_GETTER.ta.value;
	}
};

function FeedbarParseListener() {
	return this;
}

FeedbarParseListener.prototype = {
	handleResult: function(result) {
		if (result.bozo) {
			// Get feed name
			FEED_GETTER.addError(FEED_GETTER.feedData[result.uri.resolve("").toLowerCase()].name, result.uri.resolve(""), FEED_GETTER.strings.getString("feedbar.errors.parseError"), 5);
			return;
		}
		
		var feed = result.doc;
		
		if (!feed) {
			FEED_GETTER.addError(FEED_GETTER.feedData[result.uri.resolve("").toLowerCase()].name, result.uri.resolve(""), FEED_GETTER.strings.getString("feedbar.errors.invalidUrl"), 5);
			return;
		}
		
		try {
			feed.QueryInterface(Components.interfaces.nsIFeed);
		} catch (e) {
			FEED_GETTER.addError(FEED_GETTER.feedData[result.uri.resolve("").toLowerCase()].name, result.uri.resolve(""), FEED_GETTER.strings.getString("feedbar.errors.invalidFeed"), 5);
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
		
		feedObject.id = result.uri.resolve("");
		feedObject.uri = result.uri.resolve("");
		
		feedObject.livemarkId = FEED_GETTER.feedData[feedObject.uri.toLowerCase()].bookmarkId;
		
		try {
			feedObject.siteUri = feed.link.resolve("");
		} catch (e) {
			feedObject.siteUri = feedObject.uri;
		}
		
		feedObject.label = feed.title.plainText();
		
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
				id : ""
			};
			
			try {
				itemObject.id = item.id;
				
				itemObject.uri = item.link.resolve("");
				
				if (itemObject.uri.match(/\/\/news\.google\.com\/.*\?/)){
					var q = itemObject.link.indexOf("?");
					itemObject.uri = itemObject.uri.substring(0, q) + ("&" + itemObject.uri.substring(q)).replace(/&(ct|cid|ei)=[^&]*/g, "").substring(1);
				}
				
				if (!itemObject.id) itemObject.id = itemObject.uri;
				
				if (!itemObject.uri.match(/\/~r\//i)) {
					if (itemObject.uri.match(/\/\/news\.google\.com\//)){
						// Google news
						var root = itemObject.uri.match(/url=(https?:\/\/[^\/]+\/)/i)[1];
						itemObject.favicon = root + "favicon.ico";
					}
					else {
						itemObject.image = itemObject.uri.substr(0, (itemObject.uri.indexOf("/", 9) + 1)) + "favicon.ico";
					}
				}
				else {
					// Feedburner
					itemObject.image = feedObject.siteUri.substr(0, (feedObject.siteUri.indexOf("/", 9) + 1)) + "favicon.ico";
				}
			
				itemObject.published = Date.parse(item.updated);
				itemObject.label = FEED_GETTER.decodeEntities(item.title.plainText().replace(/<[^>]+>/g, ""));
				
				if (item.summary && item.summary.text) {
					itemObject.description = item.summary.text;
				}
				else if (item.content && item.content.text) {
					itemObject.description = item.content.text;
				}
				else {
					itemObject.description = FEED_GETTER.strings.getString("feedbar.noSummary");
				}
				
				itemObject.visited = FEED_GETTER.history.isVisitedURL(itemObject.uri, itemObject.id);
				
				feedObject.items.push(itemObject);
				
			} catch (e) {
				// FEED_GETTER.addError(FEED_GETTER.feedData[feedObject.link].name, feedObject.link, e, 5);
				// Don't show a notification here, since they can become legion.
				logFeedbarMsg(e);
			}
		}
		
		FEEDBAR.push(feedObject);
		
		return;
	}
};

function logFeedbarMsg(m) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("FEEDBAR: " + m);
}