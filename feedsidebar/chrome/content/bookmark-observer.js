var feedbarBookmarkObserver = {
	onBeginUpdateBatch: function() {
		// This method is notified when a batch of changes are about to occur.
		// Observers can use this to suspend updates to the user-interface, for example
		// while a batch change is occurring.
	},
	
	onEndUpdateBatch: function() {
		this._inBatch = false;
	},
	
	onItemAdded: function(id, folder, index) {
		// Handled by onItemChanged
	},
	
	onItemRemoved: function(id, folder, index) {
		// Determine if it's a livemark.
		// If it is, remove it from the tree.
		FEEDBAR.tryAndRemoveFeed(id);
	},
	
	onItemChanged: function(id, property, isAnnotationProperty, value) {
		// isAnnotationProperty is a boolean value that is true of the changed property is an annotation.
		// You can access a bookmark item's annotations with the <code>nsIAnnotationService</code>.
		if (property == "livemark/feedURI") {
			FEEDBAR.tryAndRemoveFeed(id);
			FEED_GETTER.updateSingleFeed(id);
		}
		else if (property == 'title') {
			FEEDBAR.renameFeed(id, value);
		}
	},
	
	onItemVisited: function(id, visitID, time) {
		// The visit id can be used with the History service to access other properties of the visit.
		// The time is the time at which the visit occurred, in microseconds.
	},
	
	onItemMoved: function(id, oldParent, oldIndex, newParent, newIndex) {
		// oldParent and newParent are the ids of the old and new parent folders of the moved item.
	},
	
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsINavBookmarkObserver) ||
			iid.equals(Ci.nsISupports)) {
			return this;
		}
		
		throw Cr.NS_ERROR_NO_INTERFACE;
	},
};

try {
	var bmsvc = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"].
            		getService(Components.interfaces.nsINavBookmarksService);
	bmsvc.addObserver(feedbarBookmarkObserver, false);

	window.addEventListener("unload", function () { bmsvc.removeObserver(feedbarBookmarkObserver); }, false);
} catch (firefox2) {
}