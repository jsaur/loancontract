contract('LoanContract', function(accounts) {
	it("should have amount left equal to loan amount at creation", function(){
		var loanContract = LoanContract.deployed();
		return loanContract.amountLeftToFund.call(accounts[0]).then(function(amountLeftToFund){
			assert.equal(amountLeftToFund.valueOf(), web3.toWei(5), "Amount left wasn't loan amount");
		});
	});
	it("should trigger a LentToLoan event when someone lends", function() {
		var loanContract = LoanContract.deployed();
		//set up watcher
		var event = loanContract.allEvents();
        event.watch(function (error, result) {
            if (error) {
                console.err(error);
            } else {
                assert.equal(result.event, "LentToLoan");
                assert.equal(web3.fromWei(result.args.amount.valueOf(), "ether"), 1);
                assert.equal(result.args.lenderAddr.valueOf(), web3.eth.accounts[1]);
                event.stopWatching();
            }

        });
    	web3.eth.sendTransaction({ from: web3.eth.accounts[1], to: loanContract.address, value: web3.toWei(1, "ether"), gas: 500000}, function(error, result){
        	return loanContract.amountLeftToFund.call(accounts[0]).then(function(amountLeftToFund) {
			});
        });    
    });
    it("should decrease amount left after someone lends", function() {
		var loanContract = LoanContract.deployed();
       	return loanContract.amountLeftToFund.call(accounts[0]).then(function(amountLeftToFund) {
			assert.equal(amountLeftToFund.valueOf(), web3.toWei(4), "Amount left wasn't loan amount - amount raised");
		});
	});
});