 // Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2012 Google Inc. johnjbarton@google.com

/**
 * Collect all the properties of the global object in an array
 * for priming the global symbol table
 */

(function() {

  'use strict';

  // LHS for the compile context of the devtools script preprocessor,
  // RHS for the runtime context of the devtools script preprocessor...
  var global = ('global', eval)('this') || window;

  var globalSymbols = {};

  var object = global;
  while (object) {
    Object.getOwnPropertyNames(object).forEach(function(name) {
      globalSymbols[name] = 'global'; 
    });
    object = Object.getPrototypeOf(object);
  }

  function markDoNot(statement){
    statement.doNotTransform = true;
    statement.doNotTrace = true;
    return statement;
  }

  function generateFileName(location) {
    return location ? location.start.source.name : "internal";
  };

  global.Querypoint = {
    globalSymbols: globalSymbols,
    markDoNot: markDoNot,
    activationId: '__qp_activation',
    generateFileName: generateFileName,
  };

}());