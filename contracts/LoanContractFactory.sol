pragma solidity ^0.4.8;
import "LoanContract.sol";

contract LoanContractFactory {

	event CreatedLoanContract(address loanContract, uint loanAmountInEthers, uint fundRaisingDurationInDays, uint repaymentDurationInDays);

	function createLoanContract(
		address borrowerAddress, 
        uint loanAmountInEthers,
        uint fundRaisingDurationInDays,
        uint repaymentDurationInDays
    ) returns (LoanContract) {
		LoanContract newLoanContract = new LoanContract(borrowerAddress, loanAmountInEthers, fundRaisingDurationInDays, repaymentDurationInDays);
		CreatedLoanContract(newLoanContract, loanAmountInEthers, fundRaisingDurationInDays, repaymentDurationInDays);
		return newLoanContract;
	}
}