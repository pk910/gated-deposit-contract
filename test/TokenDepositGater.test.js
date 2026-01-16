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

  describe("Deposit Gate Config", function () {
    const TOPUP_DEPOSIT_TYPE = 0xffff;

    it("Should return default config (not blocked, token required)", async function () {
      const [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x00);
      expect(blocked).to.equal(false);
      expect(noToken).to.equal(false);
    });

    it("Should allow admin to set blocked config", async function () {
      await tokenDepositGater.setDepositGateConfig(0x01, true, false);
      const [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x01);
      expect(blocked).to.equal(true);
      expect(noToken).to.equal(false);
    });

    it("Should allow admin to set noToken without blocking", async function () {
      await tokenDepositGater.setDepositGateConfig(0x02, false, true);
      const [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x02);
      expect(blocked).to.equal(false);
      expect(noToken).to.equal(true);
    });

    it("Should allow admin to set both blocked and noToken", async function () {
      await tokenDepositGater.setDepositGateConfig(0x03, true, true);
      const [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x03);
      expect(blocked).to.equal(true);
      expect(noToken).to.equal(true);
    });

    it("Should allow admin to configure topup deposit type", async function () {
      await tokenDepositGater.setDepositGateConfig(TOPUP_DEPOSIT_TYPE, false, true);
      const [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(TOPUP_DEPOSIT_TYPE);
      expect(blocked).to.equal(false);
      expect(noToken).to.equal(true);
    });

    it("Should allow admin to change config at runtime", async function () {
      // Set initial config (blocked, token required)
      await tokenDepositGater.setDepositGateConfig(0x01, true, false);
      let [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x01);
      expect(blocked).to.equal(true);
      expect(noToken).to.equal(false);

      // Change config (not blocked, no token required)
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);
      [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x01);
      expect(blocked).to.equal(false);
      expect(noToken).to.equal(true);

      // Reset to default (not blocked, token required)
      await tokenDepositGater.setDepositGateConfig(0x01, false, false);
      [blocked, noToken] = await tokenDepositGater.getDepositGateConfig(0x01);
      expect(blocked).to.equal(false);
      expect(noToken).to.equal(false);
    });

    it("Should reject non-admin setting gate config", async function () {
      await expect(
        tokenDepositGater.connect(user).setDepositGateConfig(0x01, true, false)
      ).to.be.revertedWith("SimpleAccessControl: caller does not have admin role");
    });

    it("Should emit DepositGateConfigChanged event", async function () {
      await expect(tokenDepositGater.setDepositGateConfig(0x03, true, true))
        .to.emit(tokenDepositGater, "DepositGateConfigChanged")
        .withArgs(0x03, true, true);
    });

    it("Should have independent configs for different deposit types", async function () {
      await tokenDepositGater.setDepositGateConfig(0x00, true, false);
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);
      await tokenDepositGater.setDepositGateConfig(0x02, true, true);
      await tokenDepositGater.setDepositGateConfig(0x03, false, false);

      const [blocked00, noToken00] = await tokenDepositGater.getDepositGateConfig(0x00);
      const [blocked01, noToken01] = await tokenDepositGater.getDepositGateConfig(0x01);
      const [blocked02, noToken02] = await tokenDepositGater.getDepositGateConfig(0x02);
      const [blocked03, noToken03] = await tokenDepositGater.getDepositGateConfig(0x03);

      expect(blocked00).to.equal(true);
      expect(noToken00).to.equal(false);

      expect(blocked01).to.equal(false);
      expect(noToken01).to.equal(true);

      expect(blocked02).to.equal(true);
      expect(noToken02).to.equal(true);

      expect(blocked03).to.equal(false);
      expect(noToken03).to.equal(false);
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

    it("Should burn token by default (no config set)", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x01" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      // Token burned by default (noToken=false means token required)
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(4);
    });

    it("Should not burn token when noToken is set for prefix", async function () {
      // Set noToken for 0x01 prefix (skip token requirement)
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x01" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

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

    it("Should burn token for top-up deposit by default", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32); // All zeros
      const signature = "0x" + "00".repeat(96); // All zeros

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      // Token burned by default for topups too
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(4);
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

    it("Should fail when user has insufficient tokens by default", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0xcd" + "cd".repeat(31);
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

  describe("Deposit blocking", function () {
    beforeEach(async function () {
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);
      await tokenDepositGater.mint(user.address, 10);
    });

    it("Should block deposits when blocked is set for prefix", async function () {
      // Block 0x00 prefix deposits
      await tokenDepositGater.setDepositGateConfig(0x00, true, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x00" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Deposit type is blocked");
    });

    it("Should block 0x03 builder deposits when configured", async function () {
      // Block 0x03 prefix (builder) deposits
      await tokenDepositGater.setDepositGateConfig(0x03, true, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x03" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Deposit type is blocked");
    });

    it("Should allow different prefix when only one is blocked", async function () {
      // Block only 0x00 prefix, allow 0x01 without token
      await tokenDepositGater.setDepositGateConfig(0x00, true, true);
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x01" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      // 0x01 prefix should still work
      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );
    });

    it("Should block topup deposits when configured", async function () {
      const TOPUP_DEPOSIT_TYPE = 0xffff;
      await tokenDepositGater.setDepositGateConfig(TOPUP_DEPOSIT_TYPE, true, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32);
      const signature = "0x" + "00".repeat(96);

      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Deposit type is blocked");
    });

    it("Should unblock deposits after config change", async function () {
      // Block then unblock 0x01 prefix (with noToken to skip token check)
      await tokenDepositGater.setDepositGateConfig(0x01, true, true);
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x01" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );
    });
  });

  describe("Per-prefix token gating", function () {
    beforeEach(async function () {
      const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
      await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositContract.address);
      await tokenDepositGater.mint(user.address, 10);
    });

    it("Should require token for 0x03 builder deposits by default", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x03" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      const balanceBefore = await tokenDepositGater.balanceOf(user.address);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      // Token burned by default
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore - 1n);
    });

    it("Should skip token for 0x03 builder deposits when noToken is set", async function () {
      // Set noToken for 0x03 prefix (builders can deposit without token)
      await tokenDepositGater.setDepositGateConfig(0x03, false, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x03" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      const balanceBefore = await tokenDepositGater.balanceOf(user.address);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("32")
      );

      // No token burned when noToken is set
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore);
    });

    it("Should allow multiple deposits burning multiple tokens by default", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x01" + "cd".repeat(31);
      const signature = "0x" + "ef".repeat(96);

      // Make 3 deposits (burns 3 tokens by default)
      for (let i = 0; i < 3; i++) {
        await tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("32")
        );
      }

      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(7);
    });

    it("Should require token for topups by default", async function () {
      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32);
      const signature = "0x" + "00".repeat(96);

      const balanceBefore = await tokenDepositGater.balanceOf(user.address);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("1")
      );

      // Token burned by default for topups
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore - 1n);
    });

    it("Should skip token for topups when noToken is set", async function () {
      const TOPUP_DEPOSIT_TYPE = 0xffff;
      await tokenDepositGater.setDepositGateConfig(TOPUP_DEPOSIT_TYPE, false, true);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32);
      const signature = "0x" + "00".repeat(96);

      const balanceBefore = await tokenDepositGater.balanceOf(user.address);

      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        withdrawal_credentials,
        signature,
        ethers.parseEther("1")
      );

      // No token burned when noToken is set
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore);
    });

    it("Should fail topup without token by default", async function () {
      // Remove all tokens
      await tokenDepositGater.connect(user).transfer("0x000000000000000000000000000000000000dead", 10);

      const pubkey = "0x" + "ab".repeat(48);
      const withdrawal_credentials = "0x" + "00".repeat(32);
      const signature = "0x" + "00".repeat(96);

      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          withdrawal_credentials,
          signature,
          ethers.parseEther("1")
        )
      ).to.be.revertedWith("Not enough tokens");
    });

    it("Should handle different configs for different prefixes simultaneously", async function () {
      // 0x00: blocked (noToken irrelevant since blocked)
      // 0x01: noToken (skip token requirement)
      // 0x02: blocked + noToken
      // 0x03: default (token required)
      await tokenDepositGater.setDepositGateConfig(0x00, true, true);
      await tokenDepositGater.setDepositGateConfig(0x01, false, true);
      await tokenDepositGater.setDepositGateConfig(0x02, true, true);
      // 0x03 left as default (token required)

      const pubkey = "0x" + "ab".repeat(48);
      const signature = "0x" + "ef".repeat(96);

      // 0x00 should be blocked
      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          "0x00" + "cd".repeat(31),
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Deposit type is blocked");

      // 0x01 should NOT burn token (noToken=true)
      const balanceBefore = await tokenDepositGater.balanceOf(user.address);
      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        "0x01" + "cd".repeat(31),
        signature,
        ethers.parseEther("32")
      );
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceBefore);

      // 0x02 should be blocked
      await expect(
        tokenDepositGater.connect(depositContract).check_deposit(
          user.address,
          pubkey,
          "0x02" + "cd".repeat(31),
          signature,
          ethers.parseEther("32")
        )
      ).to.be.revertedWith("Deposit type is blocked");

      // 0x03 should burn token (default behavior)
      const balanceAfter = await tokenDepositGater.balanceOf(user.address);
      await tokenDepositGater.connect(depositContract).check_deposit(
        user.address,
        pubkey,
        "0x03" + "cd".repeat(31),
        signature,
        ethers.parseEther("32")
      );
      expect(await tokenDepositGater.balanceOf(user.address)).to.equal(balanceAfter - 1n);
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