var FEEDBAR = {
	strings : {
		_backup : null,
		_main : null,
		
		initStrings : function () {
			if (!this._backup) { this._backup = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://feedbar-default-locale/locale/locale.properties"); }
			if (!this._main) { this._main = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService).createBundle("chrome://feedbar/locale/locale.properties"); }
		},
		
		getString : function (key) {
			this.initStrings();
			
			var rv = "";
			
			try {
				rv = this._main.GetStringFromName(key);
			} catch (e) {
			}
			
			if (!rv) {
				try {
					rv = this._backup.GetStringFromName(key);
				} catch (e) {
				}
			}
			
			return rv;
		},
		
		getFormattedString : function (key, args) {
			this.initStrings();
			
			var rv = "";
			
			try {
				rv = this._main.formatStringFromName(key, args, args.length);
			} catch (e) {
			}
			
			if (!rv) {
				try {
					rv = this._backup.formatStringFromName(key, args, args.length);
				} catch (e) {
				}
			}
			
			return rv;
		}
	},
	
	get feedWindows() { 
		var sidebars = [];
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		
		var enumerator = wm.getEnumerator("navigator:browser");
		
		while (enumerator.hasMoreElements()) {
			var win = enumerator.getNext();
			
			try {
				var sidebar = win.document.getElementById("sidebar-box");
			
				if (!sidebar.getAttribute("hidden") && sidebar.getAttribute("sidebarcommand") == 'feedbar'){
					sidebars.push(win.document.getElementById("sidebar").contentWindow);
				}
			} catch (e) {
				FEEDBAR.log("ERROR IN get feedWindow: " + e);
			}
		}
		
		return sidebars;
	},
	
	get windows() {
		var windows = [];
		
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		
		var enumerator = wm.getEnumerator("navigator:browser");
		
		while (enumerator.hasMoreElements()) {
			windows.push(enumerator.getNext());
		}
		
		return windows;
	},
	
	get window() {
		var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
		                   .getService(Components.interfaces.nsIWindowMediator);
		return wm.getMostRecentWindow("navigator:browser");
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
	
	beginTime : [],
	
	/**
	 * Functions required for implementation of tree view methods
	 */
	
	openStates : {},
	
	treeBox : null,
	setTree : function (treeBox) { FEEDBAR.treeBox = treeBox; },
	
	selection : null,
	
	childData : { },
	visibleData : [],
	get rowCount() { return FEEDBAR.visibleData.length; },
	
	getCellText : function (idx, col, hideCount) {
		var cell = FEEDBAR.visibleData[idx];
		
		var label = cell.label;
		
		if (FEEDBAR.isContainer(idx) && !FEEDBAR.isContainerOpen(idx) && !hideCount && cell.numUnread) {
			label += " (" + cell.numUnread + ")";
		}
		
		return label;
	},
	
	getCellDescription : function (idx) {
		return FEEDBAR.visibleData[idx].description;
	},
	
	getCellLink : function (idx) {
		if (FEEDBAR.isContainer(idx)) {
			return FEEDBAR.visibleData[idx].siteUri;
		}
		else {
			return FEEDBAR.visibleData[idx].uri;
		}
	},
	
	getCellFeedLink : function (idx) {
		if (FEEDBAR.isContainer(idx)) {
			return FEEDBAR.visibleData[idx].uri;
		}
		else {
			var feedIdx = FEEDBAR.getParentIndex(idx);
			return FEEDBAR.getCellFeedLink(feedIdx);
		}
	},
	
	getCellLivemarkId : function (idx) {
		return FEEDBAR.visibleData[idx].livemarkId;
	},
	
	getCellID : function (idx) {
		return FEEDBAR.visibleData[idx].id;
	},
	
	isContainer : function(idx) {
		return FEEDBAR.visibleData[idx].isContainer;
	},
	
	isContainerOpen : function (idx) {
		try {
			return FEEDBAR.visibleData[idx].isOpen;
		} catch (e) {
			return false;
		}
	},
	
	isContainerEmpty : function (idx) {
		return false;
	},
	
	isSeparator : function (idx){
		return false;
	},
	
	isSorted : function(){
		return false;
	},
	
	isEditable : function (idx, column) {
		return false;
	},
	
	getParentIndex : function (idx) {
		if (FEEDBAR.isContainer(idx)) return -1;
		
		for (var t = idx - 1; t >= 0; t--) {
			if (FEEDBAR.isContainer(t)) return t;
		}
	},
	
	getNextSiblingIndex : function (idx) {
		var thisLevel = FEEDBAR.getLevel(idx);
		
		for (var t = idx + 1; t < FEEDBAR.visibleData.length; t++) {
			var nextLevel = FEEDBAR.getLevel(t);
			if (nextLevel == thisLevel) return t;
			else if (nextLevel < thisLevel) return -1;
		}
		
		return -1;
	},
	
	getLevel: function (idx) {
		if (FEEDBAR.isContainer(idx)) return 0;
		else return 1;
	},
	
	hasNextSibling : function (idx) {
		var thisLevel = FEEDBAR.getLevel(idx);
		
		for (var t = idx + 1; t < FEEDBAR.visibleData.length; t++) {
			var nextLevel = FEEDBAR.getLevel(t);
			if (nextLevel == thisLevel) return true;
			else if (nextLevel < thisLevel) return false;
		}
	},
	
	hasVisibleItems : function (idx) {
		var key = FEEDBAR.visibleData[idx].id;
		var feedName = FEEDBAR.getCellText(idx);
		var toInsert = FEEDBAR.childData[key].items;
		var itemsInserted = 0;
		
		var displayPeriod = FEEDBAR.prefs.getIntPref("displayPeriod");
		var showReadItems = !FEEDBAR.prefs.getBoolPref("hideReadItems");
		
		if (displayPeriod > 0) {
			var mustBeAfter = (new Date()).getTime() - (displayPeriod * 24 * 60 * 60 * 1000);
		}
		
		for (var i = 0; i < toInsert.length; i++){
			if (!showReadItems && toInsert[i].visited) {
				continue;
			}
			
			if ((displayPeriod > 0) && (toInsert[i].published < mustBeAfter)) {
				continue;
			}
			
			if (!FEEDBAR.passesFilter(feedName + " " + toInsert[i].label + " " + toInsert[i].description)) {
				continue;
			}
			
			return true;
		}
		
		return false;
	},
	
	numUnreadItems : function (idx) {
		var num = 0;
		var len = FEEDBAR.visibleData.length;
		
		if (typeof idx == 'undefined') {
			for (var idx = 0; idx < len; idx++) {
				if (!FEEDBAR.isContainer(idx) && !FEEDBAR.getCellRead(idx)) {
					++num;
				}
			}
		}
		else {
			++idx;
			
			while (idx < len && !FEEDBAR.isContainer(idx) && !FEEDBAR.getCellRead(idx)) {
				++num;
				++idx;
			}
		}
		
		return num;
	},

	hasReadItems : function (idx) {
		if (typeof idx == 'undefined') {
			var len = FEEDBAR.visibleData.length;
			
			for (var idx = 0; idx < len; idx++) {
				if (!FEEDBAR.isContainer(idx) && FEEDBAR.getCellRead(idx)) {
					return true;
				}
			}
			
			return false;
		}
		else {
			var len = FEEDBAR.visibleData.length;
			++idx;
			
			while (idx < len && !FEEDBAR.isContainer(idx)) {
				if (FEEDBAR.getCellRead(idx)) {
					return true;
				}
				++idx;
			}
			
			return false;
		}
	},

	hasUnreadItems : function (idx) {
		if (typeof idx == 'undefined') {
			var len = FEEDBAR.visibleData.length;
			
			for (var idx = 0; idx < len; idx++) {
				if (!FEEDBAR.isContainer(idx) && !FEEDBAR.getCellRead(idx)) {
					return true;
				}
			}
			
			return false;
		}
		
		var key = FEEDBAR.visibleData[idx].id;
		var feedName = FEEDBAR.getCellText(idx);
		var toInsert = FEEDBAR.childData[key].items;
		var itemsInserted = 0;
		
		var displayPeriod = FEEDBAR.prefs.getIntPref("displayPeriod");
		var showReadItems = !FEEDBAR.prefs.getBoolPref("hideReadItems");
		
		if (displayPeriod > 0) {
			var mustBeAfter = (new Date()).getTime() - (displayPeriod * 24 * 60 * 60 * 1000);
		}
		
		for (var i = 0; i < toInsert.length; i++){
			if ((displayPeriod > 0) && (toInsert[i].published < mustBeAfter)) {
				continue;
			}
			
			if (!FEEDBAR.passesFilter(feedName + " " + toInsert[i].label + toInsert[i].description)) {
				continue;
			}
			
			if (toInsert[i].visited) {
				continue;
			}
			
			return true;
		}
		
		return false;
	},
	
	toggleOpenState : function (idx) {
		var item = FEEDBAR.visibleData[idx];
		var itemStillExists = true;
		
		if (!item.isContainer) return;
		
		if (item.isOpen) {
			// Container is open, we need to close it.
			item.isOpen = false;
			
			var thisLevel = 0;
			var deleteCount = 0;
			
			for (var t = idx + 1; t < FEEDBAR.visibleData.length; t++){
				if (FEEDBAR.getLevel(t) > thisLevel) {
					deleteCount++;
				}
				else {
					break;
				}
			}
			
			if (deleteCount) {
				FEEDBAR.visibleData.splice(idx + 1, deleteCount);
				try { FEEDBAR.treeBox.rowCountChanged(idx + 1, -deleteCount); } catch (sidebarNotOpen) { }
			}
		}
		else {
			item.isOpen = true;
			
			var key = FEEDBAR.visibleData[idx].id;
			var feedName = FEEDBAR.getCellText(idx);
			var toInsert = FEEDBAR.childData[key].items;
			var itemsInserted = 0;
			
			// Optimize: if changing the display period to be *more* restrictive, we don't need to
			// collapse and expand each feed, we can just weed out the items that don't meet the criteria.
			
			// Optimize: ^ The same with the search filter.
			
			var displayPeriod = FEEDBAR.prefs.getIntPref("displayPeriod");
			var showReadItems = !FEEDBAR.prefs.getBoolPref("hideReadItems");
			
			if (displayPeriod > 0) {
				var mustBeAfter = (new Date()).getTime() - (displayPeriod * 24 * 60 * 60 * 1000);
			}
			
			for (var i = 0; i < toInsert.length; i++){
				if (!showReadItems && toInsert[i].visited) {
					continue;
				}
				
				if ((displayPeriod > 0) && (toInsert[i].published < mustBeAfter)) {
					continue;
				}
				
				if (!FEEDBAR.passesFilter(feedName + " " + toInsert[i].label + toInsert[i].description)) {
					continue;
				}
				
				FEEDBAR.visibleData.splice(idx + itemsInserted + 1, 0, { "id" : null, "label" : " " + toInsert[i].label, "isContainer" : false, "image" : toInsert[i].image, "uri" : toInsert[i].uri, "id" : toInsert[i].id, "visited" : toInsert[i].visited, "description" : toInsert[i].description, "published" : toInsert[i].published });
				++itemsInserted;
			}
			
			if (itemsInserted == 0) {
				// If it's empty, get rid of it.
				FEEDBAR.visibleData.splice(idx, 1);
				try { FEEDBAR.treeBox.rowCountChanged(idx, -1); } catch (sidebarNotOpen) { }
				itemStillExists = false;
			}
			else {
				try { FEEDBAR.treeBox.rowCountChanged(idx + 1, itemsInserted); } catch (sidebarNotOpen) { }
			}
		}
		
		if (itemStillExists) {
			FEEDBAR.storeOpenState(FEEDBAR.getCellID(idx), item.isOpen);
		}
		
		FEEDBAR.updateNotifier();
		
		return itemStillExists;
	},
	
	getImageSrc: function(idx){ 
		if (FEEDBAR.isContainer(idx)) {
			return "chrome://feedbar/skin/icons/folder.png";
		}
		else {
			return FEEDBAR.visibleData[idx].image;
		}
	},
	
	canDrop : function (idx, orientation) { return false; },
	cycleCell : function (row, col) { },
	cycleHeader : function (col) { },
	drop : function (idx, orientation) { },
	
	getCellProperties: function (row, col) {
		if (!FEEDBAR.isContainer(row)) {
			if (FEEDBAR.getCellRead(row)) { 
				return "visited";
			}
		}
		else {
			if (!FEEDBAR.hasUnreadItems(row)) {
				return "visited";
			}
		}
	},
	
	getCellValue : function (row, col) { },
	
	getColumnProperties: function (colid,col) { },
	
	getProgressMode : function (row, col) { },
	
	getRowProperties: function (row) {
		if (!FEEDBAR.isContainer(row)) {
			if (FEEDBAR.getCellRead(row)) { 
				return "visited";
			}
		}
		else {
			if (!FEEDBAR.hasUnreadItems(row)) {
				return "visited";
			}
		}
	},
	
	isEditable : function (row, col) { return false; },
	isSelectable : function (row, col) { return true; },
	isSeparator : function (idx) { return false; },
	isSorted : function () { return false; },
	performAction : function (action) { },
	performActionOnCell : function (action, row, col) { },
	performActionOnRow : function (action, idx) { },
	selectionChanged : function () { },
	setCellValue : function (row, cell, value) { },
	
	/**
	 * Additional custom view functions.
	 */
	
	isSorting : false,
	
	sort : function (sortType, selectedByUser) {
		if (FEEDBAR.isSorting) {
			return;
		}
		
		FEEDBAR.isSorting = true;
		
		if (!sortType) sortType = FEEDBAR.prefs.getCharPref("lastSort");
		
		if (selectedByUser) {
			if (sortType == FEEDBAR.prefs.getCharPref("lastSort")) {
				if (sortType.indexOf("-desc") != -1) {
					sortType = sortType.replace("-desc", "");
				}
				else {
					sortType = sortType + "-desc";
				}
			}
		}
		
		FEEDBAR.prefs.setCharPref("lastSort", sortType);
		
		// Collapse all the containers.
		var len = FEEDBAR.visibleData.length;
		
		for (var i = 0; i < len; i++) {
			if (FEEDBAR.isContainer(i)) {
				if (FEEDBAR.isContainerOpen(i)) {
					FEEDBAR.toggleOpenState(i);
					FEEDBAR.visibleData[i].shouldBeOpen = true;
					len = FEEDBAR.visibleData.length;
				}
				else {
					FEEDBAR.visibleData[i].shouldBeOpen = false;
				}
			}
		}
		
		var multiplier = 1;
		
		// Define the sorting function.
		switch (sortType) {
			case 'default-desc':
				multiplier = -1;
			case 'default':
				function sorter(a, b) {
					if (a.livemarkId < b.livemarkId) {
						return -1 * multiplier;
					}
					
					return 1 * multiplier;
				}
			break;
			case 'updated-desc':
				multiplier = -1;
			case 'updated':
				function sorter(a, b) {
					if (b.lastUpdated < a.lastUpdated) {
						return -1 * multiplier;
					}
					
					return 1 * multiplier;
				}
			break;
			case 'name-desc':
				multiplier = -1;
			case 'name':
			default:
				function sorter(a, b) {
					if (a.label.toLowerCase() < b.label.toLowerCase()) {
						return -1 * multiplier;
					}

					return 1 * multiplier;
				}
			break;
		}
		
		// Sort just the containers.
		FEEDBAR.visibleData.sort(sorter);
		
		// Uncollapse the containers that were not collapsed
		var len = FEEDBAR.visibleData.length;
		
		try { FEEDBAR.treeBox.invalidateRange(0, len); } catch (sidebarNotOpen) { }
		
		for (var i = len - 1; i >= 0; i--) {
			if (FEEDBAR.visibleData[i].shouldBeOpen) {
				FEEDBAR.visibleData[i].shouldBeOpen = false;
				FEEDBAR.toggleOpenState(i);
			}
		}
		
		FEEDBAR.isSorting = false;
	},
	
	_batchCount : 0,
	db : null,
	
	previewTimeout : null,
	
	/**
	 * Takes a feedObject hashtable and adds its data to the tree view.
	 * @param feedObject A hashtable that contains meta-data about the feed and its items
	 */

	searchFilter : [],
	
	push : function (feedObject) {
		var toInsert = [];
		var hasVisible = false;
		var numUnread = 0;
		var showReadItems = !FEEDBAR.prefs.getBoolPref("hideReadItems");
		
		for (var i = 0; i < feedObject.items.length; i++) {
			var item = feedObject.items[i];
			
			toInsert.push( { "label" : item.label, "image" : item.image, "visited" : item.visited, "uri" : item.uri, "id" : item.id, "published" : item.published, "description" : item.description, "merch": item.merch } );
			
			if (showReadItems || !item.visited) {
				hasVisible = true;
				
				if (!item.visited) {
					numUnread += 1;
				}
			}
		}
		
		FEEDBAR.childData[feedObject.id] = { "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : feedObject.label, "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image, "items" : [] };
		FEEDBAR.childData[feedObject.id].items = toInsert;
		
		var folderIdx = -1;
		var wasLeftOpen = false;
		
		var selectedIdx = FEEDBAR.getSelectedIndex();
		var selFeedId = null;
		
		if (selectedIdx >= 0) {
			if (FEEDBAR.isContainer(selectedIdx)) {
				selFeedId = FEEDBAR.visibleData[selectedIdx].id;
			}
			else {
				selFeedId = FEEDBAR.visibleData[FEEDBAR.getParentIndex(selectedIdx)].id;
			}
		}
		
		var reselect = false;
		
		if (selFeedId && selFeedId == feedObject.id) {
			// The selected item is in this feed.
			
			reselect = FEEDBAR.visibleData[selectedIdx].id;
		}
		
		// Check if this feed is alredy being displayed.  If it is, toggle it closed so that we can use the toggleOpenState function to 
		// replace the children.
		for (var idx = 0; idx < FEEDBAR.visibleData.length; idx++) {
			if (FEEDBAR.isContainer(idx) && FEEDBAR.getCellID(idx) == feedObject.id) {
				var folderIdx = idx;
				
				if (FEEDBAR.isContainerOpen(folderIdx)) {
					wasLeftOpen = true;
					FEEDBAR.toggleOpenState(folderIdx);
				}
				
				if (!hasVisible) {
					FEEDBAR.visibleData.splice(folderIdx, 1);
					try { FEEDBAR.treeBox.rowCountChanged(folderIdx, -1); } catch (sidebarNotOpen) { }
				}
				else {
					FEEDBAR.visibleData[folderIdx].numUnread = numUnread;
					try { FEEDBAR.treeBox.invalidateRow(folderIdx); } catch (sidebarNotOpen) { }
				}
				
				break;
			}
		}
		
		if (hasVisible) {
			if (folderIdx < 0) {
				var sortType = FEEDBAR.prefs.getCharPref("lastSort");
				var toPush = { "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : " " + feedObject.label.replace(/^\s+/g, ""), "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image, "lastUpdated": FEEDBAR.childData[feedObject.id].items[0].published, "lastRedrawn" : new Date().getTime() };
			
				if (numUnread) {
					toPush.numUnread = numUnread;
				}

				var multiplier = 1;

				// Define the sorting function.
				switch (sortType) {
					case 'default-desc':
						multiplier = -1;
					case 'default':
						function sorter(a, b) {
							if (a.livemarkId < b.livemarkId) {
								return -1 * multiplier;
							}

							return 1 * multiplier;
						}
					break;
					case 'updated-desc':
						multiplier = -1;
					case 'updated':
						function sorter(a, b) {
							if (b.lastUpdated < a.lastUpdated) {
								return -1 * multiplier;
							}

							return 1 * multiplier;
						}
					break;
					case 'name-desc':
						multiplier = -1;
					case 'name':
					default:
						function sorter(a, b) {
							if (a.label.toLowerCase() < b.label.toLowerCase()) {
								return -1 * multiplier;
							}

							return 1 * multiplier;
						}
					break;
				}
				
				var inserted = false;
				
				var i = 0;
				
				for (i = 0; i < FEEDBAR.visibleData.length; i++) {
					if (FEEDBAR.isContainer(i) && sorter(toPush, FEEDBAR.visibleData[i]) <= 0) {
						FEEDBAR.visibleData.splice(i, 0, toPush);
						inserted = true;
						break;
					}
				}
				
				if (!inserted) {
					FEEDBAR.visibleData.push(toPush);
					i = FEEDBAR.visibleData.length - 1;
				}
				
				try { FEEDBAR.treeBox.rowCountChanged(i, 1); } catch (sidebarNotOpen) { }
				folderIdx = i;
			}
			
			wasLeftOpen = wasLeftOpen || FEEDBAR.wasLeftOpen(feedObject.id);
			
			if (wasLeftOpen) {
				// Re-use the toggling code so that we don't have to manually add
				// the sub-items.
				FEEDBAR.toggleOpenState(folderIdx);
			}
			else {
				if (FEEDBAR.toggleOpenState(folderIdx)) {
					FEEDBAR.toggleOpenState(folderIdx);
				}
			}
		}
		
		if (reselect) {
			var i = folderIdx;
			var len = FEEDBAR.visibleData.length;
			
			while (i < len) {
				if (FEEDBAR.visibleData[i].id == reselect) {
					// Select this item.
					FEEDBAR.treeBox.view.selection.select(i);
					break;
				}
				
				++i;
				
				if (FEEDBAR.isContainer(i)) {
					break;
				}
			}
		}
		
		FEEDBAR.updateNotifier();
	},
	
	renameFeed : function (id, label) {
		for (var idx = 0; idx < FEEDBAR.visibleData.length; idx++) {
			if (FEEDBAR.isContainer(idx) && FEEDBAR.getCellLivemarkId(idx) == id) {
				FEEDBAR.visibleData[idx].label = " " + label.replace(/^\s+/g, "");
				try { FEEDBAR.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { }
				break;
			}
		}
	},
	
	selectNone : function () {
		FEEDBAR.treeBox.view.selection.select(-1);
	},
	
	updateNotifier : function () {
		var wins = FEEDBAR.windows;
		
		for (var i = 0; i < wins.length; i++) {
			var win = wins[i];
			
			if (FEEDBAR.hasUnreadItems()) {
				try { win.document.getElementById("feedbar-button").setAttribute("new","true"); } catch (e) { }
			}
			else {
				try { win.document.getElementById("feedbar-button").setAttribute("new","false"); } catch (e) { }
			}
		}
	},
	
	pushFromChildData : function (feedId) {
		var feedObject = FEEDBAR.childData[feedId];
		FEEDBAR.push(feedObject);
	},
	
	filter : function (dontRefresh) {
		var filter = FEEDBAR.prefs.getCharPref("filter");
		FEEDBAR.searchFilter.length = 0;
		
		if (filter) {
			var filterString = filter.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
			var filterParts = [];
			
			// We now have a space delimited filter string, but it may included quoted phrases
			var currentFilter = "";
			var inQuotes = 0;
			
			for (var i = 0; i < filterString.length; i++) {
				var theChar = filterString.charAt(i);
				
				if (theChar == "'" || theChar == '"') {
					if (inQuotes == theChar) {
						inQuotes = false;
					}
					else if (currentFilter.length == 0 || (currentFilter.length == 1 && (currentFilter == "-"))){
						inQuotes = theChar;
					}
					else {
						currentFilter += theChar;
					}
				}
				else if (theChar == "+" && currentFilter.length == 0) {
				}
				else {
					if (theChar == " "){ 
						if (!inQuotes) {
							filterParts.push(currentFilter);
							currentFilter = "";
							continue;
						}
					}
					
					currentFilter += filterString.charAt(i);
				}
			}
			
			if (currentFilter != "") filterParts.push(currentFilter);
			
			for (var i = 0; i < filterParts.length; i++) {
				var nomatch = false;
				
				if (filterParts[i].charAt(0) == '-') {
					filterParts[i] = filterParts[i].substring(1);
					nomatch = true;
				}
				
				if (filterParts[i]) {
					FEEDBAR.searchFilter.push( { "nomatch" : nomatch, "regex" : new RegExp(filterParts[i], "i") } );
				}
			}
		}
		
		if (!dontRefresh) FEEDBAR.refreshTree();
	},
	
	getCellRead : function (idx) {
		return FEEDBAR.visibleData[idx].visited;
	},
	
	getCellAge : function (idx) {
		if (FEEDBAR.isContainer(idx)) {
			try {
				var redrawnMS = FEEDBAR.visibleData[idx].lastRedrawn;
			} catch (e) {
				return 100000;
			}
			
			var now = new Date().getTime();
			
			var age = now - redrawnMS;
			
			return age;
		}
		
		return false;
	},
	
	setCellRead : function (idx, updateUI) {
		var cellID = FEEDBAR.getCellID(idx);
		
		// Add to DB
		var db = FEEDBAR.getDB();
		
		var insert = db.createStatement("INSERT INTO history (id, date) VALUES (?1, ?2)");
		insert.bindUTF8StringParameter(0, cellID);
		insert.bindInt64Parameter(1, (new Date().getTime()));
		
		try { insert.execute(); } catch (duplicateKey) { }
		try { insert.finalize(); } catch (notNeeded) { }
		
		// Find it in the childData object to set its "visited" property permanently.
		var parentIdx = FEEDBAR.getParentIndex(idx);
		var parentID = FEEDBAR.getCellID(parentIdx);
		
		for (var i = 0; i < FEEDBAR.childData[parentID].items.length; i++) {
			if (FEEDBAR.childData[parentID].items[i].id == cellID) {
				FEEDBAR.childData[parentID].items[i].visited = true;
				break;
			}
		}
		
		var updateLabel = true;
		
		if (FEEDBAR.prefs.getBoolPref("hideReadItems") && updateUI) {
			var rowsRemoved = 1;
			
			// If the containing folder is now empty, remove it.
			if ((parentIdx == (idx - 1)) && ((idx + 1) >= FEEDBAR.visibleData.length || FEEDBAR.isContainer(idx + 1))) {
				idx = parentIdx;
				++rowsRemoved;
				
				updateLabel = false;
			}
			
			FEEDBAR.visibleData.splice(idx, rowsRemoved);
			try { FEEDBAR.treeBox.rowCountChanged(idx, -rowsRemoved); } catch (sidebarNotOpen) { }
		}
		else {
			FEEDBAR.visibleData[idx].visited = true;
			
			if (updateUI) {
				try { FEEDBAR.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { }
			}
			else {
				updateLabel = false;
			}
		}
		
		FEEDBAR.updateNotifier();
		
		if (updateLabel) {
			/**
			 * Decrement this folder's number of unread.
			 */
			FEEDBAR.visibleData[parentIdx].numUnread--;
			try { FEEDBAR.treeBox.invalidateRow(parentIdx); } catch (sidebarNotOpen) { }
		}
	},

	setCellUnread : function (idx) {
		var cellID = FEEDBAR.getCellID(idx);
		
		// Remove from history DB
		var db = FEEDBAR.getDB();
		
		var deleteSql = db.createStatement("DELETE FROM history WHERE id=?1");
		deleteSql.bindUTF8StringParameter(0, cellID);
		
		try { deleteSql.execute(); } catch (e) { }
		
		deleteSql.finalize();
		
		// Find it in the childData object to set its "visited" property permanently.
		var parentIdx = FEEDBAR.getParentIndex(idx);
		var parentID = FEEDBAR.getCellID(parentIdx);
		
		for (var i = 0; i < FEEDBAR.childData[parentID].items.length; i++) {
			if (FEEDBAR.childData[parentID].items[i].id == cellID) {
				FEEDBAR.childData[parentID].items[i].visited = false;
				break;
			}
		}
		
		FEEDBAR.visibleData[idx].visited = false;
		
		// Parent style may have changed.
		try { FEEDBAR.treeBox.invalidateRow(parentIdx); } catch (sidebarNotOpen) { }
		try { FEEDBAR.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { }
		
		FEEDBAR.updateNotifier();
	},
	
	getLinkForCell : function (idx) {
		return FEEDBAR.visibleData[idx].uri;
	},
	
	getSelectedIndex : function () {
		if (FEEDBAR.selection) {
			var range = FEEDBAR.selection.getRangeCount();
		
			for (var i = 0; i < range; i++) {
				var start = {};
				var end = {};
				FEEDBAR.selection.getRangeAt(i, start, end);
				return start.value;
			}
		}
		
		return -1;
	},
	
/**
 * Functions for usage/user-interaction.
 */
	
	prefs : null,
	
	loadStack : 0,
	
	load : function () {
		FEEDBAR.loadStack++;
		
		if (FEEDBAR.loadStack == 1) {
			FEEDBAR.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
			FEEDBAR.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
			FEEDBAR.prefs.addObserver("", FEEDBAR, false);
			
			var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			bmsvc.addObserver(FEEDBAR, false);
		
			FEEDBAR.filter(true);
		
			var db = FEEDBAR.getDB();
		
			if (!db.tableExists("history")) {
				db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, date INTEGER)");
			}
		
			if (!db.tableExists("state")) {
				db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, open INTEGER)");
			}
			else {
				var select = db.createStatement("SELECT id, open FROM state");
			
				try {
					while (select.executeStep()) {
						var id = select.getString(0);
						var open = select.getInt32(1);
					
						FEEDBAR.openStates[id] = open;
					}
				} catch (e) {
					FEEDBAR.log(e);
				} finally {
					select.reset();
				}
			
				select.finalize();
			}
		
			try {
				var file = Components.classes['@mozilla.org/file/directory_service;1']
								.getService(Components.interfaces.nsIProperties) //changed by <asqueella@gmail.com>
								.get("ProfD", Components.interfaces.nsIFile);
				file.append("feedbar.cache");
			
				var data	 = new String();
				var fiStream = Components.classes['@mozilla.org/network/file-input-stream;1']
								.createInstance(Components.interfaces.nsIFileInputStream);
				var siStream = Components.classes['@mozilla.org/scriptableinputstream;1']
								.createInstance(Components.interfaces.nsIScriptableInputStream);
				fiStream.init(file, 1, 0, false);
				siStream.init(fiStream);
				data += siStream.read(-1);
				siStream.close();
			
				// The JSON is stored as UTF-8, but JSON only works properly with Unicode
				var unicodeConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				unicodeConverter.charset = "UTF-8";
				data = unicodeConverter.ConvertToUnicode(data);
			
				FEEDBAR.childData = JSON.parse(data);
				FEEDBAR.refreshTree();
			} catch (e) {
				// Cache does not exist.
				// FEEDBAR.log(e);
			}
		}
		
		FEEDBAR.updateNotifier();
	},
	
	tryAndRemoveFeed : function (livemarkId) {
		for (var i in FEEDBAR.childData) {
			if (FEEDBAR.childData[i].livemarkId == livemarkId) {
				var feedId = i;
				delete FEEDBAR.childData[i];
				
				var len = FEEDBAR.visibleData.length;
				
				for (var j = 0; j < len; j++) {
					if (FEEDBAR.isContainer(j) && FEEDBAR.visibleData[j].id == feedId) {
						// Remove this.
						var itemsRemoved = 1;
						
						for (var k = j + 1; k < len; k++) {
							if (FEEDBAR.isContainer(k)) {
								break;
							}
							
							++itemsRemoved;
						}
						
						FEEDBAR.visibleData.splice(j, itemsRemoved);
						try { FEEDBAR.treeBox.rowCountChanged(j, (itemsRemoved * -1)); } catch (sidebarNotOpen) { }
						
						break;
					}
				}
				
				break;
			}
		}
		
		return true;
	},
	
	unload : function () {
		FEEDBAR.loadStack--;
		
		if (FEEDBAR.loadStack == 0) {
			FEEDBAR.prefs.removeObserver("", FEEDBAR);
			
			var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			bmsvc.removeObserver(FEEDBAR);
			
			try {
				var file = Components.classes['@mozilla.org/file/directory_service;1']
								.getService(Components.interfaces.nsIProperties)
								.get("ProfD", Components.interfaces.nsIFile);
				file.append("feedbar.cache");

				var foStream = Components.classes['@mozilla.org/network/file-output-stream;1']
									.createInstance(Components.interfaces.nsIFileOutputStream);
				var flags = 0x02 | 0x08 | 0x20; // wronly | create | truncate
				foStream.init(file, flags, 0664, 0);

				var data = JSON.stringify(FEEDBAR.childData);
			
				// Store the data as UTF-8, not the Unicode that JSON outputs.
				var unicodeConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
				unicodeConverter.charset = "UTF-8";
				data = unicodeConverter.ConvertFromUnicode(data);
			
				foStream.write(data, data.length);
				foStream.close();
			} catch (e) {
			}
		
			var db = FEEDBAR.getDB();
		
			var empty = db.createStatement("DELETE FROM state");
			empty.execute();
			empty.finalize();
		
			for (id in FEEDBAR.openStates) {
				if (!FEEDBAR.openStates[id]) {
					var insert = db.createStatement("INSERT INTO state (id, open) VALUES (?1, 0)");
					insert.bindStringParameter(0, id);
				
					try {
						insert.execute();
					} catch (e) {
						FEEDBAR.log(e);
					} finally {
						insert.reset();
					}
				
					insert.finalize();
				}
			}
		
			FEEDBAR.closeDB();
		}
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "displayPeriod":
				FEEDBAR.refreshTree();
			break;
			case "hideReadItems":
				FEEDBAR.refreshTree();
			break;
			case "filter":
				FEEDBAR.filter();
			break;
		}
	},
	
	refreshTree : function () {
		// Clear out visible data.
		var rows = FEEDBAR.visibleData.length;
		
		FEEDBAR.visibleData.splice(0, rows);
		try { FEEDBAR.treeBox.rowCountChanged(0, -rows); } catch (sidebarNotOpen) { }
		
		// Re-populate the tree.
		for (var i in FEEDBAR.childData) {
			FEEDBAR.pushFromChildData(i);
		}
		
		FEEDBAR.updateNotifier();
	},
	
	wasLeftOpen : function (idx) {
		if (idx in FEEDBAR.openStates) {
			return FEEDBAR.openStates[idx];
		}
		
		return true;
	},
	
	itemSelect : function (event) {
		// Show the preview
		// alert(event);
	},
	
	onTreeDblClick : function (event) {
	},
	
	onKeyPress : function (event) {
		// if enter,
		if (event.keyCode == event.DOM_VK_RETURN || event.keyCode == 13) {
			// open it
			
			var win = FEEDBAR.window;
			var online = (win && win.navigator.onLine);
			
			if (FEEDBAR.prefs.getBoolPref("showFullPreview") || !online) {
				FEEDBAR.handleOfflineTreeClick(event);
				return;
			}
		
			var targetIdx = FEEDBAR.getSelectedIndex();
		
			if (targetIdx >= 0) {
				if (!FEEDBAR.isContainer(targetIdx)) {
					FEEDBAR.openInTab();
					
					FEEDBAR.clearTimeout(FEEDBAR.previewTimeout);
				}
			}
		}
		else {
			var targetIdx = FEEDBAR.getSelectedIndex();
			
			var wins = FEEDBAR.feedWindows;
			
			for (var i = 0; i < wins.length; i++) {
				wins[i].FEEDSIDEBAR.showPreview(targetIdx);
			}
		}
	},
	
	onTreeClick : function (event, url) {
		// Discard right-clicks
		if (event.which == 3){
			FEEDBAR.clearTimeout(FEEDBAR.previewTimeout);
			return;
		}
		
		var win = FEEDBAR.window;
		var online = (win && win.navigator.onLine);
		
		if (!url && (FEEDBAR.prefs.getBoolPref("showFullPreview") || !online)) {
			FEEDBAR.handleOfflineTreeClick(event, url);
			return;
		}
		
		var targetIdx = FEEDBAR.getSelectedIndex();
		
		if (targetIdx >= 0) {
			if (!FEEDBAR.isContainer(targetIdx) && !url) {
				if (event.which == 2){
					FEEDBAR.launchUrl(FEEDBAR.getCellLink(targetIdx), event);
					FEEDBAR.setCellRead(targetIdx, true);
				}
				else if (event.which == 4){
					window.open(FEEDBAR.getCellLink(targetIdx));
				}
				else {
					// Left-click
					if (event.detail != 1 || event.which == 13){
						// Single-left-clicks are handled by onselect
						FEEDBAR.clearTimeout(FEEDBAR.previewTimeout);
						
						FEEDBAR.launchUrl(FEEDBAR.getCellLink(targetIdx), event);
						FEEDBAR.setCellRead(targetIdx, true);
					}
				}
			}
			else {
				if (url) {
					if (event.which == 2){
						FEEDBAR.launchUrl(url, event);
					}
					else if (event.which == 4){
						window.open(url);
					}
					else {
						// Left-click
						FEEDBAR.launchUrl(url, event);
					}
				}
				
				return;
			}
		}
	},
	
	storeOpenState : function (cellId, openState) {
		if (openState && cellId in FEEDBAR.openStates) {
			delete FEEDBAR.openStates[cellId];
		}
		else if (!openState) {
			FEEDBAR.openStates[cellId] = openState;
		}
	},
	
	get inBatch() { 
		return (FEEDBAR._batchCount > 0);
	},
	
	openItem : function () {
		FEEDBAR.onTreeClick({ which : 1, detail : 2});
	},
	
	openInWindow : function () {
		FEEDBAR.onTreeClick({ which : 4, detail : 2});
	},
	
	openInTab : function () {
		FEEDBAR.onTreeClick({ which : 2, detail : 1});
	},
	
	openAll : function () {
		var numItems = 0;
		
		for (var i = 0; i < FEEDBAR.visibleData.length; i++) {
			if (!FEEDBAR.isContainer(i)) {
				++numItems;
			}
		}
		
		var hideRead = FEEDBAR.prefs.getBoolPref("hideReadItems");
		
		var win = FEEDBAR.window;
		var online = (win && win.navigator.onLine);
		
		if (FEEDBAR.confirmOpenTabs(numItems)) {
			for (var i = 0; i < FEEDBAR.visibleData.length; i++) {
				if (!FEEDBAR.isContainer(i)) {
					if (!online || FEEDBAR.prefs.getBoolPref("showFullPreview")) {
						FEEDBAR.loadFullPreview(i, { 'which' : 2, detail : 1}, hideRead);
					}
					else {
						var url = FEEDBAR.getCellLink(i);
						
						FEEDBAR.launchUrl(url, { which : 2, detail : 1});
					}
				}
			}
			
			FEEDBAR.markAllAsRead();
			FEEDBAR.updateNotifier();
		}
	},
	
	openFeed : function () {
		var numItems = 0;
		var folderIdx = FEEDBAR.getSelectedIndex();
		
		for (var i = folderIdx + 1; (i < FEEDBAR.visibleData.length && !FEEDBAR.isContainer(i)); i++) {
			++numItems;
		}
		
		var hideRead = FEEDBAR.prefs.getBoolPref("hideReadItems");
		
		var win = FEEDBAR.window;
		var online = (win && win.navigator.onLine);
		
		if (FEEDBAR.confirmOpenTabs(numItems)) {
			var i = numItems;
			
			while (i > 0) {
				var itemIdx = folderIdx + i;
				
				if (!online || FEEDBAR.prefs.getBoolPref("showFullPreview")) {
					FEEDBAR.loadFullPreview(itemIdx, { 'which' : 2, detail : 1}, hideRead);
				}
				else {
					var url = FEEDBAR.getCellLink(itemIdx);
					
					FEEDBAR.launchUrl(url, { which : 2, detail : 1});
				}
				
				--i;
			}
			
			FEEDBAR.markFeedAsRead(folderIdx);
			FEEDBAR.updateNotifier();
		}
	},
	
	markAsRead : function (dontMarkFeed) {
		var selectedIdx = FEEDBAR.getSelectedIndex();
		
		if (selectedIdx >= 0) {
			if (!FEEDBAR.isContainer(selectedIdx)) {
				FEEDBAR.setCellRead(selectedIdx, true);
			}
			else {
				if (!dontMarkFeed) {
					FEEDBAR.markFeedAsRead(selectedIdx);
				}
			}
		}
	},
	
	markAsUnread : function () {
		var selectedIdx = FEEDBAR.getSelectedIndex();
		
		if (!FEEDBAR.isContainer(selectedIdx)) {
			FEEDBAR.setCellUnread(selectedIdx);
		}
		else {
			FEEDBAR.markFeedAsUnread(selectedIdx);
		}
	},
	
	markFeedAsUnread : function (folderIdx) {
		var wasOpen = FEEDBAR.isContainerOpen(folderIdx);
		
		if (!wasOpen) {
			// Open the feed so that it's children can be marked.
			// Not optimal.
			// Optimize: Don't rely on the visibleData array for marking a feed as read.
			// Mark the child items as read in the childData array and then remove the entire 
			// feed from the visibleData array, whether it's open or not.
			FEEDBAR.toggleOpenState(folderIdx);
		}
		
		// Mark all of this feed's visible cells as read.
		var nextFolderIdx = FEEDBAR.getNextSiblingIndex(folderIdx);
		
		if (nextFolderIdx != -1) {
			var itemIdx = nextFolderIdx - 1;
		}
		else {
			var itemIdx = FEEDBAR.visibleData.length - 1;
		}
		
		var itemsChanged = 0;
		
		while (itemIdx > folderIdx) {
			FEEDBAR.setCellUnread(itemIdx);
			++itemsChanged;
			
			--itemIdx;
		}
		
		if (!wasOpen) {
			FEEDBAR.toggleOpenState(folderIdx);
		}

		FEEDBAR.updateNotifier();
	},
	
	markFeedAsRead : function (folderIdx, checkRedrawnTime) {
		if (checkRedrawnTime) {
			var age = FEEDBAR.getCellAge(folderIdx);
			
			if (age && age < 3000) {
				// Don't mark any feed that was updated in the last 3 seconds.
				// ToDo: No need to ignore marking this one if nothing changed the last time it was refreshed.
				return;
			}
		}
		
		var wasOpen = FEEDBAR.isContainerOpen(folderIdx);
		
		if (!wasOpen) {
			// Open the feed so that it's children can be marked.
			// Not optimal.
			// Optimize: Don't rely on the visibleData array for marking a feed as read.
			// Mark the child items as read in the childData array and then remove the entire 
			// feed from the visibleData array, whether it's open or not.
			FEEDBAR.toggleOpenState(folderIdx);
		}
		
		// Mark all of this feed's visible cells as read.
		var nextFolderIdx = FEEDBAR.getNextSiblingIndex(folderIdx);
		
		if (nextFolderIdx != -1) {
			var itemIdx = nextFolderIdx - 1;
		}
		else {
			var itemIdx = FEEDBAR.visibleData.length - 1;
		}
		
		var lastItemIdx = itemIdx;
		var firstItemIdx = folderIdx + 1;
		
		var itemsChanged = 0;
		
		while (itemIdx > folderIdx) {
			FEEDBAR.setCellRead(itemIdx);
			++itemsChanged;
			
			--itemIdx;
		}
		
		if (FEEDBAR.prefs.getBoolPref("hideReadItems")) {
			FEEDBAR.visibleData.splice(folderIdx, itemsChanged + 1);
			try { FEEDBAR.treeBox.rowCountChanged(folderIdx, -(itemsChanged + 1)); } catch (sidebarNotOpen) { }
		}
		else {
			if (!wasOpen) {
				FEEDBAR.toggleOpenState(folderIdx);
			}
			else {
				try { FEEDBAR.treeBox.invalidateRange(folderIdx, lastItemIdx); } catch (sidebarNotOpen) { }
			}
		}

		FEEDBAR.updateNotifier();
	},
	
	markAllAsRead : function () {
		if (FEEDBAR.prefs.getBoolPref("hideReadItems")) {
			for (var i = FEEDBAR.visibleData.length - 1; i >= 0; i--) {
				var item = FEEDBAR.visibleData[i];
				
				if (FEEDBAR.isContainer(i) && item.isOpen) {
					FEEDBAR.markFeedAsRead(i, true);
				}
			}
		}
		else {
			var len = FEEDBAR.visibleData.length;
			
			for (var i = 0; i < len; i++) {
				var item = FEEDBAR.visibleData[i];
				
				if (FEEDBAR.isContainer(i) && item.isOpen) {
					FEEDBAR.markFeedAsRead(i, true);
				}
			}
		}
		
		if (FEEDBAR.prefs.getBoolPref("autoClose") && FEEDBAR.prefs.getBoolPref("hideReadItems")) {
			// ToDo: Check that all the items were marked as read.
			
			var wins = FEEDBAR.feedWindows;
			
			for (var i = 0; i < wins.length; i++) {
				wins[i].parent.toggleSidebar('feedbar');
			}
		}
	},
	
	markAllAsUnread : function () {
		var len = FEEDBAR.visibleData.length;
		
		for (var i = 0; i < len; i++) {
			if (FEEDBAR.isContainer(i)) {
				FEEDBAR.markFeedAsUnread(i);
			}
		}
	},
	
	clipboard : {
		copyString : function (str){
			try {
				var oClipBoard = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
				oClipBoard.copyString(str);
			} catch (e) {
			}
		}
	},
	
	copyTitle : function () {
		var idx = FEEDBAR.getSelectedIndex();
		var title = FEEDBAR.getCellText(idx, 0, true).replace(/^\s+/g, "");
		FEEDBAR.clipboard.copyString(title);
	},
	
	copyLink : function () {
		var idx = FEEDBAR.getSelectedIndex();
		
		if (FEEDBAR.isContainer(idx)) {
			var link = FEEDBAR.getCellFeedLink(idx);
		}
		else {
			var link = FEEDBAR.getCellLink(idx);
		}
		
		FEEDBAR.clipboard.copyString(link);
	},
	
	unsubscribeById : function (id) {
		var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
		
		try {
			bookmarkService.removeItem(id);
		} catch (e) {
			FEEDBAR.tryAndRemoveFeed(id);
		}
		
		FEEDBAR.updateNotifier();
		
		return id;
	},

	log : function (m) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.logStringMessage("FEEDBAR: " + m);
	},

	unsubscribe : function () {
		var idx = FEEDBAR.getSelectedIndex();
		var livemarkId = FEEDBAR.getCellLivemarkId(idx);
		
		FEEDBAR.unsubscribeById(livemarkId);
		
		return livemarkId;
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

				var buttonPressed = promptService.confirmEx(null,
					FEEDBAR.strings.getString("feedbar.confirmOpenInTabs"),
					FEEDBAR.strings.getFormattedString("feedbar.warnOnTabsMessage", [ numTabs ]),
					(promptService.BUTTON_TITLE_IS_STRING * promptService.BUTTON_POS_0) + (promptService.BUTTON_TITLE_CANCEL * promptService.BUTTON_POS_1), 
					FEEDBAR.strings.getString("feedbar.openConfirmText"), null, null,
					FEEDBAR.strings.getString("feedbar.warnOnTabs"),
					warnOnOpen);

				reallyOpen = (buttonPressed == 0);

				// don't set the pref unless they press OK and it's false
				if (reallyOpen && !warnOnOpen.value)
					pref.setBoolPref(kWarnOnOpenPref, false);
			}
		}

		return reallyOpen;
	},
	
	launchUrl : function (url, event) {
		if (FEEDBAR.prefs.getBoolPref("openInNewTab") || (event.which == 2) || (event.which == 1 && (event.ctrlKey || event.metaKey) && (event.ctrlKey || event.metaKey))){
			FEEDBAR._addTab(url);
		}
		else if (event.which == 1 || (event.which == 13 && !event.shiftKey)){
			FEEDBAR._inTab(url);
		}
		else if (event.which == 4 || (event.which == 13 && event.shiftKey)){
			window.open(url);
		}
	},
	
	_addTab : function (url) {
		var win = FEEDBAR.window;
		
		var browser = win.gBrowser;
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
		var win = FEEDBAR.window;
		
		win.content.document.location.href = url;
	},
	
	theFile : null,
	theDB : null,
	
	getDB : function () {
		if (!FEEDBAR.theFile) {
			FEEDBAR.theFile = Components.classes["@mozilla.org/file/directory_service;1"]
							 .getService(Components.interfaces.nsIProperties)
							 .get("ProfD", Components.interfaces.nsIFile);
			FEEDBAR.theFile.append("feedbar.sqlite");
		}
		
		if (!FEEDBAR.theDB) {
			FEEDBAR.theDB = Components.classes["@mozilla.org/storage/service;1"]
						 .getService(Components.interfaces.mozIStorageService).openDatabase(FEEDBAR.theFile);
		}
		
		return FEEDBAR.theDB;
	},
	
	closeDB : function () {
		if (FEEDBAR.theDB) {
			FEEDBAR.theDB.close();
			delete FEEDBAR.theDB;
			FEEDBAR.theDB = null;
		}
	},
	
	passesFilter : function (str) {
		if (FEEDBAR.searchFilter.length == 0) {
			return true;
		}
		else {
			for (var i = 0; i < FEEDBAR.searchFilter.length; i++) {
				if (FEEDBAR.searchFilter[i].nomatch) {
					if (str.match(FEEDBAR.searchFilter[i].regex)) {
						return false;
					}
				}
				else {
					if (!str.match(FEEDBAR.searchFilter[i].regex)) {
						return false;
					}
				}
			}
		}
		
		return true;
	},
	
	loadFullPreview : function (idx, event, dontMark) {
		var win = FEEDBAR.window;
		
		if (event.ctrlKey || event.metaKey || event.which == 2 || event.which == 4) {
			var openedTab = win.gBrowser.addTab("chrome://feedbar/content/full_preview.html?idx="+idx);
			win.gBrowser.selectedTab = openedTab;
		}
		else {
			var openedTab = win.gBrowser.selectedTab;
			win.content.document.location.href = "chrome://feedbar/content/full_preview.html?idx="+idx;
		}
		
		var item = FEEDBAR.visibleData[idx];
		
		var itemLabel = item.label;
		var itemUri = item.uri;
		var feed = FEEDBAR.visibleData[FEEDBAR.getParentIndex(idx)];
		var feedUri = feed.uri;
		var feedLabel = feed.label;
		var siteUri = feed.siteUri;
		var image = item.image;
		var pubDate = new Date();
		pubDate.setTime(item.published);
		
		function onTabLoaded() { 
			this.removeEventListener("load", onTabLoaded, true);
			
			var doc = this.contentDocument;
			
			if ("wrappedJSObject" in doc) {
				doc = doc.wrappedJSObject;
			}
			
			doc.title = itemLabel;

			doc.getElementById("title").innerHTML = '<a href="'+itemUri+'">'+itemLabel+'</a>';

			var nav = '<a href="' + itemUri + '">'+FEEDBAR.strings.getString("feedbar.permalink")+'</a> &bull; <a href="'+feedUri+'">'+FEEDBAR.strings.getString("feedbar.feedLink")+'</a> &bull; <a href="'+siteUri+'">'+FEEDBAR.strings.getString("feedbar.siteLink")+"</a> &bull; " + FEEDBAR.strings.getFormattedString("feedbar.publishedOn", [pubDate.toLocaleString(), feedUri, feedLabel]);
			doc.getElementById("navigation").innerHTML = nav;

			var content = item.description;
			doc.getElementById("content").innerHTML = content;

			doc.getElementById("site-info").innerHTML = FEEDBAR.strings.getFormattedString("feedbar.previewHeader", [siteUri, feedLabel]);
			doc.getElementById("site-info").style.backgroundImage = "url("+image+")";
			
			if (!dontMark) {
				FEEDBAR.setCellRead(idx, true);
			}
		}
		
		var newTab = win.gBrowser.getBrowserForTab(openedTab);
		newTab.addEventListener("load", onTabLoaded, true);
	},
	
	previewLoaded : function (idx, browser, title) {
	},
	
	handlePreviewNameClick : function (event, url) {
		var targetIdx = FEEDBAR.getSelectedIndex();
		
		if (FEEDBAR.isContainer(targetIdx)) {
			FEEDBAR.launchUrl(url, event);	
		}
		else {
			FEEDBAR.handleOfflineTreeClick(event, url);
		}
	},
	
	handleOfflineTreeClick : function(event, url) {
		var targetIdx = FEEDBAR.getSelectedIndex();
		
		if (targetIdx >= 0) {
			if (!FEEDBAR.isContainer(targetIdx) && !url) {
				if (event.which == 2){
					FEEDBAR.loadFullPreview(targetIdx, event);
				}
				else if (event.which == 4){
					FEEDBAR.loadFullPreview(targetIdx, event);
				}
				else {
					// Left-click
					if (event.detail != 1){
						// Single-left-clicks are handled by onselect
						FEEDBAR.clearTimeout(FEEDBAR.previewTimeout);
						
						FEEDBAR.loadFullPreview(targetIdx, event);
					}
				}
			}
			else {
				if (url) {
					FEEDBAR.loadFullPreview(targetIdx, event, url);
				}
				
				return;
			}
		}
	},
	
	/* Bookmark Observer Functions */
	onBeforeItemRemoved : function () { },
	onBeginUpdateBatch: function() { },
	onEndUpdateBatch: function() { },
	onItemAdded: function(id, folder, index) { /* Handled by onItemChanged */ },
	onItemVisited: function(id, visitID, time) { },
	onItemMoved: function(id, oldParent, oldIndex, newParent, newIndex) { },

	onItemRemoved: function(id, folder, index) {
		FEEDBAR.tryAndRemoveFeed(id);
	},

	onItemChanged: function(id, property, isAnnotationProperty, value) {
		if (property == "livemark/feedURI") {
			FEEDBAR.tryAndRemoveFeed(id);
		}
		else if (property == 'title') {
			FEEDBAR.renameFeed(id, value);
		}
	},

	QueryInterface: function(iid) {
		if (iid.equals(Components.interfaces.nsINavBookmarkObserver) ||
			iid.equals(Components.interfaces.nsISupports)) {
			return this;
		}

		throw Cr.NS_ERROR_NO_INTERFACE;
	}
};

var EXPORTED_SYMBOLS = ["FEEDBAR"];