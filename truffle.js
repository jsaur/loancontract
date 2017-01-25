module.exports = {
  build: {
    "index.html": "index.html",
    "app.js": [
      "bower_components/angular/angular.js",
      "bower_components/angular-route/angular-route.js",
      "javascripts/app.js",
      "javascripts/controllers/events.js"
    ],
    "app.css": [
      "stylesheets/app.css"
    ],
    "images/": "images/",
    "views/": "views/"
  },
  rpc: {
    host: "localhost",
    port: 8545
  }
};
