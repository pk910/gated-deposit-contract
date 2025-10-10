const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying TokenDepositGater with the account:", deployer.address);

  // Deploy TokenDepositGater
  console.log("\nDeploying TokenDepositGater...");
  const TokenDepositGater = await hre.ethers.getContractFactory("TokenDepositGater");
  const tokenDepositGater = await TokenDepositGater.deploy();
  await tokenDepositGater.waitForDeployment();
  const gaterAddress = await tokenDepositGater.getAddress();
  console.log("TokenDepositGater deployed to:", gaterAddress);

  // Grant DEPOSIT_CONTRACT_ROLE to the existing deposit contract
  const existingDepositContract = process.env.EXISTING_DEPOSIT_CONTRACT;
  if (existingDepositContract) {
    console.log("\nGranting DEPOSIT_CONTRACT_ROLE to existing deposit contract...");
    const DEPOSIT_CONTRACT_ROLE = await tokenDepositGater.DEPOSIT_CONTRACT_ROLE();
    const tx = await tokenDepositGater.grantRole(DEPOSIT_CONTRACT_ROLE, existingDepositContract);
    await tx.wait();
    console.log("Role granted successfully!");

    console.log("\nDeployment complete!");
    console.log("TokenDepositGater:", gaterAddress);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });