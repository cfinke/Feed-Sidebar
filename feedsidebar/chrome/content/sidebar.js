var FEEDSIDEBAR = {
	get progressText() { return document.getElementById("feedbar-loading-text"); },
	get previewPane() { return document.getElementById("feedbar-preview"); },
	get nextUpdateDisplay() { return document.getElementById("feedbar-nextupdate-text"); },
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	get displayPeriod() { return FEEDSIDEBAR.prefs.getIntPref("displayPeriod"); },
	
	prefs : null,
	
	init : function () {
		FEEDSIDEBAR.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		
		document.getElementById("feed_tree").view = window.parent.FEEDBAR;
		
		// window.parent.FEED_GETTER.updateLoadProgress(0,0);
		FEEDSIDEBAR.checkFrequencyItem(FEEDSIDEBAR.prefs.getIntPref("updateFrequency"));
		FEEDSIDEBAR.checkPeriodItem(FEEDSIDEBAR.prefs.getIntPref("displayPeriod"));	
		document.getElementById("search-box").value = FEEDSIDEBAR.prefs.getCharPref("filter");
		
		window.parent.FEED_GETTER.sidebarPing();
	},
	
	unload : function () {
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

	updateLoadProgress : function (done, total, nextUpdateTime) {
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
							case 'copyTitle':
							case 'copyLink':
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
							case 'copyTitle':
							case 'copyLink':
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
						case 'copyTitle':
						case 'copyLink':
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
		FEEDSIDEBAR.showPreview(idx);
	},
	
	hidePreview : function () {
		document.getElementById("feedbar-preview").hidden = true;
		document.getElementById("preview-splitter").hidden = true;
	},
	
	restorePreviewPane : function () {
		document.getElementById("feedbar-preview").hidden = false;
		document.getElementById("preview-splitter").hidden = false;
	},
	
	showPreview : function (idx) {
		var tt = FEEDSIDEBAR.previewPane;
		
		if ((idx < 0)) {
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
		alert(FEEDSIDEBAR.strings.getString("feedbar.errors.noFeedsFoundMore"));
	},
	
	clearNotify : function () {
		document.getElementById("sidebar-notify").removeAllNotifications();
	}
};