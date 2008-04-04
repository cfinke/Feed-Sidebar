var FEEDSIDEBAR = {
	get progressText() { return document.getElementById("feedbar-loading-text"); },
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get nextUpdateDisplay() { return document.getElementById("feedbar-nextupdate-text"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	get displayPeriod() { return this.prefs.getIntPref("displayPeriod"); },
	
	prefs : null,
	
	feedsToLoad : 0,
	feedsLoaded : 0,
	
	updateTimer : null,
	loadTimer : null,
	req : null,
	
	feeds : [],
	
	feedData : { },
	textarea : null,
	
	get lastUpdate() { 
		// Stored as the number of seconds since the epoch
		// Should reveal this value as a JavaScript Date object
		
		var secondsBetween, timestamp = 0;
		var updateObj = new Date();
		
		try {
			timestamp = this.prefs.getIntPref("lastUpdate");
		} catch (e) {
			secondsBetween = this.prefs.getIntPref("updateFrequency") * 60;
			timestamp = Math.round(updateObj.getTime() / 1000);
			timestamp -= secondsBetween;
		}
		
		updateObj.setTime(timestamp * 1000);
		
		return updateObj;
	},
	
	set lastUpdate(dateOb) {
		var timestamp = Math.round(dateOb.getTime() / 1000);
		this.prefs.setIntPref("lastUpdate", timestamp);
	},
	
	get nextUpdate() { 
		var lastUpdate = this.lastUpdate;
		var milliBetween = this.prefs.getIntPref("updateFrequency") * 60 * 1000;
		var lastMilli = lastUpdate.getTime();
		var nextUpdate = new Date();
		nextUpdate.setTime(lastUpdate.getTime() + milliBetween);
		
		return nextUpdate;
	},
	
	init : function () {
		this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.prefs.addObserver("", this, false);
		
		this.ta = document.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
		
		document.getElementById("feed_tree").view = window.parent.FEEDBAR;
		
		this.updateLoadProgress(0,0);
		this.checkFrequencyItem(this.prefs.getIntPref("updateFrequency"));
		this.checkPeriodItem(this.prefs.getIntPref("displayPeriod"));	
		
		// The sidebar has been opened and closed at least once.
		var lastMilli = this.lastUpdate.getTime();
		var currentMilli = new Date().getTime();
		var milliBetween = this.prefs.getIntPref("updateFrequency") * 60 * 1000;
		
		document.getElementById("search-box").value = this.prefs.getCharPref("filter");
		
		if ((lastMilli + milliBetween) < currentMilli){
			// Only do an update if enough time has elapsed since the sidebar was closed
			this.updateFeeds();
		}
		else {
			// Set an update for when it would have happened had the sidebar stayed open.
			this.updateTimer = setTimeout("FEEDSIDEBAR.updateFeeds();", (lastMilli + milliBetween) -  currentMilli);
		}
		
		// this.previewPane.style.visibility = 'hidden';
	},
	
	unload : function () {
		try { this.req.abort(); } catch (noNeed) { }
		this.prefs.removeObserver("", this);
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "updateFrequency":
				if (this.prefs.getIntPref("updateFrequency") < 1) {
					this.prefs.setIntPref("updateFrequency", 1);
				}
				else {
					this.setReloadInterval(this.prefs.getIntPref("updateFrequency"));
				}
			break;
			case "24HourTime":
				this.updateLoadProgress(0,0);
			break;
		}
	},
	
	updateFeeds : function () {
		if (this.updateTimer) window.clearTimeout(this.updateTimer);
		
		this.findFeeds();
		this.loadFeeds();
		
		this.updateTimer = setTimeout("FEEDSIDEBAR.updateFeeds();", this.prefs.getIntPref("updateFrequency") * 60 * 1000);
	},
	
	stopUpdate : function () {
		this.feeds.length = 0;
		this.loadNextFeed();
	},
	
	searchTimeout : null,
	
	onSearchInput : function (value) {
		if (this.searchTimeout) clearTimeout(this.searchTimeout);
		
		this.searchTimeout = setTimeout(FEEDSIDEBAR.filter, 500, value);
	},
	
	filter : function (value) {
		FEEDSIDEBAR.prefs.setCharPref("filter", value);
	},
	
	findFeeds : function () {
		this.feedData.length = 0;
		
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
				this.feeds.push({ name : feedName, feed : feedURL });
				this.feedData[feedURL] = { name : feedName, bookmarkId : livemarkIds[i] };
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
		
			this.feeds.length = 0;
		
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
						
							this.feeds.push({ name : feedName, feed : feedURL });
							this.feedData[feedURL] = { name : feedName, bookmarkId : -1 };
						}
					}
				}
			}
		}
		
		this.feedsToLoad = this.feeds.length;
		this.feedsLoaded = 0;
	},
	
	loadFeeds : function () {
		this.lastUpdate = new Date();
		
		this.clearNotify();
		
		if (this.feedsToLoad == 0){
			this.notifyNoFeeds();
		}
		
		this.updateLoadProgress(0, this.feedsToLoad);
		this.loadNextFeed();
	},
	
	loadNextFeed : function () {
		var feed = this.feeds.shift();
		
		if (feed){
			var url = feed.feed;
			this.progressText.setAttribute("tooltiptext",url);
			
			if (!this.req) {
				this.req = new XMLHttpRequest();
			}
			
			try {
				this.req.open("GET", url, true);
				this.req.overrideMimeType("text/plain");
				
				FEEDSIDEBAR.req.onreadystatechange = function (event) {
					if (FEEDSIDEBAR.req.readyState == 4) {
						clearTimeout(FEEDSIDEBAR.loadTimer);
						
						try {
							if (FEEDSIDEBAR.req.status == 200){
								var feedOb = null;
								
								try {
									// Trim it.
									FEEDSIDEBAR.queueForParsing(FEEDSIDEBAR.req.responseText.replace(/^\s\s*/, '').replace(/\s\s*$/, ''), url);
								} catch (e) {
									// Parse error
									FEEDSIDEBAR.addError(feed.name, url, e.message, 5);
								}
							}
						}
						catch (e) {
							if (e.name == "NS_ERROR_NOT_AVAILABLE"){
								FEEDSIDEBAR.addError(feed.name, url, FEEDSIDEBAR.strings.getString("feedbar.errors.unavailable"), 3);
							}
						}
						
						FEEDSIDEBAR.updateLoadProgress(++FEEDSIDEBAR.feedsLoaded, FEEDSIDEBAR.feedsToLoad);
						FEEDSIDEBAR.loadNextFeed();
					}
				};
				
				this.req.send(null);
				this.loadTimer = setTimeout('FEEDSIDEBAR.killCurrentRequest();', 1000 * 15);
			}
			catch (e) {
				this.addError(feed.name, url, e.name, 3);
				this.updateLoadProgress(++this.feedsLoaded, this.feedsToLoad);
				this.loadNextFeed();
			}
		}
		else {
			this.updateLoadProgress(0, 0);
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
		this.prefs.setIntPref("displayPeriod", days);
	},
	
	setUpdateFrequency : function (minutes) {
		this.prefs.setIntPref("updateFrequency",minutes);
	},
	
	setReloadInterval : function (minutes) {
		var lastUpdate = this.lastUpdate;
		
		clearTimeout(this.updateTimer);
		
		var newMSBetween = minutes * 60 * 1000;
		
		var newNextUpdateTime = new Date();
		newNextUpdateTime.setTime(lastUpdate.getTime() + newMSBetween);
		
		var now = new Date();
		
		if (newNextUpdateTime.getTime() <= now.getTime()) {
			this.updateFeeds();
		}
		else {
			var msUntil = newNextUpdateTime.getTime() - now.getTime();
			this.updateLoadProgress(0,0);
			this.updateTimer = setTimeout("FEEDSIDEBAR.updateFeeds();", msUntil);
		}
	},
	
	checkFrequencyItem : function (minutes) {
		var frequencyMenu = document.getElementById('frequency-menu');
		var frequencies = frequencyMenu.getElementsByTagName("menuitem");
		
		for (var i = 0; i < frequencies.length; i++){
			if (frequencies[i].getAttribute("value") == minutes){
				frequencies[i].setAttribute("checked","true");
			}
			else {
				frequencies[i].setAttribute("checked","false");
			}
		}
	},
	
	checkPeriodItem : function (days) {
		var periodMenu = document.getElementById('period-menu');
		var periods = periodMenu.getElementsByTagName("menuitem");
		
		for (var i = 0; i < periods.length; i++){
			if (periods[i].getAttribute("value") == days){
				periods[i].setAttribute("checked","true");
			}
			else {
				periods[i].setAttribute("checked","false");
			}
		}
	},
	
	history : {
		hService : Components.classes["@mozilla.org/browser/global-history;2"].getService(Components.interfaces.nsIGlobalHistory2),
		ioService : Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService),
		
		URI : null,
		
		isVisitedURL : function(url, guid){
			try {
				this.URI = this.ioService.newURI(url, null, null);
				var visited = this.hService.isVisited(this.URI);
				
				if (!visited) {
					var db = FEEDSIDEBAR.getDB();

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
					var db = FEEDSIDEBAR.getDB();

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
		if (done == total) {
			var use24HourTime = this.prefs.getBoolPref("24HourTime");
			
			var nextUpdateTime = this.nextUpdate;
			
			var timeText = '';
			timeText += ((nextUpdateTime.getHours() > 12 && !use24HourTime) ? nextUpdateTime.getHours() - 12 : nextUpdateTime.getHours());
			
			if (use24HourTime && parseInt(timeText) < 10) {
				timeText = "0" + timeText;
			}
			
			if (timeText == "0") timeText = "12";
			timeText += ":";
			
			if (nextUpdateTime.getMinutes() < 10) timeText += "0";
			timeText += nextUpdateTime.getMinutes();
			timeText += " ";
			
			if (!use24HourTime) timeText += (nextUpdateTime.getHours() > 11) ? this.strings.getString("feedbar.time.pm") : this.strings.getString("feedbar.time.am");
			
			document.getElementById("reload-button").setAttribute("disabled","false");
			document.getElementById("stop-button").setAttribute("disabled","true");
			this.progressText.setAttribute("value", this.strings.getFormattedString("feedbar.nextUpdate", [timeText]) );
		}
		else {
			document.getElementById("reload-button").setAttribute("disabled","true");
			document.getElementById("stop-button").setAttribute("disabled","false");
			this.progressText.setAttribute("value", this.strings.getFormattedString("feedbar.checkingFeeds", [done, total]));
		}
	},
	
	options : function () {
		openDialog("chrome://feedbar/content/options.xul", "", "chrome,titlebar,toolbar,centerscreen");
	},
	
	contextMenu : {
		customize : function (menu) {
			var options = menu.getElementsByTagName("menuitem");
			
			var itemIdx = window.parent.FEEDBAR.getSelectedIndex();
			
			if (itemIdx >= 0) {
				if (!window.parent.FEEDBAR.isContainer(itemIdx)) {
					// Single item menu
					for (var i = 0; i < options.length; i++){
						switch (options[i].getAttribute("option")) {
							case 'open':
							case 'openInWindow':
							case 'openInTab':
							case 'openAllInTabs':
							case 'markAllAsRead':
							case 'options':
								options[i].setAttribute("hidden", "false");
							break;
							case 'openFeedInTabs':
							case 'markFeedAsRead':
							case 'markFeedAsUnread':
							case 'unsubscribe':
								options[i].setAttribute("hidden", "true");
							break;
							case 'markAsRead':
								options[i].setAttribute("hidden", window.parent.FEEDBAR.getCellRead(itemIdx));//item.visited.toString());
							break;
							case 'markAsUnread':
								options[i].setAttribute("hidden", FEEDSIDEBAR.prefs.getBoolPref("hideReadItems") || !window.parent.FEEDBAR.getCellRead(itemIdx));
							break;
							case 'openUnreadInTabs':
							case 'openFeedUnreadInTabs':
								options[i].setAttribute("hidden", (!FEEDSIDEBAR.prefs.getBoolPref("hideReadItems")).toString());
							break;
						}
					}	
				}
				else {
					// Feed menu
					for (var i = 0; i < options.length; i++){
						switch (options[i].getAttribute("option")) {
							case 'open':
							case 'openInWindow':
							case 'openInTab':
							case 'markAsRead':
							case 'markAsUnread':
								options[i].setAttribute("hidden", "true");
							break;
							case 'openAllInTabs':
							case 'markAllAsRead':
							case 'openFeedInTabs':
							case 'markFeedAsRead':
							case 'unsubscribe':
							case 'options':
								options[i].setAttribute("hidden", "false");
							break;
							case 'openUnreadInTabs':
							case 'openFeedUnreadInTabs':
							case 'markFeedAsUnread':
								options[i].setAttribute("hidden", (!FEEDSIDEBAR.prefs.getBoolPref("hideReadItems")).toString());
							break;
						}
					}	
				}
			}
			else {
				// Default menu
				for (var i = 0; i < options.length; i++){
					switch (options[i].getAttribute("option")) {
						case 'open':
						case 'openInWindow':
						case 'openInTab':
						case 'markAsRead':
						case 'markAsUnread':
						case 'openFeedInTabs':
						case 'markFeedAsRead':
						case 'openFeedUnreadInTabs':
						case 'markFeedAsUnread':
						case 'unsubscribe':
							options[i].setAttribute("hidden", "true");
						break;
						case 'openAllInTabs':
						case 'markAllAsRead':
						case 'options':
						case 'openUnreadInTabs':
							options[i].setAttribute("hidden", "false");
						break;
					}
				}	
			}
			
			var foundOne = false;
			var lastShown = null;
			
			for (var i = 0; i < menu.childNodes.length; i++){
				if ((menu.childNodes[i].localName == "menuitem") && (menu.childNodes[i].getAttribute("hidden") == "false")){
					lastShown = menu.childNodes[i];
					foundOne = true;
				}
				else if (menu.childNodes[i].localName == "menuseparator"){
					if (foundOne) {
						menu.childNodes[i].setAttribute("hidden","false");
						lastShown = menu.childNodes[i];
						foundOne = false;
					}
					else {
						menu.childNodes[i].setAttribute("hidden","true");
					}
				}
			}
			
			if (lastShown.localName == "menuseparator") {
				lastShown.setAttribute("hidden", "true");
			}
			
			return true;
		}
	},
	
	itemSelect : function (event) {
		var idx = window.parent.FEEDBAR.getSelectedIndex();
		this.showPreview(idx);
	},
	
	killCurrentRequest : function () {
		this.req.abort();
	},
	
	showPreview : function (idx) {
		var tt = this.previewPane;
		
		if ((idx < 0)) {
			tt.style.visibility = 'hidden';
		}
		else {
			var maxLength = 60;
			var descr = window.parent.FEEDBAR.getCellDescription(idx);
			document.getElementById("content-frame").contentDocument.body.innerHTML = descr;
			
			if (window.parent.FEEDBAR.isContainer(idx)){
				var title = window.parent.FEEDBAR.getCellLink(idx).replace(/^\s+|\s+$/g, "");
				var feedName = window.parent.FEEDBAR.getCellText(idx).replace(/^\s+|\s+$/g, "");
				
				var url = window.parent.FEEDBAR.getCellFeedLink(idx);
				
				document.getElementById("feedbarTooltipURL").url = url;
				if (url.length > maxLength){
					url = url.substring(0,maxLength) + "...";
				}
				document.getElementById("feedbarTooltipURL").value = "Feed: " + url;
				
				document.getElementById("feedbarTooltipName").url = title;
				
				if (title.length > maxLength){
					title = title.substring(0,maxLength) + "...";
				}
				if (title == '') title = ' ';

				document.getElementById("feedbarTooltipName").value = "Site: " + title;
			}
			else {
				var feedIdx = window.parent.FEEDBAR.getParentIndex(idx);
				var feedName = window.parent.FEEDBAR.getCellText(feedIdx).replace(/^\s+|\s+$/g, "");
				var url = window.parent.FEEDBAR.getCellLink(idx);
				document.getElementById("feedbarTooltipURL").url = url;
				document.getElementById("feedbarTooltipName").url = url;
				if (url.length > maxLength){
					url = url.substring(0,maxLength) + "...";
				}
				document.getElementById("feedbarTooltipURL").value = url;
				var title = window.parent.FEEDBAR.getCellText(idx).replace(/^\s+|\s+$/g, "");
				if (title.length > maxLength){
					title = title.substring(0,maxLength) + "...";
				}
				if (title == '') title = ' ';

				document.getElementById("feedbarTooltipName").value = title;
			}
			
			var image = window.parent.FEEDBAR.getImageSrc(idx);
			document.getElementById("feedbarTooltipImage").src = image;
			document.getElementById("feedbarTooltipFeedName").value = feedName;
		
			document.getElementById("feedbarTooltipName").style.display = '';

			tt.style.visibility = '';
		}
	},
	
	addError : function (feedName, feedUrl, error, priority) {
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(feedName + ": " + error, feedUrl, 'chrome://browser/skin/Info.png', priority, [ { accessKey : "V", callback : FEEDSIDEBAR.notifyCallback, label : "View feed", popup : null } ]);
	},

	notifyCallback : function (notification, description) {
		var browser = window.parent.gBrowser;
		
		var theTab = browser.addTab(notification.value);
		browser.selectedTab = theTab;
	},
	
	notifyNoFeeds : function () {
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(this.strings.getString("feedbar.errors.noFeedsFound"), "noFeedsFound", 'chrome://browser/skin/Info.png', 5, [ { accessKey : this.strings.getString("feedbar.errors.noFeedsFoundKey"), callback : function () { FEEDSIDEBAR.noFeedsFoundCallback(); }, label : this.strings.getString("feedbar.errors.noFeedsFoundLabel"), popup : null } ]);
	},
	
	noFeedsFoundCallback : function () {
		alert(this.strings.getString("feedbar.errors.noFeedsFoundMore"));
	},
	
	clearNotify : function () {
		document.getElementById("sidebar-notify").removeAllNotifications();
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
			this.ta.innerHTML = str.replace(/</g,"&lt;").replace(/>/g,"&gt;");
		} catch (e) {
			return str;
		}
		
		return this.ta.value;
	}
};

function FeedbarParseListener() {
	return this;
}

FeedbarParseListener.prototype = {
	handleResult: function(result) {
		if (result.bozo) {
			// Get feed name
			FEEDSIDEBAR.addError(FEEDSIDEBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDSIDEBAR.strings.getString("feedbar.errors.parseError"), 5);
			return;
		}
		
		var feed = result.doc;
		
		if (!feed) {
			FEEDSIDEBAR.addError(FEEDSIDEBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDSIDEBAR.strings.getString("feedbar.errors.invalidUrl"), 5);
			return;
		}
		
		try {
			feed.QueryInterface(Components.interfaces.nsIFeed);
		} catch (e) {
			FEEDSIDEBAR.addError(FEEDSIDEBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDSIDEBAR.strings.getString("feedbar.errors.invalidFeed"), 5);
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
		feedObject.livemarkId = FEEDSIDEBAR.feedData[feedObject.uri].bookmarkId;
		
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
			feedObject.description = FEEDSIDEBAR.strings.getString("feedbar.noSummary");
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
				itemObject.label = FEEDSIDEBAR.decodeEntities(item.title.plainText().replace(/<[^>]+>/g, ""));
				
				if (item.summary && item.summary.text) {
					itemObject.description = item.summary.text;//plainText();
				}
				else if (item.content && item.content.text) {
					itemObject.description = item.content.text;//plainText();
				}
				else {
					itemObject.description = FEEDSIDEBAR.strings.getString("feedbar.noSummary");
				}
				
				itemObject.visited = FEEDSIDEBAR.history.isVisitedURL(itemObject.uri, itemObject.id);
				
				feedObject.items.push(itemObject);
				
			} catch (e) {
				// FEEDSIDEBAR.addError(FEEDSIDEBAR.feedData[feedObject.link].name, feedObject.link, e, 5);
				// Don't show a notification here, since they can become legion.
				logFeedbarMsg(e);
			}
		}
		
		window.parent.FEEDBAR.push(feedObject);
		
		return;
	}
};

function logFeedbarMsg(m) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("FEEDBAR: " + m);
}