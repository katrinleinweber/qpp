// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2011 Google Inc. johnjbarton@google.com

// A traceur RemoteWebPageProject that adds tracing to every compile

(function(){

  'use strict';

  var debug = DebugLogger.register('QPProject', function(flag){
    return debug = (typeof flag === 'boolean') ? flag : debug;
  });


  var RemoteWebPageProject = Querypoint.RemoteWebPageProject;

  function QPProject(url, loads) {
    RemoteWebPageProject.call(this, url);

    this.numberOfReloads = loads; 

    // FIXME override parent __getter__ for reporter
    this.reporter_ = new QPErrorReporter();
    this._fileCompiler = new Querypoint.QPFileCompiler(this.reporter_);
    this.compiler_ = new QPCompiler(this._fileCompiler, {}); // TODO traceur options
        
    this.querypoints = Querypoint.Querypoints.initialize();
    this.elementQueries = [Querypoint.ElementChangeQuery];
    
    this.runtime = Querypoint.QPRuntime.initialize();

    Querypoint.QPPreprocessor.useAsyncPreprocessor = true;
    
    if (debug) console.log("QPProject ctor using " + (Querypoint.QPPreprocessor.useAsyncPreprocessor?'async':'sync') +" preprocessor for "+url);
  }

  QPProject.prototype = {
    __proto__: RemoteWebPageProject.prototype,

    reporter: function() {
      return this.reporter_;
    },
        
    compile: function(onAllCompiled) {
      function onScriptsReady() {
        this.compiler_.compile(this);
        onAllCompiled(this.parseTrees_); 
      }
      if (this.remoteScripts && this.remoteScripts.length) 
        this.addFilesFromScriptElements(this.remoteScripts, onScriptsReady.bind(this));
      else 
        onAllCompiled(this.parseTrees_);
    },
   
    transformDescriptions: function() {
      var transformDescriptions = this.querypoints.tracequeries.reduce(function(descriptions, tq) {
        return descriptions.concat(tq.transformDescriptions());
      }, []);
      transformDescriptions.push({ctor: 'QPFunctionPreambleTransformer'});
      return transformDescriptions;
    },

    // Called by runInWebPage
    generateSourceFromTrees: function(treeObjectMap) {
      if (!treeObjectMap)
        return [];

      return treeObjectMap.keys().map(function(file) {
        var tree = treeObjectMap.get(file);  
        file.generatedFileName = file.name + ".js";
        file.generatedSource = this._fileCompiler.generateSourceFromTree(tree, file.generatedFileName, this.transformDescriptions());
        return file; 
      }.bind(this));
    },

    startRuntime: function() {
      function startRuntime() {  // runs in web page
        try {
          window.__qp.fireLoad();
          return window.__qp_reloads;
        } catch(exc) {
          return exc.toString();
        }
      }
      function onRuntimeStarted(results, isException) {
        if (isException) {
          console.error("startRuntime FAILS");
        } else {
          if (debug) console.log("QP runtime called fireLoad() got "+results);
        }
      }
      chrome.devtools.inspectedWindow.eval(this.evalStringify(startRuntime, []), onRuntimeStarted);
    },

    runInWebPage: function(treeObjectMap) {
      Querypoint.QPRuntime.initialize();
      // inject the tracing source, if we are using the async preprocessor
      if (Querypoint.QPPreprocessor.useAsyncPreprocessor)
        RemoteWebPageProject.prototype.runInWebPage.call(this, treeObjectMap);
      this.startRuntime();
    },

    isGeneratedFile: function(name){
      return Object.keys(this.sourceFiles_).some(function(key) {
        return (this.sourceFiles_[key].generatedFileName === name);
      }.bind(this));
    },

    treeFinder: function() {
      return Querypoint.FindInTree;
    },

    getTreeByName: function(name) {
      var sourceFile = this.getFile(name);  
      if (sourceFile)
        return this.getParseTree(sourceFile);
    },

    find: function(name, offset) {
      var tree = this.getTreeByName(name);
      if (tree)
        return this.treeFinder().byOffset(tree, offset);
    },

    getMatchingQuery: function(ctor, queryData) {
      var match; 
      this.querypoints.tracequeries.some(function(query){
        match = query.matches(ctor, queryData) ? query : undefined;
        return match;
      });
      return match;
    },

    addScript: function(url) {
      if (debug) console.log("QPProject got new script " + url);
    },

    reload: function() {    
      this.querypoints.tracequeries.forEach(function(tq) {
        Querypoint.QPRuntime.appendSource(tq.runtimeSource());
      });
      
      this._reloading = true;
      
      var onNavigated = function(url) {
        chrome.devtools.network.onNavigated.removeListener(onNavigated);
        if (url !== this.url) {
          console.error("QPProject reload failed: url mismatch: " + url + '!==' + this.url);
        }
        this.runInWebPage(this.parseTrees_);
        delete this._reloading;        
      }.bind(this);
          
      chrome.devtools.network.onNavigated.addListener(onNavigated);
      
      var transcoder = Querypoint.QPPreprocessor.transcoder(
        this.transformDescriptions(),
        this._reload.bind(this, ++this.numberOfReloads)
      );       
      
      return this.numberOfReloads;
    },
    
    _reload: function(numberOfReloads, transcoder) {
      console.assert(typeof numberOfReloads === 'number');

      var reloadOptions = {
        ignoreCache: true, 
        injectedScript:  Querypoint.QPRuntime.runtimeSource(numberOfReloads), 
        preprocessingScript: '(' + transcoder + ')'
      };
      if (debug) console.log("reloadOptions.preprocessingScript ", reloadOptions.preprocessingScript);
      chrome.devtools.inspectedWindow.reload(reloadOptions);
    },
    
    onReload: function(callback) {
      if (this._reloading)
        return;
     
      callback();  // allow the UI to update
    },
    
    // These functions hide features depending on traceur and running in this window from
    // functions running in the UI window (Panel)
    lineModelTraceVisitor: function(sourceFile) {
      return new Querypoint.LineModelTraceVisitor(this, sourceFile);
    },
    
    treeHangerTraceVisitor: function() {
      return new Querypoint.TreeHangerTraceVisitor(this);
    },
    
    createFileURL: function(filename, startOffset, endOffset) {
      return filename + '?start=' + startOffset + '&end=' + endOffset + '&';
    },
  
    parseFileURL: function(fileURL) {
      var m = reFileURL.exec(fileURL);
      if (m) {
        return {
          filename: m[1],
          startOffset: parseInt(m[2], 10),
          endOffset: parseInt(m[3], 10)
        };
      }
    },

  };
  
  var reFileURL = /([^\?]*)\?start=([^&]*)&end=([^&]*)&/;
  
  window.Querypoint = window.Querypoint || {};
  window.Querypoint.QPProject = QPProject;
  window.Querypoint.generateFileName =function (location) {
    return location ? location.start.source.name : "internal";
  };


}());
