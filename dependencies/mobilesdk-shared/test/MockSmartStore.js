/*
 * Copyright (c) 2012, salesforce.com, inc.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided
 * that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of conditions and the
 * following disclaimer.
 *
 * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and
 * the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * Neither the name of salesforce.com, inc. nor the names of its contributors may be used to endorse or
 * promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
 * PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * MockSmartStore: a JavaScript SmartStore
 * Meant for development and testing only, the data is stored in SessionStorage, queries do full scans.
 *
 * Note: we are using the module pattern (see http://briancray.com/posts/javascript-module-pattern/)
 */

var MockSmartStore = (function(window) {
    // Private
    var _soups = {};     
    var _soupIndexedData = {}; 
    var _soupIndexSpecs = {};
    var _cursors = {};
    var _nextSoupEltIds = {};
    var _nextCursorId = 1;

    // Constructor
    var module = function() {}; 

    // Prototype
    module.prototype = {
        constructor: module,

        reset: function() {
            _soups = {};
            _soupIndexedData = {};
            _soupIndexSpecs = {};
            _cursors = {};
            _nextSoupEltIds = {};
            _nextCursorId = 1;
        },

        useSessionStorage: function() {
            if (window.sessionStorage) {
                // Restore smartstore from storage
                var STORAGE_KEY_MOCKSTORE = "mockStore";
                var json = window.sessionStorage.getItem(STORAGE_KEY_MOCKSTORE);
                if (json) {
                    console.log("Getting store from session storage");
                    mockStore.fromJSON(json);
                }
                // Save smartstore to storage when onBeforeUnload fires
                window.onbeforeunload = function() {
                    if (window.sessionStorage) {
                        console.log("Saving store to session storage");
                        var json = mockStore.toJSON();
                        window.sessionStorage.setItem(STORAGE_KEY_MOCKSTORE, json);
                    }
                };
            }
        },

        toJSON: function() {
            return JSON.stringify({
                soups: _soups,
                soupIndexedData: _soupIndexedData,
                soupIndexSpecs: _soupIndexSpecs,
                cursors: _cursors,
                nextSoupEltIds: _nextSoupEltIds,
                nextCursorId: _nextCursorId
            });
        },

        fromJSON: function(json) {
            var obj = JSON.parse(json);
            _soups = obj.soups;
            _soupIndexedData = obj.soupIndexedData;
            _soupIndexSpecs = obj.soupIndexSpecs;
            _cursors = obj.cursors;
            _nextSoupEltIds = obj.nextSoupEltIds;
            _nextCursorId = obj.nextCursorId;
        },

        checkSoup: function(soupName) {
            if (!this.soupExists(soupName))  throw new Error("Soup: " + soupName + " does not exist");
        },

        checkIndex: function(soupName, path) {
            if (["_soup", "_soupEntryId"].indexOf(path) == -1 && !this.indexExists(soupName, path)) throw new Error(soupName + " does not have an index on " + path); 
        },

        soupExists: function(soupName) {
            return _soups[soupName] !== undefined;
        },

        indexExists: function(soupName, indexPath) {
            var indexSpecs = _soupIndexSpecs[soupName];
            if (indexSpecs != null) {
                for (var i=0; i<indexSpecs.length; i++) {
                    var indexSpec = indexSpecs[i];
                    if (indexSpec.path == indexPath) {
                        return true;
                    }
                }
            }
            return false;
        },

        registerSoup: function(soupName, indexSpecs) {
            if (!this.soupExists(soupName)) {
                _soups[soupName] = {};
                _soupIndexSpecs[soupName] = indexSpecs;
                _soupIndexedData[soupName] = {};
            }
            return soupName;
        },

        removeSoup: function(soupName) {
            delete _soups[soupName];
            delete _soupIndexSpecs[soupName];
            delete _nextSoupEltIds[soupName];
        },

        getSoupIndexSpecs: function(soupName) {
            this.checkSoup(soupName); 
            return _soupIndexSpecs[soupName];
        },

        alterSoup: function(soupName, indexSpecs, reIndexData) {
            this.checkSoup(soupName); 

            // Gather path---type of old index specs
            var oldPathTypes = [];
            var oldIndexSpecs = _soupIndexSpecs[soupName];
            for (var i=0; i<oldIndexSpecs.length; i++) {
                var indexSpec = oldIndexSpecs[i];
                oldPathTypes.push(indexSpec.path + "---" + indexSpec.type);
            }

            // Update _soupIndexSpecs
            _soupIndexSpecs[soupName] = indexSpecs;

            // Update soupIndexedData
            var soup = _soups[soupName];
            _soupIndexedData[soupName] = {};
            var soupIndexedData = _soupIndexedData[soupName];
            for (var soupEntryId in soup) {
                soupIndexedData[soupEntryId] = {};
                var soupElt = soup[soupEntryId];

                for (var i=0; i<indexSpecs.length; i++) {
                    var path = indexSpecs[i].path;
                    var type = indexSpecs[i].type;
                    if (reIndexData || oldPathTypes.indexOf(path + "---" + type) >= 0) {
                        soupIndexedData[soupEntryId][path] = this.project(soupElt, path);
                    }
                }

            }

            return soupName;
        },

        reIndexSoup: function(soupName, paths) {
            this.checkSoup(soupName);

            var soup = _soups[soupName];
            var indexSpecs = _soupIndexSpecs[soupName];
            var soupIndexedData = _soupIndexedData[soupName];
            for (var soupEntryId in soup) {
                var soupElt = soup[soupEntryId];

                for (var i=0; i<indexSpecs.length; i++) {
                    var path = indexSpecs[i].path;
                    if (paths.indexOf(path) >= 0) {
                        soupIndexedData[soupEntryId][path] = this.project(soupElt, path);
                    }
                }

            }
            return soupName;
        },

        clearSoup: function(soupName) {
            this.checkSoup(soupName);
            _soups[soupName] = {};
            _soupIndexedData[soupName] = {};
        },

        upsertSoupEntries: function(soupName, entries, externalIdPath) {
            this.checkSoup(soupName); 
            if (externalIdPath != "_soupEntryId" && !this.indexExists(soupName, externalIdPath)) 
                throw new Error(soupName + " does not have an index on " + externalIdPath); 

            var soup = _soups[soupName];
            var soupIndexedData = _soupIndexedData[soupName];
            var indexSpecs = _soupIndexSpecs[soupName];
            var upsertedEntries = [];
            
            for (var i=0; i<entries.length; i++) {
                var entry = JSON.parse(JSON.stringify(entries[i])); // clone
                var isNew = true;

                // upsert by external id
                if (externalIdPath != "_soupEntryId") {
                    var externalId = this.project(entry, externalIdPath);
                    for (var soupEltId in soup) {
                        var soupElt = soup[soupEltId];
                        var projection = this.project(soupElt, externalIdPath);
                        if (projection == externalId) {
                            if (!isNew) {
                                msg = "There are more than one soup elements where " + externalIdPath + " is " + externalId;
                                console.error(msg);
                                throw new Error(msg);
                            }
                            entry._soupEntryId = soupEltId;
                            isNew = false;
                        }
                    }
                }

                // create
                if (!("_soupEntryId" in entry)) { 
                    _nextSoupEltIds[soupName] = (soupName in _nextSoupEltIds ? _nextSoupEltIds[soupName]+1 : 1);
                    entry._soupEntryId = _nextSoupEltIds[soupName];
                }
                
                // update/insert into soup
                soup[entry._soupEntryId] = entry;
                upsertedEntries.push(entry);

                // update _soupIndexedData
                var indexedData = {};
                for (var j=0; j<indexSpecs.length; j++) {
                    var path = indexSpecs[j].path;
                    indexedData[path] = this.project(entry, path);
                }
                soupIndexedData[entry._soupEntryId] = indexedData;
            }
            return upsertedEntries;
        },

        retrieveSoupEntries: function(soupName, entryIds) {
            this.checkSoup(soupName); 
            var soup = _soups[soupName];
            var entries = [];
            for (var i=0; i<entryIds.length; i++) {
                var entryId = entryIds[i];
                entries.push(soup[entryId]);
            }
            return entries;
        },

        removeFromSoup: function(soupName, entryIds) {
            this.checkSoup(soupName); 
            var soup = _soups[soupName];
            var soupIndexedData = _soupIndexedData[soupName];
            for (var i=0; i<entryIds.length; i++) {
                var entryId = entryIds[i];
                delete soup[entryId];
                delete soupIndexedData[entryId];
            }
        },

        project: function(soupElt, path) {
            var pathElements = path.split(".");
            var o = soupElt;
            for (var i = 0; i<pathElements.length; i++) {
                var pathElement = pathElements[i];
                o = o[pathElement];
            }
            return o;
        },

        smartQuerySoupFull: function(querySpec) {
            // NB we don't have full support evidently

            var smartSql = querySpec.smartSql;

            // SELECT {soupName:selectField} FROM {soupName} WHERE {soupName:whereField} IN (values)
            var m = smartSql.match(/SELECT {(.*):(.*)} FROM {(.*)} WHERE {(.*):(.*)} IN \((.*)\)/i);
            if (m != null && m[1] == m[3] && m[1] == m[4]) {
                var soupName = m[1];
                var selectField = m[2]
                var whereField = m[5];

                var values = m[6].split(",");
                for (var i=0; i<values.length; i++) {
                    values[i] = values[i].split("'")[1]; // getting rid of surrounding '
                }

                this.checkSoup(soupName); 
                this.checkIndex(soupName, selectField);
                this.checkIndex(soupName, whereField);
                var soup = _soups[soupName];
                var soupIndexedData = _soupIndexedData[soupName];

                var results = [];
                for (var soupEntryId in soup) {
                    var soupElt = soup[soupEntryId];
                    var value = (whereField == "_soupEntryId" ? soupEntryId : soupIndexedData[soupEntryId][whereField]);
                    if (values.indexOf(value) >= 0) {
                        var row = [];
                        row.push(selectField == "_soup" ? soupElt : (selectField == "_soupEntryId" ? soupEntryId : soupIndexedData[soupEntryId][selectField]));
                        results.push(row);
                    }
                }

                return results;
            }

            // Query with where clause {soup:field} like 'value'
            // SELECT {soupName:_soup} FROM {soupName} WHERE {soupName:whereField} LIKE 'value'
            // Case-insensitive sorted like query
            // SELECT {soupName:_soup} FROM {soupName} WHERE {soupName:whereField} LIKE 'value' ORDER BY LOWER({soupName:orderByField})
            var m = smartSql.match(/SELECT {(.*):_soup} FROM {(.*)} WHERE {(.*):(.*)} LIKE '(.*)'(?: ORDER BY LOWER\({(.*):(.*)}\))?/i);
            if (m != null && m[1] == m[2] && m[1] == m[3] && (!m[6] || m[1] == m[6])) {
                var soupName = m[1];
                var whereField = m[4];
                var likeRegexp = new RegExp("^" + m[5].replace(/%/g, ".*"), "i");
                var orderField = m[6] ? m[7] : null;

                this.checkSoup(soupName); 
                this.checkIndex(soupName, whereField);
                if (orderField) this.checkIndex(soupName, orderField);
                var soup = _soups[soupName];
                var soupIndexedData = _soupIndexedData[soupName];

                var results = [];
                for (var soupEntryId in soup) {
                    var soupElt = soup[soupEntryId];
                    var projection = soupIndexedData[soupEntryId][whereField];
                    if (projection.match(likeRegexp)) {
                        var row = [];
                        row.push(soupElt);
                        results.push(row);
                    }
                }

                if (orderField) {
                    results = results.sort(function(row1, row2) {
                        var p1 = row1[0][orderField].toLowerCase();
                        var p2 = row2[0][orderField].toLowerCase();
                        return ( p1 > p2 ? 1 : (p1 == p2 ? 0 : -1));
                    });
                }

                return results;
            }

            // SELECT count(*) FROM {soupName}
            var m = smartSql.match(/SELECT count\(\*\) FROM {(.*)}/i);
            if (m != null) {
                var soupName = m[1];
                this.checkSoup(soupName); 
                var soup = _soups[soupName];
                var count = 0;
                for (var soupEntryId in soup) {
                    count++;
                }
                return [[count]];
            }

            // If we get here, it means we don't support that query in the mock smartstore
            throw new Error("SmartQuery not supported by MockSmartStore:" + smartSql);
        },

        querySoupFull: function(soupName, querySpec) {
            if (querySpec.queryType == "smart") {
                return this.smartQuerySoupFull(querySpec);
            }

            // other query type
            this.checkSoup(soupName); 
            this.checkIndex(soupName, querySpec.indexPath);

            var soup = _soups[soupName];
            var soupIndexedData = _soupIndexedData[soupName];
            var results = [];
            var likeRegexp = (querySpec.likeKey ? new RegExp("^" + querySpec.likeKey.replace(/%/g, ".*"), "i") : null);
            for (var soupEntryId in soup) {
                var soupElt = soup[soupEntryId];
                var projection = soupIndexedData[soupEntryId][querySpec.indexPath];
                if (querySpec.queryType === "exact") {
                    if (projection == querySpec.matchKey) {
                        results.push(soupElt);
                    }
                }
                else if (querySpec.queryType === "range") {
                    if ((querySpec.beginKey == null || projection >= querySpec.beginKey)
                        && (querySpec.endKey == null || projection <= querySpec.endKey)) {
                        results.push(soupElt);
                    }
                }
                else if (querySpec.queryType === "like") {
                    if (projection.match(likeRegexp)) {
                        results.push(soupElt);
                    }
                }
            }

            results = results.sort(function(soupElt1,soupElt2) {
                var p1 = soupElt1[querySpec.indexPath];
                var p2 = soupElt2[querySpec.indexPath];
                var compare = ( p1 > p2 ? 1 : (p1 == p2 ? 0 : -1));
                return (querySpec.order == "ascending" ? compare : -compare);
            });

            return results;
        },


        querySoup: function(soupName, querySpec) {
            var results = this.querySoupFull(soupName, querySpec);
            var cursorId = _nextCursorId++;
            var cursor = {
                cursorId: cursorId, 
                soupName: soupName, 
                querySpec: querySpec, 
                pageSize: querySpec.pageSize,
                currentPageIndex: 0,
                currentPageOrderedEntries: results.slice(0, querySpec.pageSize),
                totalPages: Math.ceil(results.length / querySpec.pageSize),
                totalEntries: results.length
            };

            _cursors[cursorId] = cursor;
            return cursor;
        },

        moveCursorToPage: function(cursorId, pageIndex) {
            var cursor = _cursors[cursorId];
            var querySpec = cursor.querySpec;
            var results = this.querySoupFull(cursor.soupName, querySpec);

            cursor.currentPageIndex = pageIndex;
            cursor.currentPageOrderedEntries = results.slice(pageIndex*querySpec.pageSize, (pageIndex+1)*querySpec.pageSize);

            return cursor;
        },

        closeCursor: function(cursorId) {
            delete _cursors[cursorId];
        },

        hookToCordova: function(cordova) {
            var SMARTSTORE_SERVICE = "com.salesforce.smartstore";
            var self = this;

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgGetDatabaseSize", function (successCB, errorCB, args) {
                successCB(self.toJSON().length);
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgRegisterSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var indexSpecs = args[0].indexes;
                if (soupName == null) {errorCB("Bogus soup name: " + soupName); return;}
                if (indexSpecs !== undefined && indexSpecs.length == 0) {errorCB("No indexSpecs specified for soup: " + soupName); return;}
                successCB(self.registerSoup(soupName, indexSpecs));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgRemoveSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                self.removeSoup(soupName);
                successCB("OK");
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgClearSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                self.clearSoup(soupName);
                successCB("OK");
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgGetSoupIndexSpecs", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                if (soupName == null) {errorCB("Bogus soup name: " + soupName); return;}
                successCB(self.getSoupIndexSpecs(soupName));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgAlterSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var indexSpecs = args[0].indexes;
                var reIndexData = args[0].reIndexData;
                if (soupName == null) {errorCB("Bogus soup name: " + soupName); return;}
                successCB(self.alterSoup(soupName, indexSpecs, reIndexData));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgReIndexSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var paths = args[0].paths;
                if (soupName == null) {errorCB("Bogus soup name: " + soupName); return;}
                successCB(self.reIndexSoup(soupName, paths));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgSoupExists", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                successCB(self.soupExists(soupName));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgQuerySoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var querySpec = args[0].querySpec;
                successCB(self.querySoup(soupName, querySpec));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgRunSmartQuery", function (successCB, errorCB, args) {
                var querySpec = args[0].querySpec;
                successCB(self.querySoup(null, querySpec));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgRetrieveSoupEntries", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var entryIds = args[0].entryIds;
                successCB(self.retrieveSoupEntries(soupName, entryIds));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgUpsertSoupEntries", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var entries = args[0].entries;
                var externalIdPath = args[0].externalIdPath;
                successCB(self.upsertSoupEntries(soupName, entries, externalIdPath));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgRemoveFromSoup", function (successCB, errorCB, args) {
                var soupName = args[0].soupName;
                var entryIds = args[0].entryIds;
                self.removeFromSoup(soupName, entryIds);
                successCB("OK");
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgMoveCursorToPageIndex", function (successCB, errorCB, args) {
                var cursorId = args[0].cursorId;
                var index = args[0].index;
                successCB(self.moveCursorToPage(cursorId, index));
            });

            cordova.interceptExec(SMARTSTORE_SERVICE, "pgCloseCursor", function (successCB, errorCB, args) {
                var cursorId = args[0].cursorId;
                self.closeCursor(cursorId);
                if (successCB) {
                    successCB("OK");
                }
            });
        }

    };

    // Return module
    return module;
})(window);

var mockStore = new MockSmartStore();
mockStore.hookToCordova(cordova);
