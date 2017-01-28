pragma solidity ^0.4.2;

/* All the main functions of the loan are handled through the default function */
contract LoanContract2 {
    //Constructor vars
    address borrowerAddress;
    uint public loanAmount;
    uint public fundRaisingDeadline;
    uint public repaymentDeadline;
    
    //Useful vars
    uint public numLenders;
    uint public amountRaised;
    uint public amountRepaid;
    uint public repaymentRemainder;
    /* Since solidity doesn't all iterating over mapping, we need 2 data structures to represent lender accounts */
    address[] public lenderAddresses;
    mapping(address => LenderAccount) public lenderAccounts;
    bool delinquent = false;
    enum State {raising, repaying, expired, repaid}
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
    function LoanContract(
        address _borrowerAddress, 
        uint loanAmountInEthers,
        uint fundRaisingDurationInDays,
        uint repaymentDurationInDays
    ) {
        borrowerAddress = _borrowerAddress;
        loanAmount = loanAmountInEthers * 1 ether;
        fundRaisingDeadline = now + fundRaisingDurationInDays * 1 days;
        repaymentDeadline = now + repaymentDurationInDays * 1 days;
    }

    // To keep things simple, the default function handles all logic for both lenders and borrowers
    function() payable {
        if (msg.value > 0) {
            if (currentState == State.raising) {
                lend();
            } else if (currentState == State.repaying) {
                repay();
            }
        }
    }
    
    // Lender sends wei to the contract, we store they're information
    function lend() private {
        // Don't allow borrowers to lend, and don't allow lending over the loan amount
        if (msg.sender == borrowerAddress) {
                throw;
        }
        if (msg.value > amountLeftToFund()) {
            throw;
        }
        
        numLenders++;
        amountRaised += msg.value;
        lenderAddresses.push(msg.sender);
        lenderAccounts[msg.sender] = LenderAccount(msg.value, 0);
        LentToLoan(msg.sender, msg.value);
        checkIfRaised();
    }
    
    // If we're reached the loan amount, move to funded and disburse to borrower
    function checkIfRaised() private {
        if (amountRaised == loanAmount) {
            LoanFunded();
            if (borrowerAddress.send(amountRaised)) {
                currentState = State.repaying;
                DisbursedToBorrower(borrowerAddress, amountRaised);
            } //@todo error case?
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
        
        // Distribute wei evenly to lenders, if there's a remander save it for next time
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
    
    /* Time related functions that have to be called by external processes */
    
    //If a loan expires, send wei back to lenders
    function checkExpired() {
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
    
    function checkDelinquent() {
        if (now >= repaymentDeadline && currentState != State.repaid) {
            delinquent = true;
            LoanBecameDelinquent();
        }
    }
}
