const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  console.log("Minting tokens with the account:", signer.address);

  // Get parameters from command line or environment variables
  const gaterAddress = process.env.TOKEN_DEPOSIT_GATER_ADDRESS;
  const recipientAddress = process.env.RECIPIENT_ADDRESS;
  const amount = process.env.MINT_AMOUNT || "1";

  if (!gaterAddress) {
    throw new Error("Please set TOKEN_DEPOSIT_GATER_ADDRESS environment variable");
  }
  if (!recipientAddress) {
    throw new Error("Please set RECIPIENT_ADDRESS environment variable");
  }

  console.log("\nConfiguration:");
  console.log("TokenDepositGater address:", gaterAddress);
  console.log("Recipient address:", recipientAddress);
  console.log("Amount to mint:", amount);

  // Connect to the TokenDepositGater contract
  const TokenDepositGater = await hre.ethers.getContractFactory("TokenDepositGater");
  const tokenDepositGater = TokenDepositGater.attach(gaterAddress);

  // Check if signer has DEFAULT_ADMIN_ROLE
  const DEFAULT_ADMIN_ROLE = await tokenDepositGater.DEFAULT_ADMIN_ROLE();
  const hasAdminRole = await tokenDepositGater.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
  
  if (!hasAdminRole) {
    throw new Error(`Signer ${signer.address} does not have DEFAULT_ADMIN_ROLE`);
  }

  // Mint tokens
  console.log("\nMinting tokens...");
  const tx = await tokenDepositGater.mint(recipientAddress, amount);
  const receipt = await tx.wait();
  console.log("Transaction hash:", receipt.hash);
  console.log("Tokens minted successfully!");

  // Check balance
  const balance = await tokenDepositGater.balanceOf(recipientAddress);
  console.log(`\nRecipient balance: ${balance} deposit tokens`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });