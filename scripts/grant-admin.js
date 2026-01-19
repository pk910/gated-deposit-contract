const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Granting admin role with the account:", signer.address);

  // Get parameters from command line or environment variables
  const gaterAddress = process.env.TOKEN_DEPOSIT_GATER_ADDRESS;
  const targetAddress = process.env.TARGET_ADDRESS;

  if (!gaterAddress) {
    throw new Error("Please set TOKEN_DEPOSIT_GATER_ADDRESS environment variable");
  }
  if (!targetAddress) {
    throw new Error("Please set TARGET_ADDRESS environment variable");
  }

  console.log("\nConfiguration:");
  console.log("TokenDepositGater address:", gaterAddress);
  console.log("Target address:", targetAddress);

  // Connect to the TokenDepositGater contract
  const TokenDepositGater = await hre.ethers.getContractFactory("TokenDepositGater");
  const tokenDepositGater = TokenDepositGater.attach(gaterAddress);

  // Check if signer has DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = await tokenDepositGater.DEFAULT_ADMIN_ROLE();
  const hasAdminRole = await tokenDepositGater.hasRole(DEFAULT_ADMIN_ROLE, signer.address);

  if (!hasAdminRole) {
    throw new Error(`Signer ${signer.address} does not have DEFAULT_ADMIN_ROLE`);
  }

  // Check if target already has admin role
  const targetHasRole = await tokenDepositGater.hasRole(DEFAULT_ADMIN_ROLE, targetAddress);
  if (targetHasRole) {
    console.log(`\nTarget ${targetAddress} already has DEFAULT_ADMIN_ROLE`);
    return;
  }

  // Grant admin role
  console.log("\nGranting DEFAULT_ADMIN_ROLE...");
  const tx = await tokenDepositGater.grantRole(DEFAULT_ADMIN_ROLE, targetAddress);
  const receipt = await tx.wait();
  console.log("Transaction hash:", receipt.hash);
  console.log("Admin role granted successfully!");

  // Verify role was granted
  const verified = await tokenDepositGater.hasRole(DEFAULT_ADMIN_ROLE, targetAddress);
  console.log(`\nVerification: Target has admin role: ${verified}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
