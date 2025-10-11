const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenDepositGater", function () {
  let tokenDepositGater;
  let owner;
  let admin;
  let depositContract;
  let user;

  beforeEach(async function () {
    [owner, admin, depositContract, user] = await ethers.getSigners();

    // Deploy TokenDepositGater
    const TokenDepositGater = await ethers.getContractFactory("TokenDepositGater");
    tokenDepositGater = await TokenDepositGater.deploy();
    await tokenDepositGater.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct token name and symbol", async function () {
      expect(await tokenDepositGater.name()).to.equal("Deposit Token");
      expect(await tokenDepositGater.symbol()).to.equal("Deposit");
    });

    it("Should have 0 decimals", async function () {
      expect(await tokenDepositGater.decimals()).to.equal(0);
    });

    it("Should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await tokenDepositGater.DEFAULT_ADMIN_ROLE();
      expect(await tokenDepositGater.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
    });

    it("Should grant DEPOSIT_CONTRACT_ROLE to mainnet deposit contract", async function () {
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      const mainnetDepositContract = "0x00000000219ab540356cBB839Cbe05303d7705Fa";
      expect(await tokenDepositGater.hasRole(DEPOSIT_CONTRACT_ROLE, mainnetDepositContract)).to.equal(true);
    });
  });

  describe("Minting", function () {
    it("Should allow admin to mint tokens", async function () {
      await tokenDepositGater.mint(user.address, 100);
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(100);
      expect(await tokenDepositGater.totalSupply()).to.equal(100);
    });

    it("Should fail when non-admin tries to mint", async function () {
      await expect(
        tokenDepositGater.connect(user).mint(user.address, 100)
      ).to.be.revertedWith("Only admin can mint");
    });
  });

  describe("Access Control", function () {
    it("Should allow admin to grant roles", async function () {
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);
      expect(await tokenDepositGater.hasRole(DEPOSIT_CONTRACT_ROLE, depositContract.address)).to.equal(true);
    });

    it("Should allow admin to revoke roles", async function () {
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);
      await tokenDepositGater.revokeRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);
      expect(await tokenDepositGater.hasRole(DEPOSIT_CONTRACT_ROLE, depositContract.address)).to.equal(false);
    });

    it("Should allow admin to grant admin role to another address", async function () {
      const DEFAULT_ADMIN_ROLE = await tokenDepositGater.DEFAULT_ADMIN_ROLE();
      await tokenDepositGater.grantRole(DEFAULT_ADMIN_ROLE, admin.address);
      
      // New admin should be able to mint
      await tokenDepositGater.connect(admin).mint(user.address, 50);
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(50);
    });

    it("Should reject zero prefix roles", async function () {
      const zeroRole = "0x0000000000000000000000000000000000000000000000000000000000000000";
      
      await expect(
        tokenDepositGater.hasRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");

      await expect(
        tokenDepositGater.grantRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");

      await expect(
        tokenDepositGater.revokeRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");

      await expect(
        tokenDepositGater.connect(user).renounceRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");
    });

    it("Should reject roles with zero prefix in first 12 bytes", async function () {
      const zeroRole = "0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff";
      
      await expect(
        tokenDepositGater.hasRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");

      await expect(
        tokenDepositGater.grantRole(zeroRole, user.address)
      ).to.be.revertedWith("SimpleAccessControl: zero prefix not allowed");
    });
  });

  describe("check_deposit function", function () {
    beforeEach(async function () {
      // Grant DEPOSIT_CONTRACT_ROLE to depositContract
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);

      // Mint tokens for user
      await tokenDepositGater.mint(user.address, 5);
    });

    it("Should burn token for normal deposit", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "cd".repeat(32);
      const signature = "0x" + "ef".repeat(96);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(4);
    });

    it("Should not burn token for top-up deposit", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32); // All zeros
      const signature = "0x" + "00".repeat(96); // All zeros

      const balanceBefore = await tokenDepositGater.balanceOf(user.address);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore);
    });

    it("Should fail when called by non-deposit contract", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "cd".repeat(32);
      const signature = "0x" + "ef".repeat(96);

      await expect(
        tokenDepositGater.connect(user).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Only deposit contract can call this function");
    });

    it("Should fail when user has insufficient tokens", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "cd".repeat(32);
      const signature = "0x" + "ef".repeat(96);

      // Burn all user's tokens first
      await tokenDepositGater.connect(user).transfer("0x000000000000000000000000000000000000dead", 5);

      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Not enough tokens");
    });
  });

  describe("ERC20 functionality", function () {
    beforeEach(async function () {
      await tokenDepositGater.mint(owner.address, 1000);
      await tokenDepositGater.mint(user.address, 100);
    });

    it("Should allow transfers", async function () {
      await tokenDepositGater.transfer(user.address, 50);
      expect(await tokenDepositGater.balanceOf(owner.address)).to.equal(950);
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(150);
    });

    it("Should allow approvals and transferFrom", async function () {
      await tokenDepositGater.connect(user).approve(owner.address, 30);
      await tokenDepositGater.transferFrom(user.address, owner.address, 30);
      expect(await tokenDepositGater.balanceOf(owner.address)).to.equal(1030);
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(70);
    });
  });
});