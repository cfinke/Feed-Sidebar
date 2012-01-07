var FEATURED_FEEDS = {
	"apiUrl" : "http://www.chrisfinke.com/files/updaters/featured-feeds.json",
	
	loadStack : 0,
	
	load : function () {
		FEATURED_FEEDS.loadStack++;
		
		if (FEATURED_FEEDS.loadStack == 1) {
			FEATURED_FEEDS.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
			FEATURED_FEEDS.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
			FEATURED_FEEDS.prefs.addObserver("", FEATURED_FEEDS, false);
			
			var feeds = FEATURED_FEEDS.prefs.getCharPref("featuredFeeds");
			
			if (!feeds) {
				var lastAttempt = FEATURED_FEEDS.prefs.getCharPref("featuredFeeds.lastUpdate");
				
				if (lastAttempt < (new Date().getTime() - (1000 * 60 * 60 * 24 * 3))) {
					FEATURED_FEEDS.prefs.setCharPref("featuredFeeds.lastUpdate", (new Date().getTime()));
					
					// Get feeds.
					FEATURED_FEEDS.fetchTimer = FEATURED_FEEDS.setTimeout(FEATURED_FEEDS.fetchFeaturedFeeds, 15000);
				}
			}
		}
	},
	
	unload : function () {
		FEATURED_FEEDS.loadStack--;
		
		if (FEATURED_FEEDS.loadStack == 0) {
			FEATURED_FEEDS.prefs.removeObserver("", FEATURED_FEEDS);
			FEATURED_FEEDS.clearTimeout(FEATURED_FEEDS.fetchTimer);
		}
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "featuredFeeds":
				FEATURED_FEEDS.prefs.setBoolPref("featuredFeeds.new", true);
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
	
	fetchTimer : null,
	
	fetchFeaturedFeeds : function () {
		var req = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Components.interfaces.nsIXMLHttpRequest);
		req.open("GET", FEATURED_FEEDS.apiUrl, "true");
		
		req.onreadystatechange = function () {
			if (req.readyState == 4) {
				var text = req.responseText;
				
				var json = JSON.parse(text);
				
				for (var i = 0; i < json.length; i++) {
					var url = json[i].url;
					var siteUrl = json[i].siteUrl;
					
					if (url.indexOf("?") != -1) {
						url += "&app=feed-sidebar";
					}
					else {
						url += "?app=feed-sidebar";
					}
					
					if (siteUrl.indexOf("?") != -1) {
						siteUrl += "&app=feed-sidebar";
					}
					else {
						siteUrl += "?app=feed-sidebar";
					}
					
					json[i].url = url;
					json[i].siteUrl = siteUrl;
				}
				
				FEATURED_FEEDS.prefs.setCharPref("featuredFeeds", JSON.stringify(json));
			}
		};
		
		req.send(null);
	},
	
	log : function (m) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("FEEDBAR: " + m);
	}
};

var EXPORTED_SYMBOLS = ["FEATURED_FEEDS"];