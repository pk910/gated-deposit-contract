const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy TokenDepositGater first
  console.log("\nDeploying TokenDepositGater...");
  const TokenDepositGater = await hre.ethers.getContractFactory("TokenDepositGater");
  const tokenDepositGater = await TokenDepositGater.deploy();
  await tokenDepositGater.waitForDeployment();
  const gaterAddress = await tokenDepositGater.getAddress();
  console.log("TokenDepositGater deployed to:", gaterAddress);

  // Deploy GatedDepositContract with the gater address
  console.log("\nDeploying GatedDepositContract...");
  const GatedDepositContract = await hre.ethers.getContractFactory("DepositContract");
  const gatedDepositContract = await GatedDepositContract.deploy(gaterAddress);
  await gatedDepositContract.waitForDeployment();
  const depositAddress = await gatedDepositContract.getAddress();
  console.log("GatedDepositContract deployed to:", depositAddress);

  // Grant DEPOSIT_CONTRACT_ROLE to the GatedDepositContract
  console.log("\nGranting DEPOSIT_CONTRACT_ROLE to GatedDepositContract...");
  const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
  const tx = await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, depositAddress);
  await tx.wait();
  console.log("Role granted successfully!");

  console.log("\nDeployment complete!");
  console.log("TokenDepositGater:", gaterAddress);
  console.log("GatedDepositContract:", depositAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });