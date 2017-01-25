"use strict";
var app = angular.module("LoanContract");


app.controller("EventsController", function($scope) {
    var contract = LoanContract.deployed();
    console.log(contract);

    //Contract details
    $scope.address = contract.address;
    console.log($scope.address);
    $scope.jsonInterface = JSON.stringify(contract.contract.abi);
    console.log($scope.jsonInterface);

    //Events
    var events = contract.allEvents({fromBlock: 0, toBlock: 'latest'});
    $scope.events = [];
    events.watch(function(error, result) {
        $scope.events.push(result);
        $scope.$apply();
    });
    $scope.$on('$destroy', function() {
        events.stopWatching();
    });
});