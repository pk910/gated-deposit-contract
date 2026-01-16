const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GatedDepositContract", function () {
  let gatedDepositContract;
  let tokenDepositGater;
  let owner;
  let depositor;
  let other;

  // Valid deposit data from the user
  const validDepositData = {
    pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    withdrawal_credentials: "0x010000000000000000000000deaddeaddeaddeaddeaddeaddeaddeaddeaddead",
    signature: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    deposit_data_root: "0x44d02d2231ac4360374404cec35d277baad3a135f6228c3a0b64924832325576"
  };

  const depositAmount = ethers.parseEther("32");

  beforeEach(async function () {
    [owner, depositor, other] = await ethers.getSigners();

    // Deploy TokenDepositGater
    const TokenDepositGater = await ethers.getContractFactory("TokenDepositGater");
    tokenDepositGater = await TokenDepositGater.deploy();
    await tokenDepositGater.waitForDeployment();

    // Deploy GatedDepositContract with gater
    const GatedDepositContract = await ethers.getContractFactory("DepositContract");
    gatedDepositContract = await GatedDepositContract.deploy(await tokenDepositGater.getAddress());
    await gatedDepositContract.waitForDeployment();

    // Grant DEPOSIT_CONTRACT_ROLE to GatedDepositContract
    const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
    await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, await gatedDepositContract.getAddress());

    // Configure noToken for topups (0xffff) so they don't require tokens
    const TOPUP_DEPOSIT_TYPE = 0xffff;
    await tokenDepositGater.setDepositGateConfig(TOPUP_DEPOSIT_TYPE, false, true);
  });

  describe("Deployment", function () {
    it.skip("Should set the correct gater address", async function () {
      // depositGater is not public in the contract
      expect(await gatedDepositContract.depositGater()).to.equal(await tokenDepositGater.getAddress());
    });

    it("Should initialize with zero deposit count", async function () {
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0000000000000000");
    });
  });

  describe("Deposits with tokens", function () {
    it("Should allow deposit when user has tokens", async function () {
      // Mint tokens for depositor
      await tokenDepositGater.mint(depositor.address, 1);
      expect(await tokenDepositGater.balanceOf(depositor.address)).to.equal(1);

      // Make deposit and capture transaction receipt
      const tx = await gatedDepositContract.connect(depositor).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();

      // Check that ONLY DepositEvent was emitted by the deposit contract
      const contractAddress = await gatedDepositContract.getAddress();
      const depositContractEvents = receipt.logs.filter(log => log.address === contractAddress);
      expect(depositContractEvents).to.have.length(1);

      // Verify DepositEvent was emitted with correct parameters
      await expect(tx).to.emit(gatedDepositContract, "DepositEvent")
        .withArgs(
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          "0x0040597307000000", // 32 ETH in little-endian gwei format
          validDepositData.signature,
          "0x0000000000000000"  // deposit index 0
        );

      // Check token was burned
      expect(await tokenDepositGater.balanceOf(depositor.address)).to.equal(0);

      // Check deposit count increased
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0100000000000000");
    });

    it("Should fail deposit when user has no tokens", async function () {
      await expect(
        gatedDepositContract.connect(depositor).deposit(
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          validDepositData.signature,
          validDepositData.deposit_data_root,
          { value: depositAmount }
        )
      ).to.be.revertedWith("Not enough tokens");
    });

    it("Should fail deposit with insufficient ETH", async function () {
      // Mint token for depositor
      await tokenDepositGater.mint(depositor.address, 1);

      await expect(
        gatedDepositContract.connect(depositor).deposit(
          validDepositData.pubkey,
          validDepositData.withdrawal_credentials,
          validDepositData.signature,
          validDepositData.deposit_data_root,
          { value: ethers.parseEther("0.5") } // Less than 1 ETH minimum
        )
      ).to.be.revertedWith("DepositContract: deposit value too low");
    });
  });

  describe("Top-up deposits", function () {
    it("Should not burn tokens for top-up deposits", async function () {
      // Create top-up deposit data (all zeros for signature and withdrawal_credentials)
      const topUpData = {
        pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        withdrawal_credentials: "0x" + "00".repeat(32),
        signature: "0x" + "00".repeat(96),
        deposit_data_root: "0x4c96bb32f9feff56062a34087a2bb5243023f9aeb87ee199c3276ecc148fdf69"
      };

      // Depositor should have no tokens
      expect(await tokenDepositGater.balanceOf(depositor.address)).to.equal(0);

      // Top-up deposit should work without tokens
      const tx = await gatedDepositContract.connect(depositor).deposit(
        topUpData.pubkey,
        topUpData.withdrawal_credentials,
        topUpData.signature,
        topUpData.deposit_data_root,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();

      // Check that ONLY DepositEvent was emitted by the deposit contract
      const contractAddress = await gatedDepositContract.getAddress();
      const depositContractEvents = receipt.logs.filter(log => log.address === contractAddress);
      expect(depositContractEvents).to.have.length(1);

      // Verify DepositEvent was emitted
      await expect(tx).to.emit(gatedDepositContract, "DepositEvent");

      // Verify deposit count increased
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0100000000000000");
    });
  });

  describe("Multiple deposits", function () {
    it("Should handle multiple deposits correctly", async function () {
      // Mint multiple tokens
      await tokenDepositGater.mint(depositor.address, 3);

      // Make 3 deposits
      for (let i = 0; i < 3; i++) {
        await expect(
          gatedDepositContract.connect(depositor).deposit(
            validDepositData.pubkey,
            validDepositData.withdrawal_credentials,
            validDepositData.signature,
            validDepositData.deposit_data_root,
            { value: depositAmount }
          )
        ).to.emit(gatedDepositContract, "DepositEvent");
      }

      // All tokens should be burned
      expect(await tokenDepositGater.balanceOf(depositor.address)).to.equal(0);

      // Deposit count should be 3
      expect(await gatedDepositContract.get_deposit_count()).to.equal("0x0300000000000000");
    });
  });

  describe("Event Emission", function () {
    it("Should emit ONLY DepositEvent on successful deposit", async function () {
      // Mint tokens for depositor
      await tokenDepositGater.mint(depositor.address, 1);

      // Make deposit and capture all events
      const tx = await gatedDepositContract.connect(depositor).deposit(
        validDepositData.pubkey,
        validDepositData.withdrawal_credentials,
        validDepositData.signature,
        validDepositData.deposit_data_root,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();

      // Filter events by contract address
      const depositContractAddress = await gatedDepositContract.getAddress();
      const tokenGaterAddress = await tokenDepositGater.getAddress();
      const depositContractEvents = receipt.logs.filter(log => log.address === depositContractAddress);
      const tokenGaterEvents = receipt.logs.filter(log => log.address === tokenGaterAddress);

      // Deposit contract should emit exactly 1 event: DepositEvent
      expect(depositContractEvents).to.have.length(1);
      
      // Token gater should emit Transfer event (for burn)
      expect(tokenGaterEvents).to.have.length(1);

      // Total events should be exactly 2 (1 from each contract)
      expect(receipt.logs).to.have.length(2);
    });

    it("Should emit ONLY DepositEvent on top-up deposit (no token events)", async function () {
      const topUpData = {
        pubkey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        withdrawal_credentials: "0x" + "00".repeat(32),
        signature: "0x" + "00".repeat(96),
        deposit_data_root: "0x4c96bb32f9feff56062a34087a2bb5243023f9aeb87ee199c3276ecc148fdf69"
      };

      // Make top-up deposit (no tokens required)
      const tx = await gatedDepositContract.connect(depositor).deposit(
        topUpData.pubkey,
        topUpData.withdrawal_credentials,
        topUpData.signature,
        topUpData.deposit_data_root,
        { value: depositAmount }
      );
      
      const receipt = await tx.wait();

      // Should emit exactly 1 event: DepositEvent from deposit contract only
      expect(receipt.logs).to.have.length(1);
      const contractAddress = await gatedDepositContract.getAddress();
      expect(receipt.logs[0].address).to.equal(contractAddress);
    });
  });

  describe("EIP-165 Interface Support", function () {
    it("Should support EIP-165 interface", async function () {
      expect(await gatedDepositContract.supportsInterface("0x01ffc9a7")).to.equal(true);
    });

    it("Should support IDepositContract interface", async function () {
      // IDepositContract interface ID (deposit + get_deposit_root + get_deposit_count)
      expect(await gatedDepositContract.supportsInterface("0x85640907")).to.equal(true);
    });
  });
});