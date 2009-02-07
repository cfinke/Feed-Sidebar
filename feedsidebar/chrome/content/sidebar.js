var FEEDSIDEBAR = {
	get progressText() { return document.getElementById("feedbar-loading-text"); },
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get nextUpdateDisplay() { return document.getElementById("feedbar-nextupdate-text"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	get displayPeriod() { return FEEDSIDEBAR.prefs.getIntPref("displayPeriod"); },
	
	prefs : null,
	
	init : function () {
		FEEDSIDEBAR.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		FEEDSIDEBAR.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		FEEDSIDEBAR.prefs.addObserver("", FEEDSIDEBAR, false);
		
		document.getElementById("feed_tree").view = window.parent.FEEDBAR;
		
		FEEDSIDEBAR.checkFrequencyItem(FEEDSIDEBAR.prefs.getIntPref("updateFrequency"));
		FEEDSIDEBAR.checkPeriodItem(FEEDSIDEBAR.prefs.getIntPref("displayPeriod"));	
		FEEDSIDEBAR.checkSortItem(FEEDSIDEBAR.prefs.getCharPref("lastSort"));
		
		document.getElementById("search-box").value = FEEDSIDEBAR.prefs.getCharPref("filter");
		document.getElementById("all-toggle").checked = !FEEDSIDEBAR.prefs.getBoolPref("hideReadItems");
		
		window.parent.FEED_GETTER.sidebarPing();
	},
	
	unload : function () {
		window.parent.FEED_GETTER.sidebarPung();
		FEEDSIDEBAR.prefs.removeObserver("", FEEDSIDEBAR);
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
		var sortMenu = document.getElementById('sort-menu');
		var sorts = sortMenu.getElementsByTagName("menuitem");
		
		for (var i = 0; i < sorts.length; i++){
			if (sorts[i].getAttribute("value") == sort){
				sorts[i].setAttribute("checked","true");
			}
			else {
				sorts[i].setAttribute("checked","false");
			}
		}
    },

	updateLoadProgress : function (done, total, nextUpdateTime) {
		if (!navigator.onLine) {
			document.getElementById("reload-button").setAttribute("disabled", ("import" in Components.utils).toString());
			document.getElementById("stop-button").setAttribute("disabled","true");
			
			FEEDSIDEBAR.progressText.setAttribute("value", FEEDSIDEBAR.strings.getString("feedbar.workingOffline"));
			return;
		}
		
		try {
			if (done == total) {
				var use24HourTime = FEEDSIDEBAR.prefs.getBoolPref("24HourTime");
			
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
			
				if (!use24HourTime) timeText += (nextUpdateTime.getHours() > 11) ? FEEDSIDEBAR.strings.getString("feedbar.time.pm") : FEEDSIDEBAR.strings.getString("feedbar.time.am");
			
				document.getElementById("reload-button").setAttribute("disabled","false");
				document.getElementById("stop-button").setAttribute("disabled","true");
				FEEDSIDEBAR.progressText.setAttribute("value", FEEDSIDEBAR.strings.getFormattedString("feedbar.nextUpdate", [timeText]) );
			}
			else {
				document.getElementById("reload-button").setAttribute("disabled","true");
				document.getElementById("stop-button").setAttribute("disabled","false");
				FEEDSIDEBAR.progressText.setAttribute("value", FEEDSIDEBAR.strings.getFormattedString("feedbar.checkingFeeds", [done, total]));
			}
		} catch (e) { }
	},
	
	options : function () {
		openDialog("chrome://feedbar/content/options.xul", "", "chrome,titlebar,toolbar,centerscreen");
	},
	
	contextMenu : {
		customize : function (menu) {
			var options = menu.getElementsByTagName("menuitem");
			
			var itemIdx = window.parent.FEEDBAR.getSelectedIndex();
			
			var hideReadItems = FEEDSIDEBAR.prefs.getBoolPref("hideReadItems");
			
			if (itemIdx >= 0) {
				if (!window.parent.FEEDBAR.isContainer(itemIdx)) {
					var unreadItems = window.parent.FEEDBAR.hasUnreadItems();
					var readItems = window.parent.FEEDBAR.hasReadItems();
					
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
								options[i].setAttribute("hidden", window.parent.FEEDBAR.getCellRead(itemIdx));
							break;
							case 'markAsUnread':
								options[i].setAttribute("hidden", hideReadItems || !window.parent.FEEDBAR.getCellRead(itemIdx));
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
					var unreadFeedItems = window.parent.FEEDBAR.hasUnreadItems(itemIdx);
					var unreadItems = unreadFeedItems || window.parent.FEEDBAR.hasUnreadItems();
					
					var readFeedItems = window.parent.FEEDBAR.hasReadItems(itemIdx);
					var readItems = readFeedItems || window.parent.FEEDBAR.hasReadItems();
					
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
				var unreadItems = window.parent.FEEDBAR.hasUnreadItems();
				var readItems = window.parent.FEEDBAR.hasReadItems();
				
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
		var idx = window.parent.FEEDBAR.getSelectedIndex();
		
		if (idx < 0) {
			FEEDSIDEBAR.showPreview();
		}
		else {
			window.parent.FEEDBAR.previewTimeout = setTimeout(FEEDSIDEBAR.showPreview, 450, idx);
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

			FEEDSIDEBAR.restorePreviewPane();
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
}