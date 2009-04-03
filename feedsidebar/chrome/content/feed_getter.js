var FEED_GETTER = {
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	
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
	
	sidebarIsOpen : function () {
		var sidebar = document.getElementById("sidebar-box");
		
		if (!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar'){
			return true;
		}
		
		return false;
	},
	
	ta : null,
	
	prefs : null,
	missedUpdate : false,
	
	newItemCountPre : 0,
	
	loadTimer : null,
	feedData : { },
	currentRequest : null,
	
	consecutiveFailures : 0,
	
	init : function () {
		FEED_GETTER.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		FEED_GETTER.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		FEED_GETTER.prefs.addObserver("", FEED_GETTER, false);
		
		FEED_GETTER.ta = document.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
		
		FEED_GETTER.startFetchingFeeds();
	},
	
	unload : function () {
		FEED_GETTER.killCurrentRequest();
		FEED_GETTER.prefs.removeObserver("", FEED_GETTER);
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "updateFrequency":
				if (FEED_GETTER.prefs.getIntPref("updateFrequency") < 1) {
					FEED_GETTER.prefs.setIntPref("updateFrequency", 0);
				}
				
				FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
			break;
		}
	},
	
	feedUpdateTimeout : null,
	statusTextTimeout : null,
	feedsToFetch : [],
	feedIndex : 0,
	secondsBetweenFeeds : 1,
	
	startFetchingFeeds : function () {
	    FEED_GETTER.feedsToFetch = [];
	    FEED_GETTER.feedIndex = 0;
	    
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"].getService(Components.interfaces.nsILivemarkService);
		var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
		var anno = Components.classes["@mozilla.org/browser/annotation-service;1"].getService(Components.interfaces.nsIAnnotationService);
		var livemarkIds = anno.getItemsWithAnnotation("livemark/feedURI", {});

		for (var i = 0; i < livemarkIds.length; i++){
			var feedURL = livemarkService.getFeedURI(livemarkIds[i]).spec;
			var feedName = bookmarkService.getItemTitle(livemarkIds[i]);
			FEED_GETTER.feedsToFetch.push({ name : feedName, feed : feedURL });
			FEED_GETTER.feedData[feedURL.toLowerCase()] = { name : feedName, bookmarkId : livemarkIds[i], uri : feedURL };
		}
		
		if (FEED_GETTER.feedsToFetch.length == 0) {
		    FEED_GETTER.notifyNoFeeds();
		}
		
		setTimeout(function () {
		    FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
		}, 5000);
    },
    
    removeAFeed : function (livemarkId) {
        for (feedURL in FEED_GETTER.feedData) {
            var feed = FEED_GETTER.feedData[feedURL];
            
            if (feed.bookmarkId == livemarkId) {
                delete FEED_GETTER.feedData[feedURL];
                
                for (var i = 0; i < FEED_GETTER.feedsToFetch.length; i++) {
                    if (FEED_GETTER.feedsToFetch[i].feed == feedURL) {
                        FEED_GETTER.feedsToFetch.splice(i, 1);
                        return true;
                    }
                }
                
                break;
            }
        }
        
        return false;
    },
	
	rapidUpdate : 0,
	
	clearStatusText : function () {
	    var win = FEED_GETTER.feedWindow;
        
        if (win) {
    	    var statusText = win.document.getElementById("feedbar-loading-text")
    	    statusText.setAttribute("value", "");
    	    statusText.setAttribute("tooltiptext", "");
    	    statusText.setAttribute("url", "");
    	}
    },
	
    updateAFeed : function (indexOverride) {
        function setTimeoutForNext() {
            if (FEED_GETTER.rapidUpdate) {
                var interval = 0.5;
            }
            else {
                if (FEED_GETTER.secondsBetweenFeeds == 0) {
                    var interval = 60;
                    
                    FEED_GETTER.clearStatusText();
                }
                else {
                    var interval = FEED_GETTER.secondsBetweenFeeds;
                }
            }
            
		    FEED_GETTER.feedUpdateTimeout = setTimeout(function () { FEED_GETTER.updateAFeed(); }, interval * 1000);
	    }
		
        clearTimeout(FEED_GETTER.feedUpdateTimeout);
        clearTimeout(FEED_GETTER.statusTextTimeout);
        
        var win = FEED_GETTER.feedWindow;
        
        if (!navigator.onLine || 
            FEED_GETTER.feedsToFetch.length == 0 ||
            (!FEED_GETTER.rapidUpdate && FEED_GETTER.secondsBetweenFeeds == 0) ||
            (FEED_GETTER.prefs.getBoolPref("runInSidebar") && !FEED_GETTER.sidebarIsOpen())
            ){
            
    		if (win && win.FEEDSIDEBAR) {
    		    FEED_GETTER.clearStatusText();
    		    
                if (!navigator.onLine) {
        		    statusText.setAttribute("value", "Offline.");
                }
        	}
        	
		    setTimeoutForNext();
		    return;
		}
		
		if (FEED_GETTER.rapidUpdate) {
		    FEED_GETTER.rapidUpdate--;
		    
		    if (!FEED_GETTER.rapidUpdate) {
                FEED_GETTER.stopUpdate();
	        }
		}
		
        if (FEED_GETTER.feedIndex >= FEED_GETTER.feedsToFetch.length) {
            FEED_GETTER.feedIndex = 0;
        }
                
        FEED_GETTER.newItemCountPre = FEEDBAR.numUnreadItems();
        
        var feedIndex = FEED_GETTER.feedIndex;
        
        if (indexOverride) {
            feedIndex = indexOverride;
        }
        else {
            ++FEED_GETTER.feedIndex;
        }
        
        if (feedIndex == 0) {
            this.prefs.setIntPref("lastUpdate", Math.round(new Date().getTime() / 1000));
        }
        
        var feed = FEED_GETTER.feedsToFetch[feedIndex];
        
	    var url = feed.feed;
		
		if (win && win.FEEDSIDEBAR) {
		    var statusText = win.document.getElementById("feedbar-loading-text");
		    statusText.setAttribute("value", "Updating "+(feedIndex+1)+" of "+FEED_GETTER.feedsToFetch.length+" (" + feed.name + ")...");
            statusText.setAttribute("tooltiptext", url);
		    statusText.setAttribute("url", url);
	    }
		
		var req = new XMLHttpRequest();
		FEED_GETTER.currentRequest = req;
		
		try {
			req.open("GET", url, true);
			
			req.onreadystatechange = function (event) {
				if (req.readyState == 4) {
					clearTimeout(FEED_GETTER.loadTimer);
					FEED_GETTER.statusTextTimeout = setTimeout(function () { FEED_GETTER.clearStatusText(); }, 5000);
					
					FEED_GETTER.currentRequest = null;
					setTimeoutForNext();
					
					try {
						if (req.status == 200){
							FEED_GETTER.consecutiveFailures = 0;
							
							var feedOb = null;
							
							try {
								// Trim it.
								FEED_GETTER.queueForParsing(req.responseText.replace(/^\s\s*/, '').replace(/\s\s*$/, ''), url);
							} catch (e) {
								// Parse error
								FEED_GETTER.addError(feed.name, url, e.message, 5);
							}
						}
						else {
							++FEED_GETTER.consecutiveFailures;
						}
					}
					catch (e) {
						++FEED_GETTER.consecutiveFailures;
						
						if (e.name == "NS_ERROR_NOT_AVAILABLE"){
							FEED_GETTER.addError(feed.name, url, FEED_GETTER.strings.getString("feedbar.errors.unavailable"), 3);
						}
					}
				}
			};
			
			req.send(null);
			FEED_GETTER.loadTimer = setTimeout(FEED_GETTER.killCurrentRequest, 1000 * 15);
		}
		catch (e) {
			FEED_GETTER.addError(feed.name, url, e.name, 3);
			setTimeoutForNext();
		}
    },
	
	sidebarPing : function () {
//	    if (this.prefs.getBoolPref("runInSidebar")) {
  //  	    FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
    //    }
    
	    if (FEED_GETTER.rapidUpdate) {
    	    var win = FEED_GETTER.feedWindow;
	
    		if (win && win.FEEDSIDEBAR) {
    			win.document.getElementById("stop-button").setAttribute("disabled","false");
    			win.document.getElementById("reload-button").setAttribute("disabled","true");
    		}
    	}
	},
	
	sidebarPung : function () {
		if (FEED_GETTER.prefs.getBoolPref("runInSidebar")) {
			FEED_GETTER.stopUpdate();
		}
	},
	
	updateAllFeeds : function () {
	    FEED_GETTER.rapidUpdate = FEED_GETTER.feedsToFetch.length;
	    FEED_GETTER.updateAFeed();
	    
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.document.getElementById("stop-button").setAttribute("disabled","false");
			win.document.getElementById("reload-button").setAttribute("disabled","true");
		}
    },
    
	updateSingleFeed : function (livemarkId) {
		var livemarkService = Components.classes["@mozilla.org/browser/livemark-service;2"]
								.getService(Components.interfaces.nsILivemarkService);
		var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
		var feedURL = livemarkService.getFeedURI(livemarkId).spec;
		var feedName = bookmarkService.getItemTitle(livemarkId);
		
		FEED_GETTER.feedsToFetch.push({ name : feedName, feed : feedURL });
		FEED_GETTER.feedData[feedURL.toLowerCase()] = { name : feedName, bookmarkId : livemarkId, uri : feedURL };

	    FEED_GETTER.updateAFeed(FEED_GETTER.feedsToFetch.length - 1);
	},
	
	stopUpdate : function () {
		// If the interval is set to 1 second right now, reset that.
		FEED_GETTER.rapidUpdate = 0;
		
		FEED_GETTER.killCurrentRequest();
		
		var win = FEED_GETTER.feedWindow;
		
		if (win && win.FEEDSIDEBAR) {
			win.document.getElementById("stop-button").setAttribute("disabled","true");
			win.document.getElementById("reload-button").setAttribute("disabled","false");
		}
	},
	
	searchTimeout : null,
	
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
    	clearTimeout(FEED_GETTER.feedUpdateTimeout);
    	
    	var numFeeds = FEED_GETTER.feedsToFetch.length;
		var interval = minutes;
		
		if (numFeeds == 0) {
		    numFeeds = interval;
		}
		
		FEED_GETTER.secondsBetweenFeeds = Math.ceil((interval * 60) / numFeeds);
        
        // Check if it's been more than $minutes minutes since the last full update.
	    var lastUpdate = this.prefs.getIntPref("lastUpdate") * 1000; 
	    var now = new Date().getTime();
	    
	    var minutesSince = (now - lastUpdate) / 1000 / 60;
	    
	    if ((minutes != 0) && (minutesSince > minutes)) {
	        FEED_GETTER.updateAllFeeds();
        }
        else {
    	    FEED_GETTER.updateAFeed();
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

	online : function () {
	    FEED_GETTER.setReloadInterval(FEED_GETTER.prefs.getIntPref("updateFrequency"));
	},

	offline : function () {
		FEED_GETTER.stopUpdate();
	},
	
	killCurrentRequest : function () {
		try { FEED_GETTER.currentRequest.abort(); } catch (noCurrentRequest) { }
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
	},

	growl : function (title, text, image) {
		if (FEED_GETTER.prefs.getBoolPref("runInSidebar") && !FEED_GETTER.sidebarIsOpen()) {
			return;
		}
		
		var listener = {
			observe : function (subject, topic, data) {
				// Subject is null
				if (topic == "alertclickcallback") {
					window.focus();
					
					var sidebar = document.getElementById("sidebar-box");
					
					if (!(!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar')){
						toggleSidebar('feedbar');
					}
				}
			}
		};
		
        try {
            if (!image) image = "chrome://feedbar/skin/icons/notify-icon.png";

            var alertsService = Components.classes["@mozilla.org/alerts-service;1"]
                .getService(Components.interfaces.nsIAlertsService);
            alertsService.showAlertNotification(
                image, 
                title,
                text,
                true, 
                "", 
				listener);
        } catch (notAvailable) { }
    }
};

function FeedbarParseListener() {
	return this;
}

FeedbarParseListener.prototype = {
	handleResult: function(result) {
		var resolvedUri = result.uri.resolve("");
		var feedDataKey = resolvedUri.toLowerCase();
		
		if (result.bozo) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.parseError"), 5);
			return;
		}
		
		var feed = result.doc;
		
		if (!feed) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.invalidUrl"), 5);
			return;
		}
		
		try {
			feed.QueryInterface(Components.interfaces.nsIFeed);
		} catch (e) {
			FEED_GETTER.addError(FEED_GETTER.feedData[feedDataKey].name, resolvedUri, FEED_GETTER.strings.getString("feedbar.errors.invalidFeed"), 5);
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
		
		feedObject.id = resolvedUri;
		feedObject.uri = resolvedUri;
		
		feedObject.livemarkId = FEED_GETTER.feedData[feedObject.uri.toLowerCase()].bookmarkId;
		
		try {
			feedObject.siteUri = feed.link.resolve("");
		} catch (e) {
			feedObject.siteUri = feedObject.uri;
		}
		
		try {
			feedObject.label = FEED_GETTER.feedData[feedDataKey].name;
		} catch (e) {
			feedObject.label = feed.title.plainText();
		}
		
		if (!feedObject.label) {
			feedObject.label = feed.title.plainText();
		}
		
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
					var q = itemObject.uri.indexOf("?");
					itemObject.uri = itemObject.uri.match(/url=(https?:\/\/.*)$/i)[1];
					itemObject.uri = decodeURIComponent(itemObject.uri.split("&")[0]);
//					itemObject.uri = itemObject.uri.substring(0, q) + ("&" + itemObject.uri.substring(q)).replace(/&(ct|cid|ei)=[^&]*/g, "").substring(1);
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
				
				if (!itemObject.published) {
					itemObject.published = new Date();
				}
				
				if (item.title) {
					itemObject.label = FEED_GETTER.decodeEntities(item.title.plainText());
				}
				else {
					itemObject.label = item.updated;
				}
				
				itemObject.label = itemObject.label.replace(/\s+/, " ");
				
				if (item.summary && item.summary.text) {
					itemObject.description = item.summary.text;
				}
				else if (item.content && item.content.text) {
					itemObject.description = item.content.text;
				}
				else {
					itemObject.description = FEED_GETTER.strings.getString("feedbar.noSummary");
				}
				
				if (item.enclosures && item.enclosures.length > 0) {
					var len = item.enclosures.length;
					var imgs = "";
					for (var j = 0; j < len; j++) {
						var enc = item.enclosures.queryElementAt(j, Components.interfaces.nsIWritablePropertyBag2);
						
						if (enc.hasKey("type") && enc.get("type").indexOf("image") != 0) {
							imgs += '<br /><a href="' + enc.get("url") + '">'+FEED_GETTER.strings.getString("feedbar.download")+'</a>';
						}
						else if (enc.hasKey("url")) {
							imgs += '<br /><img src="' + enc.get("url") + '" />';
						}
					}
					
					itemObject.description = itemObject.description + imgs;
				}
				
				itemObject.description = itemObject.description.replace(/<script[^>]*>[\s\S]+<\/script>/gim, "");
				
				itemObject.visited = FEED_GETTER.history.isVisitedURL(itemObject.uri, itemObject.id);
				
				feedObject.items.push(itemObject);
				
			} catch (e) {
				// FEED_GETTER.addError(FEED_GETTER.feedData[feedObject.link].name, feedObject.link, e, 5);
				// Don't show a notification here, since they can become legion.
				logFeedbarMsg(e);
			}
		}
		
		delete result;
		
		FEEDBAR.push(feedObject);
		
		delete feedObject;
		
		var unread = FEEDBAR.numUnreadItems();
		
		if (unread > FEED_GETTER.newItemCountPre) {
			if (FEED_GETTER.prefs.getBoolPref("notify")) {
			    var newItems = unread - FEED_GETTER.newItemCountPre;
			    
			    if (newItems == 1) {
					var titleString = feedObject.label;
					var bodyString = feedObject.items[0].label;
//					var bodyString = FEED_GETTER.strings.getString("feedbar.newItemBody");
				}
				else {
					var titleString = feedObject.label;
					var bodyString = FEED_GETTER.strings.getFormattedString("feedbar.newItemsBody", [ newItems ]);
				}
					
				FEED_GETTER.growl(titleString, bodyString, feedObject.image);
			}
	    }
		
		return;
	}
};

function logFeedbarMsg(m) {
	var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
	consoleService.logStringMessage("FEEDBAR: " + m);
}