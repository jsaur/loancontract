pragma solidity ^0.4.2;

contract LoanContract1 {
    address borrowerAddress;
    uint public loanAmount;
    uint public fundRaisingDeadline;
    uint public numLenders;
    uint public amountRaised;
    uint public amountRepaid;
    uint public repaymentRemainder;
    /* Since solidity doesn't all iterating over mapping, we need 2 data structures to represent lender accounts */
    address[] public lenderAddresses;
    mapping(address => LenderAccount) public lenderAccounts;
    enum State {raising, funded, repaying, expired, repaid}
    State public currentState;
    /* @todo figure out how to represent the borrower's identity and loan description */
    /* @todo add a payback date */
    
    event LentToLoan(address lenderAddr, uint amount);
    event BorrowerWithdrew(address borrowerAddr, uint amount);
    event BorrowerRepaid(address borrowerAddr, uint amount);
    event LenderGotRepaid(address lenderAddr, uint amount);
    event LenderWithdrew(address lenderAddr, uint amount);
    event LoanFunded();
    event LoanExpired();
    event LoanRepaid();
    
    struct LenderAccount {
        uint amountLent;
        uint amountRepaid;
        uint amountWithdrawn;
    }
    
    /* Constructor */
    function LoanContract1(
        address _borrowerAddress, 
        uint loanAmountInEthers,
        uint fundRaisingDurationInMinutes
    ) {
        borrowerAddress = _borrowerAddress;
        loanAmount = loanAmountInEthers * 1 ether;
        fundRaisingDeadline = now + fundRaisingDurationInMinutes * 1 minutes;
    }

    /* The default function is lending to a loan */
    function() payable {
        if (msg.value > 0) {
            //You can only send money if you are not the borrower, it's fundraising, and you're not trying to send more than the amount left
            if (msg.sender == borrowerAddress) {
                throw;
            }
            if (currentState != State.raising) {
                throw;
            }
            if (msg.value > amountLeftToFund()) {
                throw;
            }
            numLenders++;
            amountRaised += msg.value;
            lenderAddresses.push(msg.sender);
            lenderAccounts[msg.sender] = LenderAccount(msg.value, 0, 0);
            LentToLoan(msg.sender, msg.value);
            if (amountRaised == loanAmount) {
                currentState = State.funded;
                LoanFunded();
            }
        }
        
    }
    
     /* If the loan funded, the borrower can withdraw the amount raised */
    function borrowerWithdraw() {
        if (msg.sender == borrowerAddress) {
            if (currentState == State.funded) {
                if (amountRaised > 0) {
                    if (borrowerAddress.send(amountRaised)) {
                        currentState = State.repaying;
                        BorrowerWithdrew(borrowerAddress, amountRaised);
                    }
                }
            }
        }
    }
    
    /* Borrower sends wei here to repay, we distribute to all lenders */
    function borrowerRepay() payable {
        //You can only repay money if you are the borrower, it's paying back, and you're not trying to send more than the amount left
            if (msg.sender != borrowerAddress) {
                throw;
            }
            if (currentState != State.repaying) {
                throw;
            }
            if (msg.value > amountLeftToRepay()) {
                throw;
            }
            
            amountRepaid += msg.value;
            BorrowerRepaid(borrowerAddress, msg.value);
            if (amountRepaid == loanAmount) {
                LoanRepaid();
                currentState = State.repaid;
            }
            
             /* Distribute wei evenly to lenders, if there's a remander save it for next time  */
            uint amountToDistribute = msg.value + repaymentRemainder;
            uint amountDistributed = 0;
            for (uint i = 0; i < lenderAddresses.length; i++) {
                address currentLender = lenderAddresses[i];
                uint amountForLender = (amountToDistribute * lenderAccounts[currentLender].amountLent) / loanAmount; /* Division in solidity throws away the remainder*/
                if (amountForLender > 0) {
                    lenderAccounts[currentLender].amountRepaid += amountForLender;
                    LenderGotRepaid(currentLender, amountForLender);
                    amountDistributed += amountForLender;
                }
            }
            repaymentRemainder = amountToDistribute - amountDistributed;
    }
    
    function lenderWithdraw() {
        uint amountToWithdraw = amountLenderCanWithdraw(msg.sender);
        if (amountToWithdraw > 0) {
            if (msg.sender.send(amountToWithdraw)) {
                lenderAccounts[msg.sender].amountWithdrawn += amountToWithdraw;
                LenderWithdrew(msg.sender, amountToWithdraw);
            }
        }
    }
    
    /* It would be nice if this check happened automatically */
    function checkExpired() {
         if (now >= fundRaisingDeadline) {
            currentState = State.expired;
            LoanExpired();
        }
    }
    
    function amountLeftToFund() constant returns (uint) {
        return loanAmount - amountRaised;
    }
    
    function amountLeftToRepay() constant returns (uint) {
        return loanAmount - amountRepaid;
    }
    
    function amountLenderCanWithdraw(address lenderAddr) constant returns (uint) {
        uint amountCanWithdraw = 0;
        LenderAccount lenderAccount = lenderAccounts[lenderAddr];
        if (currentState == State.expired) {
            /* If the loan expired, lenders can withdraw their contributed amount*/
            amountCanWithdraw = lenderAccount.amountLent - lenderAccount.amountWithdrawn;
        } else if (currentState == State.repaying || currentState == State.repaid) {
            /* If the loan is repaying or fully repaid the lenders can withdraw however much has been repaid to them */
            amountCanWithdraw = lenderAccount.amountRepaid - lenderAccount.amountWithdrawn;
        }
        return amountCanWithdraw;
    }
}
