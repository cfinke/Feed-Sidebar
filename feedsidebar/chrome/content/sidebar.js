var FEEDSIDEBAR = {
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	
	prefs : null,
	
	load : function () {
		var frame = document.getElementById("content-frame");
		
		frame.docShell.allowAuth = false;
		frame.docShell.allowImages = true;
		frame.docShell.allowJavascript = false;
		frame.docShell.allowMetaRedirects = false
		frame.docShell.allowPlugins = false;
		frame.docShell.allowSubframes = false;
		
		FEEDSIDEBAR.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		FEEDSIDEBAR.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		FEEDSIDEBAR.prefs.addObserver("", FEEDSIDEBAR, false);
		
		document.getElementById("feed_tree").view = FEEDBAR;
		
		FEEDSIDEBAR.checkFrequencyItem(FEEDSIDEBAR.prefs.getIntPref("updateFrequency"));
		FEEDSIDEBAR.checkPeriodItem(FEEDSIDEBAR.prefs.getIntPref("displayPeriod"));	
		FEEDSIDEBAR.checkSortItem(FEEDSIDEBAR.prefs.getCharPref("lastSort"));
		
		document.getElementById("search-box").value = FEEDSIDEBAR.prefs.getCharPref("filter");
		document.getElementById("all-toggle").checked = !FEEDSIDEBAR.prefs.getBoolPref("hideReadItems");
		
		FEED_GETTER.sidebarPing();
		
		FEEDSIDEBAR.showFeaturedFeeds();
	},
	
	unload : function () {
		FEED_GETTER.sidebarPung();
		FEEDSIDEBAR.prefs.removeObserver("", FEEDSIDEBAR);
		
		if (FEEDSIDEBAR.featuredFeedsTimeout) {
			clearTimeout(FEEDSIDEBAR.featuredFeedsTimeout);
		}
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "hideReadItems":
				document.getElementById("all-toggle").checked = !FEEDSIDEBAR.prefs.getBoolPref("hideReadItems");
			break;
		}
	},
	
	featuredFeedsTimeout : null,
	
	showFeaturedFeeds : function () {
		var allowedToShow = FEEDSIDEBAR.prefs.getBoolPref("featuredFeeds.notify");
		
		if (allowedToShow) {
			var needToShow = FEEDSIDEBAR.prefs.getBoolPref("featuredFeeds.new");
			
			if (needToShow) {
				var feedsToShow = FEEDSIDEBAR.prefs.getCharPref("featuredFeeds");
				
				if (feedsToShow) {
					// 10% of the time.
					var willShow = (Math.random() < 0.2);
				
					if (willShow) {
						FEEDSIDEBAR.featuredFeedsTimeout = setTimeout(
							function () {
								FEEDSIDEBAR.prefs.setBoolPref("featuredFeeds.new", false);
							
								var nb = document.getElementById("sidebar-notify");
								nb.appendNotification(FEEDSIDEBAR.strings.getString('feedbar.featured.notification'), "featured-feeds", 'chrome://feedbar/content/skin-common/thumbs-up.png', nb.PRIORITY_INFO_HIGH, 
									[ 
										{
											accessKey : FEEDSIDEBAR.strings.getString('feedbar.featured.okKey'), 
											callback : function () {
												var optWin = FEEDSIDEBAR.options("featured-pane");
												/*
												
												optWin.addEventListener("load", function (evt) { 
													var win = evt.currentTarget; 
													win.document.documentElement.showPane(win.document.getElementById("featured-pane"));
													win.sizeToContent();
												}, false);
												*/
											}, 
											label : FEEDSIDEBAR.strings.getString('feedbar.featured.okLabel'),
											popup : null
										}
									 ]);
							},
							1000);
					}
				}
			}
		}
	},
	
	searchTimeout : null,
	
	onSearchInput : function (value) {
		if (FEEDSIDEBAR.searchTimeout) clearTimeout(FEEDSIDEBAR.searchTimeout);
		
		FEEDSIDEBAR.searchTimeout = setTimeout(FEEDSIDEBAR.filter, 500, value);
	},
	
	filter : function (value) {
		FEEDSIDEBAR.prefs.setCharPref("filter", value);
	},
	
	setDisplayPeriod : function (days) {
		FEEDSIDEBAR.prefs.setIntPref("displayPeriod", days);
	},
	
	setUpdateFrequency : function (minutes) {
		FEEDSIDEBAR.prefs.setIntPref("updateFrequency",minutes);
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
	
	checkSortItem : function (sort) {
		var sortMenus = [ document.getElementById('sort-menu'),document.getElementById('sort-context-menu') ];
		
		for (var i = 0; i < sortMenus.length; i++) {
			var sortMenu = sortMenus[i];
			
			var sorts = sortMenu.getElementsByTagName("menuitem");
		
			for (var i = 0; i < sorts.length; i++){
				if (sorts[i].getAttribute("value") == sort){
					sorts[i].setAttribute("checked","true");
				}
				else {
					sorts[i].setAttribute("checked","false");
				}
			}
		}
	},

	options : function (panel) {
		var features = "";
		
		try {
			var instantApply = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("").getBoolPref("browser.preferences.instantApply");
			features = "chrome,titlebar,toolbar,centerscreen" + (instantApply ? ",dialog=no" : "");
		}
		catch (e) {
			features = "chrome,titlebar,toolbar,centerscreen";
		}
		
		var optWin = openDialog("chrome://feedbar/content/options.xul", "", features);
		
		if (panel) {
			optWin.addEventListener("load", function (evt) {
				var win = evt.currentTarget;
				win.document.documentElement.showPane(win.document.getElementById(panel));
			}, false);
		}
		
		return optWin;
	},
	
	contextMenu : {
		customize : function (menu) {
			var options = menu.getElementsByTagName("menuitem");
			
			var itemIdx = FEEDBAR.getSelectedIndex();
			
			var hideReadItems = FEEDSIDEBAR.prefs.getBoolPref("hideReadItems");
			
			if (itemIdx >= 0) {
				if (!FEEDBAR.isContainer(itemIdx)) {
					var unreadItems = FEEDBAR.hasUnreadItems();
					var readItems = FEEDBAR.hasReadItems();
					
					// Single item menu
					for (var i = 0; i < options.length; i++){
						options[i].disabled = false;
						
						switch (options[i].getAttribute("option")) {
							case 'open':
							case 'openInWindow':
							case 'openInTab':
							case 'openAllInTabs':
							case 'options':
							case 'copyTitle':
							case 'copyLink':
							case 'sortBy':
								options[i].setAttribute("hidden", "false");
							break;
							case 'markAllAsRead':
								options[i].setAttribute("hidden", "true");
								options[i].disabled = !unreadItems;
							break;
							case 'openFeedInTabs':
							case 'markFeedAsRead':
							case 'markFeedAsUnread':
							case 'unsubscribe':
								options[i].setAttribute("hidden", "true");
							break;
							case 'markAsRead':
								options[i].setAttribute("hidden", FEEDBAR.getCellRead(itemIdx));
							break;
							case 'markAsUnread':
								options[i].setAttribute("hidden", hideReadItems || !FEEDBAR.getCellRead(itemIdx));
							break;
							case 'openUnreadInTabs':
							case 'openFeedUnreadInTabs':
								options[i].setAttribute("hidden", (!hideReadItems).toString());
							break;
							case 'markAllAsUnread':
								options[i].setAttribute("hidden", "true");
								options[i].disabled = !readItems;
							break;
						}
					}	
				}
				else {
					// Feed menu
					var unreadFeedItems = FEEDBAR.hasUnreadItems(itemIdx);
					var unreadItems = unreadFeedItems || FEEDBAR.hasUnreadItems();
					
					var readFeedItems = FEEDBAR.hasReadItems(itemIdx);
					var readItems = readFeedItems || FEEDBAR.hasReadItems();
					
					for (var i = 0; i < options.length; i++){
						options[i].disabled = false;
						
						switch (options[i].getAttribute("option")) {
							case 'open':
							case 'openInWindow':
							case 'openInTab':
							case 'markAsRead':
							case 'markAsUnread':
								options[i].setAttribute("hidden", "true");
							break;
							case 'openAllInTabs':
							case 'openFeedInTabs':
							case 'unsubscribe':
							case 'options':
							case 'copyTitle':
							case 'copyLink':
							case 'sortBy':
								options[i].setAttribute("hidden", "false");
							break;
							case 'markFeedAsRead':
								options[i].setAttribute("hidden", "false");
								options[i].disabled = !unreadFeedItems;
							break;
							case 'openUnreadInTabs':
								options[i].setAttribute("hidden", hideReadItems.toString());
								options[i].disabled = !unreadItems;
							break;
							case 'openFeedUnreadInTabs':
								options[i].setAttribute("hidden", hideReadItems.toString());
								options[i].disabled = !unreadFeedItems;
							break;
							case 'markFeedAsUnread':
								options[i].setAttribute("hidden", hideReadItems.toString());
								options[i].disabled = !readFeedItems;
							break;
							case 'markAllAsUnread':
								options[i].setAttribute("hidden", "true");
								options[i].disabled = !readItems;
							break;
							case 'markAllAsRead':
								options[i].setAttribute("hidden", "true");
								options[i].disabled = !unreadItems;
							break;
						}
					}	
				}
			}
			else {
				var unreadItems = FEEDBAR.hasUnreadItems();
				var readItems = FEEDBAR.hasReadItems();
				
				// Default menu
				for (var i = 0; i < options.length; i++){
					options[i].disabled = false;
					
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
						case 'copyTitle':
						case 'copyLink':
							options[i].setAttribute("hidden", "true");
						break;
						case 'options':
						case 'openUnreadInTabs':
						case 'sortBy':
							options[i].setAttribute("hidden", "false");
						break;
						case 'openAllInTabs':
							options[i].setAttribute("hidden", "false");
							options[i].disabled = !(unreadItems || readItems);
						break;
						case 'markAllAsRead':
							options[i].setAttribute("hidden", "false");
							options[i].disabled = !unreadItems;
						break;
						case 'markAllAsUnread':
							options[i].setAttribute("hidden", hideReadItems.toString());
							options[i].disabled = !readItems;
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
		var idx = FEEDBAR.getSelectedIndex();
		
		if (idx < 0) {
			FEEDSIDEBAR.showPreview();
		}
		else {
			FEEDBAR.previewTimeout = FEEDBAR.setTimeout(FEEDSIDEBAR.showPreview, 450, idx);
		}
		
		event.stopPropagation();
		event.preventDefault();
	},
	
	hidePreview : function () {
		document.getElementById("feedbar-preview").collapsed = true;
		document.getElementById("preview-splitter").collapsed = true;
	},
	
	restorePreviewPane : function () {
		document.getElementById("feedbar-preview").collapsed = false;
		document.getElementById("preview-splitter").collapsed = false;
	},
	
	showPreview : function (idx) {
		var tt = FEEDSIDEBAR.previewPane;
		
		if (typeof idx == 'undefined' || (idx < 0)) {
			FEEDSIDEBAR.hidePreview();
		}
		else {
			var maxLength = 60;
			var descr = FEEDBAR.getCellDescription(idx);
			var target = document.getElementById("content-frame").contentDocument.body;
			target.innerHTML = "";
			
			var fragment = Components.classes["@mozilla.org/feed-unescapehtml;1"]  
									  .getService(Components.interfaces.nsIScriptableUnescapeHTML)  
									  .parseFragment(descr, false, null, target);
			target.appendChild(fragment);
			
			if (FEEDBAR.isContainer(idx)){
				var title = FEEDBAR.getCellLink(idx).replace(/^\s+|\s+$/g, "");
				var feedName = FEEDBAR.getCellText(idx).replace(/^\s+|\s+$/g, "");
				
				var url = FEEDBAR.getCellFeedLink(idx);
				
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
				var feedIdx = FEEDBAR.getParentIndex(idx);
				var feedName = FEEDBAR.getCellText(feedIdx).replace(/^\s+|\s+$/g, "");
				var url = FEEDBAR.getCellLink(idx);
				document.getElementById("feedbarTooltipURL").url = url;
				document.getElementById("feedbarTooltipName").url = url;
				if (url.length > maxLength){
					url = url.substring(0,maxLength) + "...";
				}
				document.getElementById("feedbarTooltipURL").value = url;
				var title = FEEDBAR.getCellText(idx).replace(/^\s+|\s+$/g, "");
				if (title.length > maxLength){
					title = title.substring(0,maxLength) + "...";
				}
				if (title == '') title = ' ';

				document.getElementById("feedbarTooltipName").value = title;
			}
			
			var image = FEEDBAR.getImageSrc(idx);
			document.getElementById("feedbarTooltipImage").src = image;
			document.getElementById("feedbarTooltipFeedName").value = feedName;
		
			document.getElementById("feedbarTooltipName").style.display = '';

			FEEDSIDEBAR.restorePreviewPane();
		}
	},
	
	addError : function (feedName, feedUrl, error, priority) {
		var livemarkId = FEED_GETTER.feedData[feedUrl.toLowerCase()].bookmarkId;
		
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(feedName + ": " + error, feedUrl, 'chrome://browser/skin/Info.png', priority, [
			{
				accessKey : FEEDSIDEBAR.strings.getString("feedbar.errors.viewFeed.key"), 
				callback : FEEDSIDEBAR.notifyCallback, 
				label : FEEDSIDEBAR.strings.getString("feedbar.errors.viewFeed"), 
				popup : null
			},
			{
				accessKey : FEEDSIDEBAR.strings.getString("feedbar.unsubscribe.key"),
				callback : function () { FEEDBAR.unsubscribeById(livemarkId); FEED_GETTER.removeAFeed(livemarkId); },
				label : FEEDSIDEBAR.strings.getString("feedbar.unsubscribe"),
				popup : null
			}
		]);
	},

	notifyCallback : function (notification, description) {
		var browser = window.parent.gBrowser;
		
		var theTab = browser.addTab(notification.value);
		browser.selectedTab = theTab;
	},
	
	notifyNoFeeds : function () {
		var nb = document.getElementById("sidebar-notify");
		nb.appendNotification(FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFound"), "noFeedsFound", 'chrome://browser/skin/Info.png', 5, [ { accessKey : FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFoundKey"), callback : function () { FEEDSIDEBAR.noFeedsFoundCallback(); }, label : FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFoundLabel"), popup : null } ]);
	},
	
	noFeedsFoundCallback : function () {
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
		promptService.alert(window, FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFound"), FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFoundMore"));
	},
	
	clearNotify : function () {
		document.getElementById("sidebar-notify").removeAllNotifications();
	}
};

function logFeedbarMsg(m) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("FEEDBAR: " + m);
	alert("FEEDBAR: " + m);
}