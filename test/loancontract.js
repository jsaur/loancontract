contract('LoanContract', function(accounts) {
    it("Creating a new loan should set the loan amount", function(){
        return LoanContract.new(accounts[9], 3, 15, 45).then(function(loanContract) {
            return loanContract.loanAmount.call().then(function(loanAmount) {
                assert.equal(loanAmount.valueOf(), web3.toWei(3), "Loan amount doesn't match create call");    
            });
        });
    });
    it("should trigger a LentToLoan event when someone lends", function() {
        return LoanContract.new(accounts[9], 3, 15, 45).then(function(loanContract) {
            //set up watcher
            var event = loanContract.allEvents();
            event.watch(function (error, result) {
                if (error) {
                    console.err(error);
                } else {
                    assert.equal(result.event, "LentToLoan");
                    assert.equal(web3.fromWei(result.args.amount.valueOf(), "ether"), 1);
                    assert.equal(result.args.addr.valueOf(), web3.eth.accounts[1]);
                    event.stopWatching();
                }
            });
            web3.eth.sendTransaction({ from: web3.eth.accounts[1], to: loanContract.address, value: web3.toWei(1, "ether"), gas: 500000}, function(error, result){
                //nothing to check here
            });
        });
    });
    it("it should decrement amount to fund when someone lends", function() {
        return LoanContract.new(accounts[9], 3, 15, 45).then(function(loanContract) {
            web3.eth.sendTransaction({ from: web3.eth.accounts[1], to: loanContract.address, value: web3.toWei(1, "ether"), gas: 500000}, function(error, result){
                return loanContract.amountLeftToFund.call().then(function(amountLeftToFund){
                    assert.equal(amountLeftToFund.valueOf(), web3.toWei(2), "Amount left wasn't loan amount - lent amount");
                });
            });
        });
    });
    it("it should disburse to the borrower when the loan is fully funded", function() {
        return LoanContract.new(accounts[9], 3, 15, 45).then(function(loanContract) {
            //set up watcher
            var event = loanContract.allEvents();
            event.watch(function (error, result) {
                if (error) {
                    console.err(error);
                } else if (result.event == "DisbursedToBorrower") {
                    assert.equal(web3.fromWei(result.args.amount.valueOf(), "ether"), 3);
                    assert.equal(result.args.addr.valueOf(), web3.eth.accounts[9]);
                    event.stopWatching();
                }
            });

            var startingBalance = web3.eth.getBalance(accounts[9]).valueOf();
            web3.eth.sendTransaction({ from: web3.eth.accounts[1], to: loanContract.address, value: web3.toWei(3, "ether"), gas: 500000}, function(error, result){
                var endingBalance = web3.eth.getBalance(accounts[9]).valueOf();
                var disbusedAmount = endingBalance - startingBalance;
                assert.equal(disbusedAmount, web3.toWei(3), "The amount disbursed wasn't the amount funded");
            });
        });
    });
    it("lenders should get repaid when the borrower sends to the contract", function() {
        return LoanContract.new(accounts[9], 3, 15, 45).then(function(loanContract) {
            //set up watcher
            var event = loanContract.allEvents();
            event.watch(function (error, result) {
                if (error) {
                    console.err(error);
                } else if (result.event == "RepaidToLender") {
                    assert.equal(web3.fromWei(result.args.amount.valueOf(), "ether"), 1);
                    assert.equal(result.args.addr.valueOf(), web3.eth.accounts[1]);
                    event.stopWatching();
                }
            });

            web3.eth.sendTransaction({ from: web3.eth.accounts[1], to: loanContract.address, value: web3.toWei(3, "ether"), gas: 500000}, function(error, result){
                var startingBalance = web3.eth.getBalance(accounts[1]).valueOf();    
                web3.eth.sendTransaction({ from: web3.eth.accounts[9], to: loanContract.address, value: web3.toWei(1, "ether"), gas: 500000}, function(error, result){
                    var endingBalance = web3.eth.getBalance(accounts[1]).valueOf();
                    var repaidAmount = endingBalance - startingBalance;
                    assert.equal(repaidAmount, web3.toWei(1), "The amount repaid to lender wasn't the amount sent by borrower");
                });
            });
        });
    });
});

    //Not sure why the factory doesn't work
    // it("the factory should create a loan contract", function(){
 //        var loanContractFactory = LoanContractFactory.deployed();
 //        return loanContractFactory.createLoanContract.call(accounts[9], 3, 15, 45).then(function(loanContractAddr){
 //            console.log(loanContractAddr);
 //            var newLoanContract = LoanContract.at(loanContractAddr);
 //            return newLoanContract.loanAmount.call().then(function(loanAmount) {
 //                assert.equal(loanAmount.valueOf(), web3.toWei(3), "Loan amount doesn't match create call");    
 //            });
 //        });
    // });