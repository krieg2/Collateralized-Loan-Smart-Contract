// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

// Collateralized Loan Contract
contract CollateralizedLoan {
    using SafeMath for uint256;
    // Define the structure of a loan
    struct Loan {
        uint id;
        address payable borrower;
        address payable lender;
        uint256 collateral;
        uint256 loanAmount;
        uint interestRate;
        uint startDate;
        uint dueDate;
        bool isFunded;
        bool isRepaid;
    }

    // Create a mapping to manage the loans
    mapping(uint => Loan) public loans;
    uint public nextLoanId;
    uint private secondsPerYear = 31557600;

    // Hint: Define events for loan requested, funded, repaid, and collateral claimed
    event LoanRequested(uint indexed loanId, uint timestamp, address borrower);
    event LoanFunded(uint indexed loanId, uint timestamp, address lender);
    event LoanRepaid(uint indexed loanId, uint timestamp, uint256 amount);
    event CollateralClaimed(uint indexed loanId, uint timestamp);

    // Custom Modifiers
    // Hint: Write a modifier to check if a loan exists
    // Hint: Write a modifier to ensure a loan is not already funded
    modifier loanExists(uint _loanId) {
        require(loans[_loanId].id > 0, "Loan does not exist.");
        _;
    }
    modifier loanIsNotFunded(uint _loanId) {
        require(loans[_loanId].isFunded == false, "Loan is funded.");
        _;
    }
    modifier loanIsFunded(uint _loanId) {
        require(loans[_loanId].isFunded == true, "Loan is not funded.");
        _;
    }
    modifier loanIsNotRepaid(uint _loanId) {
        require(loans[_loanId].isRepaid == false, "Loan is repaid.");
        _;
    }

    // Function to deposit collateral and request a loan
    function depositCollateralAndRequestLoan(uint _interestRate, uint _duration) external payable {
        uint collateralAmount = msg.value;
        // Hint: Check if the collateral is more than 0
        require(collateralAmount > 0, "Collateral must be greater than 0.");
        // Hint: Calculate the loan amount based on the collateralized amount
        uint amount = collateralAmount.mul(2); // Twice the collateral is the maximum loan.
        uint dateDue = block.timestamp.add(_duration.mul(secondsPerYear));

        // Hint: Increment nextLoanId and create a new loan in the loans mapping
        nextLoanId++;
        uint loanId = nextLoanId;
        loans[loanId] = Loan({
            id: loanId,
            borrower: payable(msg.sender),
            lender: payable(0),
            collateral: collateralAmount,
            loanAmount: amount,
            interestRate: _interestRate,
            startDate: block.timestamp,
            dueDate: dateDue,
            isFunded: false,
            isRepaid: false
        });
        
        // Hint: Emit an event for loan request
        emit LoanRequested(loanId, block.timestamp, msg.sender);
    }

    // Function to fund a loan
    function fundLoan(uint _loanId) payable external loanExists(_loanId) loanIsNotFunded(_loanId) {
        Loan storage loan = loans[_loanId];
        require(msg.value == loan.loanAmount, "Loan must be the correct amount.");

        loan.borrower.transfer(msg.value);
        loan.lender = payable(msg.sender);
        loan.isFunded = true;

        emit LoanFunded(_loanId, block.timestamp, msg.sender);
    }

    // Function to repay a loan
    function repayLoan(uint _loanId) payable external loanExists(_loanId) loanIsFunded(_loanId) {
        Loan storage loan = loans[_loanId];
        require(block.timestamp <= loan.dueDate, "Loan has expired.");
        // Borrowers repay the loan with interest before the due date.
        uint256 amountDue = calculateAmountDue(_loanId, block.timestamp);
        require(msg.value == amountDue, "Value is different than amount due.");
        // Upon successful repayment, the contract returns the collateral to the borrower.
        loan.lender.transfer(msg.value);
        loan.borrower.transfer(loan.collateral);
        loan.collateral = 0;
        loan.isRepaid = true;

        emit LoanRepaid(_loanId, block.timestamp, amountDue);
    }

    // Function to claim collateral on default
    function claimCollateral(uint _loanId) external loanExists(_loanId) loanIsFunded(_loanId) loanIsNotRepaid(_loanId) {
        Loan storage loan = loans[_loanId];
        require(block.timestamp > loan.dueDate, "Loan is still active.");
        loan.lender.transfer(loan.collateral);
        loan.collateral = 0;

        emit CollateralClaimed(_loanId, block.timestamp);
    }

    function calculateAmountDue(uint _loanId, uint timestamp) public view returns (uint256) {
        Loan storage loan = loans[_loanId];

        uint256 interest = loan.interestRate.div(100);
        uint256 yearsElapsed = timestamp.sub(loan.startDate).div(secondsPerYear);
        uint256 interestAmount = interest.mul(loan.loanAmount).div(yearsElapsed);
        uint256 amountDue = loan.loanAmount.add(interestAmount);

        return amountDue;
    }

    function getLoan(uint _loanId) public view returns (Loan memory) {
        return loans[_loanId];
    }
}