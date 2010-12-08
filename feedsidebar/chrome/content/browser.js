var FEEDBAR_BROWSER = {
	prefs : Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar."),
	
	load : function () {
		removeEventListener("load", FEEDBAR_BROWSER.load, false);
		
		if (FEEDBAR_BROWSER.prefs.getCharPref("lastVersion") == "") {
			// Add the toolbar button.
	
			var buttonId = "feedbar-button";
	
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

				// Order of adding:
					// before urlbar-container
					// after home-button
					// after reload-button
					// after stop-button
					// after forward-button
					// before search-container
					// at the end

				if (getIndex(setItems, "urlbar-container") != -1){
					newSet = currentSet.replace("urlbar-container",buttonId+",urlbar-container");
				}
				else if (getIndex(setItems, "home-button") != -1){
					newSet = currentSet.replace("home-button","home-button,"+buttonId);
				}
				else if (getIndex(setItems, "reload-button") != -1){
					newSet = currentSet.replace("reload-button","reload-button,"+buttonId);
				}
				else if (getIndex(setItems, "stop-button") != -1){
					newSet = currentSet.replace("stop-button","stop-button,"+buttonId);
				}
				else if (getIndex(setItems, "forward-button") != -1){
					newSet = currentSet.replace("forward-button","forward-button,"+buttonId);
				}
				else if (getIndex(setItems, "search-container") != -1){
					newSet = currentSet.replace("search-container",buttonId+",search-container");
				}
				else {
					newSet = toolbar.currentSet + ","+buttonId;
				}

				toolbar.currentSet = newSet;
				toolbar.setAttribute("currentset",newSet);

				toolboxDocument.persist(toolbar.id, "currentset");

				try {
					BrowserToolboxCustomizeDone(true);
				} catch (e) { }
			}

			// Open the sidebar.
			toggleSidebar('feedbar');
			FEEDBAR_BROWSER.prefs.setCharPref("lastVersion", "firstrun");
		}
		
		setTimeout(FEEDBAR_BROWSER.showFirstRun, 1500);
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
