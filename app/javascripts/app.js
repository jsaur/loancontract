"use strict";
var app = angular.module("LoanContract", ['ngRoute']);

app.config(function($routeProvider) {
  $routeProvider.when('/', {
    templateUrl: 'views/events.html',
    controller: 'EventsController'
  }).otherwise({redirectTo: '/'});
});