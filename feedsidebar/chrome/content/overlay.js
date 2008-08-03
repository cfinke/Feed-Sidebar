var FEEDBAR = {
	
/**
 * Functions required for implementation of tree view methods
 */

	treeBox : null,
	setTree : function (treeBox) { this.treeBox = treeBox; },
	
	selection : null,
	
	childData : { },
	visibleData : [],
	get rowCount() { return this.visibleData.length; },
	
	getCellText : function (idx) {
		return this.visibleData[idx].label;
	},
	
	getCellDescription : function (idx) {
		return this.visibleData[idx].description;
	},
	
	getCellLink : function (idx) {
		if (this.isContainer(idx)) {
			return this.visibleData[idx].siteUri;
		}
		else {
			return this.visibleData[idx].uri;
		}
	},
	
	getCellFeedLink : function (idx) {
		if (this.isContainer(idx)) {
			return this.visibleData[idx].uri;
		}
		else {
			var feedIdx = this.getParentIndex(idx);
			return this.getCellFeedLink(feedIdx);
		}
	},
	
	getCellLivemarkId : function (idx) {
		return this.visibleData[idx].livemarkId;
	},
	
	getCellID : function (idx) {
		return this.visibleData[idx].id;
	},
	
	isContainer : function(idx) {
		return this.visibleData[idx].isContainer;
	},
	
	isContainerOpen : function (idx) {
		try {
			return this.visibleData[idx].isOpen;
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
		if (this.isContainer(idx)) return -1;
		
		for (var t = idx - 1; t >= 0; t--) {
			if (this.isContainer(t)) return t;
		}
	},
	
	getNextSiblingIndex : function (idx) {
		var thisLevel = this.getLevel(idx);
		
		for (var t = idx + 1; t < this.visibleData.length; t++) {
			var nextLevel = this.getLevel(t);
			if (nextLevel == thisLevel) return t;
			else if (nextLevel < thisLevel) return -1;
		}
		
		return -1;
	},
	
    getLevel: function (idx) {
		if (this.isContainer(idx)) return 0;
		else return 1;
	},
	
	hasNextSibling : function (idx) {
		var thisLevel = this.getLevel(idx);
		
		for (var t = idx + 1; t < this.visibleData.length; t++) {
			var nextLevel = this.getLevel(t);
			if (nextLevel == thisLevel) return true;
			else if (nextLevel < thisLevel) return false;
		}
	},
	
	hasVisibleItems : function (idx) {
		var key = this.visibleData[idx].id;
		var feedName = this.getCellText(idx);
		var toInsert = this.childData[key].items;
		var itemsInserted = 0;
		
		var displayPeriod = this.prefs.getIntPref("displayPeriod");
		var showReadItems = !this.prefs.getBoolPref("hideReadItems");
		
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
			
			if (!this.passesFilter(feedName + " " + toInsert[i].label + " " + toInsert[i].description)) {
				continue;
			}
			
			return true;
		}
		
		return false;
	},
	
	numUnreadItems : function (idx) {
		var num = 0;
		var len = this.visibleData.length;
		
		if (typeof idx == 'undefined') {
			for (var idx = 0; idx < len; idx++) {
				if (!this.isContainer(idx) && !this.getCellRead(idx)) {
					++num;
				}
			}
		}
		else {
			++idx;
			
			while (idx < len && !this.isContainer(idx) && !this.getCellRead(idx)) {
				++num;
				++idx;
			}
		}
		
		return num;
	},

	hasReadItems : function (idx) {
		if (typeof idx == 'undefined') {
			var len = this.visibleData.length;
			
			for (var idx = 0; idx < len; idx++) {
				if (!this.isContainer(idx) && this.getCellRead(idx)) {
					return true;
				}
			}
			
			return false;
		}
		else {
			var len = this.visibleData.length;
			++idx;
			
			while (idx < len && !this.isContainer(idx)) {
				if (this.getCellRead(idx)) {
					return true;
				}
				++idx;
			}
			
			return false;
		}
	},

	hasUnreadItems : function (idx) {
		if (typeof idx == 'undefined') {
			var len = this.visibleData.length;
			
			for (var idx = 0; idx < len; idx++) {
				if (!this.isContainer(idx) && !this.getCellRead(idx)) {
					return true;
				}
			}
			
			return false;
		}
		
		var key = this.visibleData[idx].id;
		var feedName = this.getCellText(idx);
		var toInsert = this.childData[key].items;
		var itemsInserted = 0;
		
		var displayPeriod = this.prefs.getIntPref("displayPeriod");
		var showReadItems = !this.prefs.getBoolPref("hideReadItems");
		
		if (displayPeriod > 0) {
			var mustBeAfter = (new Date()).getTime() - (displayPeriod * 24 * 60 * 60 * 1000);
		}
		
		for (var i = 0; i < toInsert.length; i++){
			if ((displayPeriod > 0) && (toInsert[i].published < mustBeAfter)) {
				continue;
			}
			
			if (!this.passesFilter(feedName + " " + toInsert[i].label + toInsert[i].description)) {
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
		var item = this.visibleData[idx];
		var itemStillExists = true;
		
		if (!item.isContainer) return;
		
		if (item.isOpen) {
			// Container is open, we need to close it.
			item.isOpen = false;
			
			var thisLevel = 0;
			var deleteCount = 0;
			
			for (var t = idx + 1; t < this.visibleData.length; t++){
				if (this.getLevel(t) > thisLevel) {
					deleteCount++;
				}
				else {
					break;
				}
			}
			
			if (deleteCount) {
				this.visibleData.splice(idx + 1, deleteCount);
				try { this.treeBox.rowCountChanged(idx + 1, -deleteCount); } catch (sidebarNotOpen) { }
			}
		}
		else {
			item.isOpen = true;
			
			var key = this.visibleData[idx].id;
			var feedName = this.getCellText(idx);
			var toInsert = this.childData[key].items;
			var itemsInserted = 0;
			
			// Optimize: if changing the display period to be *more* restrictive, we don't need to
			// collapse and expand each feed, we can just weed out the items that don't meet the criteria.
			
			// Optimize: ^ The same with the search filter.
			
			var displayPeriod = this.prefs.getIntPref("displayPeriod");
			var showReadItems = !this.prefs.getBoolPref("hideReadItems");
			
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
				
				if (!this.passesFilter(feedName + " " + toInsert[i].label + toInsert[i].description)) {
					continue;
				}
				
				this.visibleData.splice(idx + itemsInserted + 1, 0, { "id" : null, "label" : " " + toInsert[i].label, "isContainer" : false, "image" : toInsert[i].image, "uri" : toInsert[i].uri, "id" : toInsert[i].id, "visited" : toInsert[i].visited, "description" : toInsert[i].description, "published" : toInsert[i].published });
				++itemsInserted;
			}
			
			if (itemsInserted == 0) {
				// If it's empty, get rid of it.
				this.visibleData.splice(idx, 1);
				try { this.treeBox.rowCountChanged(idx, -1); } catch (sidebarNotOpen) { }
				itemStillExists = false;
			}
			else {
				try { this.treeBox.rowCountChanged(idx + 1, itemsInserted); } catch (sidebarNotOpen) { }
			}
		}
		
		if (itemStillExists) {
			this.storeOpenState(this.getCellID(idx), item.isOpen);
		}
		
		this.updateNotifier();
		
		return itemStillExists;
	},
	
    getImageSrc: function(idx){ 
		if (this.isContainer(idx)) {
			return "chrome://feedbar/content/skin-common/folder.png";
		}
		else {
			return this.visibleData[idx].image;
		}
	},
	
	canDrop : function (idx, orientation) { return false; },
	cycleCell : function (row, col) { },
	cycleHeader : function (col) { },
	drop : function (idx, orientation) { },
	
	getCellProperties: function (row, col, props) {
		if (!this.isContainer(row)) {
			if (this.getCellRead(row)) { 
				var atomService = Components.classes["@mozilla.org/atom-service;1"].
					getService(Components.interfaces.nsIAtomService);
				props.AppendElement(atomService.getAtom("visited"));
			}
		}
		else {
			if (!this.hasUnreadItems(row)) {
				var atomService = Components.classes["@mozilla.org/atom-service;1"].
					getService(Components.interfaces.nsIAtomService);
				props.AppendElement(atomService.getAtom("visited"));
			}
		}
	},
	
	getCellValue : function (row, col) { },
	
	getColumnProperties: function (colid,col,props) { },
	
	getProgressMode : function (row, col) { },
	
	getRowProperties: function (row,props) {
		if (!this.isContainer(row)) {
			if (this.getCellRead(row)) { 
				var atomService = Components.classes["@mozilla.org/atom-service;1"].
					getService(Components.interfaces.nsIAtomService);
				props.AppendElement(atomService.getAtom("visited"));
			}
		}
		else {
			if (!this.hasUnreadItems(row)) {
				var atomService = Components.classes["@mozilla.org/atom-service;1"].
					getService(Components.interfaces.nsIAtomService);
				props.AppendElement(atomService.getAtom("visited"));
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
		var showReadItems = !this.prefs.getBoolPref("hideReadItems");
		
		for (var i = 0; i < feedObject.items.length; i++) {
			var item = feedObject.items[i];
			
			toInsert.push( { "label" : item.label, "image" : item.image, "visited" : item.visited, "uri" : item.uri, "id" : item.id, "published" : item.published, "description" : item.description } );
			
			/*
			Components.utils.import("resource://gre/modules/json.jsm");

			try {
				var s = JSON.toString(toInsert);
			} catch (e) {
				var s = '';
				for (var x in item) {
					s += x + ": " + item[x] + "\t";
				}
				alert("Found it: " + s);
				return;
			}
			*/
			
			if (showReadItems || !item.visited) {
				hasVisible = true;
			}
		}
		
		this.childData[feedObject.id] = { "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : feedObject.label, "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image, "items" : [] };
		this.childData[feedObject.id].items = toInsert;
		
		var folderIdx = -1;
		var wasLeftOpen = false;
		
		var selectedIdx = this.getSelectedIndex();
		var selFeedId = null;
		
		if (selectedIdx >= 0) {
			if (this.isContainer(selectedIdx)) {
				selFeedId = this.visibleData[selectedIdx].id;
			}
			else {
				selFeedId = this.visibleData[this.getParentIndex(selectedIdx)].id;
			}
		}
		
		var reselect = false;
		
		if (selFeedId && selFeedId == feedObject.id) {
			// The selected item is in this feed.
			
			reselect = this.visibleData[selectedIdx].id;
		}
		
		// Check if this feed is alredy being displayed.  If it is, toggle it closed so that we can use the toggleOpenState function to 
		// replace the children.
		for (var idx = 0; idx < this.visibleData.length; idx++) {
			if (this.isContainer(idx) && this.getCellID(idx) == feedObject.id) {
				var folderIdx = idx;
				
				if (this.isContainerOpen(folderIdx)) {
					wasLeftOpen = true;
					this.toggleOpenState(folderIdx);
				}
				
				if (!hasVisible) {
					this.visibleData.splice(folderIdx, 1);
					try { this.treeBox.rowCountChanged(folderIdx, -1); } catch (sidebarNotOpen) { }
				}
				
				break;
			}
		}
		
		if (hasVisible) {
			if (folderIdx < 0) {
				this.visibleData.push({ "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : " " + feedObject.label.replace(/^\s+/g, ""), "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image });
				try { this.treeBox.rowCountChanged(this.rowCount - 1, 1); } catch (sidebarNotOpen) { }
				folderIdx = this.rowCount - 1;
			}
			
			wasLeftOpen = wasLeftOpen || this.wasLeftOpen(feedObject.id);
			
			if (wasLeftOpen) {
				// Re-use the toggling code so that we don't have to manually add
				// the sub-items.
				this.toggleOpenState(folderIdx);
			}
			else {
				if (this.toggleOpenState(folderIdx)) {
					this.toggleOpenState(folderIdx);
				}
			}
		}
		
		if (reselect) {
			var i = folderIdx;
			var len = this.visibleData.length;
			
			while (i < len) {
				if (this.visibleData[i].id == reselect) {
					// Select this item.
					this.treeBox.view.selection.select(i);
					break;
				}
				
				++i;
				
				if (this.isContainer(i)) {
					break;
				}
			}
		}
		
		this.updateNotifier();
	},
	
	renameFeed : function (id, label) {
		for (var idx = 0; idx < this.visibleData.length; idx++) {
			if (this.isContainer(idx) && this.getCellLivemarkId(idx) == id) {
				this.visibleData[idx].label = " " + label.replace(/^\s+/g, "");
				try { this.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { alert(sidebarNotOpen); }
				break;
			}
		}
	},
	
	selectNone : function () {
		this.treeBox.view.selection.select(-1);
	},
	
	updateNotifier : function () {
		if (this.hasUnreadItems()) {
			try { document.getElementById("feedbar-button").setAttribute("new","true"); } catch (e) { }
		}
		else {
			try { document.getElementById("feedbar-button").setAttribute("new","false"); } catch (e) { }
		}
	},
	
	pushFromChildData : function (feedId) {
		var feedObject = this.childData[feedId];
		this.push(feedObject);
	},
	
	filter : function (dontRefresh) {
		var filter = this.prefs.getCharPref("filter");
		this.searchFilter.length = 0;
		
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
					this.searchFilter.push( { "nomatch" : nomatch, "regex" : new RegExp(filterParts[i], "i") } );
				}
			}
		}
		
		if (!dontRefresh) FEEDBAR.refreshTree();
	},
	
	getCellRead : function (idx) {
		return this.visibleData[idx].visited;
	},
	
	setCellRead : function (idx, updateUI) {
		var cellID = this.getCellID(idx);
		
		// Add to DB
		var db = this.getDB();
		
		var insert = db.createStatement("INSERT INTO history (id, date) VALUES (?1, ?2)");
		insert.bindUTF8StringParameter(0, cellID);
		insert.bindInt64Parameter(1, (new Date().getTime()));
		
		try { insert.execute(); } catch (duplicateKey) { }
		
		this.closeDB(db);
		
		// Find it in the childData object to set its "visited" property permanently.
		var parentIdx = this.getParentIndex(idx);
		var parentID = this.getCellID(parentIdx);
		
		for (var i = 0; i < this.childData[parentID].items.length; i++) {
			if (this.childData[parentID].items[i].id == cellID) {
				this.childData[parentID].items[i].visited = true;
				break;
			}
		}
		
		if (this.prefs.getBoolPref("hideReadItems") && updateUI) {
			var rowsRemoved = 1;
			
			// If the containing folder is now empty, remove it.
			if ((parentIdx == (idx - 1)) && ((idx + 1) >= this.visibleData.length || this.isContainer(idx + 1))) {
				idx = parentIdx;
				++rowsRemoved;
			}
			
			this.visibleData.splice(idx, rowsRemoved);
			try { this.treeBox.rowCountChanged(idx, -rowsRemoved); } catch (sidebarNotOpen) { }
		}
		else {
			this.visibleData[idx].visited = true;
			
			if (updateUI) {
				try { this.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { }
			}
		}
		
		this.updateNotifier();
	},

	setCellUnread : function (idx) {
		var cellID = this.getCellID(idx);
		
		// Remove from history DB
		var db = this.getDB();
		
		var deleteSql = db.createStatement("DELETE FROM history WHERE id=?1");
		deleteSql.bindUTF8StringParameter(0, cellID);
		
		try { deleteSql.execute(); } catch (e) { }
		
		this.closeDB(db);
		
		// Find it in the childData object to set its "visited" property permanently.
		var parentIdx = this.getParentIndex(idx);
		var parentID = this.getCellID(parentIdx);
		
		for (var i = 0; i < this.childData[parentID].items.length; i++) {
			if (this.childData[parentID].items[i].id == cellID) {
				this.childData[parentID].items[i].visited = false;
				break;
			}
		}
		
		this.visibleData[idx].visited = false;
		
		// Parent style may have changed.
		try { this.treeBox.invalidateRow(parentIdx); } catch (sidebarNotOpen) { }
		try { this.treeBox.invalidateRow(idx); } catch (sidebarNotOpen) { }
		
		this.updateNotifier();
	},
	
	getLinkForCell : function (idx) {
		return this.visibleData[idx].uri;
	},
	
	getSelectedIndex : function () {
		if (this.selection) {
			var range = this.selection.getRangeCount();
		
			for (var i = 0; i < range; i++) {
				var start = {};
				var end = {};
				this.selection.getRangeAt(i, start, end);
				return start.value;
			}
		}
		
		return -1;
	},
	
/**
 * Functions for usage/user-interaction.
 */
	
	prefs : null,
	get strings() { return document.getElementById("feedbar-string-bundle"); },
	
	load : function () {
		this.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.feedbar.");	
		this.prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.prefs.addObserver("", this, false);
		
		this.filter(true);
		
		if (this.prefs.getBoolPref("firstRun")) {
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
			this.prefs.setBoolPref("firstRun", false);
		}
		
		var db = this.getDB();
		
		if (!db.tableExists("history")) {
			db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS history (id TEXT PRIMARY KEY, date INTEGER)");
		}
		if (!db.tableExists("state")) {
			db.executeSimpleSQL("CREATE TABLE IF NOT EXISTS state (id TEXT PRIMARY KEY, open INTEGER)");
		}
		
		this.closeDB(db);
		
		try {
			Components.utils.import("resource://gre/modules/json.jsm");
			
			var file = Components.classes['@mozilla.org/file/directory_service;1']
                            .getService(Components.interfaces.nsIProperties) //changed by <asqueella@gmail.com>
                            .get("ProfD", Components.interfaces.nsIFile);
			file.append("feedbar.cache");
			
			var data     = new String();
			var fiStream = Components.classes['@mozilla.org/network/file-input-stream;1']
							.createInstance(Components.interfaces.nsIFileInputStream);
			var siStream = Components.classes['@mozilla.org/scriptableinputstream;1']
							.createInstance(Components.interfaces.nsIScriptableInputStream);
			fiStream.init(file, 1, 0, false);
			siStream.init(fiStream);
			data += siStream.read(-1);
			siStream.close();
			
			this.childData = JSON.fromString(data);
			this.refreshTree();
			this.updateNotifier();
		} catch (e) {
			// logFeedbarMsg("Error: " + e);
			// alert(e);
		}
		
		setTimeout(FEEDBAR.showFirstRun, 1500);
		// setTimeout(FEED_GETTER.updateFeeds, 2500, 1);
	},
	
	tryAndRemoveFeed : function (livemarkId) {
		for (var i in this.childData) {
			if (this.childData[i].livemarkId == livemarkId) {
				var feedId = i;
				delete this.childData[i];
				
				var len = this.visibleData.length;
				
				for (var j = 0; j < len; j++) {
					if (this.isContainer(j) && this.visibleData[j].id == feedId) {
						// Remove this.
						var itemsRemoved = 1;
						
						for (var k = j + 1; k < len; k++) {
							if (this.isContainer(k)) {
								break;
							}
							
							++itemsRemoved;
						}
						
						this.visibleData.splice(j, itemsRemoved);
						try { this.treeBox.rowCountChanged(j, (itemsRemoved * -1)); } catch (sidebarNotOpen) { }
						break;
					}
				}
				
				break;
			}
		}
	},
	
	showFirstRun : function () {
		if (FEEDBAR.prefs.getCharPref("lastVersion") != '3.0') {
			FEEDBAR.prefs.setCharPref("lastVersion","3.0");
			var theTab = gBrowser.addTab("http://www.chrisfinke.com/firstrun/feedbar/3.0/");
			gBrowser.selectedTab = theTab;
		}
	},
	
	unload : function () {
		this.prefs.removeObserver("", this);
		
		try {
			Components.utils.import("resource://gre/modules/json.jsm");
			
			var data = JSON.toString(this.childData);
			
			var file = Components.classes['@mozilla.org/file/directory_service;1']
                            .getService(Components.interfaces.nsIProperties)
                            .get("ProfD", Components.interfaces.nsIFile);
			file.append("feedbar.cache");
			
			var foStream = Components.classes['@mozilla.org/network/file-output-stream;1']
								.createInstance(Components.interfaces.nsIFileOutputStream);
			var flags = 0x02 | 0x08 | 0x20; // wronly | create | truncate
			foStream.init(file, flags, 0664, 0);
			foStream.write(data, data.length);
			foStream.close();
		} catch (e) {
			this.prefs.setIntPref("lastUpdate", 0);
		
			/*
			var s = '';
			for (var i in e) {
				s += i + ": " + e[i] + "\t";
			}
			alert(s);
			*/
		}
	},
	
	observe : function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		
		switch(data) {
			case "displayPeriod":
				this.refreshTree();
			break;
			case "hideReadItems":
				this.refreshTree();
			break;
			case "filter":
				this.filter();
			break;
		}
	},
	
	refreshTree : function () {
		this.startBatch();
		
		// Clear out visible data.
		var rows = this.visibleData.length;
		
		this.visibleData.splice(0, rows);
		try { this.treeBox.rowCountChanged(0, -rows); } catch (sidebarNotOpen) { }
		
		// Re-populate the tree.
		for (var i in this.childData) {
			this.pushFromChildData(i);
		}
		
		this.updateNotifier();
		this.endBatch();
	},
	
	wasLeftOpen : function (idx) {
		var openContainer = true;
		
		var db = this.getDB();
		var select = db.createStatement("SELECT open FROM state WHERE id=?1");
		select.bindStringParameter(0, idx);
		
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
		
		this.closeDB(db);
		
		return openContainer;
	},
	
	itemSelect : function (event) {
		// Show the preview
		// alert(event);
	},
	
	onTreeDblClick : function (event) {
	},
	
	onTreeClick : function (event, url) {
		// Discard right-clicks
		if (event.which == 3){
			FEED_GETTER.feedWindow.clearTimeout(FEEDBAR.previewTimeout);
			return;
		}
		
		if (!url && (this.prefs.getBoolPref("showFullPreview") || !navigator.onLine)) {
			FEEDBAR.handleOfflineTreeClick(event, url);
			return;
		}
		
		var targetIdx = this.getSelectedIndex();
		
		if (targetIdx >= 0) {
			if (!this.isContainer(targetIdx) && !url) {
				if (event.which == 2){
					this.launchUrl(this.getCellLink(targetIdx), event);
					this.setCellRead(targetIdx, true);
				}
				else if (event.which == 4){
					window.open(this.getCellLink(targetIdx));
				}
				else {
					// Left-click
					if (event.detail != 1){
						// Single-left-clicks are handled by onselect
						FEED_GETTER.feedWindow.clearTimeout(FEEDBAR.previewTimeout);
						
						this.launchUrl(this.getCellLink(targetIdx), event);
						this.setCellRead(targetIdx, true);
					}
				}
			}
			else {
				if (url) {
					if (event.which == 2){
						this.launchUrl(url, event);
					}
					else if (event.which == 4){
						window.open(url);
					}
					else {
						// Left-click
						this.launchUrl(url, event);
					}
				}
				
				return;
			}
		}
	},
	
	storeOpenState : function (cellId, openState) {
		var db = this.getDB();
		
		var insert = db.createStatement("INSERT INTO state (id, open) VALUES (?1, ?2)");
		insert.bindStringParameter(0, cellId);
		insert.bindInt32Parameter(1, +openState);
	
		try {
			insert.execute();
		} catch (e) {
			var update = db.createStatement("UPDATE state SET open=?1 WHERE id=?2");
			update.bindInt32Parameter(0, +openState);
			update.bindStringParameter(1, cellId);
		
			try {
				update.execute();
			} catch (e) {
			}
		}
		
		this.closeDB(db);
	},
	
	get inBatch() { 
		return (FEEDBAR._batchCount > 0);
	},
	
	openItem : function () {
		this.onTreeClick({ which : 1, detail : 2});
	},
	
	openInWindow : function () {
		this.onTreeClick({ which : 4, detail : 2});
	},
	
	openInTab : function () {
		this.onTreeClick({ which : 2, detail : 1});
	},
	
	openAll : function () {
		var numItems = 0;
		
		for (var i = 0; i < this.visibleData.length; i++) {
			if (!this.isContainer(i)) {
				++numItems;
			}
		}
		
		var hideRead = this.prefs.getBoolPref("hideReadItems");
		
		if (this.confirmOpenTabs(numItems)) {
			for (var i = 0; i < this.visibleData.length; i++) {
				if (!this.isContainer(i)) {
					if (!navigator.onLine || this.prefs.getBoolPref("showFullPreview")) {
						this.loadFullPreview(i, { 'which' : 2, detail : 1}, hideRead);
					}
					else {
						this.launchUrl(this.getCellLink(i), { which : 2, detail : 1});
					}
				}
			}
			
			this.markAllAsRead();
			this.updateNotifier();
		}
	},
	
	openFeed : function () {
		var numItems = 0;
		var folderIdx = this.getSelectedIndex();
		
		for (var i = folderIdx + 1; (i < this.visibleData.length && !this.isContainer(i)); i++) {
			++numItems;
		}
		
		var hideRead = this.prefs.getBoolPref("hideReadItems");
		
		if (this.confirmOpenTabs(numItems)) {
			var idx = folderIdx + 1;
			
			for (var i = 0; i < numItems; i++) {
				if (!navigator.onLine || this.prefs.getBoolPref("showFullPreview")) {
					this.loadFullPreview(idx + i, { 'which' : 2, detail : 1}, hideRead);
				}
				else {
					this.launchUrl(this.getCellLink(idx + i), { which : 2, detail : 1});
				}
			}
			
			this.markFeedAsRead(folderIdx);
			this.updateNotifier();
		}
	},
	
	markAsRead : function (dontMarkFeed) {
		var selectedIdx = this.getSelectedIndex();
		
		if (selectedIdx >= 0) {
			if (!this.isContainer(selectedIdx)) {
				this.setCellRead(selectedIdx, true);
			}
			else {
				if (!dontMarkFeed) {
					this.markFeedAsRead(selectedIdx);
				}
			}
		}
	},
	
	markAsUnread : function () {
		var selectedIdx = this.getSelectedIndex();
		
		if (!this.isContainer(selectedIdx)) {
			this.setCellUnread(selectedIdx);
		}
		else {
			this.markFeedAsUnread(selectedIdx);
		}
	},
	
	markFeedAsUnread : function (folderIdx) {
		this.startBatch();
		
		var wasOpen = this.isContainerOpen(folderIdx);
		
		if (!wasOpen) {
			// Open the feed so that it's children can be marked.
			// Not optimal.
			// Optimize: Don't rely on the visibleData array for marking a feed as read.
			// Mark the child items as read in the childData array and then remove the entire 
			// feed from the visibleData array, whether it's open or not.
			this.toggleOpenState(folderIdx);
		}
		
		// Mark all of this feed's visible cells as read.
		var nextFolderIdx = this.getNextSiblingIndex(folderIdx);
		
		if (nextFolderIdx != -1) {
			var itemIdx = nextFolderIdx - 1;
		}
		else {
			var itemIdx = this.visibleData.length - 1;
		}
		
		var itemsChanged = 0;
		
		while (itemIdx > folderIdx) {
			this.setCellUnread(itemIdx);
			++itemsChanged;
			
			--itemIdx;
		}
		
		if (!wasOpen) {
			this.toggleOpenState(folderIdx);
		}

		this.updateNotifier();
		this.endBatch();
	},
	
	markFeedAsRead : function (folderIdx) {
		this.startBatch();

		var wasOpen = this.isContainerOpen(folderIdx);
		
		if (!wasOpen) {
			// Open the feed so that it's children can be marked.
			// Not optimal.
			// Optimize: Don't rely on the visibleData array for marking a feed as read.
			// Mark the child items as read in the childData array and then remove the entire 
			// feed from the visibleData array, whether it's open or not.
			this.toggleOpenState(folderIdx);
		}
		
		// Mark all of this feed's visible cells as read.
		var nextFolderIdx = this.getNextSiblingIndex(folderIdx);
		
		if (nextFolderIdx != -1) {
			var itemIdx = nextFolderIdx - 1;
		}
		else {
			var itemIdx = this.visibleData.length - 1;
		}
		
		var lastItemIdx = itemIdx;
		var firstItemIdx = folderIdx + 1;
		
		var itemsChanged = 0;
		
		while (itemIdx > folderIdx) {
			this.setCellRead(itemIdx);
			++itemsChanged;
			
			--itemIdx;
		}
		
		if (this.prefs.getBoolPref("hideReadItems")) {
			this.visibleData.splice(folderIdx, itemsChanged + 1);
			try { this.treeBox.rowCountChanged(folderIdx, -(itemsChanged + 1)); } catch (sidebarNotOpen) { }
		}
		else {
			if (!wasOpen) {
				this.toggleOpenState(folderIdx);
			}
			else {
				try { this.treeBox.invalidateRange(folderIdx, lastItemIdx); } catch (sidebarNotOpen) { }
			}
		}

		this.updateNotifier();
		this.endBatch();
	},
	
	startBatch : function () {
		++this._batchCount;
		if (!this.db) this.db = this.getDB();
	},
	
	endBatch : function () {
		--this._batchCount;
		
		if (!this._batchCount) {
			try { this.db.close(); } catch (e) { }
			this.db = null;
		}
	},
	
	markAllAsRead : function () {
		this.startBatch();
		
		if (this.prefs.getBoolPref("hideReadItems")) {
			while (this.visibleData.length > 0) {
				this.markFeedAsRead(0);
			}
		}
		else {
			var len = this.visibleData.length;
			
			for (var i = 0; i < len; i++) {
				if (this.isContainer(i)) {
					this.markFeedAsRead(i);
				}
			}
		}
		
		if (this.prefs.getBoolPref("autoClose") && this.prefs.getBoolPref("hideReadItems")) {
			toggleSidebar('feedbar');
		}
		
		this.endBatch();
	},
	
	markAllAsUnread : function () {
		this.startBatch();
		
		var len = this.visibleData.length;
		
		for (var i = 0; i < len; i++) {
			if (this.isContainer(i)) {
				this.markFeedAsUnread(i);
			}
		}
		
		this.endBatch();
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
		var idx = this.getSelectedIndex();
		var title = this.getCellText(idx).replace(/^\s+/g, "");
		this.clipboard.copyString(title);
	},
	
	copyLink : function () {
		var idx = this.getSelectedIndex();
		
		if (this.isContainer(idx)) {
			var link = this.getCellFeedLink(idx);
		}
		else {
			var link = this.getCellLink(idx);
		}
		
		this.clipboard.copyString(link);
	},
	
	unsubscribe : function () {
		var feedData = FEED_GETTER.feedData;
		
		var idx = this.getSelectedIndex();
		var feedKey = this.getCellID(idx);
		
		try {
			var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			
			try {
				var livemarkId = this.getCellLivemarkId(idx);
				bookmarkService.removeFolder(livemarkId);
			} catch (e) {
				this.tryAndRemoveFeed(livemarkId);
			}
			
			/*
			
			// This section is now covered by the bookmark listener.
			
			delete this.childData[feedKey];
			
			if (this.isContainerOpen(idx)) {
				this.toggleOpenState(idx);
			}
			
			this.visibleData.splice(idx, 1);
			try { this.treeBox.rowCountChanged(idx, -1); } catch (sidebarNotOpen) { }
			*/
		} catch (e) {
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
			
			var livemarkUrl = this.getCellFeedLink(idx);
			livemarkUrl = feedData[livemarkUrl.toLowerCase()].uri;
			var resource = getResource(livemarkUrl);
			
			if (resource) {
				var selection = createSelection(resource);
				BookmarksCommand.deleteBookmark(selection);
				
				// Remove this feed from both visibledata and childdata
				delete this.childData[feedKey];
				
				if (this.isContainerOpen(idx)) {
					this.toggleOpenState(idx);
				}
				
				this.visibleData.splice(idx, 1);
				try { this.treeBox.rowCountChanged(idx, -1); } catch (sidebarNotOpen) { }
			}
			else {
				alert(this.strings.getString("feedbar.errors.couldNotUnsubscribe"));
			}
		}

		this.updateNotifier();
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
	
	launchUrl : function (url, event) {
		if (this.prefs.getBoolPref("openInNewTab") || (event.which == 2) || (event.which == 1 && (event.ctrlKey || event.metaKey))){
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
		var browser = gBrowser;
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
		if (this.db) {
			return this.db;
		}
		
		var file = Components.classes["@mozilla.org/file/directory_service;1"]
		                     .getService(Components.interfaces.nsIProperties)
		                     .get("ProfD", Components.interfaces.nsIFile);
		file.append("feedbar.sqlite");

		var storageService = Components.classes["@mozilla.org/storage/service;1"]
		                        .getService(Components.interfaces.mozIStorageService);
		var mDBConn = storageService.openDatabase(file);
		
		return mDBConn;
	},
	
	closeDB : function (db) {
		if (!this.inBatch) {
			try { db.close(); } catch (e) { }
		}
	},
	
	passesFilter : function (str) {
		if (this.searchFilter.length == 0) {
			return true;
		}
		else {
			for (var i = 0; i < this.searchFilter.length; i++) {
				if (this.searchFilter[i].nomatch) {
					if (str.match(this.searchFilter[i].regex)) {
						return false;
					}
				}
				else {
					if (!str.match(this.searchFilter[i].regex)) {
						return false;
					}
				}
			}
		}
		
		return true;
	},
	
	loadFullPreview : function (idx, event, dontMark) {
		if (event.ctrlKey || event.metaKey || event.which == 2 || event.which == 4) {
			var openedTab = gBrowser.addTab("chrome://feedbar/content/full_preview.html?idx="+idx);
			gBrowser.selectedTab = openedTab;
		}
		else {
			var openedTab = gBrowser.selectedTab;
			content.document.location.href = "chrome://feedbar/content/full_preview.html?idx="+idx;
		}
		
		var item = this.visibleData[idx];
		
		var itemLabel = item.label;
		var itemUri = item.uri;
		var feed = this.visibleData[this.getParentIndex(idx)];
		var feedUri = feed.uri;
		var feedLabel = feed.label;
		var siteUri = feed.siteUri;
		var image = item.image;
		var pubDate = new Date();
		pubDate.setTime(item.published);
		
		function onTabLoaded() { 
			this.removeEventListener("load", onTabLoaded, true);
			
			var doc = this.contentDocument.wrappedJSObject;

			doc.title = itemLabel;

			doc.getElementById("title").innerHTML = '<a href="'+itemUri+'">'+itemLabel+'</a>';

			var nav = '<a href="' + itemUri + '">'+FEEDBAR.strings.getString("feedbar.permalink")+'</a> &bull; <a href="'+feedUri+'">'+FEEDBAR.strings.getString("feedbar.feedLink")+'</a> &bull; <a href="'+siteUri+'">'+FEEDBAR.strings.getString("feedbar.siteLink")+"</a> &bull; " + FEEDBAR.strings.getFormattedString("feedbar.publishedOn", [pubDate, feedUri, feedLabel]);
			doc.getElementById("navigation").innerHTML = nav;

			var content = item.description;
			doc.getElementById("content").innerHTML = content;

			doc.getElementById("site-info").innerHTML = FEEDBAR.strings.getFormattedString("feedbar.previewHeader", [siteUri, feedLabel]);
			doc.getElementById("site-info").style.backgroundImage = "url("+image+")";
			
			if (!dontMark) {
				FEEDBAR.setCellRead(idx, true);
			}
		}
		
		var newTab = gBrowser.getBrowserForTab(openedTab);
		newTab.addEventListener("load", onTabLoaded, true);
	},
	
	previewLoaded : function (idx, browser, title) {
	},
	
	handlePreviewNameClick : function (event, url) {
		var targetIdx = this.getSelectedIndex();
		
		if (this.isContainer(targetIdx)) {
			this.launchUrl(url, event);	
		}
		else {
			this.handleOfflineTreeClick(event, url);
		}
	},
	
	handleOfflineTreeClick : function(event, url) {
		var targetIdx = this.getSelectedIndex();
		
		if (targetIdx >= 0) {
			if (!this.isContainer(targetIdx) && !url) {
				if (event.which == 2){
					this.loadFullPreview(targetIdx, event);
				}
				else if (event.which == 4){
					this.loadFullPreview(targetIdx, event);
				}
				else {
					// Left-click
					if (event.detail != 1){
						// Single-left-clicks are handled by onselect
						FEED_GETTER.feedWindow.clearTimeout(FEEDBAR.previewTimeout);
						
						this.loadFullPreview(targetIdx, event);
					}
				}
			}
			else {
				if (url) {
					this.loadFullPreview(targetIdx, event, url);
				}
				
				return;
			}
		}
		
	}
};