pragma solidity ^0.4.2;
/* 
  To make thing easier, lenders and borrowers just interact with the default function.
  An admin calls the other functions to move the loan along it's various stages
*/
contract LoanContract3 {
    //Constructor vars
    address borrowerAddress;
    uint public loanAmount;
    uint public fundRaisingDeadline;
    uint public repaymentDeadline;
    uint public minimumTransactionAmount;
    
    //Useful vars
    uint public numLenders;
    uint public amountRaised;
    uint public amountRepaid;
    uint public repaymentRemainder;
    /* Since solidity doesn't all iterating over mapping, we need 2 data structures to represent lender accounts */
    address[] public lenderAddresses;
    mapping(address => LenderAccount) public lenderAccounts;
    enum State {raising, funded, repaying, repaid, expired} //default?
    State public currentState;
    struct LenderAccount {
        uint amountLent;
        uint amountRepaid;
    }
    
    //Events
    event LentToLoan(address addr, uint amount);
    event DisbursedToBorrower(address addr, uint amount);
    event RepaidByBorrower(address addr, uint amount);
    event RepaidToLender(address addr, uint amount);
    event LoanFunded();
    event LoanExpired();
    event LoanRepaid();
    event LoanBecameDelinquent();
    
    // Constructor
    function LoanContract3(
        address _borrowerAddress, 
        uint loanAmountInEthers,
        uint minimumTransactionAmountInEthers,
        uint fundRaisingDurationInDays,
        uint repaymentDurationInDays
    ) {
        borrowerAddress = _borrowerAddress;
        loanAmount = loanAmountInEthers * 1 ether;
        minimumTransactionAmount = minimumTransactionAmountInEthers * 1 ether;
        fundRaisingDeadline = now + fundRaisingDurationInDays * 1 days;
        repaymentDeadline = now + repaymentDurationInDays * 1 days;
    }

    // To keep things simple, the default function handles all logic for both lenders and borrowers
    function() payable {
        if (msg.value < minimumTransactionAmount) {
            throw;
        }
        
        if (currentState == State.raising) {
            lend();
        } else if (currentState == State.repaying) {
            repay();
        } else {
            throw;
        }
    }
    
    // Lender sends wei to the contract, we store their information
    function lend() private {
        // Don't allow borrowers to lend, and don't allow lending over the loan amount
        if (msg.sender == borrowerAddress) {
            throw;
        }
        if (msg.value > amountLeftToFund()) {
            throw;
        }
        
        //Handle lender lending twice
        if (lenderAccounts[msg.sender].amountLent == 0) {
            numLenders++;
            lenderAddresses.push(msg.sender);
            lenderAccounts[msg.sender] = LenderAccount(msg.value, 0);
        } else {
            lenderAccounts[msg.sender].amountLent += msg.value;
        }
        
        amountRaised += msg.value;
        LentToLoan(msg.sender, msg.value);
        checkLoanFunded();
    }
    
    function checkLoanFunded() private {
        if (amountRaised == loanAmount) {
            LoanFunded();
            currentState = State.funded;
        }
    }
    
    // Borrower sends wei to the contract, we disburse to all the lenders
    function repay() private {
        // Only borrowers can repay, and can't repay more than the amount left
        if (msg.sender != borrowerAddress) {
            throw;
        }
        if (msg.value > amountLeftToRepay()) {
            throw;
        }
        
        amountRepaid += msg.value;
        RepaidByBorrower(borrowerAddress, msg.value);
        
        // Distribute wei evenly to lenders, if there's a remainder save it for next time
        uint amountToDistribute = msg.value + repaymentRemainder;
        uint amountDistributed = 0;
        for (uint i = 0; i < lenderAddresses.length; i++) {
            address currentLender = lenderAddresses[i];
            uint amountForLender = (amountToDistribute * lenderAccounts[currentLender].amountLent) / loanAmount; /* Division in solidity throws away the remainder*/
            if (amountForLender > 0) {
                if (currentLender.send(amountForLender)) {
                    RepaidToLender(currentLender, amountForLender);
                    lenderAccounts[currentLender].amountRepaid += amountForLender;
                    amountDistributed += amountForLender;
                } //@todo error case?
            }
        }
        repaymentRemainder = amountToDistribute - amountDistributed;
        
        checkLoanRepaid();
    }
    
    function checkLoanRepaid() private {
        if (amountRepaid == loanAmount) {
            LoanRepaid();
            currentState = State.repaid;
        }
    }
    
    /* Useful constant functions */
    
    function amountLeftToFund() constant returns (uint) {
        return loanAmount - amountRaised;
    }
    
    function amountLeftToRepay() constant returns (uint) {
        return loanAmount - amountRepaid;
    }
    
    function isDelinquent() constant returns (bool) {
        return (now >= repaymentDeadline && currentState != State.repaid);
    }
    
    /* Admin functions, requires the know-how to call a function rather than just sending ether */
    
    // If we are passed the expiration date, send wei back to lenders
    function makeExpired() {
         if (now >= fundRaisingDeadline && currentState != State.expired) {
            currentState = State.expired;
            LoanExpired();
            for (uint i = 0; i < lenderAddresses.length; i++) {
                address currentLender = lenderAddresses[i];
                if (currentLender.send(lenderAccounts[currentLender].amountLent)) {
                    RepaidToLender(currentLender, lenderAccounts[currentLender].amountLent);
                } //@todo error case?
            }
        }
    }
    
    // Disburse to borrowers account, and move to repaying
    function disburseToBorrower() {
        if (currentState == State.funded) {
            if (borrowerAddress.send(amountRaised)) {
                currentState = State.repaying;
                DisbursedToBorrower(borrowerAddress, amountRaised);
            } //@todo error case?
        }
    }
}
