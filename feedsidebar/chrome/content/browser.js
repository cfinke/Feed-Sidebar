var FEEDBAR_BROWSER = {
	prefs : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar."),
	
	load : function () {
		removeEventListener("load", FEEDBAR_BROWSER.load, false);
		
		if (FEEDBAR_BROWSER.prefs.getCharPref("lastVersion") == "") {
			// Add the toolbar button.
	
			var buttonId = "feedbar-button";

			if (!FEEDBAR_BROWSER.prefs.getBoolPref("subscribeIconCheck")) {
				FEEDBAR_BROWSER.prefs.setBoolPref("subscribeIconCheck", true);

				FEEDBAR_BROWSER.addToolbarButton("feed-button");
			}

			FEEDBAR_BROWSER.addToolbarButton("feedbar-button");

			// Open the sidebar.
			toggleSidebar('feedbar');
			FEEDBAR_BROWSER.prefs.setCharPref("lastVersion", "firstrun");
		}
		
		
		setTimeout(FEEDBAR_BROWSER.showFirstRun, 1500);
	},
	
	addToolbarButton : function (buttonId) {
		if (!document.getElementById(buttonId)){
			// Determine which toolbar to place the icon onto
			if (document.getElementById("nav-bar").getAttribute("collapsed") != "true"){
				var toolbar = document.getElementById("nav-bar");
			}
			else {
				var toolbar = document.getElementById("toolbar-menubar");
			}

			var newSet = toolbar.currentSet + "," + buttonId;
			toolbar.currentSet = newSet;
			toolbar.setAttribute("currentset",newSet);

			document.getElementById("navigator-toolbox").ownerDocument.persist(toolbar.id, "currentset");

			try {
				BrowserToolboxCustomizeDone(true);
			} catch (e) { }
		}
	},
	
	getVersion : function (callback) {
		var addonId = "feedbar@efinke.com";
		
		Components.utils.import("resource://gre/modules/AddonManager.jsm");  
		
		AddonManager.getAddonByID(addonId, function (addon) {
			callback(addon.version);
		});
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
