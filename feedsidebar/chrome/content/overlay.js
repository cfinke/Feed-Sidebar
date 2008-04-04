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
	
	hasUnreadItems : function (idx) {
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
				this.treeBox.rowCountChanged(idx + 1, -deleteCount);
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
				
				this.visibleData.splice(idx + itemsInserted + 1, 0, { "id" : null, "label" : " " + toInsert[i].label, "isContainer" : false, "image" : toInsert[i].image, "uri" : toInsert[i].uri, "id" : toInsert[i].id, "visited" : toInsert[i].visited, "description" : toInsert[i].description });
				++itemsInserted;
			}
			
			if (itemsInserted == 0) {
				// If it's empty, get rid of it.
				this.visibleData.splice(idx, 1);
				this.treeBox.rowCountChanged(idx, -1);
				itemStillExists = false;
			}
			else {
				this.treeBox.rowCountChanged(idx + 1, itemsInserted);
			}
		}
		
		if (itemStillExists) {
			this.storeOpenState(this.getCellID(idx), item.isOpen);
		}
		
		return itemStillExists;
	},
	
    getImageSrc: function(idx){ 
		if (this.isContainer(idx)) {
			return "chrome://feedbar/skin/icons/folder.png";
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
			
			if (showReadItems || !item.visited) {
				hasVisible = true;
			}
		}
		
		this.childData[feedObject.id] = { "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : feedObject.label, "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image, "items" : [] };
		this.childData[feedObject.id].items = toInsert;
		
		var folderIdx = -1;
		var wasLeftOpen = false;
		
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
					this.treeBox.rowCountChanged(folderIdx, -1);
				}
				
				break;
			}
		}
		
		if (hasVisible) {
			if (folderIdx < 0) {
				this.visibleData.push({ "id" : feedObject.id, "livemarkId" : feedObject.livemarkId, "label" : " " + feedObject.label.replace(/^\s+/g, ""), "isContainer" : true, "isOpen" : false, "uri" : feedObject.uri, "siteUri" : feedObject.siteUri, "description" : feedObject.description, "image" : feedObject.image });
				this.treeBox.rowCountChanged(this.rowCount - 1, 1);
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
	},
	
	pushFromChildData : function (feedId) {
		var feedObject = this.childData[feedId];
		this.push(feedObject);
	},
	
	filter : function (dontRefresh) {
		var filter = this.prefs.getCharPref("filter");
		this.searchFilter.length = 0;
		
		if (filter) {
			var filterParts = filter.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").split(" ");
		
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
		
		try { db.close(); } catch (e) { }
		
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
			this.treeBox.rowCountChanged(idx, -rowsRemoved);
		}
		else {
			this.visibleData[idx].visited = true;
		}
	},

	setCellUnread : function (idx) {
		var cellID = this.getCellID(idx);
		
		// Remove from history DB
		var db = this.getDB();
		
		var deleteSql = db.createStatement("DELETE FROM history WHERE id=?1");
		deleteSql.bindUTF8StringParameter(0, cellID);
		
		try { deleteSql.execute(); } catch (e) { }
		
		try { db.close(); } catch (e) { }
		
		// Find it in the childData object to set its "visited" property permanently.
		var parentIdx = this.getParentIndex(idx);
		var parentID = this.getCellID(parentIdx);
		
		for (var i = 0; i < this.childData[parentID].items.length; i++) {
			if (this.childData[parentID].items[i].id == cellID) {
				this.childData[parentID].items[i].visited = false;
				break;
			}
		}
		
		this.visibleData[idx].visited = true;
		this.treeBox.invalidateRow(idx);
		
		// Parent style may have changed.
		this.treeBox.invalidateRow(parentIdx);
	},
	
	getLinkForCell : function (idx) {
		return this.visibleData[idx].uri;
	},
	
	getSelectedIndex : function () {
		var range = this.selection.getRangeCount();
		
		for (var i = 0; i < range; i++) {
			var start = {};
			var end = {};
			this.selection.getRangeAt(i, start, end);
			return start.value;
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
		
		try { db.close(); } catch (e) { }
		
		if (this.prefs.getCharPref("lastVersion") != '2.0') {
			this.prefs.setCharPref("lastVersion","2.0");
			gBrowser.selectedTab = gBrowser.addTab("http://www.chrisfinke.com/firstrun/feedbar.html");
		}
	},
	
	unload : function () {
		this.prefs.removeObserver("", this);
		
		this.prefs.setIntPref("lastUpdate", 0);
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
		// Clear out visible data.
		var rows = this.visibleData.length;
		
		this.visibleData.splice(0, rows);
		this.treeBox.rowCountChanged(0, -rows);
		
		// Re-populate the tree.
		for (var i in this.childData) {
			this.pushFromChildData(i);
		}
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
		
		try { db.close() } catch (e) { } 
		
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
		
		try { db.close() } catch (e) { }
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
		
		if (this.confirmOpenTabs(numItems)) {
			for (var i = 0; i < this.visibleData.length; i++) {
				if (!this.isContainer(i)) {
					this.launchUrl(this.getCellLink(i), { which : 2, detail : 1});
				}
			}
		}
		
		var itemsRemoved = this.visibleData.length;
		
		this.visibleData.splice(0, itemsRemoved);
		this.treeBox.rowCountChanged(0, -itemsRemoved);
	},
	
	openFeed : function () {
		var numItems = 0;
		var folderIdx = this.getSelectedIndex();
		
		for (var i = folderIdx + 1; (i < this.visibleData.length && !this.isContainer(i)); i++) {
			++numItems;
		}
		
		if (this.confirmOpenTabs(numItems)) {
			var idx = folderIdx + 1;
			
			for (var i = 0; i < numItems; i++) {
				this.launchUrl(this.getCellLink(idx + i), { which : 2, detail : 1});
			}
		}
		
		this.markFeedAsRead(folderIdx);
	},
	
	markAsRead : function () {
		var selectedIdx = this.getSelectedIndex();
		
		if (!this.isContainer(selectedIdx)) {
			this.setCellRead(selectedIdx, true);
		}
		else {
			this.markFeedAsRead(selectedIdx);
		}
	},
	
	markAsUnread : function () {
		var selectedIdx = this.getSelectedIndex();

		if (!this.isContainer(selectedIdx)) {
			this.setCellUnread(selectedIdx);
		}
		/*
		else {
			this.markFeedAsUnread(selectedIdx);
		}
		*/
	},
	
	markFeedAsRead : function (folderIdx) {
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
			this.setCellRead(itemIdx);
			++itemsChanged;
			
			--itemIdx;
		}
		
		if (this.prefs.getBoolPref("hideReadItems")) {
			this.visibleData.splice(folderIdx, itemsChanged + 1);
			this.treeBox.rowCountChanged(folderIdx, -(itemsChanged + 1));
		}
		else {
			if (!wasOpen) {
				this.toggleOpenState(folderIdx);
			}
		}
	},
	
	markAllAsRead : function () {
		if (this.prefs.getBoolPref("hideReadItems")) {
			while (this.visibleData.length > 0) {
				this.markFeedAsRead(0);
			}
		}
		else {
			for (var i = 0; i < this.visibleData.length; i++) {
				if (this.isContainer(i)) {
					this.markFeedAsRead(i);
				}
			}
		}
	},
	
	unsubscribe : function () {
		var idx = this.getSelectedIndex();
		var feedKey = this.getCellID(idx);
		
		try {
			var bookmarkService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Components.interfaces.nsINavBookmarksService);
			var livemarkId = this.getCellLivemarkId(idx);
			bookmarkService.removeFolder(livemarkId);
			
			delete this.childData[feedKey];
			
			if (this.isContainerOpen(idx)) {
				this.toggleOpenState(idx);
			}
			
			this.visibleData.splice(idx, 1);
			this.treeBox.rowCountChanged(idx, -1);
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
			
			var livemarkUrl = this.getCellLink(idx);
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
				this.treeBox.rowCountChanged(idx, -1);
			}
			else {
				alert(this.strings.getString("feedbar.errors.couldNotUnsubscribe"));
			}
		}
		
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
		if ((event.which == 2) || (event.which == 1 && (event.ctrlKey || event.metaKey))){
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
		var file = Components.classes["@mozilla.org/file/directory_service;1"]
		                     .getService(Components.interfaces.nsIProperties)
		                     .get("ProfD", Components.interfaces.nsIFile);
		file.append("feedbar.sqlite");

		var storageService = Components.classes["@mozilla.org/storage/service;1"]
		                        .getService(Components.interfaces.mozIStorageService);
		var mDBConn = storageService.openDatabase(file);
		
		return mDBConn;
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
	}
};