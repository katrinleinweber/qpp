// Google BSD license http://code.google.com/google_bsd_license.html
// Copyright 2011 Google Inc. johnjbarton@google.com
console.log("QuerypointDevtools begins %o", chrome);

var page = new InspectedPage();
var project; 

//--------------------------------------------------------------------------
// User interface

var qpPanel; // lazy created view

chrome.devtools.panels.create("Querypoint", "QuerypointIcon.png", "QuerypointPanel.html", function(panel) {
  panel.onShown.addListener(function (panel_window) {
    if (!qpPanel) {
      if (!project) console.error("Trying to create QPPanel with no project");
      qpPanel = new QuerypointPanel(panel, panel_window, page, project);
    }
    qpPanel.onShown();
  });
  panel.onHidden.addListener(function() {
    if (qpPanel)
      qpPanel.onHidden();
  });
});

//-----------------------------------------------------------------------------
function onLoad() {

  function tracePage(url) {
    project = new QPProject(url);
    console.log("QPProject created for "+url);
    project.getPageScripts(function () {
      project.run();
      if (qpPanel)
        qpPanel.refresh();
    });
  }
  
  function onNavigated(url) {
    tracePage(url);
  }

  chrome.devtools.network.onNavigated.addListener(onNavigated);

  // Force a reload when devtools opens
  chrome.devtools.inspectedWindow.reload();

  /*chrome.devtools.inspectedWindow.eval("window.location.href", function(url) {
    onNavigated(url);
  });
*/
}

window.addEventListener('load', onLoad);

