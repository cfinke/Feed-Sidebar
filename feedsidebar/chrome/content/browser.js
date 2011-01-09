var FEEDBAR_BROWSER = {
	prefs : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar."),
	
	load : function () {
		removeEventListener("load", FEEDBAR_BROWSER.load, false);
		
		if (FEEDBAR_BROWSER.prefs.getCharPref("lastVersion") == "") {
			// Add the toolbar button.
	
			var buttonId = "feedbar-button";
		
			FEEDBAR_BROWSER.addToolbarButton("feedbar-button", [ "urlbar-container:before", "home-button", "reload-button", "stop-button", "forward-button", "search-container:before" ]);

			// Open the sidebar.
			toggleSidebar('feedbar');
			FEEDBAR_BROWSER.prefs.setCharPref("lastVersion", "firstrun");
		}
		
		if (!FEEDBAR_BROWSER.prefs.getBoolPref("subscribeIconCheck")) {
			FEEDBAR_BROWSER.prefs.setBoolPref("subscribeIconCheck", true);
			
			FEEDBAR_BROWSER.addToolbarButton("feed-button", [ "urlbar-container", "search-container:before", "home-button", "reload-button", "stop-button", "forward-button" ]);
		}
		
		setTimeout(FEEDBAR_BROWSER.showFirstRun, 1500);
	},
	
	addToolbarButton : function (buttonId, locationPreferences) {
		// Add the subscribe toolbar button, as Firefox 4 removes it.

		if (!document.getElementById(buttonId)){
			// Determine which toolbar to place the icon onto
			if (document.getElementById("nav-bar").getAttribute("collapsed") != "true"){
				var toolbar = document.getElementById("nav-bar");
			}
			else {
				var toolbar = document.getElementById("toolbar-menubar");
			}

			var currentSet = toolbar.currentSet;
			var newSet = currentSet;
			var setItems = currentSet.split(',');

			var toolbox = document.getElementById("navigator-toolbox");
			var toolboxDocument = toolbox.ownerDocument;

			function getIndex(array, val){
				for (var i = 0; i < array.length; i++){
					if (array[i] == val) {
						return i;
					}
				}

				return -1;
			}
			
			var added = false;
			
			for (var i = 0, _len = locationPreferences.length; i < _len; i++) {
				var before = false;
				var item = locationPreferences[i];
				
				if (item.indexOf(":before") != -1) {
					item = item.replace(":before", "");
					before = true;
				}
				
				if (getIndex(setItems, item) != -1) {
					if (before) {
						newSet = currentSet.replace(item, buttonId + "," + item);
					}
					else {
						newSet = currentSet.replace(item, item + "," + buttonId);
					}
					
					added = true;
					break;
				}
			}
			
			if (!added) {
				newSet = toolbar.currentSet + ","+buttonId;
			}

			toolbar.currentSet = newSet;
			toolbar.setAttribute("currentset",newSet);

			toolboxDocument.persist(toolbar.id, "currentset");

			try {
				BrowserToolboxCustomizeDone(true);
			} catch (e) { }
		}
	},
	
	getVersion : function (callback) {
		var addonId = "feedbar@efinke.com";
		
		if ("@mozilla.org/extensions/manager;1" in Components.classes) {
			// < Firefox 4
			var version = Components.classes["@mozilla.org/extensions/manager;1"]
				.getService(Components.interfaces.nsIExtensionManager).getItemForID(addonId).version;
			
			callback(version);
		}
		else {
			// Firefox 4.
			Components.utils.import("resource://gre/modules/AddonManager.jsm");  
			
			AddonManager.getAddonByID(addonId, function (addon) {
				callback(addon.version);
			});
		}
	},
	
	showFirstRun : function () {
		function isMajorUpdate(version1, version2) {
			if (!version1) {
				return true;
			}
			else {
				// Not showing firstrun on updates for now.
				return false;
				
				var oldParts = version1.split(".");
				var newParts = version2.split(".");
		
				if (newParts[0] != oldParts[0] || newParts[1] != oldParts[1]) {
					return true;
				}
			}
			
			return false;
		}
		
		function doShowFirstRun(version) {
			if (isMajorUpdate(FEEDBAR_BROWSER.prefs.getCharPref("lastVersion"), version)) {
				var theTab = gBrowser.addTab("http://www.chrisfinke.com/firstrun/feed-sidebar.php?v="+version);
				gBrowser.selectedTab = theTab;
			}
			
			FEEDBAR_BROWSER.prefs.setCharPref("lastVersion", version);
		}
		
		FEEDBAR_BROWSER.getVersion(doShowFirstRun);
	}
};
