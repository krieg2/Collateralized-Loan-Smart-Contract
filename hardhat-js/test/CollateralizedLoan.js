// Importing necessary modules and functions from Hardhat and Chai for testing
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// Describing a test suite for the CollateralizedLoan contract
describe("CollateralizedLoan", function () {
  // A fixture to deploy the contract before each test. This helps in reducing code repetition.
  async function deployCollateralizedLoanFixture() {
    // Deploying the CollateralizedLoan contract and returning necessary variables
    const signers = await ethers.getSigners();
    const owner = signers[0];
    const borrower = signers[1];
    const lender = signers[2];
    const Loan = await ethers.getContractFactory(
      "CollateralizedLoan"
    );
    const loanContract = await Loan.deploy();
    return { loanContract, owner, borrower, lender };
  }

  // Test suite for the loan request functionality
  describe("Loan Request", function () {
    it("Should let a borrower deposit collateral and request a loan", async function () {
      // Loading the fixture
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.0001") })
      ).to.emit(loanContract, "LoanRequested");

      const loan = await loanContract.getLoan(1);

      expect(loan.id).to.equal(1);
      expect(loan.borrower).to.equal(borrower);
      expect(loan.collateral).to.equal(ethers.parseEther("0.0001"));
      expect(loan.loanAmount).to.equal(ethers.parseEther("0.0002"));
      expect(loan.interestRate).to.equal(5);
      expect(loan.isFunded).to.be.false;
      expect(loan.isRepaid).to.be.false;
    });
  });

  // Test suite for funding a loan
  describe("Funding a Loan", function () {
    it("Allows a lender to fund a requested loan", async function () {
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.0001") })
      ).to.emit(loanContract, "LoanRequested");

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.0002") })
      ).to.emit(loanContract, "LoanFunded");

      const loan = await loanContract.getLoan(1);

      expect(loan.id).to.equal(1);
      expect(loan.borrower).to.equal(borrower);
      expect(loan.lender).to.equal(lender);
      expect(loan.collateral).to.equal(ethers.parseEther("0.0001"));
      expect(loan.loanAmount).to.equal(ethers.parseEther("0.0002"));
      expect(loan.interestRate).to.equal(5);
      expect(loan.isFunded).to.be.true;
      expect(loan.isRepaid).to.be.false;
    });

    it("Disallows lender from funding a nonexisting loan", async function () {
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(lender).fundLoan(111, { value: ethers.parseEther("0.0002") })
      ).to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Loan does not exist.'");
    });

    it("Disallows lender from funding a loan that is already funded", async function () {
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );
  
      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.0001") })
      ).to.emit(loanContract, "LoanRequested");

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.0002") })
      ).to.emit(loanContract, "LoanFunded");

      const loan = await loanContract.getLoan(1);

      expect(loan.id).to.equal(1);
      expect(loan.borrower).to.equal(borrower);
      expect(loan.lender).to.equal(lender);
      expect(loan.collateral).to.equal(ethers.parseEther("0.0001"));
      expect(loan.loanAmount).to.equal(ethers.parseEther("0.0002"));
      expect(loan.interestRate).to.equal(5);
      expect(loan.isFunded).to.be.true;
      expect(loan.isRepaid).to.be.false;

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.0002") })
      ).to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Loan is funded.'");
    });
  });

  // Test suite for repaying a loan
  describe("Repaying a Loan", function () {
    it("Enables the borrower to repay the loan fully", async function () {
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.001") })
      ).to.emit(loanContract, "LoanRequested");

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.002") })
      ).to.emit(loanContract, "LoanFunded");

      // Advance timestamp over 1 year.
      const timestamp = Math.floor(Date.now()/1000)+31557800;

      await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
      await ethers.provider.send("evm_mine");
  
      let loan = await loanContract.getLoan(1);

      // Calculate the amount due with interest at this time.
      let totalDue = await loanContract.calculateAmountDue(loan.id, timestamp);

      // Repay the loan.
      await expect(loanContract
        .connect(borrower).repayLoan(1, { value: totalDue })
      ).to.emit(loanContract, "LoanRepaid");

      loan = await loanContract.getLoan(1);

      expect(loan.id).to.equal(1);
      expect(loan.borrower).to.equal(borrower);
      expect(loan.lender).to.equal(lender);
      expect(loan.collateral).to.equal(0);
      expect(loan.loanAmount).to.equal(ethers.parseEther("0.002"));
      expect(loan.interestRate).to.equal(5);
      expect(loan.isFunded).to.be.true;
      expect(loan.isRepaid).to.be.true;
    });

    it("Disallows borrower from repaying a nonexisting loan", async function () {
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower).repayLoan(111, { value: ethers.parseEther("0.002") })
      ).to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Loan does not exist.'");
    });
  });

  // Test suite for claiming collateral
  describe("Claiming Collateral", function () {
    it("Permits the lender to claim collateral if the loan isn't repaid on time", async function () {
      // Loading the fixture
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.001") })
      ).to.emit(loanContract, "LoanRequested");

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.002") })
      ).to.emit(loanContract, "LoanFunded");

      // Advance timestamp over 10 years.
      const timestamp = Math.floor(Date.now()/1000)+315578000;

      await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
      await ethers.provider.send("evm_mine");

      await expect(loanContract
        .connect(lender).claimCollateral(1)
      ).to.emit(loanContract, "CollateralClaimed");
    });

    it("Does not allow the lender to claim collateral if the loan has not expired yet.", async function () {
      // Loading the fixture
      const { loanContract, owner, borrower, lender } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(loanContract
        .connect(borrower)
        .depositCollateralAndRequestLoan(5, 10, { value: ethers.parseEther("0.001") })
      ).to.emit(loanContract, "LoanRequested");

      await expect(loanContract
        .connect(lender).fundLoan(1, { value: ethers.parseEther("0.002") })
      ).to.emit(loanContract, "LoanFunded");

      // Advance timestamp only 1 year.
      const timestamp = Math.floor(Date.now()/1000)+31557800;

      await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
      await ethers.provider.send("evm_mine");

      await expect(loanContract
        .connect(lender).claimCollateral(1)
      ).to.rejectedWith(Error, "VM Exception while processing transaction: reverted with reason string 'Loan is still active.'");
    });
  });
});
