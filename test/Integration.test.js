const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration Tests", function () {
  let gatedDepositContract;
  let tokenDepositGater;
  let owner;
  let depositor1;
  let depositor2;
  let attacker;

  // Valid deposit data
  const validDepositData = {
    pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    withdrawal_credentials: "0x010000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    signature: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    deposit_data_root: "0x44d02d2231ac4360374404cec35d277baad3a135f6228c3a0b64924832325576"
  };

  const depositAmount = ethers.parseEther("32");

  beforeEach(async function () {
    [owner, depositor1, depositor2, attacker] = await ethers.getSigners();

    // Deploy both contracts
    const TokenDepositGater = await ethers.getContractFactory("TokenDepositGater");
    tokenDepositGater = await TokenDepositGater.deploy();
    await tokenDepositGater.waitForDeployment();

    const GatedDepositContract = await ethers.getContractFactory("DepositContract");
    gatedDepositContract = await GatedDepositContract.deploy(await tokenDepositGater.getAddress());
    await gatedDepositContract.waitForDeployment();

    // Grant DEPOSIT_CONTRACT_ROLE
    const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
    await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, await gatedDepositContract.getAddress());

    // Configure noToken for topups (0xffff) so they don't require tokens
    const TOPUP_DEPOSIT_TYPE = 0xffff;
    await tokenDepositGater.setDepositGateConfig(TOPUP_DEPOSIT_TYPE, false, true);
  });

  describe("Complete deposit flow", function () {
    it("Should complete a full deposit cycle", async function () {
      // 1. Admin mints tokens for depositor
      await tokenDepositGater.mint(depositor1.address, 2);
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(2);

      // 2. Depositor makes first deposit
      const tx1 = await gatedDepositContract.connect(depositor1).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );

      // 3. Verify ONLY DepositEvent is emitted by deposit contract
      const receipt1 = await tx1.wait();
      const contractAddress = await gatedDepositContract.getAddress();
      const depositContractEvents = receipt1.logs.filter(log => log.address === contractAddress);
      expect(depositContractEvents).to.have.length(1);
      
      await expect(tx1).to.emit(gatedDepositContract, "DepositEvent");

      // 4. Check token was burned
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(1);

      // 5. Check ETH was received
      expect(await ethers.provider.getBalance(await gatedDepositContract.getAddress())).to.equal(depositAmount);

      // 6. Make second deposit
      await gatedDepositContract.connect(depositor1).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );

      // 7. All tokens should be used
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(0);

      // 8. Deposit count should be 2
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0200000000000000");
    });
  });

  describe("Mixed deposit scenarios", function () {
    it("Should handle mix of normal and top-up deposits", async function () {
      // Mint tokens for first depositor only
      await tokenDepositGater.mint(depositor1.address, 1);

      // Normal deposit from depositor1
      await gatedDepositContract.connect(depositor1).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );

      // Top-up deposit from depositor2 (no tokens needed)
      const topUpData = {
        pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        withdrawal_credentials: "0x" + "00".repeat(32),
        signature: "0x" + "00".repeat(96),
        deposit_data_root: "0x4c96bb32f9feff56062a34087a2bb5243023f9aeb87ee199c3276ecc148fdf69"
      };

      await gatedDepositContract.connect(depositor2).deposit(
        topUpData.pubkey,
        topUpData.withdrawal_credentials,
        topUpData.signature,
        topUpData.deposit_data_root,
        { value: depositAmount } // Top-up amount
      );

      // Both deposits should succeed
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0200000000000000");
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(0);
      expect(await tokenDepositGater.balanceOf(depositor2.address)).to.equal(0);
    });
  });

  describe("Access control scenarios", function () {
    it("Should prevent unauthorized minting", async function () {
      await expect(
        tokenDepositGater.connect(attacker).mint(attacker.address, 1000)
      ).to.be.revertedWith("Only admin can mint");
    });

    it("Should prevent direct check_deposit calls", async function () {
      await expect(
        tokenDepositGater.connect(attacker).check_deposit(
          attacker.address,
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          validDepositData.signature,
          depositAmount
        )
      ).to.be.revertedWith("Only deposit contract can call this function");
    });

    it("Should handle role management correctly", async function () {
      const DEFAULT_ADMIN_ROLE = await tokenDepositGater.DEFAULT_ADMIN_ROLE();
      
      // Grant admin role to depositor1
      await tokenDepositGater.grantRole(DEFAULT_ADMIN_ROLE, depositor1.address);
      
      // depositor1 should now be able to mint
      await tokenDepositGater.connect(depositor1).mint(depositor2.address, 5);
      expect(await tokenDepositGater.balanceOf(depositor2.address)).to.equal(5);
      
      // Revoke role
      await tokenDepositGater.revokeRole(DEFAULT_ADMIN_ROLE, depositor1.address);
      
      // Should no longer be able to mint
      await expect(
        tokenDepositGater.connect(depositor1).mint(depositor2.address, 5)
      ).to.be.revertedWith("Only admin can mint");
    });
  });

  describe("Edge cases", function () {
    it("Should handle zero ETH deposits correctly", async function () {
      await tokenDepositGater.mint(depositor1.address, 1);

      await expect(
        gatedDepositContract.connect(depositor1).deposit(
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          validDepositData.signature,
          validDepositData.deposit_data_root,
          { value: 0 }
        )
      ).to.be.revertedWith("DepositContract: deposit value too low");
    });

    it("Should handle invalid deposit amounts", async function () {
      await tokenDepositGater.mint(depositor1.address, 1);

      // Not a multiple of gwei
      await expect(
        gatedDepositContract.connect(depositor1).deposit(
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          validDepositData.signature,
          validDepositData.deposit_data_root,
          { value: ethers.parseEther("32") + BigInt(1) } // 32 ETH + 1 wei
        )
      ).to.be.revertedWith("DepositContract: deposit value not multiple of gwei");
    });

    it("Should handle token transfers before deposits", async function () {
      // Mint tokens to depositor1
      await tokenDepositGater.mint(depositor1.address, 3);
      
      // Transfer some tokens to depositor2
      await tokenDepositGater.connect(depositor1).transfer(depositor2.address, 1);
      
      // Both should be able to make deposits
      await gatedDepositContract.connect(depositor1).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );
      
      await gatedDepositContract.connect(depositor2).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );
      
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(1);
      expect(await tokenDepositGater.balanceOf(depositor2.address)).to.equal(0);
    });
  });

  describe("Gas optimization checks", function () {
    it("Should efficiently handle batch minting and deposits", async function () {
      // Batch mint for multiple users
      const users = [depositor1, depositor2];
      for (const user of users) {
        await tokenDepositGater.mint(user.address, 5);
      }

      // Each user makes multiple deposits
      for (const user of users) {
        for (let i = 0; i < 3; i++) {
          await gatedDepositContract.connect(user).deposit(
            validDepositData.pubkey,
            validDepositData.withdrawal_credentials,
            validDepositData.signature,
            validDepositData.deposit_data_root,
            { value: depositAmount }
          );
        }
      }

      // Verify final state
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0600000000000000");
      expect(await tokenDepositGater.balanceOf(depositor1.address)).to.equal(2);
      expect(await tokenDepositGater.balanceOf(depositor2.address)).to.equal(2);
    });
  });

  describe("Event Compliance", function () {
    it("Should maintain strict event emission compliance across multiple operations", async function () {
      // Setup: mint tokens for depositor1
      await tokenDepositGater.mint(depositor1.address, 2);

      // Normal deposit - check events
      const normalTx = await gatedDepositContract.connect(depositor1).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );
      
      const normalReceipt = await normalTx.wait();
      
      // Verify deposit contract emits only DepositEvent
      const depositContractAddress = await gatedDepositContract.getAddress();
      const normalDepositEvents = normalReceipt.logs.filter(log => log.address === depositContractAddress);
      expect(normalDepositEvents).to.have.length(1);

      // Top-up deposit - check events
      const topUpData = {
        pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        withdrawal_credentials: "0x" + "00".repeat(32),
        signature: "0x" + "00".repeat(96),
        deposit_data_root: "0x4c96bb32f9feff56062a34087a2bb5243023f9aeb87ee199c3276ecc148fdf69"
      };

      const topUpTx = await gatedDepositContract.connect(depositor2).deposit(
        topUpData.pubkey,
        topUpData.withdrawal_credentials,
        topUpData.signature,
        topUpData.deposit_data_root,
        { value: depositAmount }
      );
      
      const topUpReceipt = await topUpTx.wait();
      
      // Verify top-up deposit emits only DepositEvent (no token transfer)
      const topUpDepositEvents = topUpReceipt.logs.filter(log => log.address === depositContractAddress);
      expect(topUpDepositEvents).to.have.length(1);
      
      // Top-up should have no token events
      const tokenGaterAddress = await tokenDepositGater.getAddress();
      const topUpTokenEvents = topUpReceipt.logs.filter(log => log.address === tokenGaterAddress);
      expect(topUpTokenEvents).to.have.length(0);

      // Verify total deposit count
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0200000000000000");
    });
  });
});