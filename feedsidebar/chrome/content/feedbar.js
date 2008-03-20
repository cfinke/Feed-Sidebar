var FEEDBAR = {
	get tree() { return document.getElementById("feedbar_tree"); },
	get progressText() { return document.getElementById("feedbar-loading-text"); },
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get nextUpdateDisplay() { return document.getElementById("feedbar-nextupdate-text"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	get displayPeriod() { return this.prefs.getIntPref("displayPeriod"); },
	get filter() { return document.getElementById("search-box").value; },
	
	prefs : null,
	filterTimeout : null,
	
	feedsToLoad : 0,
	feedsLoaded : 0,
	
	updateTimer : null,
	loadTimer : null,
	currentRequest : null,
	
	feeds : [],
	
	feedData : {},
	
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
		var db = this.getDB();
		
		if (!db.tableExists("history")) {
			db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, date INTEGER)");
		}
		if (!db.tableExists("state")) {
			db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, open INTEGER)");
		}
		
		try { db.close(); } catch (e) { }
		
		this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.prefs.addObserver("", this, false);
		
		this.strings = document.getElementById("feedbar-string-bundle");
		
		this.updateLoadProgress(0,0);
		this.checkFrequencyItem(this.prefs.getIntPref("updateFrequency"));
		this.checkPeriodItem(this.prefs.getIntPref("displayPeriod"));	
		
		// Update the display from the stored feeds
		this.updateFeeds(window.parent.FEEDBAR_STORE);
	
		// The sidebar has been opened and closed at least once.
		var lastMilli = this.lastUpdate.getTime();
		var currentMilli = new Date().getTime();
		var milliBetween = this.prefs.getIntPref("updateFrequency") * 60 * 1000;
		
		if ((lastMilli + milliBetween) < currentMilli){
			// Only do an update if enough time has elapsed since the sidebar was closed
			this.updateFeeds();
		}
		else {
			// Set an update for when it would have happened had the sidebar stayed open.
			this.updateTimer = setTimeout("FEEDBAR.updateFeeds();", (lastMilli + milliBetween) -  currentMilli);
		}
		
		this.previewPane.style.visibility = 'hidden';
	},
	
	observe: function(subject, topic, data) {
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
			case "lastUpdate":
			break;
			case "displayPeriod":
				this.updateTreeViewFromCache();
			break;
			case "hideReadItems":
				this.updateTreeViewFromCache();
			break;
		}
	},
	
	doSearch : function () {
		if (this.filterTimeout) clearTimeout(this.filterTimeout);
		
		this.filterTimeout = setTimeout('FEEDBAR.updateTreeViewFromCache();', 500);
	},
	
	updateFeeds : function (feeds) {
		if (feeds) {
			// Use the supplied array of feed objects to update the display
			for (var i = 0; i < feeds.length; i++){
				FEEDBAR.showItems(feeds[i]);
			}
		}
		else {
			// Find and load the feeds
			if (this.updateTimer) window.clearTimeout(this.updateTimer);
			
			this.findFeeds();
			this.loadFeeds();
			
			this.updateTimer = setTimeout("FEEDBAR.updateFeeds();", this.prefs.getIntPref("updateFrequency") * 60 * 1000);
		}
	},
	
	stopUpdate : function () {
		while (this.feeds.length > 0) this.feeds.pop();
		this.loadNextFeed();
	},
	
	findFeeds : function () {
		for (var i in this.feedData) delete this.feedData[i];
		
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
		
			while (this.feeds.length > 0) this.feeds.pop();
		
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
		
		FEEDBAR.clearNotify();
		while (window.parent.FEEDBAR_STORE.length > 0) window.parent.FEEDBAR_STORE.pop();
		
		if (this.feedsToLoad == 0){
			FEEDBAR.notifyNoFeeds();
		}
		
		FEEDBAR.updateLoadProgress(0, this.feedsToLoad);
		this.loadNextFeed();
	},
	
	loadNextFeed : function () {
		var feed = this.feeds.shift();
		
		if (feed){
			var url = feed.feed;
			this.progressText.setAttribute("tooltiptext",url);
			var req = new XMLHttpRequest();
			req.parent = this;
			req.feed = feed;
			this.currentRequest = req;
			
			try {
				req.open("GET", url, true);
				req.overrideMimeType("application/xml");
				
				req.onreadystatechange = function (event) {
					if (req.readyState == 4) {
						clearTimeout(req.parent.loadTimer);
						
						try {
							if (req.status == 200){
								var feedOb = null;
								
								try {
									// Trim it.
									FEEDBAR.queueForParsing(req.responseText.replace(/^\s\s*/, '').replace(/\s\s*$/, ''), url);
								} catch (e) {
									// Parse error
									FEEDBAR.addError(feed.name, url, e.message, 5);
								}
							}
						}
						catch (e) {
							if (e.name == "NS_ERROR_NOT_AVAILABLE"){
								FEEDBAR.addError(feed.name, url, FEEDBAR.strings.getString("feedbar.errors.unavailable"), 3);
							}
						}
						
						FEEDBAR.updateLoadProgress(++req.parent.feedsLoaded, req.parent.feedsToLoad);
						req.parent.loadNextFeed();
					}
				};
				
				req.send(null);
				this.loadTimer = setTimeout('FEEDBAR.currentRequest.abort();', 1000 * 15);
			}
			catch (e) {
				FEEDBAR.addError(feed.name, url, e.name, 3);
				FEEDBAR.updateLoadProgress(++this.feedsLoaded, this.feedsToLoad);
				this.loadNextFeed();
			}
		}
		else {
			FEEDBAR.updateLoadProgress(0, 0);
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
	
	updateTreeViewFromCache : function () {
		this.clearTree();
		this.updateFeeds(window.parent.FEEDBAR_STORE);
	},
	
	clearTree : function () {
		var c = document.getElementById('feedbar_tree_container');
		
		while (c.lastChild) c.removeChild(c.lastChild);
	},
	
	setUpdateFrequency : function (minutes) {
		this.prefs.setIntPref("updateFrequency",minutes);
	},
	
	setReloadInterval : function (minutes) {
		var lastUpdate = this.lastUpdate;
		
		window.clearTimeout(this.updateTimer);
		
		var newMSBetween = minutes * 60 * 1000;
		
		var newNextUpdateTime = new Date();
		newNextUpdateTime.setTime(lastUpdate.getTime() + newMSBetween);
		
		var now = new Date();
		
		if (newNextUpdateTime.getTime() <= now.getTime()) {
			FEEDBAR.updateFeeds();
		}
		else {
			var msUntil = newNextUpdateTime.getTime() - now.getTime();
			FEEDBAR.updateLoadProgress(0,0);
			this.updateTimer = setTimeout("FEEDBAR.updateFeeds();", msUntil);
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
					var db = FEEDBAR.getDB();

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
					var db = FEEDBAR.getDB();

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
			var nextUpdateTime = this.nextUpdate;
			
			var timeText = '';
			timeText += ((nextUpdateTime.getHours() > 12) ? nextUpdateTime.getHours() - 12 : nextUpdateTime.getHours());
			
			if (timeText == "0") timeText = "12";
			timeText += ":";
			
			if (nextUpdateTime.getMinutes() < 10) timeText += "0";
			timeText += nextUpdateTime.getMinutes();
			timeText += " ";
			
			timeText += (nextUpdateTime.getHours() > 11) ? this.strings.getString("feedbar.time.pm") : this.strings.getString("feedbar.time.am");
			
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
		
	itemSelect : function (event) {
		var target = this.getSelected();
		this.showPreview(target);
	},
	
	onTreeClick : function (event, target) {
		// Discard right-clicks
		if (event.which == 3){
			return;
		}
		
		if (!target) target = this.getSelected();
		
		if (target && target.type == 'item'){
			if (event.which == 2){
				this.launchUrl(target.link, event);
				this.markItemAsRead(target);
			}
			else if (event.which == 4){
				window.open(target.link);
			}
			else {
				// Left-click
				if (event.detail == 1){
					// Show the details
				//	this.showPreview(target);
				// handled by onselect
				}
				else {
					this.launchUrl(target.link, event);
					this.markItemAsRead(target);
				}
			}
		}
		else {
			// So it's a Feed header
			var tree = this.tree;
			var tbo = tree.treeBoxObject;

			// get the row, col and child element at the point
			var row = { }, col = { }, child = { };
			tbo.getCellAt(event.clientX, event.clientY, row, col, child);
			
			var rows = document.getElementById("feedbar_tree_container").getElementsByTagName("treeitem");
			var isOpen = false;
			var theRow = null;
			var j = 0;
			
			for (var i = 0; i < rows.length; i++) {
				if (rows[i].type == 'feed') {
					if (rows[i].getAttribute("open") == "true") {
						isOpen = true;
					}
					else {
						isOpen = false;
					}
					
					if (j == row.value) {
						theRow = rows[i];
						break;
					}
					
					++j;
				}
				else {
					if (isOpen) {
						++j;
					}
				}
			}
			
			var intIsOpen = 1;
			
			try {
				if (theRow.getAttribute("open") == "true") {
					intIsOpen = 1;
				}
				else if (theRow.getAttribute("open") == "false") {
					intIsOpen = 0;
				}
			} catch (e) {
				return;
			}
			
			var db = FEEDBAR.getDB();
			
			var insert = db.createStatement("INSERT INTO state (id, open) VALUES (?1, ?2)");
			insert.bindStringParameter(0, theRow.getAttribute("id"));
			insert.bindInt32Parameter(1, intIsOpen);
			
			try {
				insert.execute();
			} catch (e) {
				var update = db.createStatement("UPDATE state SET open=?1 WHERE id=?2");
				update.bindInt32Parameter(0, intIsOpen);
				update.bindStringParameter(1, theRow.id);
				
				try {
					update.execute();
				} catch (e) {
				}
			}
			
			try { db.close() } catch (e) { }
		}
	},
	
	markItemAsRead : function (item) {
		item.visited = true;
		
		if (this.prefs.getBoolPref("hideReadItems")) {
			this.removeItem(item);
		}
		else {
			item = item.firstChild.firstChild;
			
			item.setAttribute("properties", "visited");
			item.properties = "visited";
		}
		
		// Add to DB
		var db = FEEDBAR.getDB();
		
		var insert = db.createStatement("INSERT INTO history (id, date) VALUES (?1, ?2)");
		insert.bindUTF8StringParameter(0, item.guid);
		insert.bindInt64Parameter(1, (new Date().getTime()));
		
		try { insert.execute(); } catch (duplicateKey) { }
		
		try { db.close(); } catch (e) { }
	},
	
	removeItem : function (item) {
		var container = item.parentNode;
		
		if (container.childNodes.length == 1){
			container.parentNode.parentNode.removeChild(container.parentNode);
		}
		else {
			container.removeChild(item);
		}
		
		if (this.tree.getElementsByTagName("treeitem").length == 0) window.parent.document.getElementById("sidebar").style.width = '5px;';
	},
		
	showItems : function(feedObject) {
		var t = document.getElementById("feedbar_tree_container");

		var foundOne = false;

		var items = feedObject.items;
		var numItems = items.length;
		
		if (this.displayPeriod > 0) {
			var mustBeAfter = (new Date()).getTime() - (this.displayPeriod * 24 * 60 * 60 * 1000);
		}
		
		var showRead = !this.prefs.getBoolPref("hideReadItems");
		var filter = this.filter;
		var filterRE = new RegExp(filter, "i");
		
		itemsAdd : for (var k = 0; k < numItems; k++){
			var theEntry = items[k];
			
			if (theEntry) {
				var isRead = FEEDBAR.history.isVisitedURL(theEntry.link, theEntry.id);
				
				if (showRead || !isRead){
					if (this.displayPeriod > 0) {
						if (theEntry.published < mustBeAfter) {
							continue itemsAdd;
						}
					}
						
					if (filter && !(feedObject.title + " " + theEntry.title + " " + theEntry.description).match(filterRE)) {
						continue itemsAdd;
					}

					if (!foundOne) {
						foundOne = true;
						
						var openContainer = true;
						
						var db = FEEDBAR.getDB();
						var select = db.createStatement("SELECT open FROM state WHERE id=?1");
						select.bindStringParameter(0, feedObject.id);
						
						try {
							while (select.executeStep()) {
								if (select.getInt32(0) == 0) {
									openContainer = false;
								}
							}
						} catch (e) {
							alert(e);
						} finally {
							select.reset();
						}
						
						try { db.close() } catch (e) { } 

						for (var q = 0; q < t.childNodes.length; q++){
							if (t.childNodes[q].feed == feedObject.link){
								var fp = t.childNodes[q].getElementsByTagName("treechildren")[0];
							}
						}

						if (!fp){
							var f = document.createElement("treeitem");
							f.link = feedObject.link;
							f.bookmarkId = feedObject.bookmarkId;
							
							f.title = feedObject.title;
							f.description = feedObject.title;
							f.feedName = feedObject.title;
							
							f.setAttribute("id", feedObject.id);
							
							f.type = 'feed';
							f.feed = feedObject.link;
							f.setAttribute("container","true");
							f.setAttribute("open",openContainer.toString());

							var fr = document.createElement("treerow");
							var fc = document.createElement("treecell");
							fc.setAttribute("src","chrome://feedbar/skin/icons/folder.png");
							fc.setAttribute("label"," "+feedObject.title);

							var fp = document.createElement("treechildren");

							t.appendChild(f);
							f.appendChild(fr);
							fr.appendChild(fc);
							f.appendChild(fp);
						}
					}

					itemsCheck : for (var q = 0; q < fp.childNodes.length; q++){
						if (fp.childNodes[q].link == theEntry.link) {
							continue itemsAdd;
						}
					}

					var i = document.createElement("treeitem");
					i.guid = theEntry.id;
					i.visited = isRead;
					
					var r = document.createElement("treerow");
					var c = document.createElement("treecell");
					c.setAttribute("src", theEntry.favicon);
					c.setAttribute("label"," "+theEntry.title);

					if (isRead)	{
						c.setAttribute("properties", "visited");
						c.properties = "visited";
					}

					i.link = theEntry.link;
					i.title = theEntry.title;
					i.description = theEntry.description;
					i.image = theEntry.favicon;
					i.feedName = feedObject.title;
					i.type = 'item';
					i.setAttribute("tooltip","feedbarTooltip");

					t.appendChild(i);
					i.appendChild(r);
					r.appendChild(c);

					fp.appendChild(i);
				}
			}
		}
	},
	
	confirmOpenTabs : function (numTabs) {
		var pref = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);

		const kWarnOnOpenPref = "browser.tabs.warnOnOpen";

		var reallyOpen = true;

		if (pref.getBoolPref(kWarnOnOpenPref)) {
			if (numTabs >= pref.getIntPref("browser.tabs.maxOpenBeforeWarn")) {
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);

				// default to true: if it were false, we wouldn't get this far
				var warnOnOpen = { value: true };

				var buttonPressed = promptService.confirmEx(window,
					this.strings.getString("feedbar.confirmOpenInTabs"),
					this.strings.getFormattedString("feedbar.warnOnTabsMessage", [ numTabs ]),
					(promptService.BUTTON_TITLE_IS_STRING * promptService.BUTTON_POS_0) + (promptService.BUTTON_TITLE_CANCEL * promptService.BUTTON_POS_1), 
					this.strings.getString("feedbar.openConfirmText"), null, null,
					this.strings.getString("feedbar.warnOnTabs"),
					warnOnOpen);

				reallyOpen = (buttonPressed == 0);

				// don't set the pref unless they press OK and it's false
				if (reallyOpen && !warnOnOpen.value)
					pref.setBoolPref(kWarnOnOpenPref, false);
			}
		}

		return reallyOpen;
	},
	
	options : function () {
		openDialog("chrome://feedbar/content/options.xul", "", "chrome,titlebar,toolbar,centerscreen");
	},
	
	contextMenu : {
		get item() { return FEEDBAR.getSelected(); },
		
		customize : function (menu) {
			var options = menu.getElementsByTagName("menuitem");
			var item = FEEDBAR.getSelected();
			
			if (item) {
				if (item.type == 'item') {
					// Single item menu
					for (var i = 0; i < options.length; i++){
						switch (options[i].getAttribute("option")) {
							case 'open':
							case 'openInWindow':
							case 'openInTab':
							case 'openAllInTabs':
							case 'markAllAsRead':
								options[i].setAttribute("hidden", "false");
							break;
							case 'openFeedInTabs':
							case 'markFeedAsRead':
							case 'markFeedAsUnread':
							case 'options':
							case 'unsubscribe':
								options[i].setAttribute("hidden", "true");
							break;
							case 'markAsRead':
								options[i].setAttribute("hidden", item.visited.toString());
							break;
							case 'markAsUnread':
								options[i].setAttribute("hidden", !item.visited.toString());
							break;
							case 'openUnreadInTabs':
							case 'openFeedUnreadInTabs':
								options[i].setAttribute("hidden", (!FEEDBAR.prefs.getBoolPref("hideReadItems")).toString());
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
							case 'options':
								options[i].setAttribute("hidden", "true");
							break;
							case 'openAllInTabs':
							case 'markAllAsRead':
							case 'openFeedInTabs':
							case 'markFeedAsRead':
							case 'unsubscribe':
								options[i].setAttribute("hidden", "false");
							break;
							case 'openUnreadInTabs':
							case 'openFeedUnreadInTabs':
							case 'markFeedAsUnread':
								options[i].setAttribute("hidden", (!FEEDBAR.prefs.getBoolPref("hideReadItems")).toString());
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
		},
		
		openItem : function () {
			FEEDBAR.onTreeCblClick({which : 1, detail : 2});
		},
		
		openInWindow : function () {
			FEEDBAR.onTreeClick({which : 4, detail : 2});
		},
		
		openInTab : function () {
			FEEDBAR.onTreeClick({which : 2, detail : 1});
		},
		
		openAll : function () {
			var items = FEEDBAR.tree.getElementsByTagName("treeitem");
			
			var numItems = 0;
			
			for (var i = items.length - 1; i >= 0; i--){
				if (items[i] && items[i].type == 'item') {
					++numItems;
				}
			}
			
			if (FEEDBAR.confirmOpenTabs(numItems)) {
				for (var i = items.length - 1; i >= 0; i--){
					if (items[i] && items[i].type == 'item') {
						FEEDBAR.onTreeClick({which : 2, detail : 1}, items[i]);
					}
				}
			}
		},
		
		openFeed : function () {
			var items = this.item.getElementsByTagName("treeitem");
			
			var numItems = 0;
			
			for (var i = items.length - 1; i >= 0; i--){
				if (items[i] && items[i].type == 'item') {
					++numItems;
				}
			}
			
			if (FEEDBAR.confirmOpenTabs(numItems)) {
				for (var i = items.length - 1; i >= 0; i--){
					if (items[i] && items[i].type == 'item') {
						FEEDBAR.onTreeClick({which : 2, detail : 1}, items[i]);
					}
				}
			}
		},
		
		markAsRead : function () {
			if (this.item.type == 'item'){
				FEEDBAR.markItemAsRead(this.item);
			}
			else if (this.item.type == 'feed'){
				this.markFeedAsRead();
			}
		},
		
		markFeedAsRead : function () {
			var items = this.item.getElementsByTagName("treeitem");
			
			for (var i = items.length - 1; i >= 0; i--){
				if (items[i].type == 'item') {
					FEEDBAR.markItemAsRead(items[i]);
				}
			}
		},
		
		markAllAsRead : function () {
			var container = document.getElementById("feedbar_tree_container");
			
			var item = null;
			
			while ((item = container.lastChild)) {
				// item is a feed
				var items = item.getElementsByTagName("treeitem");
			
				for (var i = items.length - 1; i >= 0; i--){
					if (items[i].type == 'item') {
						FEEDBAR.markItemAsRead(items[i]);
					}
				}
			}
		},
		
		unsubscribe : function () {
			var id = this.item.bookmarkId;
			var link = this.item.link;
			
			this.item.parentNode.removeChild(this.item);
			
			FEEDBAR.unsubscribe(id, link);
		}
	},
	
	showPreview : function (item) {
		var tt = this.previewPane;
		
		if (!item || !item.link){
			tt.style.visibility = 'hidden';
			return false;
		}
		else {
			while (document.getElementById("feedbarTooltipSummary").lastChild) document.getElementById("feedbarTooltipSummary").removeChild(document.getElementById("feedbarTooltipSummary").lastChild);
			
			var maxLength = 60;
			
			var descr = item.description;
			var title = item.title;
			var url = item.link;
			var feedName = item.feedName;
			
			if (title.length > maxLength){
				title = title.substring(0,maxLength) + "...";
			}
			
			if (url.length > maxLength){
				url = url.substring(0,maxLength) + "...";
			}
			
			var image = item.image;
			document.getElementById("feedbarTooltipImage").src = image;
			document.getElementById("feedbarTooltipURL").value = "URL: "+url;
			document.getElementById("feedbarTooltipFeedName").value = feedName;
			
			if (title == '') title = ' ';
			
			document.getElementById("feedbarTooltipName").value = title;
			document.getElementById("feedbarTooltipName").style.display = '';

			var text = document.createTextNode(descr);
			
			document.getElementById("feedbarTooltipSummary").appendChild(text);
	  
	  		tt.style.visibility = 'visible';
	  
			return true;
		}
	},
	
	addError : function (feedName, feedUrl, error, priority) {
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(feedName + ": " + error, feedUrl, 'chrome://browser/skin/Info.png', priority, [ { accessKey : "V", callback : FEEDBAR.notifyCallback, label : "View feed", popup : null } ]);
	},

	unsubscribe : function (livemarkId, livemarkUrl) {
		try {
			var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			bookmarkService.removeFolder(livemarkId);
		} catch (e) {
			logFeedbarMsg(e);
			function createSelection(node) {
				var items = [ node ];
				var selection = { item: items, parent: Array(1), length: 1, prop: [] };
				selection.parent[0] = BMDS.getParent(selection.item[0]);
				selection.isContainer = new Array(selection.length);
				return selection;
		    }
	
		    function getResource (feedUrl) {
				var urlArcID = RDF.GetResource("http://home.netscape.com/NC-rdf#ID");
				var FeedArc = RDF.GetResource("http://home.netscape.com/NC-rdf#FeedURL");
				
			    var urlLiteral = RDF.GetLiteral(feedUrl);
			    var bmResource = BMSVC.GetSources(RDF.GetResource("http://home.netscape.com/NC-rdf#FeedURL"), urlLiteral, true);
				
				while (bmResource.hasMoreElements()) {
					var DuplicateURLresource = bmResource.getNext();
					var URLParent = BMSVC.getParent(DuplicateURLresource);
					
					if (URLParent) {
						var rv = BMDS.GetTarget(DuplicateURLresource.QueryInterface(kRDFRSCIID), urlArcID, true);
						if(!rv) {
							rv = DuplicateURLresource;
						}
						return rv;
					}
				}

				return null;
			}
			
			var resource = getResource(livemarkUrl);
			
			if (resource) {
				var selection = createSelection(resource);
				BookmarksCommand.deleteBookmark(selection);
			}
			else {
				alert(this.strings.getString("feedbar.errors.couldNotUnsubscribe"));
			}
		}
	},

	notifyCallback : function (notification, description) {
		var browser = window.parent.gBrowser;
		
		var theTab = browser.addTab(notification.value);
		browser.selectedTab = theTab;
	},
	
	notifyNoFeeds : function () {
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(this.strings.getString("feedbar.errors.noFeedsFound"), "noFeedsFound", 'chrome://browser/skin/Info.png', 5, [ { accessKey : this.strings.getString("feedbar.errors.noFeedsFoundKey"), callback : function () { FEEDBAR.noFeedsFoundCallback(); }, label : this.strings.getString("feedbar.errors.noFeedsFoundLabel"), popup : null } ]);
	},
	
	noFeedsFoundCallback : function () {
		alert(this.strings.getString("feedbar.errors.noFeedsFoundMore"));
	},
	
	clearNotify : function () {
		document.getElementById("sidebar-notify").removeAllNotifications();
	},
	
	getSelected : function () {
		var view = this.tree.view;
		var range = view.selection.getRangeCount();
		var items = [];

		for (var i = 0; i < range; i++) {
			var start = {};
			var end = {};
			view.selection.getRangeAt(i, start, end);
			return view.getItemAtIndex(start.value);
		}

		return null;
	},
	
	launchUrl : function (url, event) {
		if ((event.which == 2) || (event.which == 1 && (event.ctrlKey || event.metaKey))){
			this._addTab(url);
		}
		else if (event.which == 1){
			this._inTab(url);
		}
		else if (event.which == 4){
			window.open(url);
		}
	},
	
	_addTab : function (url) {
		var browser = window.parent.gBrowser || window.parent.gBrowser;
		var theTab = browser.addTab(url);
		
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
			
		var loadInBackground = false;
			
		try {
			loadInBackground = prefs.getBoolPref("browser.tabs.loadInBackground");
		} catch (e) {
		}
			
		if (!loadInBackground){
			browser.selectedTab = theTab;
		}
	},
	
	_inTab : function (url) {
		window.parent.content.document.location.href = url;
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
	}
};

function FeedbarParseListener() {
	return this;
}

FeedbarParseListener.prototype = {
	handleResult: function(result) {
		if (result.bozo) {
			// Get feed name
			FEEDBAR.addError(FEEDBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDBAR.strings.getString("feedbar.errors.parseError"), 5);
			return;
		}
		
		var feed = result.doc;
		
		if (!feed) {
			FEEDBAR.addError(FEEDBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDBAR.strings.getString("feedbar.errors.invalidUrl"), 5);
			return;
		}
		
		try {
			feed.QueryInterface(Components.interfaces.nsIFeed);
		} catch (e) {
			FEEDBAR.addError(FEEDBAR.feedData[result.uri.resolve("")].name, result.uri.resolve(""), FEEDBAR.strings.getString("feedbar.errors.invalidFeed"), 5);
			return;
		}
		
		// Now grab the info we need to save and cache it in FEEDBAR_STORE
		// We can't just cache the feed object, because it goes away
		
		var feedObject = {
			title : "",
			link : "",
			siteLink : "",
			items : [],
			id : "",
			bookmarkId : ""
		};
		
		feedObject.id = feed.link.resolve("");
		feedObject.link = result.uri.resolve("");
		feedObject.bookmarkId = FEEDBAR.feedData[feedObject.link].bookmarkId;
		feedObject.siteLink = feed.link.resolve("");
		feedObject.title = feed.title.plainText();
		
		var numItems = feed.items.length;
		
		for (var i = 0; i < numItems; i++) {
			var item = feed.items.queryElementAt(i, Components.interfaces.nsIFeedEntry);
			
			var itemObject = {
				link : "",
				published : "",
				title : "",
				description : "",
				favicon : "",
				id : ""
			};
			
			try {
				itemObject.id = item.id;
				
				itemObject.link = item.link.resolve("");
				
				if (itemObject.link.match(/\/\/news\.google\.com\/.*\?/)){
					var q = itemObject.link.indexOf("?");
					itemObject.link = itemObject.link.substring(0, q) + ("&" + itemObject.link.substring(q)).replace(/&(ct|cid|ei)=[^&]*/g, "").substring(1);
				}

				if (!itemObject.link.match(/\/~r\//i)) {
					if (itemObject.link.match(/\/\/news\.google\.com\//)){
						// Google news
						var root = itemObject.link.match(/url=(https?:\/\/[^\/]+\/)/i)[1];
						itemObject.favicon = root + "favicon.ico";
					}
					else {
						itemObject.favicon = itemObject.link.substr(0, (itemObject.link.indexOf("/", 9) + 1)) + "favicon.ico";
					}
				}
				else {
					// Feedburner
					itemObject.favicon = feedObject.siteLink.substr(0, (feedObject.siteLink.indexOf("/", 9) + 1)) + "favicon.ico";
				}
			
				itemObject.published = Date.parse(item.updated);
				itemObject.title = item.title.plainText();
				
				if (item.summary) {
					itemObject.description = item.summary.plainText();
				}
				else if (item.content) {
					itemObject.description = item.content.plainText();
				}
				else {
					itemObject.description = FEEDBAR.strings.getString("feedbar.noSummary");
				}
				
				feedObject.items.push(itemObject);
			} catch (e) {
				// FEEDBAR.addError(FEEDBAR.feedData[feedObject.link].name, feedObject.link, e, 5);
				// Don't show a notification here, since they can become legion.
			}
		}
		
		window.parent.FEEDBAR_STORE.push(feedObject);

		FEEDBAR.showItems(feedObject);
		
		return;
	}
};

function logFeedbarMsg(m) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("FEEDBAR: " + m);
}