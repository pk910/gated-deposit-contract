// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./IDepositGater.sol";

contract TokenDepositGater is IDepositGater, AccessControl, ERC20 {
  bytes32 public constant DEPOSIT_CONTRACT_ROLE = keccak256("DEPOSIT_CONTRACT_ROLE");

  constructor() ERC20("Deposit Token", "Deposit") {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    _grantRole(DEPOSIT_CONTRACT_ROLE, address(0x00000000219ab540356cBB839Cbe05303d7705Fa));
  }

  function decimals() public view virtual override returns (uint8) {
    return 0;
  }

  function isAllZero(bytes calldata data, uint256 expectedLength) internal pure returns (bool) {
    if (data.length != expectedLength) return false;
    for (uint256 i = 0; i < data.length; ++i) {
      if (data[i] != 0) return false;
    }
    return true;
  }

  function check_deposit(address sender, bytes calldata pubkey, bytes calldata withdrawal_credentials, bytes calldata signature, uint256 amount) public returns (bool) {
    require(hasRole(DEPOSIT_CONTRACT_ROLE, _msgSender()), "Only deposit contract can call this function");

    // check if this is a top-up deposit (signature = 96 zero bytes)
    bool isTopUp = isAllZero(signature, 96) && isAllZero(withdrawal_credentials, 32);
    
    if (!isTopUp) {
      if (balanceOf(sender) == 0) {
        revert("Not enough tokens");
      }

      _burn(sender, 1);
    }

    return true;
  }

  function mint(address to, uint256 amount) public virtual {
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "must have admin role to mint");
    _mint(to, amount);
  }

}
