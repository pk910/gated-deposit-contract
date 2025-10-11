// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./IDepositGater.sol";
import "./SimpleAccessControl.sol";

contract TokenDepositGater is IDepositGater, SimpleAccessControl, ERC20 {
  bytes32 public constant DEPOSIT_CONTRACT_ROLE = 0xc0de00000000000000000000ffffffffffffffffffffffffffffffffffffffff;

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
    require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Only admin can mint");
    _mint(to, amount);
  }

}
